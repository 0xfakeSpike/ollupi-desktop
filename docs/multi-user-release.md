# 发布清单

版本：app `0.8.17-beta.8`，引擎 `v0.31.0`（beta.7 是 `v0.28.0`）。

## 1. 这一版改了什么

- 技能是每个身份自己的，存在引擎里，经网关读写（`skill/list`、`skill/read`、`skill/set`、`skill/delete`、`skill/changed`）。一个技能可以给几个 agent，能力 → 技能里勾选；新建、编辑、导入文件夹在同一个对话框，被拒时对话框里说原因。技能文件夹、"使用技能"开关、复制给另一个 agent 都没有了。
- 新身份第一次连上时，主 agent 拿到自带技能（`zhou-shenghua-woodcut-style`），删了不再回来。
- 升级时 `--import-config` 把 `config.yaml` 里的 `skills_dir` 拆掉：各角色文件夹里的技能给每个已有身份，同名合一（内容不同以主 agent 那份为准），再删掉这一行；文件夹原样留在磁盘上。
- 附件经 HTTP 读（`GET /attachments/{thread}/{attachment}`），不再用 `attachment/read` 走 WebSocket（引擎 v0.30.0）。
- 列表和 `*/changed` 通知按 seq 合并，晚到的旧读取不再盖掉新改动（引擎 v0.29.0）。
- 飞书机器人去掉了。`config.yaml` 里还写着 `feishu:` 块（不是注释）的，后端会以未知字段拒绝启动，删掉这一块即可。

## 2. 引擎

sidecar 钉在 `v0.31.0`：

```bash
grep 0xfakeSpike/ollupi ~/Desktop/yiming/ollupi-desktop/sidecar/go.mod
ls ~/go/pkg/mod/github.com/0xfake\!spike/ollupi@v0.31.0/store/sqlite/migrations/ | tail -2
```

## 3. 打包

```bash
cd ~/Desktop/yiming/ollupi-desktop
pnpm release
```

打完确认二进制是新引擎（第一行要是 v0.31.0，后两行 0 就是没进去）：

```bash
go version -m apps/desktop/release/mac-arm64/Ollupi.app/Contents/Resources/bin/ollupid | grep 0xfakeSpike/ollupi
grep -ac 'skill/set' apps/desktop/release/mac-arm64/Ollupi.app/Contents/Resources/bin/ollupid
grep -ac 'read-skill' apps/desktop/release/mac-arm64/Ollupi.app/Contents/Resources/bin/ollupid
```

## 4. 发到 GitHub

```bash
gh release create v0.8.17-beta.8 --prerelease --title "0.8.17-beta.8" --notes-file notes.md <dmg> <zip> latest-mac.yml
```

## 5. 装完自查

- 从 beta.7 升上来：会话、工作区、身份、设置都在；原来技能文件夹里的技能出现在能力 → 技能，卡片上写着给了哪些 agent；`config.yaml` 里没有 `skills_dir` 了。
- 编辑一个技能，多勾一个 agent，保存后卡片马上更新；新建一个技能，主 agent 下一步能用 `list_skills` 看到它。
- 导入一个带脚本的技能文件夹，对话框里文件数对；不是文本的文件列在下面。
- 新建一个身份，切过去：能力 → 技能里有自带的配图技能。
- 会话里带图片的消息，图片照常显示（附件走 HTTP）。

## 这版的已知限制

- 身份不是本机上的安全边界：同一 macOS 账户下，各身份的文件互相可读。
- API key 仍明文写在 config.yaml（沙箱里的命令读不到它和数据库）；Keychain 以后再做。
- providers 以外的配置改动（名字、prompt、工具、slots）仍然重启后端。
- 技能带的文件只能随导入整体替换，应用里不能单独改。
