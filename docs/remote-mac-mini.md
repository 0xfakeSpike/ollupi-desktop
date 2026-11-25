# 远程模式：把 ollupid 放在家里的 Mac mini 上

ollupid 常驻在家里的 Mac mini 上，通过 Cloudflare Tunnel 暴露一个公网 `https` 地址，在外面用 MacBook 上的 Ollupi 连过去。

```
MacBook 上的 Ollupi
  │  wss://ollupi.example.com/
  │  CF-Access-Client-Id / CF-Access-Client-Secret   ← 第一层：Cloudflare Access 服务令牌
  │  子协议 ollupi.token, <secret>.<profile>           ← 第二层：网关 token
  ▼
Cloudflare 边缘（Access 校验服务令牌）
  ▼
Mac mini 上的 cloudflared（把 Host 改写成 127.0.0.1）
  ▼
ollupid --listen 127.0.0.1:7777
```

鉴权分两层：Cloudflare Access 只放行带对的服务令牌的请求，过了 Access 之后 ollupid 的网关再校验自己的 token。ollupi 不做账号和密码登录。

ollupi 本身不用改：

- 网关只接受 Host 为 `localhost`、`127.0.0.1` 或 `::1` 的请求，所以 cloudflared 要用 `httpHostHeader` 把 Host 改写成 `127.0.0.1`。
- 桌面端页面的 Origin 是 `app://ollupi`，所以 ollupid 启动时要加 `--allow-origin ollupi`。
- 网关每 30 秒 ping 一次，Cloudflare 的 WebSocket 空闲超时大约是 100 秒，连接不会因为空闲被断掉。

下面的例子用 `ollupi.example.com` 当主机名、`7777` 当端口，换成你自己的。

## 1. Mac mini：常驻运行 ollupid

### 准备

1. 二进制：从和 MacBook 上同一个版本的 Ollupi 里拷出来，路径是 `Ollupi.app/Contents/Resources/bin/ollupid`，比如放到 `/usr/local/bin/ollupid`。两边版本要一致，否则协议对不上，界面顶部会提示协议版本不同。
2. 数据目录：比如 `~/.ollupi`。第一次启动时会在里面建数据库，后端不读任何配置文件。
3. 网关 token：生成一个足够长的随机值。

   ```bash
   openssl rand -hex 32
   ```

   token 里不能有 `.`，因为网关在第一个点处把它切开，点前面是密钥，点后面是身份（profile）。十六进制串里不会有点。

### launchd

在 `~/Library/LaunchAgents/com.ollupi.ollupid.plist` 写入下面的内容（把 `<you>` 和 `<token>` 换掉）：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.ollupi.ollupid</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/ollupid</string>
    <string>--home</string>
    <string>/Users/<you>/.ollupi</string>
    <string>--listen</string>
    <string>127.0.0.1:7777</string>
    <string>--allow-origin</string>
    <string>ollupi</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>OLLUPI_GATEWAY_TOKEN</key>
    <string><token></string>
    <key>OLLUPI_OPERATOR_TOKEN</key>
    <string><operator-token></string>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/Users/<you>/Library/Logs/ollupid.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/<you>/Library/Logs/ollupid.log</string>
</dict>
</plist>
```

- 不要加 `--watch-stdin`。这个参数让 ollupid 在 stdin 关闭时退出，是桌面端管理本机 sidecar 时用的；launchd 下 stdin 一开始就是关着的，加了会立即退出。
- `--listen` 只监听 `127.0.0.1`，外面只能经 cloudflared 进来。
- launchd 给的环境很少，agent 跑命令要用到的工具目录需要写进 `PATH`。
- 两个 token 都用随机串（比如 `openssl rand -hex 32`），而且不能相同。`<token>.<身份>` 连上来只是这个身份；`<operator-token>.<身份>` 连上来同时是运营者，可以改所有身份共用的模型，也可以新建身份、给身份改名。只给自己用的那台桌面端填运营者 token，给别人的只给普通 token。
- 第一次启动时库里没有身份，ollupid 会建一个 `default`。别的身份由运营者在 设置 → 身份 里新建，id 是新的 uuid，在那里能看到；token 只认库里已有的身份。
- plist 里有 token 明文，权限收紧：`chmod 600 ~/Library/LaunchAgents/com.ollupi.ollupid.plist`。

加载并启动：

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.ollupi.ollupid.plist
```

改了 plist 之后重新加载：

```bash
launchctl bootout gui/$(id -u)/com.ollupi.ollupid && launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.ollupi.ollupid.plist
```

LaunchAgent 在用户登录后才运行。Mac mini 重启后要能自己起来，需要打开自动登录（开了 FileVault 的话自动登录不可用，重启后要手动登录一次），并在 系统设置 → 能源 里关掉自动睡眠。

### 在 Mac mini 本机验证

```bash
curl -i http://127.0.0.1:7777/healthz
```

返回 `200`。

```bash
curl -i -H "Authorization: Bearer <token>.default" http://127.0.0.1:7777/
```

返回 `426 Upgrade Required`：token 已经通过，只是这不是 WebSocket 请求。返回 `401` 说明 token 不对。

### 模型

模型服务和密钥存在 Mac mini 上 ollupi 的数据库里。用运营者 token 连上的桌面端，在 设置 → 模型 里添加和修改，保存后马上生效，不用重启；用普通 token 连上的只能在已有的模型里选默认。

数据目录里还留着旧版的 `config.yaml` 或 `profiles.json` 的，先在 Mac mini 上跑一次导入：里面的模型和身份搬进数据库，`config.yaml` 删掉。

```bash
/usr/local/bin/ollupid --home ~/.ollupi --import-config
```

