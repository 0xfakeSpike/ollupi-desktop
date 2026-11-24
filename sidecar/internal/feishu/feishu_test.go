package feishu

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"testing"

	"github.com/0xfakeSpike/ollupi-desktop/sidecar/internal/config"
	"github.com/0xfakeSpike/ollupi/account"
	"github.com/0xfakeSpike/ollupi/app"
	"github.com/0xfakeSpike/ollupi/ask"
	"github.com/0xfakeSpike/ollupi/conversation"
	"github.com/0xfakeSpike/ollupi/store"
	"github.com/0xfakeSpike/ollupi/tool/builtin/workspace"
)

const (
	me    = "ou_me"
	owner = "default"
)

type fakeApp struct {
	threads    []string // workspaceID + " " + title
	turns      []string // threadID + " " + text
	interrupts []string
	decisions  []string
	answers    map[string]ask.Answers
	// busy queues each message after the first behind it.
	busy bool
}

func (f *fakeApp) StartThread(_ context.Context, u, workspaceID, _, title string) (store.Thread, error) {
	if u != owner {
		return store.Thread{}, store.ErrNotFound
	}
	f.threads = append(f.threads, workspaceID+" "+title)
	return store.Thread{Thread: account.Thread{ID: fmt.Sprintf("thread-%d", len(f.threads)), Title: title}}, nil
}

func (f *fakeApp) Send(_ context.Context, u, threadID string, in app.Input) (conversation.Turn, bool, error) {
	if u != owner {
		return conversation.Turn{}, false, store.ErrNotFound
	}
	f.turns = append(f.turns, threadID+" "+in.Text)
	return conversation.Turn{ID: fmt.Sprintf("turn-%d", len(f.turns))}, !f.busy || len(f.turns) == 1, nil
}

func (f *fakeApp) Interrupt(_ context.Context, u, threadID, turnID string) error {
	if u != owner {
		return store.ErrNotFound
	}
	f.interrupts = append(f.interrupts, threadID+" "+turnID)
	return nil
}

func (f *fakeApp) Decide(_ context.Context, u, threadID, approvalID string, d conversation.Decision) error {
	if u != owner {
		return store.ErrNotFound
	}
	f.decisions = append(f.decisions, strings.Join([]string{threadID, approvalID, string(d)}, " "))
	return nil
}

func (f *fakeApp) Answer(_ context.Context, u, threadID, itemID string, answers ask.Answers) error {
	if u != owner {
		return store.ErrNotFound
	}
	if f.answers == nil {
		f.answers = map[string]ask.Answers{}
	}
	f.answers[threadID+" "+itemID] = answers
	return nil
}

func (*fakeApp) Workspaces(_ context.Context, u string) ([]account.Workspace, int64, error) {
	if u != owner {
		return nil, 0, nil
	}
	return []account.Workspace{{ID: "ws-1", Name: "app", Root: "/code/app"}}, 1, nil
}

// fakeStore reads only what the bridge reads: conversations' headers and
// the turn each has in progress.
type fakeStore struct {
	threads map[string]store.Thread
	active  map[string]string
	feed    *store.Feed
}

type fakeReader struct {
	store.Reader
	s fakeStore
}

func (s fakeStore) Read(_ context.Context, fn func(store.Reader) error) error {
	return fn(fakeReader{s: s})
}

func (s fakeStore) Feed() *store.Feed { return s.feed }

func (r fakeReader) Thread(id string) (store.Thread, error) {
	if t, ok := r.s.threads[id]; ok {
		return t, nil
	}
	return store.Thread{}, store.ErrNotFound
}

func (r fakeReader) View(id string) (conversation.View, error) {
	var v conversation.View
	if turn := r.s.active[id]; turn != "" {
		v.Apply(conversation.Entry{Turn: turn, Body: conversation.TurnQueued{}})
	}
	return v, nil
}

func thread(id, parent, workspace, title string) store.Thread {
	return store.Thread{User: owner, Thread: account.Thread{ID: id, Parent: parent, Workspace: workspace, Title: title}}
}

// sent is a message the bot sent or a card it updated.
type sent struct {
	to, msgType, content string
}

type fakeChat struct {
	sends   []sent
	replies []sent
	updates []sent
}

func (c *fakeChat) send(_ context.Context, openID, msgType, content string) (string, error) {
	c.sends = append(c.sends, sent{openID, msgType, content})
	return fmt.Sprintf("root-%d", len(c.sends)), nil
}

