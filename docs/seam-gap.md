# Missing official seams

Official DSH is a read-only dependency. This plugin degrades on a clean tag when a seam is absent.

## `Context.connection.authenticatedUrl(baseUrl)`

- **Needed for:** minting the loopback browser-session cookie that alpha.1 requires on every `/api` HTTP request and `/api/remote.mux` WebSocket.
- **Where used:** `src/index.ts` `ctx.inject(['connection'])`, `src/dsh-cookie.ts`.
- **When missing:** the plugin logs a warning and leaves `upstreamCookie` unset. Pairing, Device Token reconnect, Quick Tunnel, and Relay still work; tunneled Host UI against alpha.1 returns 401 until the seam exists.
- **Upstream:** Host Connection transport in `dsh-v0.1.2-alpha.1`. No core patch. If a future tag removes `authenticatedUrl`, keep the degrade path and propose a public cookie-or-token seam.
