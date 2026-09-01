import { createDshCookieAcquirer, redactCookieDiagnostic } from "./dsh-cookie.js";
/**
 * Bind cookie acquisition to the optional Connection service.
 * @param ctx - parent plugin context that owns the injection fiber.
 * @param baseUrl - loopback URL passed to the Connection launch-token helper.
 * @param authority - loopback authority where DSH issues the cookie.
 * @param retryDelayMs - validated delay before retrying acquisition failures.
 * @returns live cookie accessors backed by the active Connection service.
 */
export function bindConnectionCookie(ctx, baseUrl, authority, retryDelayMs) {
    let cookieAcquirer;
    let retryTimer;
    let refreshSource;
    let refreshPromise;
    const waiters = new Set();
    function clearRetry() {
        if (retryTimer === undefined)
            return;
        clearTimeout(retryTimer);
        retryTimer = undefined;
    }
    function settleWaiters(owner, value) {
        for (const waiter of [...waiters]) {
            if (waiter.owner !== owner)
                continue;
            waiters.delete(waiter);
            waiter.resolve(value);
        }
    }
    function scheduleRetry(current) {
        if (retryTimer !== undefined || cookieAcquirer !== current)
            return;
        retryTimer = setTimeout(() => {
            retryTimer = undefined;
            if (cookieAcquirer === current)
                void acquire(current);
        }, retryDelayMs);
    }
    function acquire(current, force = false) {
        if (cookieAcquirer !== current)
            return Promise.resolve(undefined);
        if (refreshSource === current && refreshPromise !== undefined)
            return refreshPromise;
        refreshSource = current;
        refreshPromise = current.refresh(force).then((value) => {
            if (cookieAcquirer !== current)
                return undefined;
            clearRetry();
            settleWaiters(current, value);
            ctx.logger.info('dsh-mobile-pairing: DSH loopback cookie acquired');
            return value;
        }, (error) => {
            if (cookieAcquirer !== current)
                return undefined;
            ctx.logger.warn('dsh-mobile-pairing: DSH cookie acquisition deferred: ' + redactCookieDiagnostic(error));
            scheduleRetry(current);
            return undefined;
        }).finally(() => {
            if (refreshSource === current) {
                refreshSource = undefined;
                refreshPromise = undefined;
            }
        });
        return refreshPromise;
    }
    function refresh() {
        const current = cookieAcquirer;
        if (current === undefined)
            return;
        clearRetry();
        void acquire(current, true);
    }
    function waitCookie() {
        const current = cookieAcquirer;
        if (current === undefined)
            return Promise.resolve(undefined);
        const cached = current.cookie;
        if (cached !== undefined)
            return acquire(current);
        const promise = new Promise(resolve => waiters.add({ owner: current, resolve }));
        if (refreshSource !== current && retryTimer === undefined)
            void acquire(current);
        return promise;
    }
    ctx.effect(() => {
        const connectionFiber = ctx.inject(['connection'], (connectionCtx) => {
            const connection = connectionCtx.get('connection');
            const current = createDshCookieAcquirer(() => connection.authenticatedUrl(baseUrl), authority);
            return connectionCtx.effect(() => {
                cookieAcquirer = current;
                clearRetry();
                void acquire(current);
                return () => {
                    clearRetry();
                    settleWaiters(current, undefined);
                    current.dispose();
                    if (cookieAcquirer === current)
                        cookieAcquirer = undefined;
                    if (refreshSource === current) {
                        refreshSource = undefined;
                        refreshPromise = undefined;
                    }
                };
            });
        });
        return () => {
            clearRetry();
            connectionFiber.dispose();
        };
    });
    if (ctx.get('connection') === undefined)
        ctx.logger.warn('dsh-mobile-pairing: connection service unavailable; upstream cookie disabled');
    return {
        current: () => cookieAcquirer,
        refresh,
        waitCookie,
    };
}
