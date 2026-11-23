# Desktop 多身份（多用户）设计

一台 Mac、一个 macOS 账户，应用里可以有几个身份（profile）：各自独立的会话、记忆、待办、
工作区、权限、模型和 API key；切换不需要密码；彼此看不到对方的数据。

## 非目标

- **不是安全边界。** 同一 macOS 账户下，任何进程都能读 `~/.ollupi`；没有密码的切换只是
  “整理”，不是“隔离”。真正的隔离由 macOS 账户完成，每人一个 `~/.ollupi`。
- 不做远程多人（网络暴露、TLS、每人令牌）——那是另一种部署形态。
- 不做分片、catalog、router：单机一份库、一个写入者，`shard.Member` 用不上。
- 不做管理员视角：没有跨用户读取。

## 现状盘点

已经按用户建模的部分（不用动）：

- 表：`threads`、`settings`、`memories`、`workspaces`、`environments`、`mcp_servers`、
  `cron_jobs`、`presence`、`usage` 都带 `user_id`；`workspaces` 的唯一键是
  `(user_id, root)`，两个身份可以登记同一个文件夹而互不影响。
- 接口：`store.Store` / `app.App` 的方法全部收 `user`；网关每个连接都带着 user，
  并在每个调用里传给 app。
- `tx.EnsureUser` 会建 `users` 行、`settings` 行（含脱敏密钥）和本机环境。
- `app` 的 `Boxes`、`Statuses`、`Tools` 都是 `func(user)`，MCP 客户端也按用户各一套。

写死成“一个用户”的部分：

| 位置 | 现状 |
|---|---|
| `gateway` 的认证 | 单个 token → `DefaultUser = "default"` |
| `superAgentFolder()`（`apps/desktop/src/main/ipc.ts`） | 固定 `<home>/super-agent`，所有身份会写进同一个 hub 目录 |
| `app.Models()` | 全局一份模型列表，`pickModel` 也只用这一份 |
| 飞书桥接 | `owner = gateway.DefaultUser`，所有 open_id 都算同一个人 |
| 渲染层 | 没有任何用户维度：连接、缓存、草稿、通知都是单份 |

## 设计

### 0. 身份是强制的：没有兜底

这几处以前允许“没有身份也能用”，现在都删掉了：

- `gateway.Options.Token` 和默认的 token → `DefaultUser` 映射：`Authenticate` 成了必填项，
  构造时没有就直接报错。
- 网关在每次连接上自动 `EnsureUser`：认证只认已存在的身份，未知身份直接拒绝，不会被顺手创建。
- 后端启动时给 `DefaultUser` 预热 MCP：改成遍历库里所有身份。
- 飞书桥接的 `owner = gateway.DefaultUser`：改成配置里必填的 `feishu.profile`，并且这个身份
  必须在库里存在，否则后端起不来。
- 全新 home 不再“没有用户”：启动时先建第一个身份（id `default`），从第一次写入起数据就有归属。

token 的形式是 `<secret>.<profile>`：`secret` 每次启动新生成，只放进后端的环境；
渲染层拿到的是拼上身份的版本。没有身份、身份不存在、secret 不对，一律
`auth.ErrUnknownToken`。

### 1. 身份就是 `users` 表的一行

- 迁移 0017：`users` 加 `name`（显示名）和 `color`（侧栏小圆点/首字母底色），
  `created_at` 已有。
- 现有的 `default` 变成第一个身份；它还没有名字时界面显示本地化的“我”，改名后用它。
- 新增网关接口：`user/list`、`user/create`、`user/rename`。`user/create` 由调用者创建，
  默认复制调用者的模型配置（含 key），建完即可用。
- v1 不做删除（删除要级联 threads → entries/items/turns、memories、attachments 目录、
  hub 文件夹，还要处理正在跑的任务）；先支持归档/改名。删除留到 P4。

### 2. 认证：token 里带着身份

