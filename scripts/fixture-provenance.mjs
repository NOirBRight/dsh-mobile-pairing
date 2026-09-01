import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import semver from 'semver'
import { collectRuntimeImports, isBuiltin, packageName, readTarget, verifyArchive } from './fixture-archives.mjs'
import { createChildEnvironment } from './fixture-runtime.mjs'

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const FIXTURE_ROOT = join(PROJECT_ROOT, 'fixtures', 'alpha1')
export const PAIRING_NAME = '@dsh-mobile/pairing'
export const TUNNEL_NAME = '@dsh-mobile/e2e-tunnel'
export const TUNNEL_VERSION = '0.1.4'
export const TUNNEL_COMMIT = '6a3dcee8717bcefff9b71297d5543eadde727122'
export const OFFICIAL_SOURCE = Object.freeze({
  repository: 'https://github.com/deepseek-ai/deepseek-harness.git',
  checkout: 'dsh-v0.1.2-alpha.1-cd5ef8148158',
  tag: 'dsh-v0.1.2-alpha.1',
  commit: 'cd5ef8148158c3a752a658978873241fdf8e2bbc',
})

const CLEAN_EVIDENCE = Object.freeze({
  officialCheckout: Object.freeze({
    checkout: OFFICIAL_SOURCE.checkout,
    tag: OFFICIAL_SOURCE.tag,
    commit: OFFICIAL_SOURCE.commit,
    gitStatus: 'clean',
    archiveCount: 24,
  }),
  e2eCheckout: Object.freeze({
    repository: 'https://github.com/NOirBRight/dsh-e2e-tunnel.git',
    tag: 'v0.1.4',
    commit: TUNNEL_COMMIT,
    gitStatus: 'clean',
    tarball: 'dsh-mobile-e2e-tunnel-0.1.4.tgz',
    sha256: '700576556aa2756a886dc5c3b17b7987e48f7fe3abe4d275a80cca56d348fcc5',
  }),
})

function fail(message) {
  throw new Error('[fixture-provenance] ' + message)
}

export function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch (error) { fail('invalid JSON in ' + file + ': ' + (error instanceof Error ? error.message : String(error))) }
}

export function fixtureKey(name, version) { return name + '@' + version }

function exactFields(value, expected, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(label + ' must be an object')
  for (const [key, expectedValue] of Object.entries(expected)) if (value[key] !== expectedValue) fail(label + ' ' + key + ' mismatch')
}

function validateCleanEvidence(provenance) {
  const evidence = provenance.cleanEvidence
  if (evidence === null || typeof evidence !== 'object' || Array.isArray(evidence)) fail('clean fixture evidence is missing')
  exactFields(evidence.officialCheckout, CLEAN_EVIDENCE.officialCheckout, 'official clean checkout evidence')
  exactFields(evidence.e2eCheckout, CLEAN_EVIDENCE.e2eCheckout, 'e2e clean checkout evidence')
}

function validateSource(record, id) {
  const source = record.source
  if (source === null || typeof source !== 'object' || Array.isArray(source)) fail('missing source provenance for ' + id)
  if (source.type === 'official-checkout') {
    exactFields(source, { type: 'official-checkout', ...OFFICIAL_SOURCE }, id + ' source')
    if (typeof source.packagePath !== 'string' || source.packagePath.startsWith('/') || source.packagePath.split('/').includes('..')) fail('invalid official package path for ' + id)
    return
  }
  if (source.type === 'git') {
    exactFields(source, { type: 'git', repository: 'https://github.com/NOirBRight/dsh-e2e-tunnel.git', tag: 'v0.1.4', commit: TUNNEL_COMMIT }, id + ' source')
    return
  }
  if (source.type === 'registry-lock') {
    exactFields(source, { type: 'registry-lock', registry: 'https://registry.npmjs.org' }, id + ' source')
    if (typeof source.resolved !== 'string' || !source.resolved.startsWith('https://registry.npmjs.org/')) fail('invalid registry URL for ' + id)
    if (source.integrity !== record.integrity) fail('registry provenance integrity mismatch for ' + id)
    return
  }
  fail('unknown source provenance for ' + id)
}

function validateRootArtifact(rootArtifact, rootId) {
  if (rootArtifact === null || typeof rootArtifact !== 'object' || Array.isArray(rootArtifact)) fail('root artifact provenance is invalid')
  if (rootArtifact.name !== PAIRING_NAME || fixtureKey(rootArtifact.name, rootArtifact.version) !== rootId) fail('root artifact identity mismatch')
  if (!Number.isSafeInteger(rootArtifact.bytes) || rootArtifact.bytes <= 0 || !/^[0-9a-f]{64}$/u.test(rootArtifact.sha256) || !/^[0-9a-f]{64}$/u.test(rootArtifact.manifestSha256) || !/^sha512-[A-Za-z0-9+/]+=*$/u.test(rootArtifact.integrity)) fail('root artifact digest is invalid')
}

