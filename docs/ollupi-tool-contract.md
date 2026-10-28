# 给 ollupi 的需求：把更多工具的参数和结果写进契约

## 为什么要

桌面端现在按“工具调用的种类”渲染：core 的 `callOf(item)` 把一次调用读成一种 `ToolCall`，每种有一份视图（时间线里的行、审批卡片里的说明）。能读成专门种类的前提是契约里有这个工具的类型：参数是模型自己写的 JSON，桌面端只在它通过契约校验后才当作那个类型使用，不自己猜结构。

现在 `protocol.schema.json` 的 `builtinTools` 只有 5 个工具：

| 工具 | 参数 | 结果 |
|---|---|---|
| `update_plan` | `plan.Plan` | — |
| `Agent` | `subagent.Call` | — |
| `request_user_input` | `userinput.Request` | `userinput.Answers` |
| `run_command` | —（用 `preparedExecution`） | `shell.CommandOutput` |
| `memory_search` | **没有** | `memory.SearchResult` |

其余 ollupi 自带的工具只有 `ItemRow.server` 标出提供方（`providers`：`cron`、`skills`、`memory`），参数和结果没有类型，桌面端只能把它们当 JSON 原样显示。最明显的是定时任务：审批卡片里是 `{"spec": "0 9 * * *", …}`，完成后是带 UUID 和 UTC 时间的结果 JSON，而桌面端其实已经能把 spec 说成“每天 09:00”（core 的 `scheduleOf`），只是拿不到有类型的参数。

## 需求

### 1. 定时任务的四个工具（优先）

把 `tools/cron` 的四个工具加进 `builtinTools`，参数和结果都给具名类型：

| 工具 | 参数 | 结果（`tools.Result.Output`） |
|---|---|---|
| `create_scheduled_job` | `name`、`spec`、`prompt` | 新建的任务（现在就是 `j.Create` 返回的那条任务记录） |
| `pause_scheduled_job` | `name`、`paused` | 改后的任务（`j.SetPaused` 返回的） |
| `delete_scheduled_job` | `name` | 现在是 `map[string]any{"deleted": name}` |
| `list_scheduled_jobs` | 无 | 现在是 `map[string]any{"jobs": jobs}` |

要点：

- 参数现在是 `Invoke` 从 `map[string]any` 里取的，`InputSchema` 是手写的 map。需要给参数定义 Go 类型（比如 `cron.CreateArgs`、`cron.PauseArgs`、`cron.NameArgs`），注册进 `builtinTools`，契约就从类型生成。`InputSchema` 里有 `pattern`、`minLength`、`maxLength` 这些约束，希望在类型上也表达出来（jsonschema tag），否则契约比模型实际收到的 schema 宽。`update_plan`、`request_user_input` 现在也是手写 `schema` 加 Go 类型两份，如果你们有办法让它们从同一份来，或者加个测试对照两份，一并考虑。
- `delete` 和 `list` 的结果现在是匿名 map，需要换成具名类型（比如 `cron.Deleted{Deleted string}`、`cron.JobList{Jobs []…}`），契约才能引用。
- 任务记录的类型最好和 `cron/list`、`cron/changed` 里用的是同一个（或者明确它们的关系）。这样桌面端读工具结果和读通知时是同一种结构，在审批卡片、时间线里说“每天 09:00 发送‘…’”时，用的就是“定时任务”页的那套写法。

### 2. `memory_search` 的参数（小）

`memory_search` 只有结果有类型，参数（`query`）没有。桌面端现在是绕开契约直接取 `query` 字段的，代码里注释了“契约不给参数类型”。需要一个参数类型（比如 `memory.SearchArgs{Query string}`）加进 `builtinTools`。

### 3. 工具名和提供方的对应（确认即可）

`builtinTools` 按工具名作键。桌面端在认定是某个提供方的工具时，会同时核对 `ItemRow.server` 是那个提供方 id（如 `cron`）。前提是：

- ollupi 自带工具的名字全局唯一；
- MCP 工具的名字总带 `服务器__` 前缀，不会和自带工具重名。

请确认这两点成立。如果将来不能保证，`builtinTools` 的条目就需要带上 `server`。

### 4. 流量测试校验工具的参数和结果

`TestTrafficMatchesContract` 现在校验每条消息符合契约，但不校验 `toolCall` item 里的 `arguments` 和 `result.output` 是否符合 `builtinTools` 里那个工具的类型。希望加上：对流量里出现的每个内置工具调用，按 `builtinTools` 校验它的参数和结果。测试已经跑了定时任务的增删暂停，补上校验后，桌面端靠的这些类型就有真实流量守着。

### 暂时不需要

技能（`list_skills`、`activate_skill`、`read_skill_resource`、`get_skills_root_dir`）、工具自省（`list_tool_providers`、`list_tools_for_provider`）和 `read_tool_output`，等桌面端设计它们的专门显示时再提。在那之前它们按通用的“参数和结果”显示，不缺类型。

## 桌面端拿到之后

重新生成契约（`pnpm protocol:generate`）之后，core 的 `ToolCall` 加一种 `cron`（带动作和有类型的参数、结果），桌面端加一份 `cron` 视图。时间线和审批卡片都经这份视图，不再显示 JSON。`memory_search` 的参数改为按契约读取。
