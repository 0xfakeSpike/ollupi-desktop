package config

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/0xfakeSpike/ollupi/agent/role"
	"github.com/0xfakeSpike/ollupi/repo/skills"
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
	if !cfg.Workspace.Enabled || cfg.Workspace.SandboxMode != "workspace-write" || cfg.Permissions.Settings().ApprovalPolicy != "on-request" {
		t.Fatalf("unexpected config: %+v", cfg)
	}
}

func TestFirstLoadWritesStarterSkills(t *testing.T) {
	home := t.TempDir()
	kept := filepath.Join(home, "skills", string(role.FullMain), "zhou-shenghua-woodcut-style", "SKILL.md")
	cfg, err := Load(home)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.SkillsDir != filepath.Join(home, "skills") {
		t.Fatalf("skills_dir = %s", cfg.SkillsDir)
	}
	// The main agent has them on a model of either size.
	for _, r := range []role.Name{role.FullMain, role.CompactMain} {
		list, err := skills.Load(cfg.SkillsDir, string(r))
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

func skillNames(all []skills.Skill) []string {
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
		"memory: {generate: true, model: b/deepseek-flash}\n"
	cfg, err := Parse([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Models[1].Names[0].Calls != 8 || cfg.Memory.Model != "b/deepseek-flash" {
		t.Fatalf("unexpected config: %+v", cfg)
	}
}

func TestMCPServers(t *testing.T) {
	t.Setenv("MCP_TEST_TOKEN", "s3cret")
	raw := "name: x\nmodels: [{provider: p, type: openai, names: [{name: m, limits: {context: 1000, output: 100}}]}]\nmcp:\n" +
		"  - {name: fs, command: npx, args: [-y, server], env: {ROOT: /tmp, KEY: '${MCP_TEST_TOKEN}'}}\n" +
		"  - {name: gh, url: 'https://example.test/mcp', headers: {Authorization: 'Bearer ${MCP_TEST_TOKEN}', X-Team: literal}}\n"
	cfg, err := Parse([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	if got, err := Expand(cfg.MCP[1].Headers["Authorization"]); err != nil || got != "Bearer s3cret" {
		t.Fatalf("Expand = %q, %v", got, err)
	}
	if _, err := Expand("${MCP_TEST_UNSET_VARIABLE}"); err == nil {
		t.Fatal("expected an unset variable to be refused")
	}
	fs, gh := cfg.MCP[0].Redacted(), cfg.MCP[1].Redacted()
	if fs.Env["ROOT"] != "" || fs.Env["KEY"] != "${MCP_TEST_TOKEN}" || gh.Headers["X-Team"] != "" || gh.Headers["Authorization"] != "Bearer ${MCP_TEST_TOKEN}" {
		t.Fatalf("Redacted = %+v %+v", fs, gh)
	}
	if cfg.MCP[0].Env["ROOT"] != "/tmp" {
		t.Fatal("Redacted changed the config it was called on")
	}
}

func TestValidateRejects(t *testing.T) {
	one := "models: [{provider: p, type: openai, names: [{name: m, limits: {context: 1000, output: 100}}]}]\n"
	cases := map[string]string{
		"no models":          "name: x\nmodels: []\n",
		"provider no models": "name: x\nmodels: [{provider: p, type: openai, names: []}]\n",
		"provider no name":   "name: x\nmodels: [{names: [{name: m, limits: {context: 1000, output: 100}}]}]\n",
		"provider with /":    "name: x\nmodels: [{provider: a/b, type: openai, names: [{name: m, limits: {context: 1000, output: 100}}]}]\n",
		"provider twice":     "name: x\nmodels: [{provider: p, type: openai, names: [{name: m, limits: {context: 1000, output: 100}}]}, {provider: p, type: openai, names: [{name: n, limits: {context: 1000, output: 100}}]}]\n",
		"model twice":        "name: x\nmodels: [{provider: p, type: openai, names: [{name: m, limits: {context: 1000, output: 100}}, {name: m, limits: {context: 1000, output: 100}}]}]\n",
		"no limits":          "name: x\nmodels: [{provider: p, type: openai, names: [{name: m}]}]\n",
		"provider no type":   "name: x\nmodels: [{provider: p, names: [{name: m, limits: {context: 1000, output: 100}}]}]\n",
		"provider bad type":  "name: x\nmodels: [{provider: p, type: claude, names: [{name: m, limits: {context: 1000, output: 100}}]}]\n",
		"negative calls":     "name: x\nmodels: [{provider: p, type: openai, names: [{name: m, calls: -1, limits: {context: 1000, output: 100}}]}]\n",
		"memory needs model": "name: x\n" + one + "memory: {generate: true}\n",
		"memory bad model":   "name: x\n" + one + "memory: {model: p/other}\n",
		"memory bare name":   "name: x\n" + one + "memory: {model: m}\n",
		"unknown key":        "name: x\n" + one + "modle: 1\n",
		"old settings key":   "name: x\n" + one + "settings: {approvalPolicy: never}\n",
		"negative slots":     "name: x\n" + one + "slots: -1\n",
		"feishu no secret":   "name: x\n" + one + "feishu: {app_id: cli_x}\n",
		"feishu bad domain":  "name: x\n" + one + "feishu: {app_id: cli_x, app_secret: s, domain: slack}\n",
	}
	for name, raw := range cases {
		if _, err := Parse([]byte(raw)); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
}

func TestBrowserNameIsTaken(t *testing.T) {
	raw := "name: x\nmodels: [{provider: p, type: openai, names: [{name: m, limits: {context: 1000, output: 100}}]}]\nmcp: [{name: browser, url: 'https://example.test/mcp'}]\n"
	if _, err := Parse([]byte(raw)); err == nil || !strings.Contains(err.Error(), "built-in browser") {
		t.Fatalf("err = %v", err)
	}
}

func TestLoadMovesFlatSkillsToTheMainAgent(t *testing.T) {
	home := t.TempDir()
	if err := os.WriteFile(filepath.Join(home, FileName), []byte(Template), 0o600); err != nil {
		t.Fatal(err)
	}
	dir := filepath.Join(home, "skills")
	write := func(path, text string) {
		t.Helper()
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	skill := func(name string) string { return "---\nname: " + name + "\ndescription: Says hello.\n---\n\nDo it.\n" }
	write(filepath.Join(dir, "say-hello", "SKILL.md"), skill("say-hello"))
	write(filepath.Join(dir, "say-hello", "references", "a.md"), "detail")
	// One the main agent has already stays where it is, for ollupi to refuse.
	write(filepath.Join(dir, "taken", "SKILL.md"), skill("taken"))
	write(filepath.Join(dir, string(role.FullMain), "taken", "SKILL.md"), skill("taken"))

	if _, err := Load(home); err != nil {
		t.Fatal(err)
	}
	for _, r := range []role.Name{role.FullMain, role.CompactMain} {
		list, err := skills.Load(dir, string(r))
		if err != nil {
			t.Fatal(err)
		}
		if names := skillNames(list); !slices.Contains(names, "say-hello") {
			t.Fatalf("%s's skills = %v", r, names)
		}
		if b, _ := os.ReadFile(filepath.Join(dir, string(r), "say-hello", "references", "a.md")); string(b) != "detail" {
			t.Fatalf("%s's copy lost its files", r)
		}
	}
	if _, err := os.Stat(filepath.Join(dir, "say-hello")); !os.IsNotExist(err) {
		t.Fatal("the flat skill is still there")
	}
	if _, err := os.Stat(filepath.Join(dir, "taken", "SKILL.md")); err != nil {
		t.Fatal("a skill the main agent had was moved over it")
	}
	if entries, _ := os.ReadDir(filepath.Join(dir, string(role.CompactMain))); len(entries) != 1 {
		t.Fatalf("compact-main-agent holds %v", entries)
	}
}