function verifyConsumerLock(root) {
  const consumer = root.consumer
  if (consumer === null || typeof consumer !== 'object' || Array.isArray(consumer) || consumer.lockfile !== 'consumer-pnpm-lock.yaml' || !/^[0-9a-f]{64}$/u.test(consumer.sha256)) fail('consumer lock provenance is invalid')
  const file = join(root.directory, consumer.lockfile)
  if (!existsSync(file) || !statSync(file).isFile()) fail('missing consumer lockfile')
  const lockText = readFileSync(file, 'utf8')
  const rootLock = lockText.match(/(?:^|\n)  '@dsh-mobile\/pairing@file:pairing\.tgz':\n    resolution: \{integrity: ([^,]+), tarball: file:pairing\.tgz\}\n    version: ([^\n]+)/u)
  if (rootLock === null || rootLock[1] !== root.rootArtifact.integrity || rootLock[2] !== root.rootArtifact.version) fail('consumer lock root artifact disagrees with provenance')
  const digest = createHash('sha256').update(lockText).digest('hex')
  if (digest !== consumer.sha256) fail('consumer lockfile hash mismatch')
}

/** Ensure committed fixture files are visible to Git rather than ignored. */
export function assertFixturePathsNotIgnored(root = FIXTURE_ROOT, cwd = PROJECT_ROOT) {
  const archive = readdirSync(join(root, 'tarballs')).find(file => file.endsWith('.tgz'))
  if (archive === undefined) fail('fixture archive directory is empty')
  for (const file of [join(root, 'PROVENANCE.json'), join(root, 'consumer-pnpm-lock.yaml'), join(root, 'tarballs', archive)]) {
    const path = relative(cwd, file)
    const result = spawnSync('git', ['check-ignore', '--no-index', '-q', '--', path], { cwd, encoding: 'utf8', env: createChildEnvironment() })
    if (result.status === 0) fail('fixture file is ignored: ' + path)
    if (result.status !== 1) fail('cannot check fixture ignore rules')
  }
}

/** Load, hash, and validate the repository-owned fixture archives. */
export function loadFixtureSet(root = FIXTURE_ROOT, packageRoot = PROJECT_ROOT) {
  const provenance = readJson(join(root, 'PROVENANCE.json'))
  const manifest = readJson(join(packageRoot, 'package.json'))
  if (provenance === null || typeof provenance !== 'object' || Array.isArray(provenance) || provenance.schemaVersion !== 1) fail('unsupported fixture provenance schema')
  exactFields(provenance.source, OFFICIAL_SOURCE, 'fixture source')
  validateCleanEvidence(provenance)
  if (typeof provenance.purpose !== 'string' || provenance.purpose.length === 0) fail('fixture purpose is missing')
  const rootId = fixtureKey(manifest.name, manifest.version)
  if (provenance.root !== rootId) fail('fixture root identity mismatch')
  validateRootArtifact(provenance.rootArtifact, rootId)
  verifyConsumerLock({ ...provenance, directory: root })
  if (provenance.packages === null || typeof provenance.packages !== 'object' || Array.isArray(provenance.packages)) fail('fixture packages must be an object')
  const records = new Map()
  const archives = new Map()
  const archiveNames = new Set()
  for (const [id, record] of Object.entries(provenance.packages)) {
    if (record === null || typeof record !== 'object' || Array.isArray(record) || id !== fixtureKey(record.name, record.version)) fail('fixture package identity mismatch: ' + id)
    if (records.has(id)) fail('duplicate fixture package: ' + id)
    if (archiveNames.has(record.tarball)) fail('multiple fixture packages use one archive: ' + record.tarball)
    validateSource(record, id)
    const info = verifyArchive(record, join(root, 'tarballs'))
    records.set(id, record)
    archives.set(id, info)
    archiveNames.add(record.tarball)
  }
  const officialCount = [...records.values()].filter(record => record.source?.type === 'official-checkout').length
  if (officialCount !== provenance.cleanEvidence.officialCheckout.archiveCount) fail('official clean evidence archive count mismatch')
  const tunnel = records.get(TUNNEL_NAME + '@' + TUNNEL_VERSION)
  if (tunnel?.sha256 !== provenance.cleanEvidence.e2eCheckout.sha256 || tunnel?.tarball !== provenance.cleanEvidence.e2eCheckout.tarball) fail('e2e clean evidence does not match its fixture archive')
  const actual = readdirSync(join(root, 'tarballs')).filter(file => file.endsWith('.tgz')).sort()
  const expected = [...archiveNames].sort()
  if (actual.length !== expected.length || actual.some((file, index) => file !== expected[index])) fail('fixture archive directory does not match provenance')
  if (resolve(root) === FIXTURE_ROOT) assertFixturePathsNotIgnored(root)
  return { root, provenance, records, archives, rootId }
}

