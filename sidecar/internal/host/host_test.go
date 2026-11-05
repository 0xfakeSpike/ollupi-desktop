package host

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/0xfakeSpike/ollupi-desktop/sidecar/internal/config"
	"github.com/0xfakeSpike/ollupi/pkg/sandbox"
)

func TestMCPServersKeepTheBackendsEnvironment(t *testing.T) {
	t.Setenv("MCP_TEST_FROM_PROFILE", "kept")
	t.Setenv("OLLUPI_GATEWAY_TOKEN", "secret")
	t.Setenv("BASH_FUNC_x%%", "() { :; }")
	box, err := mcpBox(t.TempDir())
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

func TestCheckHoldsRulesToTheMCPServersTools(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("the mock MCP server needs node")
	}
	mock, err := filepath.Abs("../../../packages/protocol/scripts/mock-mcp.mjs")
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range []struct {
		name, rule, refused string
	}{
		{name: "a connected server's tool", rule: "mock__echo"},
		{name: "a server that did not connect", rule: "broken__delete_everything"},
		{name: "a tool the connected server lacks", rule: "mock__no_such_tool", refused: "mock__no_such_tool"},
	} {
		t.Run(c.name, func(t *testing.T) {
			home := t.TempDir()
			file := filepath.Join(home, config.FileName)
			yaml := fmt.Sprintf(`name: ollupi
models:
  - provider: mock
    type: openai
    base_url: http://127.0.0.1:1/v1
    api_key: test
    names:
      - name: mock-model
        limits: { context: 128000, output: 8000 }
permissions:
  approval: on-request
  deny: [%s]
mcp:
  - name: mock
    command: %s
    args: [%s]
  - name: broken
    command: ollupi-no-such-mcp-command
`, c.rule, node, mock)
			if err := os.WriteFile(file, []byte(yaml), 0o600); err != nil {
				t.Fatal(err)
			}
			cfg, err := config.LoadFile(file, home)
			if err != nil {
				t.Fatal(err)
			}
			err = Check(home, cfg, nil)
			if c.refused == "" && err != nil {
				t.Fatalf("refused: %v", err)
			}
			if c.refused != "" && (err == nil || !strings.Contains(err.Error(), c.refused)) {
				t.Fatalf("want a refusal naming %s, got %v", c.refused, err)
			}
		})
	}
}
