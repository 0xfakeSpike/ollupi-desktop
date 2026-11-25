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

func TestImportTakesAnOlderHomeApartAndRemovesConfigYAML(t *testing.T) {
	home := t.TempDir()
	older := "name: ollupi\nprompt: \"\"\n\nproviders:\n  - id: deep\n    type: openai\n    api_key: sk-d\n    models:\n      - name: flash\n        limits: {context: 128000, output: 8192}\n\nworkspace:\n  enabled: true\n\n# slots: 32\n"
	if err := os.WriteFile(filepath.Join(home, config.FileName), []byte(older), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(home, ProfilesFile), []byte(`{"profiles":[{"id":"default","name":"Me","color":"sky"}]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if code := importLegacy(home, ""); code != 0 {
		t.Fatalf("import exited %d", code)
	}
	for _, gone := range []string{config.FileName, ProfilesFile} {
		if _, err := os.Stat(filepath.Join(home, gone)); !os.IsNotExist(err) {
			t.Fatalf("%s is still there: %v", gone, err)
		}
	}
	st, err := storesqlite.Open(home)
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	var catalog []account.ModelProvider
	var users []account.User
	err = st.Read(context.Background(), func(r store.Reader) (err error) {
		if catalog, err = r.Catalog(); err != nil {
			return err
		}
		users, err = r.UserList()
		return err
	})
	if err != nil || len(catalog) != 1 || catalog[0].APIKey != "sk-d" || !slices.Equal(users, []account.User{{ID: "default", Name: "Me"}}) {
		t.Fatalf("catalog %+v, users %+v, %v", catalog, users, err)
	}
	// Nothing is left to do on the next start.
	if code := importLegacy(home, ""); code != 0 {
		t.Fatalf("again: import exited %d", code)
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

func TestImportNamesTheUsersOfProfilesJSONAndRemovesIt(t *testing.T) {
	home := t.TempDir()
	path := filepath.Join(home, ProfilesFile)
	listed := `{"profiles":[{"id":"default","name":"","color":"sky"},{"id":"work","name":" Office ","color":"teal"},{"id":"a/b","name":"bad"}]}`
	if err := os.WriteFile(path, []byte(listed), 0o600); err != nil {
		t.Fatal(err)
	}
	took, err := importProfiles(home)
	if err != nil || !slices.Equal(took, []string{"default", "work"}) {
		t.Fatalf("took %v, %v", took, err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("profiles.json is still there: %v", err)
	}
	st, err := storesqlite.Open(home)
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	var users []account.User
	if err := st.Read(context.Background(), func(r store.Reader) (err error) { users, err = r.UserList(); return err }); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(users, []account.User{{ID: "default"}, {ID: "work", Name: "Office"}}) {
		t.Fatalf("users %+v", users)
	}
	if again, err := importProfiles(home); err != nil || again != nil {
		t.Fatalf("again: %v, %v", again, err)
	}
}
