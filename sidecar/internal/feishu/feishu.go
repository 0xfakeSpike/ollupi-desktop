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
// The bridge is another client of ollupi's app beside the gateway: it calls
// the app's commands as the profile the config names, so the desktop's
// sessions and the bot's are that profile's ones, and learns what changed
// from the store's feed, as the gateway does.
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
	"github.com/0xfakeSpike/ollupi/account"
	"github.com/0xfakeSpike/ollupi/app"
	"github.com/0xfakeSpike/ollupi/ask"
	"github.com/0xfakeSpike/ollupi/conversation"
	"github.com/0xfakeSpike/ollupi/store"
)

// flushEvery spaces a turn card's updates: Feishu allows a message a few
// updates a second, and a phone needs fewer.
const flushEvery = time.Second

// App is what the bridge does to sessions; *app.App is one.
type App interface {
	StartThread(ctx context.Context, u, workspace, environment, title string) (store.Thread, error)
	Send(ctx context.Context, u, id string, in app.Input) (turn conversation.Turn, inProgress bool, err error)
	Interrupt(ctx context.Context, u, id, expected string) error
	Decide(ctx context.Context, u, id, approval string, decision conversation.Decision) error
	Answer(ctx context.Context, u, id, item string, answers ask.Answers) error
	Workspaces(ctx context.Context, u string) ([]account.Workspace, int64, error)
}

// Store is where the bridge reads conversations and hears of their changes;
// store.Store is one.
type Store interface {
	Read(ctx context.Context, fn func(store.Reader) error) error
	Feed() *store.Feed
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
	cfg      config.Feishu
	profile  string
	app      App
	store    Store
	chat     chat
	topics   *topics
	users    map[string]bool
	profiles map[string]string
	queue    *queue

	// Read and written only by Run's goroutine, which runs the queue.
	ctx      context.Context
	turns    map[string]*turn    // the cards of turns in progress, by turn ID
	inputs   map[string]string   // what each turn not yet ended was sent, by turn ID
	requests map[string]*request // by item ID
	ours     map[string]bool     // the turns sent from Feishu, by turn ID
	decided  map[string]bool     // the approvals decided from Feishu, by approval ID
	seen     *recent             // the messages handled, by message ID
}

// turn is a turn's card as it stands.
type turn struct {
	id, threadID, title string
	input, cronJobID    string
	fromFeishu          bool
	lines               []string
	// line is where each item's line is among lines, by item ID.
	line map[string]int
	// ended is how the turn ended, "" while it runs.
	ended conversation.End
	err   string
	// message is the card's, once sent.
	message string
	// dirty marks a change not yet on the card; flushing means an update
	// is due.
	dirty, flushing bool
}

func (t *turn) running() bool { return t.ended == "" }

// request is an approval's or a question's card.
type request struct {
	message  string
	question *ask.Request
}

// owner is the profile an open_id acts as: the one the mapping names, or the
// configured one for an open_id it does not.
func (b *Bridge) owner(openID string) string {
	if p, ok := b.profiles[openID]; ok {
		return p
	}
	return b.cfg.Profile
}

// threadOwner is the profile a thread belongs to: a card's press names its
// thread, not the person who sent it.
func (b *Bridge) threadOwner(ctx context.Context, threadID string) (string, error) {
	var th store.Thread
	err := b.store.Read(ctx, func(r store.Reader) error {
		var err error
		th, err = r.Thread(threadID)
		return err
	})
	return th.User, err
}

func newBridge(cfg config.Feishu, a App, st Store, chat chat, topicsPath string) (*Bridge, error) {
	t, err := loadTopics(topicsPath)
	if err != nil {
		return nil, fmt.Errorf("feishu: %w", err)
	}
	users := map[string]bool{}
	for _, u := range cfg.Users {
		users[u] = true
	}
	return &Bridge{
		cfg: cfg, profile: cfg.Profile, app: a, store: st, chat: chat, topics: t, users: users, profiles: cfg.Profiles, queue: newQueue(),
		turns: map[string]*turn{}, inputs: map[string]string{}, requests: map[string]*request{}, ours: map[string]bool{},
		decided: map[string]bool{}, seen: newRecent(512),
	}, nil
}

