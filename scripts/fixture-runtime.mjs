import { lstatSync, readdirSync, realpathSync, readFileSync, rmdirSync, statSync, unlinkSync } from 'node:fs'
import { delimiter, join } from 'node:path'

/** Registry that deliberately cannot satisfy a network request. */
export const OFFLINE_REGISTRY = 'http://127.0.0.1:1'

const SAFE_ENV_NAMES = new Set([
  'PATH',
  'HOME',
  'USER',
  'LANG',
  'TMP',
  'CI',
  'SYSTEMROOT',
  'WINDIR',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'TEMP',
])
const CONTROLLED_ENV_NAMES = new Set([
  'npm_config_globalconfig',
  'npm_config_registry',
  'npm_config_cache',
  'npm_config_userconfig',
  'npm_config_store_dir',
])
const BLOCKED_ENV_NAME = /(?:KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|AUTH|CLOUD|(?:NPM|PNPM|YARN|COREPACK)(?:_|$))/iu

function isSafeInheritedName(name) {
  return name.length > 0 && !BLOCKED_ENV_NAME.test(name) && SAFE_ENV_NAMES.has(name.toUpperCase())
}

function safeParentEnvironment() {
  const environment = {}
  for (const name of SAFE_ENV_NAMES) {
    const value = process.env[name]
    if (typeof value === 'string') environment[name] = value
  }
  return environment
}

/** Build a child environment without inheriting unlisted parent variables. */
export function createChildEnvironment(overrides = {}, source = safeParentEnvironment()) {
  const environment = {}
  for (const [name, value] of Object.entries(source)) {
    if (typeof value === 'string' && isSafeInheritedName(name)) environment[name] = value
  }
  for (const [name, value] of Object.entries(overrides)) {
    if ((isSafeInheritedName(name) || CONTROLLED_ENV_NAMES.has(name)) && typeof value === 'string') environment[name] = value
  }
  environment.NODE_PATH = ''
  environment.NODE_OPTIONS = ''
  return environment
}

function existingFile(path) {
  try {
    return statSync(path).isFile()
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'EACCES') return false
    throw error
  }
}

function isCorepackShim(path) {
  let source
  try {
    source = readFileSync(path, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'EACCES' || error?.code === 'EISDIR') return false
    throw error
  }
  return /corepack\.cjs/iu.test(source) && /runMain/iu.test(source)
}

function commandForPnpm(path) {
  if (!existingFile(path) || isCorepackShim(path)) return undefined
  return /\.(?:cjs|mjs|js)$/iu.test(path) ? { command: process.execPath, args: [path] } : { command: path, args: [] }
}

function pathPnpmCandidates() {
  const path = process.env.PATH ?? ''
  return path.split(delimiter).filter(Boolean).flatMap((directory) => [join(directory, 'pnpm'), join(directory, 'pnpm.cmd'), join(directory, 'pnpm.exe')])
}

function cachedPnpmCandidates() {
  const home = process.env.HOME
  if (typeof home !== 'string' || home.length === 0) return []
  const roots = [join(home, '.cache', 'node', 'corepack', 'v1', 'pnpm'), join(home, '.cache', 'node', 'corepack', 'pnpm')]
  return roots.flatMap((root) => {
    let versions
    try {
      versions = readdirSync(root)
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'EACCES' || error?.code === 'ENOTDIR') return []
      throw error
    }
    return versions.sort((left, right) => right.localeCompare(left, undefined, { numeric: true })).flatMap((version) => [join(root, version, 'bin', 'pnpm.cjs'), join(root, version, 'dist', 'pnpm.cjs'), join(root, version, 'bin', 'pnpm.js')])
  })
}

/** Resolve an installed pnpm implementation without invoking Corepack. */
export function resolvePnpmCommand() {
  const explicit = typeof process.env.PNPM_BIN === 'string' ? process.env.PNPM_BIN.trim() : ''
  const candidates = explicit.length > 0 ? [explicit] : [...pathPnpmCandidates(), ...cachedPnpmCandidates()]
  for (const candidate of candidates) {
    const command = commandForPnpm(candidate)
    if (command !== undefined) return command
  }
  throw new Error('real pnpm binary not found; set PNPM_BIN to an installed pnpm executable')
}

function isMissing(error) {
  return error?.code === 'ENOENT'
}

/** Remove one temporary path without following a symbolic-link root. */
export function removeTemporaryTree(path) {
  let stat
  try {
    stat = lstatSync(path)
  } catch (error) {
    if (isMissing(error)) return
    throw error
  }
  if (stat.isSymbolicLink()) {
    unlinkSync(path)
    return
  }
  let realPath
  try {
    realPath = realpathSync(path)
  } catch (error) {
    if (isMissing(error)) return
    throw error
  }
  if (!stat.isDirectory()) {
    unlinkSync(realPath)
    return
  }
  for (const entry of readdirSync(realPath)) removeTemporaryTree(join(realPath, entry))
  try {
    rmdirSync(realPath)
  } catch (error) {
    if (!isMissing(error)) throw error
  }
}

/** Remove temporary paths in reverse ownership order and return cleanup failures. */
export function cleanupTemporaryTrees(paths) {
  const failures = []
  for (const path of [...paths].reverse()) {
    try {
      removeTemporaryTree(path)
    } catch (error) {
      failures.push(error)
    }
  }
  return failures
}
