package feishu

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"testing"

	"github.com/0xfakeSpike/ollupi-desktop/sidecar/internal/config"
	"github.com/0xfakeSpike/ollupi/agent"
	"github.com/0xfakeSpike/ollupi/agent/permission"
	"github.com/0xfakeSpike/ollupi/repo"
	"github.com/0xfakeSpike/ollupi/tools"
	"github.com/0xfakeSpike/ollupi/tools/userinput"
)

const me = "ou_me"

type fakeEngine struct {
	threads    []string // workspaceID + " " + title
	turns      []string // threadID + " " + text
	interrupts []string
	decisions  []string
	answers    map[string]userinput.Answers
	queued     bool
}

func (f *fakeEngine) StartThread(workspaceID, title string, _ permission.Settings) (repo.ThreadRow, error) {
	f.threads = append(f.threads, workspaceID+" "+title)
	return repo.ThreadRow{ID: fmt.Sprintf("thread-%d", len(f.threads)), Title: title}, nil
}

func (f *fakeEngine) StartTurn(threadID string, in agent.Input) (repo.TurnRow, error) {
	f.turns = append(f.turns, threadID+" "+in.Text)
	status := repo.TurnInProgress
	if f.queued {
		status = repo.TurnQueued
	}
	return repo.TurnRow{ID: fmt.Sprintf("turn-%d", len(f.turns)), ThreadID: threadID, Input: in.Text, Status: status}, nil
}

func (f *fakeEngine) InterruptTurn(threadID, turnID string) error {
	f.interrupts = append(f.interrupts, threadID+" "+turnID)
	return nil
}

func (f *fakeEngine) ResolveApproval(threadID, approvalID string, d repo.Decision, by string) error {
	f.decisions = append(f.decisions, strings.Join([]string{threadID, approvalID, string(d), by}, " "))
	return nil
}

func (f *fakeEngine) AnswerUserInput(threadID, itemID string, answers userinput.Answers) error {
	if f.answers == nil {
		f.answers = map[string]userinput.Answers{}
	}
	f.answers[threadID+" "+itemID] = answers
	return nil
}

type fakeStore struct{ threads map[string]repo.ThreadRow }

func (s fakeStore) ThreadRow(id string) (repo.ThreadRow, error) {
	if t, ok := s.threads[id]; ok {
		return t, nil
	}
	return repo.ThreadRow{}, repo.ErrNotFound
}

