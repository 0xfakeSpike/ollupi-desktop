package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"github.com/0xfakeSpike/ollupi-desktop/sidecar/internal/config"
	"github.com/0xfakeSpike/ollupi-desktop/sidecar/internal/skillmd"
	"github.com/0xfakeSpike/ollupi/agent"
	"github.com/0xfakeSpike/ollupi/skill"
	"github.com/0xfakeSpike/ollupi/store"
	storesqlite "github.com/0xfakeSpike/ollupi/store/sqlite"
)

// skillsImport is what importSkills did: the skills each profile now has,
// and those it left in the folder, each with why.
type skillsImport struct {
	Dir     string   `json:"dir,omitempty"`
	Skills  []string `json:"skills,omitempty"`
	Skipped []string `json:"skipped,omitempty"`
}

// importSkills gives every profile the skills of the skills_dir an older
// config.yaml names, then takes the key out of the file; the folder stays as
// it is. The folder held one folder per role, and a skill a role did not
// have in its own was not the role's. A skill is now one, given to roles: a
// skill of the same name in several roles' folders becomes one with all of
// them, and where the copies differ the main agent's is kept, else the first
// role's in ollupi's order. A skill ollupi would refuse is left out and said
// so, rather than holding up the start.
func importSkills(home string) (skillsImport, error) {
	path := filepath.Join(home, config.FileName)
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return skillsImport{}, nil
	}
	if err != nil {
		return skillsImport{}, err
	}
	dir, rest, found, err := config.SkillsDir(raw, home)
	if err != nil {
		return skillsImport{}, fmt.Errorf("%s: %w", path, err)
	}
	if !found {
		return skillsImport{}, nil
	}
	out := skillsImport{Dir: dir}
	var packages []skill.Package
	if dir != "" {
		packages, out.Skipped = readSkillsDir(dir)
	}
	st, err := storesqlite.Open(home)
	if err != nil {
		return skillsImport{}, err
	}
	err = st.Update(context.Background(), func(tx store.Tx) error {
		users, err := tx.Users()
		if err != nil {
			return err
		}
		for _, user := range users {
			for _, p := range packages {
				if err := tx.PutSkill(user, p); err != nil {
					return fmt.Errorf("profile %s: skill %s: %w", user, p.Name, err)
				}
			}
		}
		return nil
	})
	st.Close()
	if err != nil {
		return skillsImport{}, err
	}
	for _, p := range packages {
		out.Skills = append(out.Skills, p.Name)
	}
	return out, writeAtomically(path, rest)
}

// readSkillsDir reads dir/<role>/<skill> for each role, main agent first,
// into one package per skill, checked as ollupi checks one it is given.
func readSkillsDir(dir string) (packages []skill.Package, skipped []string) {
	roles := roleNames()
	byName := map[string]int{}
	for _, role := range slices.SortedStableFunc(slices.Values(roles), func(a, b string) int { return mainFirst(a) - mainFirst(b) }) {
		entries, err := os.ReadDir(filepath.Join(dir, role))
		if err != nil {
			if !errors.Is(err, os.ErrNotExist) {
				skipped = append(skipped, fmt.Sprintf("%s: %v", role, err))
			}
			continue
		}
		for _, e := range entries {
			if !e.IsDir() || strings.HasPrefix(e.Name(), ".") {
				continue
			}
			at := filepath.Join(role, e.Name())
			p, _, err := skillmd.Read(os.DirFS(filepath.Join(dir, at)), e.Name())
			if err != nil {
				skipped = append(skipped, fmt.Sprintf("%s: %v", at, err))
				continue
			}
			i, ok := byName[p.Name]
			if !ok {
				p.Roles = []string{role}
				byName[p.Name] = len(packages)
				packages = append(packages, p)
				continue
			}
			kept := &packages[i]
			if kept.Skill().Digest != p.Skill().Digest {
				skipped = append(skipped, fmt.Sprintf("%s: differs from %s's copy, which is kept", at, kept.Roles[0]))
			}
			kept.Roles = append(kept.Roles, role)
		}
	}
	checked := packages[:0]
	for _, p := range packages {
		if err := p.Check(roles); err != nil {
			skipped = append(skipped, err.Error())
			continue
		}
		checked = append(checked, p)
	}
	return checked, skipped
}

func roleNames() []string {
	out := make([]string, len(agent.Names))
	for i, n := range agent.Names {
		out[i] = string(n)
	}
	return out
}

func mainFirst(role string) int {
	if role == string(agent.FullMain) || role == string(agent.CompactMain) {
		return 0
	}
	return 1
}

// readResult is --read-skill's output: a skill folder as the app sends it to
// skill/set, without the agents that have it, which the person chooses; or
// why it cannot be read. Skipped are files ollupi keeps none of.
type readResult struct {
	OK      bool         `json:"ok"`
	Skill   *skillFields `json:"skill,omitempty"`
	Skipped []string     `json:"skipped,omitempty"`
	Error   string       `json:"error,omitempty"`
}

type skillFields struct {
	Name         string      `json:"name"`
	Description  string      `json:"description"`
	Version      string      `json:"version,omitempty"`
	Instructions string      `json:"instructions"`
	Files        []skillFile `json:"files"`
}

type skillFile struct {
	Path       string `json:"path"`
	Text       string `json:"text"`
	Executable bool   `json:"executable,omitempty"`
}

// readSkill reads the skill folder at dir, for the app to import.
func readSkill(dir string) int {
	p, skipped, err := skillmd.Read(os.DirFS(dir), filepath.Base(dir))
	out := readResult{Error: errorText(err)}
	if err == nil {
		fields := &skillFields{Name: p.Name, Description: p.Description, Version: p.Version, Instructions: p.Instructions, Files: make([]skillFile, len(p.Files))}
		for i, f := range p.Files {
			fields.Files[i] = skillFile{Path: f.Path, Text: string(f.Body), Executable: f.Executable}
		}
		out = readResult{OK: true, Skill: fields, Skipped: skipped}
	}
	line, _ := json.Marshal(out)
	fmt.Println(string(line))
	if err != nil {
		return 1
	}
	return 0
}
