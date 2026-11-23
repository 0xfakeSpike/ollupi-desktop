// Package host puts one ollupi backend together from a Config: ollupi's own
// host (the store, the models, the flows that run turns, learn memory and
// send scheduled tasks, the app and its gateway, web_fetch among its tools)
// with the tools the desktop adds to it (the workspace's commands and files,
// the app's browser) and the clients beside the gateway, such as the Feishu bot. New
// builds everything without starting anything; Serve runs it all until the
// context ends.
package host

import (
	"context"
	"crypto/subtle"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"github.com/0xfakeSpike/ollupi-desktop/sidecar/internal/browser"
	"github.com/0xfakeSpike/ollupi-desktop/sidecar/internal/config"
	"github.com/0xfakeSpike/ollupi-desktop/sidecar/internal/feishu"
	"github.com/0xfakeSpike/ollupi/account"
	"github.com/0xfakeSpike/ollupi/app"
	"github.com/0xfakeSpike/ollupi/auth"
	"github.com/0xfakeSpike/ollupi/gateway"
	ollupi "github.com/0xfakeSpike/ollupi/host"
	"github.com/0xfakeSpike/ollupi/pkg/llm"
	"github.com/0xfakeSpike/ollupi/pkg/sandbox"
	"github.com/0xfakeSpike/ollupi/store"
	"github.com/0xfakeSpike/ollupi/tool"
	"github.com/0xfakeSpike/ollupi/tool/builtin/workspace"
	"github.com/0xfakeSpike/ollupi/tool/kit"
	"golang.org/x/sync/errgroup"
)

type Options struct {
	// Home is where config and skills paths resolve; commands outside a
	// workspace run in its scratch folder (ollupi makes it).
	Home string
	// DataHome holds the store and the attachments; empty means Home.
	DataHome string
	Token    string
	Config   config.Config
	// AllowedOrigins are WebSocket origin patterns beyond loopback, e.g. the
	// packaged renderer's app://ollupi.
	AllowedOrigins []string
	// Browser is where the app's built-in browser answers; nil outside the
	// app, which has none.
	Browser *browser.Endpoint
}

// A Client is a front end of the agent beside the gateway, such as a chat
// bot. It runs until the backend stops.
type Client interface {
	Run(ctx context.Context)
}

type Host struct {
	ollupi  *ollupi.Host
	clients []Client
	closers []func() error
}

