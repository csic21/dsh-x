import test from 'node:test'
import assert from 'node:assert/strict'
import {
  US_ENDPOINT, US_MAX_HISTORY, US_SOURCE_NAME, isUsSymbol, normalizeUsCode, normalizeUsSymbol,
  parseUsDailyRows, parseUsHistory, parseUsQuote, parseUsRequest, projectUsHistory, projectUsQuote,
  usHistoryUrl, usQuoteUrl, usTickerOf, usVolumeBasis,
} from '../src/us-market.ts'
import { createUsHandler, createUsRoute } from '../src/us-rpc.ts'
import { createTencentUsProvider } from '../src/us-provider.ts'

// Offline fixtures in the shape the upstream endpoints actually use. Every
// number is invented: no test here contacts the network or claims a live price.
const NOW = Date.parse('2026-11-04T15:00:00Z') // 10:00 in New York, after the Nov 3 close

function quoteFields(overrides: Record<number, string> = {}): string[] {
  const fields = Array.from({ length: 60 }, () => '0')
  Object.assign(fields, {
    0: '200', 1: 'Apple', 2: 'AAPL.OQ', 3: '123.45', 4: '120.00', 5: '120.50',
    30: '2026-11-03 16:00:02', 31: '3.45', 32: '2.88', 33: '124.00', 34: '119.80',
    35: 'USD', 36: '1000000', 37: '123450000', 46: 'Apple Inc.',
  })
  for (const [index, value] of Object.entries(overrides)) fields[Number(index)] = value
  return fields
}
const quoteText = (overrides: Record<number, string> = {}) => `v_usAAPL="${quoteFields(overrides).join('~')}";`

function qtFields(overrides: Record<number, string> = {}): string[] {
  const fields = Array.from({ length: 60 }, () => '0')
  Object.assign(fields, { 0: 'delay', 1: '苹果', 2: 'AAPL.OQ', 3: '123.45', 4: '120.00', 36: '1000000' })
  for (const [index, value] of Object.entries(overrides)) fields[Number(index)] = value
  return fields
}

const HISTORY_ROWS = [
  ['2026-10-30', '119.00', '121.00', '122.00', '118.50', '900000.00'],
  ['2026-11-02', '121.00', '123.00', '124.00', '120.50', '950000.00'],
  ['2026-11-03', '120.50', '123.45', '124.00', '119.80', '1000000.00'],
]

function historyPayload(options: { rows?: any[], key?: string, qt?: any } = {}): any {
  const key = options.key ?? 'qfqday'
  return {
    code: 0,
    data: {
      'usAAPL.OQ': {
        [key]: options.rows ?? HISTORY_ROWS,
        qt: options.qt === undefined ? { 'usAAPL.OQ': qtFields() } : options.qt,
      },
    },
  }
}

test('US symbols are exchange-qualified and cannot impersonate another listing', () => {
  assert.equal(normalizeUsSymbol('us.aapl'), 'US.AAPL')
  assert.equal(normalizeUsSymbol(' US.BRK.A '), 'US.BRK.A')
  assert.equal(usTickerOf('US.BRK.A'), 'BRK.A')
  assert.equal(usQuoteUrl('US.AAPL'), 'https://qt.gtimg.cn/q=usAAPL')
  assert.equal(usQuoteUrl('US.BRK.A'), 'https://qt.gtimg.cn/q=usBRK.A')
  assert.equal(usHistoryUrl('AAPL.OQ', 320), 'https://proxy.finance.qq.com/ifzqgtimg/appstock/app/usfqkline/get?param=usAAPL.OQ,day,,,320,qfq')
  assert.equal(isUsSymbol('US.AAPL'), true)
  for (const bad of ['SH.600519', 'US.', 'US.AAPL.OQ', 'HK.HSI', 'AAPL', 42, null]) {
    assert.throws(() => normalizeUsSymbol(bad as any), { code: 'finance/us-symbol' })
    assert.equal(isUsSymbol(bad), false)
  }
  assert.equal(normalizeUsCode('aapl.oq', 'US.AAPL'), 'AAPL.OQ')
  assert.equal(normalizeUsCode('brk.a.n', 'US.BRK.A'), 'BRK.A.N')
  for (const bad of ['MSFT.OQ', 'AAPL.XX', 'AAPL', 'AAPL.OQ.N', 7, null]) {
    assert.throws(() => normalizeUsCode(bad as any, 'US.AAPL'), { code: 'finance/us-symbol' })
  }
})