function dependencyEntries(manifest) {
  const entries = []
  for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [dependency, declaredRange] of Object.entries(manifest[section] ?? {})) {
      const optional = section === 'optionalDependencies' || (section === 'peerDependencies' && manifest.peerDependenciesMeta?.[dependency]?.optional === true)
      if (optional && section === 'peerDependencies' && manifest.peerDependenciesMeta?.[dependency]?.optional !== true) continue
      entries.push({ dependency, declaredRange, section, optional })
    }
  }
  return entries
}

function parentManifest(parent, rootManifest, fixtureSet) {
  if (parent === fixtureSet.rootId) return rootManifest
  const record = fixtureSet.records.get(parent)
  if (record === undefined) fail('unknown dependency parent: ' + parent)
  return fixtureSet.archives.get(parent).manifest
}

function satisfiesChild(dependency, declaredRange, child) {
  if (dependency === TUNNEL_NAME) return declaredRange === 'github:NOirBRight/dsh-e2e-tunnel#v0.1.4' && child.source.type === 'git' && child.source.commit === TUNNEL_COMMIT
  if (/^(?:file:|link:|workspace:|npm:)/u.test(declaredRange)) fail('source alias in dependency declaration: ' + dependency)
  if (semver.validRange(declaredRange) === null || !semver.satisfies(child.version, declaredRange, { includePrerelease: true })) return false
  return true
}

/** Validate exact dependency edges without resolving through source node_modules. */
export function validateDependencyGraph(fixtureSet, rootManifest) {
  const { provenance, records, rootId } = fixtureSet
  if (provenance.root !== rootId || !Array.isArray(provenance.edges)) fail('fixture dependency edge list is invalid')
  const byEdge = new Map()
  const adjacency = new Map()
  for (const edge of provenance.edges) {
    if (edge === null || typeof edge !== 'object' || typeof edge.parent !== 'string' || typeof edge.dependency !== 'string' || typeof edge.declaredRange !== 'string' || typeof edge.section !== 'string' || typeof edge.child !== 'string') fail('invalid dependency edge')
    const key = edge.parent + '\0' + edge.dependency
    if (byEdge.has(key)) fail('dependency version conflict at ' + edge.parent + ' > ' + edge.dependency)
    const manifest = parentManifest(edge.parent, rootManifest, fixtureSet)
    if (!['dependencies', 'optionalDependencies', 'peerDependencies'].includes(edge.section) || manifest[edge.section]?.[edge.dependency] !== edge.declaredRange) fail('dependency edge does not match declaration: ' + edge.parent + ' > ' + edge.dependency)
    const declaredOptional = edge.section === 'optionalDependencies' || (edge.section === 'peerDependencies' && manifest.peerDependenciesMeta?.[edge.dependency]?.optional === true)
    if (declaredOptional !== (edge.optional === true)) fail('dependency edge optionality does not match declaration: ' + edge.parent + ' > ' + edge.dependency)
    const child = records.get(edge.child)
    if (child === undefined || child.name !== edge.dependency || !satisfiesChild(edge.dependency, edge.declaredRange, child)) fail('dependency edge selects the wrong exact archive: ' + edge.parent + ' > ' + edge.dependency)
    byEdge.set(key, edge)
    const children = adjacency.get(edge.parent) ?? []
    children.push(edge.child)
    adjacency.set(edge.parent, children)
  }
  const parents = [rootId, ...records.keys()]
  for (const parent of parents) {
    const manifest = parentManifest(parent, rootManifest, fixtureSet)
    for (const declaration of dependencyEntries(manifest)) if (!byEdge.has(parent + '\0' + declaration.dependency) && !declaration.optional) fail('missing dependency edge: ' + parent + ' > ' + declaration.dependency)
  }
  const reachable = new Set([rootId])
  const queue = [rootId]
  while (queue.length > 0) for (const child of adjacency.get(queue.shift()) ?? []) if (!reachable.has(child)) { reachable.add(child); queue.push(child) }
  for (const id of records.keys()) if (!reachable.has(id)) fail('fixture archive is outside dependency closure: ' + id)
  return byEdge
}

function sameStringMap(left, right) {
  const sort = value => Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b))
  return JSON.stringify(sort(left)) === JSON.stringify(sort(right))
}

