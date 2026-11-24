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

### 1. Profile 的配置只有一个版本化来源

- `users` 表只保留 `id` 和 `created_at`。Profile 的名称、颜色、模型和记忆配置
  都写在 `config.yaml` 的 `profiles[]`；当前选择留在本机的 `profile.json`。
- `config.yaml` 带 `schema_version`。没有版本号的文件（0.8.17-beta.2 及以前的
  顶层 `models`，beta.3 的 `profiles[].models` 里各带 provider）只在读文件的边界
  一次性升级：原文件留作 `config.yaml.pre-v2`，新文件写回，之后 gateway、host 和
  renderer 只运行当前版本；比当前更新的版本号直接拒绝。beta.3 放在
  `userData/profiles.json` 的名称和颜色由主进程在启动时写进 `profiles[]`，
  然后把原文件改名为 `profiles.json.imported`。
- `config.yaml` 的 `profiles[].id` 声明这个 home 有哪些 Profile；后端启动时
  为缺少的 id 调 `EnsureUser`。因此配置、数据库和凭据在启动时对齐。
- desktop 的 Profile 创建把 id、名称、颜色、模型选择和记忆模型一次写入 config。
- 网关不提供跨用户的 `user/list/create/rename/color`。当前连接已经由 token 命名，
  普通客户端没有理由枚举或管理同一 shard 的其他用户。
- 删除 Profile：主进程先停后端，`ollupid --delete-profile` 在库里没有其他写者时
  删除 threads → entries/items/turns、memory、todo、cron、presence、usage 和用户行，
  再从 config 去掉它；之后主进程删 attachment 目录和 `users/<id>`，重启后端。
  它若还有未结束的轮次、飞书还在以它的身份运行，或它是最后一个 Profile，都拒绝删除。

### 2. 认证：token 里带着身份

不引入新的凭据体系，也不启用 catalog：

- `BackendSupervisor` 仍然每次启动生成一个 secret `S`（`randomBytes(32)`），传给后端
  `OLLUPI_GATEWAY_TOKEN`。
- 渲染层拿到的 token 是 `S + "." + profileID`，主进程从当前选择现算。
- sidecar 给 `gateway.Options.Authenticate` 传一个函数：常数时间比较 `S`，然后查
  `users` 表确认 profile 存在，返回它；config 声明的用户已由后端启动过程建好。
- 主进程把上次选的身份记在 `userData/profile.json`，启动按它签 token；切换身份时
  `BackendSupervisor.selectProfile` 用同一个 secret 换一个 profile 重新签发，渲染层收到
  新的 ready 状态就重连——不需要重启后端。
- 威胁模型和现在一致：防的是本机浏览器/别的 origin 连上 loopback 端口，不防同机进程。
  所以“无密码”是诚实的：知道 `S` 的人可以选任何身份，而他本来就能直接读库。

### 3. 目录

- hub 工作区：每个身份用 `<home>/users/<id>/super-agent`。`superAgentFolder(profile)`
  决定返回哪个。
- 本地执行环境：ollupi 的 `Boxes(user)` 每个 Profile 一个 `sandbox.Box`，根目录是
  `<home>/users/<id>`，MCP 进程和 web 工具都从它进入本机。今天这些 Box 在同一台机器、
  同一个系统用户下，权限相同；调用边界已经按 Profile 分开，云部署时把这个工厂换成
  各自的云沙箱即可。工作区命令仍走 workspace 工具自己的沙箱（`sandbox_mode`），
  不借这个完全访问的 Box。
- 这是多 Profile，不是本机上的多用户隔离：同一台机器上的 Profile 能读到彼此的文件。
- `attachments/` 共享：键是 `threadID/附件ID.ext`，thread id 全局唯一，不会撞。
- `skills/` 共享（配置级）。按身份分技能是另一个功能，v1 不做。
- 浏览器历史和书签按设备共享。

### 4. Credential 共享，模型由 Profile 选择

`config.yaml` v2：

```yaml
schema_version: 2
name: ollupi
workspace: { enabled: true, sandbox_mode: workspace-write, ... }
skills_dir: skills
feishu: { app_id: ..., profile: default, users: [ou_x] }

credentials:
  - id: openai
    type: openai
    base_url: https://api.openai.com/v1
    api_key: ...
    models:
      - name: gpt-5.2
        limits: { context: 400000, output: 128000 }

profiles:
  - id: default
    name: ""
    color: stone
    models: [openai/gpt-5.2]
    memory: { model: openai/gpt-5.2 }
  - id: work
    name: Work
    color: teal
    models: [openai/gpt-5.2]
```

一个 credential/model 只实例化一个 client。多个 Profile 选择同一个模型时共享
API 账户、并发限制和连接；Profile 只决定自己能选哪些模型及顺序。没有选中的模型
不能运行，也不会借用其他 Profile 的选择。记忆模型必须是该 Profile 已选模型之一。

