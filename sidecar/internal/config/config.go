// Package config is the backend's configuration file, <home>/config.yaml:
// the agent-level settings ollupi takes once at start (models and the APIs
// that serve them, default permissions, the workspace tools, MCP servers, memory,
// slots). It only describes; host turns it into running components.
package config

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"

	"github.com/0xfakeSpike/ollupi/pkg/llm"
	"github.com/0xfakeSpike/ollupi/repo"
	"github.com/0xfakeSpike/ollupi/tools/workspace"
	"gopkg.in/yaml.v3"
)

const FileName = "config.yaml"

type Config struct {
	Name   string `json:"name"`
	Prompt string `json:"prompt,omitempty"`
	// Models are grouped by the API that serves them. Order matters: the
	// first model of the first provider is the default.
	Models []Provider `json:"models"`
	// Tools is ollupi's tool allow-list; empty allows every tool.
	Tools       []string    `json:"tools,omitempty"`
	Permissions Permissions `json:"permissions"`
	// Slots caps how many threads run at once; 0 uses ollupi's default.
	Slots int `json:"slots,omitempty"`
	// Workspace turns on run_command, edit_file and write_file.
	Workspace Workspace `json:"workspace"`
	// MCP are the MCP servers whose tools the agent gets, as
	// <name>__<tool>. One that cannot start is skipped.
	MCP       []MCPServer `json:"mcp,omitempty"`
	Memory    Memory      `json:"memory"`
	SkillsDir string      `json:"skills_dir,omitempty"`
}

// Provider is one API and the models it serves. Its name identifies it: two
// providers may serve models of the same name.
type Provider struct {
	Provider string `json:"provider"`
	// Type is the API the provider speaks: openai (any OpenAI-compatible
	// API), anthropic or gemini.
	Type    APIType `json:"type"`
	BaseURL string  `json:"base_url,omitempty"`
	// APIKey is written in the file, like BaseURL; empty for an API that
	// takes no key.
	APIKey string  `json:"api_key,omitempty"`
	Names  []Model `json:"names"`
}

// Model is one model of a provider. Each is its own ollupi connection with
// its own client, so Calls caps concurrent requests to this model; 0 uses
// ollupi's default.
type Model struct {
	Name     string `json:"name"`
	Calls    int    `json:"calls,omitempty"`
	Thinking *bool  `json:"thinking,omitempty"`
	// Images says the model accepts images; ollupi refuses to send one to a
	// model without it.
	Images bool `json:"images,omitempty"`
	// Limits is the model's context window and how much of it an answer
	// may take; ollupi fits a conversation into it.
	Limits llm.Limits `json:"limits"`
}

// APIType is the API a provider speaks, which picks ollupi's client for it.
type APIType string

const (
	APIOpenAI    APIType = "openai"
	APIAnthropic APIType = "anthropic"
	APIGemini    APIType = "gemini"
)

var APITypes = []APIType{APIOpenAI, APIAnthropic, APIGemini}

// ID is a model's ollupi connection: the key a turn selects it by. A
// provider's model names are unique and provider names are unique, so the
// pair is.
func ID(provider, model string) string { return provider + "/" + model }

// ModelRef is one model as the app selects it.
type ModelRef struct {
	ID       string `json:"id"`
	Provider string `json:"provider"`
	Name     string `json:"name"`
}

// ModelRefs lists every model in order, the first being the default.
func (c Config) ModelRefs() []ModelRef {
	var out []ModelRef
	for _, p := range c.Models {
		for _, m := range p.Names {
			out = append(out, ModelRef{ID: ID(p.Provider, m.Name), Provider: p.Provider, Name: m.Name})
		}
	}
	return out
}

// Permissions are the agent-level layer of ollupi's permission settings;
// workspaces and threads add their own on top.
type Permissions struct {
	// Approval is the approval policy: untrusted, on-request or never.
	Approval string   `json:"approval,omitempty"`
	Allow    []string `json:"allow,omitempty"`
	Ask      []string `json:"ask,omitempty"`
	Deny     []string `json:"deny,omitempty"`
}

func (p Permissions) Settings() repo.PermissionSettings {
	return repo.PermissionSettings{
		ApprovalPolicy: p.Approval,
		Rules:          repo.PermissionRules{Allow: p.Allow, Ask: p.Ask, Deny: p.Deny},
	}
}

type Workspace struct {
	Enabled bool `json:"enabled"`
	workspace.Config
}

type Memory struct {
	Use      bool `json:"use"`
	Generate bool `json:"generate"`
	// Model is the ID of the model that extracts memories; required when
	// Generate is on. It shares that model's client and Calls.
	Model string `json:"model,omitempty"`
}

// MCPServer is one MCP server: a command run over stdio, or a streamable
// HTTP URL. ollupi validates the rest (the name, one transport) and skips a
// server it cannot use. Env and header values may name environment
// variables as ${NAME}, so secrets stay out of this file; a command also
// inherits the backend's environment.
type MCPServer struct {
	Name    string            `json:"name"`
	Command string            `json:"command,omitempty"`
	Args    []string          `json:"args,omitempty"`
	Env     map[string]string `json:"env,omitempty"`
	URL     string            `json:"url,omitempty"`
	Headers map[string]string `json:"headers,omitempty"`
}