// hear takes a change from the feed. It never blocks: the feed hands it
// over in the goroutine of the commit.
func (b *Bridge) hear(e store.Event) {
	if e.Change != nil {
		b.queue.push(func() { b.changed(e.Thread, *e.Change) })
	}
}

// work runs what is queued until ctx ends, hearing the profile's changes
// meanwhile.
func (b *Bridge) work(ctx context.Context) {
	b.ctx = ctx
	owners := map[string]bool{b.cfg.Profile: true}
	for id := range b.users {
		owners[b.owner(id)] = true
	}
	for owner := range owners {
		sub := b.store.Feed().Subscribe(owner, b.hear)
		defer sub.Close()
	}
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
	owner := b.owner(m.sender)
	text, ok := messageText(m.msgType, m.content)
	if !ok {
		b.replyText(m.id, "目前只能发文字。")
		return
	}
	if m.root == "" {
		b.startSession(owner, m.id, text)
		return
	}
	threadID, ok := b.topics.thread(m.root)
	if !ok {
		b.replyText(m.id, "这个话题不对应 Ollupi 的会话。直接发一条新消息（不在话题里）来开始新会话。")
		return
	}
	if strings.TrimSpace(text) == "/stop" {
		if err := b.stop(threadID); err != nil {
			b.replyText(m.id, "没能停止："+errorText(err))
		}
		return
	}
	b.send(owner, m.id, threadID, text)
}

// stop interrupts the turn in progress, whichever it is.
func (b *Bridge) stop(threadID string) error {
	var active string
	err := b.store.Read(b.ctx, func(r store.Reader) error {
		v, err := r.View(threadID)
		if t, ok := v.Active(); ok {
			active = t.ID
		}
		return err
	})
	if err != nil {
		return err
	}
	if active == "" {
		return app.ErrNoActiveTurn
	}
	owner, err := b.threadOwner(b.ctx, threadID)
	if err != nil {
		return err
	}
	return b.app.Interrupt(b.ctx, owner, threadID, active)
}

func (b *Bridge) startSession(owner, messageID, text string) {
	workspaceID, err := b.workspace(owner)
	if err != nil {
		b.replyText(messageID, errorText(err))
		return
	}
	t, err := b.app.StartThread(b.ctx, owner, workspaceID, "", titleFromMessage(text))
	if err != nil {
		b.replyText(messageID, "没能开始会话："+errorText(err))
		return
	}
	// Recorded before the turn starts, so its changes find the topic.
	if err := b.topics.put(t.ID, messageID); err != nil {
		slog.Error("feishu: topic not recorded", "thread", t.ID, "err", err)
	}
	b.send(owner, messageID, t.ID, text)
}

func (b *Bridge) send(owner, messageID, threadID, text string) {
	t, inProgress, err := b.app.Send(b.ctx, owner, threadID, app.Input{Text: text})
	if err != nil {
		b.replyText(messageID, "没能发送："+errorText(err))
		return
	}
	b.ours[t.ID] = true
	if !inProgress {
		b.replyText(messageID, "已排队，前面的消息处理完后回复。")
	}
}

// workspace is the ID of the workspace new sessions belong to, the one at
// the configured folder.
func (b *Bridge) workspace(owner string) (string, error) {
	if b.cfg.Workspace == "" {
		return "", nil
	}
	list, _, err := b.app.Workspaces(b.ctx, owner)
	if err != nil {
		return "", err
	}
	for _, w := range list {
		if w.Root == b.cfg.Workspace && w.Archived == nil {
			return w.ID, nil
		}
	}
	return "", fmt.Errorf("没有在 %s 的工作区：先在桌面端添加它，或改 config.yaml 的 feishu.workspace", b.cfg.Workspace)
}

