# 待办上的投入时长（presence）：需求与方案

## 0. 这一版定了什么

- **只回答一个问题**：这个待办上，**你**真正在场的时间有多长。墙上过去多久（A）不展示，需要内部参考时从
  `entries` 现算即可（`packages/core/src/timeline.ts:198` 的 `turnStartedAt()` 已经在做这件事）。
- **单位是待办**（第二步）：一个待办可以横跨多个会话（原会话归档后在新会话重开、失败重试），时间要能累加回同一个待办。
  会话是中间层，不是统计单位。第一步只做会话这一层，因为它是唯一测得准的原子（§17）。
- **分母是「你在这个 agent 界面前、且人在电脑前」**：不是「这件事在你脑子里占了多久」，也不是「机器替你跑了多久」。
- **两层口径，看数字时别混**：**app 层** = 窗口在前台 + 人在电脑前（读结果、翻历史、打消息、看设置都算）；
  **会话层 / 待办层** = 屏幕还必须停在那个会话上（待办层还要挂着待办）。现在界面只显示会话层，app 层照常写库、还没有展示。
- **不碰执行链**：不改 `run/*`，不新增 `turnStarted` 条目，不补模型调用起止。B 由「屏幕 + 输入」决定，
  引擎只负责存和算。
- **在场只用两个免费信号**：窗口在前台（Electron 自带）与整机空闲秒数（`powerMonitor.getSystemIdleTime()`，
  **不需要任何 macOS 权限**）。
- **不在本 app 里的时间不计**；但它会被单独量出来（「别处」），让漏计可见，而不是让人以为数字很完整。
  「窗口停在会话上、人却去别的 app 里干活」就在这一类里——**已知并接受**（第 11 节第 1 行），不加跨应用检测。
- **数字旁边必须写清它代表什么、什么时候不可信**，文案在第 11 节。
- **第一步只做 thread 时长**（§17）：先让「这个会话上花了多久」准了，再谈归到待办。

**状态：第一步已经落地。** 引擎侧 `store/sqlite/migrations/0015_presence.sql` 与 `presence/record`、`presence/summary`，
桌面侧 `apps/desktop/src/main/presence/` 与会话页头部的数字都在工作区里；`pnpm typecheck`、`pnpm test`、
`pnpm protocol:check`、`pnpm --filter @ollupi/desktop build` 全过。**还没做实机验证**（打开会话、切走、锁屏，看库里有没有行、
数字会不会涨），这一点写在 §17.8。下文按已实现的代码写，不再写设想。

---

## 1. 现状：待办和会话现在是怎么连的

### 1.1 一个待办挂**一个**会话

`todos` 表（`store/sqlite/migrations/0012_todos.sql`）：

| 列 | 现在的意思 |
| --- | --- |
| `user_id, id` | 主键，待办号按用户递增 |
| `title, notes, result` | 待办本身 |
| `workspace_id` | 项目，**跟着链接的会话走** |
| `thread_id` | **一个**会话，`DEFAULT ''`，空表示没挂 |
| `status` | `open / handed / done / dropped` |
| `created_at, updated_at, ended_at` | `ended_at` 是进入 done/dropped 的时刻 |

`account.Todo`（`account/account.go:99`）里对应 `Thread string`、`Workspace string`，都是**单值**。

链接只有一条路：`app.UpdateTodo` 的 `TodoChange.Thread`（`app/todos.go:25-33`），实现见 `app/todos.go:116-129`——
给会话 id 就把 `todo.Thread` 与 `todo.Workspace` 一起设成该会话的；给 `""` 就两个都清空。agent 侧入口是
`tool/builtin/hub/hub.go:522` 的 `updateTodo`（参数 `Conversation`），`addTodo`（`:510`）根本不接受会话。

**没有多对多表，也没有链接历史。**

### 1.2 两个会丢时间的动作

- **删会话**：`store/sqlite/owned.go:617` 会把指向它的待办 `thread_id`、`workspace_id` 清空，`handed` 退回 `open`。
  待办还在，连接没了。
- **归档会话**：`threads.archived_at`（`0001_init.sql:58`），链接保留——但如果用户在新会话里重开这个待办并重新分派，
  `thread_id` 就被覆盖，旧会话的关联**永久消失**。

`0014_drop_delegate_threads.sql` 还做过一次整齐的清理：把 delegate 子 agent 的会话整个删掉，并把指向它们的待办解链。
唯一的好处是——**子 agent 现在没有独立会话**，这直接影响第 5 节的并发结论。

### 1.3 所以「累加回同一个待办」不能靠 `thread_id`

用户的例子（归档 → 新会话重开 → 时间要累加）在这个数据模型下必然丢前半段。修法不是加一张「待办↔会话」关联表，
而是**让时间行自己带 `todo_id`**：时间写进来的那一刻，这个会话当前挂的是哪个待办，就把 `todo_id` 快照进去。
`todos.thread_id` 退回它本来的意思——「现在用哪个会话做这件事」，是个导航字段，不再承担统计。

这样：换会话、解链、删会话，历史时间都不动；一个待办的时间 = 所有 `todo_id` 指向它的行之和。

一句话概括：**thread 是测量的原子，todo 是归属的单位**。

- 测量能落到 thread，是因为一个窗口同一时刻只显示一个会话（第 5 节），会话是界面唯一能回答的「你在看什么」。
  「这个 thread 上花了多久」= 该 `thread_id` 的行之和，写入后永不变。
- 归属不能靠 `threads → todos` 的**当前**映射去 join，只能靠写入时的 `todo_id` 快照（上一段）。
- 两个天然例外：`in_app` 行没有 thread（第 2 节）；会话被删后行还在，thread 维度的汇总会出现指向已不存在会话的行
  ——只能按它的 `todo_id` 读，`todo_id = 0` 的那部分就只剩 app 层。

### 1.4 代码里已经有的时间信号

| 信号 | 位置 | 现在做什么用 | 能不能当在场证据 |
| --- | --- | --- | --- |
| 窗口聚焦 | `apps/desktop/src/renderer/src/domains/threads.ts:74-91` `markOpenRead`，`window 'focus'` + `visibilitychange` | 把屏幕上的会话标记已读 | 能，但**只能当「不在」的证据**（第 4.1 节的坑） |
| 当前会话 | `domains/navigation.ts` 的 `openThreadId()` | 界面在哪 | 归属用，就是它 |
| 轮次起止 | `Turn.QueuedAt / Ended` → `packages/core/src/timeline.ts:198` | 时间线显示每轮多久 | 是 A，不是 B |
| 审批/回答时刻 | `entries` 的 `decided` / `answered` | 状态机 | 只能说明「那一秒人在」，凑不出时长 |
| 时长格式化 | `packages/core/src/format.ts:34` `span()`；`renderer/src/i18n/format.ts:44` `duration()` | 显示 | 直接复用 |

**没有**任何「人在场」的记录，也没有 `powerMonitor`。这是本轮从零加的，但只加一件东西。

顺带一处旧地图：待办已经**不在文件里**了。`apps/desktop/src/renderer/src/domains/todos.ts` 开头的注释写得很直白
（no file stands behind them），数据走 `todo/list` + `todo:changed`，住在引擎的 `todos` 表。`TODO.md` 这个说法只剩
两处没跟着改的旧注释：`views/conversation/tools/hub.tsx:5` 与 `packages/core/src/calls.ts:211`。本文按「数据进引擎库」
写，不再有文件方案。

---

## 2. 「投入」的准确定义

采样三个状态，只有第一个算投入：

