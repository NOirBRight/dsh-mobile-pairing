import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import semver from 'semver'
import { collectRuntimeImports, isBuiltin, packageName, readTarget, verifyArchive } from './fixture-archives.mjs'
import { createChildEnvironment } from './fixture-runtime.mjs'

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const FIXTURE_ROOT = join(PROJECT_ROOT, 'fixtures', 'alpha2')
export const PAIRING_NAME = '@dsh-mobile/pairing'
export const PAIRING_VERSION = '0.1.21'
export const TUNNEL_NAME = '@dsh-mobile/e2e-tunnel'
export const TUNNEL_VERSION = '0.1.6'
export const TUNNEL_COMMIT = 'b9c36009dea33f4553b87863f76b41f5f5f6ed17'
export const TUNNEL_SPEC = 'github:NOirBRight/dsh-e2e-tunnel#v0.1.6'
export const PAIRING_TARBALL = 'dsh-mobile-pairing-' + PAIRING_VERSION + '.tgz'
export const OFFICIAL_SOURCE = Object.freeze({
  repository: 'https://github.com/deepseek-ai/deepseek-harness.git',
  checkout: 'dsh-v0.1.7-alpha.2-00102833dfaee1da',
  tag: 'dsh-v0.1.7-alpha.2',
  commit: '00102833dfaee1da9f48a3a8eae9d34005a75218',
})
export const ALPHA2_DEV_TREE = Object.freeze({
  '@deepseek-ai/dsh-host-webserver': Object.freeze({ version: '0.1.7-alpha.2', integrity: 'sha512-H97nDYHfWD238ayeOogFowC2v7Tm1R6hM6scIsFxcstu+Xz4B1em/Zw5NVzV6zBherCoEqmtvUDhM3ZEDLKSmg==' }),
  '@deepseek-ai/dsh-client-connection': Object.freeze({ version: '0.1.7-alpha.2', integrity: 'sha512-fymg/MniqtZ4yM1oVvLrXRpHxYDiAuuMRXJYL9Pa8neFOrWUl7aFxgaW1dsfWryx3rSDVlcdM5OLVpldwewnQw==' }),
})
export const RC1_DEV_TREE = Object.freeze({
  '@deepseek-ai/dsh-brand': Object.freeze({ version: '0.1.7-rc.1', integrity: 'sha512-KvfCuVAiosEyqb37LbGwi2Li90VZXcIDaqM+CxV9qNoyQmGezh8UjFkNQENieT2hPzfQ4CiADbA3vJeLpeQm/g==' }),
  '@deepseek-ai/dsh-invariants': Object.freeze({ version: '0.1.7-rc.1', integrity: 'sha512-YpV5n0THgTw98raUaqblDYNWxraX5A7oxOIHcr8w8eJyWE+XEJLePITeAwxZfwD+ElonZIvijZbk2twqFANNhg==' }),
  '@deepseek-ai/dsh-session': Object.freeze({ version: '0.1.7-rc.1', integrity: 'sha512-5R3g4UQ7KoezqHJ9LxqMgaGZWw0R3zZCypPm4R5dPxSB8xHCQvjfgaCrHYdPBT63B4coxollWupjyQTOdiWSKQ==' }),
  '@deepseek-ai/dsh-host-webserver': Object.freeze({ version: '0.1.7-rc.1', integrity: 'sha512-av/dIbhYjR3OEwvKQTSXuSVLf+lPS3a4FKEDK9A89TdzY0VrI5g4lwMQ93StROrX/GOOR/oa1U3TyJpD4qfcfw==' }),
  '@deepseek-ai/dsh-scope': Object.freeze({ version: '0.1.7-rc.1', integrity: 'sha512-douIAb+JNUHa6NoLvrgxY3f04NYfR6ZWcdmRnng5KTu+dbR/RrQLsxcG5unOJod1bn6aHQI3PLQ+FOP0zPaZTg==' }),
  '@deepseek-ai/dsh-client-locale': Object.freeze({ version: '0.1.7-rc.1', integrity: 'sha512-7DmI05k+FUZaDk0SEqJahDQn75SoENuUeoFjPG1nzXXxU8xq1KsE5kWgKlwtbOTCpbvn/ax4F5FhRjZnpJZQkg==' }),
  '@deepseek-ai/dsh-client-ui-renderer': Object.freeze({ version: '0.1.7-rc.1', integrity: 'sha512-16hZTlTJbnHis8WfAZW4tIYeoULac7dG/onM1M7e2FWNeTEISUGBKPSAJYhxrym5FK3yEma2vn/udxQSXC0P2g==' }),
  '@deepseek-ai/dsh-client-ui-settings': Object.freeze({ version: '0.1.7-rc.1', integrity: 'sha512-FrcpAwLUxzI3nkgWj1OEzRbIC9Sf+O+FH8EFDTLozg0tlrMPpI/z5dEpHir1Amae/CPUa7dCG3OJN+RYy9m+Wg==' }),
  '@deepseek-ai/dsh-client-ui-slots': Object.freeze({ version: '0.1.7-rc.1', integrity: 'sha512-w6rj/Jl8Q3RUJMVxrN6xea1CjdyXomAm7M2/CVbbxXMf582ap20lfK/Hj9qL/WTorri8kRVg78AxS+6AiUJOKw==' }),
  '@deepseek-ai/dsh-client-connection': Object.freeze({ version: '0.1.7-rc.1', integrity: 'sha512-lEH9Aw+rlQJIzlYl53tNZ6Zz60H/6CuBMmLO+f0K2kuBqgD4wbHzG8iMNPTrf6k4puPtoLM4/bNEIaSi8adehA==' }),
})

