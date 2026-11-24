# 多身份这版的发布清单

版本：app `0.8.17-beta.4`，引擎 `v0.27.0`。

## 1. 引擎先出去

```bash
cd ~/Desktop/yiming/ollupi
git push origin main
git tag -a v0.27.0 -m "ollupi v0.27.0, models swap in place, users can be deleted, recall follows the request"
git push origin v0.27.0
```

这一版引擎：`host.SetUsers` 原地替换各用户的模型；`Tx.DeleteUser` 删除一个空闲用户的全部数据；
自动记忆召回按本轮请求的相关性排序。

## 2. 桌面端钉到新引擎

```bash
cd ~/Desktop/yiming/ollupi-desktop/sidecar
GOWORK=off go get github.com/0xfakeSpike/ollupi@v0.27.0
GOWORK=off go test -tags sqlite_fts5 ./...
```

## 3. 打包

```bash
cd ~/Desktop/yiming/ollupi-desktop
pnpm release
```

打完确认二进制里有新方法（0 就是没进去）：

```bash
grep -ac 'delete-profile' apps/desktop/release/mac-arm64/Ollupi.app/Contents/Resources/ollupid 2>/dev/null || true
```

## 4. 发到 GitHub

```bash
gh release create v0.8.17-beta.4 --prerelease --title "0.8.17-beta.4" --notes-file - <<'NOTE'
多个身份共用同一个 API key 时，共用同一套并发限制，不再各自跑满。
config.yaml 有了版本号（schema v2）：API 账户写在 credentials[]，身份从中选择模型。
旧配置首次启动时自动转换，原文件备份为 config.yaml.pre-v2；beta.3 的身份名称和颜色一并迁入。
改模型、API key、记忆模型或新建身份不再重启后端，运行中的会话不受影响。
可以删除身份（菜单 → 删除这个身份），连同它的会话、记忆、待办和文件。
自动注入的记忆按当前请求挑选相关的，不再只看最近更新。
“全局记忆”改称“此身份的所有会话”。
NOTE
```

## 5. 装完自查

- 首次启动后 `~/.ollupi/config.yaml` 带 `schema_version: 2`，旁边有 `config.yaml.pre-v2`；身份名称和颜色还在。
- 设置 → 模型里加一个模型：后端不重启，模型选择器里马上能选到。
- 新建身份并切过去；再切回来删除它，它的会话和记忆都不见了。

## 这版的已知限制

- 身份不是本机上的安全边界：同一 macOS 账户下，各身份的文件互相可读。按身份分的 Box
  是为云部署准备的调用边界。
- API key 仍明文写在 config.yaml；Keychain 以后再做。
- 工作区、沙箱、skills、slots、飞书的改动仍然重启后端。
