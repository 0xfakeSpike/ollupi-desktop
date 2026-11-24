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
// sections; rest is the file with providers in their place and everything
// else, comments included, as it was. A provider keeps its name, so a
// conversation's model stays the same, unless two profiles gave one name to
// different accounts: the later one is then renamed, and its profile's
// choices with it.
func Legacy(raw []byte) (profiles []LegacyProfile, rest []byte, found bool, err error) {
	var tree map[string]any
	if err := yaml.Unmarshal(raw, &tree); err != nil {
		return nil, nil, false, err
	}
	if !slices.ContainsFunc(legacyKeys, func(k string) bool { _, ok := tree[k]; return ok }) {
		return nil, raw, false, nil
	}
	if _, ok := tree["providers"]; ok {
		return nil, nil, true, errors.New("the config has providers and also the sections they replaced")
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
		return nil, nil, true, err
	}
	for _, p := range profiles {
		if !ProfileID.MatchString(p.ID) {
			return nil, nil, true, fmt.Errorf("profiles: %q is not a profile id", p.ID)
		}
	}
	if err := account.CheckCatalog(catalog.providers); err != nil {
		return nil, nil, true, err
	}
	rest, err = replaced(raw, legacyKeys, catalog.providers)
	return profiles, rest, true, err
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

const providersComment = `The models this backend serves, each provider an API account. Every profile
runs on them and chooses which; a model is selected as provider/name.`

// replaced is the YAML document without the given top-level keys and with
// the providers after its prompt (or its name), the rest with its comments.
func replaced(raw []byte, keys []string, providers []account.ModelProvider) ([]byte, error) {
	var doc yaml.Node
	if err := yaml.Unmarshal(raw, &doc); err != nil {
		return nil, err
	}
	if len(doc.Content) == 0 || doc.Content[0].Kind != yaml.MappingNode {
		return nil, errors.New("the config is not a mapping")
	}
	m := doc.Content[0]
	var kept []*yaml.Node
	at := 0
	for i := 0; i+1 < len(m.Content); i += 2 {
		key := m.Content[i].Value
		if slices.Contains(keys, key) {
			continue
		}
		kept = append(kept, m.Content[i], m.Content[i+1])
		if key == "name" || key == "prompt" {
			at = len(kept)
		}
	}
	section := []*yaml.Node{
		{Kind: yaml.ScalarNode, Value: "providers", HeadComment: providersComment},
		providersNode(providers),
	}
	m.Content = slices.Insert(kept, at, section...)
	var out bytes.Buffer
	enc := yaml.NewEncoder(&out)
	enc.SetIndent(2)
	if err := enc.Encode(&doc); err != nil {
		return nil, err
	}
	return out.Bytes(), enc.Close()
}

// providersNode writes providers with config.yaml's keys, in the order a
// person reads them.
func providersNode(providers []account.ModelProvider) *yaml.Node {
	seq := &yaml.Node{Kind: yaml.SequenceNode}
	for _, p := range providers {
		n := mapping()
		pair(n, "id", scalar(p.ID))
		pair(n, "type", scalar(string(p.API)))
		if p.BaseURL != "" {
			pair(n, "base_url", scalar(p.BaseURL))
		}
		if p.APIKey != "" {
			pair(n, "api_key", scalar(p.APIKey))
		}
		models := &yaml.Node{Kind: yaml.SequenceNode}
		for _, m := range p.Models {
			mn := mapping()
			pair(mn, "name", scalar(m.Name))
			if m.Calls != 0 {
				pair(mn, "calls", &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!int", Value: strconv.Itoa(m.Calls)})
			}
			if m.Thinking != nil {
				pair(mn, "thinking", &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!bool", Value: strconv.FormatBool(*m.Thinking)})
			}
			if m.Images {
				pair(mn, "images", &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!bool", Value: "true"})
			}
			limits := mapping()
			limits.Style = yaml.FlowStyle
			pair(limits, "context", number(m.Limits.Context))
			pair(limits, "output", number(m.Limits.Output))
			if m.Limits.MaxInput != 0 {
				pair(limits, "input", number(m.Limits.MaxInput))
			}
			pair(mn, "limits", limits)
			models.Content = append(models.Content, mn)
		}
		pair(n, "models", models)
		seq.Content = append(seq.Content, n)
	}
	return seq
}

func mapping() *yaml.Node { return &yaml.Node{Kind: yaml.MappingNode} }

func scalar(v string) *yaml.Node {
	return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: v}
}

func number(v int) *yaml.Node {
	return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!int", Value: strconv.Itoa(v)}
}

func pair(m *yaml.Node, key string, value *yaml.Node) {
	m.Content = append(m.Content, scalar(key), value)
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
