// Package host puts the desktop's backend together: the shared ollupi server
// with the app's browser as one more tool, the skills every new profile
// starts with, and the desktop's first profile and scratch folder. A
// standalone `ollupi serve` builds the same server with different options;
// what runs on the other side of the gateway is the same either way.
package host

import (
	"context"

	"github.com/0xfakeSpike/ollupi-desktop/sidecar/internal/browser"
	"github.com/0xfakeSpike/ollupi-desktop/sidecar/skills"
	"github.com/0xfakeSpike/ollupi/pkg/sandbox"
	"github.com/0xfakeSpike/ollupi/server"
	"github.com/0xfakeSpike/ollupi/tool/kit"
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
	// AllowedHosts are Host header names beyond localhost, for a backend
	// reached through a proxy that keeps its public name.
	AllowedHosts []string
	// Sandboxes are the providers an environment can be of besides this
	// machine, by id (a cloud's); empty offers this machine alone.
	Sandboxes map[string]sandbox.Provider
	// Browser is where the app's built-in browser answers; nil outside the
	// app, which has none.
	Browser *browser.Endpoint
}

// Host is the built server: its store, app, gateway and profiles.
type Host = server.Server

// New builds the desktop's backend within ctx, which the users' MCP servers
// run in.
func New(ctx context.Context, opts Options) (*Host, error) {
	var tools []kit.Provider
	if opts.Browser != nil {
		tools = append(tools, browser.New(*opts.Browser))
	}
	s, err := server.New(ctx, server.Config{
		Home:           opts.Home,
		DataHome:       opts.DataHome,
		Name:           Name,
		Token:          opts.Token,
		OperatorToken:  opts.OperatorToken,
		AllowedOrigins: opts.AllowedOrigins,
		AllowedHosts:   opts.AllowedHosts,
		Tools:          tools,
		Sandboxes:      opts.Sandboxes,
		// The app connects as the first profile until the operator makes
		// others; it is unnamed, and starts with the skills the desktop
		// ships.
		First:         server.Profile{ID: FirstProfile},
		StarterSkills: skills.Starter,
		Scratch:       Scratch,
	})
	if err != nil {
		return nil, err
	}
	return s, nil
}

// Name is what the backend calls itself, to the agent and to MCP servers.
const Name = "ollupi"

// FirstProfile is the profile a home starts with.
const FirstProfile = "default"

// Scratch is the folder in the home where the first profile's commands run
// outside a workspace.
const Scratch = "scratch"
