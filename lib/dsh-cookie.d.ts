/** DSH mints a 30-day host-only cookie; refresh before that window elapses. */
export declare const DSH_COOKIE_MAX_AGE_MS: number;
export interface DshCookieAcquirer {
    /** Current cookie header value (name=value), or undefined before first success. */
    readonly cookie: string | undefined;
    /** (Re)acquire the cookie; force bypasses the current cache after a 401. */
    refresh(force?: boolean): Promise<string>;
    /** Stop pending acquisition and release the acquirer. */
    dispose(): void;
}
/**
 * Parse an HTTP authority into the bare host accepted by Node network APIs.
 * Brackets are URL syntax and are removed from IPv6 hosts at this boundary.
 * @param authority - host with an optional port, including bracketed IPv6.
 * @returns bare host and a positive port, defaulting to HTTP port 80.
 */
export declare function parseLoopbackAuthority(authority: string): {
    host: string;
    port: number;
};
/**
 * Format a host and port for an HTTP or WebSocket URL.
 * @param host - bare Node host, or a bracketed IPv6 host.
 * @param port - network port.
 * @returns URL authority with IPv6 brackets when required.
 */
export declare function formatLoopbackAuthority(host: string, port: number): string;
/**
 * Redact launch-token and cookie values from an acquisition diagnostic.
 * @param error - failure value returned by the HTTP or Connection layer.
 * @returns safe, single-line diagnostic text.
 */
export declare function redactCookieDiagnostic(error: unknown): string;
/**
 * Create the cookie acquirer.
 * @param authenticatedUrl - the launch-token URL from Connection.authenticatedUrl(base).
 * @param authority - loopback authority host:port the cookie must bind to.
 * @param maxAgeMs - cookie considered stale after this long; re-acquire then.
 */
export declare function createDshCookieAcquirer(authenticatedUrl: () => string | undefined, authority: string, maxAgeMs?: number): DshCookieAcquirer;
