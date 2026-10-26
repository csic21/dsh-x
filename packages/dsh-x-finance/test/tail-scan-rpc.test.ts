import test from 'node:test'
import assert from 'node:assert/strict'
import { MARKET_ENDPOINT, parseMarketRequest } from '../src/market.ts'
import { createMarketHandler } from '../src/market-rpc.ts'

const NOW = Date.parse('2026-10-23T20:00:00+08:00')
const owner = { principal: { kind: 'owner' } }
const emptyScan = {
  source: 'test scan',
  fetchedAt: '2000-01-01T00:00:00.000Z',
  sessionDate: '2026-10-23',
  sessionIsToday: true,
  window: 'afternoon',
  windowStart: '14:30',
  windowEnd: '15:00',
  complete: true,
  universe: {
    expected: 5000, covered: 5000, screened: 0, intradayChecked: 0,
    tailConfirmed: 0, historyChecked: 0, failedIntraday: 0, failedHistory: 0, partial: false,
  },
  candidates: [],
}

test('tail-scan request identity is exact', () => {
  assert.deepEqual(parseMarketRequest({ kind: 'tail-scan' }), { kind: 'tail-scan' })
  assert.deepEqual(parseMarketRequest({ kind: 'tail-scan', window: 'morning' }), { kind: 'tail-scan', window: 'morning' })
  assert.deepEqual(parseMarketRequest({ kind: 'tail-scan', window: 'afternoon' }), { kind: 'tail-scan', window: 'afternoon' })
  for (const payload of [
    { kind: 'tail-scan', extra: true }, { kind: 'tail-scan', symbols: [] }, { kind: 'TAIL-SCAN' },
    { kind: 'tail-scan', window: 'noon' }, { kind: 'tail-scan', window: null }, { kind: 'tail-scan', window: 'MORNING' },
  ]) {
    assert.throws(() => parseMarketRequest(payload), { code: 'invalid-input' })
  }
})

test('tail-scan forwards the requested window and defaults to the afternoon tail', async () => {
  const windows: unknown[] = []
  const handler = createMarketHandler({
    provider: { name: 'test', tailScan: async (options: any) => { windows.push(options?.window); return emptyScan } } as any,
    now: () => NOW,
  })
  await handler(MARKET_ENDPOINT, { kind: 'tail-scan', window: 'morning' }, undefined, owner)
  await handler(MARKET_ENDPOINT, { kind: 'tail-scan' }, undefined, owner)
  assert.deepEqual(windows, ['morning', 'afternoon'])
})

test('tail-scan RPC is owner-only, caps the payload and reports a missing capability honestly', async () => {
  const handler = createMarketHandler({ provider: { name: 'test', tailScan: async () => emptyScan } as any, now: () => NOW })
  const ready = await handler(MARKET_ENDPOINT, { kind: 'tail-scan' }, undefined, owner) as any
  assert.equal(ready.ok, true)
  assert.equal(ready.value.status, 'ready')
  assert.equal(ready.value.tailScan.sessionDate, '2026-10-23')
  assert.equal(ready.value.tailScan.fetchedAt, new Date(NOW).toISOString())
  assert.equal(ready.value.tailScan.filters.minTailRatio, 1.3)
  assert.equal(ready.value.tailScan.candidates.length, 0)
  const guest = await handler(MARKET_ENDPOINT, { kind: 'tail-scan' }, undefined, { principal: { kind: 'guest' } }) as any
  assert.equal(guest.error.code, 'finance/forbidden')
  const missing = await createMarketHandler({ provider: { name: 'test' } as any, now: () => NOW })(MARKET_ENDPOINT, { kind: 'tail-scan' }, undefined, owner) as any
  assert.equal(missing.error.code, 'finance/tail-scan-unavailable')
  const malformed = await createMarketHandler({ provider: { name: 'test', tailScan: async () => ({ bad: true }) } as any, now: () => NOW })(MARKET_ENDPOINT, { kind: 'tail-scan' }, undefined, owner) as any
  assert.equal(malformed.error.code, 'finance/tail-scan-unavailable')
  const thrown = await createMarketHandler({ provider: { name: 'test', tailScan: async () => { throw new Error('raw secret') } } as any, now: () => NOW })(MARKET_ENDPOINT, { kind: 'tail-scan' }, undefined, owner) as any
  assert.equal(thrown.error.code, 'finance/market-unavailable')
  assert.doesNotMatch(JSON.stringify(thrown), /raw secret/)
})
