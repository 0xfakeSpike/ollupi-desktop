// Package config is the backend's configuration file, <home>/config.yaml:
// the API accounts (credentials) and the profiles that select their models,
// each with its learning model, the workspace tools, and slots. The backend
// reads it at start; a SIGHUP has it take the credentials and profiles again,
// while everything else takes a restart. The file carries schema_version, and
// a file without one is upgraded once (Upgrade). What the user sets while it
// runs (permissions, MCP servers, whether memory is on) is theirs in ollupi's
// store, set through the gateway. It only describes; host turns it into
// running components.
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

// SchemaVersion is the configuration format this build reads and writes.
const SchemaVersion = 2

type Config struct {
	SchemaVersion int          `json:"schema_version"`
	Name          string       `json:"name"`
	Prompt        string       `json:"prompt,omitempty"`
	Credentials   []Credential `json:"credentials"`
	Profiles      []Profile    `json:"profiles"`
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

// Credential is one API account and the models it serves. Profiles reference
// these models by id, so profiles sharing a key also share its client and
// concurrency limit.
type Credential struct {
	ID      string  `json:"id"`
	Type    APIType `json:"type"`
	BaseURL string  `json:"base_url,omitempty"`
	APIKey  string  `json:"api_key,omitempty"`
	Models  []Model `json:"models"`
}

// Profile is a display identity, the models it may run in order, and the
// model that learns its memory.
type Profile struct {
	ID     string   `json:"id"`
	Name   string   `json:"name,omitempty"`
	Color  string   `json:"color,omitempty"`
	Models []string `json:"models"`
	Memory Memory   `json:"memory,omitzero"`
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
	if _, err := UpgradeFile(path); err != nil {
		return Config{}, fmt.Errorf("upgrade config: %w", err)
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

// UpgradeFile converts a config file to the current schema in place, keeping
// the previous file beside it. It reports whether it changed the file.
func UpgradeFile(path string) (bool, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return false, err
	}
	upgraded, changed, err := Upgrade(raw)
	if err != nil || !changed {
		return changed, err
	}
	if _, err := Parse(upgraded); err != nil {
		return false, err
	}
	backup := fmt.Sprintf("%s.pre-v%d", path, SchemaVersion)
	if err := os.WriteFile(backup, raw, 0o600); err != nil {
		return false, fmt.Errorf("back up %s: %w", path, err)
	}
	candidate := path + ".candidate"
	if err := os.WriteFile(candidate, upgraded, 0o600); err != nil {
		return false, err
	}
	if err := os.Rename(candidate, path); err != nil {
		os.Remove(candidate)
		return false, err
	}
	return true, nil
}

// RemoveProfile returns a config without one profile, after checking that
// nothing still references it.
func RemoveProfile(raw []byte, id string) ([]byte, error) {
	var tree map[string]any
	if err := yaml.Unmarshal(raw, &tree); err != nil {
		return nil, err
	}
	profiles, _ := tree["profiles"].([]any)
	if len(profiles) <= 1 {
		return nil, errors.New("the last profile cannot be deleted")
	}
	var kept []any
	found := false
	for _, raw := range profiles {
		p, _ := raw.(map[string]any)
		if stringOf(p["id"]) == id {
			found = true
			continue
		}
		kept = append(kept, p)
	}
	if !found {
		return nil, fmt.Errorf("profile %q is not in the config", id)
	}
	if f, ok := tree["feishu"].(map[string]any); ok {
		if stringOf(f["profile"]) == id {
			return nil, errors.New("the Feishu bot still acts as this profile")
		}
		if mappings, ok := f["profiles"].(map[string]any); ok {
			for open, profile := range mappings {
				if stringOf(profile) == id {
					return nil, fmt.Errorf("Feishu user %s still maps to this profile", open)
				}
			}
		}
	}
	tree["profiles"] = kept
	out, err := yaml.Marshal(tree)
	if err != nil {
		return nil, err
	}
	if _, err := Parse(out); err != nil {
		return nil, err
	}
	return out, nil
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

// Upgrade converts a config without schema_version to the current schema.
// The shipped layouts before it are a top-level models list with its memory
// model, and profiles[] whose entries list their own providers. They are
// accepted only here; everything after this boundary reads credentials[] and
// profiles[].
func Upgrade(raw []byte) ([]byte, bool, error) {
	var tree map[string]any
	if err := yaml.Unmarshal(raw, &tree); err != nil {
		return nil, false, err
	}
	if tree == nil {
		return nil, false, errors.New("the config is empty")
	}
	if version, ok := tree["schema_version"]; ok {
		if version != SchemaVersion {
			return nil, false, fmt.Errorf("schema_version %v is not one this build reads (%d)", version, SchemaVersion)
		}
		return raw, false, nil
	}
	legacy, err := legacyProfiles(tree)
	if err != nil {
		return nil, false, err
	}
	credentials, profiles, err := liftCredentials(legacy)
	if err != nil {
		return nil, false, err
	}
	delete(tree, "models")
	delete(tree, "memory")
	tree["schema_version"] = SchemaVersion
	tree["credentials"] = credentials
	tree["profiles"] = profiles
	out, err := yaml.Marshal(tree)
	return out, true, err
}

type legacyProfile struct {
	id     string
	models []any
	memory any
}

func legacyProfiles(tree map[string]any) ([]legacyProfile, error) {
	if listed, ok := tree["profiles"].([]any); ok {
		out := make([]legacyProfile, 0, len(listed))
		for _, raw := range listed {
			p, _ := raw.(map[string]any)
			models, _ := p["models"].([]any)
			out = append(out, legacyProfile{id: stringOf(p["id"]), models: models, memory: p["memory"]})
		}
		return out, nil
	}
	models, _ := tree["models"].([]any)
	if len(models) == 0 {
		return nil, errors.New("the config has no models")
	}
	return []legacyProfile{{id: "default", models: models, memory: tree["memory"]}}, nil
}

// liftCredentials makes one credential per API account, so profiles that
// copied the same key share it, and points each profile at its models.
func liftCredentials(legacy []legacyProfile) ([]any, []any, error) {
	var credentials []map[string]any
	byAccount := map[string]map[string]any{}
	taken := map[string]bool{}
	profiles := make([]any, 0, len(legacy))
	for _, p := range legacy {
		if p.id == "" {
			return nil, nil, errors.New("a profile has no id")
		}
		selected := []any{}
		renamed := map[string]string{}
		for _, raw := range p.models {
			provider, _ := raw.(map[string]any)
			source := stringOf(provider["provider"])
			if source == "" {
				return nil, nil, fmt.Errorf("profile %s has a provider without a name", p.id)
			}
			account := accountKey(stringOf(provider["type"]), stringOf(provider["base_url"]), stringOf(provider["api_key"]))
			credential := byAccount[account]
			if credential == nil {
				id := source
				for n := 2; taken[id]; n++ {
					id = fmt.Sprintf("%s-%d", source, n)
				}
				taken[id] = true
				credential = map[string]any{"id": id, "type": provider["type"], "models": []any{}}
				if v := stringOf(provider["base_url"]); v != "" {
					credential["base_url"] = v
				}
				if v := stringOf(provider["api_key"]); v != "" {
					credential["api_key"] = v
				}
				byAccount[account] = credential
				credentials = append(credentials, credential)
			}
			id := stringOf(credential["id"])
			renamed[source] = id
			names, _ := provider["names"].([]any)
			for _, rawModel := range names {
				model, _ := rawModel.(map[string]any)
				name := stringOf(model["name"])
				if !hasModel(credential["models"].([]any), name) {
					credential["models"] = append(credential["models"].([]any), model)
				}
				selected = append(selected, ID(id, name))
			}
		}
		profile := map[string]any{"id": p.id, "models": selected}
		if m, ok := p.memory.(map[string]any); ok {
			if source, name, found := strings.Cut(stringOf(m["model"]), "/"); found && renamed[source] != "" {
				profile["memory"] = map[string]any{"model": ID(renamed[source], name)}
			}
		}
		profiles = append(profiles, profile)
	}
	out := make([]any, len(credentials))
	for i, c := range credentials {
		out[i] = c
	}
	return out, profiles, nil
}

func accountKey(apiType, baseURL, apiKey string) string {
	return strings.Join([]string{apiType, strings.TrimRight(baseURL, "/"), apiKey}, "\x00")
}

func hasModel(models []any, name string) bool {
	for _, raw := range models {
		if m, _ := raw.(map[string]any); stringOf(m["name"]) == name {
			return true
		}
	}
	return false
}

func stringOf(v any) string {
	s, _ := v.(string)
	return s
}

// Validate checks what only this file's shape can get wrong: names that
// must identify a model, and references between sections. ollupi validates
// the rest (policies, rules, limits' values) at start.
func (c Config) Validate() error {
	if c.SchemaVersion != SchemaVersion {
		return fmt.Errorf("schema_version must be %d, got %d", SchemaVersion, c.SchemaVersion)
	}
	if strings.TrimSpace(c.Name) == "" {
		return errors.New("name is required")
	}
	models, err := validateCredentials(c.Credentials)
	if err != nil {
		return err
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
		if len([]rune(p.Name)) > 120 {
			return fmt.Errorf("profiles: %s: name must be at most 120 characters", p.ID)
		}
		if p.Color != "" && !slices.Contains(ProfileColors, p.Color) {
			return fmt.Errorf("profiles: %s: color must be one of %q, got %q", p.ID, ProfileColors, p.Color)
		}
		if len(p.Models) == 0 {
			return fmt.Errorf("profiles: %s lists no models", p.ID)
		}
		own := map[string]bool{}
		for _, id := range p.Models {
			if own[id] {
				return fmt.Errorf("profiles: %s lists %s twice", p.ID, id)
			}
			if !models[id] {
				return fmt.Errorf("profiles: %s names unknown model %q", p.ID, id)
			}
			own[id] = true
		}
		if err := checkMemory("profiles: "+p.ID+": memory", p.Memory, own); err != nil {
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

// ProfileColors are the presentation colours the desktop accepts.
var ProfileColors = []string{"stone", "amber", "teal", "violet", "rose", "sky"}

// validateCredentials checks every API account and returns all model ids.
func validateCredentials(credentials []Credential) (map[string]bool, error) {
	seen := map[string]bool{}
	accounts := map[string]string{}
	ids := map[string]bool{}
	for _, c := range credentials {
		if !profileID.MatchString(c.ID) {
			return nil, fmt.Errorf("credentials: %q is not an id: letters, digits, '-' or '_', at most 64", c.ID)
		}
		if seen[c.ID] {
			return nil, fmt.Errorf("credentials: %q is listed twice", c.ID)
		}
		seen[c.ID] = true
		account := accountKey(string(c.Type), c.BaseURL, c.APIKey)
		if other, ok := accounts[account]; ok {
			return nil, fmt.Errorf("credentials: %s and %s are the same API account (type, base_url and api_key); list its models under one of them so they share its limits", other, c.ID)
		}
		accounts[account] = c.ID
		if !slices.Contains(APITypes, c.Type) {
			return nil, fmt.Errorf("credentials: %s: type must be one of %q, got %q", c.ID, APITypes, c.Type)
		}
		if len(c.Models) == 0 {
			return nil, fmt.Errorf("credentials: %s lists no models", c.ID)
		}
		for _, m := range c.Models {
			if strings.TrimSpace(m.Name) == "" {
				return nil, fmt.Errorf("credentials: %s has a model without a name", c.ID)
			}
			id := ID(c.ID, m.Name)
			if ids[id] {
				return nil, fmt.Errorf("credentials: %s lists %s twice", c.ID, m.Name)
			}
			ids[id] = true
			if m.Calls < 0 {
				return nil, fmt.Errorf("credentials: %s: calls must not be negative", id)
			}
			if m.Limits == (llm.Limits{}) {
				return nil, fmt.Errorf("credentials: %s: limits is required: { context: <window tokens>, output: <answer tokens>, input: <optional input cap> }", id)
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
