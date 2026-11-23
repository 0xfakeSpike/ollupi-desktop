package config

import (
	"os"
	"path/filepath"
	"slices"
	"testing"

	"github.com/0xfakeSpike/ollupi/agent"
	"github.com/0xfakeSpike/ollupi/skill"
)

func TestTemplateParses(t *testing.T) {
	cfg, err := Parse([]byte(Template))
	if err != nil {
		t.Fatal(err)
	}
	p := cfg.Models[0]
	if ID(p.Provider, p.Names[0].Name) != "openai/gpt-5.2" {
		t.Fatalf("default model = %s/%s", p.Provider, p.Names[0].Name)
	}
	if !cfg.Workspace.Enabled || cfg.Workspace.SandboxMode != "workspace-write" || cfg.Memory.Model != "" {
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
	// The main agent has them on a model of either size.
	for _, r := range []agent.Name{agent.FullMain, agent.CompactMain} {
		list, err := skill.Load(cfg.SkillsDir, string(r))
		if err != nil {
			t.Fatal(err)
		}
		if names := skillNames(list); !slices.Contains(names, "zhou-shenghua-woodcut-style") {
			t.Fatalf("%s's starter skills = %v", r, names)
		}
	}

	// Later starts leave the folder to the user.
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

func TestSameModelAtTwoProviders(t *testing.T) {
	raw := "name: x\nmodels:\n" +
		"  - {provider: a, type: openai, names: [{name: deepseek-flash, calls: 2, limits: {context: 1000, output: 100}}]}\n" +
		"  - {provider: b, type: openai, names: [{name: deepseek-flash, calls: 8, limits: {context: 1000, output: 100}}]}\n" +
		"memory: {model: b/deepseek-flash}\n"
	cfg, err := Parse([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Models[1].Names[0].Calls != 8 || cfg.Memory.Model != "b/deepseek-flash" {
		t.Fatalf("unexpected config: %+v", cfg)
	}
}

func TestValidateRejects(t *testing.T) {
	one := "models: [{provider: p, type: openai, names: [{name: m, limits: {context: 1000, output: 100}}]}]\n"
	cases := map[string]string{
		"no models":           "name: x\nmodels: []\n",
		"provider no models":  "name: x\nmodels: [{provider: p, type: openai, names: []}]\n",
		"provider no name":    "name: x\nmodels: [{names: [{name: m, limits: {context: 1000, output: 100}}]}]\n",
		"provider with /":     "name: x\nmodels: [{provider: a/b, type: openai, names: [{name: m, limits: {context: 1000, output: 100}}]}]\n",
		"provider twice":      "name: x\nmodels: [{provider: p, type: openai, names: [{name: m, limits: {context: 1000, output: 100}}]}, {provider: p, type: openai, names: [{name: n, limits: {context: 1000, output: 100}}]}]\n",
		"model twice":         "name: x\nmodels: [{provider: p, type: openai, names: [{name: m, limits: {context: 1000, output: 100}}, {name: m, limits: {context: 1000, output: 100}}]}]\n",
		"no limits":           "name: x\nmodels: [{provider: p, type: openai, names: [{name: m}]}]\n",
		"provider no type":    "name: x\nmodels: [{provider: p, names: [{name: m, limits: {context: 1000, output: 100}}]}]\n",
		"provider bad type":   "name: x\nmodels: [{provider: p, type: claude, names: [{name: m, limits: {context: 1000, output: 100}}]}]\n",
		"negative calls":      "name: x\nmodels: [{provider: p, type: openai, names: [{name: m, calls: -1, limits: {context: 1000, output: 100}}]}]\n",
		"memory on in file":   "name: x\n" + one + "memory: {use: true}\n",
		"permissions in file": "name: x\n" + one + "permissions: {approval: never}\n",
		"mcp in file":         "name: x\n" + one + "mcp: [{name: fs, command: npx}]\n",
		"memory bad model":    "name: x\n" + one + "memory: {model: p/other}\n",
		"memory bare name":    "name: x\n" + one + "memory: {model: m}\n",
		"unknown key":         "name: x\n" + one + "modle: 1\n",
		"old settings key":    "name: x\n" + one + "settings: {approvalPolicy: never}\n",
		"negative slots":      "name: x\n" + one + "slots: -1\n",
		"feishu no secret":    "name: x\n" + one + "feishu: {app_id: cli_x}\n",
		"feishu bad domain":   "name: x\n" + one + "feishu: {app_id: cli_x, app_secret: s, domain: slack}\n",
		"feishu no profile":   "name: x\n" + one + "feishu: {app_id: cli_x, app_secret: s}\n",
	}
	for name, raw := range cases {
		if _, err := Parse([]byte(raw)); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
}

func TestLoadFileResolvesPaths(t *testing.T) {
	home := t.TempDir()
	raw := "name: x\n" +
		"models: [{provider: p, type: openai, names: [{name: m, limits: {context: 1000, output: 100}}]}]\n" +
		"skills_dir: skills\n" +
		"workspace: {enabled: true, workspace_dirs: [~/.ollupi/scratch, scratch]}\n" +
		"feishu: {app_id: cli_x, app_secret: s, profile: default, workspace: super-agent}\n"
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
