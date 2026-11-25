# Desktop 多身份（多用户）设计

一台 Mac、一个 macOS 账户，应用里可以有几个身份（profile）：各自独立的会话、记忆、待办、
工作区、权限和设置；切换不需要密码；彼此看不到对方的数据。

ollupi 是要水平扩展、服务很多用户的平台，桌面端只是它的一种部署：一个本地分片，
这台 Mac 的人既是平台运营者，也是各个身份。分层照平台的来：

| 层 | 内容 | 放在哪 |
|---|---|---|
| 部署（运营者） | 名称、prompt、slots、工具 | `config.yaml`，每个副本一样 |
| 部署（运营者） | 模型目录（provider 的地址、key、模型和上限）；有哪些身份、各叫什么 | ollupi 的库，经网关由运营者的连接改 |
| 身份提供方 | 给连接签 token | 桌面主进程，拿着网关和运营者的两个 secret |
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
| 渲染层 | 没有任何用户维度：连接、缓存、草稿、通知都是单份 |

## 设计

### 0. 身份是强制的：没有兜底

这几处以前允许“没有身份也能用”，现在都删掉了：

- `gateway.Options.Token` 和默认的 token → `DefaultUser` 映射：`Authenticate` 成了必填项，
  构造时没有就直接报错。
- 网关不再替任何连接 `EnsureUser`：用户由运营者开（`user/create`），ollupi 不猜。
- 后端启动时给 `DefaultUser` 预热 MCP：改成遍历库里所有身份。
- 全新 home 也有身份：sidecar 启动时库里一个用户都没有，就建第一个（id `default`，
  不起名），给它放自带技能。

token 的形式是 `<secret>.<profile>`：`secret` 每次启动新生成，只放进后端的环境；
渲染层拿到的是拼上身份的版本。没有身份、身份 id 不合法、secret 不对，一律
`auth.ErrUnknownToken`。身份还必须是库里已有的用户：token 不再顺手开户，
不认识的身份同样回 `ErrUnknownToken`。

### 1. 身份是 ollupi 的用户

- `users` 表有 `id`、`name`、`created_at`（迁移 0022 加的 `name`，空就是还没起名，
  界面显示成"我"）。颜色没有了。这台 Mac 上次选的身份留在 `userData/profile.json`。
- 运营者的连接经网关管理身份：`user/list` 列出全部，`user/create {name}` 新建（id 是
  新的 uuid，sidecar 经 `gateway.Options.Welcome` 给它放自带技能），`user/update {id, name}`
  改名。普通连接只能 `user/read` 自己、给自己改名，改别人回 `forbidden`。改动发
  `user/changed`：运营者连接收到每一个，普通连接只收到自己的。
- 主进程不再保管身份列表。sidecar 的握手 `ready` 行带上库里所有身份的 id；这台 Mac
  选的身份不在里面时，主进程退回第一个并记住它。后端的 `ready` 状态带着当前身份，
  渲染层从这里知道自己是谁。
- 删除 Profile：主进程先停后端，`ollupid --delete-profile` 在库里没有其他写者时
  删除 threads → entries/items/turns、memory、todo、cron、presence、usage、settings
  和用户行；之后主进程删 attachment 目录和 `users/<id>`，重启后端。它若还有未结束的
  轮次，或它是库里最后一个身份，`--delete-profile` 都拒绝删除。

### 2. 认证：token 里带着身份

不引入新的凭据体系，也不启用 catalog：

- `BackendSupervisor` 每次启动生成两个 secret（`randomBytes(32)`）：网关的传给后端
  `OLLUPI_GATEWAY_TOKEN`，运营者的传 `OLLUPI_OPERATOR_TOKEN`。
- 渲染层拿到的 token 是运营者的 secret + `"." + profileID`，主进程从当前选择现算：本机的
  应用就是它跑的这个后端的运营者，能改模型目录。
- sidecar 给 `gateway.Options.Authenticate` 传一个函数：常数时间比较两个 secret、检查 id
  合法，库里没有这个用户就建，返回 `auth.Identity{User, Operator}`。
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
  各自的云沙箱即可。工作区命令仍走 workspace 工具自己的沙箱（只写工作区，不联网），
  不借这个完全访问的 Box。
- 这是多 Profile，不是本机上的多用户隔离：同一台机器上的 Profile 能读到彼此的文件。
- `attachments/` 共享：键是 `threadID/附件ID.ext`，thread id 全局唯一，不会撞。
- `skills/` 共享（配置级）。按身份分技能是另一个功能，v1 不做。
- 浏览器历史和书签按设备共享。

### 4. 模型是平台的，身份只选

模型目录（各 provider 的账户、key 和模型）存在 ollupi 的库里（迁移 0021 的 `providers`、
`provider_models`），是部署的，所有身份共用，不在 `config.yaml` 里。

