/**
 * DSH browser-session cookie acquisition for the pairing tunnel.
 *
 * alpha.1 requires a signed browser cookie (authority-bound) even on loopback.
 * The phone never sees this value: the plugin mints it via the Connection
 * service's launch-token URL, then injects it on every upstream request /
 * WebSocket. See docs/seam-gap.md for the Connection.authenticatedUrl seam.
 */
import { request } from 'node:http';
/** DSH mints a 30-day host-only cookie; refresh before that window elapses. */
export const DSH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export function parseLoopbackAuthority(authority) {
    const colon = authority.lastIndexOf(':');
    if (colon <= 0)
        return { host: authority, port: 80 };
    const port = Number(authority.slice(colon + 1));
    return { host: authority.slice(0, colon), port: Number.isFinite(port) && port > 0 ? port : 80 };
}
function header(headers, name) {
    const value = headers[name] ?? headers[name.toLowerCase()];
    if (value === undefined)
        return undefined;
    return Array.isArray(value) ? value[0] : value;
}
function requestOnce(host, port, path, cookie) {
    return new Promise((resolve, reject) => {
        const req = request({
            host,
            port,
            method: 'GET',
            path,
            agent: false,
            timeout: 10_000,
            headers: cookie === undefined ? undefined : { cookie },
        }, (res) => {
            res.resume();
            const raw = header(res.headers, 'set-cookie');
            const location = header(res.headers, 'location');
            resolve({
                status: res.statusCode ?? 0,
                ...(raw === undefined ? {} : { setCookie: raw.split(';')[0].trim() }),
                ...(location === undefined ? {} : { location }),
            });
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('cookie acquisition timed out')));
        req.end();
    });
}
/**
 * Create the cookie acquirer.
 * @param authenticatedUrl - the launch-token URL from Connection.authenticatedUrl(base).
 * @param authority - loopback authority host:port the cookie must bind to.
 * @param maxAgeMs - cookie considered stale after this long; re-acquire then.
 */
export function createDshCookieAcquirer(authenticatedUrl, authority, maxAgeMs = DSH_COOKIE_MAX_AGE_MS) {
    let cookie = undefined;
    let acquiredAt = 0;
    let inflight = null;
    const target = parseLoopbackAuthority(authority);
    async function fetchCookie() {
        const launch = authenticatedUrl();
        if (launch === undefined)
            throw new Error('dsh-mobile-pairing: connection has no launch-token URL yet');
        let path = new URL(launch).pathname + new URL(launch).search;
        let hopCookie = cookie;
        for (let hop = 0; hop < 4; hop++) {
            const res = await requestOnce(target.host, target.port, path, hopCookie);
            if (res.setCookie !== undefined && res.setCookie !== '')
                hopCookie = res.setCookie;
            if (res.status >= 300 && res.status < 400 && res.location !== undefined) {
                const next = new URL(res.location, 'http://' + authority);
                path = next.pathname + next.search;
                continue;
            }
            if (hopCookie !== undefined)
                return hopCookie;
            throw new Error('dsh-mobile-pairing: DSH returned no Set-Cookie for launch-token exchange (status ' + String(res.status) + ')');
        }
        if (hopCookie !== undefined)
            return hopCookie;
        throw new Error('dsh-mobile-pairing: DSH launch-token exchange exceeded redirect hop limit');
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
