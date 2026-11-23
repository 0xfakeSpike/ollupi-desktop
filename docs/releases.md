# 发版：正式版与测试版

## 版本号

| 类型 | 写法 | 例子 |
| --- | --- | --- |
| 正式版 | `x.y.z` | `0.8.17` |
| 测试版 | `x.y.z-beta.N` | `0.8.17-beta.1` |

- 测试版只属于**下一个**正式版：`0.8.17-beta.1`、`-beta.2`……`0.8.17` 发出之后，下一条测试版用 `0.8.18-beta.1`。
- 严格按 semver 写：`beta` 全小写，序号从 1 起、按数字比较（`beta.10` 比 `beta.9` 新）。
  `-bate`、`-beta1`、`-beta.1.2` 这类变体客户端解析不了——装了它的人会**收不到任何后续更新**。
- `apps/desktop/package.json` 的 `version` 必须与 tag 一致。打包进 `Info.plist` 的 `CFBundleShortVersionString`
  会与 `latest-mac.yml` 里的版本做校验，不一致会拒绝安装。

## 发一版

1. 改 `apps/desktop/package.json` 的 `version`，提交，打 tag：`git tag v0.8.17-beta.1 && git push origin v0.8.17-beta.1`。
2. `pnpm build`：electron-builder 产出 dmg、zip 和 `latest-mac.yml`。
3. 建 Release，tag 用 `v<version>`，上传 dmg / zip / `latest-mac.yml`。
4. **测试版勾上 “Set as a pre-release”，正式版不要勾。**

第 4 步是整套机制的开关。客户端自动检查读的是
`https://github.com/0xfakeSpike/ollupi-desktop/releases/latest/download/latest-mac.yml`，
而 GitHub 的 `releases/latest` 不会指向 pre-release——所以标了 pre-release 的版本，对自动检查是**不存在的**。
用 `gh` 可以少点几下：`gh release create v0.8.17-beta.1 --prerelease <files...>`。

## 客户端看到什么

| 谁 | 什么时候 | 看哪里 | 结果 |
| --- | --- | --- | --- |
| 所有用户 | 启动时、之后每 6 小时 | `releases/latest` 的 `latest-mac.yml` | 只有正式版 |
| 点「检查更新」的人 | 手动 | `/repos/…/releases?per_page=30`，取 semver 最大的（含 beta） | 可能看到 beta |
| 装了 beta 的人 | 自动 | 同上第二行 | 只推**更新的正式版**（`0.8.17` > `0.8.17-beta.2`）；同一版的后续 beta 不会自动推 |
| 装了 beta 的人 | 手动 | 同上 | 能看到后续 beta |

- 列表读不到时（离线、API 限额 60 次/小时，手动检查够用），手动检查退回只看正式版，不报错。
- 手动检查发现的 beta 提示，会在下一次自动检查时被重置（自动检查只报告正式版）；想再看到就再点一次检查。
  已经下载好的版本不会被重置——`ready` 状态下自动检查直接跳过。
- 侧边栏的更新提示只对「比当前版本新」的版本出现；在提示里点「稍后」只作用到当前这次运行。
- 不要给同一个 `v` tag 重传产物：客户端按版本号比较，重传不会被再下载一次，但会让 `latest-mac.yml` 与旧 dmg 对不上。
- 设置里版本行会写明这一点：「自动检查只看正式版；点『检查更新』时也会列出测试版。」

## 发布了新的引擎功能时

桌面打包会从 `sidecar/go.mod` 钉住的**已发布引擎版本**编译 sidecar（`GOWORK=off`），不是本地工作区。
所以引擎侧的新方法、新迁移必须先出去，否则装上去的功能是死的（调用会得到 `-32603`，客户端把它当暂时失败重试）。

顺序：

1. 引擎：提交、`git tag vX.Y.Z`、推 `main` 与 tag。
2. 桌面 `sidecar/`：`GOWORK=off go get github.com/0xfakeSpike/ollupi@vX.Y.Z`，提交 `go.mod` 与 `go.sum`。
   模块代理不可达时用 `GOPROXY=https://goproxy.cn`（本机直连 GitHub 会报 HTTP2 framing error）。
3. 确认拉到的模块真的包含新东西：`ls ~/go/pkg/mod/github.com/0xfake\!spike/ollupi@vX.Y.Z/store/sqlite/migrations/`。
4. 重新 `pnpm release`，打包后对 binary 再确认一次：
   `grep -ac 'presence/record' apps/desktop/release/mac-arm64/Ollupi.app/Contents/Resources/bin/ollupid`
   （换成你要验的方法名，0 就是没进去）。

不要把 `replace` 指到本地目录：CI 和别人的构建都会拿不到那个路径。

## 发布后确认

```bash
# 正式版指针（不带 beta 的版本号）
curl -sI https://github.com/0xfakeSpike/ollupi-desktop/releases/latest/download/latest-mac.yml | grep -i location

# 测试版已经在列表里，并且标了 prerelease
curl -s 'https://api.github.com/repos/0xfakeSpike/ollupi-desktop/releases?per_page=5' | grep -E '"tag_name"|"prerelease"'
```
