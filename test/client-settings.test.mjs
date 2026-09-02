import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildEndpointSaveRequest, decodeEndpointSaveResult, decodePairedDevices, decodePairingStatus, endpointDraftDirty, livePairedDevices, pairingQrNeedsRefresh, pairingQrRevisionOnToggle, pairingQrUrl, pairingRefreshQrUrl, PAIRING_OFFER_TTL_MS, PAIRING_QR_PRESENTATION, PAIRING_QR_ROTATE_MS, REMOTE_SETTINGS_API, REMOTE_SETTINGS_SECTION } from '../src/client/model.ts'

test('Remote occupies its own settings sidebar section ahead of Models', () => {
  assert.equal(REMOTE_SETTINGS_SECTION.id, 'remote')
  assert.equal(REMOTE_SETTINGS_SECTION.order, 5)
  assert.ok(REMOTE_SETTINGS_SECTION.order > 0)
  assert.ok(REMOTE_SETTINGS_SECTION.order < 10)
})

test('pairing settings status decodes endpoint and visible config location', () => {
  const status = decodePairingStatus({ endpoint: { url: 'https://quick.example', kind: 'temporary' }, endpointMode: 'quick', hostIdentity: 'host-key', configuration: { file: 'cordis.patch.yml', entryId: 'dsh-mobile-pairing', customEndpointField: 'customEndpointUrl', legacyRelayConfigured: false } })
  assert.equal(status?.endpoint?.url, 'https://quick.example')
  assert.equal(status?.endpointState, 'ready')
  assert.equal(status?.configuration.entryId, 'dsh-mobile-pairing')
  assert.equal(status?.configuration.legacyRelayConfigured, false)
})

test('pairing settings status decodes address provisioning progress and failures', () => {
  const base = { endpoint: null, endpointMode: 'quick', hostIdentity: 'host-key', configuration: { file: 'cordis.patch.yml', entryId: 'dsh-mobile-pairing', customEndpointField: 'customEndpointUrl', legacyRelayConfigured: false } }
  assert.equal(decodePairingStatus({ ...base, endpointState: 'loading' })?.endpointState, 'loading')
  assert.equal(decodePairingStatus({ ...base, endpointState: 'error', endpointError: 'cloudflared missing' })?.endpointError, 'cloudflared missing')
  assert.equal(decodePairingStatus({ ...base, endpointState: 'unknown' }), null)
})

test('opening the card automatically advances to a fresh QR offer', () => {
  assert.equal(pairingQrRevisionOnToggle(7, true), 8)
  assert.equal(pairingQrRevisionOnToggle(8, false), 8)
})

test('pairing QR reserves at least four pixels per module for dense public offers', () => {
  const worstSupportedModulesWithQuietZone = 73 + 8
  const drawablePixels = PAIRING_QR_PRESENTATION.size - 2 * PAIRING_QR_PRESENTATION.padding
  assert.ok(drawablePixels / worstSupportedModulesWithQuietZone >= 4)
})

test('refresh and target produce a fresh non-secret QR URL', () => {
  assert.equal(pairingQrUrl('android', 4), '/api/dsh-mobile/remote/pair?target=android&format=svg&refresh=4')
  assert.equal(pairingQrUrl('android', 5), '/api/dsh-mobile/remote/pair?target=android&format=svg&refresh=5')
})

test('draft is dirty only when mode or custom URL differs from the saved endpoint', () => {
  const saved = { endpointMode: 'quick', customEndpointUrl: 'https://host.example' }
  assert.equal(endpointDraftDirty('quick', '', saved), false)
  assert.equal(endpointDraftDirty('custom', 'https://host.example', saved), true)
  assert.equal(endpointDraftDirty('custom', 'https://host.example', { endpointMode: 'custom', customEndpointUrl: 'https://host.example' }), false)
  assert.equal(endpointDraftDirty('custom', ' https://host.example ', { endpointMode: 'custom', customEndpointUrl: 'https://host.example' }), false)
  assert.equal(endpointDraftDirty('custom', 'https://other.example', { endpointMode: 'custom', customEndpointUrl: 'https://host.example' }), true)
  assert.equal(endpointDraftDirty('quick', '', { endpointMode: 'custom', customEndpointUrl: 'https://pair.example' }), true)
})

test('endpoint save payload and result decode staged check failures', () => {
  assert.deepEqual(buildEndpointSaveRequest('quick', 'https://ignored.example'), { endpointMode: 'quick' })
  assert.deepEqual(buildEndpointSaveRequest('custom', ' https://host.example '), { endpointMode: 'custom', customEndpointUrl: 'https://host.example' })
  assert.equal(buildEndpointSaveRequest('custom', '  ').error, 'customEndpointUrl is required in custom mode')
  assert.deepEqual(decodeEndpointSaveResult({ ok: false, stage: 'tls', error: 'certificate expired' }), { ok: false, stage: 'tls', error: 'certificate expired' })
  assert.equal(decodeEndpointSaveResult({ ok: false, stage: 'mystery', error: 'x' }), null)
})

