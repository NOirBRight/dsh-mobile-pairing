import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { clearGatewayPort, gatewayPortPath, readGatewayPort, writeGatewayPort } from '../src/gateway-port.ts'

test('a Gateway publishes its loopback port for the mux to reread', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-gateway-port-'))
  try {
    assert.equal(readGatewayPort(home), null)
    writeGatewayPort(home, 38813)
    assert.equal(readGatewayPort(home), 38813)
    assert.equal(gatewayPortPath(home), join(home, 'mobile', 'gateway-port'))
    clearGatewayPort(home)
    assert.equal(readGatewayPort(home), null)
    clearGatewayPort(home)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
