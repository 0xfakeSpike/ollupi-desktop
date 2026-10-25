// Package config is the sidecar's on-disk configuration: what the desktop app
// lets a user change without recompiling (models, connections, default
// permissions, the shell tool and memory). It knows nothing about the agent;
// host turns a Config into running components.
package config

import (
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
	Name      string              `json:"name"`
	Prompt    string              `json:"prompt,omitempty"`
	Endpoints map[string]Endpoint `json:"endpoints"`
	Models    []Model             `json:"models"`
	// Tools is the optional allow-list handed to the agent; empty allows every tool.
	Tools     []string                `json:"tools,omitempty"`
	Settings  repo.PermissionSettings `json:"settings"`
	Shell     Shell                   `json:"shell"`
	Memory    Memory                  `json:"memory"`
	SkillsDir string                  `json:"skills_dir,omitempty"`
}

// Endpoint is one OpenAI-compatible API; several models may share it.
type Endpoint struct {
	BaseURL   string `json:"base_url,omitempty"`
	APIKey    string `json:"api_key,omitempty"`
	APIKeyEnv string `json:"api_key_env,omitempty"`
	// Calls caps concurrent model requests to this endpoint, across all its
	// models; 0 uses ollupi's default.
	Calls  int                   `json:"calls,omitempty"`
	Limits map[string]llm.Limits `json:"limits,omitempty"`
}

type Shell struct {
	Enabled bool `json:"enabled"`
	shell.Config
}

// Model is one selectable model. ID is what ollupi calls the model's
// connection: the unique key a turn selects it by and the UI shows.
type Model struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Endpoint string `json:"endpoint"`
	Thinking *bool  `json:"thinking,omitempty"`
}

func (m Model) LLM() llm.Model {
	return llm.Model{Name: m.Name, Connection: m.ID, Thinking: m.Thinking}
}

type Memory struct {
	Generate bool `json:"generate"`
	Use      bool `json:"use"`
	// Model extracts memories; its id may repeat a chat model's.
	Model *Model `json:"model,omitempty"`
}

// Key resolves the endpoint's API key, preferring the literal value.
func (c Endpoint) Key() (string, error) {
	if c.APIKey != "" {
		return c.APIKey, nil
	}
	if c.APIKeyEnv == "" {
		return "", nil
	}
	if v := os.Getenv(c.APIKeyEnv); v != "" {
		return v, nil
	}
	return "", fmt.Errorf("environment variable %s is not set", c.APIKeyEnv)
}

// Load reads <home>/config.yaml, writing the starter template first when the
// file does not exist yet. Relative paths in the file resolve against home.
func Load(home string) (Config, error) {
	path := filepath.Join(home, FileName)
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		if err := os.WriteFile(path, []byte(Template), 0o600); err != nil {
			return Config{}, fmt.Errorf("write starter config: %w", err)
		}
		raw = []byte(Template)
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

// Parse decodes YAML through JSON so the file reuses the json tags ollupi
// already defines on its settings and shell types.
func Parse(raw []byte) (Config, error) {
	var tree any
	if err := yaml.Unmarshal(raw, &tree); err != nil {
		return Config{}, err
	}
	asJSON, err := json.Marshal(tree)
	if err != nil {
		return Config{}, err
	}
	var cfg Config
	dec := json.NewDecoder(strings.NewReader(string(asJSON)))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&cfg); err != nil {
		return Config{}, err
	}
	return cfg, cfg.Validate()
}

func (c Config) Validate() error {
	if strings.TrimSpace(c.Name) == "" {
		return errors.New("name is required")
	}
	if len(c.Models) == 0 {
		return errors.New("models: at least one model is required; the first is the default")
	}
	seen := map[string]bool{}
	for _, m := range c.Models {
		if err := c.checkModel(m); err != nil {
			return err
		}
		if seen[m.ID] {
			return fmt.Errorf("models: id %q is listed twice", m.ID)
		}
		seen[m.ID] = true
	}
	if c.Memory.Generate {
		if c.Memory.Model == nil {
			return errors.New("memory.model is required when memory.generate is on")
		}
		if err := c.checkModel(*c.Memory.Model); err != nil {
			return fmt.Errorf("memory.%w", err)
		}
	}
	return nil
}

func (c Config) checkModel(m Model) error {
	if strings.TrimSpace(m.ID) == "" || strings.TrimSpace(m.Name) == "" {
		return errors.New("models: every model needs an id and a name")
	}
	if _, ok := c.Endpoints[m.Endpoint]; !ok {
		return fmt.Errorf("model %s uses endpoint %q, which is not defined under endpoints", m.ID, m.Endpoint)
	}
	return nil
}
