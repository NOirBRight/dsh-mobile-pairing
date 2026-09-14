/** Whether a live Relay campaign can keep sitting in this room. */
export function shouldReuseRelayCampaign(previous, relayUrl) {
    return previous !== undefined && previous.relayUrl === relayUrl && previous.connector.active;
}
