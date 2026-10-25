// Package handshake is the line protocol between the sidecar and the desktop
// process that supervises it: exactly one JSON line on stdout, either "ready"
// with the gateway URL or "fatal" with why the backend could not start. All
// logging goes to stderr so stdout stays machine-readable.
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

func Ready(url, version string) {
	write(Message{Type: "ready", URL: url, Version: version})
}

func Fatal(err error, configPath string) {
	write(Message{Type: "fatal", Message: err.Error(), ConfigPath: configPath})
}

func write(m Message) {
	line, _ := json.Marshal(m)
	os.Stdout.Write(append(line, '\n'))
}