func (c *fakeChat) reply(_ context.Context, messageID, msgType, content string) (string, error) {
	c.replies = append(c.replies, sent{messageID, msgType, content})
	return fmt.Sprintf("bot-%d", len(c.replies)), nil
}

func (c *fakeChat) update(_ context.Context, messageID, card string) error {
	c.updates = append(c.updates, sent{messageID, "interactive", card})
	return nil
}

func newTest(t *testing.T) (*Bridge, *fakeApp, *fakeChat, string) {
	t.Helper()
	a, chat := &fakeApp{}, &fakeChat{}
	path := filepath.Join(t.TempDir(), "feishu.json")
	st := fakeStore{
		threads: map[string]store.Thread{
			"thread-1": thread("thread-1", "", "", "fix it"),
			"sub-1":    thread("sub-1", "thread-1", "", ""),
			"desk-1":   thread("desk-1", "", "ws-1", "fix the login"),
		},
		active: map[string]string{"thread-1": "turn-1"},
		feed:   store.NewFeed(),
	}
	b, err := newBridge(config.Feishu{AppID: "cli", AppSecret: "s", Profile: owner, Users: []string{me}, Workspace: "/code/app"}, a, st, chat, path)
	if err != nil {
		t.Fatal(err)
	}
	b.ctx = context.Background()
	return b, a, chat, path
}

// change hands the bridge what a commit did to a conversation, as the feed
// does, and runs it.
func change(b *Bridge, threadID string, c store.Change) {
	b.hear(store.Event{User: owner, Thread: threadID, Change: &c})
	run(b)
}

// started is the change that puts a turn in progress, with the message it
// was sent.
func started(id, text string) store.Change {
	return store.Change{
		Turns:  []conversation.Turn{{ID: id}},
		Items:  []conversation.Item{{ID: id + "-m", Turn: id, Kind: conversation.ItemUserMessage, Status: conversation.Done, Text: text}},
		Active: id,
	}
}

func endedTurn(id string, how conversation.End) conversation.Turn {
	return conversation.Turn{ID: id, Ended: &conversation.Ending{Status: how}}
}

func call(tool string, p *workspace.Prepared) *conversation.ToolCall {
	c := &conversation.ToolCall{Tool: tool, Arguments: "{}"}
	if p != nil {
		c.Prepared, _ = json.Marshal(p)
	}
	return c
}

// run does what is queued, as Run's goroutine would.
func run(b *Bridge) {
	for _, f := range b.queue.take() {
		f()
	}
}

func text(id, root, s string) incoming {
	content, _ := json.Marshal(map[string]string{"text": s})
	return incoming{id: id, root: root, chatType: "p2p", msgType: "text", content: string(content), sender: me}
}

func TestStrangerIsToldTheirOpenID(t *testing.T) {
	b, a, chat, _ := newTest(t)
	m := text("m1", "", "hi")
	m.sender = "ou_other"
	b.message(m)
	if len(a.threads) != 0 || len(chat.replies) != 1 || !strings.Contains(chat.replies[0].content, "ou_other") || !strings.Contains(chat.replies[0].content, "名单") {
		t.Fatalf("threads %v, replies %+v", a.threads, chat.replies)
	}
}

func TestFirstMessageFinishesSetup(t *testing.T) {
	b, a, chat, _ := newTest(t)
	b.users = map[string]bool{}
	b.message(text("m1", "", "hi"))
	if len(a.threads) != 0 || len(chat.replies) != 1 || !strings.Contains(chat.replies[0].content, me) || !strings.Contains(chat.replies[0].content, "设置 → 飞书机器人 → 为谁操作") {
		t.Fatalf("threads %v, replies %+v", a.threads, chat.replies)
	}
}

