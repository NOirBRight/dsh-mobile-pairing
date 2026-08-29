import type WebSocket from 'ws';
/** The frame pipe a host tunnel session (or relay gate) rides. See the module header for the contract. */
export interface HostFrameTransport {
    send(frame: Uint8Array | string): void;
    onFrame(cb: (frame: Uint8Array | string) => void): void;
    onClose(cb: () => void): void;
    close(code?: number, reason?: string): void;
}
/** Relay-room WebSocket adapter (the M3 wire). Construct once the socket is connected. */
export declare class WsRelayTransport implements HostFrameTransport {
    private frameHandler;
    private closeHandler;
    private readonly socket;
    private readonly reassembler;
    private nextFrameId;
    constructor(socket: WebSocket);
    send(frame: Uint8Array | string): void;
    onFrame(cb: (frame: Uint8Array | string) => void): void;
    onClose(cb: () => void): void;
    close(code?: number, reason?: string): void;
}
