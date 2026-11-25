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

// importLegacy takes apart what an older home kept in files, once. A
// config.yaml that declared models per profile: every model any profile
// ran becomes one of the deployment's providers, in ollupi's catalog; each
// profile becomes a user, named, whose settings keep the model it started
// and learned with (runImport). One that lists providers: they become the
// catalog (importProviders). A profiles.json: its profiles become users with
// their names, and the file goes (importProfiles). A config.yaml that names
// a skills_dir: its skills are given to every profile in the store
// (importSkills). Then config.yaml goes: the backend reads none, and what
// else it held (a name, a prompt, tools, slots) is the host's now
// (removeConfig). Every step can run again, so an import cut short
// finishes on the next start.
func importLegacy(home, names string) int {
	imported, err := runImport(home, names)
	var providers []string
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
	var removed bool
	if err == nil {
		removed, err = removeConfig(home)
	}
	out := struct {
		OK        bool         `json:"ok"`
		Imported  []string     `json:"imported,omitempty"`
		Providers []string     `json:"providers,omitempty"`
		Profiles  []string     `json:"profiles,omitempty"`
		Skills    skillsImport `json:"skills,omitzero"`
		Config    bool         `json:"config,omitempty"`
		Error     string       `json:"error,omitempty"`
	}{OK: err == nil, Imported: imported, Providers: providers, Profiles: named, Skills: skills, Config: removed, Error: errorText(err)}
	line, _ := json.Marshal(out)
	fmt.Println(string(line))
	if err != nil {
		return 1
	}
	return 0
}

// removeConfig removes config.yaml once nothing in it is still to be taken
// apart; removed says there was one.
func removeConfig(home string) (removed bool, err error) {
	err = os.Remove(filepath.Join(home, config.FileName))
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	return err == nil, err
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
