/**
 * Transport-neutral frame carrier for the host tunnel endpoint — the seam
 * between the wire and the tunnel session mux in tunnel-server.ts.
 *
 * A HostFrameTransport carries opaque frames both ways. Post-handshake every
 * frame is a sealed session message — nonce(24B) || box(json, peerPub,
 * ownSec); the relay path additionally passes handshake frames and the host's
 * plaintext handshake-phase error frames through the same pipe. A string
 * frame is delivered as a string so the session layer can reject it (text
 * frames are a protocol violation, close 4400).
 *
 * Contract (mirrors the client-side FrameTransport in e2e-tunnel, small on
 * purpose — this is the whole interface a host-side carrier must satisfy):
 *  - send(): one frame, queued in order behind earlier sends.
 *  - onFrame(): single-slot handler; frames arrive in send order.
 *  - onClose(): single-slot; fires once. No frames arrive afterwards.
 *  - close(): initiates close. Code/reason are advisory — carriers without
 *    close codes (RTCDataChannel) ignore them.
 *
 * Adapters: WsRelayTransport (relay room WebSocket, the M3 path; constructed
 * by attachRelaySocket). It shares the Client codec so large sealed frames
 * cross the Relay as bounded messages and reassemble behind this interface.
 * A direct WebRTC DataChannel is attached through attachAuthenticatedTransport
 * with any object satisfying HostFrameTransport.
 */
import { fragmentRelayFrame, RelayFrameReassembler } from '@dsh-mobile/e2e-tunnel';
/** Relay-room WebSocket adapter (the M3 wire). Construct once the socket is connected. */
export class WsRelayTransport {
    frameHandler = null;
    closeHandler = null;
    socket;
    reassembler = new RelayFrameReassembler();
    nextFrameId = 0;
    constructor(socket) {
        this.socket = socket;
        socket.on('message', (data, isBinary) => {
            if (!isBinary) {
                this.frameHandler?.(data.toString('utf8'));
                return;
            }
            try {
                const frame = this.reassembler.push(new Uint8Array(data));
                if (frame !== null)
                    this.frameHandler?.(frame);
            }
            catch {
                this.close(1008, 'bad Relay fragment');
            }
        });
        socket.on('close', () => this.closeHandler?.());
        socket.on('error', () => { }); // close always follows; the close handler owns the bookkeeping
    }
    send(frame) {
        if (typeof frame === 'string') {
            this.socket.send(frame);
            return;
        }
        const messages = fragmentRelayFrame(frame, this.nextFrameId);
        if (messages.length > 1)
            this.nextFrameId = (this.nextFrameId + 1) & 0xffff;
        for (const message of messages)
            this.socket.send(message);
    }
    onFrame(cb) {
        this.frameHandler = cb;
    }
    onClose(cb) {
        this.closeHandler = cb;
    }
    close(code, reason) {
        this.socket.close(code, reason);
    }
}
