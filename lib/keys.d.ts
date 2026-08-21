import type { KeyObject } from 'node:crypto';
/** A loaded (or freshly minted) daemon keypair. */
export interface DaemonKeypair {
    publicKey: KeyObject;
    privateKey: KeyObject;
    /** Raw 32-byte public key, base64url — the value placed into pairing offers. */
    publicKeyBase64Url: string;
    /** Raw 32-byte X25519 public key — NaCl box material (tunnel-protocol.md §2). */
    publicKeyRaw: Uint8Array;
    /** Raw 32-byte X25519 private key — NaCl box material. Never leaves $DSH_HOME. */
    secretKeyRaw: Uint8Array;
}
/**
 * Load the keypair from `path`, or mint and persist one on first run.
 * A missing file creates; a CORRUPT file throws — silently rotating the daemon
 * identity would break every paired device without a trace.
 * @param path - keypair JWK file (written mode 0600).
 * @returns the resident keypair.
 */
export declare function loadOrCreateKeypair(path: string): DaemonKeypair;
