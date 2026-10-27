// Package host assembles one ollupi backend from a Config, following the
// assembly ollupi's README describes: the database, one model client per
// model, the tool providers (cron, shell, MCP servers), memory, the agent and
// the gateway. It
// owns their lifetimes: New builds everything without starting anything,
// Start starts the agent and its sibling goroutines, Serve serves the gateway
// until the context ends and then waits for every component to stop.
package host

import (
	"context"
	"fmt"
	"log"
	"net"
	"os"
	"path/filepath"
	"slices"
	"sync"
	"time"

	"github.com/0xfakeSpike/ollupi-desktop/sidecar/internal/config"
	"github.com/0xfakeSpike/ollupi/agent"
	"github.com/0xfakeSpike/ollupi/agent/memory"
	"github.com/0xfakeSpike/ollupi/gateway"
	"github.com/0xfakeSpike/ollupi/pkg/llm"
	"github.com/0xfakeSpike/ollupi/repo"
	"github.com/0xfakeSpike/ollupi/tools"
	"github.com/0xfakeSpike/ollupi/tools/cron"
	"github.com/0xfakeSpike/ollupi/tools/mcp"
	"github.com/0xfakeSpike/ollupi/tools/shell"
)

type Options struct {
	// Home is where config, scratch and skills paths resolve.
	Home string
	// DataHome holds the database (<DataHome>/data); empty means Home.
	DataHome string
	Token    string
	Config   config.Config
	// AllowedOrigins are WebSocket origin patterns beyond loopback, e.g. the
	// packaged renderer's app://ollupi.
	AllowedOrigins []string
	// Version is the backend's, which MCP servers see as the client's.
	Version string
}

type Host struct {
	agent    *agent.Agent
	gateway  *gateway.Server
	memory   *memory.Manager
	jobs     *cron.Jobs
	closers  []func() error
	siblings sync.WaitGroup
}

func New(opts Options) (_ *Host, err error) {
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
	db, err := repo.Open(dataHome)
	if err != nil {
		return nil, err
	}
	h.closers = append(h.closers, db.Close)

	models, connections, err := modelClients(cfg.Models)
	if err != nil {
		return nil, err
	}

	// The cron component is both a tool provider (the model manages tasks)
	// and the timer that sends due tasks; the gateway exposes it as cron/*
	// and reports each change to a task as cron/changed.
	var cronChanged func(id, threadID string)
	h.jobs = cron.New(db, time.Local, func(id, threadID string) { cronChanged(id, threadID) })
	providers := []tools.Provider{h.jobs}
	if cfg.Shell.Enabled {
		runner, err := shellRunner(opts.Home, cfg)
		if err != nil {
			return nil, err
		}
		h.closers = append(h.closers, runner.Close)
		providers = append(providers, runner)
	}

	servers, err := mcpServers(cfg.MCP)
	if err != nil {
		return nil, err
	}
	// Each server connects and lists its tools now; one that cannot is
	// skipped, and the gateway reports why (mcpServer/list).
	connected := mcp.Connect(context.Background(), mcp.Client{Name: "ollupi-desktop", Version: opts.Version}, servers)
	h.closers = append(h.closers, connected.Close)
	providers = append(providers, connected.Providers()...)

	if h.memory, err = memoryManager(db, models, connections, cfg.Memory); err != nil {
		return nil, err
	}

	var deliver func(agent.Event)
	h.agent = agent.New(agent.Config{
		Name:        cfg.Name,
		Prompt:      cfg.Prompt,
		Models:      models,
		Tools:       cfg.Tools,
		Settings:    cfg.Permissions.Settings(),
		Slots:       cfg.Slots,
		Connections: connections,
		Providers:   providers,
		// Rules naming a skipped server's tools stay valid; they match
		// nothing until it connects.
		Unavailable: connected.Unavailable(),
		SkillsDir:   cfg.SkillsDir,
		Memory:      h.memory,
		DB:          db,
		OnEvent:     func(e agent.Event) { deliver(e) },
	})
	h.gateway, err = gateway.NewServer(h.agent, gateway.Options{
		Token:          opts.Token,
		AllowedOrigins: opts.AllowedOrigins,
		Memory:         h.memory,
		Jobs:           h.jobs,
		MCP:            connected,
	})
	if err != nil {
		return nil, err
	}
	// Set before Start, so the agent and the cron timer never emit into a
	// nil gateway.
	deliver = h.gateway.Deliver
	cronChanged = h.gateway.CronChanged
	return h, nil
}

// Start starts the agent, then memory extraction and the cron timer beside
// it. Cancelling ctx stops them all.
func (h *Host) Start(ctx context.Context) error {
	if err := h.agent.Start(ctx); err != nil {
		h.close()
		return err
	}
	h.siblings.Go(func() { h.memory.Run(ctx) })
	h.siblings.Go(func() {
		// A due task goes in through the same entry as a user's message.
		h.jobs.Run(ctx, func(threadID, text, jobID string) error {
			_, err := h.agent.StartTurn(threadID, agent.Input{Text: text, CronJobID: jobID})
			return err
		})
	})
	return nil
}

