# 把 ollupi 放在家里的 Mac mini 上

ollupi 服务器（`ollupi serve`）常驻在家里的 Mac mini 上，通过 Cloudflare Tunnel 暴露一个公网 `https` 地址，在外面用 MacBook 上的 Ollupi 连过去。MacBook 上还可以同时注册别的服务器（另一台机器、局域网里的一台、本机自己起的），在设置 → 服务器里切换。

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
Mac mini 上的 ollupi serve --listen 127.0.0.1:7777
```

鉴权分两层：Cloudflare Access 只放行带对的服务令牌的请求，过了 Access 之后 ollupi 的网关再校验自己的 token。ollupi 不做账号和密码登录。

网关只接受 Host 为 `localhost`、`127.0.0.1` 或 `::1` 的请求，所以 cloudflared 要用 `httpHostHeader` 把 Host 改写成 `127.0.0.1`；不改写时用 `--allow-host` 把域名告诉服务器。桌面端页面的 Origin 是 `app://ollupi`，所以服务器要加 `--allow-origin ollupi`。网关每 30 秒 ping 一次，Cloudflare 的 WebSocket 空闲超时大约是 100 秒，连接不会因为空闲被断掉。

下面的例子用 `ollupi.example.com` 当主机名、`7777` 当端口，换成你自己的。

## 1. Mac mini：常驻运行 ollupi

### 准备

1. 二进制：引擎仓库的 `ollupi serve` 就是服务器。装到 `/usr/local/bin/ollupi`：

   ```bash
   go install github.com/0xfakeSpike/ollupi/cmd/ollupi@vX.Y.Z
   ```

   版本用和桌面端同一代的（`ollupi-desktop` 的 `sidecar/go.mod` 里那一行）；两边协议对不上时，界面顶部会提示协议版本不同。

2. 数据目录：比如 `~/.ollupi`。第一次启动时会在里面建数据库。
3. 两个 token：生成足够长的随机值，而且不能相同。

   ```bash
   openssl rand -hex 32   # 网关 token
   openssl rand -hex 32   # 运营者 token
   ```

   token 里不能有 `.`，因为网关在第一个点处把它切开，点前面是密钥，点后面是身份。十六进制串里不会有点。

### launchd

在 `~/Library/LaunchAgents/com.ollupi.ollupi.plist` 写入下面的内容（把 `<you>` 和两个 token 换掉）：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.ollupi.ollupi</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/ollupi</string>
    <string>serve</string>
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
  <string>/Users/<you>/Library/Logs/ollupi.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/<you>/Library/Logs/ollupi.log</string>
</dict>
</plist>
```

- token 从环境变量给，不写在参数里：参数在进程列表里谁都能看到。
- `--listen` 只监听 `127.0.0.1`，外面只能经 cloudflared 进来。
- launchd 给的环境很少，agent 跑命令要用到的工具目录需要写进 `PATH`。
- 两个 token 不能相同。`<token>.<身份>` 连上来只是这个身份；`<operator-token>.<身份>` 连上来同时是运营者，可以改所有身份共用的模型，也可以新建身份、给身份改名。只给自己用的那台桌面端填运营者 token，给别人的只给普通 token。
- 服务器第一次启动、库还是空的，会初始化一个 `admin` 身份（显示名 Admin）；用运营者 token 连 `<operator-token>.admin` 就是管理员。管理员权限来自运营者 token，不是这个身份：同一个 `admin` 用普通 token 连，就只是普通用户。之后别的身份由运营者在 设置 → 身份 里新建，id 是新的 uuid，在那里能看到；token 只认库里已有的身份。
- plist 里有 token 明文，权限收紧：`chmod 600 ~/Library/LaunchAgents/com.ollupi.ollupi.plist`。

加载并启动：

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.ollupi.ollupi.plist
```

改了 plist 之后重新加载：

```bash
launchctl bootout gui/$(id -u)/com.ollupi.ollupi && launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.ollupi.ollupi.plist
```

LaunchAgent 在用户登录后才运行。Mac mini 重启后要能自己起来，需要打开自动登录（开了 FileVault 的话自动登录不可用，重启后要手动登录一次），并在 系统设置 → 能源 里关掉自动睡眠。

### 在 Mac mini 本机验证

```bash
curl -i http://127.0.0.1:7777/healthz
```

返回 `200`。

```bash
curl -i -H "Authorization: Bearer <operator-token>.admin" http://127.0.0.1:7777/
```

返回 `426 Upgrade Required`：token 已经通过，只是这不是 WebSocket 请求。返回 `401` 说明 token 不对，或者身份不存在（新服务器上的身份是 `admin`）。

### 模型

模型服务和密钥存在 Mac mini 上 ollupi 的数据库里。用运营者 token 连上的桌面端，在 设置 → 模型 里添加和修改，保存后马上生效，不用重启；用普通 token 连上的只能在已有的模型里选默认。全新的服务器在有人添加模型之前，新会话发不出去。

数据目录里还留着旧版的 `config.yaml` 或 `profiles.json` 的，先在 Mac mini 上跑一次导入（`ollupid`，从 Ollupi.app 里取）：

