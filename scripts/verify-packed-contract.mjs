#!/usr/bin/env node

import { fileURLToPath } from 'node:url'
import { cleanupTemporaryTrees } from './fixture-runtime.mjs'
import { readJson, PROJECT_ROOT, loadFixtureSet, validateDependencyGraph, validatePackageLock, validateRuntimeClosure } from './fixture-provenance.mjs'
import { packProject, installConsumer, verifyPackedConsumer } from './fixture-consumer.mjs'

const project = PROJECT_ROOT

/** Verify the publish archive from source through an offline consumer. */
export async function verifyPackedContract() {
  console.error('[verify:packed] loading fixture set')
  const rootManifest = readJson(project + '/package.json')
  const fixtureSet = loadFixtureSet()
  console.error('[verify:packed] validating package lock and dependency graph')
  validatePackageLock(project)
  validateDependencyGraph(fixtureSet, rootManifest)
  console.error('[verify:packed] packing candidate')
  const packed = packProject(project)
  let primaryFailed = false
  try {
    console.error('[verify:packed] validating packed artifact and runtime closure')
    verifyPackedConsumer(packed, fixtureSet, rootManifest)
    validateRuntimeClosure(packed.info, rootManifest, fixtureSet)
    console.error('[verify:packed] exercising isolated offline consumer')
    await installConsumer(fixtureSet)
    console.log('[verify:packed] PASS - Pairing ' + rootManifest.version + ' reproduces its immutable artifact for ' + fixtureSet.provenance.source.tag + ' with ' + fixtureSet.records.size + ' exact archives and an isolated offline consumer')
  } catch (error) {
    primaryFailed = true
    throw error
  } finally {
    const failures = cleanupTemporaryTrees([packed.directory])
    if (!primaryFailed && failures.length > 0) throw new AggregateError(failures, 'packed archive cleanup failed')
  }
}


if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) await verifyPackedContract()