const CLEAN_EVIDENCE = Object.freeze({
  officialCheckout: Object.freeze({
    checkout: OFFICIAL_SOURCE.checkout,
    tag: OFFICIAL_SOURCE.tag,
    commit: OFFICIAL_SOURCE.commit,
    gitStatus: 'clean',
  }),
  e2eCheckout: Object.freeze({
    repository: 'https://github.com/NOirBRight/dsh-e2e-tunnel.git',
    tag: 'v0.1.6',
    commit: TUNNEL_COMMIT,
    gitStatus: 'clean',
    tarball: 'dsh-mobile-e2e-tunnel-0.1.6.tgz',
  }),
})

function fail(message) {
  throw new Error('[fixture-provenance] ' + message)
}

export function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch (error) { fail('invalid JSON in ' + file + ': ' + (error instanceof Error ? error.message : String(error))) }
}

export function fixtureKey(name, version) { return name + '@' + version }

export function assertTunnelManifestContract(manifest, label = 'Pairing manifest') {
  if (Object.hasOwn(manifest.dependencies ?? {}, TUNNEL_NAME) || Object.hasOwn(manifest.optionalDependencies ?? {}, TUNNEL_NAME)) fail(label + ' declares e2e tunnel as a runtime dependency')
  if (manifest.peerDependencies?.[TUNNEL_NAME] !== TUNNEL_VERSION || manifest.peerDependenciesMeta?.[TUNNEL_NAME]?.optional === true) fail(label + ' must require e2e tunnel peer version ' + TUNNEL_VERSION)
  if (manifest.devDependencies?.[TUNNEL_NAME] !== TUNNEL_SPEC) fail(label + ' does not pin the e2e tunnel build dependency to v0.1.6')
}

function exactFields(value, expected, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(label + ' must be an object')
  for (const [key, expectedValue] of Object.entries(expected)) if (value[key] !== expectedValue) fail(label + ' ' + key + ' mismatch')
}

function validateCleanEvidence(provenance) {
  const evidence = provenance.cleanEvidence
  if (evidence === null || typeof evidence !== 'object' || Array.isArray(evidence)) fail('clean fixture evidence is missing')
  exactFields(evidence.officialCheckout, CLEAN_EVIDENCE.officialCheckout, 'official clean checkout evidence')
  exactFields(evidence.e2eCheckout, CLEAN_EVIDENCE.e2eCheckout, 'e2e clean checkout evidence')
  if (!/^[0-9a-f]{64}$/u.test(evidence.e2eCheckout.sha256)) fail('e2e clean checkout digest is invalid')
}