| 状态 | 条件 | 记不记 |
| --- | --- | --- |
| `seen` | 本 app 的窗口在前台 **且** 没锁屏/休眠 **且** 整机空闲 < 180 秒 **且** 屏幕上是某个会话 | 记一行：**进 app 层，也进会话层** |
| `in_app` | 窗口在前台、人没走开，但屏幕上没有会话（设置页、草稿页这类） | 记一行：`thread_id = ''`，**只进 app 层** |
| `elsewhere` | 本 app 的窗口不在前台（别的 app 在前、关窗隐藏、Cmd+H） | 记，**两层都不进**，只做漏计的分母 |
| `idle` | 整机空闲 ≥ 180 秒，或锁屏、休眠 | 不落库 |

```
app 层    = Σ（state IN ('seen','in_app')）        -- 你在本 app 里的时间
会话层    = Σ（state = 'seen' 且 thread_id = 会话） -- 第一步能算出来的只有这一层
待办层    = Σ（state = 'seen' 且 todo_id = 待办）   -- 第二步；现在 todo_id 恒 0
```

**算（app 层）**：窗口在前台、人没走开——agent 跑着你在看、读结果、翻历史、打消息（打字会重置空闲）、
点审批、在内置浏览器里读页面（它是同一窗口里的 `WebContentsView`，`apps/desktop/src/main/browser/browser.ts:18`）、
在设置页这类没有会话的页面上停留。

**算（会话层）**：上面这些里，屏幕停在某个会话上的部分。会话页头部显示的就是这个数。
再往上要算到待办名下，得等第二步把 `todo_id` 接上。

**不算**：在别的 app 里干活；走开；锁屏；窗口隐藏（macOS 关窗只是隐藏，`apps/desktop/src/main/window.ts:35`）。
第一条是这一版**已知并接受**的缺口（第 11 节第 1 行）。

---

## 3. 归属

### 3.1 规则

1. 时间行落在**屏幕上的那个会话**，`todo_id` 取写入时该会话挂的待办；没挂就是 `0`。
2. 待办的时间 = 它名下所有行之和，跨会话自然累加。
3. 一个会话的时间只会属于一个待办（同一时刻一个会话只能挂一个），不会重复计入。
4. 解链只改 `todos.thread_id`，**不改历史行**——已经花掉的时间不会因为「不做了」而消失。
5. 删会话也不删时间行：`presence` 对 `threads` **不加外键**（见 8.1 的注释），和 `entries` 的 `ON DELETE CASCADE` 故意不同。
6. `in_app` 行没有归属：`thread_id = ''`、`todo_id = 0`，只进 app 层，不进任何待办。

### 3.2 没挂待办的会话记到哪

照记，`todo_id = 0`，界面上叫「未归」。理由：这些时间确实被花掉了，只是没归位；丢掉就等于假装没发生。

之后把待办链到这个会话时，`app.UpdateTodo` 的链接分支多做一步回填：

```sql
UPDATE presence SET todo_id = ?
WHERE user_id = ? AND thread_id = ? AND todo_id = 0 AND started_at >= ?  -- ? = todo.created_at
```

按 `created_at` 截断，避免把「建这个待办之前」的时间也算进去。回填只改归属，不改区间，所以不会造出新的「投入」。
默认回填（决策点 2）。

### 3.3 用户那个例子走一遍

| 时刻 | 发生什么 | 数据 |
| --- | --- | --- |
| 周一 | 会话 A 里干活，待办 #12 挂 A | 行：`A, todo=12` |
| 周二 | 归档 A，在新会话 B 重开，待办 #12 改挂 B | 历史行不动；`todos.thread_id = B` |
| 周二 | 在 B 里继续 | 行：`B, todo=12` |
| 周三 | 删掉会话 A | `todos.thread_id` 不变（已指向 B）；A 的行还在 |
| — | 打开待办 #12 | 时长 = A 与 B 两段相加 |

---

## 4. 什么算「人在场」

### 4.1 信号

| 信号 | 从哪来 | 要权限吗 | 回答什么问题 |
| --- | --- | --- | --- |
| 窗口聚焦 | `app.on('browser-window-focus' / 'browser-window-blur')`（`main/presence/signals.ts:22`） | 否 | app 是否在前台 |
| 当前会话 | 渲染层 `usePresenceContext` 经 `presence:context` 报给主进程（`domains/presence.ts:17`） | 否 | 这段时间归谁 |
| 整机空闲 | `powerMonitor.getSystemIdleTime()`（秒，`signals.ts:48`） | **否** | 人是否还在用电脑 |
| 锁屏 / 休眠 | `powerMonitor` 的 `lock-screen` / `suspend` / `unlock-screen` / `resume` / `user-did-become-active` | 否 | 在哪一刻封口 |
| 审批 / 回答 | 引擎的 `decided` / `answered` | 否 | 只做校验，不当证据 |
| 页面可见 / 键鼠事件 | 不用 | — | 窗口级焦点已经覆盖；`document.hidden` 在内置浏览器抢焦时不可靠，系统级空闲秒数比页面事件更全 |

判定式（空闲秒数每 30 秒读一次，状态变化就写一行；锁屏、休眠、焦点变化立即重判）：

```
seen      = 有窗口在前台 && !锁屏 && !休眠 && idle < 180 && 屏幕上是会话 T
in_app    = 有窗口在前台 && !锁屏 && !休眠 && idle < 180 && 屏幕上没有会话
elsewhere = !有窗口在前台 && !锁屏 && !休眠 && idle < 180
idle      = idle >= 180 || 锁屏 || 休眠        -- 不落库
```

**一个必须避开的坑**：内置浏览器是同一窗口里的另一个 `WebContentsView`，用户点它的网页时渲染层的
`document.hasFocus()` 是 `false`（`domains/threads.ts:76` 就是这么判的，那是给「标记已读」用的，照抄到计时会漏掉读网页的全部时间）。
所以计时放在主进程、只看**窗口级**的焦点：窗口还是那个窗口，屏幕还是那个会话，读网页的时间照样记在它名下。

### 4.2 阈值：180 秒

`getSystemIdleTime()` 给的是「距上次输入多少秒」，不是布尔值。所以发现 `idle ≥ 阈值` 时可以**回推**：
把区间结束点定在 `最后输入时刻 + 阈值`，后面的不记。误差因此是「每次离开最多 +3 分钟」，不是「每一段都偏」。

- **为什么不是 60 秒**：这套工作流里「agent 在跑、人在读长 diff / 想下一步」常有 1–2 分钟零输入。
  60 秒会把它们切断并扣掉，变成**系统性少算**，而且少算的正是「思考」——最该被记下来的部分。
- **为什么不是 300 秒**：倒水、接电话、临时被叫走，5 分钟内会被算成在场，**系统性多算**。
- **为什么这个值不影响复盘结论**：复盘问的是「这个待办花了 40 分钟还是 3 小时」「这周比上周多还是少」。
  误差按**离开次数**累计（一天 5–10 次 → 最多 15–30 分钟），方向固定（只多不少），跨天比较时是常数项，会被约掉。
  它影响的是「精确到 5 分钟」的结论，而这一版明确不做那种结论。
- 这一版阈值是常量 `IDLE_SECONDS = 180`（`main/presence/state.ts:33`），没有设置项；数字旁边写「误差上限 ≈ 阈值 × 离开次数」。

### 4.3 权限

**不需要辅助功能（Accessibility），也不需要输入监控（Input Monitoring）。**
`powerMonitor.getSystemIdleTime()` 读的是系统空闲秒数，Electron 的公开 API，任何 app 都能调。

