// Command ollupid is the desktop app's backend: it embeds the ollupi agent and
// serves its gateway on a loopback port. The Electron main process spawns it
// with the gateway token in OLLUPI_GATEWAY_TOKEN and reads one handshake line
// from stdout. SIGTERM, or stdin closing when the parent dies, shuts it down.
//
// Two other modes serve the app's config editing:
//
//	ollupid --check-config FILE   whether FILE would start; prints one JSON line
//	ollupid --config-schema       the JSON Schema of --check-config's output
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

	"github.com/0xfakeSpike/ollupi-desktop/sidecar/internal/config"
	"github.com/0xfakeSpike/ollupi-desktop/sidecar/internal/handshake"
	"github.com/0xfakeSpike/ollupi-desktop/sidecar/internal/host"
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
	flag.Parse()

	switch {
	case *configSchema:
		os.Exit(printSchema())
	case *checkConfig != "":
		os.Exit(check(*checkConfig, *home))
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
	h, err := host.New(host.Options{Home: home, Token: token, Config: cfg, AllowedOrigins: origins})
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

// checkResult is --check-config's output: the config as the backend decodes
// it (defaults applied, paths resolved, API keys left out) with its models
// as the app selects them, or why it would not start.
type checkResult struct {
	OK     bool              `json:"ok"`
	Config *config.Config    `json:"config,omitempty"`
	Models []config.ModelRef `json:"models,omitempty"`
	Error  string            `json:"error,omitempty"`
}

func check(path, home string) int {
	cfg, err := config.LoadFile(path, home)
	if err == nil {
		err = host.Check(home, cfg)
	}
	out := checkResult{Error: errorText(err)}
	if err == nil {
		// The result goes to the app's UI, which has no use for keys.
		for i := range cfg.Models {
			cfg.Models[i].APIKey = ""
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

func printSchema() int {
	s, err := jsonschema.For[checkResult](nil)
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
