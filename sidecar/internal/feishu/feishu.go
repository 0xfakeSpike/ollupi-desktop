// Package feishu drives sessions from a Feishu (Lark) bot. A message sent to
// the bot in a direct chat starts a session; the bot answers in a topic
// under that message, and what is sent in the topic goes to the session as
// its next turn, queued behind a running one. A session begun elsewhere, on
// the desktop or by a scheduled task, gets a topic too once it has something
// to show: the bot opens it under a message of its own, sent to the first
// configured user, that names the session. Each turn is one card the bot
// keeps updating with the agent's messages and tool calls, with a button
// that stops it. Approvals and questions, the session's own and its
// subagents', come as cards of their own; whichever of Feishu or the
// desktop answers first, the card then shows how. Only the configured
// users are acted for.
//
// The bridge is another client of the agent beside the gateway: it calls
// the agent directly and is handed every event the gateway is.
package feishu

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/0xfakeSpike/ollupi-desktop/sidecar/internal/config"
	"github.com/0xfakeSpike/ollupi/agent"
	"github.com/0xfakeSpike/ollupi/agent/permission"
	"github.com/0xfakeSpike/ollupi/repo"
	"github.com/0xfakeSpike/ollupi/tools/userinput"
)

// Decider is who an approval decided from Feishu is recorded as decided by.
const Decider = "feishu"

// flushEvery spaces a turn card's updates: Feishu allows a message a few
// updates a second, and a phone needs fewer.
const flushEvery = time.Second

// Engine is what the bridge does to sessions; *agent.Agent is one. The bridge
// acts as repo.DefaultUser, the user the gateway's token is, so the desktop's
// sessions and the bot's are the same ones.
type Engine interface {
	StartThread(user, workspaceID, title string, settings permission.Settings) (repo.ThreadRow, error)
	StartTurn(user, threadID string, in agent.Input) (repo.TurnRow, error)
	InterruptTurn(user, threadID, expectedTurnID string) error
	ResolveApproval(user, threadID, approvalID string, decision repo.Decision, decidedBy string) error
	AnswerUserInput(user, threadID, itemID string, answers userinput.Answers) error
}

// Store is what the bridge reads of the database; *repo.DB is one.
type Store interface {
	ThreadRow(id string) (repo.ThreadRow, error)
	Workspaces(user string) ([]repo.WorkspaceRow, error)
}

// chat is Feishu as the bridge talks to it.
type chat interface {
	// reply answers a message in its topic, starting the topic for a
	// message not in one, and says which message it sent.
	reply(ctx context.Context, messageID, msgType, content string) (string, error)
	// send messages a user in their direct chat with the bot, and says
	// which message it sent.
	send(ctx context.Context, openID, msgType, content string) (string, error)
	// update replaces a card the bot sent.
	update(ctx context.Context, messageID, card string) error
}

type Bridge struct {
	cfg    config.Feishu
	engine Engine
	store  Store
	chat   chat
	topics *topics
	users  map[string]bool
	queue  *queue

	// Read and written only by Run's goroutine, which runs the queue.
	ctx      context.Context
	turns    map[string]*turn    // by turn ID
	requests map[string]*request // by item ID
	ours     map[string]bool     // the turns sent from Feishu, by turn ID
	seen     *recent             // the messages handled, by message ID
}

// turn is a turn's card as it stands.
type turn struct {
	id, threadID, title string
	input, cronJobID    string
	fromFeishu          bool
	lines               []string
	status              repo.TurnStatus
	err                 string
	// message is the card's, once sent.
	message string
	// dirty marks a change not yet on the card; flushing means an update
	// is due.
	dirty, flushing bool
}

func (t *turn) running() bool {
	return t.status != repo.TurnCompleted && t.status != repo.TurnInterrupted && t.status != repo.TurnFailed
}

// request is an approval's or a question's card.
type request struct {
	message  string
	question *userinput.Request
}

