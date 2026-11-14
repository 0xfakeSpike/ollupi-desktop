package config

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/0xfakeSpike/ollupi/agent/role"
)

// moveFlatSkills is a one-time move of the skills folder to the layout
// ollupi reads, where each role has its skills in the directory of its name
// (dir/<role>/<skill>/SKILL.md). The desktop kept every skill directly in
// dir, and those were the main agent's; ollupi refuses to start with a skill
// there. Each is moved into the main agent's directories, both of its roles,
// as the desktop installs a main agent's skill. A skill one of them already
// has is left where it is, and ollupi's refusal says what to do with it.
func moveFlatSkills(dir string) error {
	entries, err := os.ReadDir(dir)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	full := filepath.Join(dir, string(role.FullMain))
	compact := filepath.Join(dir, string(role.CompactMain))
	for _, e := range entries {
		name := e.Name()
		if !e.IsDir() || strings.HasPrefix(name, ".") {
			continue
		}
		flat := filepath.Join(dir, name)
		if _, err := os.Lstat(filepath.Join(flat, "SKILL.md")); err != nil {
			continue
		}
		if exists(filepath.Join(full, name)) || exists(filepath.Join(compact, name)) {
			continue
		}
		if err := os.MkdirAll(full, 0o755); err != nil {
			return err
		}
		if err := os.MkdirAll(compact, 0o755); err != nil {
			return err
		}
		// The move first: once it is done the folder is one ollupi starts
		// with, whatever happens to the copy.
		if err := os.Rename(flat, filepath.Join(full, name)); err != nil {
			return fmt.Errorf("move skill %s: %w", name, err)
		}
		// Copied beside its place, then renamed in, so a copy cut short is
		// never a skill.
		staged := filepath.Join(compact, ".moving-"+name)
		os.RemoveAll(staged)
		if err := os.CopyFS(staged, os.DirFS(filepath.Join(full, name))); err != nil {
			os.RemoveAll(staged)
			return fmt.Errorf("copy skill %s for %s: %w", name, role.CompactMain, err)
		}
		if err := os.Rename(staged, filepath.Join(compact, name)); err != nil {
			return fmt.Errorf("copy skill %s for %s: %w", name, role.CompactMain, err)
		}
	}
	return nil
}

func exists(path string) bool {
	_, err := os.Lstat(path)
	return err == nil
}
