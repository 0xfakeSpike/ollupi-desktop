# 发布清单

版本：app `0.8.17-beta.17`，引擎 `v0.35.0`（和 beta.16 相同）。

## 1. 这一版改了什么

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

sidecar 钉在 `v0.35.0`：

```bash
grep 0xfakeSpike/ollupi ~/Desktop/yiming/ollupi-desktop/sidecar/go.mod
ls ~/go/pkg/mod/github.com/0xfake\!spike/ollupi@v0.35.0/store/sqlite/migrations/ | tail -2
```

## 3. 打包

```bash
cd ~/Desktop/yiming/ollupi-desktop
pnpm release
```

打完确认二进制是新的（第一行要是 v0.35.0，后两行 0 就是没进去）：

```bash
go version -m apps/desktop/release/mac-arm64/Ollupi.app/Contents/Resources/bin/ollupid | grep 0xfakeSpike/ollupi
grep -ac 'scratch_workspaces' apps/desktop/release/mac-arm64/Ollupi.app/Contents/Resources/bin/ollupid
grep -ac 'terminal/open' apps/desktop/release/mac-arm64/Ollupi.app/Contents/Resources/bin/ollupid
```

## 4. 发到 GitHub

```bash
gh release create v0.8.17-beta.17 --prerelease --title "0.8.17-beta.17" --notes-file notes.md <dmg> <zip> latest-mac.yml
```

## 5. 装完自查

- 设置 → 环境：新增一个环境、改名、删掉；草稿页的环境选择器里没有"管理环境…"。
- 升上来之后：工作区、会话都在；原来不属于工作区的会话在侧边栏底部的"默认工作区"里。
- 添加工作区：弹窗里浏览文件夹、新建文件夹、添加。
- 文件面板看 Markdown（相对路径的图片能显示）、PDF；环境面板暂存、提交、丢弃一个新文件（进废纸篓）。
- 终端：关掉面板再开，之前的输出还在；`cat ~/.ollupi/data/store.sqlite` 被拒。
- 发一张粘贴的截图和一个拖进来的文件。
- 连远程 ollupid（同为 v0.35.0）时，上面这些面板都能用。

## 这版的已知限制

- 连远程 ollupid 时 Super Agent 开不起来：它的文件夹建在这台 Mac 上。
- 还没接任何云沙箱，提供方只有这台电脑。
- 身份不是本机上的安全边界：同一 macOS 账户下，各身份的文件互相可读。
- API key 仍明文存在数据库里（沙箱里的命令读不到数据库）。
