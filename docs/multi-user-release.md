# 发布清单

版本：app `0.8.17-beta.12`，引擎 `v0.33.1`（和 beta.11 相同）。

## 1. 这一版改了什么

- 没有 `config.yaml` 了：后端不读任何配置文件，名字固定为 `ollupi`，系统提示词、工具和槽位都用 ollupi 的默认值。沙箱只禁读 `<home>/data`。
- 升级时 `--import-config` 把旧 `config.yaml` 里的模型、身份、技能搬进数据库，最后删掉这个文件（不留备份）；名字、prompt、工具、slots 的值不保留。
- 设置 → 通用 去掉了 `config.yaml` 一行；后端启动失败的页面去掉了"打开配置"。
- 主进程里导入旧文件、删除身份数据的类改名为 `BackendHome`（`main/backend/home.ts`）。
- 文件面板里 CSV、TSV 文件按表格预览。

## 2. 引擎

sidecar 钉在 `v0.33.1`：

```bash
grep 0xfakeSpike/ollupi ~/Desktop/yiming/ollupi-desktop/sidecar/go.mod
ls ~/go/pkg/mod/github.com/0xfake\!spike/ollupi@v0.33.1/store/sqlite/migrations/ | tail -2
```

## 3. 打包

```bash
cd ~/Desktop/yiming/ollupi-desktop
pnpm release
```

打完确认二进制是新的（第一行要是 v0.33.1，后两行 0 就是没进去）：

```bash
go version -m apps/desktop/release/mac-arm64/Ollupi.app/Contents/Resources/bin/ollupid | grep 0xfakeSpike/ollupi
grep -ac 'main.removeConfig' apps/desktop/release/mac-arm64/Ollupi.app/Contents/Resources/bin/ollupid
grep -ac 'user/create' apps/desktop/release/mac-arm64/Ollupi.app/Contents/Resources/bin/ollupid
```

## 4. 发到 GitHub

```bash
gh release create v0.8.17-beta.12 --prerelease --title "0.8.17-beta.12" --notes-file notes.md <dmg> <zip> latest-mac.yml
```

## 5. 装完自查

- 从 beta.11 升上来：`~/.ollupi/config.yaml` 没有了；模型、身份、技能、会话都在。
- 设置 → 通用 里只有应用日志和数据文件夹两行路径。
- 发一条消息照常回答，agent 能跑命令、改工作区里的文件。

## 这版的已知限制

- 身份不是本机上的安全边界：同一 macOS 账户下，各身份的文件互相可读。
- API key 仍明文存在数据库里（沙箱里的命令读不到数据库）；Keychain 以后再做。
- 技能带的文件只能随导入整体替换，应用里不能单独改。
