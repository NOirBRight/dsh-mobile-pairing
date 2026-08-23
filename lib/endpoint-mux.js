/** Front several loopback Host Gateways behind one Public Endpoint origin. */
import { createServer, request as httpRequest } from 'node:http';
const CAPABILITIES = { browser: false, direct: true, tunnel: true, endpointRefresh: true };
export function createEndpointMux(options) {
    if (!['127.0.0.1', '::1', 'localhost'].includes(options.bind))
        throw new Error('Endpoint mux must bind to loopback');
    if (options.backends.length === 0)
        throw new Error('Endpoint mux requires at least one backend port');
    let listenedPort = null;
    const server = createServer((req, res) => { void handleHttp(req, res).catch(() => json(res, 500, { error: 'internal mux error' })); });
    async function handleHttp(req, res) {
        const url = new URL(req.url ?? '/', 'http://mux');
        if (req.method === 'GET' && (url.pathname === '/healthz' || url.pathname === '/capabilities' || url.pathname === '/.well-known/dsh-mobile')) {
            const hostIdentities = [];
            for (const port of options.backends) {
                const identity = await readBackendIdentity(port);
                if (identity !== null && !hostIdentities.includes(identity))
                    hostIdentities.push(identity);
            }
            json(res, 200, {
                protocol: 1,
                hostIdentity: hostIdentities[0] ?? '',
                hostIdentities,
                capabilities: CAPABILITIES,
            });
            return;
        }
        json(res, 404, { error: 'not found' });
    }
    server.on('upgrade', (req, socket, head) => {
        void proxyUpgrade(req, socket, head, options.backends).catch(() => {
            if (!socket.destroyed) {
                socket.write(['HTTP/1.1 502 Bad Gateway', 'connection: close', '', ''].join('\r\n'));
                socket.destroy();
            }
        });
    });
    return {
        port: () => listenedPort,
        listen: () => new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(options.port, options.bind, () => {
                server.off('error', reject);
                listenedPort = server.address().port;
                resolve(listenedPort);
            });
        }),
        close: () => new Promise(resolve => {
            server.close(() => { listenedPort = null; resolve(); });
            server.closeAllConnections();
        }),
    };
}
async function readBackendIdentity(port) {
    try {
        const response = await fetch('http://127.0.0.1:' + port + '/.well-known/dsh-mobile');
        if (!response.ok)
            return null;
        const body = await response.json();
        if (body === null || typeof body !== 'object')
            return null;
        const hostIdentity = body.hostIdentity;
        return typeof hostIdentity === 'string' && hostIdentity !== '' ? hostIdentity : null;
    }
    catch {
        return null;
    }
}
async function proxyUpgrade(req, client, head, backends) {
    for (const port of backends) {
        const outcome = await tryBackendUpgrade(port, req, client, head);
        if (outcome === 'taken')
            return;
        if (outcome === 'busy') {
            if (!client.destroyed) {
                client.write(['HTTP/1.1 409 Conflict', 'connection: close', '', ''].join('\r\n'));
                client.destroy();
            }
            return;
        }
    }
    if (!client.destroyed) {
        client.write(['HTTP/1.1 401 Unauthorized', 'connection: close', '', ''].join('\r\n'));
        client.destroy();
    }
}
function tryBackendUpgrade(port, req, client, head) {
    return new Promise(resolve => {
        const proxy = httpRequest({
            hostname: '127.0.0.1',
            port,
            path: req.url,
            method: req.method,
            headers: req.headers,
        });
        const finish = (outcome) => {
            proxy.destroy();
            resolve(outcome);
        };
        proxy.on('upgrade', (response, backend, backendHead) => {
            const status = response.statusCode ?? 101;
            const reason = response.statusMessage ?? 'Switching Protocols';
            const headers = Object.entries(response.headers).flatMap(([name, value]) => {
                if (value === undefined)
                    return [];
                return (Array.isArray(value) ? value : [value]).map(item => name + ': ' + item);
            });
            client.write(['HTTP/1.1 ' + status + ' ' + reason, ...headers, '', ''].join('\r\n'));
            if (head.length > 0)
                backend.write(head);
            if (backendHead.length > 0)
                client.write(backendHead);
            backend.pipe(client);
            client.pipe(backend);
            resolve('taken');
        });
        proxy.on('response', response => {
            const status = response.statusCode ?? 500;
            response.resume();
            if (status === 409)
                finish('busy');
            else
                finish('skip');
        });
        proxy.on('error', () => finish('skip'));
        proxy.end();
    });
}
function json(res, status, body) {
    if (res.headersSent)
        return;
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
}