test('the US quote parser projects one row and cross-checks its own arithmetic', () => {
  const quote = parseUsQuote(quoteText(), 'US.AAPL', NOW)
  assert.equal(quote.symbol, 'US.AAPL')
  assert.equal(quote.name, 'Apple')
  assert.equal(quote.price, 123.45)
  assert.equal(quote.pricePrecision, 2)
  assert.equal(quote.change, 3.45)
  assert.equal(quote.changePercent, 2.88)
  assert.equal(quote.open, 120.5)
  assert.equal(quote.high, 124)
  assert.equal(quote.low, 119.8)
  assert.equal(quote.previousClose, 120)
  assert.equal(quote.volume, 1_000_000)
  assert.equal(quote.amount, 123_450_000)
  assert.equal(quote.currency, 'USD')
  assert.equal(quote.source, US_SOURCE_NAME)
  // 16:00:02 on 3 Nov 2026 is EST (UTC-5): the stamp is exchange-local, not Beijing.
  assert.equal(quote.quotedAt, '2026-11-03T21:00:02.000Z')
  assert.equal(quote.fetchedAt, new Date(NOW).toISOString())
  assert.equal(quote.marketStatus, 'unknown')

  // A four-decimal listing keeps its width instead of being rounded to two.
  const wide = parseUsQuote(`v_usAAPL="${quoteFields({ 3: '1.2345', 4: '1.2000', 31: '0.0345', 32: '2.88', 33: '1.3000', 34: '1.1000' }).join('~')}";`, 'US.AAPL', NOW)
  assert.equal(wide.pricePrecision, 4)

  // An unknown ticker is "no such listing", not a malformed response.
  assert.throws(() => parseUsQuote('v_pv_none_match="1";', 'US.AAPL', NOW), { code: 'finance/us-quote-unavailable' })
  // Shifted layouts and impossible arithmetic are rejected, never repaired.
  const invalid: Record<number, string>[] = [
    { 31: '9.99' }, // change disagrees with price - previous close
    { 32: '99.00' }, // percent disagrees with change
    { 35: 'HKD' },
    { 33: '110.00', 34: '130.00' }, // high below low
    { 33: '121.00' }, // price outside the day range
    { 3: '0' },
    { 2: 'MSFT.OQ' }, // echoes another security
  ]
  for (const overrides of invalid) {
    assert.throws(() => parseUsQuote(quoteText(overrides), 'US.AAPL', NOW), (error: any) =>
      error.code === 'finance/us-quote-invalid' || error.code === 'finance/us-quote-unavailable')
  }
  // An over-long name is dropped, not truncated into a different company.
  assert.equal(parseUsQuote(quoteText({ 1: 'x'.repeat(80) }), 'US.AAPL', NOW).name, '')
  // A stale or future stamp loses the time but not the last price.
  assert.equal(parseUsQuote(quoteText({ 30: '2027-01-01 09:30:00' }), 'US.AAPL', NOW).quotedAt, null)
  assert.equal(parseUsQuote(quoteText({ 30: 'not a time' }), 'US.AAPL', NOW).quotedAt, null)
  assert.throws(() => parseUsQuote(42 as any, 'US.AAPL', NOW), { code: 'finance/us-quote-unavailable' })
})

