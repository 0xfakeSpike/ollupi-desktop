// Package host puts one ollupi backend together from a Config: ollupi's own
// host (the store, the models, the flows that run turns, learn memory and
// send scheduled tasks, the app and its gateway, web_fetch among its tools)
// with the tools the desktop adds to it (the workspace's commands and files,
// the app's browser). New builds everything without starting anything; Serve
// runs it all until the context ends.
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
	"github.com/0xfakeSpike/ollupi-desktop/sidecar/skills"
	"github.com/0xfakeSpike/ollupi/account"
	"github.com/0xfakeSpike/ollupi/app"
	"github.com/0xfakeSpike/ollupi/auth"
	"github.com/0xfakeSpike/ollupi/gateway"
	ollupi "github.com/0xfakeSpike/ollupi/host"
	"github.com/0xfakeSpike/ollupi/pkg/sandbox"
	"github.com/0xfakeSpike/ollupi/store"
	"github.com/0xfakeSpike/ollupi/tool"
	"github.com/0xfakeSpike/ollupi/tool/builtin/workspace"
	"github.com/0xfakeSpike/ollupi/tool/kit"
	"golang.org/x/sync/errgroup"
)

type Options struct {
	// Home is where config paths resolve; commands outside a
	// workspace run in its scratch folder (ollupi makes it).
	Home string
	// DataHome holds the store and the attachments; empty means Home.
	DataHome string
	// Token is the gateway's secret: a connection's token is it, a dot and
	// the profile the connection acts as.
	Token string
	// OperatorToken is the operator's secret, given the same way: a
	// connection with it acts as the profile and also as the deployment's
	// operator, which may set the catalog of models. The app connects with
	// it; a remote one hands out whichever it means to.
	OperatorToken string
	Config        config.Config
	// AllowedOrigins are WebSocket origin patterns beyond loopback, e.g. the
	// packaged renderer's app://ollupi.
	AllowedOrigins []string
	// Browser is where the app's built-in browser answers; nil outside the
	// app, which has none.
	Browser *browser.Endpoint
}

type Host struct {
	ollupi  *ollupi.Host
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

	// Local profiles share the machine today, but still reach it through one
	// Box per user. A cloud host replaces the same factory with cloud boxes.
	boxes := newUserBoxes(opts.Home)
	h.closers = append(h.closers, boxes.Close)

	// The store is the host's, made below; a call reaches this only once
	// it is.
	var st store.Store
	// Every connection names its profile: the token is a secret the backend
	// was started with and the profile, joined by a dot. The profile must be
	// a user of the store; the operator makes users (user/create), and the
	// first one is made at start. There is no anonymous connection.
	var users *app.App
	authenticate := func(ctx context.Context, token string) (auth.Identity, error) {
		return profileOf(ctx, token, opts.Token, opts.OperatorToken, st, users)
	}
	// Commands and file edits, in the sandbox as ollupi sets it up.
	ws, err := workspace.New(workspace.Options{
		Agent: workspace.AgentFiles{Home: opts.Home},
		// Commands must not read the secrets in the config file, nor the
		// store, which holds every profile's API keys and MCP servers.
		DenyRead:  []string{filepath.Join(opts.Home, config.FileName), filepath.Join(dataHome, "data")},
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
	// web_fetch is ollupi's own, made from the Boxes below.
	tools := []kit.Provider{ws}
	if opts.Browser != nil {
		tools = append(tools, browser.New(*opts.Browser))
	}

	h.ollupi, err = ollupi.New(ctx, ollupi.Config{
		Home:      dataHome,
		Name:      cfg.Name,
		Prompt:    cfg.Prompt,
		Tools:     tools,
		Allowlist: cfg.Tools,
		Boxes:     boxes.box,
		Slots:     cfg.Slots,
		// The app's Super Agent is ollupi's hub: the user's one hub
		// workspace hands work out to the project workspaces.
		Hub:     true,
		Gateway: &gateway.Options{
			Authenticate: authenticate,
			// A user the operator makes starts with the skills the desktop
			// ships.
			Welcome:        func(ctx context.Context, user string) error { return giveStarterSkills(ctx, users, user) },
			AllowedOrigins: opts.AllowedOrigins,
		},
	})
	if err != nil {
		return nil, err
	}
	h.closers = append(h.closers, h.ollupi.Close)
	st, users = h.ollupi.Store, h.ollupi.App
	if err := firstProfile(ctx, st, users); err != nil {
		return nil, err
	}
	return h, nil
}

// Profiles are the users of the store, by id.
func (h *Host) Profiles(ctx context.Context) []string { return Profiles(ctx, h.ollupi.Store) }

// Serve serves the gateway on ln and runs ollupi's flows until ctx ends or
// one of them fails, then releases the store.
func (h *Host) Serve(ctx context.Context, ln net.Listener) error {
	defer h.close()
	g, ctx := errgroup.WithContext(ctx)
	g.Go(func() error { return h.ollupi.Run(ctx) })
	g.Go(func() error { return h.ollupi.Gateway.Serve(ctx, ln) })
	// Each profile's MCP servers connect and list their tools now rather
	// than in the first turn; one that cannot is skipped, and mcpServer/list
	// says why.
	for _, user := range Profiles(ctx, h.ollupi.Store) {
		g.Go(func() error {
			h.ollupi.Users.Tools(ctx, user)
			return nil
		})
	}
	return g.Wait()
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

// profileOf names the profile a connection's token acts as: a secret the
// backend was started with, a dot, the profile, which must be a user of the
// store. The gateway's secret makes it a user; the operator's makes it the
// deployment's operator as well.
func profileOf(ctx context.Context, token, secret, operator string, st store.Store, users *app.App) (auth.Identity, error) {
	given, profile, ok := strings.Cut(token, ".")
	if !ok || !config.ProfileID.MatchString(profile) || st == nil || users == nil {
		return auth.Identity{}, auth.ErrUnknownToken
	}
	var id auth.Identity
	switch {
	case operator != "" && subtle.ConstantTimeCompare([]byte(given), []byte(operator)) == 1:
		id = auth.Identity{User: profile, Operator: true}
	case subtle.ConstantTimeCompare([]byte(given), []byte(secret)) == 1:
		id = auth.Identity{User: profile}
	default:
		return auth.Identity{}, auth.ErrUnknownToken
	}
	if !slices.Contains(Profiles(ctx, st), profile) {
		return auth.Identity{}, auth.ErrUnknownToken
	}
	return id, nil
}

// FirstProfile is the profile a home starts with.
const FirstProfile = "default"

// firstProfile makes a home without users its first, unnamed, with the
// skills the desktop ships: the app connects as it until the operator makes
// others.
func firstProfile(ctx context.Context, st store.Store, users *app.App) error {
	if len(Profiles(ctx, st)) > 0 {
		return nil
	}
	if err := users.EnsureUser(ctx, FirstProfile); err != nil {
		return err
	}
	return giveStarterSkills(ctx, users, FirstProfile)
}

// giveStarterSkills gives a new profile the skills the desktop ships.
func giveStarterSkills(ctx context.Context, users *app.App, profile string) error {
	starter, err := skills.Starter()
	if err != nil {
		return err
	}
	for _, p := range starter {
		if _, err := users.SetSkill(ctx, profile, p); err != nil {
			return err
		}
	}
	return nil
}

// Profiles lists the users the store holds.
func Profiles(ctx context.Context, st store.Store) []string {
	var users []string
	_ = st.Read(ctx, func(r store.Reader) error {
		var err error
		users, err = r.Users()
		return err
	})
	return users
}
