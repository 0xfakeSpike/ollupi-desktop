package config

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"gopkg.in/yaml.v3"
)

// skillsDirKey named the folder of skills every profile shared, before each
// kept its own in ollupi's store.
const skillsDirKey = "skills_dir"

// workspaceKey held the settings of the workspace tools (whether they ran,
// the sandbox, the command timeout), before the desktop always ran them as
// ollupi sets them up.
const workspaceKey = "workspace"

// SkillsDir takes apart a config that still names a skills folder: dir is
// the folder, resolved against home as a path in the file was, and rest the
// file without the key, comments included. found is false for a config
// without one; an empty value names no folder.
func SkillsDir(raw []byte, home string) (dir string, rest []byte, found bool, err error) {
	v, rest, err := takeKey(raw, skillsDirKey)
	if err != nil || v == nil {
		return "", rest, v != nil, err
	}
	if v.Kind != yaml.ScalarNode {
		return "", nil, true, errors.New("skills_dir is not a path")
	}
	return expandPath(v.Value, home), rest, true, nil
}

// Workspace takes the workspace block out of a config that still has one:
// rest is the file without it, comments included. Nothing in it is kept.
func Workspace(raw []byte) (rest []byte, found bool, err error) {
	v, rest, err := takeKey(raw, workspaceKey)
	return rest, v != nil, err
}

// takeKey takes a top-level key out of a config, keeping the rest of the
// file and its comments: value is what the key held, nil when the file has
// no such key, and then rest is raw.
func takeKey(raw []byte, key string) (value *yaml.Node, rest []byte, err error) {
	var doc yaml.Node
	if err := yaml.Unmarshal(raw, &doc); err != nil {
		return nil, nil, err
	}
	if len(doc.Content) == 0 || doc.Content[0].Kind != yaml.MappingNode {
		return nil, raw, nil
	}
	m := doc.Content[0]
	i := slices.IndexFunc(m.Content, func(n *yaml.Node) bool { return n.Value == key })
	if i < 0 || i%2 != 0 {
		return nil, raw, nil
	}
	value = m.Content[i+1]
	// The comment above a key holds every paragraph since the key before it;
	// only the last is about this one. The others go on above what follows.
	if head := m.Content[i].HeadComment; strings.Contains(head, "\n\n") {
		above := head[:strings.LastIndex(head, "\n\n")]
		if next := i + 2; next < len(m.Content) {
			m.Content[next].HeadComment = strings.TrimPrefix(above+"\n\n"+m.Content[next].HeadComment, "\n\n")
		} else {
			m.FootComment = strings.TrimSuffix(above+"\n\n"+m.FootComment, "\n\n")
		}
	}
	m.Content = slices.Delete(m.Content, i, i+2)
	var out bytes.Buffer
	enc := yaml.NewEncoder(&out)
	enc.SetIndent(2)
	if err := enc.Encode(&doc); err != nil {
		return value, nil, err
	}
	return value, out.Bytes(), enc.Close()
}

// expandPath resolves a path the file named: ~ is the user's home and a
// relative path is home's; empty stays empty.
func expandPath(path, home string) string {
	switch {
	case path == "":
		return ""
	case path == "~" || strings.HasPrefix(path, "~/"):
		user, err := os.UserHomeDir()
		if err != nil {
			return path
		}
		if path == "~" {
			return user
		}
		return filepath.Join(user, filepath.FromSlash(path[2:]))
	case filepath.IsAbs(path):
		return path
	}
	return filepath.Join(home, path)
}
