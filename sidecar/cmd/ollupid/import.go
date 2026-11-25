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

// ProfilesFile was the app's list of the profiles this home served, with the
// name and colour each was shown by, before ollupi named its users.
const ProfilesFile = "profiles.json"

type profileEntry struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type profilesFile struct {
	Profiles []profileEntry `json:"profiles"`
}

// importLegacy takes apart an older config.yaml, once. One with a
// workspace block: the block goes, as the workspace tools now always run as
// ollupi sets them up (dropWorkspace). One that declared models per
// profile: every model any profile ran becomes one of the deployment's
// providers, in ollupi's catalog; each profile becomes a user, named, whose
// settings keep the model it started and learned with, and the old file is
// kept beside the new one (runImport). One that lists providers: they
// become the catalog (importProviders). A profiles.json in the home: its
// profiles become users with their names, and the file goes
// (importProfiles). One that names a skills_dir: its skills are given to
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
	var named []string
	if err == nil {
		named, err = importProfiles(home)
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
		Profiles  []string     `json:"profiles,omitempty"`
		Skills    skillsImport `json:"skills,omitzero"`
		Error     string       `json:"error,omitempty"`
	}{OK: err == nil, Workspace: workspace, Imported: imported, Providers: providers, Profiles: named, Skills: skills, Error: errorText(err)}
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
	older := olderNames(names)
	st, err := storesqlite.Open(home)
	if err != nil {
		return nil, err
	}
	err = st.Update(context.Background(), func(tx store.Tx) error {
		if err := tx.SetCatalog(catalog); err != nil {
			return err
		}
		for _, p := range profiles {
			if p.Name == "" {
				p.Name = older[p.ID]
			}
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
	if name, err := account.UserName(p.Name); err == nil {
		if err := tx.SetUserName(p.ID, name); err != nil {
			return err
		}
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

// olderNames are the names of the profiles.json 0.8.17-beta.3 kept in the
// app's own folder, by id; none when it cannot be read.
func olderNames(path string) map[string]string {
	out := map[string]string{}
	if path == "" {
		return out
	}
	var older profilesFile
	if raw, err := os.ReadFile(path); err == nil && json.Unmarshal(raw, &older) == nil {
		for _, e := range older.Profiles {
			out[e.ID] = e.Name
		}
	}
	return out
}

// importProfiles makes every profile the home's profiles.json lists a user
// of the store, named as the file names it (a name that does not check is
// left out), then removes the file: from then on ollupi keeps the users and
// their names, and the operator makes and names them over the gateway. It
// says the profiles it took.
func importProfiles(home string) ([]string, error) {
	path := filepath.Join(home, ProfilesFile)
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var listed profilesFile
	if err := json.Unmarshal(raw, &listed); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	var ids []string
	for _, e := range listed.Profiles {
		if config.ProfileID.MatchString(e.ID) && !slices.Contains(ids, e.ID) {
			ids = append(ids, e.ID)
		}
	}
	st, err := storesqlite.Open(home)
	if err != nil {
		return nil, err
	}
	err = st.Update(context.Background(), func(tx store.Tx) error {
		for _, e := range listed.Profiles {
			if !slices.Contains(ids, e.ID) {
				continue
			}
			if err := tx.EnsureUser(e.ID); err != nil {
				return err
			}
			if name, err := account.UserName(e.Name); err == nil {
				if err := tx.SetUserName(e.ID, name); err != nil {
					return err
				}
			}
		}
		return nil
	})
	st.Close()
	if err != nil {
		return nil, err
	}
	return ids, os.Remove(path)
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
