# 工作区经由环境访问：文件、Git、终端、附件

桌面端现在有几个面板直接操作窗口所在的这台 Mac：文件面板读本机路径，Git 改动在本机跑
`git`，终端在本机开 pty，附件把本机路径交给引擎。这些都默认“工作区在窗口这台机器上”。

这个前提有两种情况不成立：

- 窗口连的是远程 ollupid（[remote-mac-mini.md](remote-mac-mini.md)），工作区在那台机器上。
- 后端就在本机，但工作区建在云端沙箱提供方的环境里（0.8.17-beta.13 起有沙箱提供方）。

两种情况下，这些面板读到的都是错的机器。本文把它们改成经由工作区所在环境的 Box 访问。
内置浏览器不在本文范围内，另行讨论。

## 原则

**一个工作区是一台机器上的一个文件夹。** 引擎里已经是这样：`account.Workspace.Environment`
是 `Root` 所在的环境，工作区里的会话一律跑在工作区的环境里（`app/threads.go` 的
`newThread`，传了别的环境会被拒绝）。

**每个对话都属于一个工作区。** 现在不属于任何工作区的对话是个特例，带着自己的
`Thread.Environment`，跑在环境的 scratch 文件夹里。改成：每个环境有一个 scratch 工作区，
没指定工作区的对话就放进它。这样环境只属于工作区，后面所有面板和接口都以工作区为单位，
不用处理“没有工作区”的情况。见第 0 节。

**桌面端不碰工作区的路径。** 读写文件、跑 git、开终端都经网关交给引擎，引擎用
`envs.In(user, workspace.Environment)` 取 Box 来做。调用链只有一条：

```
渲染进程 → 网关协议 → app（检查用户、工作区、路径） → Box（本机 / 云沙箱）
```

本机后端加本机环境也走这条路，不留“恰好是本机就直接读”的分支。这样多租户时“这个环境
属不属于这个用户”由引擎统一检查，本机和远程也只有一套行为。

**人的操作和 agent 的操作分开。** 文件面板、Git 改动、终端是人在操作，不走 agent 的
审批，但同样受用户边界约束：只能碰自己的工作区和环境。

**和机器有关的差异放进 Box。** 同一个操作在不同机器上做法不同（比如把文件移到回收站），
由 Box 的实现决定，网关和桌面端都不按机器分支。

**附件的来源是人的设备，不是沙箱。** 见第 4 节。

## 现状

| 功能 | 现在的实现 | 依赖本机的地方 |
|---|---|---|
| 文件面板 | `main/files.ts`：`list / read / kind (root, path)` | `fs` 读窗口这台 Mac |
| Git 改动 | `main/changes.ts`：`list / diff / stage / unstage / discard / commit (root, …)` | 本机 `git`；丢弃新文件用 `shell.trashItem` |
| 终端 | `main/terminal.ts`：每个工作区一个 `node-pty` 登录 shell | 本机 pty；注释写明“不经过 ollupi” |
| 选文件夹 | `main/ipc.ts` 的原生 `dialog.showOpenDialog` | 只能选本机路径 |
| 附件 | `domains/attachments.ts` 发 `{type:"file", path}`；粘贴的内容先写本机临时文件 | 引擎 `attachmentSource` 用“用户的第一个环境”的 Box 读这个路径 |

引擎这边已有的能力：

- `sandbox.Box` 有 `Stat / ReadDir / Open / WriteFile / Move / Run / Start / Canonical /
  Directory / Same`，本机沙箱（`Sandbox`）和远程机器（`sandbox.Remote(Machine)`）都实现了。
- 本机沙箱的 `Open` 会过 `CheckRead`，`<home>/data` 不可读。
- 附件存在引擎自己的存储里（`a.attachments.Put`，键是 `<thread>/<file>`），经网关的
  `GET /attachments/{thread}/{attachment}` 读出。

## 设计

### 0. scratch 工作区

**每个环境一个 scratch 工作区。** 新增工作区类型 `scratch`（现有 `project`、`hub`），根目录
是环境自己的文件夹：本机环境是 `<home>/scratch`（第一个身份的第一个环境）或
`<home>/users/<id>/<环境>`，云沙箱是提供方给的工作目录。它和环境一起创建，和环境一起删除；
不能归档、移动或单独删除，可以改名。