需要权限的只有两条路，**都明确不做**：

1. 知道「前台是哪个 app」：要 `NSWorkspace.frontmostApplication` 的原生模块，或者轮询 `osascript`
   （触发 Automation 授权、每次几十毫秒、还费电）。
2. 全局按键钩子：要 `CGEventTap`（Input Monitoring）。

### 4.4 拿不到信号时怎么降级

这一版只做一条路径：窗口焦点 + 整机空闲，两者都是 Electron 直接给的，macOS 上不需要任何权限。
实现里没有 `source` 列、没有降级等级：读不到空闲秒数就不记（宁可少算），不会退化成拿引擎事件猜时长。
将来真要做「只剩 `decided` / `answered`」的档，也只能改叫「你出手了 7 次」，不许叫时长。

---

## 5. 并发与重叠

结构上就不存在并发：

- **一个窗口**：`apps/desktop/src/main/index.ts:71` 只在启动和 `activate` 时建一个，关窗只是隐藏（`:58` `keepOnClose`）。
- **一个当前会话**：`domains/navigation.ts` 的 `openThreadId()` 只有一个值。
- **子 agent 没有独立会话**：`0014_drop_delegate_threads.sql` 把 delegate 线程全删了，子任务在父会话里以 task 形式跑。

所以规则只有一条：**屏幕上是谁，时间就归谁**；屏幕上是非会话页面时，时间只进 app 层，谁都不归。
同时在跑的其它任务拿到的是 A（不展示），拿不到 B。

- 重叠在写入端几乎不可能：状态机同一时刻只开一段（`PresenceMachine` 只有一个 `open`）。唯一的例外是系统时钟往回跳之后
  又开了一段，与旧段重叠——查询会把重叠部分算两次。现在没有检测**历史行重叠**的代码（原计划里的「截到前一条」没有实现），
  数量级很小，列在 §11 的失真表里。
- 内置浏览器面板与会话绑定（`desktop.browser.place(thread, …)`、`forget(thread)`），切标签不改变归属。

---

## 6. 崩溃、合盖、时钟跳变

| 情况 | 准不准 | 做法 |
| --- | --- | --- |
| 正常退出（Cmd+Q） | 准 | `before-quit` 里先 `presence.stop()`（封口 + 最多等 2 秒 flush），再停后端（`main/index.ts:104-111`） |
| 合盖 / 休眠 | 准 | `powerMonitor` 的 `suspend` → `away(true)` 封口；`resume` / `user-did-become-active` 才允许重开 |
| 锁屏 | 准 | `lock-screen` → `away(true)`；`unlock-screen` → `away(false)` |
| 硬崩 / 断电 | ≤ 60 秒 | 每 60 秒心跳用同一个 `id` 重写 `ended_at`（`PutPresence` 取 `max`）；重启后区间止于最后一次心跳 |
| 渲染层崩溃 / 重载 | 一两次换行 | 主进程照计时；重载后会话页重新报 `presence:context`，中间可能落成 `in_app` |
| 时钟向后跳（NTP、手动改） | 部分 | 已写的区间不会缩短（`ended_at = max(...)`）；之后的重叠识别不了 |
| 时钟向前跳 | 不准 | 没有单调钟校验，一段会被算长；见 §11 |

**这一版不需要「未知」标记**：心跳把最坏情况压到 60 秒，比任何「未知」标签都诚实。

---

## 7. 跨午夜怎么按天切

- 存 UTC；按本地偏移切天，照 `store.UsageQuery.OffsetMinutes` 的做法：客户端传 `offsetMinutes`（`-new Date().getTimezoneOffset()`）。
- 一条跨 00:00 的区间**不拆行**，查询时用递归 CTE 按本地午夜切成几段再求和（`store/sqlite/presence.go:10` 的 `presenceByDay`）。
  非 day 的分组直接对 `[from, to)` 取交集：`min(ended_at, to)` / `max(started_at, from)`，所以相邻两段之和等于整段。
- 跨时区旅行那天可能只有 23 或 25 小时——写进第 11 节的失真表，不试图修正。

---

## 8. 数据模型

> §8–§9 是这张表和这套协议的全貌。第一步（§17）就建表、就注册协议，只是先不用 `todo_id` / `workspace_id` 两列；
> 待办归属、项目维度、日汇总留到第二步。

### 8.1 迁移 `0015_presence.sql`（引擎仓库）

```sql
-- One row per stretch of time the user spent in the app, written by the desktop
-- client as it observes focus, idle and screen lock. A row is appended when the
-- stretch ends and is only extended, never moved, when the same id is written
-- again: the client may repeat a stretch it already sent.
--
-- 'seen' rows are stretches spent on a thread, 'in_app' stretches in the app
-- with no thread on screen, and 'elsewhere' stretches while the user was away
-- from the app: they only tell how long the app was not in use, so nothing is
-- grouped by them.
--
-- The thread and todo of a row are a snapshot taken when it is written: a
-- thread archived and reopened elsewhere still adds up to the same todo.
CREATE TABLE presence (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id text NOT NULL,
  thread_id text NOT NULL DEFAULT '',
  todo_id integer NOT NULL DEFAULT 0,
  workspace_id text NOT NULL DEFAULT '',
  state text NOT NULL CHECK (state IN ('seen', 'in_app', 'elsewhere')),
  started_at datetime NOT NULL,
  ended_at datetime NOT NULL,
  PRIMARY KEY (user_id, id),
  CHECK (strftime('%s', ended_at) >= strftime('%s', started_at)),
  CHECK ((state = 'seen') = (thread_id <> ''))
);

CREATE INDEX presence_thread ON presence(user_id, thread_id, started_at) WHERE thread_id <> '';
CREATE INDEX presence_todo ON presence(user_id, todo_id, started_at) WHERE todo_id <> 0;
CREATE INDEX presence_user_at ON presence(user_id, started_at);
```

几条约束的用意：`id` 是客户端生成的 UUID，作幂等键；`ended_at >= started_at` 挡住时钟倒流写出的负区间；
`(state = 'seen') = (thread_id <> '')` 保证「有时间没会话」的 `in_app` 不会静悄悄地混进 thread 汇总。
**没有 `source` 列**：只有一条判定路径，没有降级档可标。

### 8.2 量级

- 每段一条；一天 30–80 条（含 `elsewhere`），约 120 B/行 → **4–10 KB/天，一年 1.5–3.5 MB**。
- 心跳是 UPDATE，不增行；和 `entries` 比可以忽略。

### 8.3 聚合维度

会话 / 待办 / 项目 / 日，以及整个 app。分组的键是 `thread_id` / `CAST(todo_id AS TEXT)` / `workspace_id` / `date(...)` / `''`，
区间一律按 `[from, to)` 裁：

```sql
SELECT thread_id AS key,
       CAST(ROUND(SUM((julianday(min(ended_at, ?)) - julianday(max(started_at, ?))) * 86400)) AS INTEGER) AS seconds
FROM presence
WHERE user_id = ? AND ended_at > ? AND started_at < ?
  AND thread_id <> ''                       -- 只有 thread 分组加这一条
GROUP BY key ORDER BY key;
```

- `?` 依次是 `to`、`from`、`user`、`from`、`to`；`min/max` 让跨边界的行只算落在范围内的部分，所以相邻区间的桶相加不会丢也不会重。
- `groupBy: 'day'` 走递归 CTE（§7）；其余分组只是换掉 `key`。
- 一处要注意：`groupBy: 'app'` 现在**不按状态过滤**，会把 `elsewhere` 也算进去（`store/sqlite/presence.go:32`）。
  界面还没用到它，第二步做 app 层展示时要先修成 `state <> 'elsewhere'`。

