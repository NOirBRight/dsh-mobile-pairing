/** Whether a live Relay campaign can keep sitting in this room. */
export function shouldReuseRelayCampaign(previous, relayUrl) {
    return previous !== undefined && previous.relayUrl === relayUrl && previous.connector.active;
}
/**
 * Whether empty-device reseat must leave a QR-seated campaign in place.
 * @param campaign - Campaign recorded for the room, if any.
 * @param offerStatus - Unclaimed status of that campaign's offer code.
 * @returns True when the Host must stay in the room until the offer expires.
 */
export function shouldKeepPendingRelaySeat(campaign, offerStatus) {
    return campaign !== undefined && offerStatus === 'ok';
}
