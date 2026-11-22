// Package browser gives the agent the app's built-in browser as a tool
// provider. The desktop owns the browser, each thread's tabs, and answers
// on a loopback endpoint behind a token; this package names the tools and
// asks the desktop, for the thread that calls, both to act in its active
// tab and to say what an action would do. That description is the call's
// permission content: its match is the tab's host, so rules and approvals
// go by site, and ollupi works it out again before an approved call runs,
// so a tab that moved to another site is asked about again.
package browser

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/0xfakeSpike/ollupi/policy"
	"github.com/0xfakeSpike/ollupi/tool"
	"github.com/0xfakeSpike/ollupi/tool/kit"
)

// Name is the provider's, which an MCP server of the same name would clash
// with. Its tools are named browser_<action>, as ollupi names its own
// tools; the desktop is asked for the action.
const Name = "browser"

// Endpoint is where the desktop answers, and the token it takes.
type Endpoint struct {
	URL   string
	Token string
}

type Provider struct {
	endpoint Endpoint
	client   *http.Client
}

func New(e Endpoint) *Provider {
	// Long enough for a page to load after an action.
	return &Provider{endpoint: e, client: &http.Client{Timeout: 90 * time.Second}}
}

func (p *Provider) Name() (string, string) {
	return Name, "The app's built-in browser, which the user sees beside the conversation; each thread has its own tabs, and these tools act in the one the user sees."
}

type action struct {
	// action is what the desktop is asked to do; the tool is browser_<action>.
	action      string
	description string
	schema      map[string]any
	annotations tool.Annotations
	// described tools act on the tab, so a call names the site it acts on.
	described bool
}

var ref = map[string]any{"type": "string", "description": "The ref of an element in the latest snapshot, such as e12, or f1e3 inside a frame."}

// snapshot lets a call keep the page from being read back after it acts, for
// a run of edits that is read once at the end. A paste is not read back
// unless it asks.
var snapshot = map[string]any{"type": "boolean", "description": "Whether to read the page back after acting; true unless the action is a paste."}

func object(properties map[string]any, required ...string) map[string]any {
	if required == nil {
		required = []string{}
	}
	return map[string]any{"type": "object", "properties": properties, "required": required, "additionalProperties": false}
}

var catalog = []action{
	{
		action:      "navigate",
		description: "Open a web page in this conversation's tab of the app's built-in browser, the one the user sees beside the conversation; a link that opens a new tab moves you to it. Answers with the page as text, an accessibility snapshot in which each element you can act on has a ref such as e3. A long page comes in pages: the answer ends saying how many, and browser_snapshot with page reads the others.",
		schema:      object(map[string]any{"url": map[string]any{"type": "string", "description": "The address; https:// is added when it has no scheme (http:// for localhost)."}}, "url"),
		annotations: tool.Annotations{Title: "Open page", ReadOnlyHint: true, OpenWorldHint: new(true)},
		described:   true,
	},
	{
		action:      "open",
		description: "Open a web page in a new tab of this conversation's browser and make it the one actions act in, keeping the tab you are in, such as an editor you are filling. Answers with the new page as text and refs, as navigate does.",
		schema:      object(map[string]any{"url": map[string]any{"type": "string", "description": "The address; https:// is added when it has no scheme (http:// for localhost)."}}, "url"),
		annotations: tool.Annotations{Title: "Open in a new tab", ReadOnlyHint: true, OpenWorldHint: new(true)},
		described:   true,
	},
	{
		action:      "tabs",
		description: "List this conversation's tabs, and which one actions act in; with select, act in that tab from now on. Answered as text, with no page read.",
		schema: object(map[string]any{
			"select": map[string]any{"type": "integer", "minimum": 1, "description": "The number of the tab to act in from now on."},
		}),
		annotations: tool.Annotations{Title: "Tabs", ReadOnlyHint: true, OpenWorldHint: new(false)},
	},
	{
		action:      "screenshot",
		description: "Take a picture of the page and save it as a PNG on the Mac, answering where it is and how big. Use it when the layout or an image matters; a snapshot is how a page's text is read.",
		schema: object(map[string]any{
			"full": map[string]any{"type": "boolean", "description": "Capture the whole page, not only what is on screen."},
		}),
		annotations: tool.Annotations{Title: "Take a picture", ReadOnlyHint: true, OpenWorldHint: new(false)},
	},
	{
		action:      "snapshot",
		description: "Read the page open in this conversation's tab. Without page, takes a new snapshot, with fresh refs: use it after the page changes on its own, or when a ref is stale. With page, reads that page of the latest snapshot, whose refs all work until the next snapshot.",
		schema: object(map[string]any{
			"page": map[string]any{"type": "integer", "minimum": 1, "description": "A page of the latest snapshot, when it has more than one."},
		}),
		annotations: tool.Annotations{Title: "Read page", ReadOnlyHint: true, OpenWorldHint: new(false)},
	},
	{
		action:      "click",
		description: "Click an element of the page by its ref, as a person would, once it is visible, enabled and not covered.",
		schema:      object(map[string]any{"ref": ref, "snapshot": snapshot}, "ref"),
		annotations: tool.Annotations{Title: "Click", DestructiveHint: new(true), OpenWorldHint: new(true)},
		described:   true,
	},
	{
		action:      "type",
		description: "Replace the text of a field by its ref, and optionally press Enter after it.",
		schema: object(map[string]any{
			"ref":      ref,
			"text":     map[string]any{"type": "string"},
			"submit":   map[string]any{"type": "boolean", "description": "Press Enter after typing."},
			"snapshot": snapshot,
		}, "ref", "text"),
		annotations: tool.Annotations{Title: "Type", DestructiveHint: new(true), OpenWorldHint: new(true)},
		described:   true,
	},
	{
		action: "paste",
		description: "Paste text into the page's focused field, or into the field a ref names, in one go, as pasting from the clipboard does: use it for a rich-text editor that ignores typed text, such as a post or comment box. The text goes in at the caret; nothing is submitted. With html, the same text goes in as markup, so an editor that takes rich text keeps its headings, bold, lists and links. The page is not read back unless snapshot is true, so check the result with browser_snapshot.",
		schema: object(map[string]any{
			"text":     map[string]any{"type": "string", "description": "The text to paste, newlines kept; a blank line asks a rich-text editor for a new block."},
			"html":     map[string]any{"type": "string", "description": "The same text as HTML, for an editor that takes rich text."},
			"ref":      map[string]any{"type": "string", "description": "The field to paste into, from the latest snapshot; the focused field when left out."},
			"snapshot": snapshot,
		}, "text"),
		annotations: tool.Annotations{Title: "Paste", DestructiveHint: new(true), OpenWorldHint: new(true)},
		described:   true,
	},
	{
		action:      "press_key",
		description: "Press a key on the focused element: Enter, Tab, Escape, Backspace, Delete, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, PageUp, PageDown, Home, End, or one character; a combination such as Control+A.",
		schema:      object(map[string]any{"key": map[string]any{"type": "string"}, "snapshot": snapshot}, "key"),
		annotations: tool.Annotations{Title: "Press key", DestructiveHint: new(true), OpenWorldHint: new(true)},
		described:   true,
	},
	{
		action:      "scroll",
		description: "Scroll by most of a screen what is under the middle of the page, as a mouse wheel does, so a list that scrolls on its own scrolls too. Use it for what a page loads as you scroll; what is already on the page is in the snapshot's pages.",
		schema:      object(map[string]any{"direction": map[string]any{"type": "string", "enum": []string{"down", "up"}}, "snapshot": snapshot}, "direction"),
		annotations: tool.Annotations{Title: "Scroll", ReadOnlyHint: true, OpenWorldHint: new(false)},
	},
	{
		action:      "upload",
		description: "Put files from the Mac into the page's file input, by their paths, as choosing them in a file dialog does: an image into a post, a document into a form. Name the input's ref when the page has more than one.",
		schema: object(map[string]any{
			"files":    map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "description": "The paths of the files to upload, at least one."},
			"ref":      map[string]any{"type": "string", "description": "The file input, from the latest snapshot; the page's first file input when left out."},
			"snapshot": snapshot,
		}, "files"),
		annotations: tool.Annotations{Title: "Upload files", DestructiveHint: new(true), OpenWorldHint: new(true)},
		described:   true,
	},
	{
		action:      "back",
		description: "Go back to the previous page.",
		schema:      object(map[string]any{"snapshot": snapshot}),
		annotations: tool.Annotations{Title: "Back", ReadOnlyHint: true, OpenWorldHint: new(true)},
		described:   true,
	},
}