- 宿主启动时从库里读目录，之后跟着库的改动走：`Tx.SetCatalog` 提交一条不属于任何用户的
  事件，宿主换掉变了的模型客户端，正在调用模型的轮次用旧 client 跑完。每个模型一个
  client，所有用户共用它的并发上限。用户的选择在库里：`settings.model`（新会话默认，
  空或已下架就用目录里第一个）和 `settings.learn_model`（学记忆，空或已下架就不学），
  经网关 `settings/update` 的 `model`、`learnModel` 改，只能选目录里有的。
- 目录归运营者：`catalog/read`（带 key）和 `catalog/set`（整份替换，`CheckCatalog` 不过
  就 invalidParams）只有运营者连接能调，用户连接回 `forbidden`。改动给运营者连接发
  `catalog/changed`，给每个连接发 `model/changed`（只有模型和开新会话默认用哪个）。
  `model/list` 只给模型名和能力。
- 设置 → 模型：运营者连接读整份目录，增删改后整份 `catalog/set`；不是运营者的连接只列出
  模型、选默认。查余额、拉取厂商的模型列表是设置页拿着目录里的 key 经主进程做的。
- 模型卡片上的星标是“本身份的新会话默认用它”，记忆页的模型是“本身份用它学记忆”，
  都走网关，不碰文件。
- 命令跑在沙箱里，读不到 `config.yaml`，也读不到 `<home>/data`（库，key 在里面）。

#### 从旧配置导入

0.8.17-beta.2 及以前（顶层 `models` + `memory`）、beta.3（`profiles[].models` 各带
provider）、beta.4（`schema_version: 2` 的 `credentials` + `profiles`）都由
`ollupid --import-config` 一次性拆开，主进程每次启动、读配置之前先跑它：

- 所有身份用过的 provider 合成一份目录写进库：同名同账户的合并模型；同名不同账户的
  后来者改名为 `名字-2`，那个身份的选择跟着改。provider 名字不变，旧会话记着的
  `provider/model` 照样能用。
- 每个身份建用户，原来的第一个模型和记忆模型写进它的 settings。
- 名字写进库里的 `users.name`：beta.4 从配置里来，beta.3 从 `userData/profiles.json` 来。
- 0.8.17-beta.10 及以前的 `<home>/profiles.json`：里面的身份都建成库里的用户，名字写进
  `users.name`（颜色不要了），再删掉这个文件。
- beta.5 到 beta.9 的 `config.yaml` 顶层写着 `providers`：整份写进库里的目录，再从文件里
  删掉这一项。
- 原文件留作 `config.yaml.pre-import`，新文件保留其余部分和注释。每一步都能重跑，
  中途断了下次启动接着做。

### 5. 渲染层

- 设置的第一个分类"身份"（现在这样实现）：运营者连接列出所有身份、切换、新建（起名）、改名、删除不在用的；普通连接只看到自己，可以改自己的名字。
- **切换 = 重连**：先清空每个 profile-scoped domain 的 store，再用新 token 连接
  （threads、workspaces、todos、memory、usage、models、read state）。
  `resetForProfile()` 同时清掉当前 conversation、panel、model、environment 和 approval。
- 草稿：`domains/drafts.ts` 的键从 `threadId` 改成 `${profileId}:${threadId}`，
  `NEW_CONVERSATION` 同理；否则 A 的草稿会出现在 B 的输入框里。
- presence：切换时先结束当前 stretch（`presence/record` 的 id 换掉），新连接自动带新 user。
- 新身份的空状态：没有 hub 时引导 `startSuperAgent(profile)`；没有工作区时给“添加文件夹”。
- 通知：标题带身份名（“工作 · 会话完成”），否则分不清是谁的。
- 主题、语言、通知开关保持全局（设备级偏好），不按身份。

## 分阶段

| 阶段 | 内容 | 可验收的结果 |
|---|---|---|
| P1 | （已完成）网关强制身份、token 带身份、config 的 `profiles[]` 声明并在启动时建用户、hub 目录按身份 | 第二个身份有独立的会话、记忆、待办、工作区；hub 目录不撞 |
| P2 | （已完成）侧栏身份菜单（切换/新建/编辑）、主进程按身份签 token、选择记在 `userData/profile.json`、切换即重连、草稿按身份隔离、通知标题带身份 | 界面上能切身份，切完看到的是对方的数据；重启后仍停在原身份 |
| P3 | （已完成）模型目录归部署（存在 ollupi 的库里，运营者经网关 `catalog/set` 改，宿主跟着库的改动换客户端）；身份只在库里选默认模型和记忆模型；身份是库里的用户（带名字），运营者经网关建和改名，token 只认库里已有的身份；旧配置和 `profiles.json` 一次性导入 | 所有身份用同一份模型目录，各自选默认和记忆模型；改目录不中断正在跑的轮次 |

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
