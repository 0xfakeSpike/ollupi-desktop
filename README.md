<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/logo/logo-dark.svg">
    <img alt="Ollupi" src="docs/logo/logo.svg" width="240">
  </picture>
</h1>

[ollupi](https://github.com/0xfakeSpike/ollupi) 的 macOS 桌面端，形态类似 Codex / Claude 桌面端：左侧是工作区和会话，右侧是对话流（流式输出、推理、工具调用、审批、结构化提问、计划、子代理），另有定时任务、记忆、工具列表和权限设置。

所有会话、子代理和定时任务在同一个后端里共享一个执行池：可以同时开很多个会话，等你审批或回答的会话不占并发名额；状态都在本机的 SQLite 里，退出应用、重启电脑后进行中的任务接着跑。

## 安装

需要 macOS 12 或更新。从 [Releases](https://github.com/0xfakeSpike/ollupi-desktop/releases/latest) 下载对应芯片的安装包：

| 芯片 | 文件 |
| --- | --- |
| Apple 芯片（M 系列） | `Ollupi-<版本>-arm64.dmg` |
| Intel | `Ollupi-<版本>-x64.dmg` |

打开 dmg，把 Ollupi 拖进"应用程序"。

应用还没有经过 Apple 公证，第一次打开时 macOS 会提示"无法验证开发者"。点"完成"，然后到 **系统设置 → 隐私与安全性**，在底部找到 Ollupi，点"仍要打开"。也可以在终端里去掉下载标记再打开：

```bash
xattr -dr com.apple.quarantine /Applications/Ollupi.app
```

升级时下载新版本覆盖即可。会话、记忆和配置都在 `~/.ollupi`，不在应用里；卸载时删掉应用，以及 `~/.ollupi` 和 `~/Library/Application Support/Ollupi`。

## 使用

### 1. 配置模型

第一次启动时，后端在 `~/.ollupi/config.yaml` 写一份带注释的模板，里面只有一个没填 key 的 `openai/gpt-5.2`。打开 **设置 → 模型**：

- **添加提供方**：填名称（模型以 `提供方/名称` 选择，所以名称里不能有 `/`）、Base URL（任意兼容 OpenAI 的 API，例如 `https://api.openai.com/v1`、`https://api.deepseek.com`、本地的 `http://127.0.0.1:11434/v1`）和 API 密钥（接口不需要密钥就留空）。
- 应用会从 `{Base URL}/models` 取模型列表供勾选。每个模型都要填**上下文**和**输出**上限（token 数）：API 列表里给出时自动填入，否则查提供方文档。
- 不需要的提供方可以删掉；第一个提供方的第一个模型是默认模型。
- 点 **保存并重启**。后端先检查改动能否启动，通过了才写入 `config.yaml` 并重启；被拒绝的改动不会写进文件，界面会显示原因。

API 密钥直接保存在 `config.yaml` 里。也可以直接编辑这个文件（**设置 → 通用 → 打开 config.yaml**），改完在应用里重启后端。

### 2. 开始会话

- **添加工作区**：选一个项目文件夹。工作区里的会话以这个文件夹为工作目录，agent 在里面读写文件、跑命令。不选工作区也能聊天，只是没有项目文件夹。
- **新会话**：在输入框下方选工作区和模型，`Enter` 发送，`Shift Enter` 换行。
- 一轮还在跑时可以继续输入：**插话** 把话塞进正在进行的这一轮，**排队** 等这一轮结束后作为下一条消息发出；**停止当前轮** 中止这一轮。
- 侧栏里标着"等待你处理"的会话在等你审批或回答。可以同时开多个会话，它们在后台各自推进。
- 会话标题栏的 **上下文** 显示这个会话的上下文占用、自动压缩的位置和最近一次模型调用的缓存情况。

### 3. 审批与提问

- agent 要跑一条需要确认的命令时，会话里出现审批卡：**允许一次**、**在此会话中允许** 或 **拒绝**。命令在审批前冻结，批准后执行的就是你看到的那条。
- 命令默认在 macOS 沙箱里跑。要在沙箱外运行，卡片会单独说明后果，必须为它单独批准。
- agent 需要你做选择时会给出带选项的问题卡，也可以输入自己的回答。
- agent 派出的子代理显示为会话里的一张卡片，子代理的审批和提问也在这张卡片上处理。

### 4. 权限

权限分三层叠加：`config.yaml` 里的 `permissions`（代理默认设置）、**工作区设置 → 权限**、会话标题栏的 **会话权限**。每层可以设：

- **审批策略**：不信任（凡是不确定安全的操作都先询问）、按需（规则或沙箱要求时询问）、从不询问；"继承"沿用上一层。
- **允许 / 询问 / 拒绝规则**：每行一条，工具名或 `Tool(specifier)`，例如 `run_command(git:*)`。拒绝优先于允许和询问，下层去不掉上层的拒绝。

**设置 → 工具** 列出 agent 能调用的所有工具，规则用的就是这里的名字。

### 5. 定时任务

**定时任务** 页按工作区列出所有任务。**新建任务**：选一个已有会话、起名、选重复方式（每小时、每天、工作日、每周、每月，按本机时间），写要发送的消息。到点时这条消息发到那个会话里，照常排队执行。也可以直接让 agent 帮你建任务；任务可以暂停、恢复和删除。

### 6. 记忆

**记忆** 页里有两个开关：

- **从会话中学习**：每轮结束后，由你选的模型提炼值得记住的内容（会消耗这个模型的 token）。
- **在会话中使用记忆**：每个会话开始时带上能放下的记忆，其余的由 agent 用 `memory_search` 按需搜索。

记忆分全局（关于你本人，所有会话都用）、无工作区、各个工作区三个范围。每条记忆可以编辑、遗忘，或在全局和原来的范围之间移动。

### 7. 其他设置

- **设置 → MCP**：添加 MCP 服务器（stdio 命令或 HTTP 地址），它们的工具以 `<名称>__<工具>` 提供给 agent。连不上的服务器会被跳过，后端照常启动。
- **设置 → 通用 → 脱敏**：手机号、身份证号、银行卡号、邮箱和密钥在发给模型前换成占位符，模型的回答再还原。默认开启，切换立即生效。
- **设置 → 通用** 还显示后端状态、数据文件夹和应用版本，可以切换界面语言（English、简体中文）和外观。

### 数据与排错

- 所有数据在 `~/.ollupi`：`config.yaml`、会话数据库和记忆。从终端启动时可以用 `OLLUPI_HOME` 换一个目录。
- 后端读取你登录 shell（如 `~/.zshrc`）里的环境变量，MCP 配置里的 `${NAME}` 和 agent 跑的命令都能用到它们；新 export 的变量在下次重启后端时生效，不用重开应用。
- 后端起不来时，界面会显示原因，并提供 **后端日志** 和 **打开配置**；改好配置后重启后端。

## 开发者文档

以下是项目结构、开发和发布说明。

## 技术栈

| 层 | 选型 | 理由 |
| --- | --- | --- |
| 后端 | Go sidecar `ollupid`，直接 import ollupi | ollupi 是 Go 库；agent、SQLite、沙箱都在本进程内 |
| 协议 | ollupi 的 gateway：JSON-RPC 2.0 over WebSocket | UI 只是网关的一个客户端 |
| 契约 | ollupi 提交的 `gateway/protocol.schema.json`，生成 TypeScript | 契约由 ollupi 从它分发消息的那张表生成，并用真实流量测试；UI 只读这份 JSON |
| 外壳 | Electron + electron-vite | 窗口、原生对话框、托管 sidecar |
| 界面 | React 19 + TypeScript + Tailwind v4 + zustand | 领域逻辑在纯函数包里，store 只存状态 |
| Markdown | Streamdown + Shiki（JavaScript 正则引擎）+ beautiful-mermaid / mermaid | 流式输出时补全未收尾的块；代码高亮不需要 WebAssembly，页面的 CSP 保持不放开；` ```mermaid ` 画成按当前配色着色的图：流程、时序、状态、类、ER 和 xy 图由 beautiful-mermaid 同步画出，其余类型交给 mermaid，它在第一张这样的图出现时才加载 |

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
| `packages/core` | 纯函数领域逻辑，每条规则对照 ollupi 的实现：时间线归并、会话列表（只含顶层会话、按 `updated_at`、`created_at` 排序）、工作区排序、工具调用解读（等审批只在 `pending`、等回答/子代理在 `inProgress`；`callOf` / `approvalCallOf` 把一次调用读成一种 `ToolCall`：冻结的命令与输出、计划、问答、子代理，这四种是契约里有类型的内置工具；参数不合契约的和其余工具（定时任务、memory_search、MCP 等）都归为通用的 `tool`）、格式化。 |
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
            workspaces、threads、conversation、requests、models、tools、cron、memory、
            settings，以及纯客户端的 navigation、notices
views/      React 界面：sidebar、draft、conversation（items/ 按 item 类型渲染，tools/
            每种工具调用一份视图，漏一种不能编译）、requests（审批卡、问答卡）、
            cron、memory、settings、backend、common
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
- 定时任务集中在“定时任务”页按工作区管理：连接后用不带 `threadId` 的 `cron/list` 读取全部任务，之后只按 `cron/changed` 通知更新（模型、`cron/*` 调用和调度器推进下次执行时间都会发）；ollupi 在列表回复发出前挡住通知，所以按顺序应用即可。`cron/*` 调用的返回值不直接写入，以通知为准。新建任务只能发到未归档工作区里的顶层会话：归档期间的运行会被跳过，子代理会话不接收消息。执行时间按周期选（每小时、每天、工作日、每周、每月，加时间），由 core 的 `cronSpec` 写成五段 cron；已有任务的 spec 能被 `scheduleOf` 认出时用文字显示，认不出的（模型写的范围、步长等）原样显示。
- 审批策略"继承"就是不传 `approvalPolicy`。
- 脱敏开关在 Settings → General，是 ollupi 的全局设置，不写 config.yaml：连接后用 `settings/read` 读取，切换发 `settings/update`，界面只按 `settings/changed` 更新；ollupi 每次调用模型前都读它，所以改动不用重启后端，从下一次模型调用起生效。
- 内置工具的参数是模型写的 JSON，只有对照契约校验通过才当作计划、问题、子代理任务来显示；命令以 ollupi 冻结的执行内容为准。

### 契约如何守住

- **类型**：`pnpm protocol:generate` 从 ollupi 的契约生成；`pnpm protocol:check` 在生成结果过期时失败（CI 里跑）。
- **真实流量**：`packages/protocol/src/contract.test.ts` 用录下的会话校验双向每条消息；`packages/core/src/replay.test.ts` 把录下的通知按应用同样的方式应用，结果必须和服务端最后的 `thread/read` 一致。ollupi 一侧另有 `gateway/traffic_test.go`。
- **运行时**：开发构建里每条消息都对照契约校验，不符合就提示；握手时比对契约指纹（`protocolSha256`），后端和界面不是用同一份契约构建时显示横幅。

## 开发

前置：Node 22+、pnpm、Go 1.25+、Xcode Command Line Tools（sidecar 用 cgo 编译 SQLite）。sidecar 依赖打了 tag 的 [ollupi](https://github.com/0xfakeSpike/ollupi)（`sidecar/go.mod` 里的版本），不需要另外检出：

```bash
git clone git@github.com:0xfakeSpike/ollupi-desktop.git
```

```bash
pnpm install
```

```bash
pnpm dev
```

`pnpm dev` 先编译 sidecar，再启动 electron-vite（HMR）。首次运行写入 `~/.ollupi/config.yaml` 模板，填好后在应用里点 "Restart backend"。数据目录可用 `OLLUPI_HOME` 覆盖。环境变量优先用启动终端里的值，其次是登录 shell 的。登录 shell 的环境在每次启动后端和校验配置时重新读取，所以在 `~/.zshrc` 里新 export 的 key 不用重开应用；但启动终端里已有的同名变量仍然优先，要改它得从新的终端启动。

跟进 ollupi 的新版本：先在 ollupi 打 tag，再升级依赖，然后重新生成契约并重新录制会话，结果都要提交：

```bash
cd sidecar && go get github.com/0xfakeSpike/ollupi@<tag> && go mod tidy
```

```bash
pnpm protocol:generate
```

```bash
node packages/protocol/scripts/record-session.mjs
```

两边同时开发、ollupi 的改动还没打 tag 时，用一个不提交的 `go.work` 让 sidecar 编译同级目录里的 ollupi（`go.work` 已在 `.gitignore` 里）；生成和录制脚本通过 `go list -m` 找 ollupi，也会跟着用它。发布前删掉 `go.work`，换成新 tag：

```bash
cd sidecar && go work init . ../../ollupi
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

## 打包与发布

只出 macOS 包，Apple 芯片和 Intel 各一个 dmg。sidecar 按目标架构用 cgo 交叉编译到 `apps/desktop/resources/bin/<arch>/ollupid`，electron-builder 把对应架构的那份放进 `Ollupi.app/Contents/Resources/bin`。应用以 ad hoc 方式签名、未经公证（还没有 Developer ID），所以用户第一次打开要在"隐私与安全性"里放行，见上面的[安装](#安装)。

本机架构的 `.app`，不出 dmg，用来试包：

```bash
pnpm package
```

两个架构的 dmg，输出在 `apps/desktop/release/`：

```bash
pnpm release
```

发一个版本：改 `apps/desktop/package.json` 的 `version`，提交并打同名 tag（`v<版本>`），`pnpm release`，然后新建 GitHub Release，附上 `Ollupi-<版本>-arm64.dmg` 和 `Ollupi-<版本>-x64.dmg`。

## 配置（`~/.ollupi/config.yaml`）

ollupi 只在启动时读取配置，所以界面里的配置修改（Settings 的 Models 页、Memory 页的"学习"和"使用"开关）一律是"改文件并重启后端"：主进程用 `yaml` 的文档接口改写文件，保留注释；先把改后的内容交给 `ollupid --check-config` 校验，它会用一个临时数据库真实地启动一次 agent，用的是与正式启动完全相同的校验代码；通过后才原子地替换文件并重启。被拒绝的修改不会写进文件。`--check-config` 的输出（解码后的配置，含 API key，不含 MCP 写在文件里的 env/header 值；按 `provider/name` 展开的模型列表）的 TS 类型由 `ollupid --config-schema` 生成（`pnpm config:generate`，`pnpm config:check` 检查是否过期）。

- `models`：按提供方分组的模型，可在 Settings → Models 里管理（API key 和 `base_url` 一样直接填在界面里，写进 config.yaml）。每个提供方是一个 OpenAI 兼容接口（`provider` 名称唯一且不含 `/`，`base_url`，没有 key 的接口不写 `api_key`），`names` 列出它提供的模型；每个模型必须用 `limits: { context, output }` 声明上下文窗口和单次回答上限（ollupi 不内置任何模型的上限），并有自己的 client 和并发上限 `calls`（默认 4）。在添加提供方时，界面会从 `{base_url}/models` 获取模型列表供勾选。模型的 id 是 `provider/name`，即 ollupi 的 connection、`turn/start` 选模型用的键，所以两个提供方可以提供同名模型。第一个提供方的第一个模型是默认。
- `permissions`：agent 级权限（`approval` 审批策略 + `allow`/`ask`/`deny` 规则），工作区和会话在其上叠加。
- `slots`：同时运行的会话数上限（默认 32）。
- `shell`：`run_command` 工具与 macOS 沙箱。config.yaml 本身对命令不可读。
- `mcp`：MCP 服务器，可在 Settings → MCP 里管理。每个要么是 stdio（`command`、`args`、`env`，子进程继承后端的环境变量），要么是 streamable HTTP（`url`、`headers`）。工具以 `<name>__<tool>` 提供给模型；连不上的服务器被跳过，后端照常启动，状态和原因由 `mcpServer/list` 报告；sidecar 把这些服务器名交给 agent（`Unavailable`），指向它们工具的权限规则保留但本次不生效，新增这样的规则会被拒绝，等服务器连上再加。`env` 和 `headers` 的值可以写 `${NAME}` 引用环境变量，密钥留在 `~/.zshrc`；引用的变量没设置时配置被拒绝。`--check-config` 输出里不含 `${NAME}` 的值会被清空，界面显示为"写在 config.yaml 里"，编辑时保留。
- `memory`：使用（`use`，会话开始和每次压缩后载入一份记忆快照，并提供 `memory_search`）/ 生成（`generate`）开关；生成需要 `model`，填某个模型的 id（`provider/name`），与该模型共用 client 和 `calls`。记忆分三个范围：全局（关于用户本人，所有会话载入）、general（不属于任何工作区的会话）、工作区；会话载入全局加上自己的范围。Memory 页按范围列出。抽取新增的记忆默认放在会话自己的范围，模型只判断要不要放进全局；放错了可以一键改正（`memory/move`）：本地的移到全局，全局的移回它来自的范围。

## 许可

[MIT](LICENSE)
