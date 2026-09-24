import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionFetchRoute, HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import type { WebRoute, WebServer } from '@deepseek-ai/dsh-host-webserver'

export type PairingAdminRoute = Pick<WebRoute, 'path' | 'handler'>

/** Connection.fetch registers the full absolute path, including its authenticated `/api` carrier. */
export const REMOTE_SETTINGS_ROUTES = {
  status: '/api/dsh-mobile/remote/status',
  devices: '/api/dsh-mobile/remote/devices',
  endpoint: '/api/dsh-mobile/remote/endpoint',
  revoke: '/api/dsh-mobile/remote/revoke',
  label: '/api/dsh-mobile/remote/label',
  pair: '/api/dsh-mobile/remote/pair',
} as const

/** Register remote aliases behind Connection's authenticated /api carrier. */
export function registerAuthenticatedPairRoutes(
  ctx: Context,
  webServer: WebServer,
  connection: HostConnectionHandle,
  fetchRoutes: readonly ConnectionFetchRoute[],
  adminRoutes: readonly PairingAdminRoute[],
): void {
  for (const route of fetchRoutes) {
    ctx.effect(() => connection.fetch.register(route), `dsh-mobile-pairing: ${route.path}`)
  }
  for (const route of adminRoutes) {
    ctx.effect(() => webServer.register({
      kind: 'exact',
      path: route.path,
      handler: (req, res) => {
        const admission = connection.admit(req)
        if ('rejection' in admission) {
          res.writeHead(admission.rejection, { 'cache-control': 'no-store' })
          res.end(admission.rejection === 401 ? 'unauthorized' : 'forbidden')
          return
        }
        return route.handler(req, res)
      },
    }), `dsh-mobile-pairing: ${route.path}`)
  }
}
