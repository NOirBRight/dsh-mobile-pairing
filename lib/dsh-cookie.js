/**
 * DSH browser-session cookie acquisition for the pairing tunnel.
 *
 * alpha.1 requires a signed browser cookie (authority-bound) even on loopback.
 * The phone never sees this value: the plugin mints it once per Host process
 * via the Connection service's launch-token URL, then injects it on every
 * upstream request/WebSocket (see tunnel-server.ts upstreamCookie).
 */
import { request } from 'node:http';
/**
 * Create the cookie acquirer.
 * @param authenticatedUrl - the launch-token URL from Connection.authenticatedUrl(base).
 * @param authority - loopback authority host:port the cookie must bind to.
 * @param maxAgeMs - cookie considered stale after this long; re-acquire then.
 * @returns the acquirer.
 */
export function createDshCookieAcquirer(authenticatedUrl, authority, maxAgeMs = 24 * 60 * 60 * 1000) {
    let cookie = undefined;
    let acquiredAt = 0;
    let inflight = null;
    async function fetchCookie() {
        const url = authenticatedUrl();
        if (url === undefined)
            throw new Error('dsh-mobile-pairing: connection has no launch-token URL yet');
        const u = new URL(url);
        const body = await new Promise((resolve, reject) => {
            const req = request({ host: authority.split(':')[0], port: Number(authority.split(':')[1] ?? 80), method: 'GET', path: u.pathname + u.search, agent: false, timeout: 10_000 }, (res) => {
                try {
                    res.resume();
                    const setCookie = res.headers['set-cookie'];
                    const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
                    if (raw === undefined) {
                        resolve(''); // already authenticated (no set-cookie on 303 to /)
                        return;
                    }
                    resolve(raw.split(';')[0].trim());
                }
                catch (error) {
                    reject(error instanceof Error ? error : new Error(String(error)));
                }
            });
            req.on('error', reject);
            req.on('timeout', () => req.destroy(new Error('cookie acquisition timed out')));
            req.end();
        });
        if (body === '') {
            // No Set-Cookie: the loopback was already cookie-authenticated by an
            // earlier process in this run; fall back to an anonymous request to learn
            // whether a cookie exists at all (it cannot: nothing else mints it here).
            throw new Error('dsh-mobile-pairing: DSH returned no Set-Cookie for launch-token exchange');
        }
        return body;
    }
    return {
        get cookie() { return cookie; },
        async refresh() {
            if (cookie !== undefined && Date.now() - acquiredAt < maxAgeMs)
                return cookie;
            if (inflight === null) {
                inflight = fetchCookie().then((value) => {
                    cookie = value;
                    acquiredAt = Date.now();
                    return value;
                }).finally(() => { inflight = null; });
            }
            return inflight;
        },
    };
}
