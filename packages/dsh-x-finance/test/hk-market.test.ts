import test from 'node:test'
import assert from 'node:assert/strict'
import {
  HK_ENDPOINT, HK_MAX_HISTORY, HK_SOURCE_NAME, hkAmountUnit, hkCodeOf, hkHistoryUrl, hkQuoteUrl,
  isHkSymbol, isRmbCounterCode, normalizeHkSymbol, parseHkDailyRows, parseHkDirectoryCode,
  parseHkHistory, parseHkQuote, parseHkRequest, projectHkHistory, projectHkQuote,
} from '../src/hk-market.ts'
import { createHkHandler, createHkRoute } from '../src/hk-rpc.ts'
import { createTencentHkProvider } from '../src/hk-provider.ts'
import { parseHkInstrumentHints } from '../src/instrument-search.ts'

// Offline fixtures in the shape the upstream endpoints actually use. Every
// number is invented: no test here contacts the network or claims a live price.
const NOW = Date.parse('2026-11-05T03:30:00Z') // 11:30 in Hong Kong
const TODAY = '2026-11-05'

function quoteFields(overrides: Record<number, string> = {}): string[] {
  const fields = Array.from({ length: 78 }, () => '0')
  Object.assign(fields, {
    0: '100', 1: '腾讯控股', 2: '00700', 3: '428.000', 4: '401.600', 5: '413.800',
    30: '2026/11/05 11:07:55', 31: '26.400', 32: '6.57', 33: '429.000', 34: '410.200',
    36: '27441498', 37: '11571596893.746', 75: 'HKD',
  })
  for (const [index, value] of Object.entries(overrides)) fields[Number(index)] = value
  return fields
}
const quoteText = (overrides: Record<number, string> = {}) => `v_hk00700="${quoteFields(overrides).join('~')}";`

function qtFields(overrides: Record<number, string> = {}): string[] {
  const fields = Array.from({ length: 78 }, () => '0')
  Object.assign(fields, { 0: '100', 1: 'TENCENT', 2: '00700', 3: '425.200', 36: '29729566', 37: '12548208000' })
  for (const [index, value] of Object.entries(overrides)) fields[Number(index)] = value
  return fields
}

const HISTORY_ROWS = [
  ['2026-11-03', '393.200', '397.200', '402.600', '391.800', '20140184.000', {}, '0.220', '800872.553'],
  ['2026-11-04', '397.800', '401.600', '402.200', '391.600', '18500105.000', {}, '0.200', '737256.309'],
  ['2026-11-05', '413.800', '425.200', '429.000', '410.200', '29729566.00', {}, '0', '1254820.80'],
]

function historyPayload(options: { rows?: any[], key?: string, qt?: any } = {}): any {
  const key = options.key ?? 'qfqday'
  return {
    code: 0,
    data: {
      hk00700: {
        [key]: options.rows ?? HISTORY_ROWS,
        qt: options.qt === undefined ? { hk00700: qtFields() } : options.qt,
      },
    },
  }
}

test('HK identities are five-digit codes and cannot impersonate an index', () => {
  assert.equal(normalizeHkSymbol('hk.00700'), 'HK.00700')
  assert.equal(normalizeHkSymbol(' HK.09988 '), 'HK.09988')
  assert.equal(hkCodeOf('HK.00700'), '00700')
  assert.equal(hkQuoteUrl('HK.00700'), 'https://qt.gtimg.cn/q=hk00700')
  assert.equal(hkHistoryUrl('HK.00700', 320), 'https://proxy.finance.qq.com/ifzqgtimg/appstock/app/hkfqkline/get?param=hk00700,day,,,320,qfq')
  assert.equal(isHkSymbol('HK.00700'), true)
  // The Hang Seng indices keep their own route; a listing is always digits.
  assert.equal(isHkSymbol('HK.HSI'), false)
  for (const bad of ['HK.700', 'HK.007000', 'HK.HSI', 'SH.600519', 'US.AAPL', '00700', '', null, 42]) {
    assert.equal(isHkSymbol(bad as any), false)
    assert.throws(() => normalizeHkSymbol(bad as any), { code: 'finance/hk-symbol' })
  }
  for (const bad of [0, -1, HK_MAX_HISTORY + 1, 1.5, '320']) {
    assert.throws(() => hkHistoryUrl('HK.00700', bad as any), { code: 'finance/hk-invalid' })
  }
})

