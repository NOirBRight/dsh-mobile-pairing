/**
 * Host relay carrier: Node `ws` already implements send/close/addEventListener,
 * so the host hands that socket to e2e-tunnel's WsFrameTransport. Incoming text
 * is delivered as a string so the session layer can reject it (close 4400).
 */
import { WsFrameTransport, type FrameTransport } from '@dsh-mobile/e2e-tunnel';
import type WebSocket from 'ws';
export type { FrameTransport as HostFrameTransport };
/** Relay-room WebSocket adapter. Binary frames go through e2e-tunnel's codec. */
export declare class WsRelayTransport extends WsFrameTransport {
    /**
     * @param socket - connected Node `ws` socket for one relay room.
     */
    constructor(socket: WebSocket);
}
