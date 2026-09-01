import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { bindConnectionCookie } from '../src/connection-lifecycle.ts'

function listen(handler) {
  const server = createServer(handler)
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(server) })
  })
}

async function waitFor(predicate) {
  const deadline = Date.now() + 2000
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert.fail('timed out waiting for lifecycle state')
}

function address(server) {
  const value = server.address()
  if (value === null || typeof value === 'string') throw new Error('test server did not expose an address')
  return value.port
}

function connection(port, path) {
  return { authenticatedUrl: () => `http://127.0.0.1:${port}${path}` }
}

test('connection replacement disposes the old cookie acquirer before activating the new one', async () => {
  const server = await listen((req, res) => {
    const id = req.url?.startsWith('/one') ? 'one' : 'two'
    res.writeHead(200, { 'set-cookie': 'dsh-auth-' + id + '=value' })
    res.end()
  })
  const ctx = new Context()
  const firstRelease = ctx.provide('connection', connection(address(server), '/one'))
  const binding = bindConnectionCookie(ctx, 'http://127.0.0.1:1/', '127.0.0.1:' + address(server), 3000)
  let secondRelease
  try {
    await waitFor(() => binding.current()?.cookie === 'dsh-auth-one=value')
    const first = binding.current()
    assert.ok(first)
    await firstRelease()
    await waitFor(() => binding.current() === undefined)
    assert.equal(first.cookie, undefined)
    await assert.rejects(first.refresh(), /cookie acquirer is disposed/)
    secondRelease = ctx.provide('connection', connection(address(server), '/two'))
    await waitFor(() => binding.current()?.cookie === 'dsh-auth-two=value')
    assert.notEqual(binding.current(), first)
  } finally {
    if (secondRelease !== undefined) await secondRelease()
    await ctx.fiber.dispose()
    await new Promise(resolve => server.close(resolve))
  }
})

test('parent unmount disposes the active cookie acquirer and removes its pointer', async () => {
  const server = await listen((_req, res) => {
    res.writeHead(200, { 'set-cookie': 'dsh-auth-active=value' })
    res.end()
  })
  const ctx = new Context()
  ctx.provide('connection', connection(address(server), '/active'))
  const binding = bindConnectionCookie(ctx, 'http://127.0.0.1:1/', '127.0.0.1:' + address(server), 3000)
  try {
    await waitFor(() => binding.current()?.cookie === 'dsh-auth-active=value')
    const active = binding.current()
    assert.ok(active)
    await ctx.fiber.dispose()
    assert.equal(binding.current(), undefined)
    assert.equal(active.cookie, undefined)
    await assert.rejects(active.refresh(), /cookie acquirer is disposed/)
  } finally {
    if (ctx.fiber.uid !== null) await ctx.fiber.dispose()
    await new Promise(resolve => server.close(resolve))
  }
})

test('absence is diagnosed outside the guaranteed connection injection callback', async () => {
  const ctx = new Context()
  const messages = []
  ctx.logger.exporter({ levels: { default: 3 }, export: message => messages.push(message) })
  const binding = bindConnectionCookie(ctx, 'http://127.0.0.1:1/', '127.0.0.1:1', 3000)
  try {
    assert.equal(binding.current(), undefined)
    assert.ok(messages.some(message => message.args.some(value => String(value).includes('connection service unavailable; upstream cookie disabled'))))
  } finally {
    await ctx.fiber.dispose()
  }
})

test('waitCookie stays pending through a failed acquisition and resolves after retry', async () => {
  let attempts = 0
  const server = await listen((_req, res) => {
    attempts += 1
    if (attempts === 1) {
      res.writeHead(503)
      res.end()
      return
    }
    res.writeHead(200, { 'set-cookie': 'dsh-auth-retried=value' })
    res.end()
  })
  const ctx = new Context()
  ctx.provide('connection', connection(address(server), '/retry'))
  const binding = bindConnectionCookie(ctx, 'http://127.0.0.1:1/', '127.0.0.1:' + address(server), 10)
  try {
    await waitFor(() => binding.current() !== undefined)
    assert.equal(await binding.waitCookie(), 'dsh-auth-retried=value')
    assert.equal(attempts, 2)
  } finally {
    await ctx.fiber.dispose()
    await new Promise(resolve => server.close(resolve))
  }
})

test('refresh forces a new cookie after an unauthorized response', async () => {
  let value = 'first'
  const server = await listen((_req, res) => {
    res.writeHead(200, { 'set-cookie': 'dsh-auth-' + value + '=value' })
    res.end()
  })
  const ctx = new Context()
  ctx.provide('connection', connection(address(server), '/force'))
  const binding = bindConnectionCookie(ctx, 'http://127.0.0.1:1/', '127.0.0.1:' + address(server), 10)
  try {
    await waitFor(() => binding.current()?.cookie === 'dsh-auth-first=value')
    value = 'second'
    binding.refresh()
    await waitFor(() => binding.current()?.cookie === 'dsh-auth-second=value')
  } finally {
    await ctx.fiber.dispose()
    await new Promise(resolve => server.close(resolve))
  }
})
