# hub 待办（todo）：引擎侧需求（v2）

## 0. 这一版定了什么

- **状态回到引擎**：新建 `todos` 表，hub 的待办与已完成事项以数据库为唯一真相。
- **命名只用 todo**：表 `todos`、类型 `Todo*`、方法 `todo/*`、工具 `add_todo` / `update_todo` / `list_todos`。
  不使用 `plan`、`hubPlan`、`task` 命名；`plan` 只指单轮的 `update_plan`（`agent.PlanTool`），两者不共用词。
- **`TODO.md` 降级为一次性导入源**：首次读到待办时导入，随后重命名为 `TODO.md.imported-<年-月-日>` 归档，
  引擎不再读写它。`done/*.md` 同样只导入一次，文件原样留着。
- **桌面只渲染和调用命令**：不再解析 Markdown、不再盯着文件变化重读。

上一版需求（`docs/hub-plan-requirements.md`，未采纳）主张"文件仍是唯一真相、不建表"。方向已改，那份文档删除。

### 与被删除提交 fee04c7 的关系

fee04c7（2026-11-20）删掉了 `todos` 表、`todo/*` 协议和三个 todo 工具，理由是"引擎不该保存用户的计划"。
这次不是简单回滚，而是把判断改回来：hub 的待办是**结构化状态**（有 id、有状态迁移、要被勾选和归档、两个客户端要同时看到），
不是一段文档。当时用文件的三个痛点——任务身份是整行文字、改状态要读改写整个 Markdown、变化只能靠"文件工具调用结束"猜——
只有表能解决。新表在原 0009 结构上补了 `ended_at` 与索引，并去掉"完成日期只管 done"的含混。

## 1. 分工与边界

| 谁 | 负责 |
| --- | --- |
| 引擎（表 + app + 工具 + 协议） | 待办的身份、状态机、归档时间、排序、事件、校验、一次性导入 |
| hub agent | 用 `add_todo` / `update_todo` / `list_todos` 读写；会话进展只来自 `list_conversations` |
| 桌面 | `todo/list` + `todo/changed` 渲染列表与归档；勾选、放弃、改派都发起 `todo/update` |

不做：

- 不与 `update_plan`（单轮步骤）合并，也不改它的命名与 provider（`agent.PlanProvider = "plan"` 原样保留，它服务的是单轮计划）。
- 不做硬删除、不做操作历史（`dropped` 就是"放弃"，行保留；要清理以后再加 `todo/delete`）。
- 不做多设备同步、不做共享待办：待办属于用户，不是某个工作区的文件。
- 不做 Markdown 导出（本期）。如果以后要，再开 `todo/export`，仍然只读一个方向。

## 2. 数据模型

### 2.1 迁移 `store/sqlite/migrations/0012_todos.sql`

`0009` 建过同名表、`0010` 删掉了，所以这里重新建（不是在 0009 上改）。

```sql
CREATE TABLE todos (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id integer NOT NULL,
  title text NOT NULL,
  workspace_id text NOT NULL DEFAULT '',
  thread_id text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'handed', 'done', 'dropped')),
  notes text NOT NULL DEFAULT '',
  result text NOT NULL DEFAULT '',
  created_at datetime NOT NULL,
  updated_at datetime NOT NULL,
  ended_at datetime,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX todos_status ON todos(user_id, status, ended_at);
CREATE INDEX todos_thread ON todos(user_id, thread_id) WHERE thread_id <> '';
```

字段语义：

| 字段 | 语义 |
| --- | --- |
| `id` | 用户内自增（`max(id)+1`，同一事务里取），对外就是任务身份，桌面拿它当 key 和命令参数 |
| `title` | 一行做什么；单行，≤200 runes |
| `status` | `open` 未开始 / `handed` 已交给会话 / `done` 完成 / `dropped` 放弃 |
| `workspace_id` | 待办指向的项目工作区；只有链接了会话才有值（从会话带过来） |
| `thread_id` | 正在做它的会话；可由 `start_conversation` 或 `update_todo` 设置 |
| `notes` | 备注，可多行；≤2000 runes |
| `result` | 完成时的一句话结果；单行，≤500 runes |
| `ended_at` | 进入 `done`/`dropped` 的时间；回到 `open`/`handed` 时清空。归档按它分月 |

`ended_at` 取代旧的 `done_at`：放弃的任务也需要"哪天放弃的"，否则归档分月少一类。
同一用户只能有一个 hub 工作区（`app.ErrSecondHub`），所以待办按 `user_id` 归属即可，不加 `hub_workspace_id`。