func TestMessageStartsSessionInItsTopic(t *testing.T) {
	b, a, chat, path := newTest(t)
	b.message(text("m1", "", "  fix the login\nbug details"))
	b.message(text("m1", "", "  fix the login\nbug details")) // delivered again
	b.message(incoming{id: "g1", chatType: "group", msgType: "text", content: `{"text":"x"}`, sender: me})
	if want := []string{"ws-1 fix the login"}; fmt.Sprint(a.threads) != fmt.Sprint(want) {
		t.Fatalf("threads = %v", a.threads)
	}
	if want := []string{"thread-1   fix the login\nbug details"}; fmt.Sprint(a.turns) != fmt.Sprint(want) {
		t.Fatalf("turns = %q", a.turns)
	}
	// The topic outlives the backend.
	saved, err := loadTopics(path)
	if err != nil {
		t.Fatal(err)
	}
	if id, _ := saved.thread("m1"); id != "thread-1" {
		t.Fatalf("topic m1 = %q", id)
	}

	b.message(text("m2", "m1", "also the logout"))
	b.message(text("m3", "m1", " /stop "))
	b.message(text("m4", "elsewhere", "?"))
	if a.turns[1] != "thread-1 also the logout" || fmt.Sprint(a.interrupts) != "[thread-1 turn-1]" {
		t.Fatalf("turns %q, interrupts %q", a.turns, a.interrupts)
	}
	if len(chat.replies) != 1 || chat.replies[0].to != "m4" {
		t.Fatalf("replies = %+v", chat.replies)
	}
}

func TestQueuedMessageSaysSo(t *testing.T) {
	b, a, chat, _ := newTest(t)
	a.busy = true
	b.message(text("m1", "", "first"))
	b.message(text("m2", "m1", "second"))
	said := map[string]string{}
	for _, r := range chat.replies {
		if strings.Contains(r.content, "排队") {
			said[r.to] = r.content
		}
	}
	if len(said) != 1 || said["m2"] == "" {
		t.Fatalf("replies = %+v", chat.replies)
	}
}

func TestTurnIsOneCard(t *testing.T) {
	b, _, chat, _ := newTest(t)
	b.message(text("m1", "", "fix it"))
	change(b, "thread-1", started("turn-1", "fix it"))
	if len(chat.replies) != 1 || chat.replies[0].to != "m1" || !strings.Contains(chat.replies[0].content, `"action":"stop"`) {
		t.Fatalf("replies = %+v", chat.replies)
	}
	if strings.Contains(chat.replies[0].content, "桌面端发来") {
		t.Fatal("a turn sent from Feishu is labelled as the desktop's")
	}
	commit := call("run_command", &workspace.Prepared{Program: "git", Args: []string{"commit", "-m", "a b"}})
	change(b, "thread-1", store.Change{Active: "turn-1", Items: []conversation.Item{
		{ID: "i1", Turn: "turn-1", Kind: conversation.ItemReasoning, Status: conversation.Done, Text: "hmm"},
		{ID: "i2", Turn: "turn-1", Kind: conversation.ItemToolCall, Status: conversation.Pending, Call: commit},
	}})
	change(b, "thread-1", store.Change{Active: "turn-1", Items: []conversation.Item{
		{ID: "i2", Turn: "turn-1", Kind: conversation.ItemToolCall, Status: conversation.Done, Call: commit},
	}})
	change(b, "thread-1", store.Change{
		Items: []conversation.Item{{ID: "i3", Turn: "turn-1", Kind: conversation.ItemAgentMessage, Status: conversation.Done, Text: "Done."}},
		Turns: []conversation.Turn{endedTurn("turn-1", conversation.Completed)},
	})
	last := chat.updates[len(chat.updates)-1]
	if last.to != "bot-1" {
		t.Fatalf("updated %s", last.to)
	}
	for _, want := range []string{"`run_command` git commit -m 'a b'", "Done.", "完成"} {
		if !strings.Contains(last.content, want) {
			t.Fatalf("card lacks %q: %s", want, last.content)
		}
	}
	if strings.Count(last.content, "run_command") != 1 || strings.Contains(last.content, "hmm") || strings.Contains(last.content, `"action":"stop"`) {
		t.Fatalf("ended card shows a call twice, reasoning or a stop button: %s", last.content)
	}
}

func TestDesktopTurnIsLabelled(t *testing.T) {
	b, _, chat, _ := newTest(t)
	b.message(text("m1", "", "fix it"))
	// Sent while another turn ran, it waits; its card comes once it starts.
	change(b, "thread-1", store.Change{
		Turns: []conversation.Turn{{ID: "turn-9"}},
		Items: []conversation.Item{{ID: "m9", Turn: "turn-9", Kind: conversation.ItemUserMessage, Status: conversation.Done, Text: "and the tests"}},
	})
	if len(chat.replies) != 0 {
		t.Fatalf("a waiting turn has a card: %+v", chat.replies)
	}
	change(b, "thread-1", store.Change{Turns: []conversation.Turn{{ID: "turn-9"}}, Active: "turn-9"})
	if len(chat.replies) != 1 || !strings.Contains(chat.replies[0].content, "桌面端发来：and the tests") {
		t.Fatalf("replies = %+v", chat.replies)
	}
}