// changed is what a commit did to one conversation.
func (b *Bridge) changed(threadID string, c store.Change) {
	if c.Deleted {
		if err := b.topics.forget(threadID); err != nil {
			slog.Error("feishu: topic not forgotten", "thread", threadID, "err", err)
		}
		return
	}
	// A request settles whichever conversation it is in.
	for _, it := range c.Items {
		b.settle(it)
	}
	thread, root, ok := b.rootOf(threadID)
	if !ok {
		return
	}
	sub := root.ID != thread.ID
	if !sub {
		b.turnsChanged(thread, c)
	}
	for _, it := range c.Items {
		if waitsForApproval(it) || waitsForAnswer(it) {
			if topic, ok := b.topicOf(root); ok {
				b.ask(topic, thread.ID, it)
			}
		}
	}
}

// turnsChanged keeps the cards of a session's turns: one starts when its
// turn comes to be in progress, gains a line as each of its items ends,
// and shows how the turn ended.
func (b *Bridge) turnsChanged(thread store.Thread, c store.Change) {
	for _, it := range c.Items {
		if _, ok := b.inputs[it.Turn]; !ok && it.Kind == conversation.ItemUserMessage {
			b.inputs[it.Turn] = it.Text
		}
	}
	for _, tr := range c.Turns {
		if tr.ID == c.Active && tr.Ended == nil && b.turns[tr.ID] == nil {
			if topic, ok := b.topicOf(thread); ok {
				b.turnStarted(topic, thread, tr)
			}
		}
	}
	for _, it := range c.Items {
		t := b.turns[it.Turn]
		if t == nil || !ended(it) {
			continue
		}
		if line := itemLine(it); line != "" {
			if i, ok := t.line[it.ID]; ok {
				t.lines[i] = line
			} else {
				t.line[it.ID] = len(t.lines)
				t.lines = append(t.lines, line)
			}
			b.cardChanged(t)
		}
	}
	for _, tr := range c.Turns {
		if tr.Ended == nil {
			continue
		}
		if t := b.turns[tr.ID]; t != nil {
			t.ended, t.err = tr.Ended.Status, tr.Ended.Reason
			b.flush(t)
			delete(b.turns, t.id)
		}
		delete(b.inputs, tr.ID)
		delete(b.ours, tr.ID)
	}
}

func ended(it conversation.Item) bool {
	return it.Status != conversation.Pending && it.Status != conversation.InProgress
}

func waitsForApproval(it conversation.Item) bool {
	return it.Approval != nil && it.Approval.Decision == "" && it.Status == conversation.Pending
}

func waitsForAnswer(it conversation.Item) bool {
	return it.Input != nil && !it.Input.Answered && it.Status == conversation.InProgress
}