**创建对话只加一个判断。** `newThread` 里：

```go
if workspace == "" {
    workspace = scratchOf(environment) // environment 为空时取用户的第一个环境
}
```

之后的逻辑和普通工作区完全一样。`Thread.Environment` 删掉，对话的环境一律从工作区取；
`thread/start` 的 `environmentId` 只用来在没给工作区时选哪个环境的 scratch 工作区。

**随之删掉的特例。** 引擎里现在按“没有工作区”分支的地方都不再需要：

| 位置 | 现在的特例 | 之后 |
|---|---|---|
| `app/settings.go` `permitThread` | 没有工作区就不叠工作区那一层权限 | 总是叠 |
| `app/settings.go` `allowAlways` | 没有工作区时“总是允许”记在对话上 | 记在工作区上，和其他工作区一样 |
| `app/turns.go` `usableWorkspace` | 没有工作区返回空 | 总有工作区 |
| `memory/memory.go` `Local` | 没有工作区时作用域是 `General` | `General` 作用域删掉，就是 scratch 工作区的本地记忆 |
| `tool/builtin/hub/hub.go` | 目标对话没有工作区时跳过检查 | 总有工作区 |
| `store/sqlite/owned.go` | 按空工作区过滤对话、记忆 | 按 scratch 工作区的 id 过滤 |

桌面端渲染层里按“无工作区”分组、显示的地方同样改成按工作区类型判断。

**行为上的两点变化：**

- 不属于工作区的对话里点“总是允许”，以前只对这一个对话生效，以后对 scratch 工作区里的
  所有对话生效。这和其他工作区的行为一致。
- 以前的 `General` 记忆就是“不属于工作区的对话共享的本地记忆”，以后是 scratch 工作区的本地
  记忆，范围相同，只是换了表示方式。

**迁移**（ollupi 的编号迁移）：给每个已有环境建 scratch 工作区；`workspace_id` 为空的对话
指向它所在环境的 scratch 工作区；`General` 作用域的记忆改成 scratch 工作区作用域；删掉
`threads.environment_id`。

有了这一步，文件面板、Git 改动、终端对原来“不属于工作区”的对话也能用，看到的就是
scratch 文件夹。

### 1. 文件面板

新增网关方法，参数都以工作区为单位，路径相对于工作区根目录：

| 方法 | 参数 | 结果 |
|---|---|---|
| `workspace/listFiles` | `workspaceId, path` | 目录项（名字、类型、大小），文件夹在前 |
| `workspace/readFile` | `workspaceId, path` | 预览：文本（上限 256 KB）、图片、PDF，或“二进制/过大” |
| `workspace/statFile` | `workspaceId, path` | 文件 / 文件夹 / 不存在 |

规则沿用 `main/files.ts` 现在的规则，搬到引擎里：

- 拼出路径后用 `box.Canonical` 解析符号链接，结果必须在工作区根目录内，否则拒绝。
- 隐藏 `.git`、`.DS_Store`。
- 读文件经 `box.Open`，所以本机沙箱的 `CheckRead` 自动生效。
- 大小上限和类型判断（前 8000 字节有 NUL 就算二进制）放在引擎里，桌面端只负责展示。

大文件（PDF 上限 50 MB）不放进 JSON-RPC 的结果，改走 HTTP：
`GET /workspaces/{workspace}/files/{path...}`，鉴权方式和附件下载一样，桌面端用它显示
图片和 PDF。

### 2. Git 改动

不给 Box 加 Git 专用的方法。引擎用 `box.Run` 在工作区根目录执行 `git`，解析逻辑从
`main/changes.ts` 搬到引擎：

| 方法 | 对应的 git 操作 |
|---|---|
| `workspace/changes` | `status --porcelain`、当前分支和 HEAD |
| `workspace/diff` | 单个文件的 diff（上限 512 KB），新文件和空树比较 |
| `workspace/stage`、`workspace/unstage` | `add` / `restore --staged` |
| `workspace/discard` | 见下文 |
| `workspace/commit` | `commit -m` |