func (fakeStore) Workspaces() ([]repo.WorkspaceRow, error) {
	return []repo.WorkspaceRow{{ID: "ws-1", Name: "app", RootPath: "/code/app"}}, nil
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

func newTest(t *testing.T) (*Bridge, *fakeEngine, *fakeChat, string) {
	t.Helper()
	engine, chat := &fakeEngine{}, &fakeChat{}
	path := filepath.Join(t.TempDir(), "feishu.json")
	store := fakeStore{threads: map[string]repo.ThreadRow{
		"thread-1": {ID: "thread-1"},
		"sub-1":    {ID: "sub-1", ParentThreadID: "thread-1"},
	}}
	b, err := newBridge(config.Feishu{AppID: "cli", AppSecret: "s", Users: []string{me}, Workspace: "/code/app"}, engine, store, chat, path)
	if err != nil {
		t.Fatal(err)
	}
	b.ctx = context.Background()
	return b, engine, chat, path
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
	b, engine, chat, _ := newTest(t)
	m := text("m1", "", "hi")
	m.sender = "ou_other"
	b.message(m)
	if len(engine.threads) != 0 || len(chat.replies) != 1 || !strings.Contains(chat.replies[0].content, "ou_other") {
		t.Fatalf("threads %v, replies %+v", engine.threads, chat.replies)
	}
}

func TestMessageStartsSessionInItsTopic(t *testing.T) {
	b, engine, chat, path := newTest(t)
	b.message(text("m1", "", "  fix the login\nbug details"))
	b.message(text("m1", "", "  fix the login\nbug details")) // delivered again
	b.message(incoming{id: "g1", chatType: "group", msgType: "text", content: `{"text":"x"}`, sender: me})
	if want := []string{"ws-1 fix the login"}; fmt.Sprint(engine.threads) != fmt.Sprint(want) {
		t.Fatalf("threads = %v", engine.threads)
	}
	if want := []string{"thread-1   fix the login\nbug details"}; fmt.Sprint(engine.turns) != fmt.Sprint(want) {
		t.Fatalf("turns = %q", engine.turns)
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
	if engine.turns[1] != "thread-1 also the logout" || fmt.Sprint(engine.interrupts) != "[thread-1 ]" {
		t.Fatalf("turns %q, interrupts %q", engine.turns, engine.interrupts)
	}
	if len(chat.replies) != 1 || chat.replies[0].to != "m4" {
		t.Fatalf("replies = %+v", chat.replies)
	}
}

func TestQueuedMessageSaysSo(t *testing.T) {
	b, engine, chat, _ := newTest(t)
	b.message(text("m1", "", "first"))
	engine.queued = true
	b.message(text("m2", "m1", "second"))
	if len(chat.replies) != 1 || !strings.Contains(chat.replies[0].content, "排队") {
		t.Fatalf("replies = %+v", chat.replies)
	}
}

func TestTurnIsOneCard(t *testing.T) {
	b, _, chat, _ := newTest(t)
	b.message(text("m1", "", "fix it"))
	thread := repo.ThreadRow{ID: "thread-1", Title: "fix it"}
	tr := repo.TurnRow{ID: "turn-1", ThreadID: "thread-1", Input: "fix it", Status: repo.TurnInProgress}
	b.Deliver(agent.Event{Kind: agent.EventTurnStarted, Thread: thread, Turn: tr})
	run(b)
	if len(chat.replies) != 1 || chat.replies[0].to != "m1" || !strings.Contains(chat.replies[0].content, `"action":"stop"`) {
		t.Fatalf("replies = %+v", chat.replies)
	}
	if strings.Contains(chat.replies[0].content, "桌面端发来") {
		t.Fatal("a turn sent from Feishu is labelled as the desktop's")
	}
	items := []repo.ItemRow{
		{ID: "i1", Type: repo.ItemReasoning, Text: "hmm"},
		{ID: "i2", Type: repo.ItemToolCall, Tool: "run_command", Status: repo.ItemCompleted, PreparedExecution: &tools.Prepared{Program: "git", Args: []string{"commit", "-m", "a b"}}},
		{ID: "i3", Type: repo.ItemAgentMessage, Text: "Done."},
	}
	for i := range items {
		b.Deliver(agent.Event{Kind: agent.EventItemCompleted, Thread: thread, Turn: tr, Item: &items[i]})
	}
	tr.Status = repo.TurnCompleted
	b.Deliver(agent.Event{Kind: agent.EventTurnCompleted, Thread: thread, Turn: tr})
	run(b)
	last := chat.updates[len(chat.updates)-1]
	if last.to != "bot-1" {
		t.Fatalf("updated %s", last.to)
	}
	for _, want := range []string{"`run_command` git commit -m 'a b'", "Done.", "完成"} {
		if !strings.Contains(last.content, want) {
			t.Fatalf("card lacks %q: %s", want, last.content)
		}
	}
	if strings.Contains(last.content, "hmm") || strings.Contains(last.content, `"action":"stop"`) {
		t.Fatalf("ended card shows reasoning or a stop button: %s", last.content)
	}
}

func TestDesktopTurnIsLabelled(t *testing.T) {
	b, _, chat, _ := newTest(t)
	b.message(text("m1", "", "fix it"))
	b.Deliver(agent.Event{Kind: agent.EventTurnStarted, Thread: repo.ThreadRow{ID: "thread-1"}, Turn: repo.TurnRow{ID: "turn-9", Input: "and the tests", Status: repo.TurnInProgress}})
	run(b)
	if len(chat.replies) != 1 || !strings.Contains(chat.replies[0].content, "桌面端发来：and the tests") {
		t.Fatalf("replies = %+v", chat.replies)
	}
}

func TestDesktopSessionOpensItsTopic(t *testing.T) {
	b, engine, chat, path := newTest(t)
	thread := repo.ThreadRow{ID: "desk-1", WorkspaceID: "ws-1", Title: "fix the login"}
	// Nothing to show yet: no topic.
	b.Deliver(agent.Event{Kind: agent.EventItemCompleted, Thread: thread, Turn: repo.TurnRow{ID: "turn-0"}, Item: &repo.ItemRow{ID: "i0", Type: repo.ItemAgentMessage, Text: "x"}})
	run(b)
	if len(chat.sends) != 0 {
		t.Fatalf("sends = %+v", chat.sends)
	}

	tr := repo.TurnRow{ID: "turn-1", ThreadID: "desk-1", Input: "fix the login", Status: repo.TurnInProgress}
	b.Deliver(agent.Event{Kind: agent.EventTurnStarted, Thread: thread, Turn: tr})
	tr.ID = "turn-2"
	b.Deliver(agent.Event{Kind: agent.EventTurnStarted, Thread: thread, Turn: tr})
	run(b)
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
	if fmt.Sprint(engine.turns) != "[desk-1 and the tests]" {
		t.Fatalf("turns = %q", engine.turns)
	}
}

func TestSubagentRequestOpensItsSessionsTopic(t *testing.T) {
	b, _, chat, _ := newTest(t)
	it := repo.ItemRow{ID: "call-1", Type: repo.ItemToolCall, Status: repo.ItemPending, Tool: "run_command", Approval: &repo.Approval{ID: "ap-1"}}
	b.Deliver(agent.Event{Kind: agent.EventApprovalRequested, Thread: repo.ThreadRow{ID: "sub-1", ParentThreadID: "thread-1"}, Item: &it})
	run(b)
	if len(chat.sends) != 1 || !strings.Contains(chat.sends[0].content, "新会话") || len(chat.replies) != 1 || chat.replies[0].to != "root-1" {
		t.Fatalf("sends %+v, replies %+v", chat.sends, chat.replies)
	}
}

func TestSubagentApproval(t *testing.T) {
	b, engine, chat, _ := newTest(t)
	b.message(text("m1", "", "fix it"))
	it := repo.ItemRow{
		ID: "call-1", Type: repo.ItemToolCall, Status: repo.ItemPending, Tool: "run_command",
		PreparedExecution: &tools.Prepared{Program: "rm", Args: []string{"-rf", "build"}},
		Approval:          &repo.Approval{ID: "ap-1", Suggested: []string{"run_command(rm:*)"}},
	}
	sub := repo.ThreadRow{ID: "sub-1", ParentThreadID: "thread-1"}
	b.Deliver(agent.Event{Kind: agent.EventApprovalRequested, Thread: sub, Item: &it})
	b.Deliver(agent.Event{Kind: agent.EventApprovalRequested, Thread: sub, Item: &it}) // reported again
	run(b)
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
	if want := "[sub-1 ap-1 accept feishu]"; fmt.Sprint(engine.decisions) != want {
		t.Fatalf("decisions = %v", engine.decisions)
	}

	it.Status, it.Approval.Decision, it.Approval.DecidedBy = repo.ItemInProgress, repo.DecisionAccept, Decider
	b.Deliver(agent.Event{Kind: agent.EventItemUpdated, Thread: sub, Item: &it})
	run(b)
	if len(chat.updates) != 1 || chat.updates[0].to != "bot-1" || !strings.Contains(chat.updates[0].content, "允许一次") || !strings.Contains(chat.updates[0].content, "在飞书") {
		t.Fatalf("updates = %+v", chat.updates)
	}
}

func TestQuestionForm(t *testing.T) {
	b, engine, chat, _ := newTest(t)
	b.message(text("m1", "", "fix it"))
	req, _ := json.Marshal(userinput.Request{Questions: []userinput.Question{
		{ID: "db", Question: "Which database?", Options: []userinput.Option{{Label: "SQLite"}, {Label: "Postgres"}}},
		{ID: "name", Question: "Table name?"},
	}})
	it := repo.ItemRow{ID: "ask-1", Type: repo.ItemToolCall, Status: repo.ItemInProgress, Await: &tools.Await{By: tools.AwaitUser, Request: req}}
	thread := repo.ThreadRow{ID: "thread-1"}
	b.Deliver(agent.Event{Kind: agent.EventUserInputRequested, Thread: thread, Item: &it})
	run(b)
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
	got := engine.answers["thread-1 ask-1"]
	if got["db"].Answers[0] != "SQLite" || got["name"].Answers[0] != "users" {
		t.Fatalf("answers = %+v", got)
	}

	it.Status = repo.ItemCompleted
	b.Deliver(agent.Event{Kind: agent.EventItemCompleted, Thread: thread, Item: &it})
	run(b)
	if len(chat.updates) != 1 || !strings.Contains(chat.updates[0].content, "已回答") {
		t.Fatalf("updates = %+v", chat.updates)
	}
}

func TestDeletedSessionForgetsItsTopic(t *testing.T) {
	b, _, _, path := newTest(t)
	b.message(text("m1", "", "fix it"))
	b.Deliver(agent.Event{Kind: agent.EventThreadDeleted, Thread: repo.ThreadRow{ID: "thread-1"}})
	run(b)
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
