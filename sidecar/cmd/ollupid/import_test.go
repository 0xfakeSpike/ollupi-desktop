package main

import (
	"context"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/0xfakeSpike/ollupi-desktop/sidecar/internal/config"
	"github.com/0xfakeSpike/ollupi/account"
	"github.com/0xfakeSpike/ollupi/store"
	storesqlite "github.com/0xfakeSpike/ollupi/store/sqlite"
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

func TestImportMakesTheProvidersTheCatalog(t *testing.T) {
	home := t.TempDir()
	path := filepath.Join(home, config.FileName)
	older := "name: ollupi\n\n# The models this backend serves.\nproviders:\n  - id: deep\n    type: openai\n    base_url: https://api.deepseek.com\n    api_key: sk-d\n    models:\n      - name: flash\n        limits: {context: 128000, output: 8192}\n\n# How many threads may run at once (default 32).\n# slots: 32\n"
	if err := os.WriteFile(path, []byte(older), 0o600); err != nil {
		t.Fatal(err)
	}
	took, err := importProviders(home)
	if err != nil || !slices.Equal(took, []string{"deep"}) {
		t.Fatalf("took %v, %v", took, err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "providers") || strings.Contains(string(raw), "sk-d") || !strings.Contains(string(raw), "# How many threads") {
		t.Fatalf("the file is now:\n%s", raw)
	}
	if _, err := config.LoadFile(path); err != nil {
		t.Fatalf("the config still does not load: %v", err)
	}
	st, err := storesqlite.Open(home)
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	var catalog []account.ModelProvider
	if err := st.Read(context.Background(), func(r store.Reader) (err error) { catalog, err = r.Catalog(); return err }); err != nil {
		t.Fatal(err)
	}
	if len(catalog) != 1 || catalog[0].APIKey != "sk-d" || catalog[0].Models[0].Name != "flash" {
		t.Fatalf("the catalog %+v", catalog)
	}
	if again, err := importProviders(home); err != nil || again != nil {
		t.Fatalf("again: %v, %v", again, err)
	}
}