- 这些命令用 Box 默认的权限跑就够了：工作区可写，不需要联网。不用完全访问。
- 环境里没装 git 时，返回明确的错误，面板显示“这个环境没有 git”。
- **丢弃新文件**：git 里没有的内容丢了就找不回来，所以仍然移进回收站，不直接删除。
  怎么移由 Box 新增的 `Trash` 方法决定（见下文），引擎只调用 `box.Trash(ctx, path)`。
  Box 做不到时返回错误，面板提示无法丢弃，不退回到直接删除。

```go
// Box 新增：把 path 移进这台机器的回收站，能从那里恢复。
Trash(ctx context.Context, path string) error
```

| 实现 | 做法 |
|---|---|
| 本机沙箱，macOS | 移进废纸篓，和 Finder 的“移到废纸篓”一样（`NSFileManager trashItemAtURL`，能“放回原处”）。和现在桌面端的 `shell.trashItem` 效果相同 |
| 本机沙箱，Linux | 按 freedesktop 回收站规范 `mv` 进 `~/.local/share/Trash/files/`，并在 `Trash/info/` 写一份 `.trashinfo`（原路径和删除时间），文件管理器能恢复 |
| 远程机器（`Machine`） | 由提供方实现；Linux 沙箱照上一行的做法，用 `Run` 执行 `mv` 并写 `.trashinfo` |

  `Trash` 和其他写操作一样受 Box 的写入范围约束：只能移走工作区里的文件。

Git 面板现在什么时候刷新，由桌面端决定（打开面板、轮次结束时）。改到引擎后仍由桌面端
主动请求；以后如果要推送，再加 `workspace/changed` 通知，本文不做。

### 3. 终端

终端是三项里改动最大的，需要 Box 和网关都补能力。

**Box 加 PTY。** 现在 `Box.Start` 只返回一个普通读写流，`Command` 里没有 tty。新增：

```go
type TerminalSpec struct {
    Cwd        string
    Cols, Rows int
    Env        map[string]string
    FullAccess bool
}

type Terminal interface {
    io.ReadWriteCloser
    Resize(cols, rows int) error
    Wait() (exitCode int, err error)
}

// Box 新增
Terminal(ctx context.Context, spec TerminalSpec) (Terminal, error)
```

本机沙箱用 pty 实现；远程机器（`Machine`）也要实现，云沙箱一般自带 PTY 接口。做不到的
提供方返回错误，界面显示“这个环境不支持终端”。

**终端属于引擎，不属于窗口。** 引擎按“用户 + 工作区”保管终端和最近 256 KB 的输出，和
现在主进程的做法一样。窗口断线重连、换一台设备打开，都能看到同一个终端和它之前的输出。
终端在 shell 退出、工作区归档、环境删除或用户删除时结束，窗口全部关掉不会结束它，不设
闲置超时。以后长期挂着的 shell 多了再加。

**数据走独立的 WebSocket。** 生命周期走 RPC：`terminal/open`（返回终端 id 和已有输出）、
`terminal/resize`、`terminal/close`，再加 `terminal/exited` 通知。输入输出走单独的连接
`GET /terminals/{id}`（WebSocket，二进制帧，鉴权和主连接一样）。不和 JSON-RPC 主连接
混在一起，是为了 `cat` 大文件这种情况下不堵住其他消息，也不需要 base64。

**权限：终端总是完全访问。** 终端里的命令是人自己要跑的，不是 agent 的，所以用
`TerminalSpec.FullAccess = true` 启动，不受 Box 给 agent 的限制（只有工作区可写、不联网），
也不走审批。

- 本机沙箱和云沙箱都这样，不按提供方区分。
- Box 给不了完全访问（`CanEscalate()` 为 false）时，返回错误，界面显示“这个环境不支持
  终端”。不降级成受限的 shell。

**完全访问在 macOS 上也经过 seatbelt。** 现在本机沙箱里 `FullAccess` 的命令完全不经过
seatbelt（`pkg/sandbox/sandbox.go` 的 `command`），所以 sidecar 配的“`<home>/data` 不可读”
对它不起作用：完全访问的命令能读到数据库里的模型 API key 和所有身份的数据。改成：

