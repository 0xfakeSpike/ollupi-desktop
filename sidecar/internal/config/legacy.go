package config

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"

	"github.com/0xfakeSpike/ollupi/account"
	"gopkg.in/yaml.v3"
)

// LegacyProfile is a profile a config from before declared, reduced to what
// is still its own: the model its conversations started with and the one
// that learned its memories (both now its choices in the store, among the
// deployment's providers), and the name and colour 0.8.17-beta.4 kept beside
// them.
type LegacyProfile struct {
	ID         string
	Name       string
	Color      string
	Model      string
	LearnModel string
}

// legacyKeys are the sections that held models per profile: a single models
// list and its memory model (0.8.17-beta.2 and before), profiles each with
// their own providers (beta.3), and credentials that profiles selected from,
// under schema_version 2 (beta.4).
var legacyKeys = []string{"schema_version", "models", "memory", "credentials", "profiles"}

// Legacy takes apart a config that still declares models per profile. Every
// model any profile ran becomes one of the deployment's providers, and each
// profile keeps its choices. found is false for a config without those
// sections; rest is the file without them, everything else, comments
// included, as it was. A provider keeps its name, so a conversation's model
// stays the same, unless two profiles gave one name to different accounts:
// the later one is then renamed, and its profile's choices with it.
func Legacy(raw []byte) (profiles []LegacyProfile, providers []account.ModelProvider, rest []byte, found bool, err error) {
	var tree map[string]any
	if err := yaml.Unmarshal(raw, &tree); err != nil {
		return nil, nil, nil, false, err
	}
	if !slices.ContainsFunc(legacyKeys, func(k string) bool { _, ok := tree[k]; return ok }) {
		return nil, nil, raw, false, nil
	}
	if _, ok := tree[providersKey]; ok {
		return nil, nil, nil, true, errors.New("the config has providers and also the sections they replaced")
	}
	var catalog catalog
	switch {
	case tree["credentials"] != nil:
		profiles, err = catalog.fromCredentials(tree)
	case tree["profiles"] != nil:
		profiles, err = catalog.fromProfileProviders(tree)
	default:
		profiles, err = catalog.fromModels(tree)
	}
	if err != nil {
		return nil, nil, nil, true, err
	}
	for _, p := range profiles {
		if !ProfileID.MatchString(p.ID) {
			return nil, nil, nil, true, fmt.Errorf("profiles: %q is not a profile id", p.ID)
		}
	}
	if err := account.CheckCatalog(catalog.providers); err != nil {
		return nil, nil, nil, true, err
	}
	rest = raw
	for _, key := range legacyKeys {
		if _, rest, err = takeKey(rest, key); err != nil {
			return nil, nil, nil, true, err
		}
	}
	return profiles, catalog.providers, rest, true, nil
}

// catalog gathers the deployment's providers from every profile's.
type catalog struct {
	providers []account.ModelProvider
}

// add puts a provider in the catalog and says the name it has there: its
// own, merged with one of that name for the same account, or a new one when
// that name is another account's.
func (c *catalog) add(p account.ModelProvider) string {
	id := p.ID
	for n := 2; ; n++ {
		i := slices.IndexFunc(c.providers, func(o account.ModelProvider) bool { return o.ID == id })
		if i < 0 {
			p.ID = id
			c.providers = append(c.providers, p)
			return id
		}
		o := &c.providers[i]
		if o.API == p.API && strings.TrimRight(o.BaseURL, "/") == strings.TrimRight(p.BaseURL, "/") && o.APIKey == p.APIKey {
			for _, m := range p.Models {
				if !slices.ContainsFunc(o.Models, func(k account.ProviderModel) bool { return k.Name == m.Name }) {
					o.Models = append(o.Models, m)
				}
			}
			return id
		}
		id = p.ID + "-" + strconv.Itoa(n)
	}
}