---

## 9. 协议

| 方法 | 参数 | 返回 |
| --- | --- | --- |
| `presence/record` | `{ rows: PresenceInput[] }`，最多 50 条一批（`app/presence.go:13` `MaxPresenceBatch`） | `{}` |
| `presence/summary` | `{ from, to, groupBy: 'thread' \| 'todo' \| 'workspace' \| 'day' \| 'app', offsetMinutes? }` | `{ data: { key, seconds }[] \| null }`；`'app'` 只有一个桶，`key` 为 `''` |

- `PresenceInput = { id, threadId?, todoId?, workspaceId?, state, start, end }`（`start`/`end` 是 ISO 时间串，不是 `startedAt`）。
- `id` 是幂等键：`PutPresence` 是 `INSERT … ON CONFLICT(user_id, id) DO UPDATE SET ended_at = max(presence.ended_at, excluded.ended_at)`
  （`store/sqlite/presence.go:79`）。同一个 id 重发只会把区间**延长**，不会挪起点，也不会写重。
- 范围是半开的 `[from, to)`，跨边界的行按交集裁剪，所以相邻两段之和等于整段（§8.3）。
- 注册在 `gateway/protocol.go:140-141`，实现是 `gateway/owned.go:213-230`；参数类型由 `gateway/schema_test.go` 把关。
  引擎侧改 schema 后 `go generate ./gateway` 重生成 `protocol.schema.json`，桌面侧再 `pnpm protocol:generate`，`protocol:check` 校验生成物一致。
- 桌面**不**为计时另开 IPC 拿空闲秒数：采样整个在主进程（§17.1），也**不**为计时另开一条 gateway 连接。
  渲染层与主进程之间只有三个通道：`presence:context`（报当前会话）、`presence:rows`（主 → 渲染层，交出待写的段）、
  `presence:ack`（渲染层 → 主，写进去了没有），见 §17.5。

---

## 10. 展示

三种形态，按实现成本排：

| # | 形态 | 落点 | 成本 | 判断 |
| --- | --- | --- | --- | --- |
| ① | 会话页头部一个数字 | 已做：`ConversationScreen.tsx:124-131`，标题行右侧、等待徽标之前 | 最小 | **已经上线** |
| ② | 待办行尾一个数字 | `TodosPanel.tsx` 的 `TodoItem` | 小，但得先让 `todo_id` 有值（第二步） | 第二步 |
| ③ | 设置页「时间」一节：今天在 ollupi 多久、落在哪些会话/待办上 | `views/settings/` 里加一节，`presence/summary{groupBy:'day'}` 已经能供数 | 中 | 第二步之后 |

文案（`i18n/messages/conversation.ts` 的 `screen` 段，英 `:55`、中 `:484`）：

- 数字：「投入 2 小时 41 分」（`spent(minutes)`），不足一分钟是「不到 1 分钟」（`spentUnderMinute`）。
- 悬停（`spentHint`）：「只算这个会话在前台、且你在电脑前的时间。锁屏、休眠、空闲超过 3 分钟、切到别的应用都不算。」
- 待办维度还没有数，所以「未归待办 38m」这类文案等第二步。

不放 CSV 导出（见第 15 节）。

---

## 11. 这个数字在什么情况下会明显失真

| # | 场景 | 偏向 | 量级 | 怎么发现 |
| --- | --- | --- | --- | --- |
| 1 | 在别的 app 里干**同一个任务**（改简历、改代码、写文档） | 少算 | 最大的一类，可能每天 1–2 小时 | **已知并接受**：不做跨应用检测（要 `NSWorkspace` 原生模块或轮询 `osascript`）。理由是你打算把工作逐步搬进本 app，这类场景会自然变少；「别处」的行照记，将来能拿来做漏计对比 |
| 2 | agent 长跑，你切走干别的事 | 无偏 | — | 本来就不该算 |
| 3 | 在 ollupi 里读长文、想下一步，静默超过 3 分钟 | 每次少 ≤3 分钟 | 几段 | 数字比体感短 |
| 4 | 窗口在前台，你去接电话/被叫走 | 每次多 ≤3 分钟 | 几段 | 数字比体感长 |
| 5 | 一个会话里干了两件不同的事 | 会话层不受影响；第二步的待办层会全归一个 | 常见 | 待办数远多于会话数时要怀疑 |
| 6 | 建待办之前就在这个会话里干过 | 第二步回填被 `created_at` 截断 | 一次性 | 待办比会话「年轻」 |
| 7 | 硬崩、断电 | 少 ≤60 秒 | 罕见 | 重启后区间止于最后一次心跳 |
| 8 | 锁屏了但你在想事情 | 不算 | — | 设计如此 |
| 9 | 跨时区旅行那天 | 23 或 25 小时 | 一次性 | 当天总和异常 |
| 10 | ollupi 在前台，你人却在看纸质材料 | 3 分钟后停计 | — | 基本不影响 |
| 11 | 在内置浏览器里读结果 | 算进当前会话 | — | 有意的：读结果也是投入 |
| 12 | 子 agent / 后台任务在跑，你不在这个会话页 | 不算 | — | `seen` 要求会话在屏幕上 |
| 13 | 系统时钟向前跳（NTP、手动改） | 多算 | 一段可能几分钟到几小时 | 那一段异常长 |
| 14 | 时钟往回跳后又开新段 | 重叠部分算两次 | 罕见 | 当天总和偏大 |
| 15 | 引擎长时间没起来，队列超过 500 条 | 丢最旧的 | 极少 | 只在 app 长期脱离后端时 |
| 16 | 在**新会话页**（还没发出第一条消息）里思考和打字的时间 | 算进 `in_app`，不算任何会话 | 每个新会话一次，几分钟 | 第一个会话的开始时间晚于体感 |
| 17 | 一个批次被后端拒收（数据不合法） | 丢这一批，后面的照写 | 极少 | 只有出现非法行时；行被丢弃后该段不再出现 |

不说套话的部分：#5 最容易被误读——**会话不等于待办**，一个会话里能做三件事；这个数字按会话切，只是因为屏幕一次只能显示一个会话。

两层怎么读：**app 层**回答「今天在这个 agent 上花了多久」，**会话/待办层**回答「这件事花了多久」。前者包含翻看、摸索、
在设置页里调东西；后者只算停在那个会话上的时间。两者之差本身就是信息（差得大 = 大部分时间没落在具体会话上），
不要当成误差去「修」。

---

## 12. 落点清单（实际改动）

逐文件的说明在 §17.7，这里只列两个仓库的职责边界。

### 12.1 引擎仓库 `~/Desktop/yiming/ollupi`

| 文件 | 改动 |
| --- | --- |
| `store/sqlite/migrations/0015_presence.sql` | 新建（§8.1） |
| `store/store.go` | `Presence`、`PresenceState`、`PresenceGroup`、`PresenceQuery`、`PresenceBucket`；`Reader.PresenceBuckets`、`Tx.PutPresence` |
| `store/sqlite/presence.go` | `PresenceBuckets`、`presenceByDay`、`PutPresence`，体例照 `store/sqlite/usage.go` |
| `app/presence.go`、`app/app.go` | `MaxPresenceBatch`、`RecordPresence`、`Presence`、`ErrInvalidPresence` |
| `gateway/protocol.go:140-141`、`gateway/owned.go:213`、`gateway/schema_test.go`、`gateway/protocol.schema.json` | 两个方法 + schema |
| `store/sqlite/presence_test.go` | 4 条测试 |

