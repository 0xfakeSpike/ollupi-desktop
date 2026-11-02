package feishu

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// topics records which Feishu topic each session lives in: the message that
// started the topic, by the session's thread ID. It is kept in a file of
// its own beside the database, written whole on each change, so a session
// keeps its topic across restarts.
type topics struct {
	path     string
	byThread map[string]string
	byRoot   map[string]string
}

func loadTopics(path string) (*topics, error) {
	t := &topics{path: path, byThread: map[string]string{}, byRoot: map[string]string{}}
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return t, nil
	}
	if err != nil {
		return nil, err
	}
	var file struct {
		Topics map[string]string `json:"topics"`
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	for thread, root := range file.Topics {
		t.byThread[thread], t.byRoot[root] = root, thread
	}
	return t, nil
}

// root is the message that started the thread's topic.
func (t *topics) root(threadID string) (string, bool) {
	r, ok := t.byThread[threadID]
	return r, ok
}

// thread is the session whose topic root started.
func (t *topics) thread(root string) (string, bool) {
	id, ok := t.byRoot[root]
	return id, ok
}

func (t *topics) put(threadID, root string) error {
	t.byThread[threadID], t.byRoot[root] = root, threadID
	return t.save()
}

func (t *topics) forget(threadID string) error {
	root, ok := t.byThread[threadID]
	if !ok {
		return nil
	}
	delete(t.byThread, threadID)
	delete(t.byRoot, root)
	return t.save()
}

// save writes a new file and renames it over the old, so a crash leaves
// one or the other whole.
func (t *topics) save() error {
	raw, err := json.MarshalIndent(struct {
		Topics map[string]string `json:"topics"`
	}{t.byThread}, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(t.path), 0o755); err != nil {
		return err
	}
	tmp := t.path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, t.path)
}
