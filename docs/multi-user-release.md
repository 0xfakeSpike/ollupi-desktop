# 发布清单

版本：app `0.8.17-beta.13`，引擎 `v0.34.0`。

## 1. 这一版改了什么

- 沙箱换成"提供方 → 环境"：本机是 ollupi 的一种沙箱提供方（`local`），和云沙箱走同一个接口。每个环境是它的一个实例，文件夹是 `~/.ollupi/users/<身份>/<环境 id>`，不在工作区里的命令在这里跑。原来共用的 `~/.ollupi/scratch` 不再使用，里面的文件留着。
- 会话按自己的环境取沙箱：命令、文件、网页读取、技能文件都在会话所在的环境里；MCP 服务在第一个环境里，以完全访问运行（拿不到 `OLLUPI_` 开头的令牌）。
- 获准的完全访问命令拿到后端的环境变量（除 `OLLUPI_` 开头的）；受限命令照旧只拿基础变量。`AGENTS.md`、`CLAUDE.md`、`.claude` 等 agent 文件在沙箱里不可写。
- 环境窗口：可以新建环境、改名、删除；第一个环境、有会话或工作区的环境不能删。在工作区里开的会话用工作区的环境。去掉了"云端沙箱的命令会被拒绝"的提示。
- 系统提示里新增 `# ENVIRONMENT` 一段，说明命令在哪个环境、有什么限制。
- 数据库迁移 0023：环境改为记提供方、配置、状态；旧的 `machine` 环境（只有名字、从没建过）删掉，里面的会话移到本机环境；每个工作区归到用户的第一个环境。

## 2. 引擎

sidecar 钉在 `v0.34.0`：

```bash
grep 0xfakeSpike/ollupi ~/Desktop/yiming/ollupi-desktop/sidecar/go.mod
ls ~/go/pkg/mod/github.com/0xfake\!spike/ollupi@v0.34.0/store/sqlite/migrations/ | tail -2
```

## 3. 打包

```bash
cd ~/Desktop/yiming/ollupi-desktop
pnpm release
```

打完确认二进制是新的（第一行要是 v0.34.0，后两行 0 就是没进去）：

```bash
go version -m apps/desktop/release/mac-arm64/Ollupi.app/Contents/Resources/bin/ollupid | grep 0xfakeSpike/ollupi
grep -ac 'environment_sandboxes' apps/desktop/release/mac-arm64/Ollupi.app/Contents/Resources/bin/ollupid
grep -ac 'host.thisMachine' apps/desktop/release/mac-arm64/Ollupi.app/Contents/Resources/bin/ollupid
```

## 4. 发到 GitHub

```bash
gh release create v0.8.17-beta.13 --prerelease --title "0.8.17-beta.13" --notes-file notes.md <dmg> <zip> latest-mac.yml
```

## 5. 装完自查

- 从 beta.12 升上来：工作区、会话都在，环境窗口里只有"这台电脑"一个环境。
- 不选工作区发一条要跑命令的消息：命令在 `~/.ollupi/users/default/<环境 id>` 里跑。
- 环境窗口新建一个环境，在它里面开会话，标题旁显示环境名。
- MCP 服务照常连上。

## 这版的已知限制

- 还没接任何云沙箱，提供方只有这台电脑。
- 身份不是本机上的安全边界：同一 macOS 账户下，各身份的文件互相可读。
- API key 仍明文存在数据库里（沙箱里的命令读不到数据库）。
