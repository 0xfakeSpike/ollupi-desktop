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
		schema:      object(map[string]any{"ref": ref}, "ref"),
		annotations: tool.Annotations{Title: "Click", DestructiveHint: new(true), OpenWorldHint: new(true)},
		described:   true,
	},
	{
		action:      "type",
		description: "Replace the text of a field by its ref, and optionally press Enter after it.",
		schema: object(map[string]any{
			"ref":    ref,
			"text":   map[string]any{"type": "string"},
			"submit": map[string]any{"type": "boolean", "description": "Press Enter after typing."},
		}, "ref", "text"),
		annotations: tool.Annotations{Title: "Type", DestructiveHint: new(true), OpenWorldHint: new(true)},
		described:   true,
	},
	{
		action: "paste",
		description: "Paste text into the page's focused field, or into the field a ref names, in one go, as pasting from the clipboard does: use it for a rich-text editor that ignores typed text, such as a post or comment box. The text goes in at the caret; nothing is submitted.",
		schema: object(map[string]any{
			"text": map[string]any{"type": "string", "description": "The text to paste, newlines kept."},
			"ref":  map[string]any{"type": "string", "description": "The field to paste into, from the latest snapshot; the focused field when left out."},
		}, "text"),
		annotations: tool.Annotations{Title: "Paste", DestructiveHint: new(true), OpenWorldHint: new(true)},
		described:   true,
	},
	{
		action:      "press_key",
		description: "Press a key on the focused element: Enter, Tab, Escape, Backspace, Delete, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, PageUp, PageDown, Home, End, or one character; a combination such as Control+A.",
		schema:      object(map[string]any{"key": map[string]any{"type": "string"}}, "key"),
		annotations: tool.Annotations{Title: "Press key", DestructiveHint: new(true), OpenWorldHint: new(true)},
		described:   true,
	},
	{
		action:      "scroll",
		description: "Scroll by most of a screen what is under the middle of the page, as a mouse wheel does, so a list that scrolls on its own scrolls too. Use it for what a page loads as you scroll; what is already on the page is in the snapshot's pages.",
		schema:      object(map[string]any{"direction": map[string]any{"type": "string", "enum": []string{"down", "up"}}}, "direction"),
		annotations: tool.Annotations{Title: "Scroll", ReadOnlyHint: true, OpenWorldHint: new(false)},
	},
	{
		action:      "back",
		description: "Go back to the previous page.",
		schema:      object(map[string]any{}),
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
