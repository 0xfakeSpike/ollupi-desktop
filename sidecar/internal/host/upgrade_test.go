package host

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/0xfakeSpike/ollupi-desktop/sidecar/internal/config"
	"github.com/0xfakeSpike/ollupi/gateway"
	"github.com/0xfakeSpike/ollupi/policy"
)

func TestTheOldConfigMovesIntoTheEngine(t *testing.T) {
	home := t.TempDir()
	file := minimal + `permissions:
  approval: never
  deny: ["web_fetch"]
mcp:
  - name: docs
    url: http://127.0.0.1:1/mcp
memory:
  use: true
  generate: false
`
	cfg := load(t, home, file)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	h, err := New(ctx, Options{Home: home, Token: "t", Config: cfg})
	if err != nil {
		t.Fatal(err)
	}
	defer h.close()
	old, err := config.ReadOld(home)
	if err != nil || old == nil {
		t.Fatalf("old = %v, %v", old, err)
	}
	if err := h.MoveOld(ctx, old); err != nil {
		t.Fatal(err)
	}
	a, user := h.ollupi.App, gateway.DefaultUser
	s, err := a.Settings(ctx, user)
	if err != nil {
		t.Fatal(err)
	}
	if !s.Memory || s.Learn || s.Permissions.ApprovalPolicy != "never" || len(s.Permissions.Rules.Deny) != 1 {
		t.Fatalf("settings = %+v", s)
	}
	servers, err := a.MCPServers(ctx, user)
	if err != nil || len(servers) != 1 || servers[0].Name != "docs" {
		t.Fatalf("servers = %+v, %v", servers, err)
	}

	// Permissions the user has already are theirs; the file's do not
	// replace them.
	if _, err := a.UpdateUserPermissions(ctx, user, policy.Settings{ApprovalPolicy: "untrusted"}); err != nil {
		t.Fatal(err)
	}
	if err := h.MoveOld(ctx, old); err != nil {
		t.Fatal(err)
	}
	if s, _ := a.Settings(ctx, user); s.Permissions.ApprovalPolicy != "untrusted" {
		t.Fatalf("permissions = %+v", s.Permissions)
	}
	if err := old.Cut(); err != nil {
		t.Fatal(err)
	}
	got, _ := os.ReadFile(filepath.Join(home, config.FileName))
	if string(got) != minimal {
		t.Fatalf("file = %q", got)
	}
}
