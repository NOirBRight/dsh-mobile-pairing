/**
 * Host relay carrier: Node `ws` already implements send/close/addEventListener,
 * so the host hands that socket to e2e-tunnel's WsFrameTransport. Incoming text
 * is delivered as a string so the session layer can reject it (close 4400).
 */
import { WsFrameTransport } from '@dsh-mobile/e2e-tunnel';
/** Relay-room WebSocket adapter. Binary frames go through e2e-tunnel's codec. */
export class WsRelayTransport extends WsFrameTransport {
    /**
     * @param socket - connected Node `ws` socket for one relay room.
     */
    constructor(socket) {
        // Node `ws` exposes the same send/close/addEventListener surface the adapter
        // reads, but npm-installed typings declare that parameter as the DOM
        // WebSocket, which it is not nominally. The cast follows the installed
        // signature so a caller-side socket swap needs no adapter fork.
        super(socket);
    }
}