**没碰** `run/*`、`host/*`、`usage/*`、`app/todos.go`。

### 12.2 桌面仓库

| 文件 | 改动 |
| --- | --- |
| `main/presence/{state,signals,recorder,presence}.ts` | 状态机、系统信号、写入队列、生命周期（§17.3–17.5） |
| `main/presence/{state,recorder,presence}.test.ts` | 9 + 6 + 6 条单测 |
| `main/index.ts`、`main/ipc.ts`、`main/window.ts`、`shared/ipc.ts`、`preload/index.ts` | 接线、两个 IPC 与一个下行广播 |
| `renderer/src/domains/presence.ts`、`renderer/src/main.tsx` | `usePresenceContext`、`startPresenceWriter`、`useSpent` |
| `renderer/src/views/conversation/ConversationScreen.tsx`、`i18n/format.ts`、`i18n/messages/conversation.ts` | 头部数字与文案 |
| `packages/protocol/src/generated/*`、`scripts/record-session.mjs`、`fixtures/session.json` | 生成的类型与契约录包（一起提交） |

---

## 13. 工作量与风险

| 部分 | 实际 |
| --- | --- |
| 引擎：迁移 + store + app + 协议 + 生成 + 测试 | 1 天 |
| 桌面：主进程状态机、信号、队列 | 0.5 天 |
| 桌面：IPC、渲染层 hook、头部数字、文案 | 0.5 天 |
| 协议重录与契约测试 | 0.5 天 |
| 合计 | **约 2.5 天**（估 2.5–3.5） |

风险：

- 主进程的定时器不受渲染层节流影响；休眠时随进程暂停，醒来靠 `resume` 与空闲秒数封口。
- 引擎没起来时，行只在内存里排队（保序、上限 500 条），没有第二份副本——这是「只住引擎库」换来的。
- 这个功能不改现有行为，也不新增连接：`presence` 是新表，多两个 IPC 通道与一个下行广播，启动时多两个定时器（30 秒 / 60 秒，
  不阻塞 ready）；写库走窗口那条已有的连接。

---

## 14. 需要拍板的决策点

已拍定、不再讨论：**只做 B**（A 只在内部现算，不展示）、**单位是待办**、**时间行快照 `todo_id`**（跨会话累加）、
**加 `in_app` 第三态**（只进 app 层）、**记「别处」**、**未归时间保留**、**不做跨应用检测**（第 11 节第 1 行已知并接受）。

剩下的是第二步（待办归属）之前要定的三项：

| # | 决策 | 选项与后果 | 建议 |
| --- | --- | --- | --- |
| 1 | 链接待办时是否回填 `todo_id` | a) 默认回填（按 `todos.created_at` 截断）；b) 只从此后开始算。a 能把「先干活后建待办」的时间找回来，但会改动写过的行 | a |
| 2 | 待办数字放哪 | 待办行尾 / 待办第二行「会话 · 时长」 | 行尾 |
| 3 | app 层要不要单独展示 | 设置页一节「今天在 ollupi …」；不做就只有会话数字 | 做，但排在待办之后 |

已经拍定并落地的就不用再讨论了：**只做 B**、**thread 是测量原子**、**时间行快照 `todo_id`**（第二步才填）、**`in_app` 第三态**、
**记「别处」**、**未归时间保留**、**不做跨应用检测**（§11 第 1 行）、**空闲阈值 180 秒**、**默认开**（本步没有开关）、
**展示落在会话页头部**、**措辞用「投入」**。`source` 列在实现时去掉了：只有一条判定路径，没有降级档可标。

---

## 15. 明确不做

- **跨应用在场**（别的 app 前台时也算）：要权限 + 轮询，收益不抵成本；**已知并接受**这个缺口（第 11 节第 1 行）。
- **手动计时器**（开始/停止按钮）：与自动记录是两种产品。
- **工时、账单、CSV 记账导出**：这是复盘工具，不是考勤系统。
- **模型预估**（「这个待办还要 20 分钟」）：没有可靠数据。
- **A（墙钟）的展示**：只在需要时内部现算；不建 `turn_times` 表，也不补 `turnStarted` 条目。
- **把 B 叫「工时」**：文案只允许「投入」「在场」。
- **跨设备同步与云端汇总**：留在本机 SQLite。
- **子 agent 单独计时**：已经没有独立会话，子任务的时间本来就并回父会话。
- **待办归属与回填**（第一步）：`todo_id` 恒 `0`；数据层现在没有 thread↔todo 的反向查询，也没有多对多表。
- **app 层与「别处」的展示**：照常写库，界面只显示会话层的数字。
- **设置开关与阈值调节**：默认开，阈值是常量 180 秒。
- **降级档与 `source` 列**：不做，只有一条判定路径。
- **时钟跳变检测**：只做到已写区间不回退；向前跳识别不了。

---

## 16. 验收

下面这些是整套设计的验收（含第二步的待办归属）；第一步已能验的那些列在 §17.8，单测覆盖的部分在那里注明。

1. 在一个会话里连续操作 10 分钟，会话页头部在 ±1 分钟内出现对应数字。
2. 切到别的 app 5 分钟再回来，数字只增加「回来之后」的部分。
3. 窗口关掉（macOS 隐藏）放着 30 分钟，数字不增长。
4. 合盖 30 分钟再打开，没有出现 30 分钟的跳跃。
5. 强杀进程再启动，区间止于最后一次心跳，误差 ≤60 秒。
6. 待办从会话 A 改挂到会话 B，A 的历史时间仍然计入这个待办。
7. 会话 A 被删除后，这个待办的时长不减少。
8. 链上一个早就干过活的会话，回填只算 `created_at` 之后的部分。
9. 23:00 开始、01:00 结束的一段，在两个日汇总里各占一半。
10. （第二步）设置里关掉记录后，不再产生新行，界面显示「未记录」而不是 0。
11. 在设置页停 5 分钟：app 层增加约 5 分钟，任何待办都不增加。
12. 在内置浏览器里读 5 分钟网页（点的是网页、不是会话区）：仍计入当前会话及它的待办，不落到 `in_app`
    （第 4.1 节那个 `hasFocus` 的坑）。

---

## 17. 第一步：只做 thread 时长

**目标**：任何一个 thread 上你真正在场了多久，看得到。todo 归属、app 层展示、日汇总都不在这一步。

这一节与前面几节的区别：前面写的是设计与取舍，这一节写的是**已经落地的实现**（代码与单测已过，实机验收还没做，见 §17.8）。

### 17.1 决定：采样在主进程，写库和聚合在引擎

上一版方案把状态机放在渲染层、主进程只给一个 `presence:sample()` 原语。实现时反过来了，理由：

- 判断「人在不在」要的全部信号只有主进程拿得到——窗口焦点（`browser-window-focus` / `browser-window-blur`）、锁屏与休眠（`powerMonitor` 的 `lock-screen` / `suspend` / `unlock-screen` / `resume` / `user-did-become-active`）、整机空闲秒数（`powerMonitor.getSystemIdleTime()`，macOS 不需要任何权限）。
- 这些是**事件**，不是可以按需拉取的量：窗口一失焦就得立刻换段，靠渲染层 10 秒轮询会漏掉短于一个周期的切换。放主进程就变成事件驱动 + 30 秒兜底巡检。
- 主进程的定时器不受渲染层后台节流影响；窗口隐藏时渲染层的 `setInterval` 会被压到 1 分钟一次，主进程不会。

所以分三块：