func newBridge(cfg config.Feishu, engine Engine, store Store, chat chat, topicsPath string) (*Bridge, error) {
	t, err := loadTopics(topicsPath)
	if err != nil {
		return nil, fmt.Errorf("feishu: %w", err)
	}
	users := map[string]bool{}
	for _, u := range cfg.Users {
		users[u] = true
	}
	return &Bridge{
		cfg: cfg, engine: engine, store: store, chat: chat, topics: t, users: users,
		queue: newQueue(), turns: map[string]*turn{}, requests: map[string]*request{}, ours: map[string]bool{}, seen: newRecent(512),
	}, nil
}

// Deliver hands the bridge an agent event. It never blocks: the agent emits
// from its own loop, which the bridge's calls into the agent wait on.
func (b *Bridge) Deliver(e agent.Event) {
	b.queue.push(func() { b.event(e) })
}

// work runs what is queued until ctx ends.
func (b *Bridge) work(ctx context.Context) {
	b.ctx = ctx
	for {
		select {
		case <-ctx.Done():
			return
		case <-b.queue.wake:
			for _, f := range b.queue.take() {
				f()
			}
		}
	}
}

// incoming is a message sent to the bot.
type incoming struct {
	id, root, chatType, msgType, content, sender string
}

func (b *Bridge) message(m incoming) {
	// Feishu delivers an event again when it is not acknowledged in time.
	if !b.seen.add(m.id) || m.chatType != "p2p" {
		return
	}
	if !b.users[m.sender] {
		b.replyText(m.id, strangerText(m.sender, len(b.users) == 0))
		return
	}
	text, ok := messageText(m.msgType, m.content)
	if !ok {
		b.replyText(m.id, "目前只能发文字。")
		return
	}
	if m.root == "" {
		b.startSession(m.id, text)
		return
	}
	threadID, ok := b.topics.thread(m.root)
	if !ok {
		b.replyText(m.id, "这个话题不对应 Ollupi 的会话。直接发一条新消息（不在话题里）来开始新会话。")
		return
	}
	if strings.TrimSpace(text) == "/stop" {
		if err := b.engine.InterruptTurn(repo.DefaultUser, threadID, ""); err != nil {
			b.replyText(m.id, "没能停止："+errorText(err))
		}
		return
	}
	b.send(m.id, threadID, text)
}

func (b *Bridge) startSession(messageID, text string) {
	workspaceID, err := b.workspace()
	if err != nil {
		b.replyText(messageID, errorText(err))
		return
	}
	t, err := b.engine.StartThread(repo.DefaultUser, workspaceID, titleFromMessage(text), permission.Settings{})
	if err != nil {
		b.replyText(messageID, "没能开始会话："+errorText(err))
		return
	}
	// Recorded before the turn starts, so its events find the topic.
	if err := b.topics.put(t.ID, messageID); err != nil {
		slog.Error("feishu: topic not recorded", "thread", t.ID, "err", err)
	}
	b.send(messageID, t.ID, text)
}

func (b *Bridge) send(messageID, threadID, text string) {
	t, err := b.engine.StartTurn(repo.DefaultUser, threadID, agent.Input{Text: text})
	if err != nil {
		b.replyText(messageID, "没能发送："+errorText(err))
		return
	}
	b.ours[t.ID] = true
	if t.Status == repo.TurnQueued {
		b.replyText(messageID, "已排队，当前这轮结束后开始。")
	}
}

// workspace is the ID of the workspace new sessions belong to, the one at
// the configured folder.
func (b *Bridge) workspace() (string, error) {
	if b.cfg.Workspace == "" {
		return "", nil
	}
	list, err := b.store.Workspaces(repo.DefaultUser)
	if err != nil {
		return "", err
	}
	for _, w := range list {
		if w.RootPath == b.cfg.Workspace && w.ArchivedAt == nil {
			return w.ID, nil
		}
	}
	return "", fmt.Errorf("没有在 %s 的工作区：先在桌面端添加它，或改 config.yaml 的 feishu.workspace", b.cfg.Workspace)
}