// BrowserProvider names the app's built-in browser, a tool provider of its
// own; an MCP server of that name would clash with it.
const BrowserProvider = "browser"

var variable = regexp.MustCompile(`\$\{([A-Za-z_][A-Za-z0-9_]*)\}`)

// Expand replaces each ${NAME} in s with that environment variable, which
// must be set.
func Expand(s string) (string, error) {
	var missing string
	out := variable.ReplaceAllStringFunc(s, func(ref string) string {
		name := variable.FindStringSubmatch(ref)[1]
		v, ok := os.LookupEnv(name)
		if !ok && missing == "" {
			missing = name
		}
		return v
	})
	if missing != "" {
		return "", fmt.Errorf("environment variable %s is not set", missing)
	}
	return out, nil
}

// Redacted is the server without values that may be secrets: an env or
// header value that names no variable is written in the file, so it is
// emptied. One built from ${NAME} references stays, since it names where
// the secret is, not the secret.
func (s MCPServer) Redacted() MCPServer {
	redact := func(m map[string]string) map[string]string {
		if m == nil {
			return nil
		}
		out := make(map[string]string, len(m))
		for k, v := range m {
			if variable.MatchString(v) {
				out[k] = v
			} else {
				out[k] = ""
			}
		}
		return out
	}
	s.Env, s.Headers = redact(s.Env), redact(s.Headers)
	return s
}

// Load reads <home>/config.yaml, writing the starter template first when
// there is none.
func Load(home string) (Config, error) {
	path := filepath.Join(home, FileName)
	if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
		if err := os.WriteFile(path, []byte(Template), 0o600); err != nil {
			return Config{}, fmt.Errorf("write starter config: %w", err)
		}
	}
	return LoadFile(path, home)
}

// LoadFile reads a config file for a backend whose home is home: a
// relative skills_dir resolves against home.
func LoadFile(path, home string) (Config, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return Config{}, err
	}
	cfg, err := Parse(raw)
	if err != nil {
		return Config{}, fmt.Errorf("%s: %w", path, err)
	}
	if cfg.SkillsDir != "" && !filepath.IsAbs(cfg.SkillsDir) {
		cfg.SkillsDir = filepath.Join(home, cfg.SkillsDir)
	}
	return cfg, nil
}

// Parse decodes YAML by way of JSON so the file uses the json tags ollupi
// defines on its workspace types. Unknown keys are errors.
func Parse(raw []byte) (Config, error) {
	var tree any
	if err := yaml.Unmarshal(raw, &tree); err != nil {
		return Config{}, err
	}
	asJSON, err := json.Marshal(tree)
	if err != nil {
		return Config{}, err
	}
	dec := json.NewDecoder(bytes.NewReader(asJSON))
	dec.DisallowUnknownFields()
	var cfg Config
	if err := dec.Decode(&cfg); err != nil {
		return Config{}, err
	}
	return cfg, cfg.Validate()
}

// Validate checks what only this file's shape can get wrong: names that
// must identify a model, and references between sections. ollupi validates
// the rest (policies, rules, limits' values) at start.
func (c Config) Validate() error {
	if strings.TrimSpace(c.Name) == "" {
		return errors.New("name is required")
	}
	providers := map[string]bool{}
	ids := map[string]bool{}
	for _, p := range c.Models {
		if strings.TrimSpace(p.Provider) == "" || strings.Contains(p.Provider, "/") {
			return fmt.Errorf("models: every provider needs a name without /, got %q", p.Provider)
		}
		if providers[p.Provider] {
			return fmt.Errorf("models: provider %q is listed twice", p.Provider)
		}
		providers[p.Provider] = true
		if !slices.Contains(APITypes, p.Type) {
			return fmt.Errorf("models: provider %s: type must be one of %q, got %q", p.Provider, APITypes, p.Type)
		}
		if len(p.Names) == 0 {
			return fmt.Errorf("models: provider %s lists no models", p.Provider)
		}
		for _, m := range p.Names {
			if strings.TrimSpace(m.Name) == "" {
				return fmt.Errorf("models: provider %s has a model without a name", p.Provider)
			}
			id := ID(p.Provider, m.Name)
			if ids[id] {
				return fmt.Errorf("models: provider %s lists %s twice", p.Provider, m.Name)
			}
			ids[id] = true
			if m.Calls < 0 {
				return fmt.Errorf("models: %s: calls must not be negative", id)
			}
			if m.Limits == (llm.Limits{}) {
				return fmt.Errorf("models: %s: limits is required: { context: <window tokens>, output: <answer tokens> }", id)
			}
		}
	}
	if len(ids) == 0 {
		return errors.New("models: at least one model is required; the first is the default")
	}
	if c.Memory.Generate && c.Memory.Model == "" {
		return errors.New("memory.model is required when memory.generate is on")
	}
	if c.Memory.Model != "" && !ids[c.Memory.Model] {
		return fmt.Errorf("memory.model %q is not a model listed under models (provider/name)", c.Memory.Model)
	}
	for _, s := range c.MCP {
		if s.Name == BrowserProvider {
			return fmt.Errorf("mcp: the name %s is the app's built-in browser; choose another", BrowserProvider)
		}
	}
	if c.Slots < 0 {
		return errors.New("slots must not be negative")
	}
	return nil
}
