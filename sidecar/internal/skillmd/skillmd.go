// Package skillmd reads a skill folder in the Agent Skills format: a
// SKILL.md of YAML frontmatter (name, description, metadata.version) and
// instructions, with the skill's files beside it. ollupi keeps each user's
// skills as fields, not folders; a folder is how the desktop takes one in:
// the skills it ships, a folder the person imports, and the skills_dir an
// older config named.
package skillmd

import (
	"errors"
	"fmt"
	"io/fs"
	"path"
	"strings"
	"unicode/utf8"

	"github.com/0xfakeSpike/ollupi/skill"
	"gopkg.in/yaml.v3"
)

// File is the instructions; every other file is one of the skill's own.
const File = "SKILL.md"

// Read reads the skill in fsys, a folder called name, which must be the
// skill's own name. The package has no roles: which agents have the skill
// is the reader's to say. skipped are the files ollupi keeps none of: those
// that are not UTF-8 text, and links.
func Read(fsys fs.FS, name string) (p skill.Package, skipped []string, err error) {
	raw, err := fs.ReadFile(fsys, File)
	if err != nil {
		return skill.Package{}, nil, err
	}
	fm, instructions, err := parse(string(raw))
	if err != nil {
		return skill.Package{}, nil, fmt.Errorf("%s: %w", File, err)
	}
	p = skill.Package{
		Name:         strings.TrimSpace(fm.Name),
		Description:  strings.TrimSpace(fm.Description),
		Version:      version(fm.Metadata),
		Instructions: strings.TrimSpace(instructions),
	}
	if p.Name != name {
		return skill.Package{}, nil, fmt.Errorf("the folder %q must have the skill's name, %q", name, p.Name)
	}
	err = fs.WalkDir(fsys, ".", func(at string, e fs.DirEntry, err error) error {
		switch {
		case err != nil:
			return err
		case at == ".":
			return nil
		case strings.HasPrefix(e.Name(), "."):
			// Hidden folders and files are a tool's, not the skill's.
			if e.IsDir() {
				return fs.SkipDir
			}
			return nil
		case e.IsDir(), at == File:
			return nil
		case !e.Type().IsRegular() || !text(at):
			skipped = append(skipped, at)
			return nil
		}
		info, err := e.Info()
		if err != nil {
			return err
		}
		body, err := fs.ReadFile(fsys, at)
		if err != nil {
			return err
		}
		if !utf8.Valid(body) {
			skipped = append(skipped, at)
			return nil
		}
		p.Files = append(p.Files, skill.File{Path: at, Body: body, Executable: info.Mode()&0o111 != 0})
		return nil
	})
	return p, skipped, err
}

// text is whether ollupi keeps a file of this name: it takes the text files
// an agent reads, by their extension.
func text(name string) bool {
	switch strings.ToLower(path.Ext(name)) {
	case ".md", ".txt", ".json", ".yaml", ".yml", ".toml", ".go", ".py", ".js", ".ts", ".sh":
		return true
	}
	return false
}

type frontmatter struct {
	Name        string         `yaml:"name"`
	Description string         `yaml:"description"`
	Metadata    map[string]any `yaml:"metadata"`
}

func parse(text string) (frontmatter, string, error) {
	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	if len(lines) < 2 || lines[0] != "---" {
		return frontmatter{}, "", errors.New("YAML frontmatter is required")
	}
	for i := 1; i < len(lines); i++ {
		if lines[i] != "---" {
			continue
		}
		var fm frontmatter
		if err := yaml.Unmarshal([]byte(strings.Join(lines[1:i], "\n")), &fm); err != nil {
			return frontmatter{}, "", err
		}
		return fm, strings.Join(lines[i+1:], "\n"), nil
	}
	return frontmatter{}, "", errors.New("unterminated YAML frontmatter")
}

func version(metadata map[string]any) string {
	v, ok := metadata["version"]
	if !ok || v == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(v))
}
