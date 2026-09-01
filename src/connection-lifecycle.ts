/** Own optional Connection-backed cookie acquisition, waiting, retry, and teardown. */
import type { Context } from '@deepseek-ai/cordis'
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import { createDshCookieAcquirer, redactCookieDiagnostic, type DshCookieAcquirer } from './dsh-cookie.ts'

export interface ConnectionCookieBinding {
  /** Return the acquirer for the currently active Connection service. */
  current(): DshCookieAcquirer | undefined
  /** Force a remint for the currently active Connection service. */
  refresh(): void
  /** Wait until the active Connection has supplied a cookie or is removed. */
  waitCookie(): Promise<string | undefined>
}

interface CookieWaiter {
  owner: DshCookieAcquirer
  resolve(value: string | undefined): void
}

/**
 * Bind cookie acquisition to the optional Connection service.
 * @param ctx - parent plugin context that owns the injection fiber.
 * @param baseUrl - loopback URL passed to the Connection launch-token helper.
 * @param authority - loopback authority where DSH issues the cookie.
 * @param retryDelayMs - validated delay before retrying acquisition failures.
 * @returns live cookie accessors backed by the active Connection service.
 */
export function bindConnectionCookie(ctx: Context, baseUrl: string, authority: string, retryDelayMs: number): ConnectionCookieBinding {
  let cookieAcquirer: DshCookieAcquirer | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let refreshSource: DshCookieAcquirer | undefined
  let refreshPromise: Promise<string | undefined> | undefined
  const waiters = new Set<CookieWaiter>()

  function clearRetry(): void {
    if (retryTimer === undefined) return
    clearTimeout(retryTimer)
    retryTimer = undefined
  }

  function settleWaiters(owner: DshCookieAcquirer, value: string | undefined): void {
    for (const waiter of [...waiters]) {
      if (waiter.owner !== owner) continue
      waiters.delete(waiter)
      waiter.resolve(value)
    }
  }

  function scheduleRetry(current: DshCookieAcquirer): void {
    if (retryTimer !== undefined || cookieAcquirer !== current) return
    retryTimer = setTimeout(() => {
      retryTimer = undefined
      if (cookieAcquirer === current) void acquire(current)
    }, retryDelayMs)
  }

  function acquire(current: DshCookieAcquirer, force = false): Promise<string | undefined> {
    if (cookieAcquirer !== current) return Promise.resolve(undefined)
    if (refreshSource === current && refreshPromise !== undefined) return refreshPromise
    refreshSource = current
    refreshPromise = current.refresh(force).then(
      (value) => {
        if (cookieAcquirer !== current) return undefined
        clearRetry()
        settleWaiters(current, value)
        ctx.logger.info('dsh-mobile-pairing: DSH loopback cookie acquired')
        return value
      },
      (error: unknown) => {
        if (cookieAcquirer !== current) return undefined
        ctx.logger.warn('dsh-mobile-pairing: DSH cookie acquisition deferred: ' + redactCookieDiagnostic(error))
        scheduleRetry(current)
        return undefined
      },
    ).finally(() => {
      if (refreshSource === current) {
        refreshSource = undefined
        refreshPromise = undefined
      }
    })
    return refreshPromise
  }

  function refresh(): void {
    const current = cookieAcquirer
    if (current === undefined) return
    clearRetry()
    void acquire(current, true)
  }

  function waitCookie(): Promise<string | undefined> {
    const current = cookieAcquirer
    if (current === undefined) return Promise.resolve(undefined)
    const cached = current.cookie
    if (cached !== undefined) return acquire(current)
    const promise = new Promise<string | undefined>(resolve => waiters.add({ owner: current, resolve }))
    if (refreshSource !== current && retryTimer === undefined) void acquire(current)
    return promise
  }

  ctx.effect(() => {
    const connectionFiber = ctx.inject(['connection'], (connectionCtx) => {
      const connection = connectionCtx.get('connection') as HostConnectionHandle
      const current = createDshCookieAcquirer(() => connection.authenticatedUrl(baseUrl), authority)
      return connectionCtx.effect(() => {
        cookieAcquirer = current
        clearRetry()
        void acquire(current)
        return () => {
          clearRetry()
          settleWaiters(current, undefined)
          current.dispose()
          if (cookieAcquirer === current) cookieAcquirer = undefined
          if (refreshSource === current) {
            refreshSource = undefined
            refreshPromise = undefined
          }
        }
      })
    })
    return () => {
      clearRetry()
      connectionFiber.dispose()
    }
  })
  if (ctx.get('connection') === undefined) ctx.logger.warn('dsh-mobile-pairing: connection service unavailable; upstream cookie disabled')

  return {
    current: () => cookieAcquirer,
    refresh,
    waitCookie,
  }
}
