# 多身份这版的发布清单

版本：app `0.8.17-beta.3`，引擎 `v0.26.6`。旧包（beta.2）连不上新后端，必须一起发。

## 1. 引擎先出去

```bash
cd ~/Desktop/yiming/ollupi
git push origin main
git tag v0.26.6 && git push origin v0.26.6
```

这一版引擎收紧身份边界：每个连接必须由一个已有 user id 认证，模型和记忆按 user 解析；
Profile 的名称、颜色和 CRUD 留在 desktop，不进入 gateway。

## 2. 桌面端钉到新引擎

```bash
cd ~/Desktop/yiming/ollupi-desktop/sidecar
GOWORK=off go get github.com/0xfakeSpike/ollupi@v0.26.6
# 代理不通时：GOPROXY=https://goproxy.cn
git add go.mod go.sum && git commit -m "Follow ollupi v0.26.6"
```

确认模块真的带上了新东西（应能看到最新的 0016_usage_provider.sql）：

```bash
ls ~/go/pkg/mod/github.com/0xfake\!spike/ollupi@v0.26.6/store/sqlite/migrations/
```

## 3. 打包

```bash
cd ~/Desktop/yiming/ollupi-desktop
pnpm release
```

打完确认二进制里有新方法（0 就是没进去）：

```bash
grep -ac 'profile:select' apps/desktop/release/mac-arm64/Ollupi.app/Contents/Resources/ollupid 2>/dev/null || true
```

## 4. 发到 GitHub

```bash
gh release create v0.8.17-beta.3 --prerelease --title "0.8.17-beta.3" --notes-file - <<'NOTE'
多身份（profiles）：侧栏底部新增身份菜单，可新建、切换、改名、换色。
每个身份的会话、记忆、待办、工作区、权限和草稿都是自己的。
每个身份有自己的模型与 API key：新建时继承一份，之后在设置 → 模型里各改各的。
记忆按身份用自己的模型学习。
飞书：不同 open_id 可以用 feishu.profiles 映射到不同身份。
升级提示：这一版 config.yaml 统一使用 `profiles[]`；旧配置需要重写。
NOTE
```

## 5. 装完自查

- 侧栏底部能看到身份菜单，显示「我」；能新建一个身份并切过去。
- 新身份里设置 → 模型显示的是它自己的 provider，改 key 不影响第一个身份。
- 切回第一个身份，会话、待办、工作区都还在。
- 飞书按人测试（如果配了 `feishu.profiles`）。

## 这版的已知限制

- 身份不是安全边界：同一 macOS 账户下，数据文件互相可读；真隔离用系统账户。
- 没有「删除身份」「导出/导入」——需求里没有，别当成漏做。
- Profile 的显示名和颜色只保存在 desktop；引擎协议里不会出现 `user/color`。
- 只发 P1–P3 与飞书映射；`docs/multi-user-design.md` 里有分期记录。