- 完全访问用一份单独的 seatbelt 配置：`(allow default)`，只加上
  `(deny file-read* file-write* (subpath <DenyRead 里的每个目录>))`。
- 人在终端里的命令和 agent 经审批后用完全访问执行的命令，都走这份配置。

这能挡住无意的读取（比如 `grep -r` 扫到 data 目录，或 agent 顺手 `cat` 了库文件），但不是
安全边界：`(allow default)` 放行了 launchd 等系统服务，命令可以用 `open`、`osascript`、
`launchctl` 在沙箱外起一个进程去读。把这些也堵上，会让终端里很多正常操作用不了，所以不堵。

在 Linux 上，本机沙箱本来就只支持完全访问模式（没有 seatbelt），这一条无效。多人共用的
服务器要真正隔离，需要让命令以另一个 Unix 用户运行（data 目录只给 ollupid 的用户读），
或者给用户配云沙箱。这超出本文范围，但要写进部署文档：在共用服务器上用 `local` 提供方，
每个能连上来的用户都能拿到这台服务器上的 shell，能读到整个库。

### 4. 附件

附件有两个来源，分开处理。

**从人的设备发出的文件**（粘贴的截图、从 Finder 拖进来的文件、从网页拖来的图片）：
桌面端把文件内容上传给引擎，不再发路径。

1. `POST /uploads`（HTTP，鉴权同附件下载），请求体是文件内容，头里带文件名。引擎检查
   大小（沿用 `maxImageBytes` = 20 MB）和类型，存成这个用户的一个暂存上传，返回 `uploadId`。
2. 发消息时输入写成 `{type: "upload", uploadId, name}`。引擎在接受消息时把暂存内容移进
   这个会话的附件存储，和现在 `keepAttachment` 之后的流程一样。
3. 暂存上传只属于上传它的用户，只能用一次；一段时间没被用掉就清除。

先上传再发送，是因为发消息时会话可能还不存在（`thread/start` 之前就要选附件），而且
文件内容不该塞进 JSON-RPC 的消息里。

这条路和 sandbox 无关：附件存进引擎的存储，不存进环境。agent 需要在环境里用这个文件时，
由引擎按需写进 Box，那是另一步。本机后端也走上传，不保留“本机路径直接读”的写法。
`TempAttachments` 和 `attachments.pathOf / writeTemp / removeTemp` 这几个 IPC 随之删掉。

**引用工作区里已有的文件**（比如在文件面板里选一个文件发出去）：输入写成
`{type: "workspaceFile", workspaceId, path}`，引擎经工作区环境的 Box 读取，规则同第 1 节。

引擎现在的 `{type: "file", path}` 和 `attachmentSource`（“用户的第一个环境就是客户端所在的
机器”）是错误的前提，删掉，不保留。

### 5. 选工作区文件夹

新建工作区时，先选环境，再在这个环境里选文件夹：

- `environment/listDir`（`environmentId, path`）：列出目录，只返回文件夹，不读文件内容。
  经 `box.ReadDir`，受 `CheckRead` 约束。
- `environment/makeDir`（`environmentId, path`）：新建文件夹。Box 没有 mkdir，加一个
  `MakeDir` 方法，不用 `Run mkdir` 绕过去。
- 选好后照旧调用 `workspace/add`，引擎用 `box.Directory` 校验。

界面上用一个文件夹浏览器替代原生对话框，所有环境都用它，包括“本机后端 + 本机环境”。
本机时用原生对话框体验更好，但第一步不做，以后作为增强再考虑。

### 6. 不再提供“在 Finder 中显示”“用默认程序打开”

这类操作只对窗口这台机器上的路径有意义。工作区的文件一律不提供这两种能力，不按“是不是
本机”区分。要删掉的入口：

| 位置 | 入口 |
|---|---|
| `views/sidebar/ThreadGroup.tsx` | 工作区右键菜单的“在 Finder 中显示”（打开工作区根目录） |
| `views/conversation/FilesPanel.tsx` 和 `domains/files.ts` 的 `fileMenu / revealPath` | 文件面板右键“在 Finder 中显示” |
| `views/common/FileLink.tsx` | ⌘ 点击文件链接用默认程序打开 |
| `views/conversation/ResultFiles.tsx` | 结果文件的“打开”按钮 |
| `views/conversation/EnvironmentPanel.tsx` | 打开工作区根目录、打开改动的文件 |