func (b *Bridge) event(e agent.Event) {
	if e.Kind == agent.EventThreadDeleted {
		if err := b.topics.forget(e.Thread.ID); err != nil {
			slog.Error("feishu: topic not forgotten", "thread", e.Thread.ID, "err", err)
		}
		return
	}
	// A request settles whichever thread it is in.
	if it := e.Item; it != nil && (e.Kind == agent.EventItemUpdated || e.Kind == agent.EventItemCompleted) {
		b.settle(*it, e.Kind == agent.EventItemCompleted)
	}
	root, ok := b.rootOf(e.Thread)
	if !ok {
		return
	}
	sub := root.ID != e.Thread.ID
	topic, ok := b.topics.root(root.ID)
	if !ok {
		if !shows(e.Kind, sub) {
			return
		}
		if topic, ok = b.openTopic(root); !ok {
			return
		}
	}
	switch e.Kind {
	case agent.EventApprovalRequested, agent.EventUserInputRequested:
		b.ask(topic, e.Thread.ID, *e.Item)
	case agent.EventTurnStarted:
		if !sub {
			b.turnStarted(topic, e.Thread, e.Turn)
		}
	case agent.EventItemCompleted:
		if t := b.turns[e.Turn.ID]; t != nil && !sub {
			if line := itemLine(*e.Item); line != "" {
				t.lines = append(t.lines, line)
				b.changed(t)
			}
		}
	case agent.EventTurnCompleted:
		if t := b.turns[e.Turn.ID]; t != nil && !sub {
			t.status, t.err = e.Turn.Status, e.Turn.Error
			b.flush(t)
			delete(b.turns, t.id)
			delete(b.ours, t.id)
		}
	case agent.EventError:
		if !sub {
			b.replyText(topic, "出错了："+e.Error)
		}
	}
}

// rootOf is the session a thread belongs to: itself, or the session whose
// subagent it is.
func (b *Bridge) rootOf(t repo.ThreadRow) (repo.ThreadRow, bool) {
	for t.ParentThreadID != "" {
		parent, err := b.store.ThreadRow(string(t.ParentThreadID))
		if err != nil {
			return repo.ThreadRow{}, false
		}
		t = parent
	}
	return t, true
}

// shows reports whether an event puts something in its session's topic.
func shows(kind agent.EventKind, sub bool) bool {
	switch kind {
	case agent.EventApprovalRequested, agent.EventUserInputRequested:
		return true
	case agent.EventTurnStarted, agent.EventError:
		return !sub
	}
	return false
}

// openTopic starts the topic of a session begun elsewhere, under a message
// the bot sends the first user naming the session and its workspace.
func (b *Bridge) openTopic(t repo.ThreadRow) (string, bool) {
	if len(b.cfg.Users) == 0 {
		return "", false
	}
	name := t.Title
	if name == "" {
		name = "新会话"
	}
	if ws := b.workspaceName(string(t.WorkspaceID)); ws != "" {
		name = ws + " · " + name
	}
	content, _ := json.Marshal(map[string]string{"text": name})
	id, err := b.chat.send(b.ctx, b.cfg.Users[0], "text", string(content))
	if err != nil {
		slog.Error("feishu: topic not opened", "thread", t.ID, "err", err)
		return "", false
	}
	if err := b.topics.put(t.ID, id); err != nil {
		slog.Error("feishu: topic not recorded", "thread", t.ID, "err", err)
	}
	return id, true
}

func (b *Bridge) workspaceName(id string) string {
	if id == "" {
		return ""
	}
	list, err := b.store.Workspaces(repo.DefaultUser)
	if err != nil {
		return ""
	}
	for _, w := range list {
		if w.ID == id {
			return w.Name
		}
	}
	return ""
}

// itemLine is an item as a line of its turn's card: the agent's messages,
// and its tool calls once they end. Approvals and questions have cards of
// their own.
func itemLine(it repo.ItemRow) string {
	switch it.Type {
	case repo.ItemAgentMessage:
		return strings.TrimSpace(it.Text)
	case repo.ItemToolCall:
		return callLine(it)
	case repo.ItemError:
		return "**出错了**：" + it.Text
	}
	return ""
}

