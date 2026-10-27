# Ollupi Desktop

[ollupi](../ollupi) 的桌面客户端，形态类似 Codex / Claude 桌面端：左侧是工作区和会话，右侧是对话流（流式输出、推理、工具调用、审批、结构化提问、计划、子代理），另有定时任务、记忆、工具列表和权限设置。

## 技术栈

| 层 | 选型 | 理由 |
| --- | --- | --- |
| 后端 | Go sidecar `ollupid`，直接 import ollupi | ollupi 是 Go 库；agent、SQLite、沙箱都在本进程内 |
| 协议 | ollupi 的 gateway：JSON-RPC 2.0 over WebSocket | UI 只是网关的一个客户端 |
| 契约 | ollupi 提交的 `gateway/protocol.schema.json`，生成 TypeScript | 契约由 ollupi 从它分发消息的那张表生成，并用真实流量测试；UI 只读这份 JSON |
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
| `packages/protocol` | 网关契约。`src/generated/` 全部由 `scripts/generate.mjs` 从 ollupi 的 `protocol.schema.json` 生成：类型（json-schema-to-typescript）、方法/通知/请求的参数与结果、错误码、内置工具和提供方、契约指纹，以及内置工具参数和输出的校验器（ajv standalone，预编译、不用 eval）。`fixtures/session.json` 是录下的真实会话，测试用它校验契约。 |
| `packages/client` | `RpcPeer`：与传输无关的双向 JSON-RPC；`OllupiClient`：按方法表类型化的 `call` / `on` / `handle`。不负责重连。 |
| `packages/core` | 纯函数领域逻辑，每条规则对照 ollupi 的实现：时间线归并、会话列表（只含顶层会话、按 `updated_at`、`created_at` 排序）、工作区排序、工具调用解读（等审批只在 `pending`、等回答/子代理在 `inProgress`、shell 冻结命令与输出、计划、问答）、格式化。 |
| `packages/ui` | 设计 token（`theme.css`，自动深色）和展示组件。 |
| `apps/desktop` | Electron 主进程、preload、渲染进程。 |
| `sidecar` | `cmd/ollupid` 后端入口；`internal/config` 配置文件；`internal/host` 组件装配与生命周期；`internal/handshake` 与主进程的启动协议。 |

### 渲染进程（`apps/desktop/src/renderer/src`）

按领域划分，而不是按层：

```
gateway/    连接本身：session（跟随后端状态连接、断线退避重连、后端重启后换新地址）、
            connection（当前客户端与连接状态）、Domain 接口、run（动作失败转成提示）、
            contract（仅开发构建：对照契约校验收发的每条消息）
domains/    每个领域一个文件，自带 store、要订阅的网关事件（bind）、
            连接建立后的加载（sync）、断线时清理（disconnect）和用户动作：
            workspaces、threads、conversation、requests、models、tools、cron、memory，
            以及纯客户端的 navigation、notices
views/      React 界面：sidebar、draft、conversation（items/ 按 item 类型渲染）、
            requests（审批卡、问答卡）、cron、memory、settings、backend、common
platform/   唯一接触 window.desktop 的模块（开发时可用浏览器 shim）
i18n/       界面语言（English、简体中文）：按区域分的词条（messages/<area>），
            中文词条与英文同键同参数，缺译不能编译；format 把 core 的中性值
            （时间、时长、工具调用标题）按当前语言说出来
```

界面语言在 Settings → General 里选，默认跟随系统，选择存在应用自己的存储里，切换即时生效。只翻译应用自己的文字；用户、agent 和 ollupi 写的内容（消息、后端报的错误、审批理由）原样显示。`@ollupi/core` 不产出任何界面文字，只给出结构化的值。

session 不认识任何领域的事件：它依次调用各领域的 `bind`、按声明顺序 `sync`（会话列表按工作区分别获取，所以工作区先同步），断线时调用 `disconnect`。数据流单向：网关事件 → 领域 store → 视图；视图只调用领域动作。

几条容易忽略、但按 ollupi 的实际行为实现的规则：

- 会话的标题和更新时间直接用 turn 通知里服务端写入后的会话记录，客户端不推算。
- 父会话在子代理等待用户时也报告"等待中"，所以子代理的审批和提问显示在父会话的子代理卡片上。
- 定时任务没有推送：打开时读取；用户的 `cron/*` 调用返回最新记录；模型调用 cron 工具后，来自 cron 提供方（`ToolProvider.Cron`）的 `item/completed` 触发重新读取。
- 审批策略"继承"就是不传 `approvalPolicy`。
- 内置工具的参数是模型写的 JSON，只有对照契约校验通过才当作计划、问题、子代理任务来显示；命令以 ollupi 冻结的执行内容为准。

### 契约如何守住