test('US daily rows keep the upstream open/close/high/low order and reject impossible bars', () => {
  const rows = parseUsDailyRows(HISTORY_ROWS)
  assert.deepEqual(rows.map(row => [row.sessionDate, row.open, row.close, row.high, row.low]), [
    ['2026-10-30', 119, 121, 122, 118.5],
    ['2026-11-02', 121, 123, 124, 120.5],
    ['2026-11-03', 120.5, 123.45, 124, 119.8],
  ])
  // Out-of-order, duplicated, impossible and non-numeric rows are dropped.
  assert.deepEqual(parseUsDailyRows([
    HISTORY_ROWS[2]!, HISTORY_ROWS[0]!,
    ['2026-11-04', '120', '121', '119', '118', '1'], // high below close
    ['2026-11-05', '0', '121', '122', '118', '1'],
    ['not-a-date', '1', '2', '3', '4', '5'],
    ['2026-11-06', 'a', '2', '3', '4', '5'],
  ]).map(row => row.sessionDate), ['2026-11-03'])
  assert.throws(() => parseUsDailyRows([]), { code: 'finance/us-history-unavailable' })
  assert.throws(() => parseUsDailyRows('nope'), { code: 'finance/us-history-unavailable' })
})

test('the US daily projection reports what the source actually returned', () => {
  const history = parseUsHistory(historyPayload(), { symbol: 'US.AAPL', code: 'AAPL.OQ', limit: 320, now: NOW })
  assert.equal(history.symbol, 'US.AAPL')
  assert.equal(history.currency, 'USD')
  assert.equal(history.amountUnit, 'USD')
  assert.equal(history.exchangeTimezone, 'America/New_York')
  assert.equal(history.adjustment, 'forward')
  assert.equal(history.adjustmentLabel, 'forward-adjusted (qfq)')
  assert.equal(history.volumeBasis, 'shares')
  assert.equal(history.source, US_SOURCE_NAME)
  assert.equal(history.bars.length, 3)
  assert.equal(history.bars.at(-1)!.volume, 1_000_000)
  assert.equal(history.bars.at(-1)!.amount, null)
  // The last session is in the past for the 10:00 New York clock, so it is final.
  assert.equal(history.bars.at(-1)!.isFinal, true)
  assert.equal(history.firstSessionDate, '2026-10-30')
  assert.equal(history.lastSessionDate, '2026-11-03')

  // The same session viewed while New York is still inside it is provisional.
  const live = parseUsHistory(historyPayload(), { symbol: 'US.AAPL', code: 'AAPL.OQ', limit: 320, now: Date.parse('2026-11-03T18:00:00Z') })
  assert.equal(live.bars.at(-1)!.isFinal, false)

  // The source ignores qfq for some listings and answers with `day`: that is
  // reported as unadjusted, never relabelled as forward-adjusted.
  const plain = parseUsHistory(historyPayload({ key: 'day' }), { symbol: 'US.AAPL', code: 'AAPL.OQ', limit: 320, now: NOW })
  assert.equal(plain.adjustment, 'none')
  assert.equal(plain.adjustmentLabel, 'unadjusted')

  // A limit bounds the returned window from the newest end.
  assert.equal(parseUsHistory(historyPayload(), { symbol: 'US.AAPL', code: 'AAPL.OQ', limit: 2, now: NOW }).bars.length, 2)
})

test('volume units are proven from the embedded quote, not assumed', () => {
  const rows = parseUsDailyRows(HISTORY_ROWS)
  assert.equal(usVolumeBasis(rows, 1_000_000), 'shares')
  assert.equal(usVolumeBasis(rows, 10_000), 'lots')
  assert.equal(usVolumeBasis(rows, 3_000_000), 'unknown')
  assert.equal(usVolumeBasis(rows, null), 'unknown')
  // No quote block: the unit is unknown, so volume is omitted rather than guessed.
  const unknown = parseUsHistory(historyPayload({ qt: null }), { symbol: 'US.AAPL', code: 'AAPL.OQ', limit: 320, now: NOW })
  assert.equal(unknown.volumeBasis, 'unknown')
  assert.equal(unknown.bars.at(-1)!.volume, null)
  // A lot count is converted to shares and labelled.
  const lots = parseUsHistory(historyPayload({ qt: { 'usAAPL.OQ': qtFields({ 36: '10000' }) } }), { symbol: 'US.AAPL', code: 'AAPL.OQ', limit: 320, now: NOW })
  assert.equal(lots.volumeBasis, 'lots')
  assert.equal(lots.bars.at(-1)!.volume, 100_000_000)
})