func (b *Bridge) turnStarted(topic string, thread repo.ThreadRow, tr repo.TurnRow) {
	t := &turn{
		id: tr.ID, threadID: thread.ID, title: thread.Title, input: tr.Input, cronJobID: tr.CronJobID,
		fromFeishu: b.ours[tr.ID], status: tr.Status,
	}
	b.turns[t.id] = t
	content, _ := json.Marshal(turnCard(t))
	id, err := b.chat.reply(b.ctx, topic, "interactive", string(content))
	if err != nil {
		slog.Error("feishu: turn card not sent", "turn", t.id, "err", err)
		return
	}
	t.message = id
}

// changed puts a turn's change on its card within flushEvery.
func (b *Bridge) changed(t *turn) {
	t.dirty = true
	if t.flushing {
		return
	}
	t.flushing = true
	time.AfterFunc(flushEvery, func() {
		b.queue.push(func() {
			t.flushing = false
			if t.dirty {
				b.flush(t)
			}
		})
	})
}

func (b *Bridge) flush(t *turn) {
	t.dirty = false
	if t.message == "" {
		return
	}
	content, _ := json.Marshal(turnCard(t))
	if err := b.chat.update(b.ctx, t.message, string(content)); err != nil {
		slog.Error("feishu: turn card not updated", "turn", t.id, "err", err)
	}
}

// ask sends an approval's or a question's card, once: the agent reports a
// request again when it resumes one.
func (b *Bridge) ask(topic, threadID string, it repo.ItemRow) {
	if _, ok := b.requests[it.ID]; ok {
		return
	}
	r := &request{}
	var c card
	if it.WaitsForApproval() {
		c = approvalCard(threadID, it)
	} else {
		req, err := userinput.Decode(it.Await.Request)
		if err != nil {
			slog.Error("feishu: question not sent", "item", it.ID, "err", err)
			return
		}
		r.question = &req
		c = questionCard(threadID, it, req)
	}
	content, _ := json.Marshal(c)
	id, err := b.chat.reply(b.ctx, topic, "interactive", string(content))
	if err != nil {
		slog.Error("feishu: request not sent", "item", it.ID, "err", err)
		return
	}
	r.message = id
	b.requests[it.ID] = r
}

// settle shows on a request's card that it was answered, here or on the
// desktop, or that its turn ended first.
func (b *Bridge) settle(it repo.ItemRow, completed bool) {
	r := b.requests[it.ID]
	if r == nil || it.WaitsOnUser() {
		return
	}
	var c card
	if r.question != nil {
		if !completed {
			return
		}
		c = settledQuestionCard(*r.question, it.Status == repo.ItemCompleted)
	} else {
		if it.Approval == nil {
			return
		}
		c = settledApprovalCard(it)
	}
	delete(b.requests, it.ID)
	content, _ := json.Marshal(c)
	if err := b.chat.update(b.ctx, r.message, string(content)); err != nil {
		slog.Error("feishu: request card not updated", "item", it.ID, "err", err)
	}
}

// press is a card's button pressed, or its form sent, by operator. It runs
// on Feishu's goroutine and answers with a toast; the cards change when the
// agent reports what the press did.
func (b *Bridge) press(operator string, value, form map[string]any) (toast string, ok bool) {
	if !b.users[operator] {
		return "你还不能用这个机器人", false
	}
	str := func(k string) string { s, _ := value[k].(string); return s }
	var err error
	switch str("action") {
	case actionStop:
		err = b.engine.InterruptTurn(repo.DefaultUser, str("thread"), str("turn"))
		toast = "已停止"
	case actionApprove:
		err = b.engine.ResolveApproval(repo.DefaultUser, str("thread"), str("approval"), repo.Decision(str("decision")), Decider)
		toast = "已提交"
	case actionAnswer:
		answers, missing := formAnswers(value["questions"], form)
		if missing {
			return "还有问题没回答", false
		}
		err = b.engine.AnswerUserInput(repo.DefaultUser, str("thread"), str("item"), answers)
		toast = "已提交"
	default:
		return "这个按钮已失效", false
	}
	if err != nil {
		return errorText(err), false
	}
	return toast, true
}

