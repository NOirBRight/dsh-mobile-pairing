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
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import semver from 'semver'
import { inspectArchive } from './fixture-archives.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURE_ROOT = join(ROOT, 'fixtures', 'alpha4')
const TARBALL_ROOT = join(FIXTURE_ROOT, 'tarballs')
const ALPHA4_TARBALLS = join(resolve(process.env.DSH_ALPHA4_TARBALL_ROOT ?? '/home/noirbright/.local/opt/dsh-staging/alpha4-tarballs'))
const OLD_FIXTURE_ROOT = resolve(process.env.DSH_OLD_FIXTURE_DIR ?? join(ROOT, '..', '.alpha4-fixture-backups', 'mobile-pairing-alpha1-20260901T195120Z', 'alpha1'))
const EXTRA_FIXTURE_ROOT = resolve(process.env.DSH_EXTRA_FIXTURE_DIR ?? join(ROOT, '..', '.alpha4-artifacts'))
const ALPHA4_TAG = 'dsh-v0.1.2-alpha.4'
const ALPHA4_COMMIT = '4e84901e6471b79ec0338099867ebb4606d12bb5'
const TUNNEL_NAME = '@dsh-mobile/e2e-tunnel'
const TUNNEL_VERSION = '0.1.5'
const TUNNEL_COMMIT = '67041eb566319d4c2bdeef1f64b161b191439906'
const DEPENDENCY_FIELDS = ['dependencies', 'optionalDependencies', 'peerDependencies']
const workspaceVersions = new Map()
const REAL_PNPM = process.env.PNPM_BIN ?? '/home/noirbright/.nvm/versions/node/v22.22.2/lib/node_modules/pnpm/bin/pnpm.cjs'

function fail(message) { throw new Error('[alpha4-fixtures] ' + message) }

function run(command, args, cwd = ROOT, options = {}) {
  try {
    return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options })
  } catch (error) {
    const output = [error?.stdout, error?.stderr].filter(Boolean).map(String).join('\n')
    fail(command + ' ' + args.join(' ') + ' failed: ' + output)
  }
}

function readManifest(archive) {
  const entries = run('tar', ['-tzf', archive]).trim().split(/\r?\n/u).filter(Boolean)
  const manifest = entries.find(entry => entry.endsWith('/package.json') && entry.split('/').length === 2)
  if (manifest === undefined) fail('archive has no package manifest: ' + archive)
  return JSON.parse(run('tar', ['-xOzf', archive, manifest]))
}

function archiveName(name, version) {
  const stem = name.startsWith('@') ? name.slice(1).replaceAll('/', '-') : name.replaceAll('/', '-')
  return stem + '-' + version + '.tgz'
}

function digest(file, algorithm, encoding) { return createHash(algorithm).update(readFileSync(file)).digest(encoding) }

function normalizeValue(name, value) {
  if (typeof value !== 'string' || !value.startsWith('workspace:')) return value
  if (workspaceVersions.has(name)) return workspaceVersions.get(name)
  if (name === '@deepseek-ai/cordis') return '4.0.2'
  if (name === '@deepseek-ai/schemastery') return '3.18.2'
  if (name.startsWith('@deepseek-ai/')) return '0.1.2-alpha.4'
  return '*'
}

function normalizeManifest(manifest) {
  for (const field of [...DEPENDENCY_FIELDS, 'devDependencies']) {
    for (const [name, value] of Object.entries(manifest[field] ?? {})) manifest[field][name] = normalizeValue(name, value)
  }
  return manifest
}

function hasWorkspace(manifest) {
  return [...DEPENDENCY_FIELDS, 'devDependencies'].some(field => Object.values(manifest[field] ?? {}).some(value => typeof value === 'string' && value.startsWith('workspace:')))
}