test('US history rejects another symbol, a bad envelope and an empty series', () => {
  assert.throws(() => parseUsHistory({ code: 1 }, { symbol: 'US.AAPL', code: 'AAPL.OQ', limit: 320, now: NOW }), { code: 'finance/us-history-unavailable' })
  assert.throws(() => parseUsHistory({ code: 0, data: {} }, { symbol: 'US.AAPL', code: 'AAPL.OQ', limit: 320, now: NOW }), { code: 'finance/us-history-unavailable' })
  assert.throws(() => parseUsHistory(historyPayload({ rows: [] }), { symbol: 'US.AAPL', code: 'AAPL.OQ', limit: 320, now: NOW }), { code: 'finance/us-history-unavailable' })
  assert.throws(() => parseUsHistory(historyPayload(), { symbol: 'US.AAPL', code: 'MSFT.OQ', limit: 320, now: NOW }), { code: 'finance/us-symbol' })
})

test('US requests accept only the exact quote and history envelopes', () => {
  assert.deepEqual(parseUsRequest({ kind: 'quote', symbol: 'us.aapl' }), { kind: 'quote', symbol: 'US.AAPL' })
  assert.deepEqual(parseUsRequest({ kind: 'history', symbol: 'US.AAPL', code: 'aapl.oq', limit: 320 }), {
    kind: 'history', symbol: 'US.AAPL', code: 'AAPL.OQ', limit: 320,
  })
  for (const bad of [
    null, [], {}, { kind: 'quote' }, { kind: 'quote', symbol: 'SH.600519' },
    { kind: 'quote', symbol: 'US.AAPL', extra: 1 },
    { kind: 'history', symbol: 'US.AAPL', code: 'AAPL.OQ' },
    { kind: 'history', symbol: 'US.AAPL', code: 'AAPL.OQ', limit: 0 },
    { kind: 'history', symbol: 'US.AAPL', code: 'AAPL.OQ', limit: US_MAX_HISTORY + 1 },
    { kind: 'history', symbol: 'US.AAPL', code: 'MSFT.OQ', limit: 320 },
  ]) {
    assert.throws(() => parseUsRequest(bad as any), (error: any) => ['finance/us-invalid', 'finance/us-symbol'].includes(error.code))
  }
})

test('the RPC boundary re-projects quotes and history instead of trusting the adapter', () => {
  const quote = parseUsQuote(quoteText(), 'US.AAPL', NOW)
  assert.deepEqual(projectUsQuote({ ...quote, extra: 'x' }, 'US.AAPL', NOW).price, 123.45)
  assert.throws(() => projectUsQuote({ ...quote, symbol: 'US.MSFT' }, 'US.AAPL', NOW), { code: 'finance/us-quote-invalid' })
  assert.throws(() => projectUsQuote({ ...quote, currency: 'HKD' }, 'US.AAPL', NOW), { code: 'finance/us-quote-invalid' })
  assert.throws(() => projectUsQuote({ ...quote, price: 0 }, 'US.AAPL', NOW), { code: 'finance/us-quote-invalid' })
  // An impossible timestamp becomes null at the boundary as well.
  assert.equal(projectUsQuote({ ...quote, quotedAt: '2026-12-01T00:00:00Z' }, 'US.AAPL', NOW).quotedAt, null)

  const history = parseUsHistory(historyPayload(), { symbol: 'US.AAPL', code: 'AAPL.OQ', limit: 320, now: NOW })
  const dirty = {
    ...history,
    bars: [
      { ...history.bars[0]!, close: 1 }, // high/low now contradict the close
      ...history.bars.slice(1),
    ],
  }
  assert.equal(projectUsHistory(dirty, 'US.AAPL', NOW).bars.length, 2)
  assert.throws(() => projectUsHistory({ ...history, symbol: 'US.MSFT' }, 'US.AAPL', NOW), { code: 'finance/us-history-invalid' })
  assert.throws(() => projectUsHistory({ ...history, bars: [] }, 'US.AAPL', NOW), { code: 'finance/us-history-invalid' })
})