// formAnswers reads a question card's form: each question's own words if
// written, else its pick.
func formAnswers(ids any, form map[string]any) (userinput.Answers, bool) {
	list, _ := ids.([]any)
	answers := userinput.Answers{}
	for _, v := range list {
		id, _ := v.(string)
		text, _ := form[textField(id)].(string)
		pick, _ := form[pickField(id)].(string)
		answer := strings.TrimSpace(text)
		if answer == "" {
			answer = pick
		}
		if answer == "" {
			return nil, true
		}
		answers[id] = userinput.Answer{Answers: []string{answer}}
	}
	return answers, len(answers) == 0
}

func (b *Bridge) replyText(messageID, text string) {
	content, _ := json.Marshal(map[string]string{"text": text})
	if _, err := b.chat.reply(b.ctx, messageID, "text", string(content)); err != nil {
		slog.Error("feishu: reply not sent", "message", messageID, "err", err)
	}
}

// messageText is the text of a text message, or of a rich-text (post)
// message's text runs.
func messageText(msgType, content string) (string, bool) {
	switch msgType {
	case "text":
		var m struct {
			Text string `json:"text"`
		}
		if json.Unmarshal([]byte(content), &m) != nil || strings.TrimSpace(m.Text) == "" {
			return "", false
		}
		return m.Text, true
	case "post":
		var m struct {
			Title   string `json:"title"`
			Content [][]struct {
				Tag  string `json:"tag"`
				Text string `json:"text"`
			} `json:"content"`
		}
		if json.Unmarshal([]byte(content), &m) != nil {
			return "", false
		}
		var lines []string
		if m.Title != "" {
			lines = append(lines, m.Title)
		}
		for _, para := range m.Content {
			var line strings.Builder
			for _, run := range para {
				if run.Tag == "text" || run.Tag == "a" || run.Tag == "code_block" {
					line.WriteString(run.Text)
				}
			}
			lines = append(lines, line.String())
		}
		text := strings.Join(lines, "\n")
		return text, strings.TrimSpace(text) != ""
	}
	return "", false
}

// strangerText answers someone not listed with their open_id. With no one
// listed yet it is the setup's last step: whoever set the bot up learns
// their own.
func strangerText(openID string, noneListed bool) string {
	if noneListed {
		return fmt.Sprintf("连上了！最后一步：你的 open_id 是 %s，把它填进 Ollupi 的 设置 → 飞书机器人 → 为谁操作，点保存并重启，之后发消息就会开始会话。", openID)
	}
	return fmt.Sprintf("这个机器人只替名单里的人操作。你的 open_id 是 %s；要用的话，请设置它的人把它加进 Ollupi 的 设置 → 飞书机器人 → 为谁操作。", openID)
}

func errorText(err error) string {
	switch {
	case errors.Is(err, agent.ErrNoActiveTurn):
		return "现在没有在跑的一轮"
	case errors.Is(err, agent.ErrThreadArchived):
		return "会话已归档，先在桌面端恢复"
	}
	return err.Error()
}

// queue holds work for Run's goroutine, without bound: the agent must
// never wait on the bridge.
type queue struct {
	mu    sync.Mutex
	items []func()
	wake  chan struct{}
}

func newQueue() *queue { return &queue{wake: make(chan struct{}, 1)} }

func (q *queue) push(f func()) {
	q.mu.Lock()
	q.items = append(q.items, f)
	q.mu.Unlock()
	select {
	case q.wake <- struct{}{}:
	default:
	}
}

func (q *queue) take() []func() {
	q.mu.Lock()
	defer q.mu.Unlock()
	items := q.items
	q.items = nil
	return items
}

// recent remembers the last n keys added.
type recent struct {
	keys  map[string]bool
	order []string
	n     int
}

func newRecent(n int) *recent { return &recent{keys: map[string]bool{}, n: n} }

// add reports whether key is new.
func (r *recent) add(key string) bool {
	if r.keys[key] {
		return false
	}
	r.keys[key] = true
	r.order = append(r.order, key)
	if len(r.order) > r.n {
		delete(r.keys, r.order[0])
		r.order = r.order[1:]
	}
	return true
}
