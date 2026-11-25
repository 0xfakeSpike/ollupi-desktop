package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/0xfakeSpike/ollupi-desktop/sidecar/internal/config"
)

func TestImportTakesOutTheWorkspaceBlock(t *testing.T) {
	home := t.TempDir()
	path := filepath.Join(home, config.FileName)
	older := config.Template + "\n# Commands and file edits, in the sandbox.\nworkspace:\n  enabled: true\n  sandbox_mode: workspace-write\n  command_timeout_sec: 60\n  network: false\n"
	if err := os.WriteFile(path, []byte(older), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := config.LoadFile(path); err == nil {
		t.Fatal("an older config loaded with its workspace block")
	}

	dropped, err := dropWorkspace(home)
	if err != nil || !dropped {
		t.Fatalf("dropped = %v, err = %v", dropped, err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "sandbox_mode") || !strings.Contains(string(raw), "# How many threads may run at once") {
		t.Fatalf("the file is now:\n%s", raw)
	}
	if _, err := config.LoadFile(path); err != nil {
		t.Fatalf("the config still does not load: %v", err)
	}
	// Once taken out, there is nothing more to do.
	if dropped, err := dropWorkspace(home); err != nil || dropped {
		t.Fatalf("again: dropped = %v, err = %v", dropped, err)
	}
}
