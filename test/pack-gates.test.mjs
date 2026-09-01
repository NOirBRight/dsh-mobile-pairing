import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cp, mkdtemp, mkdir, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { collectRuntimeImports, inspectArchive, readTarget } from '../scripts/fixture-archives.mjs'
import { assertFixturePathsNotIgnored, assertPublishableManifest, FIXTURE_ROOT, loadFixtureSet, PROJECT_ROOT, readJson, validateDependencyGraph, validatePackageLock } from '../scripts/fixture-provenance.mjs'
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
test('offline consumer resolves a real pnpm binary without Corepack', () => {
  const pnpm = resolvePnpmCommand()
  assert.doesNotMatch([pnpm.command, ...pnpm.args].join(' '), /corepack\.cjs/iu)
  const version = execFileSync(pnpm.command, [...pnpm.args, '--version'], { encoding: 'utf8', env: createChildEnvironment() })
  assert.match(version, /^\d+\.\d+\.\d+/u)
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

async function copiedFixtures() {
  const parent = await mkdtemp(join(tmpdir(), 'pairing-fixture-negative-'))
  const copy = join(parent, 'alpha1')
  await cp(FIXTURE_ROOT, copy, { recursive: true })
  return { parent, copy }
}

async function mutateProvenance(copy, mutate) {
  const file = join(copy, 'PROVENANCE.json')
  const provenance = JSON.parse(await readFile(file, 'utf8'))
  mutate(provenance)
  await writeFile(file, JSON.stringify(provenance, null, 2) + '\n')
}

function fixturePath(copy, key) {
  const provenance = JSON.parse(readFileSync(join(copy, 'PROVENANCE.json'), 'utf8'))
  return join(copy, 'tarballs', provenance.packages[key].tarball)
}

async function copiedProject() {
  const parent = await mkdtemp(join(tmpdir(), 'pairing-lock-negative-'))
  await cp(join(repository, 'package.json'), join(parent, 'package.json'))
  await cp(join(repository, 'package-lock.json'), join(parent, 'package-lock.json'))
  return parent
}

test('fixture closure uses exact archive records and explicit dependency edges', () => {
  const fixtureSet = loadFixtureSet()
  const edges = validateDependencyGraph(fixtureSet, rootManifest)
  assert.equal(fixtureSet.records.size, 114)
  assert.equal(fixtureSet.archives.size, 114)
  assert.equal(edges.size, 263)
  assert.equal(fixtureSet.provenance.edges.find(edge => edge.parent === fixtureSet.rootId && edge.dependency === '@deepseek-ai/dsh-client-connection').optional, true)
  assert.equal(fixtureSet.records.get('@deepseek-ai/dsh-client-connection@0.1.2-alpha.1').source.commit, 'cd5ef8148158c3a752a658978873241fdf8e2bbc')
  assert.equal(fixtureSet.records.get(tunnelName + '@0.1.4').sha256, '700576556aa2756a886dc5c3b17b7987e48f7fe3abe4d275a80cca56d348fcc5')
  const archive = inspectArchive(join(FIXTURE_ROOT, 'tarballs', 'deepseek-ai-dsh-client-connection-0.1.2-alpha.1.tgz'))
  assert.equal(typeof readTarget(archive, archive.manifest.main), 'string')
  const imports = collectRuntimeImports('const x = require("react/jsx-runtime"); import("@dsh-mobile/e2e-tunnel")')
  assert.deepEqual([...imports].sort(), ['@dsh-mobile/e2e-tunnel', 'react/jsx-runtime'])
})

test('tampered fixture bytes fail their recorded digest', async () => {
  const { parent, copy } = await copiedFixtures()
  try {
    const file = fixturePath(copy, 'debug@2.6.9')
    const bytes = await readFile(file)
    bytes[bytes.length - 1] ^= 1
    await writeFile(file, bytes)
    assert.throws(() => loadFixtureSet(copy), /cannot inspect|digest mismatch/)
  } finally { await rm(parent, { recursive: true, force: true }) }
})

test('missing fixture archives fail the exact provenance index', async () => {
  const { parent, copy } = await copiedFixtures()
  try {
    await unlink(fixturePath(copy, 'debug@2.6.9'))
    assert.throws(() => loadFixtureSet(copy), /missing archive|archive directory does not match/)
  } finally { await rm(parent, { recursive: true, force: true }) }
})

test('wrong fixture versions fail package identity checks', async () => {
  const { parent, copy } = await copiedFixtures()
  try {
    await mutateProvenance(copy, provenance => { provenance.packages['debug@2.6.9'].version = '2.6.10' })
    assert.throws(() => loadFixtureSet(copy), /package identity mismatch/)
  } finally { await rm(parent, { recursive: true, force: true }) }
})

test('duplicate exact dependency claims fail instead of selecting a winner', async () => {
  const { parent, copy } = await copiedFixtures()
  try {
    await mutateProvenance(copy, provenance => { provenance.edges.push({ ...provenance.edges[0] }) })
    const fixtureSet = loadFixtureSet(copy)
    assert.throws(() => validateDependencyGraph(fixtureSet, rootManifest), /dependency version conflict/)
  } finally { await rm(parent, { recursive: true, force: true }) }
})

test('stale Git provenance fails independently of archive bytes', async () => {
  const { parent, copy } = await copiedFixtures()
  try {
    await mutateProvenance(copy, provenance => { provenance.packages[tunnelName + '@0.1.4'].source.commit = 'not-the-pinned-commit' })
    assert.throws(() => loadFixtureSet(copy), /source commit mismatch/)
  } finally { await rm(parent, { recursive: true, force: true }) }
})

test('ignored fixture paths are rejected', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'pairing-ignore-negative-'))
  try {
    const root = join(parent, 'fixtures', 'alpha1')
    await mkdir(join(root, 'tarballs'), { recursive: true })
    await writeFile(join(root, 'PROVENANCE.json'), '{}\n')
    await writeFile(join(root, 'consumer-pnpm-lock.yaml'), '{}\n')
    await writeFile(join(root, 'tarballs', 'fixture.tgz'), 'fixture')
    await writeFile(join(parent, '.gitignore'), 'fixtures/alpha1/tarballs/*.tgz\n')
    execFileSync('git', ['init', '--quiet'], { cwd: parent, env: createChildEnvironment() })
    assert.throws(() => assertFixturePathsNotIgnored(root, parent), /fixture file is ignored/)
  } finally { await rm(parent, { recursive: true, force: true }) }
})

