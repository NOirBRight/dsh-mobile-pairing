#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import semver from 'semver'
import { inspectArchive, verifyArchive } from './fixture-archives.mjs'
import { ALPHA2_DEV_TREE, OFFICIAL_SOURCE, PAIRING_NAME, PAIRING_TARBALL, PAIRING_VERSION, TUNNEL_COMMIT, TUNNEL_NAME, TUNNEL_VERSION, assertTunnelManifestContract, validatePackageLock } from './fixture-provenance.mjs'
import { createChildEnvironment, OFFLINE_REGISTRY } from './fixture-runtime.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURE_ROOT = join(ROOT, 'fixtures', 'alpha2')
const TARBALL_ROOT = join(FIXTURE_ROOT, 'tarballs')
const ALPHA2_TARBALLS = process.env.DSH_ALPHA2_TARBALL_ROOT ? resolve(process.env.DSH_ALPHA2_TARBALL_ROOT) : ''
const HISTORICAL_FIXTURE_ROOT = join(ROOT, 'fixtures', 'alpha4')
const EXTRA_FIXTURE_ROOT = resolve(process.env.DSH_EXTRA_FIXTURE_DIR ?? join(ROOT, '..', '.alpha2-artifacts'))
const OFFICIAL_CHECKOUT = process.env.DSH_OFFICIAL_CHECKOUT
const TUNNEL_CHECKOUT = process.env.DSH_TUNNEL_CHECKOUT
const DEPENDENCY_FIELDS = ['dependencies', 'optionalDependencies', 'peerDependencies']
const PNPM_BIN = process.env.PNPM_BIN ?? 'pnpm'

function fail(message) { throw new Error('[alpha2-fixtures] ' + message) }

function run(command, args, cwd = ROOT, options = {}) {
  try {
    return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options })
  } catch (error) {
    const output = [error?.stdout, error?.stderr].filter(Boolean).map(String).join('\n')
    fail(command + ' ' + args.join(' ') + ' failed: ' + output)
  }
}
function assertCleanCheckout(directory, expected, label) {
  if (typeof directory !== 'string' || directory.length === 0 || !existsSync(directory)) fail(label + ' checkout path is missing')
  const commit = run('git', ['rev-parse', 'HEAD'], directory).trim()
  const tag = run('git', ['describe', '--tags', '--exact-match', 'HEAD'], directory).trim()
  const status = run('git', ['status', '--porcelain', '--untracked-files=all'], directory).trim()
  if (commit !== expected.commit || tag !== expected.tag || status !== '') fail(label + ' checkout is not the exact clean release source')
}

function readManifest(archive) {
  const entries = run('tar', ['-tzf', archive]).trim().split(/\r?\n/u).filter(Boolean)
  const manifest = entries.find(entry => entry.endsWith('/package.json') && entry.split('/').length === 2)
  if (manifest === undefined) fail('archive has no package manifest: ' + archive)
  return JSON.parse(run('tar', ['-xOzf', archive, manifest]))
}

function workspaceManifestIndex(checkout) {
  const packageRoot = join(checkout, 'packages')
  if (!existsSync(packageRoot)) fail('official DSH checkout has no packages directory')
  const manifests = new Map()
  const pending = [packageRoot]
  while (pending.length > 0) {
    const directory = pending.pop()
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === '.git' || entry.name === 'node_modules') continue
      const packageDirectory = join(directory, entry.name)
      const manifestPath = join(packageDirectory, 'package.json')
      if (existsSync(manifestPath)) {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
        if (typeof manifest.name === 'string' && manifest.name.startsWith('@deepseek-ai/')) {
          if (manifests.has(manifest.name)) fail('duplicate official DSH workspace package: ' + manifest.name)
          manifests.set(manifest.name, { name: manifest.name, version: manifest.version, path: relative(checkout, manifestPath) })
        }
      }
      pending.push(packageDirectory)
    }
  }
  return manifests
}

function archiveName(name, version) {
  const stem = name.startsWith('@') ? name.slice(1).replaceAll('/', '-') : name.replaceAll('/', '-')
  return stem + '-' + version + '.tgz'
}

