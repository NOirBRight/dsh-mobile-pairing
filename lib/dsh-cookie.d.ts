/** DSH mints a 30-day host-only cookie; refresh before that window elapses. */
export declare const DSH_COOKIE_MAX_AGE_MS: number;
export interface DshCookieAcquirer {
    /** Current cookie header value (name=value), or undefined before first success. */
    readonly cookie: string | undefined;
    /** (Re)acquire the cookie; throws on failure so callers can decide. */
    refresh(): Promise<string>;
}
export declare function parseLoopbackAuthority(authority: string): {
    host: string;
    port: number;
};
/**
 * Create the cookie acquirer.
 * @param authenticatedUrl - the launch-token URL from Connection.authenticatedUrl(base).
 * @param authority - loopback authority host:port the cookie must bind to.
 * @param maxAgeMs - cookie considered stale after this long; re-acquire then.
 */
export declare function createDshCookieAcquirer(authenticatedUrl: () => string | undefined, authority: string, maxAgeMs?: number): DshCookieAcquirer;
