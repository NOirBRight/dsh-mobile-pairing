/**
 * Outbound WSS connector to the untrusted relay (docs/tunnel-protocol.md §1,
 * relay/PROTOCOL.md). Joins `<relayUrl>/r/<room>?role=host` and retries with
 * exponential backoff (500 ms → ×2 → 10 s cap, reset on each connect) while
 * shouldRetry() holds — the caller wires that to the offer window extended by
 * live resume tokens (README §M3 interpretations).
 *
 * Socket ownership: a connected socket is handed to the session layer via
 * onSocket and thereafter belongs to it; {@link RelayConnector.close} stops
 * retries and reaps only a pre-handoff socket (one still in connect/wait).
 */
import WebSocket from 'ws';
const BACKOFF_MIN_MS = 500;
const BACKOFF_MAX_MS = 10_000;
/**
 * Create and immediately start a connector.
 * @param options - see {@link RelayConnectorOptions}.
 * @returns the connector handle.
 */
export function createRelayConnector(options) {
    const url = options.relayUrl.replace(/\/+$/, '') + '/r/' + options.room + '?role=host';
    let closed = false;
    let attempts = 0;
    let current = null;
    let handedOff = false;
    let timer = null;
    const log = (msg) => options.logger?.(msg);
    const connect = () => {
        if (closed)
            return;
        handedOff = false;
        const ws = new WebSocket(url);
        current = ws;
        ws.on('open', () => {
            attempts = 0;
            handedOff = true;
            log('relay connector: connected to room ' + options.room.slice(0, 8) + '…');
            options.onSocket(ws);
        });
        ws.on('error', () => { }); // a close event always follows; retry logic lives there
        ws.on('close', (code) => {
            if (current === ws)
                current = null;
            if (closed)
                return;
            if (!options.shouldRetry()) {
                log('relay connector: pairing window ended, stopping');
                return;
            }
            const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** attempts++);
            log('relay connector: disconnected (' + code + '), retry in ' + delay + 'ms');
            timer = setTimeout(connect, delay);
            timer.unref();
        });
    };
    connect();
    return {
        get active() {
            return !closed;
        },
        close() {
            closed = true;
            if (timer !== null)
                clearTimeout(timer);
            if (current !== null && !handedOff)
                current.close();
            current = null;
        },
    };
}
