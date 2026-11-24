# 多身份这版的发布清单

版本：app `0.8.17-beta.5`，引擎 `v0.27.1`。

## 1. 引擎先出去

```bash
cd ~/Desktop/yiming/ollupi
git push origin main
git tag -a v0.27.1 -m "ollupi v0.27.1, the deployment serves the models and each user chooses among them"
git push origin v0.27.1
```

这一版引擎：模型目录归部署（`host.Config.Models`，`host.SetModels` 原地替换），去掉
`host.Config.Users` 和 `host.SetUsers`；用户在 settings 里选新会话默认的模型和学记忆的模型
（迁移 0017 加两列，`settings/update` 的 `model`、`learnModel`）。

## 2. 桌面端钉到新引擎

```bash
cd ~/Desktop/yiming/ollupi-desktop/sidecar
GOWORK=off go get github.com/0xfakeSpike/ollupi@v0.27.1
GOWORK=off go test -tags sqlite_fts5 ./...
```

## 3. 打包

```bash
cd ~/Desktop/yiming/ollupi-desktop
pnpm release
```

打完确认二进制里有新东西（0 就是没进去）：

```bash
grep -ac 'import-config' apps/desktop/release/mac-arm64/Ollupi.app/Contents/Resources/bin/ollupid
grep -ac 'learnModel' apps/desktop/release/mac-arm64/Ollupi.app/Contents/Resources/bin/ollupid
```

## 4. 发到 GitHub

```bash
gh release create v0.8.17-beta.5 --prerelease --title "0.8.17-beta.5" --notes-file notes.md <dmg> <zip> latest-mac.yml
```

## 5. 装完自查

- 首次启动后 `~/.ollupi/config.yaml` 只有 `providers` 和部署设置，没有 `credentials`、`profiles`、
  `schema_version`；旁边有 `config.yaml.pre-import`，`~/.ollupi/profiles.json` 里身份的名称和颜色还在。
- 每个身份的模型选择器列出全部模型，默认的还是它原来的第一个模型；记忆页的学习模型还是原来那个。
- 设置 → 模型里加一个模型：后端不重启，所有身份的模型选择器里马上能选到。
- 星标一个模型，再切到别的身份：那个身份的默认不变。
- 新建身份并切过去：会话、工作区是空的，模型照常能用。

## 这版的已知限制

- 身份不是本机上的安全边界：同一 macOS 账户下，各身份的文件互相可读。
- API key 仍明文写在 config.yaml（沙箱里的命令读不到它和数据库）；Keychain 以后再做。
- 工作区、沙箱、skills、slots、飞书的改动仍然重启后端。
