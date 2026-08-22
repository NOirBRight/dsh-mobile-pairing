import type { DaemonKeypair } from './keys.ts';
import type { PairingOfferManager } from './pairing.ts';
import { type DeviceTokenStore } from './tokens.ts';
/** clientPub(32) || nonce(24) prefix length of a client handshake frame. */
export declare const HANDSHAKE_PREFIX_BYTES = 56;
/** What the handshake needs: identity, one-time codes, and the device store. */
export interface HandshakeDeps {
    keypair: DaemonKeypair;
    offers: PairingOfferManager;
    devices: DeviceTokenStore;
    /** Human-facing Host name returned inside every sealed acknowledgement. */
    hostName?: string;
    /** Room of the relay campaign this handshake arrived on; bound to newly issued device records. */
    room?: string;
}
/** Handshake result: on success the sealed ack frame to send; on failure the plaintext error frame. */
export type HandshakeOutcome = {
    ok: true;
    peerPub: Uint8Array;
    ackFrame: Uint8Array;
    deviceToken: string | null;
} | {
    ok: false;
    errorFrame: Uint8Array;
    reason: string;
};
/**
 * Process one client handshake frame.
 * @param frame - raw binary frame bytes.
 * @param deps - see {@link HandshakeDeps}.
 * @returns the outcome; the caller sends either frame (and stays seated on failure).
 */
export declare function hostHandshake(frame: Uint8Array, deps: HandshakeDeps): HandshakeOutcome;
