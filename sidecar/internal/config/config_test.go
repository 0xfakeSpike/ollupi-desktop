package config

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

)

const plain = "name: x\n"

func TestTemplateParses(t *testing.T) {
	cfg, err := Parse([]byte(Template))
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.Providers) != 1 || cfg.Providers[0].ID != "openai" || !cfg.Workspace.Enabled || cfg.Workspace.SandboxMode != "workspace-write" {
		t.Fatalf("unexpected config: %+v", cfg)
	}
	if _, _, found, _ := Legacy([]byte(Template)); found {
		t.Fatal("the template declares profiles")
	}
}

func TestSkillsDirIsTakenOutOfAnOlderConfig(t *testing.T) {
	raw := []byte("name: x\n\n# Agent Skills: a folder.\nskills_dir: skills\n\n# kept\nslots: 4\n")
	dir, rest, found, err := SkillsDir(raw, "/home/me/.ollupi")
	if err != nil || !found {
		t.Fatalf("found = %v, err = %v", found, err)
	}
	if dir != filepath.Join("/home/me/.ollupi", "skills") {
		t.Fatalf("dir = %s", dir)
	}
	if strings.Contains(string(rest), "skills") || !strings.Contains(string(rest), "# kept") {
		t.Fatalf("rest = %q", rest)
	}
	cfg, err := Parse(rest)
	if err != nil || cfg.Slots != 4 {
		t.Fatalf("rest parses to %+v, %v", cfg, err)
	}
	if _, _, found, _ := SkillsDir([]byte(Template), "/h"); found {
		t.Fatal("the template names a skills_dir")
	}
}