保留的：设置和后端错误页里打开应用自己的数据目录、日志（`SettingsScreen.tsx`、
`BackendScreen.tsx`），以及浏览器面板里显示下载的文件（`BrowserPanel.tsx`）。这些路径本来
就在窗口这台 Mac 上，不属于工作区。

超过预览上限的文件（PDF 50 MB）以前能“在外部打开”，以后只显示“文件过大，无法预览”。

## 桌面端删掉的东西

- `main/files.ts`、`main/changes.ts`、`main/terminal.ts` 和对应的 IPC 通道
  （`files:*`、`changes:*`、`terminal:*`），改成渲染进程直接经网关调用。
- `main/attachments.ts` 和 `attachments:*` 通道。
- `node-pty` 依赖（终端搬进引擎后桌面端不再需要）。
- 工作区文件的“在 Finder 中显示”“用默认程序打开”入口（第 6 节）；`changes.discard` 里的
  `shell.trashItem`。
- [remote-mac-mini.md](remote-mac-mini.md) “远程模式下的限制”里关于文件面板、终端、
  Git 改动的那一条。

## 实现顺序

每一步都能单独发版：

0. **scratch 工作区**：引擎加 `scratch` 类型、`newThread` 的判断和迁移，删掉第 0 节列出的
   特例；桌面端改掉按“无工作区”的判断。后面的接口都以工作区为单位，所以这一步先做。
1. **附件上传**：引擎加 `POST /uploads` 和 `upload` 输入，删 `file` 输入；桌面端改成上传。
   这一步修好远程模式下发不了附件的问题，改动最小。
2. **文件面板**：引擎加 `workspace/listFiles / readFile / statFile` 和文件下载路由；
   桌面端换调用，删 `main/files.ts`。
3. **Git 改动**：引擎加 `workspace/changes` 等方法和 `Box.Trash`（macOS、Linux、远程机器
   三种实现）；桌面端换调用，删 `main/changes.ts`，删掉工作区文件的打开和显示入口。
4. **选文件夹**：引擎加 `environment/listDir / makeDir` 和 `Box.MakeDir`；桌面端做文件夹浏览器。
5. **终端**：完全访问的 seatbelt 配置、`Box.Terminal`、本机和远程机器的实现、网关的终端
   连接；桌面端换成连网关，删 `main/terminal.ts` 和 `node-pty`。

引擎改动在 ollupi 仓库，按它的版本发布；sidecar 升级 `go.mod` 里的 ollupi 版本后，桌面端
再跟着改。

## 已定的取舍

| 问题 | 决定 |
|---|---|
| 不属于工作区的对话 | 放进环境的 scratch 工作区，删掉 `Thread.Environment` 和所有“无工作区”特例（第 0 节） |
| 终端的权限 | 总是完全访问，不按提供方区分（第 3 节） |
| 完全访问的命令 | macOS 上也经过 seatbelt，只挡 data 目录（第 3 节） |
| 终端的生命周期 | 活到 shell 退出或工作区、环境、用户被删，不设闲置超时（第 3 节） |
| 丢弃新文件 | 移进回收站，做法由 `Box.Trash` 按机器实现（第 2 节） |
| 选文件夹 | 统一用环境浏览器，原生对话框以后再说（第 5 节） |
| 在 Finder 中显示、用默认程序打开 | 工作区文件不再提供（第 6 节） |

## 不在本文范围

- **多人共用服务器上的隔离**：`local` 提供方上，终端是完全访问；agent 和文件面板能读到的
  范围也是整台机器（受 `CheckRead` 约束，但工作区可以登记任意目录）；Linux 上没有 seatbelt。
  真正的多租户部署应该让命令以另一个 Unix 用户运行，或者给用户配云沙箱。
- **内置浏览器**：agent 的浏览器工具连的是桌面端内置浏览器在本机回环上的端点，另行讨论。
