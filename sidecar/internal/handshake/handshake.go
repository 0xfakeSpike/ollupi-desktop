// Package handshake is the sidecar's line protocol with the process that
// supervises it: one JSON line on stdout at start, "ready" with the gateway
// URL and the profiles the store holds, or "fatal" with why the backend
// could not start. Logs go to stderr so
// stdout stays machine-readable.
package handshake

import (
	"encoding/json"
	"os"
)

type Message struct {
	Type    string `json:"type"`
	URL     string `json:"url,omitempty"`
	Version string `json:"version,omitempty"`
	Message string `json:"message,omitempty"`
	// Profiles are the users of the store, for the app to act as one.
	Profiles []string `json:"profiles,omitempty"`
}

func Ready(url, version string, profiles []string) {
	write(Message{Type: "ready", URL: url, Version: version, Profiles: profiles})
}

func Fatal(err error) { write(Message{Type: "fatal", Message: err.Error()}) }

func write(m Message) {
	line, _ := json.Marshal(m)
	os.Stdout.Write(append(line, '\n'))
}
