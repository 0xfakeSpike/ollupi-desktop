package config

import (
	"os"
	"path/filepath"
	"slices"
	"testing"

	"github.com/0xfakeSpike/ollupi/agent"
	"github.com/0xfakeSpike/ollupi/skill"
)

const oneCredential = `schema_version: 2
name: x
credentials:
  - id: p
    type: openai
    models:
      - name: m
        limits: { context: 1000, output: 100 }
profiles:
  - id: default
    models: [p/m]
`

func TestTemplateParses(t *testing.T) {
	cfg, err := Parse([]byte(Template))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.SchemaVersion != SchemaVersion || !slices.Equal(cfg.Profiles[0].Models, []string{"openai/gpt-5.2"}) {
		t.Fatalf("unexpected config: %+v", cfg)
	}
	if !cfg.Workspace.Enabled || cfg.Workspace.SandboxMode != "workspace-write" || cfg.Profiles[0].Memory.Model != "" {
		t.Fatalf("unexpected config: %+v", cfg)
	}
}

func TestFirstLoadWritesStarterSkills(t *testing.T) {
	home := t.TempDir()
	kept := filepath.Join(home, "skills", string(agent.FullMain), "zhou-shenghua-woodcut-style", "SKILL.md")
	cfg, err := Load(home)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.SkillsDir != filepath.Join(home, "skills") {
		t.Fatalf("skills_dir = %s", cfg.SkillsDir)
	}
	for _, r := range []agent.Name{agent.FullMain, agent.CompactMain} {
		list, err := skill.Load(cfg.SkillsDir, string(r))
		if err != nil {
			t.Fatal(err)
		}
		if names := skillNames(list); !slices.Contains(names, "zhou-shenghua-woodcut-style") {
			t.Fatalf("%s's starter skills = %v", r, names)
		}
	}
	if err := os.WriteFile(kept, []byte("edited"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Load(home); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(kept); string(b) != "edited" {
		t.Fatalf("SKILL.md = %q", b)
	}
}

func skillNames(all []skill.Skill) []string {
	var names []string
	for _, s := range all {
		names = append(names, s.Name)
	}
	return names
}

func TestProfilesShareAModelButNotItsSelection(t *testing.T) {
	raw := `schema_version: 2
name: x
credentials:
  - id: a
    type: openai
    api_key: k1
    models:
      - name: m
        calls: 2
        limits: { context: 1000, output: 100 }
  - id: b
    type: openai
    api_key: k2
    models:
      - name: m
        calls: 8
        limits: { context: 1000, output: 100 }
profiles:
  - id: one
    models: [a/m, b/m]
    memory: { model: b/m }
  - id: two
    models: [b/m]
`
	cfg, err := Parse([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Credentials[1].Models[0].Calls != 8 || cfg.Profiles[0].Memory.Model != "b/m" || !slices.Equal(cfg.Profiles[1].Models, []string{"b/m"}) {
		t.Fatalf("unexpected config: %+v", cfg)
	}
}

func TestValidateRejects(t *testing.T) {
	cases := map[string]string{
		"no version":          "name: x\ncredentials: []\nprofiles: []\n",
		"no credentials":      "schema_version: 2\nname: x\nprofiles: [{id: default, models: [p/m]}]\n",
		"no profiles":         "schema_version: 2\nname: x\ncredentials: [{id: p, type: openai, models: [{name: m, limits: {context: 1000, output: 100}}]}]\nprofiles: []\n",
		"profile no models":   "schema_version: 2\nname: x\ncredentials: [{id: p, type: openai, models: [{name: m, limits: {context: 1000, output: 100}}]}]\nprofiles: [{id: default}]\n",
		"credential no model": "schema_version: 2\nname: x\ncredentials: [{id: p, type: openai, models: []}]\nprofiles: [{id: default, models: [p/m]}]\n",
		"credential bad type": "schema_version: 2\nname: x\ncredentials: [{id: p, type: claude, models: [{name: m, limits: {context: 1000, output: 100}}]}]\nprofiles: [{id: default, models: [p/m]}]\n",
		"negative calls":      "schema_version: 2\nname: x\ncredentials: [{id: p, type: openai, models: [{name: m, calls: -1, limits: {context: 1000, output: 100}}]}]\nprofiles: [{id: default, models: [p/m]}]\n",
		"unknown model":       "schema_version: 2\nname: x\ncredentials: [{id: p, type: openai, models: [{name: m, limits: {context: 1000, output: 100}}]}]\nprofiles: [{id: default, models: [p/other]}]\n",
		"model twice":         "schema_version: 2\nname: x\ncredentials: [{id: p, type: openai, models: [{name: m, limits: {context: 1000, output: 100}}]}]\nprofiles: [{id: default, models: [p/m, p/m]}]\n",
		"memory bad model":    "schema_version: 2\nname: x\ncredentials: [{id: p, type: openai, models: [{name: m, limits: {context: 1000, output: 100}}]}]\nprofiles: [{id: default, models: [p/m], memory: {model: p/other}}]\n",
		"profile bad id":      "schema_version: 2\nname: x\ncredentials: [{id: p, type: openai, models: [{name: m, limits: {context: 1000, output: 100}}]}]\nprofiles: [{id: a/b, models: [p/m]}]\n",
		"profile bad color":   "schema_version: 2\nname: x\ncredentials: [{id: p, type: openai, models: [{name: m, limits: {context: 1000, output: 100}}]}]\nprofiles: [{id: default, color: red, models: [p/m]}]\n",
		"same account twice":  "schema_version: 2\nname: x\ncredentials: [{id: a, type: openai, api_key: k, models: [{name: m, limits: {context: 1000, output: 100}}]}, {id: b, type: openai, api_key: k, models: [{name: n, limits: {context: 1000, output: 100}}]}]\nprofiles: [{id: default, models: [a/m]}]\n",
		"newer version":       "schema_version: 3\nname: x\n",
		"unknown key":         oneCredential + "modle: 1\n",
		"feishu no profile":   oneCredential + "feishu: {app_id: cli_x, app_secret: s}\n",
		"feishu unknown user": oneCredential + "feishu: {app_id: cli_x, app_secret: s, profile: default, users: [ou_a], profiles: {ou_a: work}}\n",
	}
	for name, raw := range cases {
		if _, err := Parse([]byte(raw)); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
}

func TestLoadFileResolvesPaths(t *testing.T) {
	home := t.TempDir()
	raw := oneCredential + `skills_dir: skills
workspace: {enabled: true, workspace_dirs: [~/.ollupi/scratch, scratch]}
feishu: {app_id: cli_x, app_secret: s, profile: default, workspace: super-agent}
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
	if want := filepath.Join(home, "skills"); cfg.SkillsDir != want {
		t.Errorf("skills_dir = %s, want %s", cfg.SkillsDir, want)
	}
	if want := filepath.Join(home, "super-agent"); cfg.Feishu.Workspace != want {
		t.Errorf("feishu.workspace = %s, want %s", cfg.Feishu.Workspace, want)
	}
	dirs := cfg.Workspace.WorkspaceDirs
	if len(dirs) != 2 || dirs[0] != filepath.Join(user, ".ollupi", "scratch") || dirs[1] != filepath.Join(home, "scratch") {
		t.Errorf("workspace_dirs = %v", dirs)
	}
}

func TestUpgradeSharesOneAccountAcrossProfiles(t *testing.T) {
	old := `name: x
profiles:
  - id: default
    models:
      - provider: deepseek
        type: openai
        api_key: sk-a
        names:
          - name: flash
            limits: { context: 1000, output: 100 }
    memory: { model: deepseek/flash }
  - id: work
    models:
      - provider: ds
        type: openai
        api_key: sk-a
        names:
          - name: flash
            limits: { context: 1000, output: 100 }
          - name: pro
            limits: { context: 2000, output: 200 }
      - provider: deepseek
        type: openai
        api_key: sk-b
        names:
          - name: flash
            limits: { context: 1000, output: 100 }
    memory: { model: ds/pro }
`
	raw, changed, err := Upgrade([]byte(old))
	if err != nil || !changed {
		t.Fatalf("Upgrade = changed %v, %v", changed, err)
	}
	cfg, err := Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.Credentials) != 2 || cfg.Credentials[0].ID != "deepseek" || len(cfg.Credentials[0].Models) != 2 || cfg.Credentials[1].ID != "deepseek-2" {
		t.Fatalf("credentials: %+v", cfg.Credentials)
	}
	work := cfg.Profiles[1]
	if !slices.Equal(work.Models, []string{"deepseek/flash", "deepseek/pro", "deepseek-2/flash"}) || work.Memory.Model != "deepseek/pro" {
		t.Fatalf("work: %+v", work)
	}
	if _, changed, err := Upgrade(raw); changed || err != nil {
		t.Fatalf("upgrading twice: changed %v, %v", changed, err)
	}
}

func TestUpgradeMovesTheSingleModelsListIntoTheDefaultProfile(t *testing.T) {
	raw, _, err := Upgrade([]byte(`name: x
models:
  - provider: p
    type: openai
    names:
      - name: m
        limits: { context: 1000, output: 100 }
memory: { model: p/m }
`))
	if err != nil {
		t.Fatal(err)
	}
	cfg, err := Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.Profiles) != 1 || cfg.Profiles[0].ID != "default" || cfg.Profiles[0].Memory.Model != "p/m" {
		t.Fatalf("profiles: %+v", cfg.Profiles)
	}
}

func TestLoadUpgradesTheFileOnceAndKeepsTheOldOne(t *testing.T) {
	home := t.TempDir()
	path := filepath.Join(home, FileName)
	old := "name: x\nmodels: [{provider: p, type: openai, names: [{name: m, limits: {context: 1000, output: 100}}]}]\n"
	if err := os.WriteFile(path, []byte(old), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := Load(home); err != nil {
		t.Fatal(err)
	}
	kept, err := os.ReadFile(path + ".pre-v2")
	if err != nil || string(kept) != old {
		t.Fatalf("backup = %q, %v", kept, err)
	}
	if _, err := LoadFile(path, home); err != nil {
		t.Fatal(err)
	}
}

func TestFeishuNamesEachHolderAProfile(t *testing.T) {
	raw := oneCredential + `  - id: work
    models: [p/m]
feishu: {app_id: cli_x, app_secret: s, profile: default, users: [ou_a, ou_b], profiles: {ou_a: default, ou_b: work}}
`
	cfg, err := Parse([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Feishu.Profiles["ou_b"] != "work" || cfg.Feishu.Profiles["ou_a"] != "default" {
		t.Fatalf("profiles = %v", cfg.Feishu.Profiles)
	}
}

func TestRemoveProfileRejectsReferencesAndKeepsAnother(t *testing.T) {
	raw := []byte(oneCredential + `  - id: work
    models: [p/m]
feishu: {app_id: cli_x, app_secret: s, profile: work}
`)
	if _, err := RemoveProfile(raw, "work"); err == nil {
		t.Fatal("removed the Feishu profile")
	}
	plain := []byte(oneCredential + "  - id: work\n    models: [p/m]\n")
	out, err := RemoveProfile(plain, "work")
	if err != nil {
		t.Fatal(err)
	}
	cfg, err := Parse(out)
	if err != nil || len(cfg.Profiles) != 1 || cfg.Profiles[0].ID != "default" {
		t.Fatalf("profiles = %+v, %v", cfg.Profiles, err)
	}
	if _, err := RemoveProfile(out, "default"); err == nil {
		t.Fatal("removed the last profile")
	}
}
