package feishu

import (
	"encoding/json"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/0xfakeSpike/ollupi/repo"
	"github.com/0xfakeSpike/ollupi/tools/userinput"
)

// The cards are Feishu's card JSON 2.0. Each is shared (update_multi), the
// only kind 2.0 has, so the bot can update it after it is sent.
type card = map[string]any

// bodyLimit keeps a card's text under Feishu's 30 KB per card, with room
// for the rest of the card.
const bodyLimit = 20 << 10

// Button values name what a press does; the press carries everything it
// needs, so a card still works after the backend restarts.
const (
	actionStop    = "stop"
	actionApprove = "approve"
	actionAnswer  = "answer"
)

func newCard(title, template string, tag *tag, elements ...any) card {
	header := map[string]any{"title": plain(title), "template": template}
	if tag != nil {
		header["text_tag_list"] = []any{map[string]any{"tag": "text_tag", "text": plain(tag.text), "color": tag.color}}
	}
	return card{
		"schema": "2.0",
		"config": map[string]any{"update_multi": true},
		"header": header,
		"body":   map[string]any{"elements": elements},
	}
}

type tag struct{ text, color string }

func plain(s string) map[string]any { return map[string]any{"tag": "plain_text", "content": s} }

func markdown(s string) map[string]any { return map[string]any{"tag": "markdown", "content": s} }

func button(label, kind string, value map[string]any) map[string]any {
	return map[string]any{
		"tag": "button", "text": plain(label), "type": kind,
		"behaviors": []any{map[string]any{"type": "callback", "value": value}},
	}
}

// row lays buttons side by side, wrapping on a narrow screen.
func row(buttons ...map[string]any) map[string]any {
	columns := make([]any, len(buttons))
	for i, b := range buttons {
		columns[i] = map[string]any{"tag": "column", "width": "auto", "elements": []any{b}}
	}
	return map[string]any{"tag": "column_set", "flex_mode": "flow", "horizontal_spacing": "8px", "columns": columns}
}

func grey(s string) string { return "<font color='grey'>" + s + "</font>" }

// turnCard shows one turn: where its message came from when not from
// Feishu, then the agent's messages and tool calls in order, and while it
// runs, a button that stops it.
func turnCard(t *turn) card {
	var parts []string
	switch {
	case t.cronJobID != "":
		parts = append(parts, grey("定时任务发来："+cut(oneLine(t.input), 200)))
	case !t.fromFeishu:
		parts = append(parts, grey("桌面端发来："+cut(oneLine(t.input), 200)))
	}
	parts = append(parts, t.lines...)
	if len(t.lines) == 0 && t.running() {
		parts = append(parts, grey("思考中…"))
	}
	if t.status == repo.TurnFailed && t.err != "" {
		parts = append(parts, "**出错了**："+t.err)
	}
	elements := []any{markdown(tail(strings.Join(parts, "\n\n")))}
	if t.running() {
		elements = append(elements, row(button("停止", "danger", map[string]any{"action": actionStop, "thread": t.threadID, "turn": t.id})))
	}
	s := turnStates[t.status]
	if t.running() {
		s = turnStates[repo.TurnInProgress]
	}
	return newCard(t.title, s.template, &tag{s.text, s.color}, elements...)
}

var turnStates = map[repo.TurnStatus]struct{ text, color, template string }{
	repo.TurnInProgress:  {"进行中", "blue", "blue"},
	repo.TurnCompleted:   {"完成", "green", "green"},
	repo.TurnInterrupted: {"已停止", "neutral", "grey"},
	repo.TurnFailed:      {"失败", "red", "red"},
}

// approvalCard asks for an approval with the decisions it offers, but
// "always allow": the rule it writes is better chosen on the desktop.
func approvalCard(threadID string, it repo.ItemRow) card {
	var buttons []map[string]any
	for _, d := range it.Approval.AvailableDecisions() {
		label, kind := decisionLabel(d)
		if d == repo.DecisionAcceptAlways {
			continue
		}
		buttons = append(buttons, button(label, kind, map[string]any{"action": actionApprove, "thread": threadID, "approval": it.Approval.ID, "decision": string(d)}))
	}
	return newCard("需要审批", "orange", nil, markdown(callDetails(it)), row(buttons...))
}

// settledApprovalCard replaces an approval's buttons with how it was
// decided and where.
func settledApprovalCard(it repo.ItemRow) card {
	a := it.Approval
	if a.Decision == "" {
		return newCard("审批已取消", "grey", nil, markdown(callDetails(it)))
	}
	label, _ := decisionLabel(a.Decision)
	where := "在桌面"
	if a.DecidedBy == Decider {
		where = "在飞书"
	}
	template := "green"
	if a.Decision == repo.DecisionDecline {
		template = "grey"
	}
	return newCard(label, template, &tag{where, "neutral"}, markdown(callDetails(it)))
}

func decisionLabel(d repo.Decision) (label, kind string) {
	switch d {
	case repo.DecisionAccept:
		return "允许一次", "primary"
	case repo.DecisionAcceptForSession:
		return "在此会话中允许", "default"
	case repo.DecisionAcceptAlways:
		return "总是允许", "default"
	}
	return "拒绝", "danger"
}

