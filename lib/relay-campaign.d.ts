/** Whether a live Relay campaign can keep sitting in this room. */
export declare function shouldReuseRelayCampaign(previous: {
    relayUrl: string;
    connector: {
        active: boolean;
    };
} | undefined, relayUrl: string): boolean;
/**
 * Whether empty-device reseat must leave a QR-seated campaign in place.
 * @param campaign - Campaign recorded for the room, if any.
 * @param offerStatus - Unclaimed status of that campaign's offer code.
 * @returns True when the Host must stay in the room until the offer expires.
 */
export declare function shouldKeepPendingRelaySeat(campaign: {
    code: string;
} | undefined, offerStatus: 'ok' | 'expired' | 'unknown'): boolean;
