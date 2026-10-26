package config

import "testing"

func TestTemplateParses(t *testing.T) {
	cfg, err := Parse([]byte(Template))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Models[0].ID != "gpt-5.2" || cfg.Models[0].LLM().Connection != "gpt-5.2" {
		t.Fatalf("default model = %+v", cfg.Models[0])
	}
	if !cfg.Shell.Enabled || cfg.Shell.SandboxMode != "workspace-write" || cfg.Settings.ApprovalPolicy != "on-request" {
		t.Fatalf("unexpected config: %+v", cfg)
	}
}

func TestValidateRejects(t *testing.T) {
	base := "name: x\nendpoints: {e: {}}\n"
	one := "models: [{id: a, name: a, endpoint: e}]\n"
	cases := map[string]string{
		"no models":        base + "models: []\n",
		"unknown endpoint": base + "models: [{id: a, name: a, endpoint: nope}]\n",
		"duplicate id":     base + "models: [{id: a, name: a, endpoint: e}, {id: a, name: b, endpoint: e}]\n",
		"memory model":     base + one + "memory: {generate: true}\n",
		"unknown key":      base + one + "modle: 1\n",
		"negative slots":   base + one + "slots: -1\n",
		"negative calls":   "name: x\nendpoints: {e: {calls: -2}}\n" + one,
	}
	for name, raw := range cases {
		if _, err := Parse([]byte(raw)); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
}