**行为变化**：旧约定"计划跟着文件夹走"（`docs/lifecycle.md`）不再成立——hub 换工作区，待办跟着用户走。

### 2.2 `account`

恢复 `TodoStatus`（`open` / `handed` / `done` / `dropped`）与 `TodoStatuses`，以及：

```go
type Todo struct {
	ID        int64
	Title     string
	Workspace string // 项目工作区 id
	Thread    string // 会话 id
	Status    TodoStatus
	Notes     string
	Result    string
	Created   time.Time
	Updated   time.Time
	Ended     *time.Time
}
```

## 3. store

```go
type TodoFilter struct {
	Statuses []account.TodoStatus // 空表示全部
	Limit    int                  // 0 表示不分页
}

// Reader
Todos(user string, f TodoFilter) (todos []account.Todo, more bool, err error)
Todo(user string, id int64) (account.Todo, error)

// Tx
AddTodo(user string, t account.Todo) (account.Todo, error) // 分配 id，发 owned 事件
PutTodo(user string, t account.Todo) error                 // 发 owned 事件
```

- 排序固定为：未结束的在前（`ended_at IS NULL DESC`），结束的按 `ended_at DESC`，同组按 `id`。
  这句排序写在 store 里，客户端不再各排一遍。
- `more` 用 `limit+1` 判断，和 `Threads` 的做法一致。
- `store.Owned` 加回 `Todo *account.Todo`；不需要 `TodoDeleted`。

## 4. app

`app/todos.go`（参考 fee04c7 之前那版，改动见下）：

```go
const (
	MaxTodoTitleRunes  = 200
	MaxTodoNotesRunes  = 2000
	MaxTodoResultRunes = 500
)

var ErrInvalidTodo = errors.New("invalid todo")

// TodoChange 只改给了的字段；指针为 nil 表示不动，指向 "" 表示清空。
type TodoChange struct {
	Title  *string
	Status *account.TodoStatus
	Notes  *string
	Result *string
	Thread *string
}

func (a *App) Todos(ctx context.Context, user string, statuses []account.TodoStatus, limit int) ([]account.Todo, bool, error)
func (a *App) AddTodo(ctx context.Context, user, title, notes string) (account.Todo, error)
func (a *App) UpdateTodo(ctx context.Context, user string, id int64, c TodoChange) (account.Todo, error)
```

规则：

- `title` trim；换行折叠成空格；空标题报 `ErrInvalidTodo`；超长报错并说明上限。
- 新增的待办状态一律 `open`，`workspace` / `thread` 为空。
- `Status` 进入 `done` / `dropped`：`ended_at` 为空时记 `now`；已经是 `done` 再改 `dropped` 不改 `ended_at`。
- `Status` 回到 `open` / `handed`：清空 `ended_at`，`result` 保留（要清由调用方给 `Result: &""`）。
- `Thread` 设成某会话：校验会话属于该用户，`workspace_id` 跟着会话的 `workspace_id`；设成 `""` 表示解除链接、`workspace_id` 一并清空。
- 不自动改状态：链接会话不等于 `handed`，状态只由调用方显式给（`start_conversation` 会显式给 `handed`）。
- 错误信息要能让模型自己纠正：未知 id 时列出当前 id 与标题（最多 20 条）。

`DeleteThread` 同事务里处理悬挂链接：

```sql
UPDATE todos SET thread_id = '', workspace_id = '',
  status = CASE WHEN status = 'handed' THEN 'open' ELSE status END,
  updated_at = ?
WHERE user_id = ? AND thread_id = ?
```

改到的每一行都发 `owned` 事件（删会话时桌面能立刻看到任务回到未开始）。

## 5. 一次性导入旧文件

`app/todos_import.go`，只在 `app.Todos` 里触发（`todo/list` 是唯一入口）：

1. 每个用户每进程只尝试一次（内存 `sync.Map` 守卫）；表里已有任何一行就跳过。
2. 找到用户的 hub 工作区（`kind == hub`，没有被归档），通过 `app.Boxes`（`sandbox.Box`）读：
   - `<root>/TODO.md`：存在才导入；
   - `<root>/done/*.md`：按月文件逐个导入。
   走 Box，所以 hub 工作区在远程沙箱时也能读。
3. 解析沿用旧行格式，宽松处理：
   - `- [ ] ...` / `- [x] ...`，删除线 `~~任务~~` 视为 `dropped`，否则 `[x]` 为 `done`；
   - 第一个 ` · ` 之前是标题，之后依次尝试匹配项目名（按 `workspaces.name`）与会话链接 `[标题](#thread-<id>)`；
   - 缩进行作为备注；`result:` / `结果：` 开头的行作为 `result`；
   - `done/*.md` 的行 `ended_at` 取文件名月份的 1 号；`TODO.md` 的结束行取导入时刻；
   - 认不出的行不丢：留在原文件里（文件马上被重命名归档），导入不因它失败。
