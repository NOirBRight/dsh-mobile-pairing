export const CLOUDFLARED_QUICK_PROVIDER = {
    command: 'cloudflared',
    args: (localGateway) => ['tunnel', '--url', localGateway, '--no-autoupdate'],
};
const QUICK_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/ig;
function publicHttpsEndpoint(value) {
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '')
            return null;
        return url.toString().replace(/\/$/, '');
    }
    catch {
        return null;
    }
}
export class QuickTunnelController {
    child = null;
    currentEndpoint = null;
    currentLocal = null;
    stopping = false;
    options;
    onStatus;
    constructor(options) {
        this.options = options;
        this.onStatus = options.onStatus;
    }
    endpoint() { return this.currentEndpoint; }
    localGateway() { return this.currentLocal; }
    alive() { return this.child !== null && !this.stopping; }
    start(localGateway) {
        if (this.child !== null)
            throw new Error('Quick Tunnel is already running');
        const local = new URL(localGateway);
        if (local.protocol !== 'http:' || !['127.0.0.1', '::1', 'localhost'].includes(local.hostname))
            throw new Error('Quick Tunnel origin must be a loopback HTTP Gateway');
        this.stopping = false;
        this.currentLocal = localGateway;
        this.spawnChild();
    }
    /** Keep the child process; used when the pairing plugin reloads. */
    detach() { }
    /** Bind a new apply's status listener after detach/reuse. */
    reattach(onStatus) { this.onStatus = onStatus; }
    async stop() {
        const child = this.child;
        this.stopping = true;
        this.child = null;
        this.currentEndpoint = null;
        this.currentLocal = null;
        if (child !== null)
            child.kill('SIGTERM');
        this.onStatus({ state: 'stopped' });
    }
    spawnChild() {
        const localGateway = this.currentLocal;
        if (localGateway === null)
            throw new Error('Quick Tunnel origin is missing');
        this.onStatus({ state: 'starting' });
        const provider = this.options.provider ?? CLOUDFLARED_QUICK_PROVIDER;
        const child = this.options.spawn(provider.command, provider.args(localGateway));
        this.child = child;
        let buffered = '';
        const consume = (chunk) => {
            if (this.stopping || this.child !== child)
                return;
            buffered = (buffered + chunk.toString()).slice(-8192);
            for (const match of buffered.matchAll(provider.endpointPattern ?? QUICK_URL)) {
                const endpoint = publicHttpsEndpoint(match[0]);
                if (endpoint === null || endpoint === this.currentEndpoint)
                    continue;
                const previous = this.currentEndpoint;
                this.currentEndpoint = endpoint;
                this.onStatus(previous === null ? { state: 'ready', endpoint } : { state: 'rotated', endpoint, previousEndpoint: previous });
            }
        };
        child.stdout?.on('data', consume);
        child.stderr?.on('data', consume);
        child.once('error', error => {
            if (this.child !== child)
                return;
            this.child = null;
            this.currentEndpoint = null;
            this.onStatus({ state: 'error', error: error.message });
        });
        child.once('exit', (code, signal) => {
            if (this.child !== child)
                return;
            this.child = null;
            if (this.stopping || code === 0) {
                this.currentEndpoint = null;
                this.onStatus({ state: 'stopped' });
                return;
            }
            if (this.options.restartOnUnexpectedExit === true && this.currentLocal !== null) {
                this.spawnChild();
                return;
            }
            this.currentEndpoint = null;
            this.onStatus({ state: 'error', error: 'cloudflared exited ' + (signal ?? code) });
        });
    }
}
