// Package config takes apart an older <home>/config.yaml. The backend reads
// no config file: its name, prompt, tools and slots are the host's
// constants, the models are ollupi's catalog and the profiles its users,
// both in its store, which the operator changes over the gateway. What a
// file from before held is taken apart once, by Legacy, Providers and
// SkillsDir, and the file then removed (ollupid --import-config).
package config

import "regexp"

const FileName = "config.yaml"

// ProfileID is what a profile's id may be: it names folders under the home
// and is the segment a connection's token carries, so it holds no separator.
var ProfileID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)