func (p *Provider) Tools(context.Context) ([]kit.Spec, error) {
	specs := make([]kit.Spec, 0, len(catalog))
	for _, t := range catalog {
		spec := kit.Spec{
			Name:        Name + "_" + t.action,
			Description: t.description,
			InputSchema: t.schema,
			Annotations: t.annotations,
			// A thread's calls share its active tab, so none runs beside another.
			Serial: true,
		}
		if t.described {
			action := t.action
			spec.Content = func(ctx context.Context, c tool.Call) (policy.Content, error) {
				return p.describe(ctx, c.Caller, action, c.Arguments)
			}
		}
		specs = append(specs, spec)
	}
	return specs, nil
}

func (p *Provider) Invoke(ctx context.Context, c tool.Call) (kit.Result, error) {
	action, ok := strings.CutPrefix(c.Tool, Name+"_")
	if !ok {
		return kit.Result{}, fmt.Errorf("browser: unknown tool %q", c.Tool)
	}
	var out struct {
		Text string `json:"text"`
	}
	if err := p.post(ctx, c.Caller, "/call", action, c.Arguments, &out); err != nil {
		return kit.Result{}, err
	}
	return kit.Result{Output: out.Text}, nil
}

func (p *Provider) describe(ctx context.Context, caller tool.Caller, action string, arguments map[string]any) (policy.Content, error) {
	var out struct {
		Host string `json:"host"`
		Text string `json:"text"`
	}
	if err := p.post(ctx, caller, "/describe", action, arguments, &out); err != nil {
		return policy.Content{}, err
	}
	return policy.Content{Text: out.Text, Match: out.Host}, nil
}

// refusal is the desktop's answer that the action cannot be done, such as a
// stale ref, as opposed to the desktop not answering.
type refusal struct{ message string }

func (r *refusal) Error() string { return r.message }

func (p *Provider) post(ctx context.Context, caller tool.Caller, path, action string, arguments map[string]any, out any) error {
	thread := caller.Thread
	if thread == "" {
		return errors.New("browser: the call names no thread")
	}
	body, err := json.Marshal(map[string]any{"thread": thread, "action": action, "arguments": arguments})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.endpoint.URL+path, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+p.endpoint.Token)
	req.Header.Set("Content-Type", "application/json")
	res, err := p.client.Do(req)
	if err != nil {
		return fmt.Errorf("browser: the app does not answer: %w", err)
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		return err
	}
	switch res.StatusCode {
	case http.StatusOK:
		return json.Unmarshal(raw, out)
	case http.StatusUnprocessableEntity:
		var e struct {
			Error string `json:"error"`
		}
		if err := json.Unmarshal(raw, &e); err != nil {
			return fmt.Errorf("browser: the app's refusal: %w", err)
		}
		return &refusal{message: e.Error}
	default:
		return fmt.Errorf("browser: the app answered %s", res.Status)
	}
}