test('the US provider calls the fixed hosts and never leaks an upstream error', async () => {
  const calls: any[] = []
  const provider = createTencentUsProvider({
    now: () => NOW,
    fetchImpl: async (url: any, init: any) => {
      calls.push({ url: String(url), init })
      return String(url).includes('usfqkline')
        ? new Response(JSON.stringify(historyPayload()), { headers: { 'content-type': 'application/json' } })
        : new Response(quoteText(), { headers: { 'content-type': 'text/plain' } })
    },
  })
  assert.equal(provider.name, US_SOURCE_NAME)
  assert.equal((await provider.quote('US.AAPL')).price, 123.45)
  assert.equal((await provider.history({ symbol: 'US.AAPL', code: 'AAPL.OQ', limit: 320 })).bars.length, 3)
  assert.equal(calls[0].url, 'https://qt.gtimg.cn/q=usAAPL')
  assert.equal(calls[0].init.redirect, 'error')
  assert.ok(calls[0].init.signal instanceof AbortSignal)
  assert.equal(calls[1].url, 'https://proxy.finance.qq.com/ifzqgtimg/appstock/app/usfqkline/get?param=usAAPL.OQ,day,,,320,qfq')

  const denied = createTencentUsProvider({ fetchImpl: async () => new Response('secret upstream body', { status: 500 }) })
  await assert.rejects(() => denied.quote('US.AAPL'), (error: any) => error.code === 'finance/us-unavailable' && !error.message.includes('secret'))
  const broken = createTencentUsProvider({ fetchImpl: async () => new Response('<html>', { headers: { 'content-type': 'application/json' } }) })
  await assert.rejects(() => broken.history({ symbol: 'US.AAPL', code: 'AAPL.OQ', limit: 320 }), { code: 'finance/us-history-unavailable' })
  const huge = createTencentUsProvider({ fetchImpl: async () => new Response('x'.repeat(65 * 1024), { headers: { 'content-type': 'text/plain' } }) })
  await assert.rejects(() => huge.quote('US.AAPL'), { code: 'finance/us-unavailable' })
  assert.throws(() => createTencentUsProvider({ fetchImpl: null as any }), { message: 'us fetch unavailable' })
  assert.throws(() => createTencentUsProvider({ timeoutMs: 0 }), { message: 'invalid us timeout' })
})

const OWNER = { principal: { kind: 'owner' } }
const invoke = (handler: any, payload: any, signal?: any, peer: any = OWNER) => handler(US_ENDPOINT, payload, signal, peer)

function provider() {
  return {
    name: 'fixture',
    quote: async () => parseUsQuote(quoteText(), 'US.AAPL', NOW),
    history: async () => parseUsHistory(historyPayload(), { symbol: 'US.AAPL', code: 'AAPL.OQ', limit: 320, now: NOW }),
  }
}

