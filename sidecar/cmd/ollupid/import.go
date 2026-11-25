package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"

	"github.com/0xfakeSpike/ollupi-desktop/sidecar/internal/config"
	"github.com/0xfakeSpike/ollupi/account"
	"github.com/0xfakeSpike/ollupi/store"
	storesqlite "github.com/0xfakeSpike/ollupi/store/sqlite"
)

// ProfilesFile is the app's list of the profiles this home serves, with the
// name and colour each is shown by: the app is the identity provider of this
// deployment. It lives in the home so that it travels with the data.
const ProfilesFile = "profiles.json"

type profileEntry struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Color string `json:"color"`
}

type profilesFile struct {
	Profiles []profileEntry `json:"profiles"`
}

// profileColors are the colours the app shows a profile in; the first is the
// one a profile without its own takes.
var profileColors = []string{"stone", "amber", "teal", "violet", "rose", "sky"}

// importLegacy takes apart an older config.yaml, once. One with a
// workspace block: the block goes, as the workspace tools now always run as
// ollupi sets them up (dropWorkspace). One that declared models per
// profile: every model any profile ran becomes one of the deployment's
// providers, in ollupi's catalog; each profile becomes a user whose
// settings keep the model it started and learned with, and an entry in the
// app's profiles.json, and the old file is kept beside the new one
// (runImport). One that lists providers: they become the catalog
// (importProviders). One that names a skills_dir: its skills are given to
// every profile in the store (importSkills). A config with none of these is
// left alone. Every step can run again, so an import cut short finishes on
// the next start.
func importLegacy(home, names string) int {
	workspace, err := dropWorkspace(home)
	var imported, providers []string
	if err == nil {
		imported, err = runImport(home, names)
	}
	if err == nil {
		providers, err = importProviders(home)
	}
	var skills skillsImport
	if err == nil {
		skills, err = importSkills(home)
	}
	out := struct {
		OK        bool         `json:"ok"`
		Workspace bool         `json:"workspace,omitempty"`
		Imported  []string     `json:"imported,omitempty"`
		Providers []string     `json:"providers,omitempty"`
		Skills    skillsImport `json:"skills,omitzero"`
		Error     string       `json:"error,omitempty"`
	}{OK: err == nil, Workspace: workspace, Imported: imported, Providers: providers, Skills: skills, Error: errorText(err)}
	line, _ := json.Marshal(out)
	fmt.Println(string(line))
	if err != nil {
		return 1
	}
	return 0
}

// dropWorkspace takes the workspace block out of config.yaml, keeping the
// rest of the file and its comments; dropped says it had one.
func dropWorkspace(home string) (dropped bool, err error) {
	path := filepath.Join(home, config.FileName)
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	rest, found, err := config.Workspace(raw)
	if err != nil {
		return false, fmt.Errorf("%s: %w", path, err)
	}
	if !found {
		return false, nil
	}
	return true, writeAtomically(path, rest)
}

func runImport(home, names string) ([]string, error) {
	path := filepath.Join(home, config.FileName)
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	profiles, catalog, rest, found, err := config.Legacy(raw)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	if !found {
		return nil, nil
	}
	// A skills_dir is importSkills' to take apart, next.
	_, checked, _, err := config.SkillsDir(rest, home)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	if _, err := config.Parse(checked); err != nil {
		return nil, fmt.Errorf("%s without its profiles: %w", path, err)
	}
	served := account.Connections(catalog)
	st, err := storesqlite.Open(home)
	if err != nil {
		return nil, err
	}
	err = st.Update(context.Background(), func(tx store.Tx) error {
		if err := tx.SetCatalog(catalog); err != nil {
			return err
		}
		for _, p := range profiles {
			if err := importProfile(tx, p, served); err != nil {
				return fmt.Errorf("profile %s: %w", p.ID, err)
			}
		}
		return nil
	})
	st.Close()
	if err != nil {
		return nil, err
	}
	if err := keepProfiles(home, profiles, names); err != nil {
		return nil, err
	}
	if err := os.WriteFile(path+".pre-import", raw, 0o600); err != nil {
		return nil, err
	}
	if err := writeAtomically(path, rest); err != nil {
		return nil, err
	}
	ids := make([]string, len(profiles))
	for i, p := range profiles {
		ids[i] = p.ID
	}
	return ids, nil
}

// importProviders makes the providers config.yaml lists ollupi's catalog,
// whole, and takes the key out of the file, keeping the rest of it and its
// comments; it says the providers it took. From then on the models are set
// in the app, over the gateway.
func importProviders(home string) ([]string, error) {
	path := filepath.Join(home, config.FileName)
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	catalog, rest, found, err := config.Providers(raw)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	if !found {
		return nil, nil
	}
	st, err := storesqlite.Open(home)
	if err != nil {
		return nil, err
	}
	err = st.Update(context.Background(), func(tx store.Tx) error { return tx.SetCatalog(catalog) })
	st.Close()
	if err != nil {
		return nil, err
	}
	ids := make([]string, len(catalog))
	for i, p := range catalog {
		ids[i] = p.ID
	}
	return ids, writeAtomically(path, rest)
}

func importProfile(tx store.Tx, p config.LegacyProfile, served []string) error {
	if err := tx.EnsureUser(p.ID); err != nil {
		return err
	}
	s, err := tx.Settings(p.ID)
	if err != nil {
		return err
	}
	if slices.Contains(served, p.Model) {
		s.Model = p.Model
	}
	if slices.Contains(served, p.LearnModel) {
		s.LearnModel = p.LearnModel
	}
	return tx.SetSettings(p.ID, s)
}

// keepProfiles adds the imported profiles to the app's profiles.json, each
// with the name and colour the config kept, or else the older profiles.json
// of the app's own folder.
func keepProfiles(home string, imported []config.LegacyProfile, names string) error {
	path := filepath.Join(home, ProfilesFile)
	var kept profilesFile
	if raw, err := os.ReadFile(path); err == nil {
		if err := json.Unmarshal(raw, &kept); err != nil {
			return fmt.Errorf("%s: %w", path, err)
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	var older profilesFile
	if names != "" {
		if raw, err := os.ReadFile(names); err == nil {
			// Names that cannot be read leave the profiles unnamed.
			_ = json.Unmarshal(raw, &older)
		}
	}
	for _, p := range imported {
		if slices.ContainsFunc(kept.Profiles, func(e profileEntry) bool { return e.ID == p.ID }) {
			continue
		}
		entry := profileEntry{ID: p.ID, Name: p.Name, Color: p.Color}
		if i := slices.IndexFunc(older.Profiles, func(e profileEntry) bool { return e.ID == p.ID }); i >= 0 && entry.Name == "" && entry.Color == "" {
			entry.Name, entry.Color = older.Profiles[i].Name, older.Profiles[i].Color
		}
		if !slices.Contains(profileColors, entry.Color) {
			entry.Color = profileColors[0]
		}
		kept.Profiles = append(kept.Profiles, entry)
	}
	out, err := json.MarshalIndent(kept, "", "  ")
	if err != nil {
		return err
	}
	return writeAtomically(path, append(out, '\n'))
}

func writeAtomically(path string, data []byte) error {
	candidate := path + ".candidate"
	if err := os.WriteFile(candidate, data, 0o600); err != nil {
		return err
	}
	if err := os.Rename(candidate, path); err != nil {
		os.Remove(candidate)
		return err
	}
	return nil
}
