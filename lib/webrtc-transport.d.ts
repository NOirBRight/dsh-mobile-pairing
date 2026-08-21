/** Host adapter from werift's event API to the shared fragmented frame wire. */
import type { RTCDataChannel } from 'werift';
import type { HostFrameTransport } from './host-transport.ts';
/** Uses the exact client codec; no WebRTC message can exceed 60 KiB. */
export declare class WeriftDataChannelTransport implements HostFrameTransport {
    private readonly channel;
    private readonly transport;
    constructor(channel: RTCDataChannel);
    send(frame: Uint8Array | string): void;
    onFrame(cb: (frame: Uint8Array | string) => void): void;
    onClose(cb: () => void): void;
    close(): void;
}