test('directory codes keep their padding and drop the RMB counter', () => {
  assert.equal(parseHkDirectoryCode('00700'), 'HK.00700')
  assert.equal(parseHkDirectoryCode(' 02800 '), 'HK.02800')
  // 80700 and 82800 are the RMB counters of 00700 and 02800, not new listings.
  assert.equal(isRmbCounterCode('80700'), true)
  assert.equal(isRmbCounterCode('82800'), true)
  assert.equal(isRmbCounterCode('09988'), false)
  assert.equal(parseHkDirectoryCode('80700'), null)
  assert.equal(parseHkDirectoryCode('89988'), null)
  for (const bad of ['700', '007000', 'HSI', 'hk00700', '', null, 700]) {
    assert.equal(parseHkDirectoryCode(bad as any), null)
  }
})

test('HK quote rows are projected and cross-checked', () => {
  const quote = parseHkQuote(quoteText(), 'HK.00700', NOW)
  assert.deepEqual(quote, {
    symbol: 'HK.00700', name: '腾讯控股', price: 428, pricePrecision: 3,
    change: 26.4, changePercent: 6.57, open: 413.8, high: 429, low: 410.2, previousClose: 401.6,
    volume: 27441498, amount: 11571596893.746, currency: 'HKD',
    quotedAt: '2026-11-05T03:07:55.000Z', fetchedAt: '2026-11-05T03:30:00.000Z',
    marketStatus: 'unknown', source: HK_SOURCE_NAME,
  })
  // The row must describe the security it was asked about.
  assert.throws(() => parseHkQuote(quoteText({ 2: '00701' }), 'HK.00700', NOW), { code: 'finance/hk-quote-invalid' })
  // A non-HKD row is not this board.
  assert.throws(() => parseHkQuote(quoteText({ 75: 'USD' }), 'HK.00700', NOW), { code: 'finance/hk-quote-invalid' })
  // A shifted layout must not publish a plausible but wrong change.
  assert.throws(() => parseHkQuote(quoteText({ 31: '99.000' }), 'HK.00700', NOW), { code: 'finance/hk-quote-invalid' })
  assert.throws(() => parseHkQuote(quoteText({ 33: '400.000' }), 'HK.00700', NOW), { code: 'finance/hk-quote-invalid' })
  assert.throws(() => parseHkQuote(quoteText({ 34: '430.000' }), 'HK.00700', NOW), { code: 'finance/hk-quote-invalid' })
  // An unknown code answers with a single field: no listing, not a format error.
  assert.throws(() => parseHkQuote('v_hk00700="1"', 'HK.00700', NOW), { code: 'finance/hk-quote-unavailable' })
  assert.throws(() => parseHkQuote('v_hk99999="1"', 'HK.00700', NOW), { code: 'finance/hk-quote-unavailable' })
  assert.throws(() => parseHkQuote('x'.repeat(200_000), 'HK.00700', NOW), { code: 'finance/hk-quote-unavailable' })
})

test('HK daily rows are parsed, unit-checked and projected', () => {
  const history = parseHkHistory(historyPayload(), { symbol: 'HK.00700', limit: 320, now: NOW })
  assert.equal(history.symbol, 'HK.00700')
  assert.equal(history.currency, 'HKD')
  assert.equal(history.amountUnit, 'HKD')
  assert.equal(history.exchangeTimezone, 'Asia/Hong_Kong')
  assert.equal(history.adjustment, 'forward')
  assert.equal(history.adjustmentLabel, 'forward-adjusted (qfq)')
  assert.equal(history.pricePrecision, 3)
  assert.equal(history.volumeBasis, 'shares')
  assert.equal(history.bars.length, 3)
  assert.deepEqual(history.bars.at(-1), {
    sessionDate: TODAY, open: 413.8, high: 429, low: 410.2, close: 425.2,
    // 万 → HKD, confirmed by the quote block's own turnover.
    volume: 29729566, amount: 12548208000, isFinal: false,
  })
  assert.equal(history.bars[0]!.isFinal, true)
  // Without a qfq series the source answered unadjusted rows, and the label says so.
  const unadjusted = parseHkHistory(historyPayload({ key: 'day' }), { symbol: 'HK.00700', limit: 320, now: NOW })
  assert.equal(unadjusted.adjustment, 'none')
  assert.equal(unadjusted.adjustmentLabel, 'unadjusted')
  // A missing or mismatched quote block leaves the units unknown, never guessed.
  const bare = parseHkHistory(historyPayload({ qt: {} }), { symbol: 'HK.00700', limit: 320, now: NOW })
  assert.equal(bare.volumeBasis, 'unknown')
  assert.equal(bare.bars.at(-1)!.volume, null)
  assert.equal(bare.bars.at(-1)!.amount, null)
  // A turnover column that is already HKD is recognised instead of being ×10000.
  const yuan = parseHkHistory(historyPayload({ qt: { hk00700: qtFields({ 37: '1254820.80' }) } }), { symbol: 'HK.00700', limit: 320, now: NOW })
  assert.equal(hkAmountUnit(parseHkDailyRows(HISTORY_ROWS), 1254820.8), 'yuan')
  assert.equal(yuan.bars.at(-1)!.amount, 1254821)
})

