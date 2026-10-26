// Package config is the backend's configuration file, <home>/config.yaml:
// the agent-level settings ollupi takes once at start (models and their
// endpoints, default permissions, the shell tool, memory, slots). It only
// describes; host turns it into running components.
package config

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/0xfakeSpike/ollupi/pkg/llm"
	"github.com/0xfakeSpike/ollupi/repo"
	"github.com/0xfakeSpike/ollupi/tools/shell"
	"gopkg.in/yaml.v3"
)

const FileName = "config.yaml"

type Config struct {
	Name   string `json:"name"`
	Prompt string `json:"prompt,omitempty"`
	// Endpoints are OpenAI-compatible APIs, keyed by a name models refer to.
	Endpoints map[string]Endpoint `json:"endpoints"`
	// Models are selectable per turn; the first is the default.
	Models []Model `json:"models"`
	// Tools is ollupi's tool allow-list; empty allows every tool.
	Tools    []string                `json:"tools,omitempty"`
	Settings repo.PermissionSettings `json:"settings"`
	// Slots caps how many threads run at once; 0 uses ollupi's default.
	Slots     int    `json:"slots,omitempty"`
	Shell     Shell  `json:"shell"`
	Memory    Memory `json:"memory"`
	SkillsDir string `json:"skills_dir,omitempty"`
}

// Endpoint is one API. All models on it share one client, so Calls caps
// concurrent requests to the endpoint as a whole; 0 uses ollupi's default.
type Endpoint struct {
	BaseURL   string                `json:"base_url,omitempty"`
	APIKey    string                `json:"api_key,omitempty"`
	APIKeyEnv string                `json:"api_key_env,omitempty"`
	Calls     int                   `json:"calls,omitempty"`
	Limits    map[string]llm.Limits `json:"limits,omitempty"`
}

// Model is one selectable model. ID becomes ollupi's connection: the unique
// key a turn selects the model by. Name is what the endpoint is asked for.
type Model struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Endpoint string `json:"endpoint"`
	Thinking *bool  `json:"thinking,omitempty"`
}

func (m Model) LLM() llm.Model {
	return llm.Model{Name: m.Name, Connection: m.ID, Thinking: m.Thinking}
}

type Shell struct {
	Enabled bool `json:"enabled"`
	shell.Config
}

type Memory struct {
	Use      bool `json:"use"`
	Generate bool `json:"generate"`
	// Model extracts memories; required when Generate is on.
	Model *Model `json:"model,omitempty"`
}

// Key resolves the endpoint's API key: the literal value, else the named
// environment variable, which must then be set.
func (e Endpoint) Key() (string, error) {
	if e.APIKey != "" {
		return e.APIKey, nil
	}
	if e.APIKeyEnv == "" {
		return "", nil
	}
	if v := os.Getenv(e.APIKeyEnv); v != "" {
		return v, nil
	}
	return "", fmt.Errorf("environment variable %s is not set", e.APIKeyEnv)
}

// Load reads <home>/config.yaml, writing the starter template first when
// there is none. A relative skills_dir resolves against home.
func Load(home string) (Config, error) {
	path := filepath.Join(home, FileName)
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		raw = []byte(Template)
		if err := os.WriteFile(path, raw, 0o600); err != nil {
			return Config{}, fmt.Errorf("write starter config: %w", err)
		}
	} else if err != nil {
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
// defines on its settings and shell types. Unknown keys are errors.
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

// Validate checks what only this file's shape can get wrong: references
// between its sections. ollupi validates its own settings at start.
func (c Config) Validate() error {
	if strings.TrimSpace(c.Name) == "" {
		return errors.New("name is required")
	}
	if len(c.Models) == 0 {
		return errors.New("models: at least one model is required; the first is the default")
	}
	ids := map[string]bool{}
	for _, m := range c.Models {
		if err := c.checkModel(m); err != nil {
			return fmt.Errorf("models: %w", err)
		}
		if ids[m.ID] {
			return fmt.Errorf("models: id %q is listed twice", m.ID)
		}
		ids[m.ID] = true
	}
	if c.Memory.Generate {
		if c.Memory.Model == nil {
			return errors.New("memory.model is required when memory.generate is on")
		}
		if err := c.checkModel(*c.Memory.Model); err != nil {
			return fmt.Errorf("memory.model: %w", err)
		}
	}
	if c.Slots < 0 {
		return errors.New("slots must not be negative")
	}
	for name, e := range c.Endpoints {
		if e.Calls < 0 {
			return fmt.Errorf("endpoint %s: calls must not be negative", name)
		}
	}
	return nil
}

func (c Config) checkModel(m Model) error {
	if strings.TrimSpace(m.ID) == "" || strings.TrimSpace(m.Name) == "" {
		return errors.New("every model needs an id and a name")
	}
	if _, ok := c.Endpoints[m.Endpoint]; !ok {
		return fmt.Errorf("model %s uses endpoint %q, which endpoints does not define", m.ID, m.Endpoint)
	}
	return nil
}
