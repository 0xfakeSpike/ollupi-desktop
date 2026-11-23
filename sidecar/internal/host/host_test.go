package host

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/0xfakeSpike/ollupi-desktop/sidecar/internal/config"
	"github.com/0xfakeSpike/ollupi/account"
	"github.com/0xfakeSpike/ollupi/pkg/sandbox"
)

func TestTheUsersBoxKeepsTheBackendsEnvironment(t *testing.T) {
	t.Setenv("MCP_TEST_FROM_PROFILE", "kept")
	t.Setenv("OLLUPI_GATEWAY_TOKEN", "secret")
	t.Setenv("BASH_FUNC_x%%", "() { :; }")
	box, err := userBox(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer box.Close()
	res, err := box.Run(context.Background(), sandbox.Command{Program: "/usr/bin/env", Timeout: 5 * time.Second})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(res.Stdout, "MCP_TEST_FROM_PROFILE=kept") {
		t.Errorf("a variable of the backend's did not reach the server:\n%s", res.Stdout)
	}
	if strings.Contains(res.Stdout, "OLLUPI_GATEWAY_TOKEN") {
		t.Errorf("the gateway token reached the server:\n%s", res.Stdout)
	}
}

const minimal = `name: ollupi
models:
  - provider: mock
    type: openai
    base_url: http://127.0.0.1:1/v1
    api_key: test
    names:
      - name: mock-model
        limits: { context: 128000, output: 8000 }
`

func load(t *testing.T, home, yaml string) config.Config {
	t.Helper()
	file := filepath.Join(home, config.FileName)
	if err := os.WriteFile(file, []byte(yaml), 0o600); err != nil {
		t.Fatal(err)
	}
	cfg, err := config.LoadFile(file, home)
	if err != nil {
		t.Fatal(err)
	}
	return cfg
}

func TestCheckRefusesASkillTheAgentWouldNotLoad(t *testing.T) {
	home := t.TempDir()
	cfg := load(t, home, minimal+"skills_dir: skills\n")
	if err := os.Mkdir(filepath.Join(home, "skills"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := Check(home, cfg, nil); err != nil {
		t.Fatalf("refused: %v", err)
	}
	bad := filepath.Join(home, "skills", "full-main-agent", "bad")
	if err := os.MkdirAll(bad, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(bad, "SKILL.md"), []byte("---\nname: other\ndescription: x\n---\n\nDo it.\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := Check(home, cfg, nil); err == nil || !strings.Contains(err.Error(), `"bad"`) {
		t.Fatalf("want a refusal naming the folder, got %v", err)
	}
	if _, err := os.Stat(filepath.Join(home, "data")); err == nil {
		t.Fatal("the check opened the real store")
	}
}

func TestTheUsersMCPServersRunOnThisMachine(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("the mock MCP server needs node")
	}
	mock, err := filepath.Abs("../../../packages/protocol/scripts/mock-mcp.mjs")
	if err != nil {
		t.Fatal(err)
	}
	home := t.TempDir()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	h, err := New(ctx, Options{Home: home, Token: "t", Config: load(t, home, minimal)})
	if err != nil {
		t.Fatal(err)
	}
	defer h.close()
	a := h.ollupi.App
	if err := a.EnsureUser(ctx, "default"); err != nil {
		t.Fatal(err)
	}
	if err := a.SetMCPServer(ctx, "default", account.MCPServer{Name: "mock", Command: node, Args: []string{mock}}); err != nil {
		t.Fatal(err)
	}
	set, err := h.ollupi.Users.Tools(ctx, "default")
	if err != nil {
		t.Fatal(err)
	}
	var providers []string
	for _, s := range set.Specs() {
		providers = append(providers, s.Provider)
	}
	if !slices.Contains(providers, "mock") {
		t.Fatalf("providers = %v, unavailable %v", providers, set.Unavailable())
	}
}

func TestATokenNamesAProfileTheHomeHolds(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	home := t.TempDir()
	h, err := New(ctx, Options{Home: home, Token: "secret", Config: load(t, home, minimal)})
	if err != nil {
		t.Fatal(err)
	}
	defer h.close()
	cases := []struct{ token, want string }{
		{"secret.default", "default"}, // the profile a fresh home is made with
		{"secret.nobody", ""},         // a profile the store does not hold
		{"default", ""},               // no secret, so no profile
		{"other.default", ""},         // the wrong secret
		{"secret.", ""},               // no profile named
	}
	for _, c := range cases {
		got, err := profileOf(ctx, c.token, "secret", h.ollupi.Store)
		if got != c.want || (c.want == "" && err == nil) {
			t.Errorf("profileOf(%q) = %q, %v; want %q", c.token, got, err, c.want)
		}
	}
}
