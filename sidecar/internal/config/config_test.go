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
	if cfg.Models[0].ID != "gpt-5.2" || !cfg.Shell.Enabled || cfg.Shell.SandboxMode != "workspace-write" {
		t.Fatalf("unexpected config: %+v", cfg)
	}
	if cfg.Settings.ApprovalPolicy != "on-request" {
		t.Fatalf("approval policy = %q", cfg.Settings.ApprovalPolicy)
	}
}

func TestValidateRejects(t *testing.T) {
	base := "name: x\nendpoints: {e: {}}\n"
	cases := map[string]string{
		"no models":        base + "models: []\n",
		"unknown endpoint": base + "models: [{id: a, name: a, endpoint: nope}]\n",
		"duplicate id":     base + "models: [{id: a, name: a, endpoint: e}, {id: a, name: b, endpoint: e}]\n",
		"memory model":     base + "models: [{id: a, name: a, endpoint: e}]\nmemory: {generate: true}\n",
		"unknown field":    base + "models: [{id: a, name: a, endpoint: e}]\nmodle: 1\n",
	}
	for name, raw := range cases {
		if _, err := Parse([]byte(raw)); err == nil {
			t.Errorf("%s: expected an error", name)
		} else if strings.TrimSpace(err.Error()) == "" {
			t.Errorf("%s: empty error", name)
		}
	}
}
