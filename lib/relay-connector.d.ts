/**
 * Outbound WSS connector to the untrusted relay (docs/tunnel-protocol.md §1,
 * relay/PROTOCOL.md). Joins `<relayUrl>/r/<room>?role=host` and retries with
 * exponential backoff (500 ms → ×2 → 10 s cap, reset on each connect) while
 * shouldRetry() holds — the caller wires that to the offer window extended by
 * live resume tokens (README §M3 interpretations).
 *
 * Socket ownership: a connected socket is handed to the session layer via
 * onSocket. {@link RelayConnector.close} stops retries and closes the current
 * socket so revoke, endpoint migration, and plugin reload can vacate the room.
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
    /** Called once per established socket. close() still terminates this socket. */
    onSocket: (ws: WebSocket) => void;
    /** Optional status logger. */
    logger?: (msg: string) => void;
}
/** A running connector. */
export interface RelayConnector {
    /** @returns whether the connector is still live (not closed). */
    readonly active: boolean;
    /** Stop retrying and close the current host-role socket, including after handoff. */
    close(): void;
}
/**
 * Create and immediately start a connector.
 * @param options - see {@link RelayConnectorOptions}.
 * @returns the connector handle.
 */
export declare function createRelayConnector(options: RelayConnectorOptions): RelayConnector;
