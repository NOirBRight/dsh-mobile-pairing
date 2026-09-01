# Missing official seams

Official DSH is a read-only dependency. This plugin degrades on a clean tag when a seam is absent.

## `Context.connection.authenticatedUrl(baseUrl)`

- **Needed for:** minting the loopback browser-session cookie that alpha.1 requires on every `/api` HTTP request and `/api/remote.mux` WebSocket.
- **Where used:** `src/connection-lifecycle.ts` owns `ctx.inject(['connection'])`; `src/index.ts` supplies the live cookie callbacks.
- **Supported peer range:** `@deepseek-ai/dsh-client-connection >=0.1.2-alpha.1 <0.1.3`. The vendored declaration proves only this verified alpha.1 line, not later 0.x releases.
- **When missing:** the plugin logs a warning and leaves `upstreamCookie` unset. Pairing, Device Token reconnect, Quick Tunnel, and Relay still work; tunneled Host UI against alpha.1 returns 401 until the seam exists.
- **Upstream:** Host Connection transport in `dsh-v0.1.2-alpha.1`. No core patch. If a future tag removes `authenticatedUrl`, keep the degrade path and propose a public cookie-or-token seam.