## 2. Mac mini：cloudflared

安装 cloudflared 并建一条隧道：

```bash
brew install cloudflared
```

```bash
cloudflared tunnel login
```

```bash
cloudflared tunnel create ollupi
```

```bash
cloudflared tunnel route dns ollupi ollupi.example.com
```

`~/.cloudflared/config.yml`：

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /Users/<you>/.cloudflared/<TUNNEL_ID>.json
ingress:
  - hostname: ollupi.example.com
    service: http://127.0.0.1:7777
    originRequest:
      httpHostHeader: 127.0.0.1
  - service: http_status:404
```

不设置 `httpHostHeader` 的话，网关收到的 Host 是 `ollupi.example.com`，会回 `403 host not allowed`。

先在前台跑一次确认能通，再装成常驻服务：

```bash
cloudflared tunnel run ollupi
```

```bash
cloudflared service install
```

## 3. Cloudflare Zero Trust：Access

1. **服务令牌**：Zero Trust → Access → Service credentials → Service Tokens → Create Service Token。记下 Client ID 和 Client Secret，Secret 只显示这一次。
2. **Access 应用**：Zero Trust → Access → Applications → Add an application → Self-hosted，域名填 `ollupi.example.com`。
3. **策略**：给这个应用加一条策略，Action 选 **Service Auth**，Include 选 **Service Token**，值选第 1 步建的令牌。服务令牌只能通过 Action 为 Service Auth 的策略，用 Allow 不行。

桌面端给发往这个主机的每个请求都带上这两个头，包括附件请求前浏览器自动发的 CORS 预检（OPTIONS），所以不需要打开 Access 的 “Bypass OPTIONS requests”。

### 从外面验证

在 MacBook 上执行：

```bash
curl -i https://ollupi.example.com/healthz
```

不带服务令牌：Access 拦下，返回 `302`（跳转到 `*.cloudflareaccess.com` 登录页）或 `403`。

```bash
curl -i -H "CF-Access-Client-Id: <id>" -H "CF-Access-Client-Secret: <secret>" https://ollupi.example.com/healthz
```

返回 `200`：Access 放行了，请求到了 ollupid。

```bash
curl -i -H "CF-Access-Client-Id: <id>" -H "CF-Access-Client-Secret: <secret>" -H "Authorization: Bearer <token>.default" https://ollupi.example.com/
```

返回 `426`：两层都通过了。

## 4. MacBook：桌面端

设置 → 连接 → 设置，打开「连接远程 ollupid」，填：

| 字段 | 填什么 |
| --- | --- |
| 地址 | `wss://ollupi.example.com` |
| 网关 token | `<token>.<profile>`，比如 `<token>.default`。点后面是在远程上用哪个身份，必须是远程库里已有的；新身份由运营者先建好 |
| Access Client ID / Secret | 第 3 步的服务令牌 |

保存后窗口会刷新并连到远程。连着远程时，本机不运行后端；关掉开关再保存就回到本机的后端。

网关 token 和服务令牌用本机钥匙串（Electron `safeStorage`）加密后存在 `~/Library/Application Support/Ollupi/remote.json`，界面上不会再显示出来，留空表示保持不变。这个文件拷到别的 Mac 上解不开，要重新填。

地址也可以填 `ws://127.0.0.1:<端口>`，用于不经过 Cloudflare、走 SSH 端口转发的情况（`ssh -L 7777:127.0.0.1:7777 macmini`），这时 Access 两项留空。

### 连接失败时界面怎么说

| 界面提示 | 原因 | 查什么 |
| --- | --- | --- |
| Cloudflare Access 拒绝了 …（403） | Access 没放行：服务令牌不对，或者策略没有包含这个令牌 | Client ID / Secret；Access 策略的 Action 是否为 Service Auth |
| … 的网关拒绝了 token（401） | 过了 Access，但网关不认这个 token | 是否和 Mac mini 上的 `OLLUPI_GATEWAY_TOKEN` 或 `OLLUPI_OPERATOR_TOKEN` 一致，后面是否有 `.<profile>` |
| … 的网关拒绝了 Host 头（403 host not allowed） | cloudflared 没有改写 Host | ingress 里的 `originRequest.httpHostHeader: 127.0.0.1` |
| 一直显示「正在重新连接…」 | 主机连不上（隧道断了、网络不通），或者握手时 Origin 被拒 | `cloudflared` 是否在跑；ollupid 是否带了 `--allow-origin ollupi` |

WebSocket 握手失败时，页面只能拿到 1006 这个关闭码。为了区分上面几种情况，连接失败后桌面端会用同样的头对远程的 `/` 发一次普通 GET，按返回的状态码判断是谁拒绝的。401 和 403 不会因为重试而变好，所以遇到它们就停在错误页，不再重连；改完设置后点「重试」或保存设置即可。

## 远程模式下的限制

- 模型服务属于 Mac mini 的数据库，用运营者 token 在桌面端改（见上文“模型”）。桌面端的「设置 → 通用」里打开的数据目录和后端日志都是本机的。
- 身份由网关 token 里的 profile 决定。用运营者 token 时，「设置 → 身份」列出的是远程的身份，可以新建、改名，但切换不会改变连接用的身份；要换身份就改 token 里点后面的部分。用普通 token 时只看到自己。
- 文件面板、终端、Git 改动这些面板操作的是 MacBook 上的路径，而远程工作区的路径在 Mac mini 上，所以这些面板在远程模式下用不上。
- agent 的浏览器工具连的是桌面端的内置浏览器。launchd 启动的 ollupid 没有这个浏览器，浏览器工具用不了。
