package browser

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/0xfakeSpike/ollupi/tools"
)

// desktop answers as the app does: by thread, a description for describe
// and the page for call, and 422 for what cannot be done.
func desktop(t *testing.T) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer secret" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		var in struct {
			Thread    string         `json:"thread"`
			Action    string         `json:"action"`
			Arguments map[string]any `json:"arguments"`
		}
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			t.Fatal(err)
		}
		if in.Arguments["ref"] == "e9" {
			w.WriteHeader(http.StatusUnprocessableEntity)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "no element e9 on the page now; take a new snapshot"})
			return
		}
		switch r.URL.Path {
		case "/describe":
			_ = json.NewEncoder(w).Encode(map[string]string{"host": "example.com", "text": in.Thread + ": " + in.Action + " " + in.Arguments["ref"].(string)})
		case "/call":
			_ = json.NewEncoder(w).Encode(map[string]string{"text": "page of " + in.Thread})
		}
	}))
}

func spec(t *testing.T, p *Provider, name string) *tools.Spec {
	specs, err := p.ToolList(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	for _, s := range specs {
		if s.Name == name {
			return s
		}
	}
	t.Fatalf("no tool %s", name)
	return nil
}

func TestCallsGoToTheCallersTab(t *testing.T) {
	srv := desktop(t)
	defer srv.Close()
	p := New(Endpoint{URL: srv.URL, Token: "secret"})
	ctx := tools.WithCaller(context.Background(), tools.Caller{ThreadID: "th1"})

	res, err := p.Invoke(ctx, "browser_snapshot", map[string]any{})
	if err != nil || res.Output != "page of th1" {
		t.Fatalf("res = %+v, err = %v", res, err)
	}
	content, err := spec(t, p, "browser_click").PermissionContent(ctx, map[string]any{"ref": "e1"})
	if err != nil || content.Text != "th1: click e1" || content.Match != "example.com" || content.Parts != nil || content.Opaque {
		t.Fatalf("content = %+v, err = %v", content, err)
	}
}

func TestWhatCannotBeDoneIsTheAgentsToRead(t *testing.T) {
	srv := desktop(t)
	defer srv.Close()
	p := New(Endpoint{URL: srv.URL, Token: "secret"})
	ctx := tools.WithCaller(context.Background(), tools.Caller{ThreadID: "th1"})
	res, err := p.Invoke(ctx, "browser_click", map[string]any{"ref": "e9"})
	if err != nil || res.Err == nil || res.Output != "no element e9 on the page now; take a new snapshot" {
		t.Fatalf("res = %+v, err = %v", res, err)
	}
	if _, err := spec(t, p, "browser_click").PermissionContent(ctx, map[string]any{"ref": "e9"}); err == nil {
		t.Fatal("a call that cannot be described has no content")
	}
	bad := New(Endpoint{URL: srv.URL, Token: "wrong"})
	if _, err := bad.Invoke(ctx, "browser_snapshot", nil); err == nil {
		t.Fatal("a refused token is an error")
	}
}

func TestReadingToolsNameNoSite(t *testing.T) {
	p := New(Endpoint{})
	for _, name := range []string{"browser_snapshot", "browser_scroll"} {
		if s := spec(t, p, name); s.PermissionContent != nil || !s.Serial {
			t.Fatalf("%s: content %v, serial %v", name, s.PermissionContent != nil, s.Serial)
		}
	}
	for _, name := range []string{"browser_navigate", "browser_click", "browser_type", "browser_press_key", "browser_back"} {
		if spec(t, p, name).PermissionContent == nil {
			t.Fatalf("%s names no site", name)
		}
	}
}
