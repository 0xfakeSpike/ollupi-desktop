package config

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/0xfakeSpike/ollupi/account"
	"github.com/0xfakeSpike/ollupi/policy"
	"github.com/google/go-cmp/cmp"
)

const before = `name: ollupi
models:
  - provider: mock
    type: openai
    names:
      - name: m
        limits: { context: 1000, output: 100 }

# Agent-level permissions; workspaces and threads add rules on top.
permissions:
  approval: never # untrusted | on-request | never
  allow: []
  ask: []
  deny: ["read_file(**/.env)"]

# How many threads may run at once (default 32).
# slots: 32

workspace:
  enabled: true

` + oldMCPExample + `# MCP servers: a command run over stdio, or an HTTP URL.
mcp:
  - name: github
    url: https://example.com/mcp/
    headers: { Authorization: "Bearer ${UPGRADE_TEST_TOKEN}", X-Other: "${UPGRADE_TEST_UNSET}" }

# Learning extracts memories from finished turns.
memory:
  use: true
  generate: false
  model: mock/m
skills_dir: skills
`

const after = `name: ollupi
models:
  - provider: mock
    type: openai
    names:
      - name: m
        limits: { context: 1000, output: 100 }

# How many threads may run at once (default 32).
# slots: 32

workspace:
  enabled: true

# Learning extracts memories from finished turns.
memory:
  model: mock/m
skills_dir: skills
`

func TestTheOldKeysMoveOutOfTheFile(t *testing.T) {
	t.Setenv("UPGRADE_TEST_TOKEN", "secret")
	home := t.TempDir()
	path := filepath.Join(home, FileName)
	if err := os.WriteFile(path, []byte(before), 0o600); err != nil {
		t.Fatal(err)
	}
	// It loads as it is, before anything moves.
	cfg, err := LoadFile(path, home)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Memory.Model != "mock/m" || !cfg.Workspace.Enabled {
		t.Fatalf("loaded %+v", cfg)
	}
	old, err := ReadOld(home)
	if err != nil || old == nil {
		t.Fatalf("old = %v, %v", old, err)
	}
	no, yes := false, true
	want := Old{
		Permissions: &policy.Settings{ApprovalPolicy: "never", Rules: policy.Rules{Allow: []string{}, Ask: []string{}, Deny: []string{"read_file(**/.env)"}}},
		MCP:         []account.MCPServer{{Name: "github", URL: "https://example.com/mcp/", Headers: map[string]string{"Authorization": "Bearer secret", "X-Other": "${UPGRADE_TEST_UNSET}"}}},
		Memory:      &yes,
		Learn:       &no,
	}
	if d := cmp.Diff(want, *old, cmp.AllowUnexported(Old{}), cmp.FilterPath(func(p cmp.Path) bool { return p.Last().String() == ".path" || p.Last().String() == ".cleaned" }, cmp.Ignore())); d != "" {
		t.Fatal(d)
	}
	if err := old.Cut(); err != nil {
		t.Fatal(err)
	}
	got, _ := os.ReadFile(path)
	if d := cmp.Diff(after, string(got)); d != "" {
		t.Fatal(d)
	}
	if info, _ := os.Stat(path); info.Mode().Perm() != 0o600 {
		t.Fatalf("mode %v", info.Mode())
	}
	if old, err := ReadOld(home); old != nil || err != nil {
		t.Fatalf("again: %v, %v", old, err)
	}
}

func TestAMemorySectionWithOnlyTheSwitchesGoes(t *testing.T) {
	raw := "name: x\n\n# Memory.\nmemory: {use: false, generate: true}\n\nskills_dir: s\n"
	cleaned, old, err := cut([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	if *old.Memory || !*old.Learn {
		t.Fatalf("old = %+v", old)
	}
	if string(cleaned) != "name: x\n\nskills_dir: s\n" {
		t.Fatalf("cleaned = %q", cleaned)
	}
}

func TestAFileWithoutOldKeysIsLeftAlone(t *testing.T) {
	cleaned, old, err := cut([]byte(Template))
	if err != nil || old != nil || string(cleaned) != Template {
		t.Fatalf("old = %v, err = %v", old, err)
	}
}
