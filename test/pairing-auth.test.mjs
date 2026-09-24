import assert from 'node:assert/strict'
import test from 'node:test'
import { registerAuthenticatedPairRoutes, REMOTE_SETTINGS_ROUTES } from '../src/pairing-routes.ts'

function createWebServer() {
  const exact = new Map()
  const prefixes = new Map()
  return {
    register(route) {
      const routes = route.kind === 'exact' ? exact : prefixes
      routes.set(route.path, route)
      return () => routes.delete(route.path)
    },
    match(path) {
      const direct = exact.get(path)
      if (direct !== undefined) return direct
      let match
      for (const [prefix, route] of prefixes) {
        if (path !== prefix && !path.startsWith(prefix + '/')) continue
        if (match === undefined || prefix.length > match.path.length) match = route
      }
      return match
    },
  }
}

test('remote pairing API requests pass Connection admission before reaching an exact handler', async () => {
  const webServer = createWebServer()
  const fetchRoutes = new Map()
  const connection = {
    admit(request) {
      return request.headers.get('x-operator') === 'yes' ? { peer: {} } : { rejection: 401 }
    },
    fetch: {
      register(route) {
        assert.match(route.path, /^\/api\//)
        fetchRoutes.set(route.path, route)
        return async () => fetchRoutes.delete(route.path)
      },
    },
  }
  const ctx = { effect: execute => execute() }
  webServer.register({
    kind: 'prefix',
    path: '/api',
    handler(request) {
      const admission = connection.admit(request)
      if ('rejection' in admission) return new Response('unauthorized', { status: admission.rejection })
      const path = new URL(request.url).pathname
      return fetchRoutes.get(path)?.fetch(request) ?? new Response('not found', { status: 404 })
    },
  })
  registerAuthenticatedPairRoutes(ctx, webServer, connection, [{
    path: REMOTE_SETTINGS_ROUTES.status,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async () => new Response('status'),
  }], [])

  const dispatch = request => webServer.match(new URL(request.url).pathname).handler(request)
  const anonymous = await dispatch(new Request(`http://dsh.test${REMOTE_SETTINGS_ROUTES.status}`))
  assert.equal(anonymous.status, 401)
  const admitted = await dispatch(new Request(`http://dsh.test${REMOTE_SETTINGS_ROUTES.status}`, { headers: { 'x-operator': 'yes' } }))
  assert.equal(admitted.status, 200)
  assert.equal(await admitted.text(), 'status')
})

test('Connection route disposal removes only its own exact route', async () => {
  const routes = new Map()
  const disposers = []
  const ctx = { effect: execute => disposers.push(execute()) }
  const connection = {
    fetch: {
      register(route) {
        routes.set(route.path, route)
        return async () => routes.delete(route.path)
      },
    },
  }
  registerAuthenticatedPairRoutes(ctx, createWebServer(), connection, [
    { path: '/api/one', methods: ['GET'], requestBody: 'buffered', fetch: async () => new Response() },
    { path: '/api/two', methods: ['GET'], requestBody: 'buffered', fetch: async () => new Response() },
  ], [])
  await disposers[0]()
  assert.equal(routes.has('/api/one'), false)
  assert.equal(routes.has('/api/two'), true)
  await disposers[1]()
})

test('operator pairing administration routes require a browser session and preserve handler responses', async () => {
  const webServer = createWebServer()
  const connection = {
    admit(request) {
      return request.headers?.['x-operator'] === 'yes' ? { peer: {} } : { rejection: 401 }
    },
    fetch: { register: () => async () => {} },
  }
  const ctx = { effect: execute => execute() }
  registerAuthenticatedPairRoutes(ctx, webServer, connection, [], [{
    path: '/pair/devices',
    handler: (_request, response) => { response.writeHead(200); response.end('devices') },
  }])
  let status
  let body
  const handler = webServer.match('/pair/devices').handler
  const deniedResponse = { writeHead(value) { status = value }, end(value) { body = value } }
  await handler({ headers: {} }, deniedResponse)
  assert.equal(status, 401)
  assert.equal(body, 'unauthorized')
  status = undefined
  body = undefined
  await handler({ headers: { 'x-operator': 'yes' } }, deniedResponse)
  assert.equal(status, 200)
  assert.equal(body, 'devices')
})
