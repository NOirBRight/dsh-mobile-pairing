/** Persist the loopback Host Gateway port so an operator mux can follow gatewayPort: 0. */
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Path of the single-line port file under a DSH Home. */
export function gatewayPortPath(dshHome: string): string {
  return join(dshHome, 'mobile', 'gateway-port')
}

/** Write the listened Gateway port; empty/invalid ports are ignored. */
export function writeGatewayPort(dshHome: string, port: number): void {
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return
  const path = gatewayPortPath(dshHome)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, String(port) + '\n', { encoding: 'utf8', mode: 0o600 })
}

/** Read a previously published Gateway port, or null when missing/invalid. */
export function readGatewayPort(dshHome: string): number | null {
  try {
    const raw = readFileSync(gatewayPortPath(dshHome), 'utf8').trim()
    const port = Number(raw)
    return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null
  } catch {
    return null
  }
}

/** Drop the published port when this Gateway unbinds. */
export function clearGatewayPort(dshHome: string): void {
  try {
    unlinkSync(gatewayPortPath(dshHome))
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return
    throw error
  }
}