test('HK daily rows reject impossible bars and empty answers', () => {
  const rows = parseHkDailyRows([
    ['2026-11-04', '397.800', '401.600', '402.200', '391.600', '18500105.000'],
    // duplicated date, unsorted order, impossible OHLC, non-numeric volume
    ['2026-11-04', '397.800', '401.600', '402.200', '391.600', '18500105.000'],
    ['2026-11-02', '397.800', '401.600', '402.200', '391.600', '18500105.000'],
    ['2026-11-05', '400.000', '398.000', '401.000', '399.000', '1'],
    ['2026-11-05', '400.000', '400.000', '390.000', '410.000', '1'],
    ['2026-11-05', '400.000', '400.000', '410.000', '390.000', 'abc'],
  ])
  assert.deepEqual(rows.map(row => row.sessionDate), ['2026-11-04'])
  assert.throws(() => parseHkDailyRows([]), { code: 'finance/hk-history-unavailable' })
  assert.throws(() => parseHkDailyRows('x' as any), { code: 'finance/hk-history-unavailable' })
  assert.throws(() => parseHkHistory({ code: 1 }, { symbol: 'HK.00700', limit: 320, now: NOW }), { code: 'finance/hk-history-unavailable' })
  assert.throws(() => parseHkHistory({ code: 0, data: {} }, { symbol: 'HK.00700', limit: 320, now: NOW }), { code: 'finance/hk-history-unavailable' })
  // 89999 answers with an empty `day` series: no bars is unavailable, not invalid.
  assert.throws(() => parseHkHistory({ code: 0, data: { hk00700: { day: [], qt: { hk00700: [] } } } }, { symbol: 'HK.00700', limit: 320, now: NOW }),
    { code: 'finance/hk-history-unavailable' })
})

test('HK requests accept only the two documented envelopes', () => {
  assert.deepEqual(parseHkRequest({ kind: 'quote', symbol: 'HK.00700' }), { kind: 'quote', symbol: 'HK.00700' })
  assert.deepEqual(parseHkRequest({ kind: 'history', symbol: 'hk.00700', limit: 320 }), { kind: 'history', symbol: 'HK.00700', limit: 320 })
  for (const bad of [null, [], {}, { kind: 'quote' }, { kind: 'quote', symbol: 'HK.00700', extra: 1 },
    { kind: 'history', symbol: 'HK.00700' }, { kind: 'history', symbol: 'HK.00700', limit: 0 },
    // The US route's venue code is not part of this envelope.
    { kind: 'history', symbol: 'HK.00700', limit: 320, code: '00700' }]) {
    assert.throws(() => parseHkRequest(bad as any), { code: 'finance/hk-invalid' })
  }
})

