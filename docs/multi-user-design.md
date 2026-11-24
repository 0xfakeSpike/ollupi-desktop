# Desktop 多身份（多用户）设计

一台 Mac、一个 macOS 账户，应用里可以有几个身份（profile）：各自独立的会话、记忆、待办、
工作区、权限和设置；切换不需要密码；彼此看不到对方的数据。

ollupi 是要水平扩展、服务很多用户的平台，桌面端只是它的一种部署：一个本地分片，
这台 Mac 的人既是平台运营者，也是各个身份。分层照平台的来：

| 层 | 内容 | 放在哪 |
|---|---|---|
| 部署（运营者） | 模型目录（provider 的地址、key、模型和上限）、名称、prompt、slots、工具、沙箱、skills、飞书 | `config.yaml`，每个副本一样 |
| 身份提供方 | 有哪些身份、名称和颜色；给连接签 token | 桌面主进程，`<home>/profiles.json` |
| 用户 | 新会话默认用哪个模型、学记忆用哪个模型、权限、MCP、记忆、会话 | ollupi 的库，经网关由本人的连接改 |
| 设备 | 这台 Mac 上次选的身份、主题、语言 | `userData` |

模型是平台提供的：用户只在平台的模型里选，不各带 key。

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
- 网关不再替任何连接 `EnsureUser`：用户由身份提供方开，ollupi 不猜。
- 后端启动时给 `DefaultUser` 预热 MCP：改成遍历库里所有身份。
- 飞书桥接的 `owner = gateway.DefaultUser`：改成配置里必填的 `feishu.profile`。部署点名的
  身份和 token 点名的一样可信，后端启动时为它们建好用户。
- 全新 home 也有身份：`profiles.json` 不存在时主进程写入第一个身份（id `default`），
  第一个连接就以它的名义开户。

token 的形式是 `<secret>.<profile>`：`secret` 每次启动新生成，只放进后端的环境；
渲染层拿到的是拼上身份的版本。没有身份、身份 id 不合法、secret 不对，一律
`auth.ErrUnknownToken`。secret 只有主进程知道，所以带对 secret 的 token 就是身份提供方
的担保：库里还没有这个用户时当场建，和云上分片第一次见到被分配来的用户一样。

### 1. 身份由主进程提供

- `users` 表只保留 `id` 和 `created_at`。有哪些身份、各自的名称和颜色，写在
  `<home>/profiles.json`（跟数据一起走，整个 `~/.ollupi` 拷走还能用）；这台 Mac 上次选的
  身份留在 `userData/profile.json`。
- 新建身份只往 `profiles.json` 加一行；切过去时第一个连接让后端开户。新身份什么都是空的，
  模型用平台的，不需要从别的身份复制什么。
- 只能切到 `profiles.json` 里有的身份：token 会开户，主进程不给列表外的 id 签。
- 网关不提供跨用户的 `user/list/create/rename/color`。当前连接已经由 token 命名，
  普通客户端没有理由枚举或管理同一 shard 的其他用户。
- 删除 Profile：主进程先停后端，`ollupid --delete-profile` 在库里没有其他写者时
  删除 threads → entries/items/turns、memory、todo、cron、presence、usage、settings
  和用户行；之后主进程把它从 `profiles.json` 去掉，删 attachment 目录和 `users/<id>`，
  重启后端。它若还有未结束的轮次、飞书还在以它的身份运行，或它是最后一个 Profile，
  都拒绝删除。

### 2. 认证：token 里带着身份

不引入新的凭据体系，也不启用 catalog：

- `BackendSupervisor` 仍然每次启动生成一个 secret `S`（`randomBytes(32)`），传给后端
  `OLLUPI_GATEWAY_TOKEN`。
- 渲染层拿到的 token 是 `S + "." + profileID`，主进程从当前选择现算。
- sidecar 给 `gateway.Options.Authenticate` 传一个函数：常数时间比较 `S`、检查 id 合法，
  库里没有这个用户就建，返回它。
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

### 4. 模型是平台的，身份只选

`config.yaml` 的 `providers` 是部署的模型目录，所有身份共用：