| 块 | 位置 | 职责 |
| --- | --- | --- |
| 判定 | `apps/desktop/src/main/presence/state.ts` 的 `PresenceMachine` | 纯逻辑，时钟与 id 注入，不碰 Electron、不碰定时器 |
| 信号 | `main/presence/signals.ts` 的 `attention()` | 把窗口焦点、锁屏/休眠、空闲秒数收成 `onFocus` / `onAway` / `idleSeconds` 三个回调 |
| 写库 | `main/presence/recorder.ts` 的 `PresenceRecorder` | 保序队列、批量交给窗口，收到写成功的回答才出队 |
| 组装 | `main/presence/presence.ts` 的 `Presence` | 起两个定时器、跟 `BackendSupervisor` 的状态决定要不要写、把批次交给窗口并等回答、退出时收尾 |

窗口那一侧只做搬运与读取：`renderer/src/domains/presence.ts` 的 `startPresenceWriter()` 收到 `presence:rows` 就用
它自己的连接调 `presence/record`，写完回答；`useSpent` 同一条连接调 `presence/summary` 拿总数。渲染层不持有任何计时状态，
也不决定哪些时间算——它只是那条连接的主人。

为什么不自己开一条连接：服务端在 `initialize` 里无条件订阅该用户的事件流（`gateway/server.go:110-119`），第二条连接
意味着每个 token delta 多编一次、多推一次，主进程再解一次丢掉；它还多占 `PerKey = 4`（`gateway/serve.go:94`）的一个
名额（按 user 计），超了踢最旧的那条（`pkg/wshub/wshub.go:97-108`）——被踢的可能是某个正在用的窗口。而窗口全关掉时
本来就没有任何会话在前台，什么也没得计。

云端沙箱不影响这个结论：presence 写的是**本机**引擎（`BackendSupervisor` 永远跑在本机），不是会话所在的那个沙箱。

### 17.2 存什么

就是 §8.1 那张 `presence`。一点补充，因为和 §8.1 的初稿不同：

- **没有 `source` 列**。只有一条判定路径（主进程），没有降级档可标，留一列恒为 `'focus'` 的字段只会让人以为还有别的来源。
- `id` 是 `TEXT`，存 UUID。心跳重写同一段时用同一个 `id`，`PRIMARY KEY (user_id, id)` 上的 `ON CONFLICT ... DO UPDATE SET ended_at = max(...)` 保证幂等且不倒退。
- 两条 CHECK 把不变量写进库里：`ended_at >= started_at`；`(state = 'seen') = (thread_id <> '')`——`seen` 必有会话，`in_app` / `elsewhere` 必无。
- 三个部分索引：`presence_thread`（`WHERE thread_id <> ''`）、`presence_todo`（`WHERE todo_id <> 0`）、`presence_user_at`。

| 列 | 第一步用不用 | 说明 |
| --- | --- | --- |
| `thread_id` | 用 | `seen` 行是会话；`in_app` / `elsewhere` 是 `''` |
| `state` | 用 | `seen` / `in_app` / `elsewhere`；空闲与锁屏不落库 |
| `started_at, ended_at` | 用 | UTC 毫秒转 ISO 串进库；`id` 兼作幂等键 |
| `todo_id, workspace_id` | 写但不用 | `workspace_id` 来自会话所在项目；`todo_id` 恒 `0` |

**为什么 `todo_id` 恒 `0`**：现在数据层没有 thread↔todo 的关联。`todos` 表里的 `thread_id` 是「这个待办现在在哪个会话里打开」的单值导航字段，不是归属关系；一个待办换过会话，旧会话的那一段就找不回来了。`TODO.md` 也已经不用了（`domains/todos.ts` 开头写明待办在引擎的 `todos` 表里，`tools/hub.tsx:5`、`core/src/calls.ts:211` 那两句「方案是 TODO.md」是没跟着改的旧注释）。要做待办维度，得先有一张 thread→todo 的关联表，那是第二步。

量级、索引、按天切都按 §8.2–§8.3。

### 17.3 状态机

`PresenceMachine` 只有五个入口，全部同步、无异步、无定时器：

| 入口 | 谁调 | 作用 |
| --- | --- | --- |
| `setContext({ threadId, workspaceId } \| null)` | 渲染层经 `presence:context` | 记住屏幕上是哪个会话，立即重判 |
| `focus(boolean)` | `browser-window-focus/blur` | 立即重判 |
| `away(boolean)` | 锁屏 / 休眠 / 解锁 / 唤醒 | 立即重判；`true` 时 `wanted()` 直接返回空 |
| `input(idleSeconds)` | 每 30 秒巡检 + 启动时一次 | 空闲超限时**回填**结束点 |
| `heartbeat()` | 每 60 秒 | 用同一 `id`、更晚的 `end` 重写开着的段 |

判定规则（`wanted()`）：

1. `away` 或 `idle >= 180` → 没有段。人不在，什么都不写。
2. `!focused` → `elsewhere`（app 在后台，人可能在别处）。
3. `focused` 但没有会话 → `in_app`（在看设置、列表、待办）。
4. `focused` 且有会话 → `seen`，带 `threadId` 与 `workspaceId`，`todoId: 0`。

两个细节值得写下来：

- **空闲回填**：发现空闲 180 秒时，段结束在 `now - idleSeconds + 180`，不是 `now`。也就是说「最后一次性输入之后又算了 3 分钟」，而不是把你离开的整段时间都算进去，也不是把最后那 3 分钟真实在场的时间丢掉。误差上界正好是阈值本身。
- **阈值 180 秒的依据**（§4.2 展开过，这里只留结论）：它比读完一个长回答、翻一段 diff 的停顿长，比一次倒水短；复盘看的是「这个会话占了我半小时还是两小时」，180 秒的误差量级改不了结论。

`state.test.ts` 九条用例覆盖：开段/关段、切会话、失焦转 `elsewhere`、无会话转 `in_app`、锁屏立即闭段、空闲回填到准确时刻、心跳重写同一 id、`stop()` 闭段、相邻同值不重开。

### 17.4 崩溃、休眠、退出

| 情况 | 处理 | 丢多少 |
| --- | --- | --- |
| 正常退出 | `main/index.ts` 的 `before-quit` 先 `presence.stop()`：闭段、把队列交给窗口写、最多等 1 秒（`FLUSH_MS`），然后才 `Promise.allSettled([backend.stop(), history.flush()])` | ≤ 1 秒，或没来得及交给窗口的那段 |
| 硬崩 / 断电 | 每 60 秒心跳用同一 `id` 重写 `ended_at` | ≤ 60 秒 |
| 合盖 / 锁屏 | `powerMonitor` 的 `suspend` / `lock-screen` 立刻闭段；`resume` / `unlock-screen` 重新开段 | 0 |
| 关窗（macOS 只是隐藏窗口） | `browser-window-blur` → `elsewhere`，继续记但不记到会话上 | 0（会话维度） |
| 引擎重启 / 没起来 | 行留在内存队列（保序，上限 500 条），`BackendSupervisor` 转 `ready` 后由窗口补写 | 超过 500 条的部分 |
| 窗口不存在 / 正在重载 | 批次没人回答：`ACK_MS = 5_000` 到期算失败，队列留在原处，`RETRY_MS = 5_000` 后再递一次 | 窗口回来就补上；长期没窗口则堆到 500 条上限 |

`recorder.ts` 的 `BATCH = 50` 与引擎侧 `MaxPresenceBatch = 50` 对齐；`QUEUE_LIMIT = 500` 是「引擎挂十分钟也还能补回来」的量。队列一次只跑一个 pass（`drain()` 的 `dirty` 标记），所以同一段不会同时递给两个窗口——即使递了也只是同一个 `id` 重写一遍。