- **类型**：`pnpm protocol:generate` 从 ollupi 的契约生成；`pnpm protocol:check` 在生成结果过期时失败（CI 里跑）。
- **真实流量**：`packages/protocol/src/contract.test.ts` 用录下的会话校验双向每条消息；`packages/core/src/replay.test.ts` 把录下的通知按应用同样的方式应用，结果必须和服务端最后的 `thread/read` 一致。ollupi 一侧另有 `gateway/traffic_test.go`。
- **运行时**：开发构建里每条消息都对照契约校验，不符合就提示；握手时比对契约指纹（`protocolSha256`），后端和界面不是用同一份契约构建时显示横幅。

## 开发

前置：Node 22+、pnpm、Go 1.25+，ollupi 检出在同级目录 `../ollupi`（`sidecar/go.mod` 的 `replace`）。

```bash
pnpm install
```

```bash
pnpm dev
```

`pnpm dev` 先编译 sidecar，再启动 electron-vite（HMR）。首次运行写入 `~/.ollupi/config.yaml` 模板，填好后在应用里点 "Restart backend"。数据目录可用 `OLLUPI_HOME` 覆盖。环境变量优先用启动终端里的值，其次是登录 shell 的。登录 shell 的环境在每次启动后端和校验配置时重新读取，所以在 `~/.zshrc` 里新 export 的 key 不用重开应用；但启动终端里已有的同名变量仍然优先，要改它得从新的终端启动。

ollupi 改动契约后，重新生成并重新录制会话，结果都要提交：

```bash
pnpm protocol:generate
```

```bash
node packages/protocol/scripts/record-session.mjs
```

`record-session.mjs` 会针对当前 ollupi 编译 sidecar，用 `scripts/mock-model.mjs`（脚本化的假模型）在临时目录里跑一段完整会话。检查生成结果是否过期：

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

ollupi 只在启动时读取配置，所以界面里的配置修改（Settings 的 Models 页、Memory 页的"学习"和"使用"开关）一律是"改文件并重启后端"：主进程用 `yaml` 的文档接口改写文件，保留注释；先把改后的内容交给 `ollupid --check-config` 校验，它会用一个临时数据库真实地启动一次 agent，用的是与正式启动完全相同的校验代码；通过后才原子地替换文件并重启。被拒绝的修改不会写进文件。`--check-config` 的输出（解码后的配置，不含 API key；按 `provider/name` 展开的模型列表；每个提供方的 key 来源）的 TS 类型由 `ollupid --config-schema` 生成（`pnpm config:generate`，`pnpm config:check` 检查是否过期）。

- `models`：按提供方分组的模型，可在 Settings → Models 里管理（应用只记录 key 所在的环境变量名，key 本身留在 `~/.zshrc`）。每个提供方是一个 OpenAI 兼容接口（`provider` 名称唯一且不含 `/`，`base_url`、`api_key_env` 或 `api_key`），`names` 列出它提供的模型；每个模型有自己的 client 和并发上限 `calls`（默认 4），未知模型用 `limits` 声明上下文窗口。模型的 id 是 `provider/name`，即 ollupi 的 connection、`turn/start` 选模型用的键，所以两个提供方可以提供同名模型。第一个提供方的第一个模型是默认。
- `permissions`：agent 级权限（`approval` 审批策略 + `allow`/`ask`/`deny` 规则），工作区和会话在其上叠加。
- `slots`：同时运行的会话数上限（默认 32）。
- `shell`：`run_command` 工具与 macOS 沙箱。config.yaml 本身对命令不可读。
- `mcp`：MCP 服务器，可在 Settings → MCP 里管理。每个要么是 stdio（`command`、`args`、`env`，子进程继承后端的环境变量），要么是 streamable HTTP（`url`、`headers`）。工具以 `<name>__<tool>` 提供给模型；连不上的服务器被跳过，后端照常启动，状态和原因由 `mcpServer/list` 报告；sidecar 把这些服务器名交给 agent（`Unavailable`），指向它们工具的权限规则保留但本次不生效，新增这样的规则会被拒绝，等服务器连上再加。`env` 和 `headers` 的值可以写 `${NAME}` 引用环境变量，密钥留在 `~/.zshrc`；引用的变量没设置时配置被拒绝。`--check-config` 输出里不含 `${NAME}` 的值会被清空，界面显示为"写在 config.yaml 里"，编辑时保留。
- `memory`：使用（`use`，会话开始和每次压缩后载入一份记忆快照，并提供 `memory_search`）/ 生成（`generate`）开关；生成需要 `model`，填某个模型的 id（`provider/name`），与该模型共用 client 和 `calls`。记忆分三个范围：全局（关于用户本人，所有会话载入）、general（不属于任何工作区的会话）、工作区；会话载入全局加上自己的范围。Memory 页按范围列出，抽取放错范围的记忆可以移到别的范围（`memory/move`）。
