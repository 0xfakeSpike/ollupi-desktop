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
	if err != nil || cfg.Name != "ollupi" {
		t.Fatalf("unexpected config: %+v, %v", cfg, err)
	}
	if _, _, found, _ := Providers([]byte(Template)); found {
		t.Fatal("the template lists providers")
	}
	if _, _, _, found, _ := Legacy([]byte(Template)); found {
		t.Fatal("the template declares profiles")
	}
	if _, found, _ := Workspace([]byte(Template)); found {
		t.Fatal("the template has a workspace block")
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
	if _, err := LoadFile(path); err == nil || !strings.Contains(err.Error(), "--import-config") {
		t.Fatalf("want a refusal naming --import-config, got %v", err)
	}
}

func TestValidateRejects(t *testing.T) {
	cases := map[string]string{
		"no name":        "prompt: hi\n",
		"negative slots": plain + "slots: -1\n",
		"unknown key":    plain + "modle: 1\n",
	}
	for name, raw := range cases {
		if _, err := Parse([]byte(raw)); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
}

func TestProvidersAreTakenOutOfAnOlderConfig(t *testing.T) {
	raw := []byte("name: x\n\n# The models.\nproviders:\n  - id: deep\n    type: openai\n    base_url: https://api.deepseek.com\n    api_key: sk-d\n    models:\n      - name: flash\n        calls: 2\n        limits: {context: 1000, output: 100, input: 800}\n\n# kept\nslots: 4\n")
	catalog, rest, found, err := Providers(raw)
	if err != nil || !found {
		t.Fatalf("found = %v, err = %v", found, err)
	}
	if len(catalog) != 1 || catalog[0].ID != "deep" || catalog[0].APIKey != "sk-d" || catalog[0].Models[0].Calls != 2 || catalog[0].Models[0].Limits.MaxInput != 800 {
		t.Fatalf("catalog %+v", catalog)
	}
	if strings.Contains(string(rest), "providers") || strings.Contains(string(rest), "The models") || !strings.Contains(string(rest), "# kept") {
		t.Fatalf("rest = %q", rest)
	}
	if cfg, err := Parse(rest); err != nil || cfg.Slots != 4 {
		t.Fatalf("rest parses to %+v, %v", cfg, err)
	}
	for name, bad := range map[string]string{
		"twice":     "providers: [{id: p, type: openai, models: [{name: m, limits: {context: 1000, output: 100}}]}, {id: p, type: openai, models: [{name: n, limits: {context: 1000, output: 100}}]}]\n",
		"slash":     "providers: [{id: a/b, type: openai, models: [{name: m, limits: {context: 1000, output: 100}}]}]\n",
		"bad type":  "providers: [{id: p, type: claude, models: [{name: m, limits: {context: 1000, output: 100}}]}]\n",
		"no limits": "providers: [{id: p, type: openai, models: [{name: m}]}]\n",
		"unknown":   "providers: [{id: p, type: openai, key: k, models: [{name: m, limits: {context: 1000, output: 100}}]}]\n",
	} {
		if _, _, _, err := Providers([]byte(plain + bad)); err == nil {
			t.Errorf("%s: taken", name)
		}
	}
	path := filepath.Join(t.TempDir(), FileName)
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadFile(path); err == nil || !strings.Contains(err.Error(), "--import-config") {
		t.Fatalf("want a refusal naming --import-config, got %v", err)
	}
}

func TestWorkspaceIsTakenOutOfAnOlderConfig(t *testing.T) {
	raw := []byte("name: x\n\n# Commands and file edits, in the sandbox.\nworkspace:\n  enabled: true\n  sandbox_mode: workspace-write\n  network: false\n\n# kept\nslots: 4\n")
	rest, found, err := Workspace(raw)
	if err != nil || !found {
		t.Fatalf("found = %v, err = %v", found, err)
	}
	if strings.Contains(string(rest), "workspace") || strings.Contains(string(rest), "sandbox") || !strings.Contains(string(rest), "# kept") {
		t.Fatalf("rest = %q", rest)
	}
	cfg, err := Parse(rest)
	if err != nil || cfg.Slots != 4 {
		t.Fatalf("rest parses to %+v, %v", cfg, err)
	}
	if _, found, _ := Workspace(rest); found {
		t.Fatal("the rest still has a workspace block")
	}
}

func TestLoadFileRefusesAWorkspaceBlock(t *testing.T) {
	path := filepath.Join(t.TempDir(), FileName)
	if err := os.WriteFile(path, []byte(plain+"workspace: {enabled: true}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadFile(path); err == nil || !strings.Contains(err.Error(), "--import-config") {
		t.Fatalf("want a refusal naming --import-config, got %v", err)
	}
}

func TestLegacyGathersEveryProfilesModelsIntoTheProviders(t *testing.T) {
	const tail = "# kept\nslots: 4\n"
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
			profiles:  []LegacyProfile{{ID: "default", Name: "Me", Model: "openai/b", LearnModel: "openai/a"}, {ID: "work", Model: "openai/a"}},
			providers: map[string][]string{"openai": {"a", "b"}}},
	}
	for name, c := range cases {
		got, catalog, rest, found, err := Legacy([]byte(c.raw))
		if err != nil || !found {
			t.Fatalf("%s: found %v, %v", name, found, err)
		}
		if !slices.Equal(got, c.profiles) {
			t.Fatalf("%s: profiles %+v, want %+v", name, got, c.profiles)
		}
		cfg, err := Parse(rest)
		if err != nil || cfg.Slots != 4 || !strings.Contains(string(rest), "# kept") {
			t.Fatalf("%s: the rest %q parses as %+v, %v", name, rest, cfg, err)
		}
		served := map[string][]string{}
		if strings.Contains(string(rest), "providers") {
			t.Fatalf("%s: the rest lists providers:\n%s", name, rest)
		}
		for _, p := range catalog {
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
		if _, _, _, again, _ := Legacy(rest); again {
			t.Fatalf("%s: the rest still declares profiles", name)
		}
	}
	// Every setting of a model and its account comes through.
	_, catalog, rest, _, _ := Legacy([]byte(cases["beta.2"].raw))
	p := catalog[0]
	if p.APIKey != "sk-a" || p.Models[0].Calls != 2 || p.Models[1].Thinking == nil || *p.Models[1].Thinking || p.Models[1].Limits.MaxInput != 1500 {
		t.Fatalf("provider %+v", p)
	}
	if !strings.Contains(string(rest), "prompt: hi") {
		t.Fatalf("the rest lost the prompt:\n%s", rest)
	}
}

func TestLoadFileTellsAnOlderConfigToBeImported(t *testing.T) {
	home := t.TempDir()
	path := filepath.Join(home, FileName)
	old := "name: x\nmodels: [{provider: p, type: openai, names: [{name: m, limits: {context: 1000, output: 100}}]}]\n"
	if err := os.WriteFile(path, []byte(old), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadFile(path); err == nil || !strings.Contains(err.Error(), "--import-config") {
		t.Fatalf("loaded an older config: %v", err)
	}
}
