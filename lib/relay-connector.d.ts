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
/** Connector construction options. */
export interface RelayConnectorOptions {
    /** Relay WSS base URL (no room suffix). */
    relayUrl: string;
    /** Room id from the relay-mode offer. */
    room: string;
    /** Retry predicate, consulted after every disconnect. */
    shouldRetry: () => boolean;
    /** Called once per established socket; ownership transfers to the callee. */
    onSocket: (ws: WebSocket) => void;
    /** Optional status logger. */
    logger?: (msg: string) => void;
}
/** A running connector. */
export interface RelayConnector {
    /** @returns whether the connector is still live (not closed). */
    readonly active: boolean;
    /** Stop retrying and close a not-yet-handed-off socket; handed-off sockets stay with the session layer. */
    close(): void;
}
/**
 * Create and immediately start a connector.
 * @param options - see {@link RelayConnectorOptions}.
 * @returns the connector handle.
 */
export declare function createRelayConnector(options: RelayConnectorOptions): RelayConnector;