4. 全部插入在一个事务里；成功后把 `TODO.md` 重命名为 `TODO.md.imported-<年-月-日>`。
   `done/*.md` 保持原样，不删不改。
5. 导入失败：`app.Todos` 返回该错误（面板显示"旧待办导入失败"），不要静默返回空列表——
   否则用户会以为任务丢了。修好后下一次调用会重试（只有成功才写守卫）。

为什么在 app 而不是提示词里让 hub 自己导：模型驱动的数据迁移不可靠，且导入要在一个事务里完成，
不能中途半份。

## 6. hub 工具（`tool/builtin/hub`）

只在 hub 角色可见（`agent.HubProvider`，`HubMain`）。都是数据库操作，不经 sandbox，不需要审批。

**`add_todo`**
- 入参 `{title, notes?}`；输出一个待办对象（`id`、`title`、`status`、`notes`、`created`…）。
- 描述："Records a todo of the user's, open until it is handed out. Returns it with its id."

**`update_todo`**
- 入参 `{id, title?, status?, notes?, result?, conversation?}`；输出改后的待办。
- `status` 的 enum 来自 `account.TodoStatuses`；`notes` / `result` 是 `*string`，给 `""` 表示清空。
- `conversation` 让待办链接到一个会话（`status` 不会自动变）。

**`list_todos`**
- 入参 `{statuses?}`，缺省 `open` + `handed`；最多 50 条，多了在输出里说明还有。
- 只读工具，`ReadOnlyHint`。

**`start_conversation` 恢复 `todo` 参数**
- `{workspace, title, message, todo?}`，输出 `{conversation, turn, queued, todo?}`。
- 给了 `todo` 就链接会话并置 `handed`，两件事在一个调用里完成；会话已启动但链接失败时，
  错误信息必须说明"会话已启动，待办未链接"并带上会话 id。

工具输出统一用 `minute`（`2006-01-02 15:04`）时间格式，和现有 hub 工具一致。

## 7. 协议

| 类型 | 定义 |
| --- | --- |
| 方法 | `todo/list` `{statuses?, limit?}` → `{data, more?}`；`todo/add` `{title, notes?}` → `{todo}`；`todo/update` `{id, title?, status?, notes?, result?, threadId?}` → `{todo}` |
| 通知 | `todo/changed` → `{todo}`（每次 Add/Put 成功后发） |
| 类型 | `TodoRow`、`TodoListParams`、`TodoListResult`、`TodoAddParams`、`TodoUpdateParams`、`TodoResult`、`TodoStatus` |

- `TodoRow.endedAt *time.Time`（`endedAt`，不是 `doneAt`），`workspaceId` / `threadId` 可省。
- `todo/list` 的 `limit` 复用现有 `limit()` 助手：缺省 500，上限 2000；`more` 说明超出。
- `todo/update` 的 `title` / `notes` / `result` / `threadId` 都是指针：省略不动，`""` 清空。
- 错误码：`app.ErrInvalidTodo` → `jsonrpc.CodeInvalidParams`（加回 `errorCodes` 表）。
- 重新生成 `gateway/protocol.schema.json`（sha 会变），桌面 `pnpm protocol:generate` 后才能过契约测试。

## 8. 规则与文档

- `agent/rules.go` 的 hub「The plan」整段重写为「Your todos」：
  - 待办在引擎里，用 `add_todo` / `update_todo` / `list_todos` 维护，**不要**再用文件维护清单，也不要写 `TODO.md`；
  - 开始规划时先 `list_todos`；用户给一件事就 `add_todo`；
  - 交给会话用 `start_conversation` 的 `todo` 参数，或 `update_todo` 置 `handed` 并给 `conversation`；
  - 做完核对过：`status=done` + 一句 `result`；放弃：`status=dropped`，`notes` 写原因；
  - 会话进展只从 `list_conversations` 来，不抄进 `notes`。
- 删掉 `agent.PlanFile` / `agent.PlanItem` / `agent.DoneFolder`（只有规则和导入用；导入用的文件名放在 `app` 里不导出）。
- `docs/lifecycle.md` 第 55 行改写：引擎用 `todos` 表保存 hub 的待办与已完成事项（迁移 0012），
  一次性导入旧 `TODO.md` / `done/`；待办跟着用户，不跟着文件夹；桌面读 `todo/list`，不收文件格式约定。