// rootOf is a conversation, and the session it belongs to: itself, or the
// session whose subagent it is.
func (b *Bridge) rootOf(threadID string) (thread, root store.Thread, ok bool) {
	err := b.store.Read(b.ctx, func(r store.Reader) error {
		var err error
		if thread, err = r.Thread(threadID); err != nil {
			return err
		}
		root = thread
		for root.Parent != "" {
			if root, err = r.Thread(root.Parent); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		if !errors.Is(err, store.ErrNotFound) {
			slog.Error("feishu: conversation not read", "thread", threadID, "err", err)
		}
		return store.Thread{}, store.Thread{}, false
	}
	return thread, root, true
}

// topicOf is the topic of a session, opened now if it has none.
func (b *Bridge) topicOf(t store.Thread) (string, bool) {
	if topic, ok := b.topics.root(t.ID); ok {
		return topic, true
	}
	return b.openTopic(t)
}

// openTopic starts the topic of a session begun elsewhere, under a message
// the bot sends the first user naming the session and its workspace.
func (b *Bridge) openTopic(t store.Thread) (string, bool) {
	if len(b.cfg.Users) == 0 {
		return "", false
	}
	name := t.Title
	if name == "" {
		name = "新会话"
	}
	if ws := b.workspaceName(t.User, t.Workspace); ws != "" {
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

func (b *Bridge) workspaceName(owner, id string) string {
	if id == "" {
		return ""
	}
	list, _, err := b.app.Workspaces(b.ctx, owner)
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
func itemLine(it conversation.Item) string {
	switch it.Kind {
	case conversation.ItemAgentMessage:
		return strings.TrimSpace(it.Text)
	case conversation.ItemToolCall:
		return callLine(it)
	case conversation.ItemError:
		return "**出错了**：" + it.Error
	}
	return ""
}

func (b *Bridge) turnStarted(topic string, thread store.Thread, tr conversation.Turn) {
	t := &turn{
		id: tr.ID, threadID: thread.ID, title: thread.Title, input: b.inputs[tr.ID], cronJobID: tr.CronJob,
		fromFeishu: b.ours[tr.ID], line: map[string]int{},
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

// cardChanged puts a turn's change on its card within flushEvery.
func (b *Bridge) cardChanged(t *turn) {
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

// ask sends an approval's or a question's card, once: a later change to
// the call while it still waits is no new request.
func (b *Bridge) ask(topic, threadID string, it conversation.Item) {
	if _, ok := b.requests[it.ID]; ok {
		return
	}
	r := &request{}
	var c card
	if it.Approval != nil {
		c = approvalCard(threadID, it)
	} else {
		req, err := ask.Decode(it.Input.Request)
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
func (b *Bridge) settle(it conversation.Item) {
	r := b.requests[it.ID]
	if r == nil || waitsForApproval(it) || waitsForAnswer(it) {
		return
	}
	var c card
	if r.question != nil {
		if !ended(it) {
			return
		}
		c = settledQuestionCard(*r.question, it.Status == conversation.Done)
	} else {
		c = settledApprovalCard(it, b.decided[it.Approval.Approval])
		delete(b.decided, it.Approval.Approval)
	}
	delete(b.requests, it.ID)
	content, _ := json.Marshal(c)
	if err := b.chat.update(b.ctx, r.message, string(content)); err != nil {
		slog.Error("feishu: request card not updated", "item", it.ID, "err", err)
	}
}

// press is a card's button pressed, or its form sent, by operator. It runs
// on Feishu's goroutine and answers with a toast; the cards change when the
// feed tells what the press did.
func (b *Bridge) press(operator string, value, form map[string]any) (toast string, ok bool) {
	if !b.users[operator] {
		return "你还不能用这个机器人", false
	}
	str := func(k string) string { s, _ := value[k].(string); return s }
	ctx := context.Background()
	owner, err := b.threadOwner(ctx, str("thread"))
	if err != nil {
		return errorText(err), false
	}
	switch str("action") {
	case actionStop:
		err = b.app.Interrupt(ctx, owner, str("thread"), str("turn"))
		toast = "已停止"
	case actionApprove:
		approval := str("approval")
		// Marked before the decision commits, so the card it settles says
		// it was decided here.
		b.queue.push(func() { b.decided[approval] = true })
		if err = b.app.Decide(ctx, owner, str("thread"), approval, conversation.Decision(str("decision"))); err != nil {
			b.queue.push(func() { delete(b.decided, approval) })
		}
		toast = "已提交"
	case actionAnswer:
		answers, missing := formAnswers(value["questions"], form)
		if missing {
			return "还有问题没回答", false
		}
		err = b.app.Answer(ctx, owner, str("thread"), str("item"), answers)
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
func formAnswers(ids any, form map[string]any) (ask.Answers, bool) {
	list, _ := ids.([]any)
	answers := ask.Answers{}
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
		answers[id] = ask.Answer{Answers: []string{answer}}
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
	case errors.Is(err, app.ErrNoActiveTurn), errors.Is(err, app.ErrTurnMismatch):
		return "现在没有在跑的一轮"
	case errors.Is(err, app.ErrThreadArchived):
		return "会话已归档，先在桌面端恢复"
	}
	return err.Error()
}

// queue holds work for Run's goroutine, without bound: the feed must
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
