/** Own optional Connection-backed cookie acquisition, waiting, retry, and teardown. */
import type { Context } from '@deepseek-ai/cordis';
import { type DshCookieAcquirer } from './dsh-cookie.ts';
export interface ConnectionCookieBinding {
    /** Return the acquirer for the currently active Connection service. */
    current(): DshCookieAcquirer | undefined;
    /** Force a remint for the currently active Connection service. */
    refresh(): void;
    /** Wait until the active Connection has supplied a cookie or is removed. */
    waitCookie(): Promise<string | undefined>;
}
/**
 * Bind cookie acquisition to the optional Connection service.
 * @param ctx - parent plugin context that owns the injection fiber.
 * @param baseUrl - loopback URL passed to the Connection launch-token helper.
 * @param authority - loopback authority where DSH issues the cookie.
 * @param retryDelayMs - validated delay before retrying acquisition failures.
 * @returns live cookie accessors backed by the active Connection service.
 */
export declare function bindConnectionCookie(ctx: Context, baseUrl: string, authority: string, retryDelayMs: number): ConnectionCookieBinding;
