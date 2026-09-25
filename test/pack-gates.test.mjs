import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import test from 'node:test'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { assertFixturePathsNotIgnored, assertPublishableManifest, PROJECT_ROOT, readJson, TUNNEL_PEER_RANGE, TUNNEL_SPEC, validatePackageLock } from '../scripts/fixture-provenance.mjs'
import { cleanupTemporaryTrees, createChildEnvironment, OFFLINE_REGISTRY, resolvePnpmCommand } from '../scripts/fixture-runtime.mjs'

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const rootManifest = readJson(join(repository, 'package.json'))
const tunnelName = '@dsh-mobile/e2e-tunnel'

test('pack gate children receive only safe and explicit environment values', () => {
  const environment = createChildEnvironment({
    HOME: '/isolated/home',
    PATH: '/isolated/path',
    NODE_PATH: '/must-be-empty',
    NODE_OPTIONS: '--require=not-allowed',
    npm_config_registry: OFFLINE_REGISTRY,
    npm_config_userconfig: '/isolated/home/user.npmrc',
    npm_config_store_dir: '/isolated/store',
    DSH_SECRET_OVERRIDE: 'must-not-cross',
  }, {
    PATH: '/safe/path',
    HOME: '/safe/home',
    USER: 'safe-user',
    LANG: 'C',
    TMP: '/safe/tmp',
    CI: 'true',
    SystemRoot: 'C\\Windows',
    TEMP: 'C\\Temp',
    DSH_API_KEY: 'secret-value',
    CLOUD_CREDENTIAL: 'cloud-secret',
    NPM_CONFIG_REGISTRY: 'https://untrusted.invalid/',
    npm_config_userconfig: '/untrusted/user.npmrc',
    '': 'empty-name-value',
  })
  const child = JSON.parse(execFileSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(process.env))'], { encoding: 'utf8', env: environment }))
  assert.deepEqual(Object.keys(child).sort(), ['CI', 'HOME', 'LANG', 'NODE_OPTIONS', 'NODE_PATH', 'PATH', 'SystemRoot', 'TEMP', 'TMP', 'USER', 'npm_config_registry', 'npm_config_store_dir', 'npm_config_userconfig'].sort())
  assert.equal(child.PATH, '/isolated/path')
  assert.equal(child.HOME, '/isolated/home')
  assert.equal(child.USER, 'safe-user')
  assert.equal(child.LANG, 'C')
  assert.equal(child.TMP, '/safe/tmp')
  assert.equal(child.CI, 'true')
  assert.equal(child.SystemRoot, 'C\\Windows')
  assert.equal(child.TEMP, 'C\\Temp')
  assert.equal(child.NODE_PATH, '')
  assert.equal(child.NODE_OPTIONS, '')
  assert.equal(child.npm_config_registry, OFFLINE_REGISTRY)
  assert.equal(child.npm_config_userconfig, '/isolated/home/user.npmrc')
  assert.equal(child.npm_config_store_dir, '/isolated/store')
  assert.equal(child.DSH_API_KEY, undefined)
  assert.equal(child.CLOUD_CREDENTIAL, undefined)
  assert.equal(child.NPM_CONFIG_REGISTRY, undefined)
  assert.equal(child[''], undefined)
})
test('offline consumer resolves pnpm 11.7.0 without Corepack', () => {
  const pnpm = resolvePnpmCommand()
  assert.doesNotMatch([pnpm.command, ...pnpm.args].join(' '), /corepack\.cjs/iu)
  const version = execFileSync(pnpm.command, [...pnpm.args, '--version'], { encoding: 'utf8', env: createChildEnvironment() })
  assert.equal(version.trim(), '11.7.0')
})

test('temporary cleanup removes symlink roots without following them', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'pairing-cleanup-negative-'))
  try {
    const target = join(parent, 'target')
    const link = join(parent, 'link')
    await mkdir(target)
    await writeFile(join(target, 'sentinel'), 'keep')
    await symlink(target, link, 'dir')
    assert.deepEqual(cleanupTemporaryTrees([link]), [])
    assert.equal(await readFile(join(target, 'sentinel'), 'utf8'), 'keep')
  } finally { await rm(parent, { recursive: true, force: true }) }
})

async function copiedProject() {
  const parent = await mkdtemp(join(tmpdir(), 'pairing-lock-negative-'))
  await cp(join(repository, 'package.json'), join(parent, 'package.json'))
  await cp(join(repository, 'package-lock.json'), join(parent, 'package-lock.json'))
  return parent
}


test('ignored fixture paths are rejected', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'pairing-ignore-negative-'))
  try {
    const root = join(parent, 'fixtures', 'alpha4')
    await mkdir(join(root, 'tarballs'), { recursive: true })
    await writeFile(join(root, 'PROVENANCE.json'), '{}\n')
    await writeFile(join(root, 'consumer-pnpm-lock.yaml'), '{}\n')
    await writeFile(join(root, 'tarballs', 'fixture.tgz'), 'fixture')
    await writeFile(join(parent, '.gitignore'), 'fixtures/alpha4/tarballs/*.tgz\n')
    execFileSync('git', ['init', '--quiet'], { cwd: parent, env: createChildEnvironment() })
    assert.throws(() => assertFixturePathsNotIgnored(root, parent), /fixture file is ignored/)
  } finally { await rm(parent, { recursive: true, force: true }) }
})