不引入新的凭据体系，也不启用 catalog：

- `BackendSupervisor` 仍然每次启动生成一个 secret `S`（`randomBytes(32)`），传给后端
  `OLLUPI_GATEWAY_TOKEN`。
- 渲染层拿到的 token 是 `S + "." + profileID`，主进程通过 IPC `user/token` 现算。
- sidecar 给 `gateway.Options.Authenticate` 传一个函数：常数时间比较 `S`，然后查
  `users` 表确认 profile 存在，返回它。网关以下（app、store、run）一行不用改。
- 主进程把上次选的身份记在 `userData/profile.json`，启动按它签 token；切换身份时
  `BackendSupervisor.selectProfile` 用同一个 secret 换一个 profile 重新签发，渲染层收到
  新的 ready 状态就重连——不需要重启后端。
- 威胁模型和现在一致：防的是本机浏览器/别的 origin 连上 loopback 端口，不防同机进程。
  所以“无密码”是诚实的：知道 `S` 的人可以选任何身份，而他本来就能直接读库。

### 3. 目录

- hub 工作区：`default` 继续用 `<home>/super-agent`（不动现有数据）；其他身份用
  `<home>/users/<id>/super-agent`。`superAgentFolder(profile)` 决定返回哪个。
- `attachments/` 共享：键是 `threadID/附件ID.ext`，thread id 全局唯一，不会撞。
- `skills/` 共享（配置级）。按身份分技能是另一个功能，v1 不做。
- `scratch/` 共享：不在工作区里跑命令的默认目录，谁都能看到内容——文档里要写明。

### 4. 模型与 key 按身份（最贵的一块）

`config.yaml` 增加按身份的分节；顶层的 `models`/`memory` 继续作为 `default` 的兼容写法：

```yaml
name: ollupi
workspace: { enabled: true, sandbox_mode: workspace-write, ... }
skills_dir: skills
feishu: { app_id: ..., profile: default, users: [ou_x] }

# The first profile's models are the top-level ones (as they have always
# been), with its own keys and learning model.
models: [ { provider: openai, type: openai, base_url: ..., api_key: ..., names: [...] } ]
memory: { model: openai/gpt-5.2 }

# Every other profile lists its own, keys included.
users:
  - id: work
    models: [ { provider: ..., api_key: ..., names: [...] } ]
    memory: { model: ... }
```

一个身份没有自己的模型（配置里没有它）就没有模型可用：能看历史，不能开新回合，
而不是借用别的身份的。记忆用的模型目前还是第一个身份的（`memory.model`），
按身份各自记忆模型留到 P3b。

引擎要改的地方：

- `host.models` 从“一份列表”变成“按用户”：`Models(user)`、`Limits(user, m)`；
  `Client(user, m)` 已经有 `clientFor(user, connection)` 这个钩子，可以复用。
- `app.Models()` → `Models(user)`；`pickModel(user, connection, last)` 只在**该身份**的
  列表里找，线程里记的 `connection` 不属于它就报“在设置里恢复或换一个模型”（现有文案）。
- `gateway/models` 用连接用户的列表（`gateway/owned.go` 现在调 `app.Models()`）。
- 记忆提取（`extract.New`）现在是一个全局模型，要改成按用户解析。
- `--check-config` 的输出带上 `users[]`；设置 → 模型的编辑路径变成
  `users[i].models...`，`config/apply` 的 path 由渲染层按当前身份拼。
- 新身份创建时复制调用者的 `models`（key 一起），否则新身份没有模型，后端起不来。

### 5. 渲染层

- 侧栏底部一个身份菜单（现在这样实现）：列出所有身份、切换、新建（起名 + 选颜色）、编辑当前身份的名字和颜色。
- **切换 = 重连**：断开 WebSocket → 用新 token 连接 → 把每个 domain 的 store 重置
  （threads、workspaces、todos、memory、usage、models、read state）。
  需要在 `domains/` 里加一个统一的 `resetForProfile()`，避免漏掉某个缓存。
