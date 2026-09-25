import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

test('keeps Host integrations optional and accepts the verified DSH releases', () => {
  for (const peer of ['@deepseek-ai/dsh-host-webserver', '@deepseek-ai/dsh-client-connection']) {
    assert.equal(packageJson.peerDependencies[peer], '>=0.1.7-alpha.2')
  }
  assert.equal(packageJson.peerDependencies['@deepseek-ai/cordis'], '>=4.0.4 <5.0.0')
  assert.equal(packageJson.devDependencies['@deepseek-ai/cordis'], '4.0.4')
  assert.deepEqual(packageJson.dsh.compatibility.dshReleases, {
    '0.1.7-alpha.2': 'compatible',
    '0.1.7-rc.1': 'compatible',
  })
  for (const service of [
    '@deepseek-ai/dsh-brand',
    '@deepseek-ai/dsh-invariants',
    '@deepseek-ai/dsh-session',
    '@deepseek-ai/dsh-scope',
    '@deepseek-ai/dsh-host-webserver',
    '@deepseek-ai/dsh-client-connection',
  ]) {
    assert.equal(packageJson.devDependencies[service], '>=0.1.7-alpha.2')
  }
  assert.equal(packageJson.peerDependencies['@deepseek-ai/dsh-settings'], undefined)
  assert.equal(packageJson.peerDependenciesMeta['@deepseek-ai/dsh-settings'], undefined)
  assert.equal(packageJson.devDependencies['@deepseek-ai/dsh-settings'], undefined)
})

test('keeps Tunnel compatibility open while pinning the tested build source', () => {
  assert.equal(packageJson.peerDependencies['@dsh-mobile/e2e-tunnel'], '>=0.1.6')
  assert.equal(packageJson.devDependencies['@dsh-mobile/e2e-tunnel'], 'github:NOirBRight/dsh-e2e-tunnel#v0.1.6')
})

test('Host Connection remains an optional peer with an rc1 compile target', () => {
  assert.equal(packageJson.peerDependencies['@deepseek-ai/dsh-client-connection'], '>=0.1.7-alpha.2')
  assert.equal(packageJson.devDependencies['@deepseek-ai/dsh-client-connection'], '>=0.1.7-alpha.2')
  assert.deepEqual(packageJson.peerDependenciesMeta['@deepseek-ai/dsh-client-connection'], { optional: true })
})