## 9. 桌面端配套（不在本需求内，列出以免漏）

- `packages/core/src/workspaces.ts`：删 `HUB_PLAN_FILE`、`HUB_DONE_FOLDER`、`isPlanPath`、`openPlanItems`、
  `doneMonths`、`planThreadLink`、`PlanItem`、`parsePlan`、`planItem`；`hubOf` 保留。
- `domains/plan.ts` → `domains/todos.ts`：数据来自 `todo/list`（列表要 open+handed，归档要 done+dropped），
  订阅 `todo/changed` 就地更新；去掉文件读取、`item/changed` 的文件工具监听和窗口聚焦重读
  （重连/初始化时重新拉一次即可）。
- `TodosPanel.tsx`：按现在已定的列表样式渲染结构化数据；勾选→`todo/update status=done`（可带一句结果）、
  放弃→`dropped`、改派→`threadId`；"已完成事项"按 `endedAt` 的月份分组；去掉 "Other content"、Reload、
  Open 文件这些文件时代的 UI。
- i18n：`i18n/messages/conversation.ts` 的 `todos` 段重写，去掉讲文件的文案。

## 10. 测试

- 迁移：从 0011 升级到 0012 成功；全新库也成功；`todos` 索引存在。
- app：新增/更新/完成/放弃/重开；`ended_at` 的进入与清空；`result` 清空；未知 id、空标题、超长；
  链接不存在的会话；删除会话后 `handed` 回到 `open` 且链接清空。
- store：排序（未结束在前、结束按时间倒序）、`limit+1` 的 `more`、状态过滤。
- 导入：`TODO.md` + 两个月 `done/*.md` 导入一次；第二次调用不重复；`TODO.md` 被重命名；
  含删除线的行是 `dropped`；认不出的行不中断导入；远程 Box 用 `workspace/box_test.go` 的假机器跑一遍。
- hub 工具：`add_todo` → `start_conversation(todo)` → `update_todo(done)` 全链路；`start_conversation`
  在链接失败时的错误文案；`list_todos` 缺省只给 open+handed。
- 协议：schema 重新生成、契约测试通过、`todo/changed` 在 add/update 后到达。

## 11. 落点

| 位置 | 改动 |
| --- | --- |
| `store/sqlite/migrations/0012_todos.sql`（新） | 建表与索引 |
| `account/account.go` | `Todo`、`TodoStatus`、`TodoStatuses` |
| `store/store.go` | `Reader.Todos/Todo`、`Tx.AddTodo/PutTodo`、`TodoFilter`、`Owned.Todo` |
| `store/sqlite/owned.go` | 行映射、id 分配、两个写方法、事件 |
| `app/todos.go`（新） | 三个方法、`TodoChange`、校验 |
| `app/todos_import.go`（新） | 一次性导入与重命名 |
| `app/threads.go`（`DeleteThread` 所在） | 清理悬挂链接 |
| `tool/builtin/hub/hub.go` | 三个工具、`start_conversation` 的 `todo` 参数 |
| `agent/agent.go` | 三个工具常量；删 `PlanFile/PlanItem/DoneFolder` |
| `agent/rules.go` | hub「The plan」→「Your todos」 |
| `gateway/protocol.go` / `owned.go` / `server.go` | 方法、通知、类型、错误码 |
| `gateway/protocol.schema.json` | 重新生成（sha 变化） |
| `docs/lifecycle.md` | 中枢的计划 → 待办表 |

## 12. 验收

1. hub 里说"把 A 交给项目 X"，模型 `add_todo` → `start_conversation(todo)` → 完成后 `update_todo(done, result)`，
   `todo/list` 每一步都对，桌面每一步都收到 `todo/changed`。
2. 老 `TODO.md` 里 6 条、`done/` 里两个月：第一次打开面板就全部出现（状态与月份正确），文件被重命名为
   `TODO.md.imported-<日期>`，再打开不重复。
3. 删掉一个被 `handed` 的会话：那条待办回到 `open`、链接清空，桌面不用刷新就变了。
4. 两个客户端同时改同一条：后写的赢，两边都收到通知，不出现重复行。
5. hub 在远程沙箱：导入跳过并给出明确提示，`todo/list` 与工具照常工作。
6. 全仓 `go test ./...` 通过，桌面 `protocol:check` 通过。

## 13. 两处默认（不同意再改）

- 导入后 `TODO.md` 只归档、不回写，引擎不提供 Markdown 导出。
- `start_conversation` 保留 `todo` 参数（一个调用完成"交出去 + 链接 + 置 handed"）。