test('package-lock keeps an open e2e peer range and pins the verified build source', () => {
  const lock = validatePackageLock(PROJECT_ROOT)
  const root = lock.packages['']
  assert.equal(root.peerDependencies?.[tunnelName], TUNNEL_PEER_RANGE)
  assert.equal(root.dependencies?.[tunnelName], undefined)
  assert.equal(root.optionalDependencies?.[tunnelName], undefined)
  assert.equal(root.devDependencies?.[tunnelName], TUNNEL_SPEC)
  assert.equal(lock.packages['node_modules/' + tunnelName].version, '0.1.6')
})

test('stale package-lock and alias resolutions fail publication checks', async () => {
  const mutations = [
    { name: 'Git identity', apply: lock => { lock.packages['node_modules/' + tunnelName].resolved = 'git+ssh://git@github.com/NOirBRight/dsh-e2e-tunnel.git#wrong' }, pattern: /exact e2e Git commit/ },
    { name: 'official version', apply: lock => { lock.packages['node_modules/@deepseek-ai/dsh-client-connection'].version = '0.1.2-alpha.2' }, pattern: /rc1/ },
    { name: 'alias resolution', apply: lock => { lock.packages['node_modules/' + tunnelName].version = 'npm:@dsh-mobile/e2e-tunnel@0.1.5' }, pattern: /alias/ },
    { name: 'unapproved Git resolution', apply: lock => { lock.packages['node_modules/tweetnacl'].resolved = 'git+https://github.com/example/tweetnacl.git#deadbeef' }, pattern: /unapproved Git/ },
  ]
  for (const mutation of mutations) {
    const parent = await copiedProject()
    try {
      const file = join(parent, 'package-lock.json')
      const lock = JSON.parse(await readFile(file, 'utf8'))
      mutation.apply(lock)
      await writeFile(file, JSON.stringify(lock, null, 2) + '\n')
      assert.throws(() => validatePackageLock(parent), mutation.pattern, mutation.name)
    } finally { await rm(parent, { recursive: true, force: true }) }
  }
})

test('publishable manifests reject source aliases and unapproved Git specs', () => {
  assert.doesNotThrow(() => assertPublishableManifest(rootManifest))
  assert.throws(() => assertPublishableManifest({ dependencies: { example: 'file:../example' } }), /source alias/)
  assert.throws(() => assertPublishableManifest({ dependencies: { example: 'github:example/repo#main' } }), /unapproved Git/)
})

test('DSH Host ranges have no upper bound in every manifest dependency section', async () => {
  const declarations = [
    { section: 'dependencies', name: '@deepseek-ai/dsh' },
    { section: 'optionalDependencies', name: '@deepseek-ai/dsh-future' },
    { section: 'devDependencies', name: '@deepseek-ai/dsh-brand' },
    { section: 'peerDependencies', name: '@deepseek-ai/dsh-client-connection' },
  ]
  for (const { section, name } of declarations) {
    const manifest = structuredClone(rootManifest)
    const range = '>=0.1.7-alpha.2 <1.0.0'
    manifest[section] = { ...manifest[section], [name]: range }
    assert.throws(() => assertPublishableManifest(manifest), /must declare DSH Host .* with an open lower-bound range/)

    const parent = await copiedProject()
    try {
      const packageFile = join(parent, 'package.json')
      const lockFile = join(parent, 'package-lock.json')
      const lock = JSON.parse(await readFile(lockFile, 'utf8'))
      lock.packages[''][section] = { ...lock.packages[''][section], [name]: range }
      await writeFile(packageFile, JSON.stringify(manifest, null, 2) + '\n')
      await writeFile(lockFile, JSON.stringify(lock, null, 2) + '\n')
      assert.throws(() => validatePackageLock(parent), /must declare DSH Host .* with an open lower-bound range/)
    } finally { await rm(parent, { recursive: true, force: true }) }
  }
})

test('Pairing rejects unsafe and closed e2e tunnel peer ranges', async () => {
  const mutations = [
    { name: 'Git runtime dependency', apply: manifest => { manifest.dependencies[tunnelName] = 'github:NOirBRight/dsh-e2e-tunnel#v0.1.6' }, pattern: /runtime dependency/ },
    { name: 'optional dependency', apply: manifest => { manifest.optionalDependencies = { ...manifest.optionalDependencies, [tunnelName]: '0.1.6' } }, pattern: /runtime dependency/ },
    { name: 'optional peer', apply: manifest => { manifest.peerDependenciesMeta[tunnelName] = { optional: true } }, pattern: /must require e2e tunnel peer range >=0\.1\.6/ },
    { name: 'exact peer version', apply: manifest => { manifest.peerDependencies[tunnelName] = '0.1.6' }, pattern: /must require e2e tunnel peer range >=0\.1\.6/ },
    { name: 'upper-bounded peer range', apply: manifest => { manifest.peerDependencies[tunnelName] = '>=0.1.6 <1.0.0' }, pattern: /must require e2e tunnel peer range >=0\.1\.6/ },
  ]
  for (const mutation of mutations) {
    const manifest = structuredClone(rootManifest)
    mutation.apply(manifest)
    assert.throws(() => assertPublishableManifest(manifest), mutation.pattern, mutation.name)
    const parent = await copiedProject()
    try {
      await writeFile(join(parent, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
      assert.throws(() => validatePackageLock(parent), mutation.pattern, mutation.name + ' in package-lock validation')
    } finally { await rm(parent, { recursive: true, force: true }) }
  }
})
