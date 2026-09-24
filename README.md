# @dsh-mobile/pairing

DSH Mobile 的 Host 插件。正式版可安装在日常 `:3080` 或 lab `:3082` web profile 中；每个 DSH 进程独立提供配对管理、回环 Host Gateway、WebRTC Direct 与加密 Tunnel Fallback。

## Changelog

### 0.1.21

Supports DSH `0.1.7-rc.1` with open-ended Host dependency ranges. Requires `@dsh-mobile/e2e-tunnel@0.1.6` as a non-optional peer. The release package has no Git runtime subdependency; the exact Git tag is retained only as this repository's build dependency. Tunnel is a library, not a DSH bundle, and needs no DSH core changes.

### 0.1.19

Relay reseat keeps the Host in an unexpired QR room when no device is authorized yet. A fresh Host no longer vacates the offer room every 15s before handshake can finish.

### 0.1.17

Empty Relay rooms reseat themselves: a stopped campaign is not reused, plugin dispose vacates Host seats, and live rooms are rechecked on a short interval. `dsh-pair-mux` follows `$DSH_HOME/mobile/gateway-port` via `DSH_PAIR_MUX_BACKEND_HOMES` so `gatewayPort: 0` no longer leaves the mux pointing at dead loopback ports.

### 0.1.16

DSH Host packages are no longer version-locked. `@deepseek-ai/dsh-*` peers are `*` and optional.

## Compatibility

Host integration packages remain optional peers with no upper version bound. The 0.1.21 release also requires `@dsh-mobile/e2e-tunnel@0.1.6` as a non-optional peer; its Git tag is used only by this repository's build. `devDependencies` accept DSH `0.1.7-alpha.2` and later releases; the lock targets `0.1.7-rc.1` with Cordis `4.0.4`. Cordis peers support `>=4.0.4 <5.0.0`. DSH `0.1.7-alpha.2` and `0.1.7-rc.1` are verified in `package.json#dsh.compatibility.dshReleases`; unknown runtimes still follow the best-effort mount path.

Verified Hosts in `package.json#dsh.compatibility.dshReleases` are evidence, not an allowlist. Unknown runtimes warn once and still use the best-effort mount path; only reproduced failures are blocklisted.

## 数据路径

1. Host Gateway 只监听回环地址，提供信令和加密 Tunnel 入口。产品 UI 在 APK 里，Gateway 不提供浏览器 Shell。
2. Quick Tunnel 或手工配置的 Custom Endpoint 将这个有界 Gateway 暴露为 Public Endpoint。
3. GET /pair 铸造五分钟、单次使用的 v4 offer；Android QR 使用 dsh-mobile://pair 深链。
4. Automatic 立刻走加密 Tunnel；同网 Direct 只在短宽限内可以抢赢，迟到的 Direct 不得抢走已打开的 Tunnel。
5. 首配签发的 Device Token 持续有效，直到 Host 侧撤销。

没有 TURN、运行时 CDN 或维护者域名依赖。Tunnel Fallback 可以走用户自己的 Host Public Endpoint，也可以显式选择官方或自托管的加密 Relay。Relay 只转发密文消息；超过旧单帧上限的 sealed frame 由 Client/Host transport 透明分片和重组。

## 在 GUI 中配对

打开 **设置 → 插件 → 插件配置 → DSH Mobile**：

- 展开卡片可查看当前 Public Endpoint 和 Host Identity。
- 二维码只给 Android APK。
- “刷新二维码”会立即铸造新的五分钟单次 offer。
- “打开完整设备管理”还可查看设备、刷新既有设备二维码和执行 Host 侧撤销。

## 配置位置

### v0.1.21 发布包安装

按顺序安装：先把必需的 Tunnel peer 安装为顶级包，再安装 Pairing 发布归档。

~~~sh
dsh plugin --profile web add --force github:NOirBRight/dsh-e2e-tunnel#v0.1.6
dsh plugin --profile web add --force \
  https://github.com/NOirBRight/dsh-mobile-pairing/releases/download/v0.1.21/dsh-mobile-pairing-0.1.21.tgz
~~~

只把 `@dsh-mobile/pairing` 映射到 profile 的 `dsh.profile.bundles`；Tunnel 是 peer 库，没有 `dsh.bundle` entry。包内 `cordis.patch.yml` 会插入 Remote loader；默认配置面向日常 `:3080`：

~~~yaml
- id: dsh-mobile-pairing
  config:
    dshHost: 127.0.0.1
    dshPort: 3080
    gatewayBind: 127.0.0.1
    gatewayPort: 0
~~~

lab profile 使用 `:3082` 时，将该 profile 的配置覆盖为 `dshPort: 3082` 和独立的 `gatewayPort`。产品默认是一台 Host 一个 Gateway（`gatewayPort: 0`）；手机只连接二维码里的 Public Endpoint，不会连到维护者机器。可选的 `dsh-pair-mux` 只跑在操作者自己的 Host 上回环。Gateway 在 listen 后把实际端口写入 `$DSH_HOME/mobile/gateway-port`；mux 通过 `DSH_PAIR_MUX_BACKEND_HOMES` 每次请求重读这些文件，不必把 `gatewayPort: 0` 钉死成历史端口。仍可用 `DSH_PAIR_MUX_BACKENDS` 列出静态端口，两者可并用。

