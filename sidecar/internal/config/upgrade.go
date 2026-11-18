// What config.yaml held before 0.7.53 that ollupi keeps for each user now:
// the default permissions, the MCP servers, and whether memory is used and
// learns. The first start of 0.7.53 moves them into the engine and cuts
// them from the file, so a user upgrading need not edit it by hand. Until
// then the file loads without them. Delete this file, and its callers, in
// the release after 0.7.53: every user has started it by then.

package config

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/0xfakeSpike/ollupi/account"
	"github.com/0xfakeSpike/ollupi/policy"
	"gopkg.in/yaml.v3"
)

// Old are the keys the file still has; a nil field was not in it.
type Old struct {
	Permissions *policy.Settings
	MCP         []account.MCPServer
	// Memory was memory.use, Learn memory.generate.
	Memory, Learn *bool

	path    string
	cleaned []byte
}

// ReadOld reads the old keys in home's config.yaml: nil when it has none
// or no file.
func ReadOld(home string) (*Old, error) {
	path := filepath.Join(home, FileName)
	raw, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	cleaned, old, err := cut(raw)
	if err != nil || old == nil {
		return nil, err
	}
	old.path, old.cleaned = path, cleaned
	return old, nil
}

// Cut writes the file without the old keys, once they are in the engine.
func (o *Old) Cut() error {
	info, err := os.Stat(o.path)
	if err != nil {
		return err
	}
	tmp := o.path + ".tmp"
	if err := os.WriteFile(tmp, o.cleaned, info.Mode().Perm()); err != nil {
		return err
	}
	return os.Rename(tmp, o.path)
}

// cut returns raw without the old keys, and what they held; nil when it
// has none. The rest of the file, comments included, stays as it was. A
// file that is not YAML is left for Parse to report.
func cut(raw []byte) ([]byte, *Old, error) {
	var doc yaml.Node
	if yaml.Unmarshal(raw, &doc) != nil || len(doc.Content) == 0 || doc.Content[0].Kind != yaml.MappingNode {
		return raw, nil, nil
	}
	root := doc.Content[0]
	lines := strings.SplitAfter(string(raw), "\n")
	drop := make([]bool, len(lines)+1) // by 1-based line
	insert := map[int]string{}
	var old Old
	found := false
	for i := 0; i+1 < len(root.Content); i += 2 {
		key, value := root.Content[i], root.Content[i+1]
		next := len(lines) + 1
		if i+2 < len(root.Content) {
			next = root.Content[i+2].Line
		}
		switch key.Value {
		case "permissions":
			var p struct {
				Approval string   `yaml:"approval"`
				Allow    []string `yaml:"allow"`
				Ask      []string `yaml:"ask"`
				Deny     []string `yaml:"deny"`
			}
			if err := value.Decode(&p); err != nil {
				return nil, nil, fmt.Errorf("permissions: %w", err)
			}
			old.Permissions = &policy.Settings{ApprovalPolicy: p.Approval, Rules: policy.Rules{Allow: p.Allow, Ask: p.Ask, Deny: p.Deny}}
			found = true
			block(lines, drop, key.Line, next, true)
		case "mcp":
			var servers []struct {
				Name    string            `yaml:"name"`
				Command string            `yaml:"command"`
				Args    []string          `yaml:"args"`
				Env     map[string]string `yaml:"env"`
				URL     string            `yaml:"url"`
				Headers map[string]string `yaml:"headers"`
			}
			if err := value.Decode(&servers); err != nil {
				return nil, nil, fmt.Errorf("mcp: %w", err)
			}
			for _, s := range servers {
				old.MCP = append(old.MCP, account.MCPServer{Name: s.Name, Command: s.Command, Args: s.Args, Env: expand(s.Env), URL: s.URL, Headers: expand(s.Headers)})
			}
			found = true
			block(lines, drop, key.Line, next, true)
		case "memory":
			if value.Kind != yaml.MappingNode {
				continue
			}
			kept := &yaml.Node{Kind: yaml.MappingNode}
			for j := 0; j+1 < len(value.Content); j += 2 {
				k, v := value.Content[j], value.Content[j+1]
				var b bool
				switch k.Value {
				case "use", "generate":
					if err := v.Decode(&b); err != nil {
						return nil, nil, fmt.Errorf("memory.%s: %w", k.Value, err)
					}
					if k.Value == "use" {
						old.Memory = &b
					} else {
						old.Learn = &b
					}
				default:
					kept.Content = append(kept.Content, k, v)
				}
			}
			if old.Memory == nil && old.Learn == nil {
				continue
			}
			found = true
			// What is left, model alone as a rule, is written anew where
			// the section was; with nothing left the section goes with its
			// comment.
			block(lines, drop, key.Line, next, len(kept.Content) == 0)
			if len(kept.Content) > 0 {
				var out strings.Builder
				enc := yaml.NewEncoder(&out)
				enc.SetIndent(2)
				if err := enc.Encode(&yaml.Node{Kind: yaml.MappingNode, Content: []*yaml.Node{{Kind: yaml.ScalarNode, Value: "memory"}, kept}}); err != nil {
					return nil, nil, err
				}
				insert[key.Line] = out.String()
			}
		}
	}
	if !found {
		return raw, nil, nil
	}
	var b strings.Builder
	for n, line := range lines {
		if s, ok := insert[n+1]; ok {
			b.WriteString(s)
		}
		if !drop[n+1] {
			b.WriteString(line)
		}
	}
	// The old template's example of mcp, commented out, told to write
	// secrets as ${NAME}, which the app does not read.
	return []byte(strings.Replace(b.String(), oldMCPExample, "", 1)), &old, nil
}

const oldMCPExample = `# MCP servers: a command run over stdio, or an HTTP URL. Their tools appear
# as <name>__<tool>; a server that cannot start is skipped. Write secrets in
# env and header values as ${NAME}, a variable from your login shell; a
# command also inherits that environment.
# mcp:
#   - name: filesystem
#     command: npx
#     args: [-y, "@modelcontextprotocol/server-filesystem", /path/to/dir]
#   - name: github
#     url: https://api.githubcopilot.com/mcp/
#     headers: { Authorization: "Bearer ${GITHUB_TOKEN}" }

`

// block marks a top-level key's lines from start up to the next key's, less
// the blank lines and comments at its end, which belong to what follows;
// with its comment, also the comment lines right above it.
func block(lines []string, drop []bool, start, next int, withComment bool) {
	end := next - 1
	for end > start && (strings.TrimSpace(lines[end-1]) == "" || strings.HasPrefix(lines[end-1], "#")) {
		end--
	}
	if withComment {
		for start > 1 && strings.HasPrefix(lines[start-2], "#") {
			start--
		}
	}
	for n := start; n <= end; n++ {
		drop[n] = true
	}
	// One blank line, not two, where the block was.
	if start > 1 && strings.TrimSpace(lines[start-2]) == "" && end < len(lines) && strings.TrimSpace(lines[end]) == "" {
		drop[end+1] = true
	}
}

var variable = regexp.MustCompile(`\$\{([A-Za-z_][A-Za-z0-9_]*)\}`)

// expand fills in each ${NAME} with that variable of the backend's
// environment, as the file's values were read before; ollupi keeps them as
// written. One that is not set stays as it is.
func expand(m map[string]string) map[string]string {
	if m == nil {
		return nil
	}
	out := make(map[string]string, len(m))
	for k, v := range m {
		out[k] = variable.ReplaceAllStringFunc(v, func(ref string) string {
			if value, ok := os.LookupEnv(variable.FindStringSubmatch(ref)[1]); ok {
				return value
			}
			return ref
		})
	}
	return out
}
