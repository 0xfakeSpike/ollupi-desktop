# 发布清单

版本：app `0.8.17-beta.11`，引擎 `v0.33.1`（beta.10 是 `v0.32.0`）。

## 1. 这一版改了什么

- 身份就是 ollupi 库里的用户，带名字（迁移 0022 的 `users.name`），没有颜色了。运营者连接经网关 `user/list`、`user/create`、`user/update` 管理身份，改动发 `user/changed`；普通连接只看得到自己，可以给自己改名。
- `~/.ollupi/profiles.json` 没有了：升级时 `--import-config` 把里面的身份和名字搬进库，再删掉文件。主进程只记这台 Mac 选的身份，选的身份不在了就退回库里第一个。
- token 只认库里已有的身份，不再当场开户；全新的数据目录由 sidecar 启动时建第一个身份 `default`，新建的身份由 `gateway.Options.Welcome` 放自带技能。`--delete-profile` 拒绝删最后一个身份。
- 设置 → 身份 去掉了颜色；侧栏的设置按钮换成齿轮图标。
- 引擎 v0.33.1：没有模型的部署 `model/list` 回 `[]` 而不是 `null`（beta.10 在全新数据目录里会因此白屏）。

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
grep -ac 'user/create' apps/desktop/release/mac-arm64/Ollupi.app/Contents/Resources/bin/ollupid
grep -ac 'profiles.json' apps/desktop/release/mac-arm64/Ollupi.app/Contents/Resources/bin/ollupid
```

## 4. 发到 GitHub

```bash
gh release create v0.8.17-beta.11 --prerelease --title "0.8.17-beta.11" --notes-file notes.md <dmg> <zip> latest-mac.yml
```

## 5. 装完自查

- 从 beta.10 升上来：设置 → 身份 里身份和名字都在，没有颜色；`~/.ollupi/profiles.json` 没有了。
- 改一个身份的名字，侧栏和身份列表马上更新；新建一个身份并切过去，能力 → 技能里有自带的配图技能。
- 删除一个不在用的身份；只剩一个身份时删不掉。

## 这版的已知限制

- 身份不是本机上的安全边界：同一 macOS 账户下，各身份的文件互相可读。
- API key 仍明文存在数据库里（沙箱里的命令读不到数据库）；Keychain 以后再做。
- 技能带的文件只能随导入整体替换，应用里不能单独改。
