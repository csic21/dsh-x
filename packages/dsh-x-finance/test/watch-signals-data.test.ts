import test from 'node:test'
import assert from 'node:assert/strict'
import { scanWatchSignals, WATCH_SIGNAL_CONCURRENCY } from '../src/client/watch-signals-data.ts'
import { SEARCH_RPC_ENDPOINT } from '../src/instrument-search.ts'
import { MARKET_ENDPOINT } from '../src/market.ts'

const now = () => Date.parse('2026-05-02T04:00:00Z')
const daily = (symbol: string, options: { adjustment?: string; days?: number; final?: boolean; end?: string } = {}) => {
  const days = options.days ?? 130
  const last = Date.parse(`${options.end ?? '2026-05-01'}T00:00:00Z`)
  return {
    symbol, name: '测试股份', source: '测试源', fetchedAt: '2026-05-02T04:00:00Z',
    adjustment: options.adjustment ?? 'forward', pricePrecision: 2,
    bars: Array.from({ length: days }, (_, index) => ({
      sessionDate: new Date(last - (days - 1 - index) * 86_400_000).toISOString().slice(0, 10),
      open: 100 + index, close: 100 + index, isFinal: index < days - 1 || options.final !== false,
    })),
  }
}
const item = (symbol: string) => ({ symbol, alias: '' })
const ok = (value: any) => ({ ok: true, value })

function fakeRpc(spec: Record<string, any> = {}) {
  const calls: any[] = []
  return { calls, async call(_channel: string, endpoint: string, request: any) {
    calls.push({ endpoint, request })
    if (endpoint === SEARCH_RPC_ENDPOINT) {
      const symbol = `SH.${request.query}`
      const response = spec[symbol] ?? {}
      if (response.noDirectory) return ok({ status: 'ready', results: [] })
      return ok({ status: 'ready', results: [{ symbol, name: response.name ?? '测试股份', kind: response.kind ?? 'stock' }] })
    }
    if (endpoint === MARKET_ENDPOINT) {
      const response = spec[request.symbol] ?? {}
      if (response.failHistory) return { ok: false }
      return ok({ status: 'ready', history: daily(request.symbol, response) })
    }
    throw new Error('unexpected route')
  } }
}

test('requests exact directory identity and computes watchlist signals with provenance', async () => {
  const rpc = fakeRpc({ 'SH.600519': { final: false } })
  const events: any[] = []
  const rows = await scanWatchSignals(rpc, [item('SH.600519')], { signal: new AbortController().signal, now, onProgress: rows => events.push(rows) })
  assert.equal(rows[0]?.status, 'ready')
  assert.equal(rows[0]?.signal?.status, 'buy')
  assert.equal(rows[0]?.signal?.isFinal, false)
  assert.equal(rows[0]?.signal?.sessionDate, '2026-05-01')
  assert.equal(rows[0]?.source, '测试源')
  assert.equal(rows[0]?.adjustment, 'forward')
  assert.equal(rpc.calls.length, 2)
  assert.deepEqual(rpc.calls[1]?.request, { kind: 'history', symbol: 'SH.600519', adjustment: 'forward', limit: 250 })
  assert.equal(events[0]?.[0]?.status, 'pending')
  assert.equal(events.at(-1)?.[0]?.status, 'ready')
})

test('unknown types and funds never receive stock rules or history requests', async () => {
  const rpc = fakeRpc({ 'SH.510300': { kind: 'etf' }, 'SH.600001': { noDirectory: true } })
  const rows = await scanWatchSignals(rpc, [item('SH.510300'), item('SH.600001')], { signal: new AbortController().signal, now })
  assert.deepEqual(rows.map(row => row.status), ['unsupported', 'unknown-kind'])
  assert.equal(rpc.calls.filter(call => call.endpoint === MARKET_ENDPOINT).length, 0)
})

test('unadjusted, stale and unavailable histories never become actionable signals', async () => {
  const rpc = fakeRpc({
    'SH.600001': { adjustment: 'none' },
    'SH.600002': { end: '2026-04-10' },
    'SH.600003': { failHistory: true },
    'SH.600004': { days: 15 },
    'SH.600005': { name: '*ST 测试' },
    'SH.600006': { end: '2026-05-03' },
  })
  const rows = await scanWatchSignals(rpc, Object.keys({
    'SH.600001': 0, 'SH.600002': 0, 'SH.600003': 0, 'SH.600004': 0, 'SH.600005': 0, 'SH.600006': 0,
  }).map(item), { signal: new AbortController().signal, now })
  assert.deepEqual(rows.map(row => row.status), ['unadjusted', 'stale', 'unavailable', 'ready', 'ready', 'stale'])
  assert.equal(rows[0]?.signal, null)
  assert.equal(rows[3]?.signal?.status, 'insufficient')
  assert.equal(rows[4]?.stWarning, true)
})

test('bound concurrency and preserve input order', async () => {
  let inFlight = 0, peak = 0
  const base = fakeRpc()
  const rpc = { async call(...args: any[]) {
    inFlight++; peak = Math.max(peak, inFlight)
    try { await Promise.resolve(); return await (base.call as any)(...args) } finally { inFlight-- }
  } }
  const rows = await scanWatchSignals(rpc, ['SH.600001', 'SH.600002', 'SH.600003', 'SH.600004'].map(item), { signal: new AbortController().signal, now })
  assert.ok(peak <= WATCH_SIGNAL_CONCURRENCY)
  assert.deepEqual(rows.map(row => row.symbol), ['SH.600001', 'SH.600002', 'SH.600003', 'SH.600004'])
})

test('repeated upstream failures stop later requests and identify skipped items', async () => {
  let calls = 0
  const rpc = { async call() { calls++; return { ok: false } } }
  const items = Array.from({ length: 15 }, (_, index) => item(`SH.${String(600000 + index).padStart(6, '0')}`))
  const rows = await scanWatchSignals(rpc, items, { signal: new AbortController().signal, now, wait: async () => {} })
  assert.ok(calls >= 6 && calls <= 7)
  assert.ok(rows.some(row => row.status === 'skipped'))
  assert.equal(rows.filter(row => row.status === 'unavailable').length, calls)
})

test('abort and invalid watchlists fail closed', async () => {
  const c = new AbortController(); c.abort()
  await assert.rejects(scanWatchSignals(fakeRpc(), [item('SH.600001')], { signal: c.signal, now }))
  await assert.rejects(scanWatchSignals(fakeRpc(), [item('SH.600001'), item('SH.600001')], { signal: new AbortController().signal, now }))
  await assert.rejects(scanWatchSignals(fakeRpc(), [item('SH.invalid')], { signal: new AbortController().signal, now }))
})