```yaml
name: ollupi
providers:
  - id: openai
    type: openai
    base_url: https://api.openai.com/v1
    api_key: ...
    models:
      - name: gpt-5.2
        limits: { context: 400000, output: 128000 }
workspace: { enabled: true, sandbox_mode: workspace-write, ... }
skills_dir: skills
feishu: { app_id: ..., profile: default, users: [ou_x] }
```

- ollupi 的 `host.Config.Models` 收这份目录，`host.SetModels` 原地替换；每个模型一个
  client，所有用户共用它的并发上限。用户的选择在库里：`settings.model`（新会话默认，
  空或已下架就用目录里第一个）和 `settings.learn_model`（学记忆，空或已下架就不学），
  经网关 `settings/update` 的 `model`、`learnModel` 改，只能选目录里有的。
- 目录在运营者这边，key 不经过用户的连接：`model/list` 只给模型名和能力。查余额、
  拉取厂商的模型列表都是设置页（运营者）拿着配置里的 key 做的。
- 设置 → 模型改的是目录：渲染层把增删改变成对 `providers` 的修改，主进程用后端的
  `--check-config` 校验后原子写入。只动 `providers` 的修改给后端发 SIGHUP，sidecar
  重读并 `SetModels`，正在调用模型的轮次用旧 client 跑完；后端不在运行或重载失败时退回
  重启。其他修改（工作区、沙箱、skills、slots、飞书、手改文件）提示后重启。
- 模型卡片上的星标是“本身份的新会话默认用它”，记忆页的模型是“本身份用它学记忆”，
  都走网关，不碰文件。
- 命令跑在沙箱里，读不到 `config.yaml`（key 在里面）也读不到 `<home>/data`（库）。

#### 从旧配置导入

0.8.17-beta.2 及以前（顶层 `models` + `memory`）、beta.3（`profiles[].models` 各带
provider）、beta.4（`schema_version: 2` 的 `credentials` + `profiles`）都由
`ollupid --import-config` 一次性拆开，主进程每次启动、读配置之前先跑它：

- 所有身份用过的 provider 合成一份 `providers`：同名同账户的合并模型；同名不同账户的
  后来者改名为 `名字-2`，那个身份的选择跟着改。provider 名字不变，旧会话记着的
  `provider/model` 照样能用。
- 每个身份建用户，原来的第一个模型和记忆模型写进它的 settings。
- 名称和颜色写进 `profiles.json`：beta.4 从配置里来，beta.3 从 `userData/profiles.json` 来。
- 原文件留作 `config.yaml.pre-import`，新文件保留其余部分和注释。每一步都能重跑，
  中途断了下次启动接着做。

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
| P3 | （已完成）模型目录归部署（`providers`、`host.Config.Models`、`SetModels` 热替换）；身份只在库里选默认模型和记忆模型；`profiles.json` 归主进程，token 首次使用即开户；旧配置一次性导入 | 所有身份用同一份模型目录，各自选默认和记忆模型；改目录不中断正在跑的轮次 |
| P4 | （已完成）`feishu.profiles` 把 open_id 映射到身份，回调按线程归属 | 手机端按人分 |

模型目录是部署的，每个 Profile 只在里面选。引擎 API 变化要发新 tag，并在桌面端 bump `go.mod`。

## 风险与取舍

- **按用户计费**：今天所有用户共用目录里的 key 和并发。要让每个用户用自己的账户，
  ollupi 的 `host.Config.ClientFor` 可以按用户换 client，目录不变。
- **资源**：每个身份一套 MCP 进程、一份 MCP 工具表；后台定时任务对所有身份照跑，
  配额 `slots` 是全局的。
- **共享目录**：`scratch/`、`attachments/`、`skills/` 是共享的；身份之间能互相看到
  这些文件，文档和空状态里要说清楚。
- **不是安全边界**：共用一台电脑时，A 能看到 B 的数据（文件权限层面）。如果需要真隔离，
  用 macOS 账户，那是另一套方案。

## 没做的（需求里没有，别当成计划）

- **导出/导入**：目前整目录拷 `~/.ollupi` 就够了（见 README）。

需要的话再说，不从“剩余工作”里算。
