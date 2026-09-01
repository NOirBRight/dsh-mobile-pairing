import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createDshCookieAcquirer, formatLoopbackAuthority, parseLoopbackAuthority, redactCookieDiagnostic } from '../src/dsh-cookie.ts'

function listen(handler) {
  const server = createServer(handler)
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

test('parseLoopbackAuthority splits host:port once from the right', () => {
  assert.deepEqual(parseLoopbackAuthority('127.0.0.1:3082'), { host: '127.0.0.1', port: 3082 })
  assert.deepEqual(parseLoopbackAuthority('[::1]:3082'), { host: '::1', port: 3082 })
  assert.equal(formatLoopbackAuthority('::1', 3082), '[::1]:3082')
  assert.equal(formatLoopbackAuthority('[::1]', 3082), '[::1]:3082')
  assert.throws(() => formatLoopbackAuthority('127.0.0.1', 0), /port/)
})

test('cookie diagnostics redact URL, cookie, and authorization secrets', () => {
  const diagnostic = redactCookieDiagnostic(new Error('GET /?token=launch-secret Cookie: dsh-auth=abc Authorization: Bearer xyz\nnext'))
  assert.equal(diagnostic, 'GET /?token=[redacted] Cookie: [redacted] Authorization: Bearer [redacted] next')
  assert.doesNotMatch(diagnostic, /launch-secret|dsh-auth=abc|xyz/)
})

test('refresh follows 303 and keeps Set-Cookie from the token hop', async () => {
  const server = await listen((req, res) => {
    if (req.url?.startsWith('/?token=')) {
      res.writeHead(303, { 'set-cookie': 'dsh-auth-loop=abc; HttpOnly; SameSite=Strict', location: '/' })
      res.end()
      return
    }
    res.writeHead(200, { 'set-cookie': 'dsh-auth-loop=abc; HttpOnly' })
    res.end('ok')
  })
  const port = server.address().port
  const acquirer = createDshCookieAcquirer(
    () => 'http://127.0.0.1:' + port + '/?token=launch',
    '127.0.0.1:' + port,
  )
  assert.equal(await acquirer.refresh(), 'dsh-auth-loop=abc')
  assert.equal(acquirer.cookie, 'dsh-auth-loop=abc')
  server.close()
})

test('refresh reuses a cached cookie when a later hop has no Set-Cookie', async () => {
  let tokenHits = 0
  const server = await listen((req, res) => {
    if (req.url?.startsWith('/?token=')) {
      tokenHits += 1
      if (tokenHits === 1) {
        res.writeHead(303, { 'set-cookie': 'dsh-auth-loop=first; HttpOnly', location: '/' })
        res.end()
        return
      }
      res.writeHead(303, { location: '/' })
      res.end()
      return
    }
    res.writeHead(200)
    res.end('ok')
  })
  const port = server.address().port
  const acquirer = createDshCookieAcquirer(
    () => 'http://127.0.0.1:' + port + '/?token=launch',
    '127.0.0.1:' + port,
    1,
  )
  assert.equal(await acquirer.refresh(), 'dsh-auth-loop=first')
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.equal(await acquirer.refresh(), 'dsh-auth-loop=first')
  server.close()
})
