// Command ollupid is the desktop app's backend: it embeds the ollupi agent and
// serves its gateway on a loopback port. The Electron main process spawns it
// with the gateway token in OLLUPI_GATEWAY_TOKEN and reads one handshake line
// from stdout. SIGTERM, or stdin closing when the parent dies, shuts it down.
//
// Other modes serve the app's config and skill editing; each prints one JSON
// line:
//
//	ollupid --check-config FILE   whether FILE would start
//	ollupid --config-schema       the JSON Schema of --check-config's output
//	ollupid --list-skills         the skills in config.yaml's skills_dir
//	ollupid --check-skills DIR    the skills in DIR, as the agent would load them
//	ollupid --skills-schema       the JSON Schema of the skills modes' output
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"os/signal"
	"path/filepath"
	"runtime/debug"
	"strings"
	"syscall"

	"github.com/0xfakeSpike/ollupi-desktop/sidecar/internal/browser"
	"github.com/0xfakeSpike/ollupi-desktop/sidecar/internal/config"
	"github.com/0xfakeSpike/ollupi-desktop/sidecar/internal/handshake"
	"github.com/0xfakeSpike/ollupi-desktop/sidecar/internal/host"
	"github.com/0xfakeSpike/ollupi/agent/skills"
	"github.com/google/jsonschema-go/jsonschema"
)

func main() {
	log.SetOutput(os.Stderr)
	home := flag.String("home", defaultHome(), "data and config directory")
	listen := flag.String("listen", "127.0.0.1:0", "gateway listen address")
	origins := flag.String("allow-origin", "", "comma-separated extra WebSocket origin patterns")
	watchStdin := flag.Bool("watch-stdin", false, "exit when stdin closes")
	checkConfig := flag.String("check-config", "", "check a config file for this home and exit")
	configSchema := flag.Bool("config-schema", false, "print the JSON Schema of --check-config's output and exit")
	listSkills := flag.Bool("list-skills", false, "list the skills in this home's skills_dir and exit")
	checkSkills := flag.String("check-skills", "", "list the skills in a directory and exit")
	skillsSchema := flag.Bool("skills-schema", false, "print the JSON Schema of the skills modes' output and exit")
	flag.Parse()

	switch {
	case *configSchema:
		os.Exit(printSchema[checkResult]())
	case *checkConfig != "":
		os.Exit(check(*checkConfig, *home))
	case *skillsSchema:
		os.Exit(printSchema[skillsResult]())
	case *listSkills:
		os.Exit(printSkills(configuredSkills(*home)))
	case *checkSkills != "":
		os.Exit(printSkills(skillsIn(*checkSkills)))
	}

	if err := run(*home, *listen, splitList(*origins), *watchStdin); err != nil {
		handshake.Fatal(err, filepath.Join(*home, config.FileName))
		log.Printf("ollupid: %v", err)
		os.Exit(1)
	}
}

func run(home, listen string, origins []string, watchStdin bool) error {
	token := os.Getenv("OLLUPI_GATEWAY_TOKEN")
	if strings.TrimSpace(token) == "" {
		return errors.New("OLLUPI_GATEWAY_TOKEN is not set")
	}
	if err := os.MkdirAll(home, 0o755); err != nil {
		return err
	}
	cfg, err := config.Load(home)
	if err != nil {
		return err
	}
	h, err := host.New(host.Options{Home: home, Token: token, Config: cfg, AllowedOrigins: origins, Version: version(), Browser: browserEndpoint()})
	if err != nil {
		return err
	}
	ln, err := net.Listen("tcp", listen)
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if watchStdin {
		go func() {
			_, _ = io.Copy(io.Discard, os.Stdin)
			stop()
		}()
	}

	// Ready only once the agent has started, so a start failure is reported
	// as fatal rather than after a ready line.
	if err := h.Start(ctx); err != nil {
		ln.Close()
		return err
	}
	handshake.Ready(fmt.Sprintf("ws://%s/", ln.Addr()), version())
	return h.Serve(ctx, ln)
}

// browserEndpoint is where the app's built-in browser answers: the desktop
// passes it, and the token it takes, in the environment of every start and
// check. Outside the app there is none.
func browserEndpoint() *browser.Endpoint {
	url := os.Getenv("OLLUPI_BROWSER_URL")
	if url == "" {
		return nil
	}
	return &browser.Endpoint{URL: url, Token: os.Getenv("OLLUPI_BROWSER_TOKEN")}
}

// checkResult is --check-config's output: the config as the backend decodes
// it (defaults applied, paths resolved, the MCP env and header values
// written in the file left out) with its models as the app selects them, or
// why it would not start. API keys stay in: the app edits them like the base
// URL.
type checkResult struct {
	OK     bool              `json:"ok"`
	Config *config.Config    `json:"config,omitempty"`
	Models []config.ModelRef `json:"models,omitempty"`
	Error  string            `json:"error,omitempty"`
}

func check(path, home string) int {
	cfg, err := config.LoadFile(path, home)
	if err == nil {
		err = host.Check(home, cfg, browserEndpoint())
	}
	out := checkResult{Error: errorText(err)}
	if err == nil {
		for i := range cfg.MCP {
			cfg.MCP[i] = cfg.MCP[i].Redacted()
		}
		out = checkResult{OK: true, Config: &cfg, Models: cfg.ModelRefs()}
	}
	line, _ := json.Marshal(out)
	fmt.Println(string(line))
	if err != nil {
		return 1
	}
	return 0
}

// skillsResult is the skills modes' output: the folder and the skills the
// agent loads from it, or why the agent would refuse to start with it. Dir
// is empty when config.yaml sets no skills_dir, which turns skills off.
type skillsResult struct {
	OK     bool           `json:"ok"`
	Dir    string         `json:"dir"`
	Skills []skills.Skill `json:"skills,omitempty"`
	Error  string         `json:"error,omitempty"`
}

func configuredSkills(home string) skillsResult {
	cfg, err := config.LoadFile(filepath.Join(home, config.FileName), home)
	if err != nil {
		return skillsResult{Error: err.Error()}
	}
	if cfg.SkillsDir == "" {
		return skillsResult{OK: true}
	}
	return skillsIn(cfg.SkillsDir)
}

// skillsIn reads dir with the catalog the agent builds at start, so a
// folder it lists is one the agent starts with.
func skillsIn(dir string) skillsResult {
	catalog, err := skills.New(dir)
	if err != nil {
		return skillsResult{Dir: dir, Error: err.Error()}
	}
	return skillsResult{OK: true, Dir: dir, Skills: catalog.All()}
}

func printSkills(out skillsResult) int {
	line, _ := json.Marshal(out)
	fmt.Println(string(line))
	if !out.OK {
		return 1
	}
	return 0
}

func printSchema[T any]() int {
	s, err := jsonschema.For[T](nil)
	if err != nil {
		log.Printf("ollupid: %v", err)
		return 1
	}
	out, _ := json.MarshalIndent(s, "", "  ")
	fmt.Println(string(out))
	return 0
}

func defaultHome() string {
	if v := os.Getenv("OLLUPI_HOME"); v != "" {
		return v
	}
	dir, err := os.UserHomeDir()
	if err != nil {
		return ".ollupi"
	}
	return filepath.Join(dir, ".ollupi")
}

func splitList(s string) []string {
	var out []string
	for _, part := range strings.Split(s, ",") {
		if part = strings.TrimSpace(part); part != "" {
			out = append(out, part)
		}
	}
	return out
}

func version() string {
	if info, ok := debug.ReadBuildInfo(); ok && info.Main.Version != "" {
		return info.Main.Version
	}
	return "dev"
}

func errorText(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}