test('paired device list keeps live rows and drops revoked ones', () => {
  const devices = decodePairedDevices({
    devices: [
      { id: 'phone', clientType: 'android', createdAt: 1, lastSeenAt: 2, revokedAt: null, room: 'a'.repeat(32) },
      { id: 'gone', clientType: 'browser', createdAt: 1, lastSeenAt: 2, revokedAt: 9 },
    ],
  })
  assert.ok(devices)
  assert.deepEqual(livePairedDevices(devices).map(device => device.id), ['phone'])
  assert.equal(pairingRefreshQrUrl('ab', 3), '/api/dsh-mobile/remote/pair?format=svg&room=ab&refresh=3')
  assert.equal(decodePairedDevices({ devices: [{ id: 1 }] }), null)
})

test('on-screen pairing QR remints before the offer TTL elapses', () => {
  assert.ok(PAIRING_QR_ROTATE_MS < PAIRING_OFFER_TTL_MS)
  assert.equal(pairingQrNeedsRefresh(0, PAIRING_QR_ROTATE_MS - 1), false)
  assert.equal(pairingQrNeedsRefresh(0, PAIRING_QR_ROTATE_MS), true)
  assert.equal(pairingQrNeedsRefresh(0, PAIRING_OFFER_TTL_MS), true)
})

test('settings client remints a visible QR for any live endpoint', async () => {
  const source = await readFile(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
  assert.match(source, /setInterval\(bump, PAIRING_QR_ROTATE_MS\)/)
  assert.match(source, /endpointReady = status\?\.endpoint !== null && !dirty/)
  assert.match(source, /setMode\(decoded\.endpointMode\)/)
  assert.match(source, /endpointDraftDirty\(mode, status\.customEndpointUrl \?\? ''/)
  assert.doesNotMatch(source, /4 \* 60_000/)
  assert.match(source, /PAIRING_OFFER_TTL_MS/)
})

test('mobile settings use the authenticated remote API instead of pairing administration paths', async () => {
  const client = await readFile(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
  const host = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8')
  assert.match(client, /REMOTE_SETTINGS_API\.status/)
  assert.match(client, /REMOTE_SETTINGS_API\.devices/)
  assert.match(client, /REMOTE_SETTINGS_API\.endpoint/)
  assert.match(client, /REMOTE_SETTINGS_API\.revoke/)
  assert.match(client, /REMOTE_SETTINGS_API\.label/)
  assert.equal(REMOTE_SETTINGS_API.pair, '/api/dsh-mobile/remote/pair')
  for (const path of ['status', 'devices', 'endpoint', 'revoke', 'label']) {
    assert.match(host, new RegExp(`/api/dsh-mobile/remote/${path}`))
  }
})

test('mobile pairing QR is fetched through the tunnel before rendering', async () => {
  const client = await readFile(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
  assert.match(client, /fetch\(src,\s*\{ credentials: 'same-origin'/)
  assert.match(client, /URL\.createObjectURL\(blob\)/)
  assert.match(client, /URL\.revokeObjectURL\(objectUrl\)/)
})

test('Remote settings preserve the mobile settings column and reflow narrow controls', async () => {
  const client = await readFile(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
  assert.match(client, /\.dsh-mobile-remote-page\s*\{[^}]*min-width:\s*0/)
  assert.match(client, /\.dsh-mobile-remote-page\s*\{[^}]*max-width:\s*100%/)
  assert.match(client, /\.dsh-mobile-remote-page\s*\{[^}]*overflow-x:\s*hidden/)
  assert.match(client, /\.dsh-mobile-remote-card\s*\{[^}]*min-width:\s*0/)
  assert.match(client, /\.dsh-mobile-remote-card\s*\{[^}]*width:\s*100%/)
  assert.match(client, /\.dsh-mobile-remote-device\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/)
  assert.match(client, /\.dsh-mobile-remote-input-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/)
  assert.match(client, /\.dsh-mobile-remote-qr\s*\{[^}]*max-width:\s*100%/)
  assert.match(client, /dsh-mobile-remote-scan-heading/)
  assert.match(client, /\.dsh-mobile-remote-qr\s*\{[^}]*width:\s*min\(100%,\s*260px\)/)
})

test('malformed pairing settings status is rejected', () => {
  assert.equal(decodePairingStatus({ endpointMode: 'relay' }), null)
  assert.equal(decodePairingStatus({ endpoint: { url: 'https://x', kind: 'temporary' }, endpointMode: 'quick', hostIdentity: 'x', configuration: {} }), null)
})
