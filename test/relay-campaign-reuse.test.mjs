import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldKeepPendingRelaySeat, shouldReuseRelayCampaign } from '../src/relay-campaign.ts'

test('a stopped campaign is not reused even when the Relay URL is unchanged', () => {
  const relayUrl = 'wss://relay.example'
  assert.equal(shouldReuseRelayCampaign(undefined, relayUrl), false)
  assert.equal(shouldReuseRelayCampaign({ relayUrl, connector: { active: true } }, relayUrl), true)
  assert.equal(shouldReuseRelayCampaign({ relayUrl, connector: { active: false } }, relayUrl), false)
  assert.equal(shouldReuseRelayCampaign({ relayUrl, connector: { active: true } }, 'wss://other.example'), false)
})

test('empty-device reseat keeps only an unexpired QR offer seat', () => {
  assert.equal(shouldKeepPendingRelaySeat(undefined, 'ok'), false)
  assert.equal(shouldKeepPendingRelaySeat({ code: 'offer' }, 'ok'), true)
  assert.equal(shouldKeepPendingRelaySeat({ code: 'offer' }, 'expired'), false)
  assert.equal(shouldKeepPendingRelaySeat({ code: 'offer' }, 'unknown'), false)
  assert.equal(shouldKeepPendingRelaySeat({ code: '' }, 'unknown'), false)
})
