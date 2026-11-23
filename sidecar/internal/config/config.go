// Package config is the backend's configuration file, <home>/config.yaml:
// what ollupi takes once at start as the deployment's profiles (each with its
// models, API clients and learning model, the workspace tools, and slots).
// What the user sets while it runs (permissions, MCP servers,
// whether memory is on) is theirs in ollupi's store, set through the
// gateway. It only describes; host turns it into running components.
package config

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"

	"github.com/0xfakeSpike/ollupi-desktop/sidecar/skills"
	"github.com/0xfakeSpike/ollupi/agent"
	"github.com/0xfakeSpike/ollupi/pkg/llm"
	"github.com/0xfakeSpike/ollupi/tool/builtin/workspace"
	"gopkg.in/yaml.v3"
)

const FileName = "config.yaml"

type Config struct {
	Name     string    `json:"name"`
	Prompt   string    `json:"prompt,omitempty"`
	Profiles []Profile `json:"profiles"`
	// Tools is ollupi's tool allow-list; empty allows every tool.
	Tools []string `json:"tools,omitempty"`
	// Slots caps how many threads run at once; 0 uses ollupi's default.
	Slots int `json:"slots,omitempty"`
	// Workspace turns on run_command, edit_file and write_file.
	Workspace Workspace `json:"workspace"`
	SkillsDir string    `json:"skills_dir,omitempty"`
	// Feishu is the Feishu (Lark) bot that sessions are driven through from
	// a phone; leave it out to run without one.
	Feishu *Feishu `json:"feishu,omitempty"`
}

// Profile is one profile's models and the model that learns its memory.
type Profile struct {
	ID     string     `json:"id"`
	Models []Provider `json:"models"`
	Memory Memory     `json:"memory,omitzero"`
}

// profileID is what a profile's id may be: it names folders under the home
// and is the segment a connection's token carries, so it holds no separator.
var profileID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

// Feishu is a self-built Feishu app whose bot receives events over a long
// connection, so the Mac needs no public address.
type Feishu struct {
	AppID string `json:"app_id"`
	// AppSecret is written in the file, like a provider's api_key.
	AppSecret string `json:"app_secret"`
	// Profile is the user the bot acts as: the sessions it starts are that
	// profile's. There is no default one.
	Profile string `json:"profile"`
	// Domain is feishu (open.feishu.cn, the default) or lark
	// (open.larksuite.com).
	Domain FeishuDomain `json:"domain,omitempty"`
	// Users are the open_ids the bot acts for. Anyone else who writes to it
	// is told their open_id and nothing else happens.
	Users []string `json:"users,omitempty"`
	// Profiles names the profile an open_id acts as; one not named acts as
	// Profile. Its keys must be users and its values profiles of this file.
	Profiles map[string]string `json:"profiles,omitempty"`
	// Workspace is the folder of the workspace sessions started from Feishu
	// belong to; empty starts them in no workspace.
	Workspace string `json:"workspace,omitempty"`
}

type FeishuDomain string

const (
	FeishuDomainFeishu FeishuDomain = "feishu"
	FeishuDomainLark   FeishuDomain = "lark"
)

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

type Workspace struct {
	Enabled bool `json:"enabled"`
	workspace.Config
}

type Memory struct {
	// Model is the ID of the model that learns memories from finished
	// turns, for a user who has memory and learning on; without one none
	// are learned. It
	// shares that model's client and Calls.
	Model string `json:"model,omitempty"`
}

// Load reads <home>/config.yaml, writing the starter template and skills
// first when there is none.
func Load(home string) (Config, error) {
	path := filepath.Join(home, FileName)
	if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
		// The skills go first: a start that fails copying them tries again.
		if err := writeStarterSkills(filepath.Join(home, "skills")); err != nil {
			return Config{}, fmt.Errorf("write starter skills: %w", err)
		}
		if err := os.WriteFile(path, []byte(Template), 0o600); err != nil {
			return Config{}, fmt.Errorf("write starter config: %w", err)
		}
	}
	return LoadFile(path, home)
}

// starterRoles have the skills the desktop ships: the main agent, which is
// both of its roles, so that a conversation that moves to a model of
// another size keeps them (ollupi installs a role's skills in the
// directory of its name).
var starterRoles = []agent.Name{agent.FullMain, agent.CompactMain}

// writeStarterSkills copies each skill the desktop ships into the
// directory of each starter role under dir, leaving a folder already there
// of the same name as it is.
func writeStarterSkills(dir string) error {
	entries, err := fs.ReadDir(skills.FS, ".")
	if err != nil {
		return err
	}
	for _, r := range starterRoles {
		if err := writeSkills(filepath.Join(dir, string(r)), entries); err != nil {
			return err
		}
	}
	return nil
}