func TestDesktopSessionOpensItsTopic(t *testing.T) {
	b, a, chat, path := newTest(t)
	// Nothing to show yet: no topic.
	change(b, "desk-1", store.Change{Items: []conversation.Item{{ID: "i0", Turn: "turn-0", Kind: conversation.ItemAgentMessage, Status: conversation.Done, Text: "x"}}})
	if len(chat.sends) != 0 {
		t.Fatalf("sends = %+v", chat.sends)
	}

	change(b, "desk-1", started("turn-1", "fix the login"))
	change(b, "desk-1", store.Change{Turns: []conversation.Turn{endedTurn("turn-1", conversation.Completed)}})
	change(b, "desk-1", started("turn-2", "and the docs"))
	if len(chat.sends) != 1 || chat.sends[0].to != me || !strings.Contains(chat.sends[0].content, "app · fix the login") {
		t.Fatalf("sends = %+v", chat.sends)
	}
	if len(chat.replies) != 2 || chat.replies[0].to != "root-1" || chat.replies[1].to != "root-1" || !strings.Contains(chat.replies[0].content, "桌面端发来") {
		t.Fatalf("replies = %+v", chat.replies)
	}

	// The topic is the session's, from Feishu too, and outlives the backend.
	saved, _ := loadTopics(path)
	if id, _ := saved.thread("root-1"); id != "desk-1" {
		t.Fatalf("topic root-1 = %q", id)
	}
	b.message(text("m1", "root-1", "and the tests"))
	if fmt.Sprint(a.turns) != "[desk-1 and the tests]" {
		t.Fatalf("turns = %q", a.turns)
	}
}

func approval(p *workspace.Prepared, suggested ...string) conversation.Item {
	return conversation.Item{
		ID: "call-1", Turn: "sub-turn", Kind: conversation.ItemToolCall, Status: conversation.Pending, Call: call("run_command", p),
		Approval: &conversation.Approval{ApprovalAsked: conversation.ApprovalAsked{Approval: "ap-1", Suggested: suggested}},
	}
}

func TestSubagentRequestOpensItsSessionsTopic(t *testing.T) {
	b, _, chat, _ := newTest(t)
	b.topics.forget("thread-1")
	change(b, "sub-1", store.Change{Items: []conversation.Item{approval(nil)}})
	if len(chat.sends) != 1 || !strings.Contains(chat.sends[0].content, "fix it") || len(chat.replies) != 1 || chat.replies[0].to != "root-1" {
		t.Fatalf("sends %+v, replies %+v", chat.sends, chat.replies)
	}
}

func TestSubagentApproval(t *testing.T) {
	b, a, chat, _ := newTest(t)
	b.message(text("m1", "", "fix it"))
	it := approval(&workspace.Prepared{Program: "rm", Args: []string{"-rf", "build"}}, "run_command(rm:*)")
	change(b, "sub-1", store.Change{Items: []conversation.Item{it}})
	change(b, "sub-1", store.Change{Items: []conversation.Item{it}}) // changed again, still waiting
	if len(chat.replies) != 1 || chat.replies[0].to != "m1" {
		t.Fatalf("replies = %+v", chat.replies)
	}
	c := chat.replies[0].content
	for _, want := range []string{"rm -rf build", `"decision":"accept"`, `"decision":"acceptForSession"`, `"decision":"decline"`, `"thread":"sub-1"`} {
		if !strings.Contains(c, want) {
			t.Fatalf("card lacks %q: %s", want, c)
		}
	}
	if strings.Contains(c, "acceptAlways") {
		t.Fatal("the card offers always-allow")
	}

	if _, ok := b.press("ou_other", map[string]any{"action": actionApprove}, nil); ok {
		t.Fatal("a stranger's press was taken")
	}
	if _, ok := b.press(me, map[string]any{"action": actionApprove, "thread": "sub-1", "approval": "ap-1", "decision": "accept"}, nil); !ok {
		t.Fatal("press refused")
	}
	if want := "[sub-1 ap-1 accept]"; fmt.Sprint(a.decisions) != want {
		t.Fatalf("decisions = %v", a.decisions)
	}

	it.Status, it.Approval.Decision = conversation.InProgress, conversation.Accept
	change(b, "sub-1", store.Change{Items: []conversation.Item{it}})
	if len(chat.updates) != 1 || chat.updates[0].to != "bot-1" || !strings.Contains(chat.updates[0].content, "允许一次") || !strings.Contains(chat.updates[0].content, "在飞书") {
		t.Fatalf("updates = %+v", chat.updates)
	}
}

