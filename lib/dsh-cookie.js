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
/**
 * Parse an HTTP authority into the bare host accepted by Node network APIs.
 * Brackets are URL syntax and are removed from IPv6 hosts at this boundary.
 * @param authority - host with an optional port, including bracketed IPv6.
 * @returns bare host and a positive port, defaulting to HTTP port 80.
 */
export function parseLoopbackAuthority(authority) {
    if (authority.startsWith('[')) {
        const close = authority.indexOf(']');
        if (close > 0) {
            const port = authority[close + 1] === ':' ? Number(authority.slice(close + 2)) : 80;
            return { host: authority.slice(1, close), port: Number.isFinite(port) && port > 0 ? port : 80 };
        }
    }
    if (authority === '::1')
        return { host: authority, port: 80 };
    const colon = authority.lastIndexOf(':');
    if (colon <= 0)
        return { host: authority, port: 80 };
    const port = Number(authority.slice(colon + 1));
    return { host: authority.slice(0, colon), port: Number.isFinite(port) && port > 0 ? port : 80 };
}
/**
 * Format a host and port for an HTTP or WebSocket URL.
 * @param host - bare Node host, or a bracketed IPv6 host.
 * @param port - network port.
 * @returns URL authority with IPv6 brackets when required.
 */
export function formatLoopbackAuthority(host, port) {
    if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error('dsh-mobile-pairing: loopback port must be an integer from 1 through 65535');
    const bareHost = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
    return bareHost.includes(':') ? '[' + bareHost + ']:' + String(port) : bareHost + ':' + String(port);
}
/**
 * Redact launch-token and cookie values from an acquisition diagnostic.
 * @param error - failure value returned by the HTTP or Connection layer.
 * @returns safe, single-line diagnostic text.
 */
export function redactCookieDiagnostic(error) {
    const text = error instanceof Error ? error.message : String(error);
    return text
        .replace(/([?&](?:token|launchToken|launch-token)=)[^&#\s]*/giu, '$1[redacted]')
        .replace(/((?:cookie|set-cookie)\s*[:=]\s*)[^;\s,]*/giu, '$1[redacted]')
        .replace(/((?:authorization|proxy-authorization)\s*[:=]\s*(?:bearer|basic)\s+)[^\s,;]*/giu, '$1[redacted]')
        .replace(/((?:^|[\s,])(?:dsh-[\w-]+)=)[^;\s,]*/giu, '$1[redacted]')
        .replace(/[\r\n]+/gu, ' ');
}
function header(headers, name) {
    const value = headers[name] ?? headers[name.toLowerCase()];
    if (value === undefined)
        return undefined;
    return Array.isArray(value) ? value[0] : value;
}
function requestOnce(host, port, path, cookie, signal) {
    return new Promise((resolve, reject) => {
        const req = request({
            host,
            port,
            method: 'GET',
            path,
            agent: false,
            timeout: 10_000,
            headers: cookie === undefined ? undefined : { cookie },
            ...(signal === undefined ? {} : { signal }),
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
    let disposed = false;
    const abortController = new AbortController();
    const target = parseLoopbackAuthority(authority);
    async function fetchCookie() {
        if (disposed)
            throw new Error('dsh-mobile-pairing: cookie acquirer is disposed');
        const launch = authenticatedUrl();
        if (launch === undefined)
            throw new Error('dsh-mobile-pairing: connection has no launch-token URL yet');
        const launchUrl = new URL(launch);
        let path = launchUrl.pathname + launchUrl.search;
        let hopCookie = cookie;
        for (let hop = 0; hop < 4; hop++) {
            const res = await requestOnce(target.host, target.port, path, hopCookie, abortController.signal);
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
        async refresh(force = false) {
            if (disposed)
                throw new Error('dsh-mobile-pairing: cookie acquirer is disposed');
            if (!force && cookie !== undefined && Date.now() - acquiredAt < maxAgeMs)
                return cookie;
            if (force) {
                cookie = undefined;
                acquiredAt = 0;
            }
            if (inflight === null) {
                inflight = fetchCookie().then((value) => {
                    if (disposed)
                        throw new Error('dsh-mobile-pairing: cookie acquirer is disposed');
                    cookie = value;
                    acquiredAt = Date.now();
                    return value;
                }).finally(() => { inflight = null; });
            }
            return inflight;
        },
        dispose() {
            if (disposed)
                return;
            disposed = true;
            abortController.abort();
            cookie = undefined;
            acquiredAt = 0;
        },
    };
}