// New builds the backend within ctx, which the user's MCP servers run in.
func New(ctx context.Context, opts Options) (_ *Host, err error) {
	cfg := opts.Config
	h := &Host{}
	defer func() {
		if err != nil {
			h.close()
		}
	}()
	dataHome := opts.DataHome
	if dataHome == "" {
		dataHome = opts.Home
	}

	models, connections, err := modelClients(cfg.Models)
	if err != nil {
		return nil, err
	}
	var memory *llm.Model
	if cfg.Memory.Model != "" {
		for _, m := range models {
			if m.Connection == cfg.Memory.Model {
				memory = &m
			}
		}
	}

	// The one user's box: their workspaces' folders and attachments are this
	// machine's, and their MCP servers run here.
	box, err := userBox(opts.Home)
	if err != nil {
		return nil, err
	}
	h.closers = append(h.closers, box.Close)

	// The store is the host's, made below; a call reaches this only once
	// it is.
	var st store.Store
	// Every connection names its profile: the token is the secret the app
	// started the backend with and the profile, joined by a dot, and only a
	// profile that exists works. There is no anonymous connection and none is
	// made up for it.
	authenticate := func(ctx context.Context, token string) (string, error) {
		return profileOf(ctx, token, opts.Token, st)
	}
	// web_fetch is ollupi's own, made from the Boxes below.
	var tools []kit.Provider
	if cfg.Workspace.Enabled {
		ws, err := workspace.New(workspace.Options{
			Config: cfg.Workspace.Config,
			Agent:  workspace.AgentFiles{Home: opts.Home, SkillsDir: cfg.SkillsDir},
			// Commands must not read the API keys in the config file.
			DenyRead:  []string{filepath.Join(opts.Home, config.FileName)},
			EnvMarker: "OLLUPI_SANDBOX",
			// Commands run on this machine and nowhere else: a conversation
			// started in another environment is told so rather than having its
			// commands run here. A nil box leaves the call in this machine's.
			BoxIn: func(c tool.Caller) (sandbox.Box, error) {
				if c.Environment == "" {
					return nil, nil
				}
				var env account.Environment
				err := st.Read(context.Background(), func(r store.Reader) (err error) {
					env, err = r.Environment(c.User, c.Environment)
					return err
				})
				if err != nil {
					return nil, err
				}
				if env.Kind != account.Local {
					return nil, fmt.Errorf("%s is another machine, and this build has no way to reach it; start the conversation in %s", env.Name, account.LocalName)
				}
				return nil, nil
			},
		})
		if err != nil {
			return nil, err
		}
		h.closers = append(h.closers, ws.Close)
		tools = append(tools, ws)
	}
	if opts.Browser != nil {
		tools = append(tools, browser.New(*opts.Browser))
	}

	h.ollupi, err = ollupi.New(ctx, ollupi.Config{
		Home:        dataHome,
		Name:        cfg.Name,
		Prompt:      cfg.Prompt,
		Models:      models,
		Connections: connections,
		Memory:      memory,
		Tools:       tools,
		Allowlist:   cfg.Tools,
		Boxes:       func(string) (sandbox.Box, error) { return box, nil },
		SkillsDir:   cfg.SkillsDir,
		Slots:       cfg.Slots,
		// The app's Super Agent is ollupi's hub: the user's one hub
		// workspace hands work out to the project workspaces.
		Hub:     true,
		Gateway: &gateway.Options{Authenticate: authenticate, AllowedOrigins: opts.AllowedOrigins},
	})
	if err != nil {
		return nil, err
	}
	h.closers = append(h.closers, h.ollupi.Close)
	st = h.ollupi.Store
	// A home starts with the one profile its data is already under; later
	// ones are made by user/create. Nothing here decides it per connection.
	if err := ensureProfile(ctx, st, h.ollupi.App); err != nil {
		return nil, err
	}
	if cfg.Feishu != nil && !slices.Contains(profiles(ctx, st), cfg.Feishu.Profile) {
		return nil, fmt.Errorf("feishu.profile %q is not a profile of this home", cfg.Feishu.Profile)
	}

	if cfg.Feishu != nil {
		// Which topic holds which session is kept beside the store.
		bot, err := feishu.New(*cfg.Feishu, h.ollupi.App, h.ollupi.Store, filepath.Join(dataHome, "data", "feishu.json"))
		if err != nil {
			return nil, err
		}
		h.clients = append(h.clients, bot)
	}
	return h, nil
}

// Serve serves the gateway on ln and runs ollupi's flows and the clients
// until ctx ends or one of them fails, then releases the store.
func (h *Host) Serve(ctx context.Context, ln net.Listener) error {
	defer h.close()
	g, ctx := errgroup.WithContext(ctx)
	g.Go(func() error { return h.ollupi.Run(ctx) })
	g.Go(func() error { return h.ollupi.Gateway.Serve(ctx, ln) })
	// Each profile's MCP servers connect and list their tools now rather
	// than in the first turn; one that cannot is skipped, and mcpServer/list
	// says why.
	for _, user := range profiles(ctx, h.ollupi.Store) {
		g.Go(func() error {
			h.ollupi.Users.Tools(ctx, user)
			return nil
		})
	}
	for _, c := range h.clients {
		g.Go(func() error {
			c.Run(ctx)
			return nil
		})
	}
	return g.Wait()
}