test('the US handler is owner-only, endpoint-exact and never fetches while the source is off', async () => {
  let fetched = 0
  const counted = { ...provider(), quote: async () => { fetched++; return parseUsQuote(quoteText(), 'US.AAPL', NOW) } }
  const handler = createUsHandler({ enabled: () => false, provider: counted })
  assert.equal((await invoke(handler, { kind: 'quote', symbol: 'US.AAPL' }, undefined, { principal: { kind: 'guest' } }) as any).error.code, 'finance/forbidden')
  assert.equal((await handler('dsh-x-finance.other', { kind: 'quote', symbol: 'US.AAPL' }, undefined, OWNER) as any).error.code, 'finance/not-found')
  const disabled = await invoke(handler, { kind: 'quote', symbol: 'US.AAPL' })
  assert.deepEqual(disabled, { ok: true, value: { status: 'disabled' } })
  assert.equal(fetched, 0)
  const abort = new AbortController()
  abort.abort()
  assert.equal((await invoke(createUsHandler({ enabled: () => true, provider: counted }), { kind: 'quote', symbol: 'US.AAPL' }, abort.signal) as any).error.code, 'finance/cancelled')
  assert.equal((await invoke(createUsHandler({ enabled: () => true }), { kind: 'quote', symbol: 'US.AAPL' }) as any).error.code, 'finance/us-unavailable')
  assert.equal((await invoke(createUsHandler({ enabled: () => true, provider: counted }), { kind: 'quote', symbol: 'AAPL' }) as any).error.code, 'finance/us-symbol')
})

test('the US handler projects both answers and maps provider failures to stable codes', async () => {
  const handler = createUsHandler({ enabled: () => true, provider: provider() })
  const quote = await invoke(handler, { kind: 'quote', symbol: 'US.AAPL' })
  assert.equal(quote.ok, true)
  assert.equal(quote.value.status, 'ready')
  assert.equal(quote.value.quote.price, 123.45)
  assert.equal(JSON.stringify(quote.value).includes('"extra"'), false)
  const history = await invoke(handler, { kind: 'history', symbol: 'US.AAPL', code: 'AAPL.OQ', limit: 320 })
  assert.equal(history.value.status, 'ready')
  assert.equal(history.value.history.bars.length, 3)

  const failing = { name: 'x', quote: async () => { throw Object.assign(new Error('upstream detail'), { code: 'finance/us-quote-unavailable' }) }, history: async () => { throw new Error('boom') } }
  const failed = createUsHandler({ enabled: () => true, provider: failing })
  assert.deepEqual(await invoke(failed, { kind: 'quote', symbol: 'US.AAPL' }), {
    ok: false,
    error: { code: 'finance/us-quote-unavailable', message: '没有这只美股的有效报价。', details: {} },
  })
  assert.equal((await invoke(failed, { kind: 'history', symbol: 'US.AAPL', code: 'AAPL.OQ', limit: 320 })).error.code, 'finance/us-unavailable')
})

test('the exact US route echoes generic RPC envelopes and rejects malformed requests', async () => {
  const route = createUsRoute({ enabled: () => true, provider: provider() })
  assert.equal(route.path, `/api/${US_ENDPOINT}`)
  assert.deepEqual(route.methods, ['POST'])
  const request = (value: any, headers: any = {}) => new Request(`http://host${route.path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers },
    body: typeof value === 'string' ? value : JSON.stringify(value),
  })
  const message = { type: 'client-request', rpcId: 'u1', method: US_ENDPOINT, payload: { kind: 'quote', symbol: 'US.AAPL' } }
  const response = await route.fetch(request(message)), body = await response.json() as any
  assert.equal(response.status, 200)
  assert.equal(body.type, 'server-response')
  assert.equal(body.rpcId, 'u1')
  assert.equal(body.result.value.quote.symbol, 'US.AAPL')
  for (const input of [null, [], {}, { ...message, method: 'other' }, { ...message, rpcId: 4 }, { ...message, extra: true }, '{broken'] as const) {
    assert.equal((await route.fetch(request(input))).status, 400)
  }
  assert.equal((await route.fetch(request(message, { 'content-type': 'text/plain' }))).status, 415)
  assert.equal((await route.fetch(request('x'.repeat(8193)))).status, 413)
})