test('the HK provider calls the fixed hosts and never leaks an upstream error', async () => {
  const calls: any[] = []
  const provider = createTencentHkProvider({
    now: () => NOW,
    fetchImpl: async (url: any, init: any) => {
      calls.push({ url: String(url), init })
      if (String(url).includes('hkfqkline')) return new Response(JSON.stringify(historyPayload()), { headers: { 'content-type': 'application/json' } })
      return new Response(quoteText().replace(/[^\x00-\x7f]/g, ''), { headers: { 'content-type': 'text/plain; charset=gbk' } })
    },
  })
  assert.equal(provider.name, HK_SOURCE_NAME)
  const quote = await provider.quote('hk.00700')
  assert.equal(quote.symbol, 'HK.00700')
  assert.equal(quote.price, 428)
  const history = await provider.history({ symbol: 'HK.00700', limit: 320 })
  assert.equal(history.bars.length, 3)
  assert.deepEqual(calls.map(call => call.url), [
    'https://qt.gtimg.cn/q=hk00700',
    'https://proxy.finance.qq.com/ifzqgtimg/appstock/app/hkfqkline/get?param=hk00700,day,,,320,qfq',
  ])
  assert.equal(calls[0].init.redirect, 'error')
  assert.equal(calls[0].init.method, 'GET')
  assert.ok(calls[0].init.signal instanceof AbortSignal)
  assert.throws(() => createTencentHkProvider({ fetchImpl: null as any }), { message: 'hk fetch unavailable' })
  assert.throws(() => createTencentHkProvider({ fetchImpl: async () => new Response(''), timeoutMs: 0 }), { message: 'invalid hk timeout' })

  const failing = createTencentHkProvider({ fetchImpl: async () => new Response('denied secret', { status: 403 }) })
  await assert.rejects(() => failing.quote('HK.00700'), { code: 'finance/hk-unavailable', message: '港股行情暂不可用，请稍后重试。' })
  const json = createTencentHkProvider({ fetchImpl: async () => new Response('x', { headers: { 'content-type': 'image/png' } }) })
  await assert.rejects(() => json.quote('HK.00700'), { code: 'finance/hk-unavailable' })
  const broken = createTencentHkProvider({ fetchImpl: async () => new Response('not json', { headers: { 'content-type': 'application/json' } }) })
  await assert.rejects(() => broken.history({ symbol: 'HK.00700', limit: 10 }), { code: 'finance/hk-history-unavailable' })
})

test('the HK provider honours caller cancellation', async () => {
  const abort = new AbortController()
  const provider = createTencentHkProvider({
    fetchImpl: async (_url: any, init: any) => new Promise<Response>((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true })
    }),
  })
  const pending = provider.quote('HK.00700', { signal: abort.signal })
  abort.abort()
  // A cancelled request is reported as cancelled, never as an upstream failure.
  await assert.rejects(() => pending, { code: 'finance/cancelled' })
  const cancelled = new AbortController()
  cancelled.abort()
  await assert.rejects(async () => {
    const provider = createTencentHkProvider({ fetchImpl: async () => new Response('v_hk00700="1"') })
    return provider.quote('HK.00700', { signal: cancelled.signal })
  }, { code: 'finance/cancelled' })
})

const OWNER = { principal: { kind: 'owner' } }
const invoke = async (handler: any, payload: any, signal?: any, peer: any = OWNER): Promise<any> =>
  handler(HK_ENDPOINT, payload, signal, peer)

test('the HK handler is owner-only, endpoint-exact and never fetches while the source is off', async () => {
  const handler = createHkHandler({
    enabled: () => true,
    provider: {
      name: 'test',
      quote: async () => parseHkQuote(quoteText(), 'HK.00700', NOW),
      history: async () => parseHkHistory(historyPayload(), { symbol: 'HK.00700', limit: 320, now: NOW }),
    },
  })
  assert.equal((await invoke(handler, { kind: 'quote', symbol: 'HK.00700' }, undefined, { principal: { kind: 'guest' } })).error.code, 'finance/forbidden')
  assert.equal((await handler('dsh-x-finance.other' as any, { kind: 'quote', symbol: 'HK.00700' } as any, undefined, OWNER as any) as any).error.code, 'finance/not-found')
  assert.equal((await invoke(handler, { kind: 'nope' })).error.code, 'finance/hk-invalid')

  let fetched = 0
  const off = createHkHandler({
    enabled: () => false,
    provider: { name: 'test', quote: async () => { fetched++; throw new Error() }, history: async () => { fetched++; throw new Error() } },
  })
  const disabled = await invoke(off, { kind: 'quote', symbol: 'HK.00700' })
  assert.deepEqual(disabled, { ok: true, value: { status: 'disabled' } })
  assert.equal(fetched, 0)
})