// callDetails is what an approval is for: the tool, then what it would
// run or change as frozen for the approval, or its arguments.
func callDetails(it repo.ItemRow) string {
	var b strings.Builder
	name := it.Tool
	if it.Server != "" {
		name = it.Server + "__" + it.Tool
	}
	fmt.Fprintf(&b, "**%s**", name)
	p := it.PreparedExecution
	switch {
	case p != nil && p.Program != "":
		fmt.Fprintf(&b, "\n```\n%s\n```", cut(commandLine(p.Program, p.Args), 2000))
		if p.Cwd != "" {
			b.WriteString("\n" + grey("在 "+p.Cwd))
		}
	case p != nil && len(p.Files) > 0:
		for _, f := range p.Files {
			fmt.Fprintf(&b, "\n- %s (+%d −%d)", f.Path, f.Added, f.Removed)
		}
	default:
		if args := strings.TrimSpace(it.Arguments); args != "" && args != "{}" {
			fmt.Fprintf(&b, "\n```\n%s\n```", cut(args, 2000))
		}
	}
	if p != nil && p.Escalated {
		b.WriteString("\n\n**需要完全访问**")
		if p.Justification != "" {
			b.WriteString("：" + p.Justification)
		}
	}
	if a := it.Approval; a != nil {
		if a.Content != "" {
			fmt.Fprintf(&b, "\n```\n%s\n```", cut(a.Content, 2000))
		}
		if a.Reason != "" {
			b.WriteString("\n" + grey(a.Reason))
		}
	}
	return b.String()
}

// questionCard asks a request_user_input's questions in one form: each a
// pick of its options, if it has any, and a box for an answer in the
// person's own words, which wins over the pick.
func questionCard(threadID string, it repo.ItemRow, req userinput.Request) card {
	ids := make([]any, len(req.Questions))
	var fields []any
	for i, q := range req.Questions {
		ids[i] = q.ID
		text := "**" + q.Question + "**"
		if q.Header != "" {
			text = grey(q.Header) + "\n" + text
		}
		for _, o := range q.Options {
			if o.Description != "" {
				text += "\n- " + o.Label + "：" + o.Description
			}
		}
		fields = append(fields, markdown(text))
		if len(q.Options) > 0 {
			options := make([]any, len(q.Options))
			for j, o := range q.Options {
				options[j] = map[string]any{"text": plain(o.Label), "value": o.Label}
			}
			fields = append(fields, map[string]any{"tag": "select_static", "name": pickField(q.ID), "placeholder": plain("选一个"), "options": options, "width": "fill"})
		}
		fields = append(fields, map[string]any{"tag": "input", "name": textField(q.ID), "placeholder": plain("或者自己写"), "width": "fill"})
	}
	submit := button("提交", "primary", map[string]any{"action": actionAnswer, "thread": threadID, "item": it.ID, "questions": ids})
	submit["name"] = "submit"
	submit["form_action_type"] = "submit"
	fields = append(fields, submit)
	return newCard("需要回答", "indigo", nil, map[string]any{"tag": "form", "name": "answers", "elements": fields})
}

func settledQuestionCard(req userinput.Request, answered bool) card {
	var lines []string
	for _, q := range req.Questions {
		lines = append(lines, "**"+q.Question+"**")
	}
	if answered {
		return newCard("已回答", "green", nil, markdown(strings.Join(lines, "\n")))
	}
	return newCard("提问已取消", "grey", nil, markdown(strings.Join(lines, "\n")))
}

func pickField(questionID string) string { return "pick_" + questionID }
func textField(questionID string) string { return "text_" + questionID }

// callLine is a tool call as one line of a turn's card.
func callLine(it repo.ItemRow) string {
	line := "`" + it.Tool + "`"
	if s := callSummary(it); s != "" {
		line += " " + strings.ReplaceAll(s, "`", "'")
	}
	switch it.Status {
	case repo.ItemFailed:
		line += "（失败）"
	case repo.ItemDeclined:
		line += "（被拒绝）"
	}
	return grey(line)
}

// callSummary is the gist of a call: the command it ran, the files it
// changed, or the argument that says what it is about.
func callSummary(it repo.ItemRow) string {
	if p := it.PreparedExecution; p != nil {
		if p.Program != "" {
			return cut(commandLine(p.Program, p.Args), 120)
		}
		if len(p.Files) > 0 {
			paths := make([]string, len(p.Files))
			for i, f := range p.Files {
				paths[i] = f.Path
			}
			return cut(strings.Join(paths, ", "), 120)
		}
	}
	var args map[string]any
	if json.Unmarshal([]byte(it.Arguments), &args) != nil {
		return ""
	}
	for _, k := range []string{"description", "command", "path", "pattern", "url", "query", "name"} {
		if s, ok := args[k].(string); ok && s != "" {
			return cut(oneLine(s), 120)
		}
	}
	return ""
}

func commandLine(program string, args []string) string {
	words := append([]string{program}, args...)
	for i, w := range words {
		if w == "" || strings.ContainsAny(w, " \t\n'\"") {
			words[i] = "'" + strings.ReplaceAll(w, "'", `'\''`) + "'"
		}
	}
	return strings.Join(words, " ")
}

func oneLine(s string) string { return strings.Join(strings.Fields(s), " ") }

// cut keeps the first n characters of s.
func cut(s string, n int) string {
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	return string([]rune(s)[:n]) + "…"
}

// tail keeps the end of a turn's text that fits a card: what is newest
// matters on a phone; all of it is on the desktop.
func tail(s string) string {
	if len(s) <= bodyLimit {
		return s
	}
	s = s[len(s)-bodyLimit:]
	for len(s) > 0 && !utf8.RuneStart(s[0]) {
		s = s[1:]
	}
	return grey("…前面的内容在桌面端查看") + "\n\n" + s
}

// titleFromMessage names a session after its first message as the desktop
// does (packages/core titleFromMessage): its first non-blank line, spaces
// collapsed, at most 60 characters.
func titleFromMessage(text string) string {
	for _, line := range strings.Split(text, "\n") {
		if line = oneLine(line); line != "" {
			if utf8.RuneCountInString(line) > 60 {
				return strings.TrimRight(string([]rune(line)[:60]), " ") + "…"
			}
			return line
		}
	}
	return ""
}