func TestLoadFileRefusesASkillsDir(t *testing.T) {
	home := t.TempDir()
	path := filepath.Join(home, FileName)
	if err := os.WriteFile(path, []byte(plain+"skills_dir: skills\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadFile(path, home); err == nil || !strings.Contains(err.Error(), "--import-config") {
		t.Fatalf("want a refusal naming --import-config, got %v", err)
	}
}

func TestValidateRejects(t *testing.T) {
	cases := map[string]string{
		"no name":             "prompt: hi\n",
		"provider twice":      plain + "providers: [{id: p, type: openai, models: [{name: m, limits: {context: 1000, output: 100}}]}, {id: p, type: openai, models: [{name: n, limits: {context: 1000, output: 100}}]}]\n",
		"provider with slash": plain + "providers: [{id: a/b, type: openai, models: [{name: m, limits: {context: 1000, output: 100}}]}]\n",
		"provider bad type":   plain + "providers: [{id: p, type: claude, models: [{name: m, limits: {context: 1000, output: 100}}]}]\n",
		"model no limits":     plain + "providers: [{id: p, type: openai, models: [{name: m}]}]\n",
		"negative slots":      plain + "slots: -1\n",
		"unknown key":         plain + "modle: 1\n",
	}
	for name, raw := range cases {
		if _, err := Parse([]byte(raw)); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
}

func TestLoadFileResolvesPaths(t *testing.T) {
	home := t.TempDir()
	raw := plain + `workspace: {enabled: true, workspace_dirs: [~/.ollupi/scratch, scratch]}
`
	path := filepath.Join(home, FileName)
	if err := os.WriteFile(path, []byte(raw), 0o600); err != nil {
		t.Fatal(err)
	}
	cfg, err := LoadFile(path, home)
	if err != nil {
		t.Fatal(err)
	}
	user, err := os.UserHomeDir()
	if err != nil {
		t.Fatal(err)
	}
	dirs := cfg.Workspace.WorkspaceDirs
	if len(dirs) != 2 || dirs[0] != filepath.Join(user, ".ollupi", "scratch") || dirs[1] != filepath.Join(home, "scratch") {
		t.Errorf("workspace_dirs = %v", dirs)
	}
}

func TestLegacyGathersEveryProfilesModelsIntoTheProviders(t *testing.T) {
	const tail = "# the workspace\nworkspace: {enabled: true}\n"
	cases := map[string]struct {
		raw       string
		profiles  []LegacyProfile
		providers map[string][]string
	}{
		"beta.2": {raw: `name: x
prompt: hi
models:
  - provider: DeepSeek 官方
    type: openai
    api_key: sk-a
    names:
      - name: chat
        calls: 2
        limits: { context: 1000, output: 100 }
      - name: reasoner
        thinking: false
        limits: { context: 2000, output: 200, input: 1500 }
memory: { model: DeepSeek 官方/reasoner }
` + tail,
			profiles:  []LegacyProfile{{ID: "default", Model: "DeepSeek 官方/chat", LearnModel: "DeepSeek 官方/reasoner"}},
			providers: map[string][]string{"DeepSeek 官方": {"chat", "reasoner"}}},
		"beta.3": {raw: `name: x
profiles:
  - id: default
    models:
      - provider: p
        type: anthropic
        api_key: k
        names: [{ name: m, limits: { context: 1000, output: 100 } }]
  - id: work
    models:
      - provider: p
        type: anthropic
        api_key: other
        names: [{ name: m, limits: { context: 1000, output: 100 } }]
      - provider: q
        type: openai
        names: [{ name: n, limits: { context: 1000, output: 100 } }]
    memory: { model: q/n }
  - id: home
    models:
      - provider: p
        type: anthropic
        api_key: k
        names: [{ name: extra, limits: { context: 1000, output: 100 } }]
` + tail,
			profiles: []LegacyProfile{{ID: "default", Model: "p/m"}, {ID: "work", Model: "p-2/m", LearnModel: "q/n"}, {ID: "home", Model: "p/extra"}},
			// work's p is another account, so it is renamed; home's p is
			// default's, so its model joins it.
			providers: map[string][]string{"p": {"m", "extra"}, "p-2": {"m"}, "q": {"n"}}},
		"beta.4": {raw: `schema_version: 2
name: x
credentials:
  - id: openai
    type: openai
    api_key: sk-o
    models:
      - { name: a, limits: { context: 1000, output: 100 } }
      - { name: b, limits: { context: 1000, output: 100 } }
profiles:
  - id: default
    name: Me
    color: teal
    models: [openai/b, openai/a]
    memory: { model: openai/a }
  - id: work
    models: [openai/a]
` + tail,
			profiles:  []LegacyProfile{{ID: "default", Name: "Me", Color: "teal", Model: "openai/b", LearnModel: "openai/a"}, {ID: "work", Model: "openai/a"}},
			providers: map[string][]string{"openai": {"a", "b"}}},
	}
	for name, c := range cases {
		got, rest, found, err := Legacy([]byte(c.raw))
		if err != nil || !found {
			t.Fatalf("%s: found %v, %v", name, found, err)
		}
		if !slices.Equal(got, c.profiles) {
			t.Fatalf("%s: profiles %+v, want %+v", name, got, c.profiles)
		}
		cfg, err := Parse(rest)
		if err != nil || !cfg.Workspace.Enabled || !strings.Contains(string(rest), "# the workspace") {
			t.Fatalf("%s: the rest %q parses as %+v, %v", name, rest, cfg, err)
		}
		served := map[string][]string{}
		for _, p := range cfg.Providers {
			for _, m := range p.Models {
				served[p.ID] = append(served[p.ID], m.Name)
			}
		}
		if len(served) != len(c.providers) {
			t.Fatalf("%s: providers %v, want %v", name, served, c.providers)
		}
		for id, models := range c.providers {
			if !slices.Equal(served[id], models) {
				t.Fatalf("%s: providers %v, want %v", name, served, c.providers)
			}
		}
		if _, _, again, _ := Legacy(rest); again {
			t.Fatalf("%s: the rest still declares profiles", name)
		}
	}
	// Every setting of a model and its account comes through.
	_, rest, _, _ := Legacy([]byte(cases["beta.2"].raw))
	cfg, _ := Parse(rest)
	p := cfg.Providers[0]
	if p.APIKey != "sk-a" || p.Models[0].Calls != 2 || p.Models[1].Thinking == nil || *p.Models[1].Thinking || p.Models[1].Limits.MaxInput != 1500 {
		t.Fatalf("provider %+v", p)
	}
	if strings.Index(string(rest), "providers:") < strings.Index(string(rest), "prompt: hi") {
		t.Fatalf("providers come before the prompt:\n%s", rest)
	}
}

func TestLoadFileTellsAnOlderConfigToBeImported(t *testing.T) {
	home := t.TempDir()
	path := filepath.Join(home, FileName)
	old := "name: x\nmodels: [{provider: p, type: openai, names: [{name: m, limits: {context: 1000, output: 100}}]}]\n"
	if err := os.WriteFile(path, []byte(old), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadFile(path, home); err == nil || !strings.Contains(err.Error(), "--import-config") {
		t.Fatalf("loaded an older config: %v", err)
	}
}
