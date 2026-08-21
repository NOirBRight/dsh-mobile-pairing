import type { RTCDataChannel } from 'werift';
export interface DirectSessionDescription {
    type: 'offer' | 'answer';
    sdp: string;
}
export interface DirectIceServer {
    urls: string | string[];
    username?: string;
    credential?: string;
}
export interface DirectHostOptions {
    iceServers?: DirectIceServer[];
}
export interface DirectHostPeer {
    answer: DirectSessionDescription;
    channel: Promise<RTCDataChannel>;
    close(): Promise<void>;
}
/** Accept one browser offer and expose its direct ordered DataChannel. */
export declare function acceptDirectOffer(offer: DirectSessionDescription, options?: DirectHostOptions): Promise<DirectHostPeer>;
