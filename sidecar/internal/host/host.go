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
	"sync"

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

	users, err := userModels(cfg)
	if err != nil {
		return nil, err
	}

	// Local profiles share the machine today, but still reach it through one
	// Box per user. A cloud host replaces the same factory with cloud boxes.
	boxes := newUserBoxes(opts.Home)
	h.closers = append(h.closers, boxes.Close)

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
		Home:      dataHome,
		Name:      cfg.Name,
		Prompt:    cfg.Prompt,
		Users:     users,
		Tools:     tools,
		Allowlist: cfg.Tools,
		Boxes:     boxes.box,
		SkillsDir: cfg.SkillsDir,
		Slots:     cfg.Slots,
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
	// config.yaml declares the profiles this home serves. Create the missing
	// user rows here, before a token or the Feishu client names one.
	if err := ensureProfiles(ctx, st, h.ollupi.App, cfg); err != nil {
		return nil, err
	}
	if cfg.Feishu != nil {
		home := profiles(ctx, st)
		if !slices.Contains(home, cfg.Feishu.Profile) {
			return nil, fmt.Errorf("feishu.profile %q is not a profile of this home", cfg.Feishu.Profile)
		}
		for open, profile := range cfg.Feishu.Profiles {
			if !slices.Contains(home, profile) {
				return nil, fmt.Errorf("feishu.profiles: %s acts as %q, which is not a profile of this home", open, profile)
			}
		}
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

// Reload takes the profiles and credentials of cfg without a restart: every
// profile it declares exists, and each runs the models it selects now. Turns
// already calling a model finish on the client they started with. Nothing
// else in cfg is read; those settings take a restart.
func (h *Host) Reload(ctx context.Context, cfg config.Config) error {
	users, err := userModels(cfg)
	if err != nil {
		return err
	}
	if err := ensureProfiles(ctx, h.ollupi.Store, h.ollupi.App, cfg); err != nil {
		return err
	}
	return h.ollupi.SetUsers(users)
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

// modelClients gives each credential/model one shared client. Profiles that
// select the same model share both its provider account and concurrency limit.
func modelClients(credentials []config.Credential) (map[string]llm.Model, map[string]llm.Client, error) {
	models := map[string]llm.Model{}
	clients := map[string]llm.Client{}
	for _, c := range credentials {
		for _, m := range c.Models {
			id := config.ID(c.ID, m.Name)
			client, err := modelClient(c, m)
			if err != nil {
				return nil, nil, fmt.Errorf("credentials: %s: %w", id, err)
			}
			clients[id] = client
			models[id] = llm.Model{Name: m.Name, Connection: id, Thinking: m.Thinking, Images: m.Images}
		}
	}
	return models, clients, nil
}

func modelClient(c config.Credential, m config.Model) (llm.Client, error) {
	limits := map[string]llm.Limits{m.Name: m.Limits}
	switch c.Type {
	case config.APIOpenAI:
		return llm.NewOpenAI(c.BaseURL, c.APIKey, m.Calls, limits), nil
	case config.APIAnthropic:
		return llm.NewAnthropic(c.BaseURL, c.APIKey, m.Calls, limits), nil
	case config.APIGemini:
		return llm.NewGemini(c.BaseURL, c.APIKey, m.Calls, limits)
	}
	return nil, fmt.Errorf("unknown API type %q", c.Type)
}

type userBoxes struct {
	home  string
	env   []string
	mu    sync.Mutex
	boxes map[string]*sandbox.Sandbox
}

func newUserBoxes(home string) *userBoxes {
	var env []string
	for _, pair := range os.Environ() {
		name, _, _ := strings.Cut(pair, "=")
		if !strings.HasPrefix(name, "OLLUPI_") && sandbox.ValidateEnvNames([]string{name}) == nil {
			env = append(env, name)
		}
	}
	return &userBoxes{home: home, env: env, boxes: map[string]*sandbox.Sandbox{}}
}

// box is this machine as one profile sees it. Local profiles share access
// today, but the factory and lifetime are per user for a cloud Machine.
func (b *userBoxes) box(user string) (sandbox.Box, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if box := b.boxes[user]; box != nil {
		return box, nil
	}
	root := filepath.Join(b.home, "users", user)
	if err := os.MkdirAll(root, 0o755); err != nil {
		return nil, err
	}
	box, err := sandbox.New(sandbox.Config{Mode: string(sandbox.ModeFullAccess), Roots: []string{root}, EnvPassthrough: b.env})
	if err != nil {
		return nil, err
	}
	b.boxes[user] = box
	return box, nil
}

func (b *userBoxes) Close() error {
	b.mu.Lock()
	defer b.mu.Unlock()
	var errs []error
	for _, box := range b.boxes {
		errs = append(errs, box.Close())
	}
	b.boxes = nil
	return errors.Join(errs...)
}

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

// ensureProfiles makes every profile the config declares. The first profile
// always exists, even in a fresh home with an otherwise empty users list.
func ensureProfiles(ctx context.Context, st store.Store, a *app.App, cfg config.Config) error {
	known := profiles(ctx, st)
	for _, p := range cfg.Profiles {
		if slices.Contains(known, p.ID) {
			continue
		}
		if err := a.EnsureUser(ctx, p.ID); err != nil {
			return fmt.Errorf("profile %q: %w", p.ID, err)
		}
	}
	return nil
}

// userModels gives every configured profile the models it runs and the clients
// that call them. A profile's learning model comes from the same section.
func userModels(cfg config.Config) ([]ollupi.UserModels, error) {
	modelSet, clients, err := modelClients(cfg.Credentials)
	if err != nil {
		return nil, err
	}
	sets := make([]ollupi.UserModels, 0, len(cfg.Profiles))
	for _, p := range cfg.Profiles {
		models := make([]llm.Model, 0, len(p.Models))
		connections := map[string]llm.Client{}
		byID := map[string]llm.Model{}
		for _, id := range p.Models {
			m := modelSet[id]
			models = append(models, m)
			byID[id] = m
			connections[id] = clients[id]
		}
		var memory *llm.Model
		if m, ok := byID[p.Memory.Model]; ok {
			memory = &m
		}
		sets = append(sets, ollupi.UserModels{User: p.ID, Models: models, Connections: connections, Memory: memory})
	}
	return sets, nil
}
