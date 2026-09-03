import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldMountDshRuntime } from '../src/compatibility.ts'

const VERIFIED = new Set(['0.1.2-alpha.4', '0.1.2-rc.1'])

test('warns and still attempts an unverified future runtime', () => {
  const warnings = []
  let mountAttempts = 0
  const allowed = shouldMountDshRuntime({ warn: message => warnings.push(message) }, 'test-plugin', '9.9.9', VERIFIED)
  if (allowed) mountAttempts += 1
  assert.equal(mountAttempts, 1)
  assert.deepEqual(warnings, ['[test-plugin] best-effort on unverified runtime 9.9.9'])
})

test('blocks only an explicitly reproduced version with a visible reason', () => {
  const warnings = []
  let mountAttempts = 0
  const allowed = shouldMountDshRuntime({ warn: message => warnings.push(message) }, 'test-plugin', '9.9.9', VERIFIED, { '9.9.9': 'reproduced startup failure in the test harness' })
  if (allowed) mountAttempts += 1
  assert.equal(mountAttempts, 0)
  assert.deepEqual(warnings, ['[test-plugin] blocked on DSH 9.9.9: reproduced startup failure in the test harness; see package.json#dsh.compatibility.blocklist'])
})

test('does not warn for a verified runtime', () => {
  const warnings = []
  assert.equal(shouldMountDshRuntime({ warn: message => warnings.push(message) }, 'test-plugin', '0.1.2-rc.1', VERIFIED), true)
  assert.deepEqual(warnings, [])
})
