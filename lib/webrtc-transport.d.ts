/** Host adapter from werift's event API to the shared fragmented frame wire. */
import type { RTCDataChannel } from 'werift';
import { DataChannelTransport } from '@dsh-mobile/e2e-tunnel';
/** Uses the exact client codec; no WebRTC message can exceed 60 KiB. */
export declare class WeriftDataChannelTransport extends DataChannelTransport {
    /**
     * @param channel - already-open werift data channel (reliable + ordered).
     */
    constructor(channel: RTCDataChannel);
}