// Serve serves the gateway on ln until the context given to Start ends, then
// waits for the siblings and the agent before releasing the database.
func (h *Host) Serve(ctx context.Context, ln net.Listener) error {
	defer h.close()
	err := h.gateway.Serve(ctx, ln)
	h.siblings.Wait()
	h.agent.Wait()
	return err
}

// Check reports whether cfg would start: it assembles the backend as New
// does, MCP servers included, and starts the agent, which is where ollupi
// validates the rest (permission rules against the tool registry, each
// model's context budget), against a throwaway database, then stops it.
// Nothing is served and the real database is not opened.
func Check(home string, cfg config.Config) error {
	data, err := os.MkdirTemp("", "ollupid-check-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(data)
	h, err := New(Options{Home: home, DataHome: data, Token: "check", Config: cfg, Version: "check"})
	if err != nil {
		return err
	}
	defer h.close()
	ctx, cancel := context.WithCancel(context.Background())
	if err := h.agent.Start(ctx); err != nil {
		cancel()
		return err
	}
	cancel()
	h.agent.Wait()
	return nil
}

func (h *Host) close() {
	for i := len(h.closers) - 1; i >= 0; i-- {
		if err := h.closers[i](); err != nil {
			log.Printf("host: close: %v", err)
		}
	}
	h.closers = nil
}

// modelClients gives each model its own ollupi connection and client, so
// calls caps that model alone (ollupi: each model connection has its own
// cap). The models keep the file's order; the first is the default.
func modelClients(providers []config.Provider) ([]llm.Model, map[string]*llm.OpenAI, error) {
	var models []llm.Model
	clients := map[string]*llm.OpenAI{}
	for _, p := range providers {
		key, err := p.Key()
		if err != nil {
			return nil, nil, fmt.Errorf("provider %s: %w", p.Provider, err)
		}
		for _, m := range p.Names {
			id := config.ID(p.Provider, m.Name)
			var limits map[string]llm.Limits
			if m.Limits != nil {
				limits = map[string]llm.Limits{m.Name: *m.Limits}
			}
			clients[id] = llm.NewOpenAI(p.BaseURL, key, m.Calls, limits)
			models = append(models, llm.Model{Name: m.Name, Connection: id, Thinking: m.Thinking})
		}
	}
	return models, clients, nil
}

// mcpServers resolves the ${NAME} references in env and header values. A
// reference to a variable that is not set refuses the config, as an unset
// api_key_env does: the server would otherwise run without its secret.
func mcpServers(list []config.MCPServer) ([]mcp.Server, error) {
	out := make([]mcp.Server, 0, len(list))
	for _, s := range list {
		expand := func(m map[string]string) (map[string]string, error) {
			if m == nil {
				return nil, nil
			}
			res := make(map[string]string, len(m))
			for k, v := range m {
				x, err := config.Expand(v)
				if err != nil {
					return nil, fmt.Errorf("mcp server %s: %s: %w", s.Name, k, err)
				}
				res[k] = x
			}
			return res, nil
		}
		env, err := expand(s.Env)
		if err != nil {
			return nil, err
		}
		headers, err := expand(s.Headers)
		if err != nil {
			return nil, err
		}
		out = append(out, mcp.Server{Name: s.Name, Command: s.Command, Args: s.Args, Env: env, URL: s.URL, Headers: headers})
	}
	return out, nil
}

func shellRunner(home string, cfg config.Config) (*shell.Runner, error) {
	sc := cfg.Shell.Config
	if len(sc.WorkspaceDirs) == 0 {
		// Outside a workspace commands run in a scratch folder, never in home.
		scratch := filepath.Join(home, "scratch")
		if err := os.MkdirAll(scratch, 0o755); err != nil {
			return nil, err
		}
		sc.WorkspaceDirs = []string{scratch}
	}
	return shell.NewRunner(shell.Options{
		Config: sc,
		Agent:  shell.AgentFiles{Home: home, SkillsDir: cfg.SkillsDir},
		// Commands must not read the API keys in the config file.
		DenyRead:  []string{filepath.Join(home, config.FileName)},
		EnvMarker: "OLLUPI_SANDBOX",
	})
}

// memoryManager extracts with the model memory.model names, through that
// model's client, so extraction shares its calls with the model's turns.
func memoryManager(db *repo.DB, models []llm.Model, clients map[string]*llm.OpenAI, m config.Memory) (*memory.Manager, error) {
	opts := memory.Options{Use: m.Use, Generate: m.Generate}
	var client *llm.OpenAI
	if m.Model != "" {
		i := slices.IndexFunc(models, func(x llm.Model) bool { return x.Connection == m.Model })
		opts.Model, client = models[i], clients[m.Model]
	}
	mgr, err := memory.New(db, client, opts)
	if err != nil {
		return nil, fmt.Errorf("memory: %w", err)
	}
	return mgr, nil
}
