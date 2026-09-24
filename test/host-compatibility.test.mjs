import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

test('pins the compatible Host surface to alpha2 while keeping platform peers optional', () => {
  for (const peer of ['@deepseek-ai/dsh-host-webserver', '@deepseek-ai/dsh-client-connection']) {
    assert.equal(packageJson.peerDependencies[peer], '*')
  }
  assert.equal(packageJson.peerDependencies['@deepseek-ai/cordis'], '~4.0.4')
  assert.equal(packageJson.devDependencies['@deepseek-ai/cordis'], '4.0.4')
  assert.deepEqual(packageJson.dsh.compatibility.dshReleases, { '0.1.7-alpha.2': 'compatible' })
  for (const service of [
    '@deepseek-ai/dsh-brand',
    '@deepseek-ai/dsh-invariants',
    '@deepseek-ai/dsh-session',
    '@deepseek-ai/dsh-scope',
    '@deepseek-ai/dsh-host-webserver',
    '@deepseek-ai/dsh-client-connection',
  ]) {
    assert.equal(packageJson.devDependencies[service], '0.1.7-alpha.2')
  }
  assert.equal(packageJson.peerDependencies['@deepseek-ai/dsh-settings'], undefined)
  assert.equal(packageJson.peerDependenciesMeta['@deepseek-ai/dsh-settings'], undefined)
  assert.equal(packageJson.devDependencies['@deepseek-ai/dsh-settings'], undefined)
})

test('Host Connection remains an optional peer with an alpha2 compile target', () => {
  assert.equal(packageJson.peerDependencies['@deepseek-ai/dsh-client-connection'], '*')
  assert.equal(packageJson.devDependencies['@deepseek-ai/dsh-client-connection'], '0.1.7-alpha.2')
  assert.deepEqual(packageJson.peerDependenciesMeta['@deepseek-ai/dsh-client-connection'], { optional: true })
})
