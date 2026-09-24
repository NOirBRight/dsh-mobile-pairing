// Product-path campaign ownership: apply() + /pair/revoke must stop retry and
// tear down only the revoked room, then unmount must drop remaining rooms.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:https'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import test, { mock } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { WebSocket, WebSocketServer } from 'ws'
import { apply, Config } from '../src/index.ts'
import { DeviceTokenStore } from '../src/tokens.ts'

async function waitFor(cond, timeoutMs = 5000) {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

async function unusedPort() {
  const server = createNetServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = server.address().port
  await new Promise((resolve, reject) => server.close(error => error === undefined ? resolve() : reject(error)))
  return port
}

async function openGatewaySocket(port, room) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const socket = new WebSocket('ws://127.0.0.1:' + port + '/tunnel/' + room)
    const outcome = await new Promise(resolve => {
      socket.once('open', () => resolve('open'))
      socket.once('error', () => resolve('error'))
    })
    if (outcome === 'open') return socket
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('Gateway did not start')
}

function invoke(handler, { method = 'POST', body, authorized = true } = {}) {
  return new Promise((resolve, reject) => {
    const req = Readable.from([Buffer.from(JSON.stringify(body ?? {}))])
    req.method = method
    req.url = '/pair/revoke'
    req.headers = authorized ? { authorization: 'Bearer test' } : {}
    let status = 0
    const chunks = []
    const res = {
      writeHead(code) { status = code },
      end(data) {
        if (data !== undefined) chunks.push(data)
        const text = chunks.join('')
        let parsed = text
        try { parsed = text === '' ? null : JSON.parse(text) } catch { /* keep raw */ }
        resolve({ status, body: parsed })
      },
    }
    Promise.resolve(handler(req, res)).catch(reject)
  })
}

function provideConnection(ctx) {
  ctx.provide('connection', {
    admit: req => req.headers.authorization === 'Bearer test' ? {} : { rejection: 401 },
    fetch: { register: () => () => {} },
  })
}

function invokeGet(handler, url = '/pair') {
  return new Promise((resolve, reject) => {
    const req = Readable.from([])
    req.method = 'GET'
    req.url = url
    req.headers = {}
    let status = 0
    const chunks = []
    const res = {
      writeHead(code) { status = code },
      end(data) {
        if (data !== undefined) chunks.push(data)
        const text = chunks.join('')
        let parsed = text
        try { parsed = text === '' ? null : JSON.parse(text) } catch { /* keep raw */ }
        resolve({ status, body: parsed })
      },
    }
    Promise.resolve(handler(req, res)).catch(reject)
  })
}

function startTlsRelay() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-relay-tls-'))
  const keyPath = join(dir, 'key.pem')
  const certPath = join(dir, 'cert.pem')
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-days', '1', '-subj', '/CN=localhost'], { stdio: 'pipe' })
  const server = createServer({ key: readFileSync(keyPath), cert: readFileSync(certPath) })
  const wss = new WebSocketServer({ server })
  const rooms = new Map()
  wss.on('connection', (socket, req) => {
    const room = new URL(req.url ?? '/', 'https://relay.local').pathname.split('/').pop()
    const entry = rooms.get(room) ?? { sockets: [], connects: 0 }
    entry.connects += 1
    entry.sockets.push(socket)
    rooms.set(room, entry)
    socket.on('close', () => {
      entry.sockets = entry.sockets.filter((item) => item !== socket)
    })
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        server,
        wss,
        rooms,
        port: server.address().port,
        dir,
        close() {
          wss.close()
          server.close()
          rmSync(dir, { recursive: true, force: true })
        },
      })
    })
  })
}

