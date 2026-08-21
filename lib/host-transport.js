/** Relay-room WebSocket adapter (the M3 wire). Construct once the socket is connected. */
export class WsRelayTransport {
    frameHandler = null;
    closeHandler = null;
    socket;
    constructor(socket) {
        this.socket = socket;
        socket.on('message', (data, isBinary) => {
            this.frameHandler?.(isBinary ? new Uint8Array(data) : data.toString('utf8'));
        });
        socket.on('close', () => this.closeHandler?.());
        socket.on('error', () => { }); // close always follows; the close handler owns the bookkeeping
    }
    send(frame) {
        this.socket.send(frame);
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
