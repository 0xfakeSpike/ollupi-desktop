// Package host assembles one ollupi backend from a Config: the database, the
// model connections, the tool providers, memory, cron, the agent and the
// gateway. It owns their lifetimes; main only supplies a context and a
// listener: New, then Start, then Serve.
package host

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"os"
	"path/filepath"
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
	"github.com/0xfakeSpike/ollupi/tools/shell"
)

type Options struct {
	Home   string
	Token  string
	Config config.Config
	// AllowedOrigins lets the packaged renderer (served from app://ollupi)
	// open the gateway WebSocket alongside the default localhost origins.
	AllowedOrigins []string
}

type Host struct {
	agent   *agent.Agent
	gateway *gateway.Server
	memory  *memory.Manager
	jobs    *cron.Jobs
	closers []func() error

	siblings sync.WaitGroup
}

// New builds every component without starting any goroutine, so a config
// error surfaces before anything runs.
func New(opts Options) (_ *Host, err error) {
	cfg := opts.Config
	h := &Host{}
	defer func() {
		if err != nil {
			h.close()
		}
	}()

	db, err := repo.Open(opts.Home)
	if err != nil {
		return nil, err
	}
	h.closers = append(h.closers, db.Close)

	clients, err := endpointClients(cfg.Endpoints)
	if err != nil {
		return nil, err
	}
	models := make([]llm.Model, len(cfg.Models))
	conns := make(map[string]*llm.OpenAI, len(cfg.Models))
	for i, m := range cfg.Models {
		models[i] = m.LLM()
		conns[m.ID] = clients[m.Endpoint]
	}

	h.jobs = cron.New(db, time.Local)
	providers := []tools.Provider{h.jobs}
	if cfg.Shell.Enabled {
		runner, err := shellRunner(opts.Home, cfg)
		if err != nil {
			return nil, err
		}
		h.closers = append(h.closers, runner.Close)
		providers = append(providers, runner)
	}

	if h.memory, err = memoryManager(db, clients, cfg.Memory); err != nil {
		return nil, err
	}

	var deliver func(agent.Event)
	h.agent = agent.New(agent.Config{
		Name:        cfg.Name,
		Prompt:      cfg.Prompt,
		Models:      models,
		Tools:       cfg.Tools,
		Settings:    cfg.Settings,
		Connections: conns,
		Providers:   providers,
		SkillsDir:   cfg.SkillsDir,
		Memory:      h.memory,
		DB:          db,
		OnEvent:     func(e agent.Event) { deliver(e) },
	})
	h.gateway, err = gateway.NewServer(h.agent, gateway.Options{
		Token:          opts.Token,
		AllowedOrigins: opts.AllowedOrigins,
		Memory:         h.memory,
	})
	if err != nil {
		return nil, err
	}
	deliver = h.gateway.Deliver
	return h, nil
}

// Start starts the agent and its sibling goroutines (memory extraction and
// cron). Cancelling ctx stops them; Serve waits for that.
func (h *Host) Start(ctx context.Context) error {
	if err := h.agent.Start(ctx); err != nil {
		h.close()
		return err
	}
	h.siblings.Go(func() { h.memory.Run(ctx) })
	h.siblings.Go(func() {
		h.jobs.Run(ctx, func(threadID, text, jobID string) error {
			_, err := h.agent.StartTurn(threadID, agent.Input{Text: text, CronJobID: jobID})
			return err
		})
	})
	return nil
}

// Serve serves the gateway on ln until ctx (the one given to Start) is
// cancelled, then waits for every component to stop and releases them.
func (h *Host) Serve(ctx context.Context, ln net.Listener) error {
	defer h.close()
	err := h.gateway.Serve(ctx, ln)
	h.siblings.Wait()
	h.agent.Wait()
	return err
}

func (h *Host) close() {
	for i := len(h.closers) - 1; i >= 0; i-- {
		if err := h.closers[i](); err != nil {
			log.Printf("host: close: %v", err)
		}
	}
	h.closers = nil
}

func endpointClients(defs map[string]config.Endpoint) (map[string]*llm.OpenAI, error) {
	out := make(map[string]*llm.OpenAI, len(defs))
	for name, def := range defs {
		key, err := def.Key()
		if err != nil {
			return nil, fmt.Errorf("endpoint %s: %w", name, err)
		}
		out[name] = llm.NewOpenAI(def.BaseURL, key, def.Limits)
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
		Config:    sc,
		Agent:     shell.AgentFiles{Home: home, SkillsDir: cfg.SkillsDir},
		DenyRead:  []string{filepath.Join(home, config.FileName)},
		EnvMarker: "OLLUPI_SANDBOX",
	})
}

func memoryManager(db *repo.DB, clients map[string]*llm.OpenAI, m config.Memory) (*memory.Manager, error) {
	opts := memory.Options{Generate: m.Generate, Use: m.Use}
	var client *llm.OpenAI
	if m.Model != nil {
		opts.Model = m.Model.LLM()
		client = clients[m.Model.Endpoint]
	}
	mgr, err := memory.New(db, client, opts)
	if err != nil {
		return nil, errors.Join(errors.New("memory"), err)
	}
	return mgr, nil
}
