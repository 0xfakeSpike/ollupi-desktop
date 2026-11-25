# 发布清单

版本：app `0.8.17-beta.21`，引擎 `v0.35.4`。

## 1. 这一版改了什么

beta.21 相对 beta.20（引擎 v0.35.3 → v0.35.4）：

- 待办可以挂在另一个待办下面，最多三层；Super Agent 用 `parent` 记上下级，不再写进标题或备注。桌面的待办面板这一版仍是平铺列表，还不显示层级。
- 数据库迁移 0025：`todos` 加 `parent` 列，已有待办都在顶层。

beta.20 相对 beta.19（引擎 v0.35.2 → v0.35.3）：

- Super Agent（中枢）把互不依赖的调用放在同一次回复里发出，比如列会话、读会话同时进行，不再每个都多花一次模型调用。

beta.19 相对 beta.18（引擎 v0.35.1 → v0.35.2）：

- 协议：正文和思考的流式文字合并成一个 `item/delta` 通知，用 `type` 区分；桌面端跟着改，界面上看不出差别。和 v0.35.1 及更早的 ollupid 不再兼容（收不到流式文字）。
- 定时任务：已归档会话里过期的任务不再挡住别的任务，活跃会话的任务不会再晚最多一分钟才跑。
- 在线时长：按天、工作区、待办分组时不再把在别的应用里的时间算进来。
- 思考条目的结束时间按答案开始流出的时刻算。

beta.18 相对 beta.17：

- 设置改成一整页：各分类依次排下来，每节一个标题和一句说明；左边的分类跟着滚动标出当前所在的一节，点一下滑过去。
- Super Agent 由后端建：点「开始」后，后端在第一个环境旁边的 `super-agent` 文件夹建好中枢（本机就是原来的 `~/.ollupi/super-agent`，已有的中枢不动）；桌面端不再自己算路径、建文件夹，连远程 ollupid 也能开始。别的工作区不能再改成中枢，中枢的文件夹不能移动。

beta.17 相对 beta.16：

- 环境改在设置里管理：新增「环境」页（在「连接」后面），新增、改名、删除环境都在这里；草稿页的环境选择器只用来选新会话在哪个环境跑，不再有"管理环境…"。

beta.16 相对 beta.15（设计见 [workspace-environment-design.md](workspace-environment-design.md)）：

- 每个会话都属于一个工作区：不选项目开的会话放进所在环境的"默认工作区"（scratch 工作区，就是环境自己的文件夹），在侧边栏底部；记忆里不再有"无工作区"这一类，原来的记忆归到默认工作区。
- 文件面板、Git 改动、终端都由后端在工作区所在的环境里执行，不再读这台 Mac 的路径：连远程 ollupid 时这些面板也能用。
- 终端由后端开，经 WebSocket 连过来：关掉面板或窗口后继续跑，再打开显示最近的输出；完全访问，但读不到 `~/.ollupi/data`。
- Git 以人的身份跑（完全访问）；丢弃没提交过的文件移到废纸篓。
- 添加工作区改成弹窗里浏览环境机器上的文件夹（可新建）；移动工作区文件夹在工作区设置里浏览。
- 附件先上传给后端，再在消息里引用。
- 去掉工作区文件的"在访达中显示"和"用默认应用打开"。
- 数据库迁移 0024：给每个环境建默认工作区，没有工作区的会话和"无工作区"的记忆挪进去，删掉 `threads.environment_id`。这一步不可逆，装回 beta.15 读不了新库。

beta.15 相对 beta.14：

- 侧边栏底部改成两行：上一行是平台的模型、用量、能力，下一行是自己的记忆、定时任务、设置；定时任务不再在顶部。
- 模型和用量从设置里拆出来，各是一页；设置只剩这个身份自己的。
- 更新器清理下载目录改用 `rm -rf`。

## 2. 引擎

sidecar 钉在 `v0.35.4`：

```bash
grep 0xfakeSpike/ollupi ~/Desktop/yiming/ollupi-desktop/sidecar/go.mod
ls ~/go/pkg/mod/github.com/0xfake\!spike/ollupi@v0.35.4/store/sqlite/migrations/ | tail -2
```

## 3. 打包

```bash
cd ~/Desktop/yiming/ollupi-desktop
pnpm release
```

打完确认二进制是新的（第一行要是 v0.35.4，后两行 0 就是没进去）：

```bash
go version -m apps/desktop/release/mac-arm64/Ollupi.app/Contents/Resources/bin/ollupid | grep 0xfakeSpike/ollupi
grep -ac 'item/delta' apps/desktop/release/mac-arm64/Ollupi.app/Contents/Resources/bin/ollupid
grep -ac 'terminal/open' apps/desktop/release/mac-arm64/Ollupi.app/Contents/Resources/bin/ollupid
```

## 4. 发到 GitHub

```bash
gh release create v0.8.17-beta.21 --prerelease --title "0.8.17-beta.21" --notes-file notes.md <dmg> <zip> latest-mac.yml
```

## 5. 装完自查

- 让 Super Agent 把一个待办拆成几个子待办：子待办的标题里不带上级，原有待办都还在。
- 让 Super Agent 列出并读几个会话：同一轮里一起调用，不是一个接一个。
- 发一条消息：思考和回答都一个字一个字流出来，结束后和重开会话看到的一样。
- 设置：从上滚到下，左边的分类跟着走；点「权限」滑到最后；侧边栏的设置按钮打开在「身份」。
- 没有 Super Agent 的身份点「开始」，`super-agent` 文件夹建在环境文件夹旁边；已有的中枢照常打开。
- 设置 → 环境：新增一个环境、改名、删掉；草稿页的环境选择器里没有"管理环境…"。
- 升上来之后：工作区、会话都在；原来不属于工作区的会话在侧边栏底部的"默认工作区"里。
- 添加工作区：弹窗里浏览文件夹、新建文件夹、添加。
- 文件面板看 Markdown（相对路径的图片能显示）、PDF；环境面板暂存、提交、丢弃一个新文件（进废纸篓）。
- 终端：关掉面板再开，之前的输出还在；`cat ~/.ollupi/data/store.sqlite` 被拒。
- 发一张粘贴的截图和一个拖进来的文件。
- 连远程 ollupid（同为 v0.35.4）时，上面这些面板都能用。

## 这版的已知限制

- 还没接任何云沙箱，提供方只有这台电脑。
- 身份不是本机上的安全边界：同一 macOS 账户下，各身份的文件互相可读。
- API key 仍明文存在数据库里（沙箱里的命令读不到数据库）。
