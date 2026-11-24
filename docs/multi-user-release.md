# 发布清单

版本：app `0.8.17-beta.6`，引擎 `v0.28.0`。

## 1. 引擎先出去

引擎 `v0.28.0` 已推送（tag 在 origin 上）。这一版引擎：

- 流式文本的 delta 带 `offset`（它在条目最终文本里的起点，按 UTF-16 计），客户端照它放，
  重复、迟到的 delta 不再弄乱文本；之前一次回调同时有思考和正文时正文会丢，现在两条都发。
- 存储读走只读连接池、写走单连接，写和事件排队，不再持锁通知。
- 工作区搬家记在行里（迁移 0018，`WorkspaceRow.movingTo`），启动时收尾没搬完的。
- 定时任务在任务变化和到点时醒，不再每分钟轮询。

## 2. 桌面端钉到新引擎

```bash
cd ~/Desktop/yiming/ollupi-desktop/sidecar
GOWORK=off go get github.com/0xfakeSpike/ollupi@v0.28.0
GOWORK=off go test -tags sqlite_fts5 ./...
cd .. && pnpm protocol:generate && node packages/protocol/scripts/record-session.mjs
```

## 3. 打包

```bash
cd ~/Desktop/yiming/ollupi-desktop
pnpm release
```

打完确认二进制是新引擎（第一行要是 v0.28.0，第二行 0 就是没进去）：

```bash
go version -m apps/desktop/release/mac-arm64/Ollupi.app/Contents/Resources/bin/ollupid | grep 0xfakeSpike/ollupi
grep -ac 'movingTo' apps/desktop/release/mac-arm64/Ollupi.app/Contents/Resources/bin/ollupid
```

## 4. 发到 GitHub

```bash
gh release create v0.8.17-beta.6 --prerelease --title "0.8.17-beta.6" --notes-file notes.md <dmg> <zip> latest-mac.yml
```

## 5. 装完自查

- 长回答流式显示时文字不重复、不缺字；带思考的模型，思考和正文都边写边出。
- 断网重连后正在写的回答接着显示，没有重复的段落。
- 搬一个工作区，搬的途中退出再打开：搬家完成，工作区指向新位置。
- 定时任务到点照常跑。
- 从 beta.5 升上来：模型、身份、设置都还在。

## 这版的已知限制

- 身份不是本机上的安全边界：同一 macOS 账户下，各身份的文件互相可读。
- API key 仍明文写在 config.yaml（沙箱里的命令读不到它和数据库）；Keychain 以后再做。
- 工作区、沙箱、skills、slots、飞书的改动仍然重启后端。
