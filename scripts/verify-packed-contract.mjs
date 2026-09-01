#!/usr/bin/env node

import { fileURLToPath } from 'node:url'
import { cleanupTemporaryTrees } from './fixture-runtime.mjs'
import { readJson, PROJECT_ROOT, loadFixtureSet, validateDependencyGraph, validatePackageLock, validateRuntimeClosure } from './fixture-provenance.mjs'
import { packProject, installConsumer, verifyPackedConsumer } from './fixture-consumer.mjs'

const project = PROJECT_ROOT

/** Verify the publish archive from source through an offline consumer. */
export async function verifyPackedContract() {
  const rootManifest = readJson(project + '/package.json')
  const fixtureSet = loadFixtureSet()
  validatePackageLock(project, fixtureSet)
  validateDependencyGraph(fixtureSet, rootManifest)
  const packed = packProject(project)
  let primaryFailed = false
  try {
    verifyPackedConsumer(packed, fixtureSet, rootManifest)
    validateRuntimeClosure(packed.info, rootManifest, fixtureSet)
    await installConsumer(packed, fixtureSet)
    console.log('[verify:packed] PASS - ' + fixtureSet.records.size + ' exact fixture archives, provenance, and isolated offline consumer verified')
  } catch (error) {
    primaryFailed = true
    throw error
  } finally {
    const failures = cleanupTemporaryTrees([packed.directory])
    if (!primaryFailed && failures.length > 0) throw new AggregateError(failures, 'packed archive cleanup failed')
  }
}


if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) await verifyPackedContract()
