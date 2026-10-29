import test from 'node:test'
import assert from 'node:assert/strict'
import { MARKET_ENDPOINT, parseMarketRequest } from '../src/market.ts'
import { createMarketHandler, createMarketRoute } from '../src/market-rpc.ts'
import { projectQuantScan, QUANT_SCAN_NOTICE } from '../src/quant-scan.ts'
import { harness } from './quant-scan-fixture.ts'

const owner = { principal: { kind: 'owner' } }
test('quant RPC only accepts exact start/status/continue contracts and refuses watchlist, overrides or URLs', () => {
  for (const payload of [
    { kind: 'quant-scan', action: 'start' }, { kind: 'quant-scan', action: 'status' },
    { kind: 'quant-scan', action: 'continue', scanId: 'scan-1' },
  ]) assert.deepEqual(parseMarketRequest(payload), payload)
  for (const payload of [
    { kind: 'quant-scan' }, { kind: 'quant-scan', action: 'auto' },
    { kind: 'quant-scan', action: 'continue' }, { kind: 'quant-scan', action: 'continue', scanId: '../secret' },
    { kind: 'quant-scan', action: 'continue', scanId: 'a'.repeat(65) },
    { kind: 'quant-scan', action: 'start', symbols: ['SH.600001'] },
    { kind: 'quant-scan', action: 'start', watchlist: true },
    { kind: 'quant-scan', action: 'start', maxStocks: 99999 },
    { kind: 'quant-scan', action: 'start', url: 'https://localhost' },
    { kind: 'quant-scan', action: 'start', adjustment: 'backward' },
    { kind: 'quant-scan', action: 'start', scanId: 'a' }, Object.create({ kind: 'quant-scan', action: 'start' }),
  ]) assert.throws(() => parseMarketRequest(payload))
})

test('owner admission, disabled source, unavailable capability, and cancelled signal never initiate scanning', async () => {
  let resolves = 0, scans = 0
  const provider = async () => { resolves++; return { quantScan: async () => { scans++; return null } } as any }
  const handler = createMarketHandler({ provider })
  const request = { kind: 'quant-scan', action: 'start' }
  for (const peer of [undefined, {}, { principal: { kind: 'guest' } }]) {
    const response = await handler(MARKET_ENDPOINT, request, undefined, peer) as any
    assert.equal(response.error.code, 'finance/forbidden')
  }
  assert.equal((await handler(MARKET_ENDPOINT, request, AbortSignal.abort(), owner) as any).error.code, 'finance/cancelled')
  assert.equal(resolves, 0); assert.equal(scans, 0)
  const disabled = await createMarketHandler()(MARKET_ENDPOINT, request, undefined, owner)
  assert.deepEqual(disabled, { ok: true, value: { status: 'unconfigured', source: null } })
  const unavailable = await createMarketHandler({ provider: {} as any })(MARKET_ENDPOINT, request, undefined, owner) as any
  assert.equal(unavailable.error.code, 'finance/quant-scan-unavailable')
  const status = await handler(MARKET_ENDPOINT, { kind: 'quant-scan', action: 'status' }, undefined, owner)
  assert.deepEqual(status, { ok: true, value: { status: 'ready', quantScan: null } })
})

