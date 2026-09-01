import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { builtinModules } from 'node:module'
import { existsSync, lstatSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { createChildEnvironment } from './fixture-runtime.mjs'

function fail(message) {
  throw new Error('[fixture-archive] ' + message)
}

function tarOutput(args, archive) {
  try {
    return execFileSync('tar', [...args, archive], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, env: createChildEnvironment() })
  } catch (error) {
    fail('cannot inspect ' + archive + ': ' + (error instanceof Error ? error.message : String(error)))
  }
}

function safeEntry(entry) {
  if (entry.includes('\\') || entry.startsWith('/') || entry.startsWith('./')) fail('unsafe archive entry: ' + entry)
  const value = entry.endsWith('/') ? entry.slice(0, -1) : entry
  if (value.length === 0 || value.split('/').some(part => part.length === 0 || part === '.' || part === '..')) fail('unsafe archive entry: ' + entry)
  return value
}

function manifestPath(entries) {
  const paths = entries.filter(entry => entry.endsWith('/package.json') && entry.split('/').length === 2)
  if (paths.length !== 1) fail('archive must contain one package manifest')
  return paths[0]
}

function archiveTarget(target) {
  if (typeof target !== 'string' || target.startsWith('/') || target.includes('\\')) fail('invalid package target: ' + String(target))
  const value = target.startsWith('./') ? target.slice(2) : target
  if (value.split('/').includes('..')) fail('package target escapes archive root: ' + target)
  return value
}

function targetCandidates(prefix, target, entries) {
  const value = archiveTarget(target)
  const candidates = [prefix + value, prefix + value + '.js', prefix + value + '.mjs', prefix + value + '.cjs', prefix + value + '.json', prefix + value + '.d.ts']
  for (const extension of ['.js', '.mjs', '.cjs', '.json', '.d.ts']) candidates.push(prefix + value + '/index' + extension)
  return [...new Set(candidates.filter(candidate => entries.has(candidate)))]
}

function manifestTargets(manifest) {
  const targets = []
  if (typeof manifest.main === 'string' && manifest.main.length > 0) targets.push(['main', manifest.main])
  if (typeof manifest.types === 'string' && manifest.types.length > 0) targets.push(['types', manifest.types])
  if (typeof manifest.bin === 'string') targets.push(['bin', manifest.bin])
  else if (manifest.bin !== undefined) {
    if (typeof manifest.bin !== 'object' || manifest.bin === null || Array.isArray(manifest.bin)) fail('invalid bin field in ' + String(manifest.name))
    for (const target of Object.values(manifest.bin)) if (typeof target === 'string') targets.push(['bin', target])
  }
  return targets
}

function readArchiveEntry(archive, entry) {
  try {
    return execFileSync('tar', ['-xOzf', archive, entry], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, env: createChildEnvironment() })
  } catch (error) {
    fail('cannot read ' + entry + ' from ' + archive + ': ' + (error instanceof Error ? error.message : String(error)))
  }
}

/** Inspect one archive without consulting package-manager state. */
export function inspectArchive(input) {
  const archive = resolve(input)
  if (!existsSync(archive) || !statSync(archive).isFile()) fail('missing archive: ' + archive)
  if (lstatSync(archive).isSymbolicLink()) fail('archive must not be a symbolic link: ' + archive)
  const rawEntries = tarOutput(['-tzf'], archive).trim().split(/\r?\n/u).filter(Boolean)
  if (rawEntries.length === 0) fail('archive is empty: ' + archive)
  const entries = rawEntries.map(safeEntry)
  const entrySet = new Set(entries)
  if (entrySet.size !== entries.length) fail('archive contains duplicate entries: ' + archive)
  const modes = tarOutput(['-tvzf'], archive).split(/\r?\n/u).map(line => line.trimStart()).filter(Boolean)
  if (modes.some(line => line[0] !== '-' && line[0] !== 'd')) fail('archive contains a link or special file: ' + archive)
  if (entries.some(entry => entry.split('/').includes('node_modules') && entry.endsWith('/package.json'))) fail('archive contains a nested package installation: ' + archive)
  const packageJson = manifestPath(rawEntries)
  const prefix = packageJson.slice(0, -'package.json'.length)
  const root = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix
  if ([...entrySet].some(entry => entry !== root && !entry.startsWith(prefix))) fail('archive entry is outside package root: ' + entry)
  let manifest
  try { manifest = JSON.parse(readArchiveEntry(archive, packageJson)) } catch (error) { fail('invalid package manifest in ' + archive + ': ' + (error instanceof Error ? error.message : String(error))) }
  const targets = new Set()
  for (const [label, target] of manifestTargets(manifest)) {
    const candidates = targetCandidates(prefix, target, entrySet)
    if (candidates.length === 0) fail(manifest.name + ' ' + label + ' points to a missing archive entry: ' + target)
    for (const candidate of candidates) targets.add(candidate)
  }
  const bytes = readFileSync(archive)
  const manifestBytes = Buffer.from(readArchiveEntry(archive, packageJson))
  return {
    archive,
    entries: rawEntries,
    entrySet,
    prefix,
    manifestPath: packageJson,
    manifest,
    targets,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64'),
    manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
  }
}

/** Verify one committed archive against its provenance record. */
export function verifyArchive(record, archiveRoot) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) fail('invalid archive record')
  if (typeof record.name !== 'string' || typeof record.version !== 'string') fail('archive record identity is missing')
  const id = record.name + '@' + record.version
  if (typeof record.tarball !== 'string' || record.tarball.length === 0 || record.tarball !== record.tarball.split('/').at(-1) || record.tarball.includes('\\')) fail('archive filename is not a basename: ' + id)
  if (!Number.isSafeInteger(record.bytes) || record.bytes <= 0) fail('invalid archive byte count: ' + id)
  if (!/^[0-9a-f]{64}$/u.test(record.sha256) || !/^[0-9a-f]{64}$/u.test(record.manifestSha256) || !/^sha512-[A-Za-z0-9+/]+=*$/u.test(record.integrity)) fail('invalid archive digest: ' + id)
  const info = inspectArchive(resolve(archiveRoot, record.tarball))
  if (info.manifest.name !== record.name || info.manifest.version !== record.version) fail('archive manifest identity mismatch: ' + id)
  if (info.bytes !== record.bytes || info.sha256 !== record.sha256 || info.integrity !== record.integrity || info.manifestSha256 !== record.manifestSha256) fail('archive digest mismatch: ' + id)
  return info
}

/** Collect literal external module specifiers from emitted JavaScript. */
export function collectRuntimeImports(source) {
  const imports = new Set()
  for (const pattern of [
    /\b(?:import|export)\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/gu,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gu,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/gu,
  ]) for (const match of source.matchAll(pattern)) imports.add(match[1])
  return imports
}

export function packageName(specifier) {
  return specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]
}

export function isBuiltin(specifier) {
  return specifier.startsWith('node:') || builtinModules.includes(specifier)
}

/** Return the first archive entry that implements a required target. */
export function readTarget(info, target) {
  const candidates = targetCandidates(info.prefix, target, info.entrySet)
  if (candidates.length === 0) fail('missing archive target: ' + target)
  return readArchiveEntry(info.archive, candidates[0])
}