**没有第二份副本**：数据只住引擎库，所以引擎长时间不可用就会真的丢行。这是「只住引擎库」换来的，认为可以接受——复盘工具丢十分钟，不影响结论。

### 17.5 接口

| 方向 | 通道 / 方法 | 签名 |
| --- | --- | --- |
| 渲染 → 主 | `presence:context`（`ipcMain.on`） | `PresenceContext \| null` |
| 主 → 渲染 | `presence:rows`（`webContents.send`，`broadcast()`） | `PresenceBatch = { id, rows: PresenceInput[] }` |
| 渲染 → 主 | `presence:ack`（`ipcMain.on`） | `PresenceAck = { batch, outcome: 'wrote' \| 'refused' \| 'failed' }` |
| 渲染 → 引擎 | `presence/record` | `{ rows }`，`PresenceInput{id, threadId?, todoId?, workspaceId?, state, start, end}`，start/end 是 ISO 串 |
| 渲染 → 引擎 | `presence/summary` | `{ from, to, groupBy, offsetMinutes? } → { data: { key, seconds }[] \| null }` |

主进程不直接跟引擎说话：它把 `presence:rows` 广播给每一个窗口（`main/index.ts` 里传的 `send` 就是 `broadcast`），
哪个窗口先写完哪个算，后面的窗口重试同一个 `id` 也只是把 `ended_at` 写得更长（引擎侧 upsert，§9）。
5 秒没人回答就当失败，队列不动。读总数不需要主进程参与：会话页头部直接 `gateway().call('presence/summary', { from, to, groupBy: 'thread' })`（时区偏移只对 `day` 分组有用，这里不传）。

`outcome` 有三个值，因为两种失败要分开：`wrote` 写进去了；`refused` 后端说这些行不可能存（JSON-RPC `-32602`，
引擎把 `ErrInvalidPresence` 映射到这个码），批次直接从队列丢掉，否则它会永远重试、把后面所有段都堵住；
`failed` 是没连上或没回答，批次留在队首重试。

`groupBy` 取 `thread` / `todo` / `workspace` / `day` / `app`。桌面目前只用 `thread`，不传 `offsetMinutes`（它只对 `day` 有用；
按天切时必须传，否则 23:00–01:00 那一段会切错）。

**app 分组已修**：加了 `AND state <> 'elsewhere'`，只取 `seen` + `in_app`，`presence_test.go` 一条用例按住它。
为什么必须排除：一个工作日里 `elsewhere`（app 在后台、人在别处）往往是最长的一段，算进去这个数字会从「一个多小时」
变成「七八个小时」，读起来像「ollupi 开着就算在用」。

**仍未统一的是 `todo` / `workspace` / `day` 三个分组**：它们目前把 `elsewhere` 也算进各自的桶（`todo` 落进 `0` 号桶，
`workspace` 落进空字符串桶）。现在没有界面用，等下个版本定「日汇总到底是『在 ollupi 前多久』还是『记了多少段』」时
一次性对齐，都是一行 `scope` 的事。

### 17.6 界面

第一版只放在会话页头部：`ConversationScreen.tsx:124-131`，在标题行右侧、Workspace 胶囊之前。

```
⏱ 投入 2h41m
```

- 数据：`renderer/src/domains/presence.ts` 的 `useSpent(threadId, since)`，用窗口自己的连接调 `presence/summary`。`from` 取会话的 `createdAt`，`groupBy: 'thread'` 后按 `threadId` 找自己那一行；没连上时不问（先把上一次的数字留着），从没读到过就不显示。
- 刷新：`REFRESH_MS = 60_000`，外加 `visibilitychange` 与 `focus` 时立刻重问——切回窗口看到的数字是新的，不用等一分钟。
- 格式：`i18n/format.ts` 的 `spentTime(minutes, seconds)`，和全应用一致。
- 不足 1 分钟显示「不到 1 分钟」（`spentUnderMinute`），不显示 `0m`。
- 悬停一行（`spentHint`）：「只算这个会话在前台、且你在电脑前的时间。锁屏、休眠、空闲超过 3 分钟、切到别的应用都不算。」——这句话是产品承诺，阈值改了要一起改。
- 文案在 `i18n/messages/conversation.ts` 的 `screen` 段，中英各一条（`:55` / `:484`）。

侧栏每行数字留到数字自证正确之后（同一个 `presence/summary{groupBy:'thread'}` 就能支撑，不需要新接口）。

### 17.7 落点与工作量

引擎仓库 `~/Desktop/yiming/ollupi`：

| 文件 | 改动 |
| --- | --- |
| `store/sqlite/migrations/0015_presence.sql` | 新建：表 + 两条 CHECK + 三个部分索引 |
| `store/store.go` | `Presence`、`PresenceState`（含 `PresenceStates`）、`PresenceGroup`（含 `PresenceGroups`）、`PresenceQuery`、`PresenceBucket`；`Reader.PresenceBuckets`、`Tx.PutPresence` |
| `store/sqlite/presence.go` | 新建：`PutPresence`（upsert + `max(ended_at)`）、`PresenceBuckets`（区间求和 SQL）、`presenceByDay`（递归 CTE 按本地午夜切段） |
| `store/sqlite/presence_test.go` | 新建：5 条（upsert 幂等、区间裁剪、thread 分组排除空、跨午夜切分、app 分组排除 `elsewhere`） |
| `app/presence.go` | 新建：`MaxPresenceBatch = 50`、`RecordPresence`、`Presence`、`validPresence` |
| `app/app.go` | 加 `ErrInvalidPresence` |
| `gateway/protocol.go:140-141` | 注册 `presence/record`、`presence/summary`；`errorCodes` 里把 `ErrInvalidPresence` 映射到 `CodeInvalidParams`（否则客户端分不出「行不合法」和「服务器出错」） |
| `gateway/owned.go:213-230` | 两个方法的本机实现 |
| `gateway/presence_test.go` | 新建：2 条（走真实协议写入与求和、非法行被拒） |
| `gateway/schema_test.go` | 枚举与 schema 对齐 |
| `gateway/protocol.schema.json` + 生成物 | `go generate ./gateway` |

第一步**不碰** `app/todos.go`、`store/sqlite/owned.go`、`run/*`、`host/*`。

桌面仓库：