校验保证这一点：两个 credential 的 type、base_url、api_key 相同就拒绝；升级时也
按这三者合并。界面上新加的 provider 若和已有 credential 是同一个账户，模型加进那个
credential，而不是新建一个。

Renderer 不认识 YAML 路径。它提交 `addProvider`、`editModel`、
`setMemoryModel` 等领域操作（`shared/profileConfig.ts`），main process 把它变成
对文件的修改，由 backend 的 `--check-config` 校验后原子写入。规则各有一处：
文件的合法性只在 sidecar 的 `config.Validate`，领域操作只在 `profileConfig.ts`，
renderer 只用它算展示和提前提示。

改动按代价生效：

| 改了什么 | 怎么生效 |
|---|---|
| Profile 名称、颜色 | 只写文件 |
| 新建 Profile、模型列表、API key、记忆模型 | 主进程给后端发 SIGHUP，sidecar 重读 `credentials[]`/`profiles[]`，建好缺的用户，`host.SetUsers` 原地替换模型；正在调用模型的轮次用旧 client 跑完。后端不在运行或重载失败时退回重启 |
| 其他（工作区、沙箱、skills、slots、飞书、手改文件） | 提示后重启 |

### 5. 渲染层

- 侧栏底部一个身份菜单（现在这样实现）：列出所有身份、切换、新建（起名 + 选颜色）、编辑当前身份的名字和颜色。
- **切换 = 重连**：先清空每个 profile-scoped domain 的 store，再用新 token 连接
  （threads、workspaces、todos、memory、usage、models、read state）。
  `resetForProfile()` 同时清掉当前 conversation、panel、model、environment 和 approval。
- 草稿：`domains/drafts.ts` 的键从 `threadId` 改成 `${profileId}:${threadId}`，
  `NEW_CONVERSATION` 同理；否则 A 的草稿会出现在 B 的输入框里。
- presence：切换时先结束当前 stretch（`presence/record` 的 id 换掉），新连接自动带新 user。
- 新身份的空状态：没有 hub 时引导 `startSuperAgent(profile)`；没有工作区时给“添加文件夹”。
- 通知：标题带身份名（“工作 · 会话完成”），否则分不清是谁的。
- 主题、语言、通知开关保持全局（设备级偏好），不按身份。

### 6. 飞书

- `feishu.users` 是允许使用的 `open_id`，`feishu.profiles` 把它们映射到各自的 profile。
- `owner` 从 `gateway.DefaultUser` 改成按发送者 open_id 查到的身份；不在映射里的照旧
  回复 open_id 并忽略。
- `feishu.workspace` 是全局的：新身份从飞书发起的会话都落在同一个工作区。

## 分阶段

| 阶段 | 内容 | 可验收的结果 |
|---|---|---|
| P1 | （已完成）网关强制身份、token 带身份、config 的 `profiles[]` 声明并在启动时建用户、飞书 `profile` 必填、hub 目录按身份 | 第二个身份有独立的会话、记忆、待办、工作区；hub 目录不撞 |
| P2 | （已完成）侧栏身份菜单（切换/新建/编辑）、主进程按身份签 token、选择记在 `userData/profile.json`、切换即重连、草稿按身份隔离、通知标题带身份 | 界面上能切身份，切完看到的是对方的数据；重启后仍停在原身份 |
| P3a | （已完成）config v2 的 `credentials[]` 与 `profiles[]`、共享 client/限流 | 不同 Profile 各自选择模型；同模型共享额度和并发 |
| P3b | （已完成）领域化配置 API；按 Profile 设置模型顺序与记忆模型 | 图形界面里不接触 YAML 路径 |
| P4 | （已完成）`feishu.profiles` 把 open_id 映射到身份，回调按线程归属 | 手机端按人分 |

每个 Profile 自己选择模型和记忆模型；共享的是底层 credential，而不是 Profile
状态。引擎 API 变化要发新 tag，并在桌面端 bump `go.mod`。

## 风险与取舍

- **引擎接口变化大**：`Models()` 变成 `Models(user)` 会碰到 `app`、`run`、`gateway` 的
  所有调用点和测试；分阶段做可以把 P1/P2 先发出去。
- **资源**：每个身份一套 MCP 进程、一份 MCP 工具表；后台定时任务对所有身份照跑，
  配额 `slots` 是全局的。
- **共享目录**：`scratch/`、`attachments/`、`skills/` 是共享的；身份之间能互相看到
  这些文件，文档和空状态里要说清楚。
- **不是安全边界**：共用一台电脑时，A 能看到 B 的数据（文件权限层面）。如果需要真隔离，
  用 macOS 账户，那是另一套方案。

## 没做的（需求里没有，别当成计划）

- **导出/导入**：目前整目录拷 `~/.ollupi` 就够了（见 README）。

需要的话再说，不从“剩余工作”里算。
