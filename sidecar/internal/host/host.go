// Package host puts one ollupi backend together: ollupi's own
// host (the store, the models, the flows that run turns, learn memory and
// send scheduled tasks, the app and its gateway, its tools) with this
// machine as the sandbox conversations run in, and the app's browser. New
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
	"github.com/0xfakeSpike/ollupi-desktop/sidecar/skills"
	"github.com/0xfakeSpike/ollupi/account"
	"github.com/0xfakeSpike/ollupi/app"
	"github.com/0xfakeSpike/ollupi/auth"
	"github.com/0xfakeSpike/ollupi/gateway"
	ollupi "github.com/0xfakeSpike/ollupi/host"
	"github.com/0xfakeSpike/ollupi/pkg/sandbox"
	"github.com/0xfakeSpike/ollupi/store"
	"github.com/0xfakeSpike/ollupi/tool/kit"
	"golang.org/x/sync/errgroup"
)

type Options struct {
	// Home is the backend's folder: each environment of this machine is a
	// folder of users/<profile>/ in it, where commands outside a workspace
	// run.
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
	var tools []kit.Provider
	if opts.Browser != nil {
		tools = append(tools, browser.New(*opts.Browser))
	}

	h.ollupi, err = ollupi.New(ctx, ollupi.Config{
		Home: dataHome,
		// ollupi's own system prompt, every tool, and its slots.
		Name:  Name,
		Tools: tools,
		// This machine is the one sandbox offered: every environment a
		// folder of it, commands in it limited as ollupi limits them.
		Sandboxes: map[string]sandbox.Provider{LocalSandbox: thisMachine(opts.Home, dataHome)},
		Sandbox:   LocalSandbox,
		// The app's Super Agent is ollupi's hub: the user's one hub
		// workspace hands work out to the project workspaces.
		Hub: true,
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

// LocalSandbox is what an environment of this machine names its provider.
const LocalSandbox = "local"

// FirstEnvironment is the environment a profile is made with: this machine.
func FirstEnvironment() account.Environment {
	return account.NewEnvironment(sandbox.LocalName, LocalSandbox, nil)
}

// thisMachine is this machine as a provider: its environments are folders
// under home, and commands in them run under Seatbelt. They may not read
// the store, which holds the models' API keys and every profile's MCP
// servers; one with full access gets the backend's environment but the
// OLLUPI_ variables, which hold its tokens.
func thisMachine(home, dataHome string) sandbox.Local {
	deny := []string{filepath.Join(dataHome, "data")}
	if home != dataHome {
		deny = append(deny, filepath.Join(home, "data"))
	}
	return sandbox.Local{Dir: filepath.Join(home, "users"), Config: sandbox.Config{
		DenyRead:  deny,
		EnvMarker: "OLLUPI_SANDBOX",
		HideEnv:   []string{"OLLUPI_"},
	}}
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

// Name is what the backend calls itself, to the agent and to MCP servers.
const Name = "ollupi"

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
