// Package config is the backend's configuration file, <home>/config.yaml:
// what the deployment is, the same for every user it serves. Its providers
// are the platform's models, with their accounts and keys: every profile runs
// on them and only chooses which. The rest is its name and prompt, the tool
// allow-list, slots and the workspace tools. The backend reads it at start; a SIGHUP has it take the providers again, and
// anything else takes a restart. Nothing in it belongs to one profile: which
// model a profile starts and learns with, its permissions, MCP servers and
// memory and skills are its own in ollupi's store, set through the gateway.
// Files from before that held profiles, or a skills folder, are taken apart
// once by Legacy and SkillsDir. It only
// describes; host turns it into running components.
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

	"github.com/0xfakeSpike/ollupi/account"
	"github.com/0xfakeSpike/ollupi/tool/builtin/workspace"
	"gopkg.in/yaml.v3"
)

const FileName = "config.yaml"

type Config struct {
	Name   string `json:"name"`
	Prompt string `json:"prompt,omitempty"`
	// Providers are the models the deployment serves, each provider an API
	// account; a model is selected as provider/name.
	Providers []Provider `json:"providers"`
	// Tools is ollupi's tool allow-list; empty allows every tool.
	Tools []string `json:"tools,omitempty"`
	// Slots caps how many threads run at once; 0 uses ollupi's default.
	Slots int `json:"slots,omitempty"`
	// Workspace turns on run_command, edit_file and write_file.
	Workspace Workspace `json:"workspace"`
}

// Provider is one API account of the deployment and the models it serves.
// Its id names it: two providers may serve models of the same name.
type Provider struct {
	ID string `json:"id"`
	// Type is the API the provider speaks: openai (any OpenAI-compatible
	// API), anthropic or gemini.
	Type    account.ModelAPI `json:"type"`
	BaseURL string           `json:"base_url,omitempty"`
	// APIKey is written in the file, like BaseURL; empty for an API that
	// takes no key.
	APIKey string                  `json:"api_key,omitempty"`
	Models []account.ProviderModel `json:"models"`
}

// Catalog is the providers as ollupi serves them.
func (c Config) Catalog() []account.ModelProvider {
	out := make([]account.ModelProvider, len(c.Providers))
	for i, p := range c.Providers {
		out[i] = account.ModelProvider{ID: p.ID, API: p.Type, BaseURL: p.BaseURL, APIKey: p.APIKey, Models: slices.Clone(p.Models)}
	}
	return out
}

// ProfileID is what a profile's id may be: it names folders under the home
// and is the segment a connection's token carries, so it holds no separator.
var ProfileID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

type Workspace struct {
	Enabled bool `json:"enabled"`
	workspace.Config
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
// relative path in it resolves against home.
func LoadFile(path, home string) (Config, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return Config{}, err
	}
	if _, _, found, _ := Legacy(raw); found {
		return Config{}, fmt.Errorf("%s still declares profiles and their own models; ollupid --import-config moves the models into providers and each profile's choices into the store", path)
	}
	if _, _, found, _ := SkillsDir(raw, home); found {
		return Config{}, fmt.Errorf("%s still names a skills_dir; ollupid --import-config gives its skills to each profile in the store", path)
	}
	cfg, err := Parse(raw)
	if err != nil {
		return Config{}, fmt.Errorf("%s: %w", path, err)
	}
	cfg.expandPaths(home)
	return cfg, nil
}

// expandPaths resolves the paths the file names: ~ is the user's home and a
// relative path is the file's own folder. A
// config and the folders it names then travel to another machine, whose user
// may be called something else.
func (c *Config) expandPaths(home string) {
	w := &c.Workspace
	w.WorkspaceDirs = expandPaths(w.WorkspaceDirs, home)
	w.DenyRead = expandPaths(w.DenyRead, home)
	w.ReadOnly = expandPaths(w.ReadOnly, home)
	w.ExtraWritable = expandPaths(w.ExtraWritable, home)
	w.UnixSockets = expandPaths(w.UnixSockets, home)
}

// expandPath resolves one path of the file; empty stays empty and an absolute
// path that names no home is left as it is.
func expandPath(path, home string) string {
	switch {
	case path == "":
		return ""
	case path == "~" || strings.HasPrefix(path, "~/"):
		user, err := os.UserHomeDir()
		if err != nil {
			return path
		}
		if path == "~" {
			return user
		}
		return filepath.Join(user, filepath.FromSlash(path[2:]))
	case filepath.IsAbs(path):
		return path
	}
	return filepath.Join(home, path)
}

func expandPaths(paths []string, home string) []string {
	if len(paths) == 0 {
		return paths
	}
	out := make([]string, len(paths))
	for i, path := range paths {
		out[i] = expandPath(path, home)
	}
	return out
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

// Validate checks what only this file's shape can get wrong; ollupi
// validates the rest (policies, rules) at start.
func (c Config) Validate() error {
	if strings.TrimSpace(c.Name) == "" {
		return errors.New("name is required")
	}
	if err := account.CheckCatalog(c.Catalog()); err != nil {
		return fmt.Errorf("providers: %w", err)
	}
	if c.Slots < 0 {
		return errors.New("slots must not be negative")
	}
	return nil
}