test('revoke stops the matching relay campaign and unmount tears the rest down', async (t) => {
  const previousTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  t.after(() => {
    if (previousTls === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previousTls
  })

  const relay = await startTlsRelay()
  t.after(() => relay.close())

  const dir = mkdtempSync(join(tmpdir(), 'dsh-campaign-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const store = new DeviceTokenStore(join(dir, 'mobile', 'devices.json'))
  const roomA = 'a'.repeat(32)
  const roomB = 'b'.repeat(32)
  const deviceA = store.issue('phone-a', roomA)
  store.issue('phone-b', roomB)

  const handlers = new Map()
  const ctx = new Context()
  ctx.provide('webServer', {
    register(route) {
      handlers.set(route.path, route.handler)
      return () => handlers.delete(route.path)
    },
  })
  provideConnection(ctx)
  apply(ctx, Config({
    dshHome: dir,
    dshPort: 18789,
    endpointMode: 'relay',
    relayUrl: 'wss://127.0.0.1:' + relay.port,
    gatewayPort: 0,
    cookieRetryDelayMs: 60_000,
  }))
  t.after(() => { if (ctx.fiber.uid !== null) return ctx.fiber.dispose() })

  await waitFor(() => (relay.rooms.get(roomA)?.sockets.length ?? 0) >= 1 && (relay.rooms.get(roomB)?.sockets.length ?? 0) >= 1)
  const connectsA = relay.rooms.get(roomA).connects
  const connectsB = relay.rooms.get(roomB).connects
  const denied = await invoke(handlers.get('/pair/revoke'), { body: { id: deviceA.id }, authorized: false })
  assert.equal(denied.status, 401)
  assert.equal(relay.rooms.get(roomA).sockets.length, 1, 'unauthorized revoke must not stop a room')

  const revoked = await invoke(handlers.get('/pair/revoke'), { body: { id: deviceA.id } })
  assert.equal(revoked.status, 200)
  assert.deepEqual(revoked.body, { ok: true })
  await waitFor(() => (relay.rooms.get(roomA)?.sockets.length ?? 0) === 0)
  await new Promise((resolve) => setTimeout(resolve, 1200))
  assert.equal(relay.rooms.get(roomA).connects, connectsA, 'revoked room must not retry')
  assert.equal(relay.rooms.get(roomB).sockets.length, 1, 'sibling room stays seated')
  assert.equal(relay.rooms.get(roomB).connects, connectsB)

  await ctx.fiber.dispose()
  await waitFor(() => (relay.rooms.get(roomB)?.sockets.length ?? 0) === 0)
  await new Promise((resolve) => setTimeout(resolve, 1200))
  assert.equal(relay.rooms.get(roomB).connects, connectsB, 'unmount must not restart campaigns')
})

test('revoke closes an existing custom Gateway session and removes its room authorization', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-custom-revoke-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const port = await unusedPort()
  const room = 'c'.repeat(32)
  const store = new DeviceTokenStore(join(dir, 'mobile', 'devices.json'))
  const device = store.issue('phone', room)
  const handlers = new Map()
  const ctx = new Context()
  ctx.provide('webServer', {
    register(route) {
      handlers.set(route.path, route.handler)
      return () => handlers.delete(route.path)
    },
  })
  provideConnection(ctx)
  apply(ctx, Config({
    dshHome: dir,
    dshPort: 18789,
    endpointMode: 'custom',
    customEndpointUrl: 'https://example.com',
    gatewayPort: port,
    cookieRetryDelayMs: 60_000,
  }))
  t.after(() => { if (ctx.fiber.uid !== null) return ctx.fiber.dispose() })

  const socket = await openGatewaySocket(port, room)
  t.after(() => { if (socket.readyState === WebSocket.OPEN) socket.close() })
  const closed = new Promise(resolve => socket.once('close', resolve))
  const revoked = await invoke(handlers.get('/pair/revoke'), { body: { id: device.id } })
  assert.equal(revoked.status, 200)
  assert.deepEqual(revoked.body, { ok: true })
  await closed

  const rejected = new WebSocket('ws://127.0.0.1:' + port + '/tunnel/' + room)
  await assert.rejects(once(rejected, 'open'), /401/)
})

test('reseat keeps an unexpired QR offer room when no device is authorized', async (t) => {
  mock.timers.enable({ apis: ['setInterval'] })
  t.after(() => mock.timers.reset())

  const previousTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  t.after(() => {
    if (previousTls === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previousTls
  })

  const relay = await startTlsRelay()
  t.after(() => relay.close())

  const dir = mkdtempSync(join(tmpdir(), 'dsh-pending-reseat-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  const handlers = new Map()
  const ctx = new Context()
  ctx.provide('webServer', {
    register(route) {
      handlers.set(route.path, route.handler)
      return () => handlers.delete(route.path)
    },
  })
  apply(ctx, Config({
    dshHome: dir,
    dshPort: 18789,
    endpointMode: 'relay',
    relayUrl: 'wss://127.0.0.1:' + relay.port,
    gatewayPort: 0,
    cookieRetryDelayMs: 60_000,
  }))
  t.after(() => { if (ctx.fiber.uid !== null) return ctx.fiber.dispose() })

  await waitFor(() => existsSync(join(dir, 'mobile', 'gateway-port')))
  const minted = await invokeGet(handlers.get('/pair'))
  assert.equal(minted.status, 200)
  const room = minted.body.room
  assert.match(room, /^[0-9a-f]{32}$/)
  await waitFor(() => (relay.rooms.get(room)?.sockets.length ?? 0) >= 1)
  const connects = relay.rooms.get(room).connects

  mock.timers.tick(15_000)
  await new Promise((resolve) => setTimeout(resolve, 200))
  assert.equal(relay.rooms.get(room).sockets.length, 1, 'QR room must stay seated across reseat')
  assert.equal(relay.rooms.get(room).connects, connects, 'QR room must not be torn down and reconnected')
})
