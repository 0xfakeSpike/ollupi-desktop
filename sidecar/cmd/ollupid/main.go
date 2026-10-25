// Command ollupid is the desktop app's backend: it embeds the ollupi agent and
// serves its gateway on a loopback port. The Electron main process spawns it,
// passes the gateway token in OLLUPI_GATEWAY_TOKEN and reads one handshake line
// from stdout. Closing stdin (the parent died) or SIGTERM shuts it down.
package main

import (
	"context"
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
)

func main() {
	log.SetOutput(os.Stderr)
	home := flag.String("home", defaultHome(), "data and config directory")
	listen := flag.String("listen", "127.0.0.1:0", "gateway listen address")
	origins := flag.String("allow-origin", "", "comma-separated extra WebSocket origin patterns")
	watchStdin := flag.Bool("watch-stdin", false, "exit when stdin closes")
	flag.Parse()

	configPath := filepath.Join(*home, config.FileName)
	if err := run(*home, *listen, splitList(*origins), *watchStdin); err != nil {
		handshake.Fatal(err, configPath)
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

	if err := h.Start(ctx); err != nil {
		ln.Close()
		return err
	}
	handshake.Ready(fmt.Sprintf("ws://%s/", ln.Addr()), version())
	return h.Serve(ctx, ln)
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
