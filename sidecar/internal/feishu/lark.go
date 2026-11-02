package feishu

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/0xfakeSpike/ollupi-desktop/sidecar/internal/config"
	lark "github.com/larksuite/oapi-sdk-go/v3"
	larkcore "github.com/larksuite/oapi-sdk-go/v3/core"
	"github.com/larksuite/oapi-sdk-go/v3/event/dispatcher"
	"github.com/larksuite/oapi-sdk-go/v3/event/dispatcher/callback"
	larkim "github.com/larksuite/oapi-sdk-go/v3/service/im/v1"
	larkws "github.com/larksuite/oapi-sdk-go/v3/ws"
)

// New builds the bridge for cfg's app; Run connects it. The topics file
// lives at topicsPath.
func New(cfg config.Feishu, engine Engine, store Store, topicsPath string) (*Bridge, error) {
	client := lark.NewClient(cfg.AppID, cfg.AppSecret, lark.WithOpenBaseUrl(baseURL(cfg.Domain)), lark.WithLogger(logger{}))
	return newBridge(cfg, engine, store, openAPI{client}, topicsPath)
}

// Run receives the bot's messages and card presses over a long connection,
// reconnecting as it drops, until ctx ends. A connection that cannot be
// made is logged, and the backend runs on without the bot.
func (b *Bridge) Run(ctx context.Context) {
	done := make(chan struct{})
	go func() {
		b.work(ctx)
		close(done)
	}()
	events := dispatcher.NewEventDispatcher("", "").
		OnP2MessageReceiveV1(func(_ context.Context, e *larkim.P2MessageReceiveV1) error {
			if m, ok := incomingOf(e); ok {
				b.queue.push(func() { b.message(m) })
			}
			return nil
		}).
		OnP2CardActionTrigger(func(_ context.Context, e *callback.CardActionTriggerEvent) (*callback.CardActionTriggerResponse, error) {
			if e.Event == nil || e.Event.Operator == nil || e.Event.Action == nil {
				return nil, nil
			}
			toast, ok := b.press(e.Event.Operator.OpenID, e.Event.Action.Value, e.Event.Action.FormValue)
			kind := "success"
			if !ok {
				kind = "error"
			}
			return &callback.CardActionTriggerResponse{Toast: &callback.Toast{Type: kind, Content: toast}}, nil
		})
	ws := larkws.NewClient(b.cfg.AppID, b.cfg.AppSecret,
		larkws.WithEventHandler(events),
		larkws.WithDomain(baseURL(b.cfg.Domain)),
		larkws.WithLogger(logger{}),
		larkws.WithLogLevel(larkcore.LogLevelInfo),
		larkws.WithOnReady(func() { slog.Info("feishu: connected") }),
	)
	if err := ws.Start(ctx); err != nil && ctx.Err() == nil {
		slog.Error("feishu: not connected", "err", err)
	}
	<-done
}

func incomingOf(e *larkim.P2MessageReceiveV1) (incoming, bool) {
	if e.Event == nil || e.Event.Message == nil || e.Event.Sender == nil || e.Event.Sender.SenderId == nil {
		return incoming{}, false
	}
	m, s := e.Event.Message, e.Event.Sender
	if str(s.SenderType) != "user" {
		return incoming{}, false
	}
	return incoming{
		id: str(m.MessageId), root: str(m.RootId), chatType: str(m.ChatType), msgType: str(m.MessageType),
		content: str(m.Content), sender: str(s.SenderId.OpenId),
	}, true
}

func str(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func baseURL(d config.FeishuDomain) string {
	if d == config.FeishuDomainLark {
		return lark.LarkBaseUrl
	}
	return lark.FeishuBaseUrl
}

// openAPI is chat over Feishu's open API.
type openAPI struct{ client *lark.Client }

func (o openAPI) reply(ctx context.Context, messageID, msgType, content string) (string, error) {
	resp, err := o.client.Im.V1.Message.Reply(ctx, larkim.NewReplyMessageReqBuilder().
		MessageId(messageID).
		Body(larkim.NewReplyMessageReqBodyBuilder().MsgType(msgType).Content(content).ReplyInThread(true).Build()).
		Build())
	if err != nil {
		return "", err
	}
	if !resp.Success() {
		return "", fmt.Errorf("reply: %d %s", resp.Code, resp.Msg)
	}
	return str(resp.Data.MessageId), nil
}

func (o openAPI) send(ctx context.Context, openID, msgType, content string) (string, error) {
	resp, err := o.client.Im.V1.Message.Create(ctx, larkim.NewCreateMessageReqBuilder().
		ReceiveIdType(larkim.CreateMessageV1ReceiveIDTypeOpenId).
		Body(larkim.NewCreateMessageReqBodyBuilder().ReceiveId(openID).MsgType(msgType).Content(content).Build()).
		Build())
	if err != nil {
		return "", err
	}
	if !resp.Success() {
		return "", fmt.Errorf("send: %d %s", resp.Code, resp.Msg)
	}
	return str(resp.Data.MessageId), nil
}

func (o openAPI) update(ctx context.Context, messageID, card string) error {
	resp, err := o.client.Im.V1.Message.Patch(ctx, larkim.NewPatchMessageReqBuilder().
		MessageId(messageID).
		Body(larkim.NewPatchMessageReqBodyBuilder().Content(card).Build()).
		Build())
	if err != nil {
		return err
	}
	if !resp.Success() {
		return fmt.Errorf("update: %d %s", resp.Code, resp.Msg)
	}
	return nil
}

// logger puts the SDK's log in the backend's.
type logger struct{}

func (logger) Debug(_ context.Context, args ...any) { slog.Debug("feishu: " + fmt.Sprint(args...)) }
func (logger) Info(_ context.Context, args ...any)  { slog.Info("feishu: " + fmt.Sprint(args...)) }
func (logger) Warn(_ context.Context, args ...any)  { slog.Warn("feishu: " + fmt.Sprint(args...)) }
func (logger) Error(_ context.Context, args ...any) { slog.Error("feishu: " + fmt.Sprint(args...)) }
