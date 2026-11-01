// Package skills holds the skills the desktop installs on first start, one
// folder each; config.Load copies them into <home>/skills. Adding a folder
// here ships it.
package skills

import "embed"

// FS is this directory: the skill folders, and this file, which is not one.
//
//go:embed *
var FS embed.FS
