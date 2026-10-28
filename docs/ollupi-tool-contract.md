# 工具调用在契约里的范围

## 结论

feed 里最重要的是模型给用户的回复（`agentMessage`），工具调用的细节占比很小。所以契约只给**要用户参与、界面专门显示**的内置工具提供类型，其余工具调用都按通用样式显示，不进契约。

## 契约里有类型的工具（`builtinTools`）

| 工具 | 参数 | 结果（`tools.Result.Output`） | 界面里是什么 |
|---|---|---|---|
| `update_plan` | `plan.Plan` | — | 给用户看的进度清单 |
| `Agent` | `subagent.Call` | — | 子代理，链到它自己的会话 |
| `request_user_input` | `userinput.Request` | `userinput.Answers` | 用户回答问题 |
| `run_command` | —（审批时用 `preparedExecution`） | `shell.CommandOutput` | 命令和它的输出 |

这些工具的参数类型同时是给模型的 `InputSchema` 的来源，契约和模型收到的 schema 来自同一份定义。流量测试按契约校验它们每一次真实调用的参数和结果。

## 其余工具：通用样式

包括定时任务的四个工具、`memory_search`、技能、工具自省、`read_tool_output`，以及 MCP 和应用自己的工具。

- 显示为一行"调用了某某工具"，默认折叠，展开后是参数和输出的原始 JSON。
- 用 `ItemRow.server` 区分提供方（`providers` 里是 ollupi 自带的：`cron`、`skills`、`memory`；其他的是 MCP 服务器或应用）。
- 它们的输出是写给模型的，ollupi 可以随时为模型调整，桌面端不要依赖它的结构。

定时任务给用户看的状态不从工具调用读，走 `cron/list` 和 `cron/changed`（`repo.CronJobView`）。"定时任务"页用的就是这份数据，有完整的类型。

## 工具名

`builtinTools` 按工具名作键，按名字区分就够：

- ollupi 不允许两个提供方有同名工具；
- MCP 工具的名字总是 `服务器__工具`，而内置工具的名字不含 `__`（生成契约时检查）。

桌面端同时核对 `ItemRow.server` 也成立。

## 桌面端要做的

重新生成契约（`pnpm protocol:generate`）。core 的 `ToolCall` 不加 `cron` 种类；如果已经按旧需求读了 `memory_search` 的参数或结果，改回通用显示。
