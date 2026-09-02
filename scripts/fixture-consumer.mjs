import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { copyFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import semver from 'semver'
import { inspectArchive } from './fixture-archives.mjs'
import { assertPublishableManifest, PROJECT_ROOT } from './fixture-provenance.mjs'
import { cleanupTemporaryTrees, createChildEnvironment, OFFLINE_REGISTRY, resolvePnpmCommand } from './fixture-runtime.mjs'

function redactChildOutput(value) {
  return String(value)
    .replace(/([?&](?:token|launchToken|launch-token)=)[^&#\s]*/giu, '$1[redacted]')
    .replace(/((?:authorization|proxy-authorization|cookie|set-cookie)\s*[:=]\s*)[^;\s,]*/giu, '$1[redacted]')
    .replace(/[\r\n]+/gu, ' ')
}

function fail(message) {
  throw new Error('[fixture-consumer] ' + redactChildOutput(message))
}

function command(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options, env: createChildEnvironment(options.env ?? {}) })
  if (result.error !== undefined || result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(value => typeof value === 'string' && value.length > 0).join('\n')
    fail(command + ' ' + args.join(' ') + ' failed' + (output.length > 0 ? ': ' + output : ''))
  }
  return typeof result.stdout === 'string' ? result.stdout : ''
}

let pnpmCommand
function runPnpm(args, options = {}) {
  pnpmCommand ??= resolvePnpmCommand()
  return command(pnpmCommand.command, [...pnpmCommand.args, ...args], options)
}

function isolatedEnvironment(cache, store) {
  return {
    HOME: cache,
    NODE_PATH: '',
    NODE_OPTIONS: '',
    npm_config_globalconfig: join(cache, 'global.npmrc'),
    npm_config_registry: OFFLINE_REGISTRY,
    npm_config_cache: cache,
    npm_config_store_dir: store,
    npm_config_userconfig: join(cache, 'user.npmrc'),
  }
}

function directDependencies(fixtureSet) {
  const selected = new Map()
  for (const record of fixtureSet.records.values()) {
    const list = selected.get(record.name) ?? []
    list.push(record)
    selected.set(record.name, list)
  }
  const rootEdges = new Map(fixtureSet.provenance.edges.filter(edge => edge.parent === fixtureSet.rootId).map(edge => [edge.dependency, edge.child]))
  const dependencies = { '@dsh-mobile/pairing': 'file:pairing.tgz' }
  for (const [name, records] of [...selected].sort(([left], [right]) => left.localeCompare(right))) {
    const exact = rootEdges.get(name)
    const record = exact === undefined ? records.sort((left, right) => semver.rcompare(left.version, right.version))[0] : fixtureSet.records.get(exact)
    if (record === undefined) fail('root fixture edge selects no archive for ' + name)
    dependencies[name] = 'file:../tarballs/' + record.tarball
  }
  return dependencies
}

function writeFixtureWorkspace(consumer, fixtureSet) {
  const byName = new Map()
  for (const record of fixtureSet.records.values()) (byName.get(record.name) ?? (byName.set(record.name, []), byName.get(record.name))).push(record)
  const byId = fixtureSet.records
  const overrides = {}
  for (const [name, records] of byName) if (records.length === 1) overrides[name] = 'file:../tarballs/' + records[0].tarball
  for (const edge of fixtureSet.provenance.edges) {
    const child = byId.get(edge.child)
    const parent = byId.get(edge.parent)
    if (child === undefined || (byName.get(child.name)?.length ?? 0) === 1) continue
    const parentName = edge.parent.slice(0, edge.parent.lastIndexOf('@'))
    const parentSelector = parent === undefined || (byName.get(parent.name)?.length ?? 0) === 1 ? parentName : edge.parent
    overrides[parentSelector + '>' + edge.dependency] = 'file:../tarballs/' + child.tarball
  }
  const lines = ['packages:', '  - .', 'overrides:']
  for (const [key, value] of Object.entries(overrides).sort(([left], [right]) => left.localeCompare(right))) lines.push('  ' + JSON.stringify(key) + ': ' + JSON.stringify(value))
  writeFileSync(join(consumer, 'pnpm-workspace.yaml'), lines.join('\n') + '\n')
}

function collectInstalled(tree, result = new Set()) {
  for (const [name, dependency] of Object.entries(tree?.dependencies ?? {})) {
    if (typeof dependency?.version === 'string' && semver.valid(dependency.version) !== null) result.add(name + '@' + dependency.version)
    collectInstalled(dependency, result)
  }
  return result
}

function verifyInstalledTree(tree, fixtureSet) {
  const expected = new Set([fixtureSet.rootId, ...fixtureSet.records.keys()])
  const actual = collectInstalled(Array.isArray(tree) ? tree[0] : tree)
  for (const id of expected) if (!actual.has(id)) fail('offline consumer did not install exact archive ' + id)
  for (const id of actual) if (!expected.has(id)) fail('offline consumer installed an unproven package ' + id)
}

async function smokeInstalledModules(consumer) {
  const require = createRequire(join(consumer, 'package.json'))
  const resolveInstalled = specifier => pathToFileURL(require.resolve(specifier)).href
  await import(resolveInstalled('@deepseek-ai/dsh-host-webserver'))
  await import(resolveInstalled('@deepseek-ai/dsh-client-connection'))
  await import(resolveInstalled('@dsh-mobile/pairing'))
  const registrations = []
  const previousWindow = globalThis.window
  globalThis.window = { __ModuleLoader__: { load: registration => registrations.push(registration) } }
  try {
    for (const specifier of ['@deepseek-ai/dsh-client-connection/client', '@dsh-mobile/pairing/client']) await import(resolveInstalled(specifier) + '?pairing-fixture-smoke=1')
    for (const registration of registrations) {
      if (typeof registration?.id !== 'string' || typeof registration.factory !== 'function') fail('invalid ModuleLoader registration')
      const loaded = registration.factory(require)
      if (loaded === null || typeof loaded !== 'object') fail('ModuleLoader factory returned no exports for ' + registration.id)
    }
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
  const ids = registrations.map(registration => registration.id).sort()
  if (JSON.stringify(ids) !== JSON.stringify(['@deepseek-ai/dsh-client-connection', '@dsh-mobile/pairing'])) fail('installed client ModuleLoader registrations are incomplete')
}

/** Pack the current source package without inspecting its dependency directories. */
export function packProject(project = PROJECT_ROOT) {
  const directory = mkdtempSync(join(tmpdir(), 'pairing-pack-'))
  try {
    const globalConfig = join(directory, 'global.npmrc')
    const userConfig = join(directory, 'user.npmrc')
    writeFileSync(globalConfig, '')
    writeFileSync(userConfig, '')
    const output = command('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', directory], {
      cwd: project,
      env: {
        HOME: directory,
        npm_config_globalconfig: globalConfig,
        npm_config_registry: OFFLINE_REGISTRY,
        npm_config_userconfig: userConfig,
      },
    })
    const result = JSON.parse(output)[0]
    if (typeof result?.filename !== 'string') fail('npm pack returned no tarball')
    const archive = join(directory, result.filename)
    const info = inspectArchive(archive)
    return { directory, archive, info }
  } catch (error) {
    cleanupTemporaryTrees([directory])
    throw error
  }
}

/** Install only the committed fixture archives in a fresh offline consumer. */
export async function installConsumer(packed, fixtureSet) {
  const temporary = []
  const makeTemporary = (parent, prefix) => {
    const directory = mkdtempSync(join(parent, prefix))
    temporary.push(directory)
    return directory
  }
  let primaryFailed = false
  try {
    const consumer = makeTemporary(fixtureSet.root, '.consumer-')
    const store = makeTemporary(tmpdir(), 'pairing-store-')
    const cache = makeTemporary(tmpdir(), 'pairing-cache-')
    copyFileSync(packed.archive, join(consumer, 'pairing.tgz'))
    copyFileSync(join(fixtureSet.root, fixtureSet.provenance.consumer.lockfile), join(consumer, 'pnpm-lock.yaml'))
    writeFileSync(join(consumer, 'package.json'), JSON.stringify({
      name: 'pairing-fixture-consumer',
      version: '1.0.0',
      private: true,
      type: 'module',
      dependencies: directDependencies(fixtureSet),
    }, null, 2) + '\n')
    writeFixtureWorkspace(consumer, fixtureSet)
    const environment = isolatedEnvironment(cache, store)
    writeFileSync(environment.npm_config_globalconfig, '')
    writeFileSync(environment.npm_config_userconfig, '')
    runPnpm(['install', '--offline', '--frozen-lockfile', '--ignore-scripts', '--store-dir', store, '--config.registry=' + OFFLINE_REGISTRY], { cwd: consumer, env: environment })
    const tree = JSON.parse(runPnpm(['list', '--json', '--depth', 'Infinity'], { cwd: consumer, env: environment }))
    verifyInstalledTree(tree, fixtureSet)
    await smokeInstalledModules(consumer)
  } catch (error) {
    primaryFailed = true
    throw error
  } finally {
    const failures = cleanupTemporaryTrees(temporary)
    if (!primaryFailed && failures.length > 0) fail('temporary consumer cleanup failed: ' + failures.map(redactChildOutput).join('; '))
  }
}

/** Verify the packed root and then exercise it through the isolated consumer. */
export function verifyPackedConsumer(packed, fixtureSet, rootManifest) {
  if (packed.info.manifest.name !== rootManifest.name || packed.info.manifest.version !== rootManifest.version) fail('packed package identity mismatch')
  const artifact = fixtureSet.provenance.rootArtifact
  if (packed.info.bytes !== artifact.bytes || packed.info.sha256 !== artifact.sha256 || packed.info.integrity !== artifact.integrity || packed.info.manifestSha256 !== artifact.manifestSha256) fail('packed root artifact digest disagrees with provenance')
  assertPublishableManifest(packed.info.manifest, 'packed package')
  if ([...packed.info.entrySet].some(entry => entry.includes('/node_modules/'))) fail('packed package contains node_modules')
  return packed
}
