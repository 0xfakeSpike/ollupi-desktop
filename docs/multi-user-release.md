# 发布清单

版本：app `0.8.17-beta.7`，引擎 `v0.28.0`（和 beta.6 相同）。

## 1. 这一版改了什么

只改桌面端界面，引擎和数据都不动：

- 设置、能力、记忆三页同一种排法：标题、160px 的分类、紧挨着的内容列靠左，滚动时分类留在原处；设置一次显示一个分类。
- 设置的第一个分类是「身份」，侧栏原来的身份菜单（切换、新建、编辑、删除不在用的）搬到这里；侧栏底部的设置胶囊带当前身份的圆点。
- 通用：Ollupi、版本和更新合成一块，路径写成 `~/…`。
- 工作区区域色按创建先后分配，六个以内两两不同。
- 连上、就绪不着色；侧栏的连接状态只在没连上时出现；会话行的时间变短（20小时、3天）。

## 2. 引擎

不用动，sidecar 仍钉在 `v0.28.0`：

```bash
grep 0xfakeSpike/ollupi ~/Desktop/yiming/ollupi-desktop/sidecar/go.mod
```

## 3. 打包

```bash
cd ~/Desktop/yiming/ollupi-desktop
pnpm release
```

打完确认二进制是新引擎（第一行要是 v0.28.0，第二行 0 就是没进去）：

```bash
go version -m apps/desktop/release/mac-arm64/Ollupi.app/Contents/Resources/bin/ollupid | grep 0xfakeSpike/ollupi
grep -ac 'movingTo' apps/desktop/release/mac-arm64/Ollupi.app/Contents/Resources/bin/ollupid
```

## 4. 发到 GitHub

```bash
gh release create v0.8.17-beta.7 --prerelease --title "0.8.17-beta.7" --notes-file notes.md <dmg> <zip> latest-mac.yml
```

## 5. 装完自查

- 从 beta.6 升上来：会话、工作区、身份、设置都在。
- 侧栏底部只有记忆、能力、设置一行，设置前是当前身份的圆点；点进去先到「身份」。
- 有两个以上身份时，在「身份」里切换到另一个：仍停在设置，侧栏换成那个身份的会话。
- 设置、能力、记忆在宽窗口里靠左，分类和内容之间没有大片空白。
- 六个以内的工作区颜色两两不同；重启后颜色不变。

## 这版的已知限制

- 身份不是本机上的安全边界：同一 macOS 账户下，各身份的文件互相可读。
- API key 仍明文写在 config.yaml（沙箱里的命令读不到它和数据库）；Keychain 以后再做。
- 工作区、沙箱、skills、slots、飞书的改动仍然重启后端。
