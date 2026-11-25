package main

import (
	"context"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/0xfakeSpike/ollupi-desktop/sidecar/internal/config"
	"github.com/0xfakeSpike/ollupi/skill"
	"github.com/0xfakeSpike/ollupi/store"
	storesqlite "github.com/0xfakeSpike/ollupi/store/sqlite"
)

func writeSkill(t *testing.T, dir, name, instructions string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Join(dir, "scripts"), 0o755); err != nil {
		t.Fatal(err)
	}
	md := "---\nname: " + name + "\ndescription: Does " + name + ".\nmetadata:\n  version: 2\n---\n\n" + instructions + "\n"
	files := map[string]string{"SKILL.md": md, "scripts/run.py": "print(1)\n", "logo.png": "\x89PNG"}
	for p, body := range files {
		if err := os.WriteFile(filepath.Join(dir, p), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

func TestImportGivesEveryProfileTheSkillsOfTheFolder(t *testing.T) {
	home := t.TempDir()
	cfg := "name: ollupi\n\n# Agent Skills.\nskills_dir: skills\n\n# How many threads may run at once (default 32).\n# slots: 32\n"
	if err := os.WriteFile(filepath.Join(home, config.FileName), []byte(cfg), 0o600); err != nil {
		t.Fatal(err)
	}
	skills := filepath.Join(home, "skills")
	writeSkill(t, filepath.Join(skills, "full-main-agent", "draw"), "draw", "Draw it.")
	writeSkill(t, filepath.Join(skills, "compact-main-agent", "draw"), "draw", "Draw it.")
	writeSkill(t, filepath.Join(skills, "writing-sub-agent", "draw"), "draw", "Draw it another way.")
	writeSkill(t, filepath.Join(skills, "writing-sub-agent", "edit"), "edit", "Edit it.")
	writeSkill(t, filepath.Join(skills, "writing-sub-agent", "wrong"), "other", "Named otherwise.")

	st, err := storesqlite.Open(home)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	err = st.Update(ctx, func(tx store.Tx) error {
		for _, u := range []string{"default", "work"} {
			if err := tx.EnsureUser(u); err != nil {
				return err
			}
		}
		return nil
	})
	st.Close()
	if err != nil {
		t.Fatal(err)
	}

	got, err := importSkills(home)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(got.Skills, []string{"draw", "edit"}) || len(got.Skipped) != 2 {
		t.Fatalf("imported %+v", got)
	}
	if raw, err := os.ReadFile(filepath.Join(home, config.FileName)); err != nil || strings.Contains(string(raw), "skills_dir") {
		t.Fatalf("the config still names the folder: %s, %v", raw, err)
	}
	if _, err := os.Stat(filepath.Join(skills, "writing-sub-agent", "edit", "SKILL.md")); err != nil {
		t.Fatal("the folder was not left as it was")
	}

	st, err = storesqlite.Open(home)
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	for _, u := range []string{"default", "work"} {
		var draw skill.Skill
		var files []skill.File
		err := st.Read(ctx, func(r store.Reader) (err error) {
			if draw, err = r.Skill(u, "draw"); err != nil {
				return err
			}
			files, err = r.SkillFiles(u, "draw")
			return err
		})
		if err != nil {
			t.Fatal(err)
		}
		roles := slices.Sorted(slices.Values(draw.Roles))
		if !slices.Equal(roles, []string{"compact-main-agent", "full-main-agent", "writing-sub-agent"}) || draw.Instructions != "Draw it." || draw.Version != "2" {
			t.Fatalf("%s's draw is %+v", u, draw)
		}
		if len(files) != 1 || files[0].Path != "scripts/run.py" {
			t.Fatalf("%s's draw has files %+v", u, files)
		}
	}

	// Once taken apart, there is nothing left to import.
	if again, err := importSkills(home); err != nil || again.Dir != "" {
		t.Fatalf("again: %+v, %v", again, err)
	}
}
