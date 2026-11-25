# 发布清单

版本：app `0.8.17-beta.9`，引擎 `v0.31.0`（和 beta.8 相同）。

## 1. 这一版改了什么

- 可以连另一台机器上的 ollupid：设置 → 连接里填 `wss://` 地址（SSH 隧道时可用回环地址上的 `ws://`）、网关令牌 `<secret>.<profile>` 和 Cloudflare Access 的服务令牌。密钥用 safeStorage 封存在 `remote.json`，不回到渲染进程。远程模式下不启动本机 sidecar；主进程只给那一个主机的请求加 `CF-Access-Client-Id`/`Secret`，CSP 的 connect-src 只放行它。连不上时读出是谁拒绝的（401 令牌、403 Access、403 "host not allowed" 是 cloudflared 没改写 Host），停在失败状态并说明原因，不再无限重连。部署见 `docs/remote-mac-mini.md`。
- `config.yaml` 没有 `workspace` 块了：`run_command`、`edit_file`、`write_file` 总是打开，沙箱用引擎默认（工作区可写、不联网、命令默认 30 秒超时，单次最多 600 秒）。启动时 `--import-config` 把旧文件里的这一块删掉，其余内容和注释原样保留。
- 从旧配置里删键（`skills_dir`、`workspace`）时，上方属于前一项的注释段落不再一起丢。

## 2. 引擎

sidecar 钉在 `v0.31.0`：

```bash
grep 0xfakeSpike/ollupi ~/Desktop/yiming/ollupi-desktop/sidecar/go.mod
ls ~/go/pkg/mod/github.com/0xfake\!spike/ollupi@v0.31.0/store/sqlite/migrations/ | tail -2
```

## 3. 打包

```bash
cd ~/Desktop/yiming/ollupi-desktop
pnpm release
```

打完确认二进制是新的（第一行要是 v0.31.0，后两行 0 就是没进去）：

```bash
go version -m apps/desktop/release/mac-arm64/Ollupi.app/Contents/Resources/bin/ollupid | grep 0xfakeSpike/ollupi
grep -ac 'still has a workspace block' apps/desktop/release/mac-arm64/Ollupi.app/Contents/Resources/bin/ollupid
grep -ac 'skill/set' apps/desktop/release/mac-arm64/Ollupi.app/Contents/Resources/bin/ollupid
```

## 4. 发到 GitHub

```bash
gh release create v0.8.17-beta.9 --prerelease --title "0.8.17-beta.9" --notes-file notes.md <dmg> <zip> latest-mac.yml
```

## 5. 装完自查

- 从 beta.8 升上来：会话、工作区、身份、技能、设置都在；`config.yaml` 里没有 `workspace` 块了，其余内容和注释都在。
- 新会话里让 agent 跑一条命令、改一个文件：照常能做，写工作区外面会被沙箱拒绝。
- 设置 → 连接：不填时照常用本机后端；填一个远程地址保存后，窗口重新加载并连上远程；令牌填错时显示是令牌被拒，而不是一直重连。
- 新建一个身份，切过去：能力 → 技能里有自带的配图技能。

## 这版的已知限制

- 身份不是本机上的安全边界：同一 macOS 账户下，各身份的文件互相可读。
- API key 仍明文存在数据库里（沙箱里的命令读不到数据库）；Keychain 以后再做。
- `config.yaml` 的改动（名字、prompt、工具、slots）仍然要重启后端。
- 技能带的文件只能随导入整体替换，应用里不能单独改。
