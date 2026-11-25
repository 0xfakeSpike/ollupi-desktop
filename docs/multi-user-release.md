# 发布清单

版本：app `0.8.17-beta.10`，引擎 `v0.32.0`（beta.9 是 `v0.31.0`）。

## 1. 这一版改了什么

- 模型目录（提供方、地址、密钥、模型）存在 ollupi 的数据库里，不在 `config.yaml` 里了。只有运营者的连接能读写（`catalog/read`、`catalog/set`，整份替换），用户的连接被拒（`forbidden`）；改了马上生效、不重启，正在跑的轮次用原来的客户端跑完。运营者连接收到 `catalog/changed`，每个连接收到 `model/changed`。
- ollupid 多要一个 `OLLUPI_OPERATOR_TOKEN`，和 `OLLUPI_GATEWAY_TOKEN` 不能相同。`<运营者密钥>.<身份>` 既是这个身份又是运营者，`<网关密钥>.<身份>` 只是这个身份。本机应用用运营者 token 连，所以能改模型；连远程时，填的是运营者 token 才能改，否则 设置 → 模型 只能选默认。
- 升级时 `--import-config` 把 `config.yaml` 里的 `providers` 整份搬进数据库，再从文件里删掉这一项，其余内容和注释保留。之后 `config.yaml` 只剩名字、prompt、工具、slots。
- 应用不再读写 `config.yaml`：`--check-config`、SIGHUP 重载、"文件和运行中的后端不一致"的提示都去掉了。

## 2. 引擎

sidecar 钉在 `v0.32.0`：

```bash
grep 0xfakeSpike/ollupi ~/Desktop/yiming/ollupi-desktop/sidecar/go.mod
ls ~/go/pkg/mod/github.com/0xfake\!spike/ollupi@v0.32.0/store/sqlite/migrations/ | tail -2
```

## 3. 打包

```bash
cd ~/Desktop/yiming/ollupi-desktop
pnpm release
```

打完确认二进制是新的（第一行要是 v0.32.0，后两行 0 就是没进去）：

```bash
go version -m apps/desktop/release/mac-arm64/Ollupi.app/Contents/Resources/bin/ollupid | grep 0xfakeSpike/ollupi
grep -ac 'catalog/set' apps/desktop/release/mac-arm64/Ollupi.app/Contents/Resources/bin/ollupid
grep -ac 'OLLUPI_OPERATOR_TOKEN' apps/desktop/release/mac-arm64/Ollupi.app/Contents/Resources/bin/ollupid
```

## 4. 发到 GitHub

```bash
gh release create v0.8.17-beta.10 --prerelease --title "0.8.17-beta.10" --notes-file notes.md <dmg> <zip> latest-mac.yml
```

## 5. 装完自查

- 从 beta.9 升上来：设置 → 模型 里还是原来的提供方和模型，密钥都在；`config.yaml` 里没有 `providers` 了，其余内容和注释都在。
- 改一个模型（比如打开"支持图片"）保存：卡片马上更新，不重启后端；发一条消息照常回答。
- 新建一个身份切过去：模型和原来的一样，可以给它选自己的默认模型。
- 设置 → 连接 用普通 token 连远程时，模型页只显示列表和星标，说明由运营者添加和修改。

## 这版的已知限制

- 身份不是本机上的安全边界：同一 macOS 账户下，各身份的文件互相可读。
- API key 仍明文存在数据库里（沙箱里的命令读不到数据库）；Keychain 以后再做。
- `config.yaml` 的改动（名字、prompt、工具、slots）仍然要重启后端。
- 技能带的文件只能随导入整体替换，应用里不能单独改。
