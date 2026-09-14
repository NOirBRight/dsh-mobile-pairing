import WebSocket from 'ws';
import type { HandshakeDeps } from './handshake.ts';
import type { FrameTransport } from '@dsh-mobile/e2e-tunnel';
/** Everything attachRelaySocket needs beyond the socket itself. */
export interface TunnelEndpointOptions {
    /** Upstream dsh web host — loopback in every supported deployment. */
    upstreamHost: string;
    /** Upstream dsh web port. */
    upstreamPort: number;
    /**
     * DSH browser-session cookie (name=value) minted for the loopback
     * authority, injected on every upstream request/WebSocket. Alpha.4
     * requires a cookie even on loopback; the phone never sees this value.
     */
    upstreamCookie?: string | (() => string | undefined);
    /** Handshake inputs (keypair, offers, resume tokens). */
    handshake: HandshakeDeps;
    /** Optional status logger. */
    logger?: (msg: string) => void;
    /** Called once when the socket (and its session) has fully closed. */
    onSessionClose?: () => void;
    /** Fired when upstream HTTP or WebSocket returns 401 so the cookie can be reminted. */
    onUnauthorized?: () => void;
    /** Wait for a loopback cookie before every upstream HTTP request or WebSocket. */
    waitCookie?: () => Promise<string | undefined>;
}
/** Everything attachAuthenticatedTransport needs beyond the carrier and peer key. */
export interface AuthenticatedTunnelOptions {
    /** Upstream dsh web host — loopback in every supported deployment. */
    upstreamHost: string;
    /** Upstream dsh web port. */
    upstreamPort: number;
    /** DSH browser-session cookie (name=value) for the loopback authority. */
    upstreamCookie?: string | (() => string | undefined);
    /** Host X25519 secret key (keypair.secretKeyRaw) that seals/opens session frames. */
    hostSecretKey: Uint8Array;
    /** Optional status logger. */
    logger?: (msg: string) => void;
    /** Called once when the transport (and its session) has fully closed. */
    onSessionClose?: () => void;
    /** Fired when upstream HTTP or WebSocket returns 401 so the cookie can be reminted. */
    onUnauthorized?: () => void;
    /** Wait for a loopback cookie before every upstream HTTP request or WebSocket. */
    waitCookie?: () => Promise<string | undefined>;
}
/** A live gate (pre-handshake) or session (post-handshake) on one carrier. */
export interface RelaySocketGate {
    /** Close the carrier and tear down every upstream bridge and pending request. */
    close(): void;
}
/**
 * Attach the host tunnel endpoint to an already-authenticated frame carrier
 * (e.g. a direct WebRTC DataChannel whose peer was verified out of band).
 * No hello handshake runs: the session starts immediately under peerPub.
 * @param transport - the carrier; see {@link FrameTransport}.
 * @param peerPub - the authenticated peer's X25519 public key (32 bytes).
 * @param options - see {@link AuthenticatedTunnelOptions}.
 * @returns a gate handle; close() is idempotent.
 */
export declare function attachAuthenticatedTransport(transport: FrameTransport, peerPub: Uint8Array, options: AuthenticatedTunnelOptions): RelaySocketGate;
/** Attach a pre-authentication carrier and run the NaCl hello/ack on it. */
export declare function attachHandshakeTransport(transport: FrameTransport, options: TunnelEndpointOptions): RelaySocketGate;
/** Preserve the relay entry point as a thin WebSocket adapter. */
export declare function attachRelaySocket(socket: WebSocket, options: TunnelEndpointOptions): RelaySocketGate;
