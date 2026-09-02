# Missing official seams

Official DSH is a read-only dependency. This plugin degrades on a clean tag when a seam is absent.

## `Context.connection.authenticatedUrl(baseUrl)`

- **Needed for:** minting the loopback browser-session cookie that Alpha.4 requires on every `/api` HTTP request and `/api/remote.mux` WebSocket.
- **Where used:** `src/connection-lifecycle.ts` owns `ctx.inject(['connection'])`; `src/index.ts` supplies the live cookie callbacks.
- **Supported peer:** `@deepseek-ai/dsh-client-connection 0.1.2-alpha.4`. The Alpha.4 declaration is the only supported line.
- **When missing:** the plugin logs a warning and leaves `upstreamCookie` unset. Pairing, Device Token reconnect, Quick Tunnel, and Relay still work; tunneled Host UI returns 401 until the seam exists.
- **Upstream:** Host Connection transport in `dsh-v0.1.2-alpha.4`. No core patch. If a future tag removes `authenticatedUrl`, keep the degrade path and propose a public cookie-or-token seam.