| 文件 | 改动 |
| --- | --- |
| `apps/desktop/src/main/presence/state.ts` | 新建：`PresenceMachine`、`IDLE_SECONDS = 180` |
| `apps/desktop/src/main/presence/state.test.ts` | 新建：9 条 |
| `apps/desktop/src/main/presence/signals.ts` | 新建：`attention()`，窗口焦点 + `powerMonitor` + `getSystemIdleTime()` |
| `apps/desktop/src/main/presence/recorder.ts` | 新建：`PresenceRecorder`（`setReady`/`record`/`flush`）、`PresenceTransport`，`BATCH/QUEUE_LIMIT/RETRY_MS` |
| `apps/desktop/src/main/presence/recorder.test.ts` | 新建：6 条（批量与保序、未就绪排队、失败保序重试、等回答才出队、上限只留最新、退出不等） |
| `apps/desktop/src/main/presence/presence.ts` | 新建：`Presence`（`start/setContext/onAck/stop`）、`BackendStates`、`PresenceOptions`，`HEARTBEAT_MS/LOOK_MS/FLUSH_MS/ACK_MS` |
| `apps/desktop/src/main/presence/presence.test.ts` | 新建：6 条（段交给窗口、失焦转 `elsewhere`、无后端先排队、没人回答重递、后端拒收保留、退出闭段） |
| `apps/desktop/src/main/index.ts` | `:59` `new Presence(backend, { send: broadcast })`、`registerIpc` 传入、`:82` `presence.start()`、`:107` 退出顺序 |
| `apps/desktop/src/main/window.ts` | `broadcast()`：一条消息给所有窗口 |
| `apps/desktop/src/main/ipc.ts` | `:141` `presence:context`、`:142` `presence:ack`、`:249` `presenceContext`（非法值当「没有会话」） |
| `apps/desktop/src/shared/ipc.ts` | `PresenceContext`、`PresenceBatch`、`PresenceAck`、`DesktopApi.presence`（`:463`）、`IpcChannel.PresenceContext/PresenceRows/PresenceAck`（`:563-565`） |
| `apps/desktop/src/preload/index.ts:139` | `api.presence`：`context` / `onRows` / `ack` |
| `apps/desktop/src/renderer/src/platform/desktop.ts` | 浏览器里跑时的兜底实现 |
| `apps/desktop/src/renderer/src/domains/presence.ts` | 新建：`usePresenceContext`（`:18`）、`startPresenceWriter`（`:35`）、`useSpent`（`:48`）、`REFRESH_MS` |
| `apps/desktop/src/renderer/src/main.tsx` | `startPresenceWriter()`，位置照 `startDrafts()` |
| `apps/desktop/src/renderer/src/views/conversation/ConversationScreen.tsx` | `:60-61` 两个 hook、`:124-131` 头部标签 |
| `apps/desktop/src/renderer/src/i18n/format.ts` | `spentTime` |
| `apps/desktop/src/renderer/src/i18n/messages/conversation.ts` | `screen` 段 `spent` / `spentUnderMinute` / `spentHint` |
| `packages/protocol/src/generated/*` | 生成物（`types.ts` 五个类型） |
| `packages/protocol/scripts/record-session.mjs`、`fixtures/session.json` | 会话录制脚本加两个方法，fixture 重录 |

实际工作量约 **3 天**：引擎（迁移 + store/app 两层 + 协议 + 聚合 SQL + 测试）1–1.5 天，主进程三块 + 两套单测 1 天，
界面与文案 0.5 天；后来把写入从「第二条连接」改成「借窗口的连接」又花了半天（§17.1）。

### 17.8 验收

**已由单测覆盖**（`pnpm test`、`go test ./store/sqlite/`、`pnpm protocol:check` 都过）：

- `state.test.ts` 9 条：段的开合、切会话、失焦、无会话、锁屏闭段、空闲回填时刻、心跳同 id、退出闭段、同值不重开。
- `recorder.test.ts` 6 条：批量与保序、未就绪时排队、失败后保序重试、等窗口回答才出队、队列上限只留最新、对发送不了的退出不等。
- `presence.test.ts` 7 条：段交给窗口、失焦转 `elsewhere`、无后端先排队、没人回答重递、连不上重递、被拒收就丢弃、退出闭段与交接。
- `presence_test.go` 5 条：upsert 幂等、区间裁剪、thread 分组排除空、跨午夜切分、app 分组排除 `elsewhere`。
- `gateway/presence_test.go` 2 条：走真实 WebSocket 与 SQLite 写入两段并求和（含重发不重复、`elsewhere` 不进 app 层）；
  非法行得到 `-32602`。
- `contract.test.ts` 4 条：协议 fixture 与两个新方法对得上。

**待实机验证**（还没做，需要在 `pnpm dev` 里真跑）：

1. 在会话 A 里连续操作 10 分钟：头部显示约 10 分钟（±1 分钟）。
2. 切到别的 app 5 分钟再回来：数字只增加回来之后的部分。
3. 关窗放着 30 分钟：数字不增长。
4. 合盖 30 分钟再打开：没有 30 分钟的跳跃。
5. `kill -9` 再启动：区间止于最后一次心跳，误差 ≤ 60 秒。
6. 停在设置页 5 分钟：这个 thread 的数字不增加。
7. 在内置浏览器面板读 5 分钟：仍计入当前 thread（走的是窗口级焦点，不是 `document.hasFocus()`）。

顺手能验证的：`sqlite3 ~/.ollupi/... .schema presence` 看表，`SELECT state, thread_id, started_at, ended_at FROM presence ORDER BY started_at DESC LIMIT 20` 看段是否连续、有没有重叠。

### 17.9 这一步刻意不做

- **`todo_id` 归属与回填**：行里恒 `0`；待办维度、项目维度、日/周汇总都没有。前置是 thread→todo 关联表，第二步。
- **`in_app` / `elsewhere` 的展示**：照常写库，界面只显示会话层数字。
- **侧栏每行数字**、**设置页「时间」一节**、**开关与阈值调节**（阈值是常量 180 秒）。
- **内置浏览器里的归属**：在主窗口里读网页算当前会话（窗口焦点为真），但在独立窗口里读就不算——这是已知缺口。
- **跨应用检测**：在别的 app 里干活不算（§11 第 1 行，已知并接受）。
- **历史重叠检测**：不扫描已写的行找重叠，只保证新写入的段互不重叠。
- **时钟跳变检测**：只保证已写区间不倒退；系统时钟向前跳识别不了。
- **导出**：没有 CSV / JSON 导出。

### 17.10 与关键路径的关系：失败只许丢数字

原则：presence 是观测者，不是参与者。它出错时唯一允许的后果是「这个数字没有或偏少」，不允许影响启动、发消息、
切会话、退出。逐条对照现在的实现：

| 可能的失败 | 现在的行为 | 用户看到 |
| --- | --- | --- |
| 引擎没起来 / 重启中 | 行进内存队列（≤500），`ready` 后交给窗口；`deliver` 失败或没人回答都不向外抛 | 数字停在上次读到的值 |
| `presence/record` 失败 | 窗口回答 `failed`，批次留在队首，5 秒后再递 | 无 |
| `presence/record` 被拒收 | 窗口回答 `refused`（`-32602`），批次丢掉，后面的照写；不丢就会永久重试、堵住队列 | 这一批时间没有 |
| `presence/summary` 失败 | `useSpent` 里的 `.catch`，保留上一次的数字 | 数字不更新 |
| 渲染层发来不合法的上下文 | `presenceContext()` 当作「没有会话」 | 那一刻记成 `in_app` |
| 退回 / 重载渲染层 | 写入停一拍，队列在主进程里不动；回来的窗口接着写 | 无 |
| 退出 | 队列空直接走；非空最多等 1 秒然后放弃 | 退出无延迟感 |
| 主进程采样本身 | 两个常量定时器（30 秒巡检、60 秒心跳）+ 事件回调，不 await 任何东西，不占渲染线程 | 无 |

**一条连接也不占**：窗口已经是那条 `OllupiClient` 的主人，主进程只把批次递给它。引擎的事件流仍然只推给每个窗口一次，
presence 不制造第二份 token delta，也不占 `PerKey` 的名额——也就不会在窗口重连时把某个活着的窗口挤掉（§17.1）。
窗口全关时没有连接可借，但那时候也没有会话在前台，本来就没有东西可记。

**唯一真正的耦合是迁移**：`store.Open` 里 `Migrate` 失败会让引擎起不来（`store/sqlite/sqlite.go:34`）。
`0015_presence.sql` 只是建表与索引的 additive DDL，失败基本等于「库本身有问题」，不是这个功能引入的新失败模式。
要做到零耦合只能把 presence 放进独立的库文件，代价是备份、跨库查询、导出都要多一套——不值得，不建议。
