// Command ollupid is the desktop app's backend: the engine's server package
// with the app's browser, the skills the desktop ships and its scratch
// folder, serving the gateway on a loopback port. The Electron main process
// spawns it with the gateway's secret in OLLUPI_GATEWAY_TOKEN and the
// operator's in OLLUPI_OPERATOR_TOKEN, and reads one handshake line from
// stdout. SIGTERM, or stdin closing when the parent dies, shuts it down.
//
// Other modes serve the app; each prints one JSON line:
//
//	ollupid --import-config       take apart an older config.yaml and profiles.json into the store, then remove config.yaml, once
//	ollupid --delete-profile ID   delete a profile's data from the store, with the backend stopped
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
	"github.com/0xfakeSpike/ollupi-desktop/sidecar/internal/handshake"
	"github.com/0xfakeSpike/ollupi-desktop/sidecar/internal/host"
	"github.com/0xfakeSpike/ollupi/pkg/sandbox"
	"github.com/0xfakeSpike/ollupi/sandbox/cloudflare"
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
	hosts := flag.String("allow-host", "", "comma-separated extra Host header names")
	watchStdin := flag.Bool("watch-stdin", false, "exit when stdin closes")
	importConfig := flag.Bool("import-config", false, "take apart an older config.yaml and profiles.json into the store, remove config.yaml, then exit")
	names := flag.String("names", "", "with --import-config: the app's older profiles.json, for the names it kept")
	deleteProfile := flag.String("delete-profile", "", "delete a profile's data from the store, then exit")
	readSkillDir := flag.String("read-skill", "", "read a skill folder and exit")
	skillSchema := flag.Bool("skill-schema", false, "print the JSON Schema of --read-skill's output and exit")
	flag.Parse()

	switch {
	case *importConfig:
		os.Exit(importLegacy(*home, *names))
	case *deleteProfile != "":
		os.Exit(deleteProfileData(*home, *deleteProfile))
	case *skillSchema:
		os.Exit(printSchema[readResult]())
	case *readSkillDir != "":
		os.Exit(readSkill(*readSkillDir))
	}

	if err := run(*home, *listen, splitList(*origins), splitList(*hosts), *watchStdin); err != nil {
		handshake.Fatal(err)
		slog.Error("ollupid stopped", "err", err)
		os.Exit(1)
	}
}

// deleteProfileData deletes a profile's conversations, memories and settings
// from the store, while no backend has it open; the app then removes its
// folders. It refuses the last profile, and while one of its turns is in
// progress or queued.
func deleteProfileData(home, id string) int {
	var threads []string
	st, err := storesqlite.Open(home)
	if err == nil {
		err = st.Update(context.Background(), func(tx store.Tx) error {
			users, err := tx.Users()
			if err != nil {
				return err
			}
			if len(users) == 1 && users[0] == id {
				return errors.New("the last profile cannot be deleted")
			}
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

func run(home, listen string, origins, hosts []string, watchStdin bool) error {
	token, operator := os.Getenv("OLLUPI_GATEWAY_TOKEN"), os.Getenv("OLLUPI_OPERATOR_TOKEN")
	if strings.TrimSpace(token) == "" || strings.TrimSpace(operator) == "" {
		return errors.New("OLLUPI_GATEWAY_TOKEN and OLLUPI_OPERATOR_TOKEN must both be set")
	}
	if token == operator {
		return errors.New("OLLUPI_OPERATOR_TOKEN must differ from OLLUPI_GATEWAY_TOKEN, or every user would be the operator")
	}
	if err := os.MkdirAll(home, 0o755); err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	sandboxes, err := sandboxProviders()
	if err != nil {
		return err
	}
	h, err := host.New(ctx, host.Options{Home: home, Token: token, OperatorToken: operator, AllowedOrigins: origins, AllowedHosts: hosts, Sandboxes: sandboxes, Browser: browserEndpoint()})
	if err != nil {
		return err
	}
	ln, err := net.Listen("tcp", listen)
	if err != nil {
		return err
	}
	if watchStdin {
		go func() {
			// However stdin ends, the parent is gone.
			_, _ = io.Copy(io.Discard, os.Stdin)
			stop()
		}()
	}

	// Ready only once the backend is built, so a start failure is reported
	// as fatal rather than after a ready line.
	handshake.Ready(fmt.Sprintf("ws://%s/", ln.Addr()), version(), h.Profiles(ctx))
	return h.Serve(ctx, ln)
}

// sandboxProviders are the sandboxes this backend offers besides this
// machine: the Cloudflare bridge the app gives it in SANDBOX_API_URL, as
// `ollupi serve` takes its own.
func sandboxProviders() (map[string]sandbox.Provider, error) {
	address := strings.TrimSpace(os.Getenv("SANDBOX_API_URL"))
	if address == "" {
		return nil, nil
	}
	p, err := cloudflare.New(cloudflare.Config{BaseURL: address, APIKey: os.Getenv("SANDBOX_API_KEY")})
	if err != nil {
		return nil, err
	}
	return map[string]sandbox.Provider{"cloudflare": p}, nil
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