// fromCredentials reads beta.4's file: credentials every profile selected
// from, which are already one catalog.
func (c *catalog) fromCredentials(tree map[string]any) ([]LegacyProfile, error) {
	for _, raw := range list(tree["credentials"]) {
		cred := object(raw)
		p := providerOf(text(cred["id"]), cred)
		for _, m := range list(cred["models"]) {
			model, err := modelOf(m)
			if err != nil {
				return nil, fmt.Errorf("credential %s: %w", p.ID, err)
			}
			p.Models = append(p.Models, model)
		}
		c.providers = append(c.providers, p)
	}
	var out []LegacyProfile
	for _, raw := range list(tree["profiles"]) {
		p := object(raw)
		profile := LegacyProfile{ID: text(p["id"]), Name: strings.TrimSpace(text(p["name"])), Color: text(p["color"]), LearnModel: text(object(p["memory"])["model"])}
		if models := list(p["models"]); len(models) > 0 {
			profile.Model = text(models[0])
		}
		out = append(out, profile)
	}
	return out, nil
}

// fromProfileProviders reads beta.3's file: each profile listed providers of
// its own.
func (c *catalog) fromProfileProviders(tree map[string]any) ([]LegacyProfile, error) {
	var out []LegacyProfile
	for _, raw := range list(tree["profiles"]) {
		p := object(raw)
		profile, err := c.withProviders(text(p["id"]), p["models"], p["memory"])
		if err != nil {
			return nil, err
		}
		out = append(out, profile)
	}
	return out, nil
}

// fromModels reads the file of beta.2 and before: one models list, and the
// memory model, the default profile's.
func (c *catalog) fromModels(tree map[string]any) ([]LegacyProfile, error) {
	profile, err := c.withProviders("default", tree["models"], tree["memory"])
	if err != nil {
		return nil, err
	}
	return []LegacyProfile{profile}, nil
}

// withProviders adds providers written out in full, each with the names of
// the models it served, and is the profile that ran them: the first model
// was its default.
func (c *catalog) withProviders(id string, providers, memory any) (LegacyProfile, error) {
	profile := LegacyProfile{ID: id}
	renamed := map[string]string{}
	for _, raw := range list(providers) {
		p := object(raw)
		provider := providerOf(text(p["provider"]), p)
		for _, m := range list(p["names"]) {
			model, err := modelOf(m)
			if err != nil {
				return LegacyProfile{}, fmt.Errorf("profile %s: provider %s: %w", id, provider.ID, err)
			}
			provider.Models = append(provider.Models, model)
		}
		renamed[provider.ID] = c.add(provider)
		if profile.Model == "" && len(provider.Models) > 0 {
			profile.Model = account.Connection(renamed[provider.ID], provider.Models[0].Name)
		}
	}
	if learn := text(object(memory)["model"]); learn != "" {
		provider, model, _ := strings.Cut(learn, "/")
		if to, ok := renamed[provider]; ok {
			profile.LearnModel = account.Connection(to, model)
		}
	}
	return profile, nil
}

func providerOf(id string, p map[string]any) account.ModelProvider {
	return account.ModelProvider{ID: id, API: account.ModelAPI(text(p["type"])), BaseURL: text(p["base_url"]), APIKey: text(p["api_key"])}
}

// modelOf is a model as the file wrote it; its keys are those of
// account.ProviderModel.
func modelOf(raw any) (account.ProviderModel, error) {
	asJSON, err := json.Marshal(raw)
	if err != nil {
		return account.ProviderModel{}, err
	}
	var m account.ProviderModel
	dec := json.NewDecoder(bytes.NewReader(asJSON))
	dec.DisallowUnknownFields()
	return m, dec.Decode(&m)
}

func list(v any) []any {
	l, _ := v.([]any)
	return l
}

func object(v any) map[string]any {
	m, _ := v.(map[string]any)
	return m
}

func text(v any) string {
	s, _ := v.(string)
	return s
}