test('package-lock keeps the pinned e2e identity and official alpha.1 integrities', () => {
  const fixtureSet = loadFixtureSet()
  const lock = validatePackageLock(PROJECT_ROOT, fixtureSet)
  assert.equal(lock.packages['node_modules/' + tunnelName].version, '0.1.4')
})

test('stale package-lock and alias resolutions fail publication checks', async () => {
  const fixtureSet = loadFixtureSet()
  const mutations = [
    { name: 'Git identity', apply: lock => { lock.packages['node_modules/' + tunnelName].resolved = 'git+ssh://git@github.com/NOirBRight/dsh-e2e-tunnel.git#wrong' }, pattern: /exact e2e Git commit/ },
    { name: 'official version', apply: lock => { lock.packages['node_modules/@deepseek-ai/dsh-client-connection'].version = '0.1.2-alpha.2' }, pattern: /alpha.1/ },
    { name: 'alias resolution', apply: lock => { lock.packages['node_modules/' + tunnelName].version = 'npm:@dsh-mobile/e2e-tunnel@0.1.4' }, pattern: /alias/ },
    { name: 'unapproved Git resolution', apply: lock => { lock.packages['node_modules/tweetnacl'].resolved = 'git+https://github.com/example/tweetnacl.git#deadbeef' }, pattern: /unapproved Git/ },
  ]
  for (const mutation of mutations) {
    const parent = await copiedProject()
    try {
      const file = join(parent, 'package-lock.json')
      const lock = JSON.parse(await readFile(file, 'utf8'))
      mutation.apply(lock)
      await writeFile(file, JSON.stringify(lock, null, 2) + '\n')
      assert.throws(() => validatePackageLock(parent, fixtureSet), mutation.pattern, mutation.name)
    } finally { await rm(parent, { recursive: true, force: true }) }
  }
})

test('publishable manifests reject source aliases and unapproved Git specs', () => {
  assert.doesNotThrow(() => assertPublishableManifest(rootManifest))
  assert.throws(() => assertPublishableManifest({ dependencies: { example: 'file:../example' } }), /source alias/)
  assert.throws(() => assertPublishableManifest({ dependencies: { example: 'github:example/repo#main' } }), /unapproved Git/)
})