function sourceRecord(name, version, oldRecords, rootLock, info, requireRootLock = false) {
  const id = name + '@' + version
  if (name === TUNNEL_NAME) {
    return {
      type: 'git',
      repository: 'https://github.com/NOirBRight/dsh-e2e-tunnel.git',
      tag: 'v0.1.6',
      commit: TUNNEL_COMMIT,
    }
  }
  const old = oldRecords.get(id)
  const previous = old?.source?.type === 'registry-lock' && old.integrity === info.integrity && old.source.registry === 'https://registry.npmjs.org' && old.source.integrity === info.integrity && typeof old.source.resolved === 'string' && old.source.resolved.startsWith('https://registry.npmjs.org/') ? old.source.resolved : undefined
  const lockEntry = Object.entries(rootLock.packages ?? {}).find(([path, record]) => {
    const packagePath = 'node_modules/' + name
    return (path === packagePath || path.endsWith('/' + packagePath)) && record.version === version && record.integrity === info.integrity && typeof record.resolved === 'string' && record.resolved.startsWith('https://registry.npmjs.org/')
  })
  const resolved = lockEntry?.[1].resolved ?? (requireRootLock ? undefined : previous)
  if (resolved === undefined) fail('no immutable registry lock entry matches ' + id)
  return { type: 'registry-lock', registry: 'https://registry.npmjs.org', resolved, integrity: info.integrity }
}


function choose(candidates, range) {
  const valid = candidates.filter(candidate => semver.valid(candidate.manifest.version) !== null && semver.validRange(range) !== null && semver.satisfies(candidate.manifest.version, range, { includePrerelease: true }))
  return valid.sort((left, right) => semver.rcompare(left.manifest.version, right.manifest.version)).at(0)
}

function dependencyEntries(manifest) {
  const entries = []
  for (const section of DEPENDENCY_FIELDS) {
    for (const [dependency, declaredRange] of Object.entries(manifest[section] ?? {})) {
      const optional = section === 'optionalDependencies' || (section === 'peerDependencies' && manifest.peerDependenciesMeta?.[dependency]?.optional === true)
      entries.push({ dependency, declaredRange, section, optional })
    }
  }
  return entries
}

function isolatedNpmEnvironment(home) {
  const globalConfig = join(home, 'global.npmrc')
  const userConfig = join(home, 'user.npmrc')
  writeFileSync(globalConfig, '')
  writeFileSync(userConfig, '')
  return createChildEnvironment({
    HOME: home,
    npm_config_globalconfig: globalConfig,
    npm_config_registry: OFFLINE_REGISTRY,
    npm_config_userconfig: userConfig,
  })
}

function packRoot() {
  const temporary = mkdtempSync(join(tmpdir(), 'dsh-mobile-root-pack-'))
  try {
    const env = isolatedNpmEnvironment(temporary)
    const npmVersion = run('npm', ['--version'], ROOT, { env }).trim()
    const output = run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], ROOT, { env })
    const filename = JSON.parse(output)[0]?.filename
    if (typeof filename !== 'string') fail('npm pack returned no root artifact')
    const archive = join(temporary, filename)
    const info = inspectArchive(archive)
    return { archive, info, npmVersion, temporary }
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true })
    throw error
  }
}
function packTunnel() {
  const temporary = mkdtempSync(join(tmpdir(), 'dsh-mobile-alpha2-tunnel-'))
  try {
    const env = isolatedNpmEnvironment(temporary)
    const output = run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], TUNNEL_CHECKOUT, { env })
    const filename = JSON.parse(output)[0]?.filename
    if (typeof filename !== 'string') fail('npm pack returned no e2e tunnel artifact')
    const archive = join(temporary, filename)
    const info = inspectArchive(archive)
    if (info.manifest.name !== TUNNEL_NAME || info.manifest.version !== TUNNEL_VERSION) fail('e2e tunnel archive is not the pinned release')
    return { archive, info, temporary }
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true })
    throw error
  }
}

