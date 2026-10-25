# Ollupi Desktop

[ollupi](../ollupi) 的桌面客户端，形态类似 Codex / Claude 桌面端：左侧是工作区和会话，右侧是对话流（流式输出、推理、工具调用、审批、结构化提问、计划），外加记忆和权限设置。

## 技术栈

| 层 | 选型 | 理由 |
| --- | --- | --- |
| 后端 | Go sidecar `ollupid`，直接 import ollupi | ollupi 是 Go 库；agent、SQLite、沙箱都在本进程内，不需要再包一层 |
| 协议 | ollupi 自带的 gateway：JSON-RPC 2.0 over WebSocket | 现成、有鉴权，和 Codex app-server 同构；UI 只是网关的一个客户端 |
| 外壳 | Electron 45 + electron-vite | 和 Codex / Claude 桌面端同类；负责窗口、原生对话框、托管 sidecar |
| 界面 | React 19 + TypeScript + Tailwind v4 + zustand | zustand 只存状态，所有领域逻辑在纯函数包里，方便测试 |
| 仓库 | pnpm workspace（TS）+ 独立 Go module（sidecar） | 包边界即依赖边界 |

## 架构

```
┌──────────────── Electron ────────────────┐          ┌──────── ollupid (Go) ────────┐
│ main      生命周期、窗口、app:// 协议、IPC   │  spawn   │ config   读 ~/.ollupi/config.yaml │
│   └ BackendSupervisor ───────────────────┼────────▶ │ host     装配 DB/模型/工具/记忆/cron │
│        token 经环境变量传入，读 stdout 握手 │          │          agent + gateway          │
│ preload   window.desktop（类型化的 IPC）    │          │ handshake 一行 JSON: ready/fatal  │
│ renderer  React UI ───── WebSocket JSON-RPC ┼────────▶ │ gateway  ws://127.0.0.1:<随机端口> │
└───────────────────────────────────────────┘          └──────────────────────────────┘
```

渲染进程直接连网关（`?token=` 鉴权，origin 为 `app://ollupi`，sidecar 用 `--allow-origin` 放行）。主进程不转发协议消息，只管进程和原生能力。

### 包职能

依赖方向严格单向：`protocol ← client / core ← ui? ← apps/desktop`（`ui` 不依赖协议）。

| 包 | 职责 | 不做什么 |
| --- | --- | --- |
| `packages/protocol` | 网关协议的 TS 类型：实体（Thread/Turn/Item…）、三张方法表（客户端请求、服务端通知、服务端请求）、错误码 | 没有运行时逻辑、没有依赖 |
| `packages/client` | `RpcPeer`：传输无关的双向 JSON-RPC；`OllupiClient`：在方法表上做类型化的 `call` / `on` / `handle` | 不重连、不存状态（由拥有连接的一方决定） |
| `packages/core` | 纯函数领域逻辑：Timeline 归并（分页、增量、流式 delta）、会话列表排序与分组、工具调用解读（shell 命令、计划、子代理）、格式化 | 无 I/O、无框架、无状态容器 |
| `packages/ui` | 设计 token（`theme.css`，自动深色）和展示组件：Button、Badge、Dialog、Disclosure、AutoTextarea… | 不知道协议，也不读应用状态 |
| `apps/desktop` | Electron 应用（见下） | |
| `sidecar` | Go 后端：`config`（文件格式与校验）、`host`（组件装配与生命周期）、`handshake`（与主进程的行协议）、`cmd/ollupid` | 不改 ollupi 本身 |

### 渲染进程分层（`apps/desktop/src/renderer/src`）

```
stores/     zustand：只存状态，更新一律调用 @ollupi/core 的纯函数
  connection  后端进程状态 + 网关连接状态
  catalog     工作区、会话列表、模型
  timelines   已加载的会话时间线
  requests    等待用户的服务端请求（审批/提问），持有 JSON-RPC 的 resolver
  navigation  当前界面、下一轮要用的模型（纯客户端状态）
  notices     toast
services/   副作用都在这里
  session     连接生命周期：跟随后端状态连接、断线退避重连、后端重启后换新地址
  bridge      唯一同时认识「客户端事件」和「store」的地方：通知 → store，服务端请求 → requests
  sync        (重)连后拉取全量目录，按需拉会话分页
  actions/    用户意图：发消息/steer/排队/中断、审批、工作区、权限、记忆
  desktop     唯一接触 window.desktop 的模块（开发时可用浏览器 shim）
features/   按界面划分的 React 组件：sidebar、conversation（items/ 下按 item 类型渲染）、
            requests（审批卡、提问卡）、memory、settings、backend（启动/失败页）
components/ 跨 feature 的展示组件（Markdown、Toasts）
```

数据流是单向的：网关事件 → bridge → store → 组件；组件只调用 `services/actions`，从不直接调用客户端。

## 开发

前置：Node 22+、pnpm、Go 1.25+，并把 ollupi 检出在同级目录 `../ollupi`（`sidecar/go.mod` 里的 `replace`，发版后可去掉）。

```bash
pnpm install
```

```bash
pnpm dev
```

`pnpm dev` 先编译 sidecar 到 `apps/desktop/resources/bin/`，再启动 electron-vite（HMR）。首次运行会写入 `~/.ollupi/config.yaml` 模板；填好 endpoint 和模型后在应用里点 "Restart backend"。数据目录可用 `OLLUPI_HOME` 覆盖。从 Finder 启动时，主进程会借用登录 shell 的环境变量，所以 `api_key_env` 和 `PATH` 一样能用。

其他命令：

```bash
pnpm typecheck
```

```bash
pnpm test
```

```bash
pnpm --filter @ollupi/desktop package
```

**只调界面**：手动启动一个 sidecar，再在浏览器里打开渲染进程（仅 dev 模式生效的 shim 会代替 `window.desktop`）：

```bash
OLLUPI_GATEWAY_TOKEN=dev apps/desktop/resources/bin/ollupid --home /tmp/ollupi-dev
```

```bash
pnpm --filter @ollupi/desktop dev:renderer
```

然后访问 `http://localhost:5173/?gateway=ws://127.0.0.1:<端口>/&token=dev`（端口见 sidecar 输出的 ready 行）。

## 配置（`~/.ollupi/config.yaml`）

- `endpoints`：OpenAI 兼容接口（`base_url`、`api_key_env` 或 `api_key`、并发上限 `calls`（同一接口下所有模型共用，默认 4）、未知模型的 `limits`）。
- `models`：可选模型，第一个是默认。`id` 是 ollupi 所说的 connection，即 `turn/start` 选择模型用的唯一键；`name` 是发给 endpoint 的模型名。
- `settings`：agent 级默认权限（审批策略 + allow/ask/deny 规则）；工作区和会话可以在 UI 里叠加规则。
- `shell`：`run_command` 工具与 macOS 沙箱（`sandbox_mode`、网络、超时…）。config.yaml 本身对命令不可读。
- `memory`：召回 / 生成开关，生成需要 `model`。

## 现状与后续

- 已实现：会话 / 工作区、流式消息与推理、工具调用详情、审批（含提权与会话级授权）、结构化提问、计划、子代理跳转、steer 与排队、中断、分页加载历史、记忆查看/编辑/遗忘、工作区与会话权限、后端崩溃/配置错误页、断线重连。
- 未做：在 UI 里编辑 config.yaml（目前是打开文件 + 重启）、定时任务面板（可走 `tool/call` 调 cron 工具）、MCP 配置、自动更新与签名、e2e 测试、代码高亮。