// Check reports whether cfg would start: it builds the backend as New
// does, which is where ollupi checks the models, the skills folder and the
// workspace's sandbox, against a throwaway store. Nothing is served and the
// real store is not opened.
func Check(home string, cfg config.Config, browser *browser.Endpoint) error {
	data, err := os.MkdirTemp("", "ollupid-check-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(data)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	h, err := New(ctx, Options{Home: home, DataHome: data, Token: "check", Config: cfg, Browser: browser})
	if err != nil {
		return err
	}
	h.close()
	return nil
}

func (h *Host) close() {
	var errs []error
	for i := len(h.closers) - 1; i >= 0; i-- {
		errs = append(errs, h.closers[i]())
	}
	h.closers = nil
	if err := errors.Join(errs...); err != nil {
		fmt.Fprintln(os.Stderr, "host: not closed:", err)
	}
}

// modelClients gives each model its own ollupi connection and client, of
// the provider's API type, so calls caps that model alone (ollupi: each
// model connection has its own cap). The models keep the file's order; the
// first is the default.
func modelClients(providers []config.Provider) ([]llm.Model, map[string]llm.Client, error) {
	var models []llm.Model
	clients := map[string]llm.Client{}
	for _, p := range providers {
		for _, m := range p.Names {
			id := config.ID(p.Provider, m.Name)
			client, err := modelClient(p, m)
			if err != nil {
				return nil, nil, fmt.Errorf("models: %s: %w", id, err)
			}
			clients[id] = client
			models = append(models, llm.Model{Name: m.Name, Connection: id, Thinking: m.Thinking, Images: m.Images})
		}
	}
	return models, clients, nil
}

func modelClient(p config.Provider, m config.Model) (llm.Client, error) {
	limits := map[string]llm.Limits{m.Name: m.Limits}
	switch p.Type {
	case config.APIOpenAI:
		return llm.NewOpenAI(p.BaseURL, p.APIKey, m.Calls, limits), nil
	case config.APIAnthropic:
		return llm.NewAnthropic(p.BaseURL, p.APIKey, m.Calls, limits), nil
	case config.APIGemini:
		return llm.NewGemini(p.BaseURL, p.APIKey, m.Calls, limits)
	}
	return nil, fmt.Errorf("unknown API type %q", p.Type)
}

// userBox is the user's box: this machine, where their MCP servers run
// outside the workspace's sandbox with the environment the backend was
// given, as commands the user configured themselves. The app's own
// variables stay out, its tokens above all, and so do names the sandbox
// refuses, such as a shell's BASH_FUNC_x%%.
func userBox(home string) (*sandbox.Sandbox, error) {
	var env []string
	for _, pair := range os.Environ() {
		name, _, _ := strings.Cut(pair, "=")
		if !strings.HasPrefix(name, "OLLUPI_") && sandbox.ValidateEnvNames([]string{name}) == nil {
			env = append(env, name)
		}
	}
	return sandbox.New(sandbox.Config{Mode: string(sandbox.ModeFullAccess), Roots: []string{home}, EnvPassthrough: env})
}

// firstProfile is the profile a home is created with: the data of a fresh
// install belongs to someone from the first write, so nothing is anonymous.
const firstProfile = "default"

// profileOf names the profile a connection's token acts as: the secret the
// backend was started with, a dot, the profile. Only a profile the store
// holds works; nothing is created for an unknown one.
func profileOf(ctx context.Context, token, secret string, st store.Store) (string, error) {
	given, profile, ok := strings.Cut(token, ".")
	if !ok || profile == "" || st == nil || subtle.ConstantTimeCompare([]byte(given), []byte(secret)) != 1 {
		return "", auth.ErrUnknownToken
	}
	var known bool
	err := st.Read(ctx, func(r store.Reader) error {
		users, err := r.Users()
		known = slices.Contains(users, profile)
		return err
	})
	if err != nil || !known {
		return "", auth.ErrUnknownToken
	}
	return profile, nil
}

// profiles lists the users the store holds.
func profiles(ctx context.Context, st store.Store) []string {
	var users []string
	_ = st.Read(ctx, func(r store.Reader) error {
		var err error
		users, err = r.Users()
		return err
	})
	return users
}

// ensureProfile makes the first profile of a home that has none: the data a
// fresh install writes belongs to someone, and there is no anonymous one.
func ensureProfile(ctx context.Context, st store.Store, a *app.App) error {
	if len(profiles(ctx, st)) > 0 {
		return nil
	}
	if err := a.EnsureUser(ctx, firstProfile); err != nil {
		return fmt.Errorf("the first profile: %w", err)
	}
	return nil
}