function workspaceOverrides(records, edges) {
  const byName = new Map()
  for (const record of records) (byName.get(record.name) ?? (byName.set(record.name, []), byName.get(record.name))).push(record)
  const byId = new Map(records.map(record => [record.id, record]))
  const overrides = {}
  for (const [name, entries] of byName) if (entries.length === 1) overrides[name] = 'file:../tarballs/' + entries[0].tarball
  for (const edge of edges) {
    const child = byId.get(edge.child)
    const parent = byId.get(edge.parent)
    if (child === undefined) continue
    const parentName = edge.parent.slice(0, edge.parent.lastIndexOf('@'))
    const parentSelector = parent === undefined || (byName.get(parent.name)?.length ?? 0) === 1 ? parentName : edge.parent
    if ((byName.get(child.name)?.length ?? 0) > 1) overrides[parentSelector + '>' + edge.dependency] = 'file:../tarballs/' + child.tarball
  }
  return overrides
}

function writeWorkspaceFile(directory, records, edges) {
  const lines = ['packages:', '  - .', 'overrides:']
  for (const [key, value] of Object.entries(workspaceOverrides(records, edges)).sort(([left], [right]) => left.localeCompare(right))) lines.push('  ' + JSON.stringify(key) + ': ' + JSON.stringify(value))
  writeFileSync(join(directory, 'pnpm-workspace.yaml'), lines.join('\n') + '\n')
}

function generateConsumerLock(rootArtifact, records, edges) {
  const consumer = mkdtempSync(join(FIXTURE_ROOT, '.consumer-gen-'))
  try {
    copyFileSync(rootArtifact.archive, join(consumer, 'pairing.tgz'))
    const dependencies = { '@dsh-mobile/pairing': 'file:pairing.tgz' }
    for (const record of records) dependencies[record.name] = 'file:../tarballs/' + record.tarball
    writeFileSync(join(consumer, 'package.json'), JSON.stringify({ name: 'pairing-fixture-consumer', version: '1.0.0', private: true, type: 'module', dependencies }, null, 2) + '\n')
    writeWorkspaceFile(consumer, records, edges)
    run(PNPM_BIN, ['install', '--lockfile-only', '--offline', '--ignore-scripts', '--config.registry=https://registry.npmjs.org/'], consumer, { env: { ...process.env, HOME: process.env.HOME ?? '/home/noirbright', NODE_PATH: '', NODE_OPTIONS: '', npm_config_registry: 'https://registry.npmjs.org/', npm_config_userconfig: join(consumer, 'npmrc') } })
    const lock = readFileSync(join(consumer, 'pnpm-lock.yaml'), 'utf8')
    writeFileSync(join(FIXTURE_ROOT, 'consumer-pnpm-lock.yaml'), lock)
    return createHash('sha256').update(lock).digest('hex')
  } finally {
    rmSync(consumer, { recursive: true, force: true })
  }
}