test('Host projects safe fields recursively, recomputes scores/coverage, preserves source time and strips secrets', async () => {
  const h = harness(), result = (await h.scan({ action: 'start' }))!
  const raw = structuredClone(result) as any
  raw.secret = 'raw-secret'; raw.bars = [{ secret: 'raw-secret' }]; raw.notices = ['raw-secret']
  raw.counts.coverage = 0.123; raw.counts.secret = 'raw-secret'; raw.rows[0].score = 999
  raw.rows[0].scores.trend = 999; raw.rows[0].factors.secret = 'raw-secret'; raw.rows[0].percentiles.secret = 'raw-secret'
  raw.rows[0].explanation = ['raw-secret']; raw.rows[0].bars = ['raw-secret']; raw.rows[0].credentials = 'raw-secret'
  const calls: unknown[] = [], controller = new AbortController()
  const handler = createMarketHandler({ now: h.now, provider: { quantScan: async (input: unknown, signal: unknown) => {
    calls.push(input, signal); return raw
  } } as any })
  const response = await handler(MARKET_ENDPOINT, { kind: 'quant-scan', action: 'continue', scanId: result.scanId }, controller.signal, owner) as any
  assert.equal(response.ok, true)
  assert.deepEqual(calls, [{ action: 'continue', scanId: result.scanId }, controller.signal])
  assert.deepEqual(response.value.quantScan, result)
  assert.equal(JSON.stringify(response).includes('raw-secret'), false)
  h.advance(60_000)
  const cached = projectQuantScan(result, h.now())!
  assert.equal(cached.updatedAt, result.updatedAt)
  assert.equal(cached.rows[0]!.fetchedAt, result.rows[0]!.fetchedAt)
  assert.deepEqual(cached.notices, [...QUANT_SCAN_NOTICE])
})

test('malformed provider counters, rows, dates, factors and failures cannot cross the Host boundary', async () => {
  const h = harness(), result = (await h.scan({ action: 'start' }))!
  const mutations = [
    (r: any) => { r.counts.attempted = 99 }, (r: any) => { r.counts.dailyFailed = -1 },
    (r: any) => { r.counts.expected = -1 }, (r: any) => { r.counts.ranked = 30 },
    (r: any) => { r.rows.push(r.rows[0]) }, (r: any) => { r.rows[1].symbol = r.rows[0].symbol },
    (r: any) => { r.rows[0].symbol = 'SH.000300' }, (r: any) => { r.rows[0].validBars = 119 },
    (r: any) => { r.rows[0].factors.amountMedian20 = null }, (r: any) => { r.rows[0].factors.close = Infinity },
    (r: any) => { r.rows[0].percentiles.return20 = 2 }, (r: any) => { r.rows[0].adjustment = 'unknown' },
    (r: any) => { r.rows[0].name = '*ST测试' }, (r: any) => { r.source = 'bad\nsource' },
    (r: any) => { r.sessionDate = '2026-02-30' }, (r: any) => { r.updatedAt = '3000-01-01T00:00:00Z' },
  ]
  for (const mutate of mutations) {
    const raw = structuredClone(result); mutate(raw)
    const handler = createMarketHandler({ now: h.now, provider: { quantScan: async () => raw } as any })
    const response = await handler(MARKET_ENDPOINT, { kind: 'quant-scan', action: 'start' }, undefined, owner) as any
    assert.equal(response.error.code, 'finance/quant-scan-unavailable')
  }
  const handler = createMarketHandler({ provider: { quantScan: async () => { throw new Error('credentials=raw-secret') } } as any })
  const response = await handler(MARKET_ENDPOINT, { kind: 'quant-scan', action: 'start' }, undefined, owner) as any
  assert.equal(response.error.code, 'finance/quant-scan-unavailable')
  assert.equal(JSON.stringify(response).includes('raw-secret'), false)
})

test('the existing buffered Connection route retains its envelope, size and content-type constraints', async () => {
  const h = harness(), result = (await h.scan({ action: 'start' }))!
  const route = createMarketRoute({ now: h.now, provider: { quantScan: async () => result } as any })
  assert.equal(route.path, '/api/dsh-x-finance.market')
  assert.deepEqual(route.methods, ['POST'])
  const envelope = { type: 'client-request', rpcId: 'quant-1', method: MARKET_ENDPOINT, payload: { kind: 'quant-scan', action: 'start' } }
  const response = await route.fetch(new Request('https://local/api/dsh-x-finance.market', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(envelope),
  }))
  assert.deepEqual(await response.json(), { type: 'server-response', rpcId: 'quant-1', result: { ok: true, value: { status: 'ready', quantScan: result } } })
  assert.equal((await route.fetch(new Request('https://local', { method: 'POST', body: '{}' }))).status, 415)
  assert.equal((await route.fetch(new Request('https://local', {
    method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '9000' }, body: '{}',
  }))).status, 413)
})
