export type DeviceClientType = 'android' | 'browser';
/** Ordinary users have no device cap; this is only a pairing-abuse ceiling. */
export declare const MAX_LIVE_DEVICES = 256;
export declare class DeviceLimitError extends Error {
    constructor();
}
/** One paired device as exposed to list/read callers (never carries the hash). */
export interface DeviceRecord {
    id: string;
    label?: string;
    clientType?: DeviceClientType;
    createdAt: number;
    lastSeenAt: number;
    revokedAt: number | null;
    /** Relay room this device paired on; its campaign lives while the device does (protocol §5). */
    room?: string;
}
/** JSON-file-backed device token store with atomic writes. */
export declare class DeviceTokenStore {
    /** The store file path. */
    readonly path: string;
    private devices;
    /** @param path - store file; a missing file starts empty, a corrupt file throws (fail loud). */
    constructor(path: string);
    /**
     * Issue a new device token.
     * @param label - optional human name shown in the device list.
     * @param room - v4 room bound to this authorization.
     * @param claimantPublicKey - Client Instance X25519 public key, base64url.
     * @returns the record id and the plaintext token (this is its only showing).
     */
    issue(label?: string, room?: string, claimantPublicKey?: string, clientType?: DeviceClientType): {
        id: string;
        token: string;
    };
    /** @returns live (non-revoked) device count. */
    liveCount(): number;
    /** @returns whether any live (non-revoked) device is bound to the room. */
    hasLiveForRoom(room: string): boolean;
    /** @returns distinct rooms with at least one live device (for campaign revival at boot). */
    liveRooms(): string[];
    /**
     * Authenticate a presented token.
     * @param token - plaintext bearer/subprotocol token.
     * @param claimantPublicKey - when set, must match the Client Instance that claimed the token.
     * @param room - when set, must match the device's bound room (legacy unbound devices are bound here).
     * @returns the device record, or null for unknown/revoked/mismatched tokens.
     */
    authenticate(token: string, claimantPublicKey?: string, room?: string): DeviceRecord | null;
    /**
     * Revoke a device by id.
     * @param id - record id from {@link list}.
     * @returns whether a live device was found and revoked.
     */
    revoke(id: string): boolean;
    /**
     * Rename a live device. Empty label clears the stored name.
     * @returns whether a live device was found and updated.
     */
    rename(id: string, label: string): boolean;
    /** @returns all devices (including revoked), with token hashes stripped. */
    list(): DeviceRecord[];
    private save;
}
