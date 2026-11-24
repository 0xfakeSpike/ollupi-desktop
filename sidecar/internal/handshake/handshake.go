// Package handshake is the sidecar's line protocol with the process that
// supervises it: one JSON line on stdout at start, "ready" with the gateway
// URL or "fatal" with why the backend could not start, then one "reloaded"
// or "reload_failed" line for each SIGHUP that asks it to take the providers
// in config.yaml again. Logs go to stderr so stdout stays machine-readable.
package handshake

import (
	"encoding/json"
	"os"
)

type Message struct {
	Type       string `json:"type"`
	URL        string `json:"url,omitempty"`
	Version    string `json:"version,omitempty"`
	Message    string `json:"message,omitempty"`
	ConfigPath string `json:"configPath,omitempty"`
}

func Ready(url, version string) { write(Message{Type: "ready", URL: url, Version: version}) }

func Fatal(err error, configPath string) {
	write(Message{Type: "fatal", Message: err.Error(), ConfigPath: configPath})
}

func Reloaded(err error) {
	if err != nil {
		write(Message{Type: "reload_failed", Message: err.Error()})
		return
	}
	write(Message{Type: "reloaded"})
}

func write(m Message) {
	line, _ := json.Marshal(m)
	os.Stdout.Write(append(line, '\n'))
}
