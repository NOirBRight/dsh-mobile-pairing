import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8')
const lifecycleSource = await readFile(new URL('../src/connection-lifecycle.ts', import.meta.url), 'utf8')

const DSH_RANGE = '>=0.1.2-alpha.4 <1.0.0 || 0.1.2-alpha.5 || 0.1.2-rc.1'

test('declares a forward-compatible Host Webserver and Settings range', () => {
  for (const service of ['@deepseek-ai/dsh-host-webserver', '@deepseek-ai/dsh-settings']) {
    assert.equal(packageJson.peerDependencies[service], DSH_RANGE)
    assert.equal(packageJson.devDependencies[service], '0.1.2-alpha.4')
  }
  assert.equal(JSON.stringify(packageJson).includes('0.1.1-rc.'), false)
  assert.equal(JSON.stringify(packageJson).includes('0.1.2-alpha.2'), false)
})

test('uses official Cordis service augmentation instead of masking Context mismatches', () => {
  assert.match(source, /const webServer: WebServer = ctx\.webServer/)
  assert.match(source, /ctx\.inject\(\['settings'\]/)
  assert.match(source, /settingsCtx\.settings\.installSection\(ctx, 'dsh-mobile'/)
  assert.doesNotMatch(source, /ctx as unknown as \{ (?:webServer|settings)/)
  assert.doesNotMatch(source, /ctx\.effect\(\(\) => \{\s*ctx\.settings\.register/)
})

test('marks Host Connection as optional peer and owns its injection transaction', () => {
  assert.equal(packageJson.peerDependencies['@deepseek-ai/dsh-client-connection'], DSH_RANGE)
  assert.equal(packageJson.devDependencies['@deepseek-ai/dsh-client-connection'], '0.1.2-alpha.4')
  assert.deepEqual(packageJson.peerDependenciesMeta['@deepseek-ai/dsh-client-connection'], { optional: true })
  assert.match(lifecycleSource, /import type \{ HostConnectionHandle \} from '@deepseek-ai\/dsh-client-connection'/)
  assert.match(lifecycleSource, /const connection = connectionCtx\.get\('connection'\) as HostConnectionHandle/)
  assert.doesNotMatch(lifecycleSource, /as unknown as/)
  assert.doesNotMatch(lifecycleSource, /connection === undefined|typeof connection\.authenticatedUrl/)
  const injection = lifecycleSource.indexOf("const connectionFiber = ctx.inject(['connection']")
  const outerEffect = lifecycleSource.lastIndexOf('ctx.effect(() => {', injection)
  assert.ok(outerEffect >= 0 && outerEffect < injection)
  assert.match(lifecycleSource.slice(injection), /return \(\) => \{\s*clearRetry\(\)\s*connectionFiber\.dispose\(\)\s*\}/)
  assert.match(lifecycleSource, /return connectionCtx\.effect/)
  assert.match(lifecycleSource, /retryDelayMs/)
  assert.doesNotMatch(lifecycleSource, /setTimeout\([^\n]+, 3000\)/)
  assert.match(lifecycleSource, /if \(ctx\.get\('connection'\) === undefined\)/)
})
