// Package config is the backend's configuration file, <home>/config.yaml:
// what the deployment is, the same for every user it serves: its name and
// prompt, the tool allow-list and slots. The backend reads it at start, and
// a change takes a restart. Nothing in it belongs to one profile, and the
// models are not in it either: they are ollupi's catalog, in its store,
// which the deployment's operator sets over the gateway; which model a
// profile starts and learns with, its permissions, MCP servers, memory and
// skills are its own, in the store too. Files from before that held
// profiles, the providers, a skills folder or the workspace tools' settings
// are taken apart once by Legacy, Providers, SkillsDir and Workspace. It
// only describes; host turns it into running components.
package config

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"gopkg.in/yaml.v3"
)

const FileName = "config.yaml"

type Config struct {
	Name   string `json:"name"`
	Prompt string `json:"prompt,omitempty"`
	// Tools is ollupi's tool allow-list; empty allows every tool.
	Tools []string `json:"tools,omitempty"`
	// Slots caps how many threads run at once; 0 uses ollupi's default.
	Slots int `json:"slots,omitempty"`
}

// ProfileID is what a profile's id may be: it names folders under the home
// and is the segment a connection's token carries, so it holds no separator.
var ProfileID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

// Load reads <home>/config.yaml, writing the starter template first when
// there is none.
func Load(home string) (Config, error) {
	path := filepath.Join(home, FileName)
	if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
		if err := os.WriteFile(path, []byte(Template), 0o600); err != nil {
			return Config{}, fmt.Errorf("write starter config: %w", err)
		}
	}
	return LoadFile(path)
}

// LoadFile reads a config file.
func LoadFile(path string) (Config, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return Config{}, err
	}
	if _, _, _, found, _ := Legacy(raw); found {
		return Config{}, fmt.Errorf("%s still declares profiles and their own models; ollupid --import-config moves the models into providers and each profile's choices into the store", path)
	}
	if _, _, found, _ := SkillsDir(raw, ""); found {
		return Config{}, fmt.Errorf("%s still names a skills_dir; ollupid --import-config gives its skills to each profile in the store", path)
	}
	if _, _, found, _ := Providers(raw); found {
		return Config{}, fmt.Errorf("%s still lists providers; ollupid --import-config moves them into the store, where the models are set in the app", path)
	}
	if _, found, _ := Workspace(raw); found {
		return Config{}, fmt.Errorf("%s still has a workspace block; ollupid --import-config takes it out", path)
	}
	cfg, err := Parse(raw)
	if err != nil {
		return Config{}, fmt.Errorf("%s: %w", path, err)
	}
	return cfg, nil
}

// Parse decodes YAML by way of JSON so the file uses the json tags its types
// and ollupi's define. Unknown keys are errors.
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
	if c.Slots < 0 {
		return errors.New("slots must not be negative")
	}
	return nil
}
