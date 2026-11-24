// Package config is the backend's configuration file, <home>/config.yaml:
// what the deployment is, the same for every user it serves. Its providers
// are the platform's models, with their accounts and keys: every profile runs
// on them and only chooses which. The rest is its name and prompt, the tool
// allow-list, slots, the workspace tools, the skills and the Feishu bot. The
// backend reads it at start; a SIGHUP has it take the providers again, and
// anything else takes a restart. Nothing in it belongs to one profile: which
// model a profile starts and learns with, its permissions, MCP servers and
// memory are its own in ollupi's store, set through the gateway. Files from
// before that held profiles are taken apart once by Legacy. It only
// describes; host turns it into running components.
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
	"github.com/0xfakeSpike/ollupi/account"
	"github.com/0xfakeSpike/ollupi/agent"
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
	SkillsDir string    `json:"skills_dir,omitempty"`
	// Feishu is the Feishu (Lark) bot that sessions are driven through from
	// a phone; leave it out to run without one.
	Feishu *Feishu `json:"feishu,omitempty"`
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

type Workspace struct {
	Enabled bool `json:"enabled"`
	workspace.Config
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
	if _, _, found, _ := Legacy(raw); found {
		return Config{}, fmt.Errorf("%s still declares profiles and their own models; ollupid --import-config moves the models into providers and each profile's choices into the store", path)
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
	if f := c.Feishu; f != nil {
		if strings.TrimSpace(f.AppID) == "" || strings.TrimSpace(f.AppSecret) == "" {
			return errors.New("feishu: app_id and app_secret are required")
		}
		if !ProfileID.MatchString(f.Profile) {
			return fmt.Errorf("feishu: profile %q is not a profile id: the bot acts as a user, never none", f.Profile)
		}
		if f.Domain != "" && f.Domain != FeishuDomainFeishu && f.Domain != FeishuDomainLark {
			return fmt.Errorf("feishu: domain must be %s or %s, got %q", FeishuDomainFeishu, FeishuDomainLark, f.Domain)
		}
		for open, profile := range f.Profiles {
			if !slices.Contains(f.Users, open) {
				return fmt.Errorf("feishu: profiles names %q, which is not one of users", open)
			}
			if !ProfileID.MatchString(profile) {
				return fmt.Errorf("feishu: profiles: %q is not a profile id", profile)
			}
		}
	}
	return nil
}

// Profiles are the users the deployment names: those the Feishu bot acts as.
func (c Config) Profiles() []string {
	f := c.Feishu
	if f == nil {
		return nil
	}
	out := []string{f.Profile}
	for _, p := range f.Profiles {
		if !slices.Contains(out, p) {
			out = append(out, p)
		}
	}
	return out
}