test('the HK handler projects both answers and maps provider failures to stable codes', async () => {
  const handler = createHkHandler({
    enabled: () => true,
    provider: {
      name: 'test',
      // A replacement adapter cannot slip another symbol or currency through.
      quote: async () => ({ ...parseHkQuote(quoteText(), 'HK.00700', NOW), currency: 'USD' as any }),
      history: async () => parseHkHistory(historyPayload(), { symbol: 'HK.00700', limit: 320, now: NOW }),
    },
  })
  assert.equal((await invoke(handler, { kind: 'quote', symbol: 'HK.00700' })).error.code, 'finance/hk-quote-invalid')
  const history = await invoke(handler, { kind: 'history', symbol: 'HK.00700', limit: 320 })
  assert.equal(history.ok, true)
  assert.equal(history.value.status, 'ready')
  assert.equal(history.value.history.symbol, 'HK.00700')
  assert.equal(history.value.history.bars.length, 3)

  const failing = createHkHandler({ enabled: () => true, provider: { name: 'test', quote: async () => { throw Object.assign(new Error('x'), { code: 'finance/hk-quote-unavailable' }) }, history: async () => { throw new Error('boom') } } })
  assert.equal((await invoke(failing, { kind: 'quote', symbol: 'HK.00700' })).error.code, 'finance/hk-quote-unavailable')
  assert.equal((await invoke(failing, { kind: 'history', symbol: 'HK.00700', limit: 320 })).error.code, 'finance/hk-unavailable')
  const abort = new AbortController()
  abort.abort()
  assert.equal((await invoke(handler, { kind: 'quote', symbol: 'HK.00700' }, abort.signal)).error.code, 'finance/cancelled')
})

test('the exact HK route echoes generic RPC envelopes', async () => {
  const route = createHkRoute({ enabled: () => true, provider: undefined })
  assert.ok(route)
  const handler = createHkHandler({ enabled: () => true, provider: undefined })
  const result = await invoke(handler, { kind: 'quote', symbol: 'HK.00700' })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'finance/hk-unavailable')
})

test('HK directory rows resolve to an identity and skip warrants and RMB counters', () => {
  const escape = (text: string) => [...text].map(c => c.codePointAt(0)! > 127 ? `\\u${c.codePointAt(0)!.toString(16).padStart(4, '0')}` : c).join('')
  const entry = (market: string, code: string, name: string, klass: string) => [market, code, escape(name), 'py', klass].join('~')
  const matches = parseHkInstrumentHints(`v_hint="${[
    entry('hk', '00700', '腾讯控股', 'GP'),
    entry('hk', '80700', '腾讯控股r', 'GP'),
    entry('hk', '02800', '盈富基金', 'GP'),
    entry('hk', '14203', '盈富麦银七五购A', 'QZ'),
    entry('hk', '700', '短代码', 'GP'),
    entry('us', 'aapl.oq', 'Apple', 'GP'),
    entry('hk', '00700', '腾讯控股', 'GP'),
  ].join('^')}"`)
  assert.deepEqual(matches, [
    { symbol: 'HK.00700', name: '腾讯控股', kind: 'stock', market: 'hk' },
    { symbol: 'HK.02800', name: '盈富基金', kind: 'stock', market: 'hk' },
  ])
})

test('the store, quote and history of one HK symbol cannot be confused', () => {
  const quote = parseHkQuote(quoteText(), 'HK.00700', NOW)
  assert.equal(quote.symbol, 'HK.00700')
  // Projection re-validates identity, currency and numeric bounds.
  assert.equal(projectHkQuote(quote, 'HK.00700', NOW).price, 428)
  assert.throws(() => projectHkQuote(quote, 'HK.00005', NOW), { code: 'finance/hk-quote-invalid' })
  assert.throws(() => projectHkQuote({ ...quote, price: -1 }, 'HK.00700', NOW), { code: 'finance/hk-quote-invalid' })
  const history = parseHkHistory(historyPayload(), { symbol: 'HK.00700', limit: 320, now: NOW })
  assert.equal(projectHkHistory(history, 'HK.00700', NOW).bars.length, 3)
  assert.throws(() => projectHkHistory(history, 'HK.09988', NOW), { code: 'finance/hk-history-invalid' })
  assert.throws(() => projectHkHistory({ ...history, bars: [] }, 'HK.00700', NOW), { code: 'finance/hk-history-invalid' })
})