function validateSource(record, id) {
  const source = record.source
  if (source === null || typeof source !== 'object' || Array.isArray(source)) fail('missing source provenance for ' + id)
  if (source.type === 'git') {
    exactFields(source, { type: 'git', repository: 'https://github.com/NOirBRight/dsh-e2e-tunnel.git', tag: 'v0.1.6', commit: TUNNEL_COMMIT }, id + ' source')
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
  if (rootArtifact.name !== PAIRING_NAME || fixtureKey(rootArtifact.name, rootArtifact.version) !== rootId || rootArtifact.tarball !== PAIRING_TARBALL) fail('root artifact identity mismatch')
  if (typeof rootArtifact.npmVersion !== 'string' || rootArtifact.npmVersion.length === 0 || !Number.isSafeInteger(rootArtifact.bytes) || rootArtifact.bytes <= 0 || !/^[0-9a-f]{64}$/u.test(rootArtifact.sha256) || !/^[0-9a-f]{64}$/u.test(rootArtifact.manifestSha256) || !/^sha512-[A-Za-z0-9+/]+=*$/u.test(rootArtifact.integrity)) fail('root artifact digest is invalid')
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
  for (const file of [
    join(root, 'PROVENANCE.json'),
    join(root, 'consumer-pnpm-lock.yaml'),
    join(root, 'tarballs', archive),
    join(root, PAIRING_TARBALL),
  ]) {
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
  if (manifest.name !== PAIRING_NAME || manifest.version !== PAIRING_VERSION) fail('package manifest is not the pinned Pairing release')
  assertTunnelManifestContract(manifest)
  const rootId = fixtureKey(manifest.name, manifest.version)
  if (provenance.root !== rootId) fail('fixture root identity mismatch')
  validateRootArtifact(provenance.rootArtifact, rootId)
  verifyConsumerLock({ ...provenance, directory: root })
  const rootArchive = verifyArchive(provenance.rootArtifact, root)
  assertTunnelManifestContract(rootArchive.manifest, 'root artifact manifest')
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
  const tunnel = records.get(TUNNEL_NAME + '@' + TUNNEL_VERSION)
  if (tunnel === undefined || tunnel.tarball !== CLEAN_EVIDENCE.e2eCheckout.tarball || tunnel.sha256 !== provenance.cleanEvidence.e2eCheckout.sha256) fail('e2e clean evidence does not match its fixture archive')
  for (const [name, expectedRecord] of Object.entries(ALPHA2_DEV_TREE)) {
    const record = records.get(name + '@' + expectedRecord.version)
    if (record?.integrity !== expectedRecord.integrity) fail('fixture closure does not contain the pinned alpha2 registry archive for ' + name)
  }
  const actual = readdirSync(join(root, 'tarballs')).filter(file => file.endsWith('.tgz')).sort()
  const expected = [...archiveNames].sort()
  if (actual.length !== expected.length || actual.some((file, index) => file !== expected[index])) fail('fixture archive directory does not match provenance')
  if (resolve(root) === FIXTURE_ROOT) assertFixturePathsNotIgnored(root)
  return { root, provenance, records, archives, rootArchive, rootId }
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
  if (dependency === TUNNEL_NAME) return declaredRange === TUNNEL_VERSION && child.version === TUNNEL_VERSION && child.source.type === 'git' && child.source.commit === TUNNEL_COMMIT
  if (declaredRange === '*') return true
  if (semver.validRange(declaredRange) === null || !semver.satisfies(child.version, declaredRange, { includePrerelease: true })) return false
  return true
}

/** Validate exact dependency edges without resolving through source node_modules. */
export function validateDependencyGraph(fixtureSet, rootManifest) {
  const { provenance, records, rootId } = fixtureSet
  assertTunnelManifestContract(rootManifest, 'root package manifest')
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
export function validatePackageLock(packageRoot = PROJECT_ROOT) {
  const manifest = readJson(join(packageRoot, 'package.json'))
  const lock = readJson(join(packageRoot, 'package-lock.json'))
  const root = lock.packages?.['']
  if (manifest.name !== PAIRING_NAME || manifest.version !== PAIRING_VERSION) fail('package manifest is not the pinned Pairing release')
  assertTunnelManifestContract(manifest, 'package manifest')
  if (lock.name !== manifest.name || lock.version !== manifest.version || root?.name !== manifest.name || root?.version !== manifest.version) fail('package-lock identity does not match package manifest')
  for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']) if (!sameStringMap(manifest[section], root[section])) fail('package-lock root ' + section + ' does not match package manifest')
  for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']) {
    for (const [name, spec] of Object.entries(manifest[section] ?? {})) {
      if (typeof spec !== 'string' || /^(?:file:|link:|workspace:|npm:)/u.test(spec)) fail('package manifest contains a source alias: ' + name)
      if ((spec.startsWith('git+') || spec.startsWith('github:')) && !(section === 'devDependencies' && name === TUNNEL_NAME && spec === TUNNEL_SPEC)) fail('package manifest contains an unapproved Git dependency: ' + name)
    }
  }
  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    if (path !== '' && typeof entry === 'object' && entry !== null && typeof entry.version === 'string' && entry.version.startsWith('npm:')) fail('package-lock contains an alias at ' + path)
    if (path !== '' && typeof entry?.resolved === 'string' && (entry.resolved.startsWith('git+') || entry.resolved.startsWith('github:')) && path !== 'node_modules/' + TUNNEL_NAME) fail('package-lock contains an unapproved Git resolution at ' + path)
  }
  const tunnel = lock.packages['node_modules/' + TUNNEL_NAME]
  if (tunnel?.version !== TUNNEL_VERSION || tunnel?.resolved !== 'git+ssh://git@github.com/NOirBRight/dsh-e2e-tunnel.git#' + TUNNEL_COMMIT) fail('package-lock does not pin the exact e2e Git commit')
  for (const [name, expected] of Object.entries(RC1_DEV_TREE)) {
    const entry = lock.packages['node_modules/' + name]
    if (entry?.version !== expected.version) fail('package-lock does not pin rc1 for ' + name)
    if (entry.integrity !== expected.integrity) fail('package-lock integrity disagrees with the rc1 registry bytes for ' + name)
  }
  return lock
}

/** Reject source aliases from a package that claims to be publishable. */
export function assertPublishableManifest(manifest, label = 'package manifest') {
  if (manifest.name === PAIRING_NAME) assertTunnelManifestContract(manifest, label)
  for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']) {
    for (const [name, spec] of Object.entries(manifest[section] ?? {})) {
      if (typeof spec !== 'string' || /^(?:file:|link:|workspace:|npm:)/u.test(spec)) fail(label + ' contains a source alias: ' + name)
      if ((spec.startsWith('git+') || spec.startsWith('github:')) && !(section === 'devDependencies' && name === TUNNEL_NAME && spec === TUNNEL_SPEC)) fail(label + ' contains an unapproved Git dependency: ' + name)
    }
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
