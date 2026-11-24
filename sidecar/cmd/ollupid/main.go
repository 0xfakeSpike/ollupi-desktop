// Command ollupid is the desktop app's backend: it embeds the ollupi agent and
// serves its gateway on a loopback port. The Electron main process spawns it
// with the gateway token in OLLUPI_GATEWAY_TOKEN and reads one handshake line
// from stdout. SIGTERM, or stdin closing when the parent dies, shuts it down.
//
// Other modes serve the app's config and skill editing; each prints one JSON
// line:
//
//	ollupid --check-config FILE   whether FILE would start
//	ollupid --import-config       take apart an older config.yaml that declares models per profile or a skills_dir, once
//	ollupid --delete-profile ID   delete a profile's data from the store, with the backend stopped
//	ollupid --config-schema       the JSON Schema of --check-config's output
//	ollupid --read-skill DIR      the skill folder DIR, as the app sends it to skill/set
//	ollupid --skill-schema        the JSON Schema of --read-skill's output
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
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
	"github.com/0xfakeSpike/ollupi/store"
	storesqlite "github.com/0xfakeSpike/ollupi/store/sqlite"
	"github.com/google/jsonschema-go/jsonschema"
)

func main() {
	// ollupi logs through slog's default logger; the app keeps stderr in its log file.
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, nil)))
	home := flag.String("home", defaultHome(), "data and config directory")
	listen := flag.String("listen", "127.0.0.1:0", "gateway listen address")
	origins := flag.String("allow-origin", "", "comma-separated extra WebSocket origin patterns")
	watchStdin := flag.Bool("watch-stdin", false, "exit when stdin closes")
	checkConfig := flag.String("check-config", "", "check a config file for this home and exit")
	importConfig := flag.Bool("import-config", false, "take apart an older config.yaml that declares models per profile or a skills_dir, then exit")
	names := flag.String("names", "", "with --import-config: the app's older profiles.json, for the names and colours it kept")
	deleteProfile := flag.String("delete-profile", "", "delete a profile's data from the store, then exit")
	configSchema := flag.Bool("config-schema", false, "print the JSON Schema of --check-config's output and exit")
	readSkillDir := flag.String("read-skill", "", "read a skill folder and exit")
	skillSchema := flag.Bool("skill-schema", false, "print the JSON Schema of --read-skill's output and exit")
	flag.Parse()

	switch {
	case *importConfig:
		os.Exit(importLegacy(*home, *names))
	case *deleteProfile != "":
		os.Exit(deleteProfileData(*home, *deleteProfile))
	case *configSchema:
		os.Exit(printSchema[checkResult]())
	case *checkConfig != "":
		os.Exit(check(*checkConfig, *home))
	case *skillSchema:
		os.Exit(printSchema[readResult]())
	case *readSkillDir != "":
		os.Exit(readSkill(*readSkillDir))
	}

	if err := run(*home, *listen, splitList(*origins), *watchStdin); err != nil {
		handshake.Fatal(err, filepath.Join(*home, config.FileName))
		slog.Error("ollupid stopped", "err", err)
		os.Exit(1)
	}
}

// deleteProfileData deletes a profile's conversations, memories and settings
// from the store, while no backend has it open; the app then forgets the
// profile and removes its folders. It refuses while one of its turns is in
// progress or queued.
func deleteProfileData(home, id string) int {
	var threads []string
	st, err := storesqlite.Open(home)
	if err == nil {
		err = st.Update(context.Background(), func(tx store.Tx) error {
			threads, err = tx.DeleteUser(id)
			return err
		})
		st.Close()
	}
	out := struct {
		OK      bool     `json:"ok"`
		Threads []string `json:"threads,omitempty"`
		Error   string   `json:"error,omitempty"`
	}{OK: err == nil, Threads: threads, Error: errorText(err)}
	line, _ := json.Marshal(out)
	fmt.Println(string(line))
	if err != nil {
		return 1
	}
	return 0
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
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	h, err := host.New(ctx, host.Options{Home: home, Token: token, Config: cfg, AllowedOrigins: origins, Browser: browserEndpoint()})
	if err != nil {
		return err
	}
	ln, err := net.Listen("tcp", listen)
	if err != nil {
		return err
	}
	reload := make(chan os.Signal, 1)
	signal.Notify(reload, syscall.SIGHUP)
	defer signal.Stop(reload)
	go func() {
		for range reload {
			next, err := config.LoadFile(filepath.Join(home, config.FileName), home)
			if err == nil {
				err = h.Reload(next)
			}
			if err != nil {
				slog.Error("providers not reloaded", "err", err)
			}
			handshake.Reloaded(err)
		}
	}()
	if watchStdin {
		go func() {
			// However stdin ends, the parent is gone.
			_, _ = io.Copy(io.Discard, os.Stdin)
			stop()
		}()
	}

	// Ready only once the backend is built, so a start failure is reported
	// as fatal rather than after a ready line.
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
// it (defaults applied, paths resolved), or why it would not start. API keys
// stay in: the app edits them like the base URL.
type checkResult struct {
	OK     bool           `json:"ok"`
	Config *config.Config `json:"config,omitempty"`
	Error  string         `json:"error,omitempty"`
}

func check(path, home string) int {
	cfg, err := config.LoadFile(path, home)
	if err == nil {
		err = host.Check(home, cfg, browserEndpoint())
	}
	out := checkResult{Error: errorText(err)}
	if err == nil {
		out = checkResult{OK: true, Config: &cfg}
	}
	line, _ := json.Marshal(out)
	fmt.Println(string(line))
	if err != nil {
		return 1
	}
	return 0
}

func printSchema[T any]() int {
	s, err := jsonschema.For[T](nil)
	if err != nil {
		slog.Error("schema not generated", "err", err)
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
