# Ollupi Desktop

[ollupi](../ollupi) 的桌面客户端，形态类似 Codex / Claude 桌面端：左侧是工作区和会话，右侧是对话流（流式输出、推理、工具调用、审批、结构化提问、计划、子代理），另有定时任务、记忆、工具列表和权限设置。

## 技术栈

| 层 | 选型 | 理由 |
| --- | --- | --- |
| 后端 | Go sidecar `ollupid`，直接 import ollupi | ollupi 是 Go 库；agent、SQLite、沙箱都在本进程内 |
| 协议 | ollupi 的 gateway：JSON-RPC 2.0 over WebSocket | UI 只是网关的一个客户端 |
| 契约 | `sidecar/cmd/protogen` 从 ollupi 源码生成 TypeScript 类型 | 线上的类型来自产生 JSON 的代码，而不是手抄 |
| 外壳 | Electron + electron-vite | 窗口、原生对话框、托管 sidecar |
| 界面 | React 19 + TypeScript + Tailwind v4 + zustand | 领域逻辑在纯函数包里，store 只存状态 |

## 架构

```
┌──────────────── Electron ────────────────┐          ┌──────── ollupid (Go) ─────────┐
│ main      生命周期、窗口、app:// 协议、IPC   │  spawn   │ config    读 ~/.ollupi/config.yaml │
│   └ BackendSupervisor ───────────────────┼────────▶ │ host      装配 DB/模型/工具/记忆/    │
│        token 走环境变量，读 stdout 握手     │          │           cron/agent/gateway       │
│ preload   window.desktop（类型化 IPC）      │          │ handshake 一行 JSON：ready/fatal   │
│ renderer  React ─────── WebSocket JSON-RPC ┼────────▶ │ gateway   ws://127.0.0.1:<随机端口> │
└───────────────────────────────────────────┘          └───────────────────────────────┘
```

渲染进程直接连网关（`?token=` 鉴权，打包后 origin 为 `app://ollupi`，sidecar 用 `--allow-origin` 放行）。主进程不转发协议消息，只管进程和原生能力。

### 包职能

依赖单向：`protocol ← client / core ← apps/desktop`，`ui` 只被 `apps/desktop` 使用，不依赖协议。

| 包 | 职责 |
| --- | --- |
| `packages/protocol` | 网关契约。`generated.ts` 由 protogen 从 ollupi 源码生成（所有线上结构、各种状态的取值、方法/通知/请求名、错误码、内置工具名）；`wire.ts` 手写方法名与参数、结果的对应关系，并在类型层面检查它和网关的方法名完全一致，网关增删方法时编译失败。 |
| `packages/client` | `RpcPeer`：与传输无关的双向 JSON-RPC；`OllupiClient`：按方法表类型化的 `call` / `on` / `handle`。不负责重连。 |
| `packages/core` | 纯函数领域逻辑，每条规则对照 ollupi 的实现：时间线归并、会话列表（只含顶层会话、按 `updated_at`、`created_at` 排序）、工作区排序、工具调用解读（等审批只在 `pending`、等回答/子代理在 `inProgress`、shell 冻结命令与输出、计划、问答）、格式化。 |
| `packages/ui` | 设计 token（`theme.css`，自动深色）和展示组件。 |
| `apps/desktop` | Electron 主进程、preload、渲染进程。 |
| `sidecar` | `cmd/ollupid` 后端入口；`cmd/protogen` 契约生成器；`internal/config` 配置文件；`internal/host` 组件装配与生命周期；`internal/handshake` 与主进程的启动协议。 |

### 渲染进程（`apps/desktop/src/renderer/src`）

按领域划分，而不是按层：

```
gateway/    连接本身：session（跟随后端状态连接、断线退避重连、后端重启后换新地址）、
            connection（当前客户端与连接状态）、Domain 接口、run（动作失败转成提示）
domains/    每个领域一个文件，自带 store、要订阅的网关事件（bind）、
            连接建立后的加载（sync）、断线时清理（disconnect）和用户动作：
            workspaces、threads、conversation、requests、models、tools、cron、memory，
            以及纯客户端的 navigation、notices
views/      React 界面：sidebar、draft、conversation（items/ 按 item 类型渲染）、
            requests（审批卡、问答卡）、cron、memory、settings、backend、common
platform/   唯一接触 window.desktop 的模块（开发时可用浏览器 shim）
```

session 不认识任何领域的事件：它依次调用各领域的 `bind`、按声明顺序 `sync`（会话列表按工作区分别获取，所以工作区先同步），断线时调用 `disconnect`。数据流单向：网关事件 → 领域 store → 视图；视图只调用领域动作。

几条容易忽略、但按 ollupi 的实际行为实现的规则：

- 会话的标题和更新时间直接用 turn 通知里服务端写入后的会话记录，客户端不推算。
- 父会话在子代理等待用户时也报告"等待中"，所以子代理的审批和提问显示在父会话的子代理卡片上。
- 定时任务没有推送：打开时读取；用户的 `cron/*` 调用返回最新记录；模型调用 cron 工具后，来自 cron 提供方（`ToolProvider.Cron`）的 `item/completed` 触发重新读取。
- 审批策略"继承"就是不传 `approvalPolicy`。

## 开发

前置：Node 22+、pnpm、Go 1.25+，ollupi 检出在同级目录 `../ollupi`（`sidecar/go.mod` 的 `replace`）。

```bash
pnpm install
```

```bash
pnpm dev
```

`pnpm dev` 先编译 sidecar，再启动 electron-vite（HMR）。首次运行写入 `~/.ollupi/config.yaml` 模板，填好后在应用里点 "Restart backend"。数据目录可用 `OLLUPI_HOME` 覆盖。环境变量优先用启动终端里的值，其次是登录 shell 的；改了 `~/.zshrc` 要从新的终端启动。

ollupi 改动后重新生成契约，生成结果要提交：

```bash
pnpm protocol:generate
```

```bash
pnpm protocol:check
```

其他：

```bash
pnpm typecheck
```

```bash
pnpm test
```

**只调界面**：手动启动一个 sidecar，再在浏览器里打开渲染进程（仅 dev 模式的 shim 代替 `window.desktop`）：

```bash
OLLUPI_GATEWAY_TOKEN=dev apps/desktop/resources/bin/ollupid --home /tmp/ollupi-dev
```

```bash
pnpm --filter @ollupi/desktop dev:renderer
```

然后访问 `http://localhost:5173/?gateway=ws://127.0.0.1:<端口>/&token=dev`（端口见 sidecar 输出的 ready 行）。

## 配置（`~/.ollupi/config.yaml`）

- `endpoints`：OpenAI 兼容接口（`base_url`、`api_key_env` 或 `api_key`、并发上限 `calls`（同一接口下所有模型共用，默认 4）、未知模型的 `limits`）。
- `models`：可选模型，第一个是默认。`id` 是 ollupi 的 connection，即 `turn/start` 选择模型用的唯一键；`name` 是发给接口的模型名。
- `settings`：agent 级权限（审批策略 + allow/ask/deny 规则），工作区和会话在其上叠加。
- `slots`：同时运行的会话数上限（默认 32）。
- `shell`：`run_command` 工具与 macOS 沙箱。config.yaml 本身对命令不可读。
- `memory`：召回 / 生成开关，生成需要 `model`。
