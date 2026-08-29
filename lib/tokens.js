/**
 * Device token store: the pairing-code → long-lived-token exchange outcome.
 * Tokens are shown once at issue; the file keeps only their SHA-256 hashes,
 * so leaking the store does not leak usable credentials. Revocation is a
 * first-class field from v1 — a leaked token without a revoke path is
 * unrecoverable.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, chmodSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
/** Ordinary users have no device cap; this is only a pairing-abuse ceiling. */
export const MAX_LIVE_DEVICES = 256;
export class DeviceLimitError extends Error {
    constructor() {
        super('dsh-mobile-pairing: device pairing limit reached');
        this.name = 'DeviceLimitError';
    }
}
/** JSON-file-backed device token store with atomic writes. */
export class DeviceTokenStore {
    /** The store file path. */
    path;
    devices;
    /** @param path - store file; a missing file starts empty, a corrupt file throws (fail loud). */
    constructor(path) {
        this.path = path;
        try {
            const parsed = JSON.parse(readFileSync(path, 'utf8'));
            this.devices = Array.isArray(parsed.devices) ? parsed.devices : [];
            if (this.mergeLiveClaimants())
                this.save();
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                this.devices = [];
                return;
            }
            throw new Error(`dsh-mobile-pairing: unreadable device store ${path}: ${String(error)}`);
        }
    }
    /**
     * Issue a new device token.
     * @param label - optional human name shown in the device list.
     * @param room - v4 room bound to this authorization.
     * @param claimantPublicKey - Client Instance X25519 public key, base64url.
     * @returns the record id and the plaintext token (this is its only showing).
     */
    issue(label, room, claimantPublicKey, clientType) {
        if (claimantPublicKey !== undefined && !CLAIMANT.test(claimantPublicKey)) {
            throw new Error('dsh-mobile-pairing: claimant public key must be 32-byte base64url');
        }
        if (this.liveCount() >= MAX_LIVE_DEVICES)
            throw new DeviceLimitError();
        const now = Date.now();
        const token = randomBytes(32).toString('base64url');
        const record = {
            id: randomBytes(8).toString('base64url'),
            label,
            createdAt: now,
            lastSeenAt: now,
            revokedAt: null,
            tokenHash: hash(token),
        };
        if (room !== undefined)
            record.room = room;
        if (claimantPublicKey !== undefined)
            record.claimantPublicKey = claimantPublicKey;
        if (clientType !== undefined)
            record.clientType = clientType;
        this.devices.push(record);
        this.save();
        return { id: record.id, token };
    }
    /**
     * Re-pair an existing Client Instance without creating a second device row.
     * A deliberate scan with a new code rotates the bearer token on the same
     * record and moves that record to the newly advertised room.
     */
    issueOrUpdate(label, room, claimantPublicKey, clientType) {
        if (claimantPublicKey === undefined)
            return this.issue(label, room, undefined, clientType);
        if (!CLAIMANT.test(claimantPublicKey))
            throw new Error('dsh-mobile-pairing: claimant public key must be 32-byte base64url');
        const existing = this.devices.find(device => device.revokedAt === null && device.claimantPublicKey === claimantPublicKey);
        if (existing === undefined)
            return this.issue(label, room, claimantPublicKey, clientType);
        const now = Date.now();
        const token = randomBytes(32).toString('base64url');
        existing.tokenHash = hash(token);
        if (label !== undefined)
            existing.label = label;
        if (room !== undefined)
            existing.room = room;
        if (clientType !== undefined)
            existing.clientType = clientType;
        existing.lastSeenAt = now;
        this.save();
        return { id: existing.id, token };
    }
    /** @returns live (non-revoked) device count. */
    liveCount() {
        return this.devices.filter(device => device.revokedAt === null).length;
    }
    /** @returns whether any live (non-revoked) device is bound to the room. */
    hasLiveForRoom(room) {
        return this.devices.some((d) => d.revokedAt === null && d.room === room);
    }
    /** @returns distinct rooms with at least one live device (for campaign revival at boot). */
    liveRooms() {
        return [...new Set(this.devices.filter((d) => d.revokedAt === null && d.room !== undefined).map((d) => d.room))];
    }
    /**
     * Authenticate a presented token.
     * @param token - plaintext bearer/subprotocol token.
     * @param claimantPublicKey - when set, must match the Client Instance that claimed the token.
     * @param room - when set, the device follows the connection to this room
     *   (legacy unbound devices are bound here). The token plus claimant key
     *   already prove device ownership; a room change is a Quick Tunnel
     *   rotation or an Endpoint refresh, never a new device.
     * @returns the device record, or null for unknown/revoked/mismatched tokens.
     */
    authenticate(token, claimantPublicKey, room, onRoomFollow) {
        const presented = Buffer.from(hash(token));
        for (const device of this.devices) {
            if (device.revokedAt !== null)
                continue;
            const expected = Buffer.from(device.tokenHash);
            if (presented.length !== expected.length || !timingSafeEqual(presented, expected))
                continue;
            if (claimantPublicKey !== undefined) {
                if (device.claimantPublicKey === undefined) {
                    if (!CLAIMANT.test(claimantPublicKey))
                        return null;
                    device.claimantPublicKey = claimantPublicKey;
                }
                else if (!sameText(device.claimantPublicKey, claimantPublicKey)) {
                    return null;
                }
            }
            const previousRoom = device.room;
            if (room !== undefined)
                device.room = room;
            device.lastSeenAt = Date.now();
            this.save();
            if (room !== undefined && previousRoom !== room)
                onRoomFollow?.(previousRoom, room);
            return publicRecord(device);
        }
        return null;
    }
    /**
     * Revoke a device by id.
     * @param id - record id from {@link list}.
     * @returns whether a live device was found and revoked.
     */
    revoke(id) {
        const device = this.devices.find((d) => d.id === id && d.revokedAt === null);
        if (!device)
            return false;
        device.revokedAt = Date.now();
        this.save();
        return true;
    }
    /**
     * Rename a live device. Empty label clears the stored name.
     * @returns whether a live device was found and updated.
     */
    rename(id, label) {
        const device = this.devices.find((d) => d.id === id && d.revokedAt === null);
        if (!device)
            return false;
        const cleaned = label.replace(/[\0-\x1f]/g, '').trim().slice(0, 64);
        if (cleaned === '')
            delete device.label;
        else
            device.label = cleaned;
        this.save();
        return true;
    }
    /** @returns all devices (including revoked), with token hashes stripped. */
    list() {
        return this.devices.map(publicRecord);
    }
    /** Collapse historical duplicate live rows created by older pairing flows. */
    mergeLiveClaimants() {
        const canonical = new Map();
        const next = [];
        let changed = false;
        for (const device of this.devices) {
            if (device.revokedAt !== null || device.claimantPublicKey === undefined) {
                next.push(device);
                continue;
            }
            const prior = canonical.get(device.claimantPublicKey);
            if (prior === undefined) {
                canonical.set(device.claimantPublicKey, device);
                next.push(device);
                continue;
            }
            const winner = prior.lastSeenAt >= device.lastSeenAt ? prior : device;
            const loser = winner === prior ? device : prior;
            winner.createdAt = Math.min(winner.createdAt, loser.createdAt);
            if (winner.label === undefined && loser.label !== undefined)
                winner.label = loser.label;
            if (winner.clientType === undefined && loser.clientType !== undefined)
                winner.clientType = loser.clientType;
            if (winner.room === undefined && loser.room !== undefined)
                winner.room = loser.room;
            if (winner !== prior) {
                const index = next.indexOf(prior);
                if (index >= 0)
                    next[index] = winner;
                canonical.set(device.claimantPublicKey, winner);
            }
            changed = true;
        }
        if (changed)
            this.devices = next;
        return changed;
    }
    save() {
        mkdirSync(dirname(this.path), { recursive: true });
        const tmp = `${this.path}.${process.pid}.tmp`;
        writeFileSync(tmp, JSON.stringify({ devices: this.devices }, null, 2));
        renameSync(tmp, this.path);
        chmodSync(this.path, 0o600);
    }
}
const CLAIMANT = /^[A-Za-z0-9_-]{43}$/;
/** @param token - plaintext token. @returns its SHA-256, base64url. */
function hash(token) {
    return createHash('sha256').update(token).digest('base64url');
}
function publicRecord(device) {
    return {
        id: device.id,
        ...(device.label === undefined ? {} : { label: device.label }),
        ...(device.clientType === undefined ? {} : { clientType: device.clientType }),
        createdAt: device.createdAt,
        lastSeenAt: device.lastSeenAt ?? device.createdAt,
        revokedAt: device.revokedAt,
        ...(device.room === undefined ? {} : { room: device.room }),
    };
}
function sameText(left, right) {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
}