func writeSkills(dir string, entries []fs.DirEntry) error {
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		target := filepath.Join(dir, e.Name())
		if _, err := os.Stat(target); err == nil {
			continue
		}
		skill, err := fs.Sub(skills.FS, e.Name())
		if err != nil {
			return err
		}
		// A half-copied skill would be left as it is on the next try.
		if err := os.CopyFS(target, skill); err != nil {
			os.RemoveAll(target)
			return err
		}
	}
	return nil
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
	cfg.expandPaths(home)
	return cfg, nil
}

// expandPaths resolves the paths the file names: ~ is the user's home and a
// relative path is the file's own folder, as skills_dir has always been. A
// config and the folders it names then travel to another machine, whose user
// may be called something else.
func (c *Config) expandPaths(home string) {
	c.SkillsDir = expandPath(c.SkillsDir, home)
	if f := c.Feishu; f != nil {
		f.Workspace = expandPath(f.Workspace, home)
	}
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

// Validate checks what only this file's shape can get wrong: names that
// must identify a model, and references between sections. ollupi validates
// the rest (policies, rules, limits' values) at start.
func (c Config) Validate() error {
	if strings.TrimSpace(c.Name) == "" {
		return errors.New("name is required")
	}
	if len(c.Profiles) == 0 {
		return errors.New("profiles: at least one profile is required")
	}
	seen := map[string]bool{}
	for _, p := range c.Profiles {
		if !profileID.MatchString(p.ID) {
			return fmt.Errorf("profiles: %q is not a profile id: letters, digits, '-' or '_', at most 64", p.ID)
		}
		if seen[p.ID] {
			return fmt.Errorf("profiles: %q is listed twice", p.ID)
		}
		seen[p.ID] = true
		ids, err := validateModels("profiles: "+p.ID, p.Models)
		if err != nil {
			return err
		}
		if len(ids) == 0 {
			return fmt.Errorf("profiles: %s lists no models", p.ID)
		}
		if err := checkMemory("profiles: "+p.ID+": memory", p.Memory, ids); err != nil {
			return err
		}
	}
	if c.Slots < 0 {
		return errors.New("slots must not be negative")
	}
	if f := c.Feishu; f != nil {
		if strings.TrimSpace(f.AppID) == "" || strings.TrimSpace(f.AppSecret) == "" {
			return errors.New("feishu: app_id and app_secret are required")
		}
		if strings.TrimSpace(f.Profile) == "" {
			return errors.New("feishu: profile is required: the bot acts as a user, never none")
		}
		if f.Domain != "" && f.Domain != FeishuDomainFeishu && f.Domain != FeishuDomainLark {
			return fmt.Errorf("feishu: domain must be %s or %s, got %q", FeishuDomainFeishu, FeishuDomainLark, f.Domain)
		}
		for open, profile := range f.Profiles {
			if !slices.Contains(f.Users, open) {
				return fmt.Errorf("feishu: profiles names %q, which is not one of users", open)
			}
			if !seen[profile] {
				return fmt.Errorf("feishu: profiles: %q is not a profile of this file", profile)
			}
		}
		if !seen[f.Profile] {
			return fmt.Errorf("feishu.profile %q is not a profile of this file", f.Profile)
		}
	}
	return nil
}

// validateModels checks one profile's models and returns the ids it lists.
func validateModels(what string, providers []Provider) (map[string]bool, error) {
	seen := map[string]bool{}
	ids := map[string]bool{}
	for _, p := range providers {
		if strings.TrimSpace(p.Provider) == "" || strings.Contains(p.Provider, "/") {
			return nil, fmt.Errorf("%s: every provider needs a name without /, got %q", what, p.Provider)
		}
		if seen[p.Provider] {
			return nil, fmt.Errorf("%s: provider %q is listed twice", what, p.Provider)
		}
		seen[p.Provider] = true
		if !slices.Contains(APITypes, p.Type) {
			return nil, fmt.Errorf("%s: provider %s: type must be one of %q, got %q", what, p.Provider, APITypes, p.Type)
		}
		if len(p.Names) == 0 {
			return nil, fmt.Errorf("%s: provider %s lists no models", what, p.Provider)
		}
		for _, m := range p.Names {
			if strings.TrimSpace(m.Name) == "" {
				return nil, fmt.Errorf("%s: provider %s has a model without a name", what, p.Provider)
			}
			id := ID(p.Provider, m.Name)
			if ids[id] {
				return nil, fmt.Errorf("%s: provider %s lists %s twice", what, p.Provider, m.Name)
			}
			ids[id] = true
			if m.Calls < 0 {
				return nil, fmt.Errorf("%s: %s: calls must not be negative", what, id)
			}
			if m.Limits == (llm.Limits{}) {
				return nil, fmt.Errorf("%s: %s: limits is required: { context: <window tokens>, output: <answer tokens>, input: <optional input cap> }", what, id)
			}
		}
	}
	return ids, nil
}

// checkMemory says whether a learning model names one of the set's models.
func checkMemory(what string, m Memory, ids map[string]bool) error {
	if m.Model != "" && !ids[m.Model] {
		return fmt.Errorf("%s.model %q is not a model listed here (provider/name)", what, m.Model)
	}
	return nil
}