func TestApprovalDecidedOnTheDesktop(t *testing.T) {
	b, _, chat, _ := newTest(t)
	b.message(text("m1", "", "fix it"))
	it := approval(nil)
	change(b, "sub-1", store.Change{Items: []conversation.Item{it}})
	it.Status, it.Approval.Decision = conversation.Declined, conversation.Decline
	change(b, "sub-1", store.Change{Items: []conversation.Item{it}})
	if len(chat.updates) != 1 || !strings.Contains(chat.updates[0].content, "拒绝") || !strings.Contains(chat.updates[0].content, "在桌面") {
		t.Fatalf("updates = %+v", chat.updates)
	}
}

func TestQuestionForm(t *testing.T) {
	b, a, chat, _ := newTest(t)
	b.message(text("m1", "", "fix it"))
	req, _ := json.Marshal(ask.Request{Questions: []ask.Question{
		{ID: "db", Question: "Which database?", Options: []ask.Option{{Label: "SQLite"}, {Label: "Postgres"}}},
		{ID: "name", Question: "Table name?"},
	}})
	it := conversation.Item{ID: "ask-1", Turn: "turn-1", Kind: conversation.ItemToolCall, Status: conversation.InProgress, Call: call(ask.Tool, nil),
		Input: &conversation.InputRequest{Request: req}}
	change(b, "thread-1", store.Change{Items: []conversation.Item{it}})
	if len(chat.replies) != 1 || !strings.Contains(chat.replies[0].content, `"pick_db"`) || !strings.Contains(chat.replies[0].content, `"text_name"`) {
		t.Fatalf("replies = %+v", chat.replies)
	}

	value := map[string]any{"action": actionAnswer, "thread": "thread-1", "item": "ask-1", "questions": []any{"db", "name"}}
	if _, ok := b.press(me, value, map[string]any{"pick_db": "SQLite"}); ok {
		t.Fatal("a form missing an answer was sent")
	}
	if _, ok := b.press(me, value, map[string]any{"pick_db": "SQLite", "text_db": "", "text_name": " users "}); !ok {
		t.Fatal("press refused")
	}
	got := a.answers["thread-1 ask-1"]
	if got["db"].Answers[0] != "SQLite" || got["name"].Answers[0] != "users" {
		t.Fatalf("answers = %+v", got)
	}

	it.Status, it.Input.Answered = conversation.Done, true
	change(b, "thread-1", store.Change{Items: []conversation.Item{it}})
	if len(chat.updates) != 1 || !strings.Contains(chat.updates[0].content, "已回答") {
		t.Fatalf("updates = %+v", chat.updates)
	}
}

func TestStopEndsTheTurnInProgress(t *testing.T) {
	b, a, chat, _ := newTest(t)
	b.message(text("m1", "", "fix it"))
	b.message(text("m2", "m1", "/stop"))
	if fmt.Sprint(a.interrupts) != "[thread-1 turn-1]" {
		t.Fatalf("interrupts = %q", a.interrupts)
	}
	b.topics.put("desk-1", "root-9")
	b.message(text("m3", "root-9", "/stop"))
	if len(chat.replies) != 1 || !strings.Contains(chat.replies[0].content, "没有在跑") {
		t.Fatalf("replies = %+v", chat.replies)
	}
}

func TestDeletedSessionForgetsItsTopic(t *testing.T) {
	b, _, _, path := newTest(t)
	b.message(text("m1", "", "fix it"))
	change(b, "thread-1", store.Change{Deleted: true})
	saved, _ := loadTopics(path)
	if _, ok := saved.thread("m1"); ok {
		t.Fatal("topic kept")
	}
}

func TestPostMessageText(t *testing.T) {
	got, ok := messageText("post", `{"title":"T","content":[[{"tag":"text","text":"a "},{"tag":"at","user_id":"x"},{"tag":"text","text":"b"}],[{"tag":"img","image_key":"k"}]]}`)
	if !ok || got != "T\na b\n" {
		t.Fatalf("got %q %v", got, ok)
	}
}