function main() {
  if (!ALPHA2_TARBALLS || !existsSync(ALPHA2_TARBALLS)) fail('set DSH_ALPHA2_TARBALL_ROOT to the Alpha.2 registry archives matching the Pairing package-lock')
  if (!existsSync(HISTORICAL_FIXTURE_ROOT)) fail('historical registry fixture directory is missing: ' + HISTORICAL_FIXTURE_ROOT)
  assertCleanCheckout(OFFICIAL_CHECKOUT, OFFICIAL_SOURCE, 'official DSH')
  const officialPackages = workspaceManifestIndex(OFFICIAL_CHECKOUT)
  assertCleanCheckout(TUNNEL_CHECKOUT, { tag: 'v0.1.6', commit: TUNNEL_COMMIT }, 'e2e tunnel')
  const tunnelArtifact = packTunnel()
  const oldProvenance = JSON.parse(readFileSync(join(HISTORICAL_FIXTURE_ROOT, 'PROVENANCE.json'), 'utf8'))
  const oldRecords = new Map(Object.entries(oldProvenance.packages ?? {}))
  const packageLock = validatePackageLock(ROOT)
  const rootManifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const alpha2Archives = readdirSync(ALPHA2_TARBALLS).filter(file => file.endsWith('.tgz')).sort().map(file => join(ALPHA2_TARBALLS, file))
  if (alpha2Archives.length === 0) fail('Alpha.2 registry archive directory is empty')
  const candidates = []
  for (const source of alpha2Archives) {
    if (statSync(source).size > 20_000_000) continue
    const manifest = readManifest(source)
    if (typeof manifest.name !== 'string' || !manifest.name.startsWith('@deepseek-ai/')) fail('unexpected package in Alpha.2 registry archives: ' + source)
    const sourceManifest = officialPackages.get(manifest.name)
    if (sourceManifest === undefined) fail('Alpha.2 archive package is missing from the tagged checkout: ' + manifest.name)
    if (sourceManifest.name !== manifest.name || sourceManifest.version !== manifest.version) fail('Alpha.2 archive identity disagrees with tagged checkout at ' + sourceManifest.path + ': ' + manifest.name)
    const info = inspectArchive(source)
    const expected = ALPHA2_DEV_TREE[manifest.name]
    if (expected !== undefined && (manifest.version !== expected.version || info.integrity !== expected.integrity)) fail('Alpha.2 registry archive does not match the pinned package-lock integrity: ' + manifest.name)
    candidates.push({ file: source, manifest, info, requireRootLock: true })
  }
  const historicalTarballs = join(HISTORICAL_FIXTURE_ROOT, 'tarballs')
  const thirdParty = readdirSync(historicalTarballs).filter(file => file.endsWith('.tgz')).sort().map(file => join(historicalTarballs, file))
  for (const source of thirdParty) {
    if (statSync(source).size > 20_000_000) continue
    const manifest = readManifest(source)
    const id = manifest.name + '@' + manifest.version
    const oldRecord = oldRecords.get(id)
    if (oldRecord === undefined) fail('historical archive lacks provenance: ' + id)
    verifyArchive(oldRecord, historicalTarballs)
    if (manifest.name.startsWith('@deepseek-ai/') || candidates.some(candidate => candidate.manifest.name === manifest.name && candidate.manifest.version === manifest.version)) continue
    candidates.push({ file: source, manifest, requireRootLock: false })
  }
  candidates.push({ file: tunnelArtifact.archive, manifest: tunnelArtifact.info.manifest, requireRootLock: false })
  for (const source of (existsSync(EXTRA_FIXTURE_ROOT) ? readdirSync(EXTRA_FIXTURE_ROOT).filter(file => file.endsWith('.tgz')).sort().map(file => join(EXTRA_FIXTURE_ROOT, file)) : [])) {
    const manifest = readManifest(source)
    if (candidates.some(candidate => candidate.manifest.name === manifest.name && candidate.manifest.version === manifest.version)) continue
    candidates.push({ file: source, manifest, requireRootLock: false })
  }
  const byName = new Map()
  for (const candidate of candidates) (byName.get(candidate.manifest.name) ?? (byName.set(candidate.manifest.name, []), byName.get(candidate.manifest.name))).push(candidate)
  const rootId = rootManifest.name + '@' + rootManifest.version
  const selected = new Map()
  const queue = dependencyEntries(rootManifest)
  while (queue.length > 0) {
    const edge = queue.shift()
    const child = choose(byName.get(edge.dependency) ?? [], edge.declaredRange)
    if (child === undefined) {
      if (!edge.optional) fail('missing non-optional Alpha.2 fixture for ' + edge.dependency + ' ' + edge.declaredRange)
      continue
    }
    const id = child.manifest.name + '@' + child.manifest.version
    if (selected.has(id)) continue
    selected.set(id, child)
    queue.push(...dependencyEntries(child.manifest))
  }
  if (existsSync(FIXTURE_ROOT)) fail('refusing to overwrite existing Alpha.2 fixture directory: ' + FIXTURE_ROOT)
  mkdirSync(TARBALL_ROOT, { recursive: true })
  const records = []
  for (const [id, candidate] of [...selected].sort(([left], [right]) => left.localeCompare(right))) {
    const name = candidate.manifest.name
    const version = candidate.manifest.version
    const tarball = archiveName(name, version)
    const destination = join(TARBALL_ROOT, tarball)
    copyFileSync(candidate.file, destination)
    const info = inspectArchive(destination)
    const source = sourceRecord(name, version, oldRecords, packageLock, info, candidate.requireRootLock === true)
    records.push({
      id,
      name,
      version,
      tarball,
      bytes: info.bytes,
      sha256: info.sha256,
      integrity: info.integrity,
      manifestSha256: info.manifestSha256,
      source,
      manifest: info.manifest,
    })
  }
  const byNameRecord = new Map()
  for (const record of records) (byNameRecord.get(record.name) ?? (byNameRecord.set(record.name, []), byNameRecord.get(record.name))).push(record)
  const edges = []
  for (const parent of [{ id: rootId, manifest: rootManifest }, ...records]) {
    for (const entry of dependencyEntries(parent.manifest)) {
      const child = choose(byNameRecord.get(entry.dependency) ?? [], entry.declaredRange)
      if (child === undefined) {
        if (!entry.optional) fail('selected Alpha.2 closure has no child for ' + parent.id + ' > ' + entry.dependency + ' ' + entry.declaredRange)
        continue
      }
      edges.push({ parent: parent.id, dependency: entry.dependency, declaredRange: entry.declaredRange, section: entry.section, optional: entry.optional, child: child.id })
    }
  }
  const rootArtifact = packRoot()
  if (rootArtifact.info.manifest.name !== PAIRING_NAME || rootArtifact.info.manifest.version !== PAIRING_VERSION) fail('packed Pairing artifact does not match the pinned release')
  assertTunnelManifestContract(rootArtifact.info.manifest, 'packed Pairing artifact')
  copyFileSync(rootArtifact.archive, join(FIXTURE_ROOT, PAIRING_TARBALL))
  const lockSha256 = generateConsumerLock(rootArtifact, records, edges)
  const tunnelRecord = records.find(record => record.name === TUNNEL_NAME && record.version === TUNNEL_VERSION)
  if (tunnelRecord === undefined) fail('selected closure does not contain the exact e2e tunnel release')
  const provenance = {
    schemaVersion: 1,
    source: OFFICIAL_SOURCE,
    cleanEvidence: {
      officialCheckout: { checkout: OFFICIAL_SOURCE.checkout, tag: OFFICIAL_SOURCE.tag, commit: OFFICIAL_SOURCE.commit, gitStatus: 'clean' },
      e2eCheckout: { repository: 'https://github.com/NOirBRight/dsh-e2e-tunnel.git', tag: 'v0.1.6', commit: TUNNEL_COMMIT, gitStatus: 'clean', tarball: tunnelRecord.tarball, sha256: tunnelRecord.sha256 },
    },
    purpose: 'Exact repository-owned, immutable recursive fixture tarballs for the Alpha.2 offline publication gate.',
    root: rootId,
    consumer: { lockfile: 'consumer-pnpm-lock.yaml', sha256: lockSha256 },
    rootArtifact: { tarball: PAIRING_TARBALL, name: rootArtifact.info.manifest.name, version: rootArtifact.info.manifest.version, bytes: rootArtifact.info.bytes, sha256: rootArtifact.info.sha256, integrity: rootArtifact.info.integrity, manifestSha256: rootArtifact.info.manifestSha256, npmVersion: rootArtifact.npmVersion },
    packages: Object.fromEntries(records.map(record => [record.id, { tarball: record.tarball, name: record.name, version: record.version, bytes: record.bytes, sha256: record.sha256, integrity: record.integrity, manifestSha256: record.manifestSha256, source: record.source }])),
    edges,
    regeneration: [
      'Use only a clean official DSH checkout at the pinned Alpha.2 tag and commit; the preparation command rejects a dirty or mismatched checkout.',
      'Use exact registry archives whose bytes match the Pairing package-lock; the clean tagged DSH checkout is independently checked and is not used to assert archive contents.',
      'Pack the e2e tunnel from a clean checkout at tag v0.1.6 and the pinned commit with lifecycle scripts disabled.',
      'Reuse historical registry archives only after verifying their prior immutable digests; every additional registry archive must match package-lock integrity.',
      'Keep the Pairing candidate tarball beside this provenance; verify:packed reproduces it and installs that immutable archive offline.',
    ],
  }
  writeFileSync(join(FIXTURE_ROOT, 'PROVENANCE.json'), JSON.stringify(provenance, null, 2) + '\n')
  rmSync(rootArtifact.temporary, { recursive: true, force: true })
  rmSync(tunnelArtifact.temporary, { recursive: true, force: true })
  console.log('prepared ' + records.length + ' Alpha.2 fixture archives and ' + edges.length + ' dependency edges')
}

try { main() } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 }
