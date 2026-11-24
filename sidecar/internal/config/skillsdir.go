package config

import (
	"bytes"
	"errors"
	"slices"

	"gopkg.in/yaml.v3"
)

// skillsDirKey named the folder of skills every profile shared, before each
// kept its own in ollupi's store.
const skillsDirKey = "skills_dir"

// SkillsDir takes apart a config that still names a skills folder: dir is
// the folder, resolved against home as the file's paths are, and rest the
// file without the key, comments included. found is false for a config
// without one; an empty value names no folder.
func SkillsDir(raw []byte, home string) (dir string, rest []byte, found bool, err error) {
	var doc yaml.Node
	if err := yaml.Unmarshal(raw, &doc); err != nil {
		return "", nil, false, err
	}
	if len(doc.Content) == 0 || doc.Content[0].Kind != yaml.MappingNode {
		return "", raw, false, nil
	}
	m := doc.Content[0]
	i := slices.IndexFunc(m.Content, func(n *yaml.Node) bool { return n.Value == skillsDirKey })
	if i < 0 || i%2 != 0 {
		return "", raw, false, nil
	}
	v := m.Content[i+1]
	if v.Kind != yaml.ScalarNode {
		return "", nil, true, errors.New("skills_dir is not a path")
	}
	dir = expandPath(v.Value, home)
	m.Content = slices.Delete(m.Content, i, i+2)
	var out bytes.Buffer
	enc := yaml.NewEncoder(&out)
	enc.SetIndent(2)
	if err := enc.Encode(&doc); err != nil {
		return "", nil, true, err
	}
	return dir, out.Bytes(), true, enc.Close()
}