/** Validate root package-lock identity and reject unpinned source references. */
export function validatePackageLock(packageRoot = PROJECT_ROOT, fixtureSet = undefined) {
  const manifest = readJson(join(packageRoot, 'package.json'))
  const lock = readJson(join(packageRoot, 'package-lock.json'))
  const root = lock.packages?.['']
  if (lock.name !== manifest.name || lock.version !== manifest.version || root?.name !== manifest.name || root?.version !== manifest.version) fail('package-lock identity does not match package manifest')
  for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']) if (!sameStringMap(manifest[section], root[section])) fail('package-lock root ' + section + ' does not match package manifest')
  for (const [name, spec] of Object.entries({ ...manifest.dependencies, ...manifest.optionalDependencies, ...manifest.peerDependencies, ...manifest.devDependencies })) {
    if (typeof spec !== 'string' || /^(?:file:|link:|workspace:|npm:)/u.test(spec)) fail('package manifest contains a source alias: ' + name)
    if ((spec.startsWith('git+') || spec.startsWith('github:')) && !(name === TUNNEL_NAME && spec === 'github:NOirBRight/dsh-e2e-tunnel#v0.1.4')) fail('package manifest contains an unapproved Git dependency: ' + name)
  }
  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    if (path !== '' && typeof entry === 'object' && entry !== null && typeof entry.version === 'string' && entry.version.startsWith('npm:')) fail('package-lock contains an alias at ' + path)
    if (path !== '' && typeof entry?.resolved === 'string' && (entry.resolved.startsWith('git+') || entry.resolved.startsWith('github:')) && path !== 'node_modules/' + TUNNEL_NAME) fail('package-lock contains an unapproved Git resolution at ' + path)
  }
  const tunnel = lock.packages['node_modules/' + TUNNEL_NAME]
  if (tunnel?.version !== TUNNEL_VERSION || tunnel?.resolved !== 'git+ssh://git@github.com/NOirBRight/dsh-e2e-tunnel.git#' + TUNNEL_COMMIT) fail('package-lock does not pin the exact e2e Git commit')
  for (const name of ['@deepseek-ai/dsh-client-connection', '@deepseek-ai/dsh-host-webserver', '@deepseek-ai/dsh-settings']) {
    const entry = lock.packages['node_modules/' + name]
    if (entry?.version !== '0.1.2-alpha.1') fail('package-lock does not pin alpha.1 for ' + name)
    if (fixtureSet !== undefined && entry.integrity !== fixtureSet.records.get(name + '@0.1.2-alpha.1')?.integrity) fail('package-lock integrity disagrees with fixture archive for ' + name)
  }
  if (fixtureSet !== undefined && tunnel.integrity !== fixtureSet.records.get(TUNNEL_NAME + '@' + TUNNEL_VERSION)?.integrity) fail('package-lock integrity disagrees with e2e archive')
  return lock
}

/** Reject source aliases from a package that claims to be publishable. */
export function assertPublishableManifest(manifest, label = 'package manifest') {
  for (const [name, spec] of Object.entries({ ...manifest.dependencies, ...manifest.optionalDependencies, ...manifest.peerDependencies, ...manifest.devDependencies })) {
    if (typeof spec !== 'string' || /^(?:file:|link:|workspace:|npm:)/u.test(spec)) fail(label + ' contains a source alias: ' + name)
    if ((spec.startsWith('git+') || spec.startsWith('github:')) && !(name === TUNNEL_NAME && spec === 'github:NOirBRight/dsh-e2e-tunnel#v0.1.4')) fail(label + ' contains an unapproved Git dependency: ' + name)
  }
}

/** Confirm that the packed server entrypoint names only recorded fixture packages. */
export function validateRuntimeClosure(rootInfo, rootManifest, fixtureSet) {
  const edgeMap = new Map(fixtureSet.provenance.edges.map(edge => [edge.parent + '\0' + edge.dependency, edge]))
  const rootId = fixtureSet.rootId
  const entry = rootManifest.main ?? './lib/index.js'
  const imports = collectRuntimeImports(readTarget(rootInfo, entry))
  for (const specifier of imports) {
    if (isBuiltin(specifier) || specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('data:') || specifier.startsWith('#')) continue
    const name = packageName(specifier)
    if (name === rootManifest.name) continue
    const edge = edgeMap.get(rootId + '\0' + name)
    if (edge === undefined && rootManifest.peerDependenciesMeta?.[name]?.optional === true) continue
    const child = edge === undefined ? undefined : fixtureSet.records.get(edge.child)
    if (child === undefined || child.name !== name) fail('packed runtime import lacks an exact fixture archive: ' + specifier)
  }
}
