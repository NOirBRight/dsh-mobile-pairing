/** The Sec-WebSocket-Protocol entry carrying the device token: `dsh-mobile.<token>`. */
export declare const WS_AUTH_PREFIX = "dsh-mobile.";
/** What the proxy needs from the device token store. */
export interface TokenAuthenticator {
    /** @param token - plaintext token. @returns truthy for a live token, null otherwise. */
    authenticate(token: string): unknown | null;
}
/** Proxy construction options. */
export interface AuthProxyOptions {
    /** Bind host (LAN side). */
    bind: string;
    /** Bind port; 0 asks the OS. */
    port: number;
    /** Upstream host — loopback in every supported deployment. */
    upstreamHost: string;
    /** Upstream dsh web port. */
    upstreamPort: number;
    /** Device token verifier. */
    tokenStore: TokenAuthenticator;
}
/** A running (or startable) auth proxy. */
export interface AuthProxy {
    /** @returns the listened port, or null until {@link listen} resolves. */
    port(): number | null;
    /** @returns the listened port once bound. */
    listen(): Promise<number>;
    /** Stop listening and destroy every tracked connection. */
    close(): Promise<void>;
}
/**
 * Create the proxy. Nothing binds until {@link AuthProxy.listen}.
 * @param options - see {@link AuthProxyOptions}.
 * @returns the proxy handle.
 */
export declare function createAuthProxy(options: AuthProxyOptions): AuthProxy;
