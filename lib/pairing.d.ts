/** Legacy QR payloads retained only for migration and compatibility. */
export interface LegacyPairingOfferPayload {
    v: 1 | 2 | 3;
    mode: 'lan' | 'relay' | 'direct';
    addr: string;
    room: string | null;
    pubkey: string;
    code: string;
    exp: number;
    /** STUN discovery URLs; TURN is deliberately forbidden in direct mode. */
    ice?: string[];
}
export interface PublicEndpointCapabilities {
    browser: boolean;
    direct: boolean;
    tunnel: boolean;
    endpointRefresh: boolean;
}
/** Current Host-owned Public Endpoint QR payload. */
export interface PublicPairingOfferPayload {
    v: 4;
    mode: 'public';
    protocol: 1;
    endpoint: string;
    endpointKind: 'temporary' | 'custom';
    room: string;
    pubkey: string;
    code: string;
    exp: number;
    capabilities: PublicEndpointCapabilities;
    ice?: string[];
}
export type PairingOfferPayload = LegacyPairingOfferPayload | PublicPairingOfferPayload;
export interface MintPublicOfferOptions {
    endpoint: string;
    endpointKind: 'temporary' | 'custom';
    room: string;
    pubkey: string;
    ice?: string[];
    capabilities?: Partial<PublicEndpointCapabilities>;
}
export type PairingClaimOutcome = {
    status: 'ok';
    deviceToken: string;
} | {
    status: 'expired' | 'unknown';
};
/** Mints one-time, short-lived pairing codes; state is deliberately in-memory (restart rotates). */
export declare class PairingOfferManager {
    private readonly pending;
    private readonly ttlMs;
    /** @param ttlMs - code lifetime in milliseconds. */
    constructor(ttlMs: number);
    /**
     * Mint an offer with a fresh one-time code.
     * @param mode - connection mode the addr describes.
     * @param addr - reachability address (LAN URL or relay WSS URL).
     * @param room - relay room id, null in LAN mode.
     * @param pubkey - daemon Curve25519 public key, base64url.
     * @returns the payload to embed in the QR.
     */
    mint(mode: 'lan' | 'relay' | 'direct', addr: string, room: string | null, pubkey: string, ice?: string[]): PairingOfferPayload;
    /** Mint the current Host-owned Public Endpoint offer. */
    mintPublic(options: MintPublicOfferOptions): PublicPairingOfferPayload;
    /**
     * Burn a code and report the outcome distinctly — the tunnel handshake
     * needs the expired/unknown split for its plaintext error frame (§2.2).
     * One-time: a presented code is consumed whether or not it has expired.
     * @param code - the code from an offer payload.
     * @returns the redemption outcome.
     */
    redeem(code: string): 'ok' | 'expired' | 'unknown';
    /** Inspect an unclaimed code without consuming it. */
    validate(code: string): 'ok' | 'expired' | 'unknown';
    /**
     * Atomically claim a code for one Client Instance. A retry from the same
     * public key receives the same transient token; every other client is
     * rejected. This keeps the offer single-use without making ACK loss fatal.
     */
    claim(code: string, claimant: string, issue: () => string, room?: string): PairingClaimOutcome;
    /**
     * Burn a code and report whether it was still valid. One-time: a presented
     * code is consumed whether or not it has expired.
     * @param code - the code from an offer payload.
     * @returns true only for a live, unexpired code.
     */
    exchange(code: string): boolean;
    private prune;
}
/**
 * Render an offer as the QR target URL; the payload rides the fragment.
 * @param appUrl - mobile shell base URL (any existing fragment is replaced).
 * @param offer - the minted payload.
 * @returns `<appUrl>#offer=<base64url(JSON)>`.
 */
export declare function buildOfferUrl(appUrl: string, offer: PairingOfferPayload): string;
/** Compact v4 wire form keeps dense camera QR codes below the known-good v3 size. */
export declare function buildCompactPublicOfferUrl(appUrl: string, offer: PublicPairingOfferPayload): string;
/**
 * Parse an offer URL back into its payload (test and mobile-shell side).
 * @param url - a URL produced by {@link buildOfferUrl}.
 * @returns the payload, or null when the URL carries no well-formed offer.
 */
export declare function parseOfferUrl(url: string): PairingOfferPayload | null;
