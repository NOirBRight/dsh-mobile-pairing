/** Public Endpoint parsing and provider-neutral staged external validation. */
import { WebSocket } from 'ws';
export function validateCustomEndpoint(value) {
    let url;
    try {
        url = new URL(value);
    }
    catch {
        throw new Error('Custom Endpoint must be an HTTPS URL');
    }
    if (url.protocol !== 'https:')
        throw new Error('Custom Endpoint must use HTTPS');
    if (url.username !== '' || url.password !== '')
        throw new Error('Custom Endpoint must not contain credentials');
    if (url.search !== '' || url.hash !== '')
        throw new Error('Custom Endpoint must not contain query or fragment data');
    return url.toString().replace(/\/$/, '');
}
/** Validate an opaque Relay WSS base; the Relay never represents a Host identity. */
export function validateRelayEndpoint(value) {
    let url;
    try {
        url = new URL(value);
    }
    catch {
        throw new Error('Relay Endpoint must be a WSS URL');
    }
    if (url.protocol !== 'wss:')
        throw new Error('Relay Endpoint must use WSS');
    if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
        throw new Error('Relay Endpoint must not contain credentials, query, or fragment data');
    }
    return url.toString().replace(/\/$/, '');
}
/** Probe a Relay health endpoint without treating it as a Host Gateway. */
export async function checkRelayEndpoint(value, adapters) {
    let endpoint;
    try {
        endpoint = validateRelayEndpoint(value);
    }
    catch (error) {
        return { ok: false, stage: 'endpoint', error: error.message };
    }
    const health = new URL(endpoint);
    health.protocol = 'https:';
    health.pathname = health.pathname.replace(/\/$/, '') + '/healthz';
    health.search = '';
    health.hash = '';
    try {
        const response = await adapters.fetch(health.toString());
        if (!response.ok)
            return { ok: false, stage: 'relay', error: 'Relay health returned HTTP ' + response.status };
    }
    catch (error) {
        return { ok: false, stage: 'relay', error: String(error.message ?? error) };
    }
    return { ok: true, stage: 'ready' };
}
function capabilities(value) {
    if (value === null || typeof value !== 'object')
        return null;
    const candidate = value;
    if (['browser', 'direct', 'tunnel', 'endpointRefresh'].some(key => typeof candidate[key] !== 'boolean'))
        return null;
    return candidate;
}
export async function checkCustomEndpoint(value, adapters) {
    let endpoint;
    try {
        endpoint = validateCustomEndpoint(value);
    }
    catch (error) {
        return { ok: false, stage: 'endpoint', error: error.message };
    }
    let response;
    try {
        response = await adapters.fetch(endpoint + '/.well-known/dsh-mobile');
    }
    catch (error) {
        return { ok: false, stage: 'tls', error: String(error.message ?? error) };
    }
    if (!response.ok)
        return { ok: false, stage: 'tls', error: 'Gateway health returned HTTP ' + response.status };
    let body;
    try {
        body = await response.json();
    }
    catch {
        return { ok: false, stage: 'identity', error: 'Gateway health response was not JSON' };
    }
    if (body === null || typeof body !== 'object')
        return { ok: false, stage: 'identity', error: 'Gateway identity is missing' };
    const record = body;
    if (record.protocol !== 1)
        return { ok: false, stage: 'protocol', error: 'unsupported Gateway protocol ' + String(record.protocol) };
    if (typeof record.hostIdentity !== 'string')
        return { ok: false, stage: 'identity', error: 'Gateway identity is missing' };
    const listed = Array.isArray(record.hostIdentities) ? record.hostIdentities.filter((value) => typeof value === 'string' && value !== '') : [];
    const hostIdentities = [record.hostIdentity, ...listed.filter(identity => identity !== record.hostIdentity)];
    const caps = capabilities(record.capabilities);
    if (caps === null)
        return { ok: false, stage: 'capabilities', error: 'Gateway capabilities are invalid' };
    if (caps.browser !== false || caps.tunnel !== true || caps.endpointRefresh !== true) {
        return { ok: false, stage: 'capabilities', error: 'Gateway must advertise APK-only tunnel capabilities' };
    }
    const wsUrl = new URL(endpoint);
    wsUrl.protocol = 'wss:';
    wsUrl.pathname = wsUrl.pathname.replace(/\/$/, '') + '/signal/check';
    let socket;
    try {
        socket = await adapters.openWebSocket(wsUrl.toString());
    }
    catch (error) {
        return { ok: false, stage: 'websocket', error: String(error.message ?? error) };
    }
    socket.close();
    return { ok: true, stage: 'ready', hostIdentity: record.hostIdentity, hostIdentities, capabilities: caps };
}
/** Production adapters for Host-side Custom Endpoint checks. Tests inject their own. */
export function createNodeCustomEndpointAdapters(timeoutMs = 8_000) {
    return {
        async fetch(url) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const response = await globalThis.fetch(url, { signal: controller.signal });
                return { ok: response.ok, status: response.status, json: () => response.json() };
            }
            finally {
                clearTimeout(timer);
            }
        },
        openWebSocket(url) {
            return new Promise((resolve, reject) => {
                const socket = new WebSocket(url);
                const timer = setTimeout(() => { socket.terminate(); reject(new Error('WebSocket upgrade timed out')); }, timeoutMs);
                socket.once('open', () => { clearTimeout(timer); resolve({ close() { socket.close(); } }); });
                socket.once('error', error => { clearTimeout(timer); reject(error); });
            });
        },
    };
}