```bash
ollupid --home ~/.ollupi --import-config
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

不设置 `httpHostHeader` 的话，网关收到的 Host 是 `ollupi.example.com`，会回 `403 host not allowed`；这时要给 `ollupi serve` 加 `--allow-host ollupi.example.com`。

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

返回 `200`：Access 放行了，请求到了 ollupi。

```bash
curl -i -H "CF-Access-Client-Id: <id>" -H "CF-Access-Client-Secret: <secret>" -H "Authorization: Bearer <operator-token>.admin" https://ollupi.example.com/
```

返回 `426`：两层都通过了。

## 4. MacBook：桌面端

设置 → 服务器 → 添加服务器，填：

| 字段 | 填什么 |
| --- | --- |
| 名称 | 列表里显示的名字，比如「Mac mini」；留空时用地址 |
| 地址 | `wss://ollupi.example.com` |
| 网关 token | `<token>.<profile>`，比如 `<operator-token>.admin`。点后面是在远程上用哪个身份，必须是远程库里已有的（新服务器上是 `admin`）；新身份由运营者先建好 |
| Access Client ID / Secret | 第 3 步的服务令牌 |

保存后它出现在列表里，点「使用」才切过去：窗口会刷新并连到它。连着某个服务器时，本机不运行后端；点「这台 Mac」的使用就回到本机后端。

可以注册多个服务器，随时切换；正在使用的那一个不能移除，先切走再删。列表里第一个「这台 Mac」是应用自带的后端，不能编辑或删除。

网关 token 和服务令牌保存在应用自己的数据库 `~/Library/Application Support/Ollupi/settings.sqlite`（`settings` 表，明文，不再用本机钥匙串），界面上不会再显示出来，留空表示保持不变。旧版本用钥匙串加密的 `servers.json`、`sandbox.json` 和 `remote.json` 不再读取，升级后要重新填一次 token。

地址也可以填 `ws://127.0.0.1:<端口>`，用于不经过 Cloudflare、走 SSH 端口转发的情况（`ssh -L 7777:127.0.0.1:7777 macmini`），或者连接在这台 Mac 上自己起的服务器；这时 Access 两项留空。跨机器直连要 `wss://`：给 `ollupi serve` 配上 `--tls-cert` / `--tls-key` 直接服务 `wss://`，或者走上面的隧道。

### 连接失败时界面怎么说

| 界面提示 | 原因 | 查什么 |
| --- | --- | --- |
| Cloudflare Access 拒绝了 …（403） | Access 没放行：服务令牌不对，或者策略没有包含这个令牌 | Client ID / Secret；Access 策略的 Action 是否为 Service Auth |
| … 的网关拒绝了 token（401） | 过了 Access，但网关不认这个 token：密钥不对，或者身份不存在 | 是否和服务器上的 `OLLUPI_GATEWAY_TOKEN` 或 `OLLUPI_OPERATOR_TOKEN` 一致，后面是否有 `.<profile>`；新服务器上的身份是 `admin` |
| … 的网关拒绝了 Host 头（403 host not allowed） | cloudflared 没有改写 Host，服务器也没放行这个域名 | ingress 里的 `originRequest.httpHostHeader: 127.0.0.1`，或 `--allow-host` |
| 一直显示「正在重新连接…」 | 主机连不上（隧道断了、网络不通），或者握手时 Origin 被拒 | `cloudflared` 是否在跑；`ollupi serve` 是否带了 `--allow-origin ollupi` |

WebSocket 握手失败时，页面只能拿到 1006 这个关闭码。为了区分上面几种情况，连接失败后桌面端会用同样的头对服务器的 `/` 发一次普通 GET，按返回的状态码判断是谁拒绝的。401 和 403 不会因为重试而变好，所以遇到它们就停在错误页，不再重连；改完设置后点「重试」或保存设置即可。设置页进不去时（还没同步过），错误页上的「选择服务器」可以直接换成「这台 Mac」或另一个服务器。

## 远程模式下的限制

- 模型服务属于服务器那台机器的数据库，用运营者 token 在桌面端改（见上文“模型”）。桌面端的「设置 → 通用」里打开的数据目录和后端日志都是本机的。
- 身份由网关 token 里的 profile 决定。用运营者 token 时，「设置 → 身份」列出的是服务器的身份，可以新建、改名，但切换不会改变连接用的身份；要换身份就改 token 里点后面的部分。服务器的身份不能在桌面端删除（删除只对本机后端生效，桌面端会拒绝）。
- `ollupi serve` 起的服务器没有桌面端随包的初始技能（那是桌面端本机后端的东西），新建的身份也不会有；需要就在「能力 → 技能」里导入。
- 文件面板、Git 改动、终端、添加工作区时选文件夹、发附件都经网关在**环境所在的沙箱**里进行，和本机一样能用。沙箱默认是服务器那台机器，后端也可以提供云端沙箱，在「环境」里切换；每个环境是一个独立的沙箱，会话用它开始时的那个。默认沙箱里的终端以运行服务器的用户、完全访问运行，只读不到它的数据目录：能连上这个 ollupi 的人，都能在那台机器上开 shell。
- agent 的浏览器工具连的是桌面端的内置浏览器。launchd 启动的服务器没有这个浏览器，浏览器工具用不了。