| 键 | 默认 | 说明 |
|---|---|---|
| appUrl | dsh-mobile://pair | Android QR / Deep Link 入口 |
| endpointMode | quick | GUI 只显示 quick（临时地址）和 relay（Relay）；custom 仅作为旧配置兼容模式保留 |
| customEndpointUrl | 无 | 旧 operator overlay 兼容字段；不在当前 GUI 选项中显示 |
| relayUrl | 无 | relay 模式下必填，必须是无凭据的 WSS URL |
| gatewayBind / gatewayPort | 127.0.0.1 / 0 | Host Gateway 始终只允许回环绑定 |
| cloudflaredPath | cloudflared | 默认 Quick Tunnel 可执行文件 |
| quickTunnelCommand / quickTunnelArgs | cloudflared 默认 argv | 可换成 natapp / cpolar / frpc 等能打印 HTTPS URL 的命令 |
| quickTunnelEndpointPattern | trycloudflare.com | 从子进程日志里抽出 HTTPS 端点的正则 |
| stunUrls | [stun:stun.cloudflare.com:3478] | 仅 STUN；TURN/TURNS 会 fail loud |
| dshHost / dshPort | 127.0.0.1 / 3080 | 有界 Gateway 的 DSH 上游；lab 写成 3082 |
| codeTtlMs | 300000 | 首配 offer/code 有效期 |

### Quick Tunnel 其它提供者

默认是 cloudflared。下面只是配置样例，不打进 APK，也不作为产品默认依赖。`{gateway}` 会换成回环 Gateway URL。

~~~yaml
# natapp
quickTunnelCommand: natapp
quickTunnelArgs: ['-authtoken', 'YOUR_TOKEN']
quickTunnelEndpointPattern: 'https://[a-z0-9-]+\\.natapp4?\\.cc\\b'

# cpolar
quickTunnelCommand: cpolar
quickTunnelArgs: ['http', '{gateway}']
quickTunnelEndpointPattern: 'https://[a-z0-9-]+\\.cpolar\\.(?:cn|top)\\b'

# frpc（仅旧 operator overlay 兼容；新用户使用 Relay）
quickTunnelCommand: frpc
quickTunnelArgs: ['-c', '/etc/frp/frpc.toml']
quickTunnelEndpointPattern: 'https://mobile\\.example\\.com\\b'
~~~

### 域名与 Relay

- **临时域名**：endpointMode: quick 自动生成，不能手工固定。
- **旧 Custom Endpoint**：仅为已有 operator overlay 保留兼容，不在当前 GUI 选项中展示；Relay 用户只选择两个预置 Relay 区域。
- **Relay**：选择 endpointMode: relay 并填写 relayUrl。官方区域和 Docker 自托管部署见 [relay/deploy/README.md](../../relay/deploy/README.md)。每个 Client Instance 使用独立 Room。
- dsh.noirbright.top、dshweb.noirbright.top、dshapp.noirbright.top 等个人域名只能作为个人恢复基础设施，不是产品默认值或依赖。

严禁启动共享同一 DSH_HOME 的第二个 DSH 进程来承载本插件。

## 维护边界

- **单一来源**：本仓库是 `@dsh-mobile/pairing` 的唯一来源；`dsh-mobile` 等下游通过已发布的 tag/tarball 消费，不维护第二份源码镜像。
- **设置图标兼容性**：设置导航的远程图标通过临时 DOM patch 替换官方齿轮（官方 `settings.section` 暂无 icon 字段）。这是已接受的临时兼容性限制，Host 导航结构变更时静默回落为默认齿轮，不影响配对与会话功能。

## 验证

~~~sh
npm test
npm run typecheck
npm run build
npm run verify:packed
npm pack --dry-run
~~~

`verify:packed` requires pnpm 11.7.0. It checks the selected executable before installation and fails on any other version; when the default differs, set `PNPM_BIN` to an installed 11.7.0 executable, for example `PNPM_BIN=/absolute/path/to/pnpm.cjs npm run verify:packed`. The offline frozen-lockfile install and SHA-512 package integrity checks remain enabled; do not bypass supply-chain verification.

The gate consumes committed `fixtures/alpha2/tarballs/*.tgz` and `PROVENANCE.json`, which pin clean DSH `dsh-v0.1.7-alpha.2` and e2e-tunnel `v0.1.6` sources plus the Pairing 0.1.21 tarball. The source graph requires Tunnel as a non-optional exact-version peer; the packed Pairing manifest has no Git runtime child. It checks archive safety, hashes, manifests, exports, entry points, and recursive dependency closure, then installs only immutable archives and smoke-tests Host Webserver, Connection, Pairing, and their ModuleLoader client entries. No network or source `node_modules` is required.

## Release

[v0.1.21](https://github.com/NOirBRight/dsh-mobile-pairing/releases/tag/v0.1.21) · [SHA-256](https://github.com/NOirBRight/dsh-mobile-pairing/releases/download/v0.1.21/dsh-mobile-pairing-0.1.21.tgz.sha256)

更新时按上述顺序安装 Tunnel 与 Pairing，然后运行 `dsh plugin --profile web list` 和 `dsh plugin --profile web doctor` 验证。卸载使用 `dsh plugin --profile web remove @dsh-mobile/pairing`。

回滚到 v0.1.20：重新安装 [v0.1.20 发布归档](https://github.com/NOirBRight/dsh-mobile-pairing/releases/download/v0.1.20/dsh-mobile-pairing-0.1.20.tgz)，检查 profile 列表，然后重启 Web 服务。