- 草稿：`domains/drafts.ts` 的键从 `threadId` 改成 `${profileId}:${threadId}`，
  `NEW_CONVERSATION` 同理；否则 A 的草稿会出现在 B 的输入框里。
- presence：切换时先结束当前 stretch（`presence/record` 的 id 换掉），新连接自动带新 user。
- 新身份的空状态：没有 hub 时引导 `startSuperAgent(profile)`；没有工作区时给“添加文件夹”。
- 通知：标题带身份名（“工作 · 会话完成”），否则分不清是谁的。
- 主题、语言、通知开关保持全局（设备级偏好），不按身份。

### 6. 飞书

- `feishu.users` 从 `[open_id]` 改成 `{open_id: profileID}`；旧写法仍按 `default` 处理。
- `owner` 从 `gateway.DefaultUser` 改成按发送者 open_id 查到的身份；不在映射里的照旧
  回复 open_id 并忽略。
- `feishu.workspace` 是全局的：新身份从飞书发起的会话落在哪个工作区，要么全局一个，
  要么进 `users[]` 分节。v1 先保持全局。

## 分阶段

| 阶段 | 内容 | 可验收的结果 |
|---|---|---|
| P1 | （已完成）网关强制身份、token 带身份、启动建第一个身份、飞书 `profile` 必填、`users` 加 `name`/`color`（迁移 0017）、`user/list/create/rename/color`、hub 目录按身份 | 接口层能建出第二个身份，各有独立的会话、记忆、待办、工作区；hub 目录不撞 |
| P2 | （已完成）侧栏身份菜单（切换/新建/编辑）、主进程按身份签 token、选择记在 `userData/profile.json`、切换即重连、草稿按身份隔离、通知标题带身份 | 界面上能切身份，切完看到的是对方的数据；重启后仍停在原身份 |
| P3a | （已完成）引擎按身份解析模型、`config.yaml` 的 `users[]`、sidecar 按身份装配客户端 | 配置里写第二个身份的 provider/key，它跑的就是这一套 |
| P3b | （除记忆模型外已完成）新建身份把当前身份的模型写进配置（含复制 key）；设置页按当前身份编辑模型（`users[i]` 路径）；剩下记忆模型按身份 | 图形界面里能改每个身份的模型和 key，不必手写 YAML |
| P4 | 飞书映射、通知标注、presence 收尾、身份删除/归档、导出导入 | 手机端按人分；删身份能把数据收干净 |

P1+P2 之后“多身份”就能日常用（模型仍共用）；P3 才是“每人一套模型和额度”。P3 动的是引擎的 `host`/`app`/`run`/`gateway`/`extract`，要发新 tag 并在桌面端 bump
`go.mod`（和这次路径改动一样的流程）。

## 风险与取舍

- **引擎接口变化大**：`Models()` 变成 `Models(user)` 会碰到 `app`、`run`、`gateway` 的
  所有调用点和测试；分阶段做可以把 P1/P2 先发出去。
- **schema 升到 0017**：旧版 app 打不开新库（`user_version` 检查），升级前照例备份。
- **资源**：每个身份一套 MCP 进程、一份 MCP 工具表；后台定时任务对所有身份照跑，
  配额 `slots` 是全局的。
- **共享目录**：`scratch/`、`attachments/`、`skills/` 是共享的；身份之间能互相看到
  这些文件，文档和空状态里要说清楚。
- **不是安全边界**：共用一台电脑时，A 能看到 B 的数据（文件权限层面）。如果需要真隔离，
  用 macOS 账户，那是另一套方案。

## 待拍板

1. 先按 P1 → P2 做（模型先共用），还是 P3 一起做？
2. 新建身份时默认复制当前身份的模型配置（含 key），这个行为可以吗？
3. v1 要不要支持“删除身份”？（建议放 P4，先只支持改名/归档）
