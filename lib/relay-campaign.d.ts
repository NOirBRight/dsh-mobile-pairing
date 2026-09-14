/** Whether a live Relay campaign can keep sitting in this room. */
export declare function shouldReuseRelayCampaign(previous: {
    relayUrl: string;
    connector: {
        active: boolean;
    };
} | undefined, relayUrl: string): boolean;