function copyNormalized(source, destination) {
  const manifest = readManifest(source)
  if (!hasWorkspace(manifest)) {
    copyFileSync(source, destination)
    return
  }
  const temporary = mkdtempSync(join(tmpdir(), 'dsh-mobile-alpha4-'))
  try {
    run('tar', ['-xzf', source, '-C', temporary])
    const directory = readdirSync(temporary).find(entry => existsSync(join(temporary, entry, 'package.json')))
    if (directory === undefined) fail('extracted archive has no package manifest: ' + source)
    writeFileSync(join(temporary, directory, 'package.json'), JSON.stringify(normalizeManifest(JSON.parse(readFileSync(join(temporary, directory, 'package.json'), 'utf8'))), null, 2) + '\n')
    run('tar', ['-czf', destination, '-C', temporary, directory])
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

function sourceRecord(name, version, file, oldRecords) {
  const id = name + '@' + version
  if (name === TUNNEL_NAME) {
    return {
      type: 'git',
      repository: 'https://github.com/NOirBRight/dsh-e2e-tunnel.git',
      tag: 'v0.1.5',
      commit: TUNNEL_COMMIT,
    }
  }
  if (name.startsWith('@deepseek-ai/')) {
    return {
      type: 'official-checkout',
      repository: 'https://github.com/deepseek-ai/deepseek-harness.git',
      checkout: ALPHA4_TAG + '-' + ALPHA4_COMMIT.slice(0, 16),
      tag: ALPHA4_TAG,
      commit: ALPHA4_COMMIT,
      packagePath: 'packages/' + name.slice('@deepseek-ai/'.length),
    }
  }
  const old = oldRecords.get(id)
  const resolved = old?.source?.type === 'registry-lock' ? old.source.resolved : 'https://registry.npmjs.org/' + (name.startsWith('@') ? name.slice(1).replace('/', '%2f') : name) + '/-/' + file
  return { type: 'registry-lock', registry: 'https://registry.npmjs.org', resolved }
}

function parseCandidates(files) {
  return files.map(file => ({ file, manifest: readManifest(file) }))
}

function choose(candidates, range) {
  if (candidates.length > 0 && candidates[0].manifest.name === TUNNEL_NAME && range === 'github:NOirBRight/dsh-e2e-tunnel#v0.1.5') return candidates.find(candidate => candidate.manifest.version === TUNNEL_VERSION)
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

function packRoot() {
  const temporary = mkdtempSync(join(tmpdir(), 'dsh-mobile-root-pack-'))
  try {
    const output = run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], ROOT, { env: { ...process.env, HOME: temporary, npm_config_userconfig: join(temporary, 'npmrc'), npm_config_registry: 'https://registry.invalid/' } })
    const filename = JSON.parse(output)[0]?.filename
    if (typeof filename !== 'string') fail('npm pack returned no root artifact')
    const archive = join(temporary, filename)
    const info = inspectArchive(archive)
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
    run(process.execPath, [REAL_PNPM, 'install', '--lockfile-only', '--offline', '--ignore-scripts', '--config.registry=https://registry.npmjs.org/'], consumer, { env: { ...process.env, HOME: process.env.HOME ?? '/home/noirbright', NODE_PATH: '', NODE_OPTIONS: '', npm_config_registry: 'https://registry.npmjs.org/', npm_config_userconfig: join(consumer, 'npmrc') } })
    const lock = readFileSync(join(consumer, 'pnpm-lock.yaml'), 'utf8')
    writeFileSync(join(FIXTURE_ROOT, 'consumer-pnpm-lock.yaml'), lock)
    return createHash('sha256').update(lock).digest('hex')
  } finally {
    rmSync(consumer, { recursive: true, force: true })
  }
}

function pinPackageLockIntegrity(records) {
  const lockPath = join(ROOT, 'package-lock.json')
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
  for (const record of records) {
    if (record.source.type !== 'official-checkout') continue
    const entry = lock.packages?.['node_modules/' + record.name]
    if (entry !== undefined && entry.version === record.version) entry.integrity = record.integrity
  }
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n')
}

function main() {
  if (!existsSync(ALPHA4_TARBALLS)) fail('Alpha.4 tarball directory is missing: ' + ALPHA4_TARBALLS)
  if (!existsSync(OLD_FIXTURE_ROOT)) fail('archived previous fixture directory is missing: ' + OLD_FIXTURE_ROOT)
  const oldProvenance = JSON.parse(readFileSync(join(OLD_FIXTURE_ROOT, 'PROVENANCE.json'), 'utf8'))
  const oldRecords = new Map(Object.entries(oldProvenance.packages ?? {}))
  const officialSources = readdirSync(ALPHA4_TARBALLS).filter(file => file.endsWith('.tgz')).sort().map(file => join(ALPHA4_TARBALLS, file))
  for (const source of officialSources) workspaceVersions.set(readManifest(source).name, readManifest(source).version)
  const candidates = []
  for (const source of officialSources) {
    if (statSync(source).size > 20_000_000) continue
    candidates.push({ file: source, manifest: readManifest(source), official: true })
  }
  const thirdParty = readdirSync(join(OLD_FIXTURE_ROOT, 'tarballs')).filter(file => file.endsWith('.tgz')).sort().map(file => join(OLD_FIXTURE_ROOT, 'tarballs', file))
  for (const source of thirdParty) {
    if (statSync(source).size > 20_000_000) continue
    const manifest = readManifest(source)
    if (manifest.name.startsWith('@deepseek-ai/') || candidates.some(candidate => candidate.manifest.name === manifest.name && candidate.manifest.version === manifest.version)) continue
    candidates.push({ file: source, manifest, official: false })
  }
  for (const source of (existsSync(EXTRA_FIXTURE_ROOT) ? readdirSync(EXTRA_FIXTURE_ROOT).filter(file => file.endsWith('.tgz')).sort().map(file => join(EXTRA_FIXTURE_ROOT, file)) : [])) {
    const manifest = readManifest(source)
    if (candidates.some(candidate => candidate.manifest.name === manifest.name && candidate.manifest.version === manifest.version)) continue
    candidates.push({ file: source, manifest, official: false })
  }
  for (const candidate of candidates) if (candidate.official) candidate.manifest = normalizeManifest(candidate.manifest)
  const byName = new Map()
  for (const candidate of candidates) (byName.get(candidate.manifest.name) ?? (byName.set(candidate.manifest.name, []), byName.get(candidate.manifest.name))).push(candidate)
  const rootManifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const rootId = rootManifest.name + '@' + rootManifest.version
  const selected = new Map()
  const queue = dependencyEntries(rootManifest)
  while (queue.length > 0) {
    const edge = queue.shift()
    const child = choose(byName.get(edge.dependency) ?? [], edge.declaredRange)
    if (child === undefined) {
      if (!edge.optional) fail('missing non-optional Alpha.4 fixture for ' + edge.dependency + ' ' + edge.declaredRange)
      continue
    }
    const id = child.manifest.name + '@' + child.manifest.version
    if (selected.has(id)) continue
    selected.set(id, child)
    queue.push(...dependencyEntries(child.manifest))
  }
  rmSync(FIXTURE_ROOT, { recursive: true, force: true })
  mkdirSync(TARBALL_ROOT, { recursive: true })
  const records = []
  for (const [id, candidate] of [...selected].sort(([left], [right]) => left.localeCompare(right))) {
    const name = candidate.manifest.name
    const version = candidate.manifest.version
    const tarball = archiveName(name, version)
    const destination = join(TARBALL_ROOT, tarball)
    copyNormalized(candidate.file, destination)
    const info = inspectArchive(destination)
    const source = sourceRecord(name, version, tarball, oldRecords)
    if (source.type === 'registry-lock') source.integrity = info.integrity
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
        if (!entry.optional) fail('selected closure has no child for ' + parent.id + ' > ' + entry.dependency + ' ' + entry.declaredRange)
        continue
      }
      edges.push({ parent: parent.id, dependency: entry.dependency, declaredRange: entry.declaredRange, section: entry.section, optional: entry.optional, child: child.id })
    }
  }
  const rootArtifact = packRoot()
  pinPackageLockIntegrity(records)
  const lockSha256 = generateConsumerLock(rootArtifact, records, edges)
  const officialCount = records.filter(record => record.source.type === 'official-checkout').length
  const provenance = {
    schemaVersion: 1,
    source: { repository: 'https://github.com/deepseek-ai/deepseek-harness.git', checkout: ALPHA4_TAG + '-' + ALPHA4_COMMIT.slice(0, 16), tag: ALPHA4_TAG, commit: ALPHA4_COMMIT },
    cleanEvidence: {
      officialCheckout: { checkout: ALPHA4_TAG + '-' + ALPHA4_COMMIT.slice(0, 16), tag: ALPHA4_TAG, commit: ALPHA4_COMMIT, gitStatus: 'clean', archiveCount: officialCount },
      e2eCheckout: { repository: 'https://github.com/NOirBRight/dsh-e2e-tunnel.git', tag: 'v0.1.5', commit: TUNNEL_COMMIT, gitStatus: 'clean', tarball: 'dsh-mobile-e2e-tunnel-0.1.5.tgz', sha256: records.find(record => record.name === TUNNEL_NAME)?.sha256 },
    },
    purpose: 'Exact repository-owned, immutable recursive fixture tarballs for the Alpha.4 offline publication gate.',
    root: rootId,
    consumer: { lockfile: 'consumer-pnpm-lock.yaml', sha256: lockSha256 },
    rootArtifact: { name: rootArtifact.info.manifest.name, version: rootArtifact.info.manifest.version, bytes: rootArtifact.info.bytes, sha256: rootArtifact.info.sha256, integrity: rootArtifact.info.integrity, manifestSha256: rootArtifact.info.manifestSha256 },
    packages: Object.fromEntries(records.map(record => [record.id, { tarball: record.tarball, name: record.name, version: record.version, bytes: record.bytes, sha256: record.sha256, integrity: record.integrity, manifestSha256: record.manifestSha256, source: record.source }])),
    edges,
    regeneration: [
      'Build each official package from the clean Alpha.4 checkout at the pinned commit; workspace ranges are normalized only in fixture metadata so the offline graph is exact.',
      'Pack the e2e tunnel from Git tag v0.1.5 at its pinned commit without editing package contents.',
      'Reuse registry archives from the archived previous closure and verify every recorded digest before adding it.',
      'Re-run the pack gate after every source or dependency change; never use workspace links in the published consumer.',
    ],
  }
  writeFileSync(join(FIXTURE_ROOT, 'PROVENANCE.json'), JSON.stringify(provenance, null, 2) + '\n')
  rmSync(rootArtifact.temporary, { recursive: true, force: true })
  console.log('prepared ' + records.length + ' Alpha.4 fixture archives and ' + edges.length + ' dependency edges')
}

try { main() } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 }
