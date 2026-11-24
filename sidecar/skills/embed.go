// Package skills holds the skills the desktop gives every new profile, one
// folder each, for its main agent. Adding a folder here ships it.
package skills

import (
	"embed"
	"fmt"
	"io/fs"

	"github.com/0xfakeSpike/ollupi-desktop/sidecar/internal/skillmd"
	"github.com/0xfakeSpike/ollupi/agent"
	"github.com/0xfakeSpike/ollupi/skill"
)

// FS is this directory: the skill folders, and this file, which is not one.
//
//go:embed *
var FS embed.FS

// Roles are the main agent's: ollupi runs it as one or the other by the size
// of the model, so a conversation that moves to a model of another size
// keeps the skills.
var Roles = []string{string(agent.FullMain), string(agent.CompactMain)}

// Starter reads each skill shipped here, given to the main agent.
func Starter() ([]skill.Package, error) {
	entries, err := fs.ReadDir(FS, ".")
	if err != nil {
		return nil, err
	}
	var out []skill.Package
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		sub, err := fs.Sub(FS, e.Name())
		if err != nil {
			return nil, err
		}
		p, _, err := skillmd.Read(sub, e.Name())
		if err != nil {
			return nil, fmt.Errorf("starter skill %s: %w", e.Name(), err)
		}
		p.Roles = Roles
		out = append(out, p)
	}
	return out, nil
}
