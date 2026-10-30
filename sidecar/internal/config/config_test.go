package config

import (
	"strings"
	"testing"
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
