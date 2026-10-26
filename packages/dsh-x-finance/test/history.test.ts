import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MARKET_ENDPOINT, MARKET_HISTORY_MAX_LIMIT, parseMarketRequest, validateAdjustment, validateHistoryLimit,
} from '../src/market.ts'
import {
  MARKET_HISTORY_ENDPOINT, createTencentMarketProvider, inferVolumeUnit, isIndexSymbol, parseDailyRows, projectHistory,
} from '../src/market-provider.ts'
import type { RawDailyRow } from '../src/market-provider.ts'
import { createMarketHandler, projectHistoryResponse } from '../src/market-rpc.ts'
import { validateSymbol } from '../src/watchlist.ts'

const NOW = Date.parse('2026-10-19T11:00:00+08:00')

// Tencent rows are [date, open, close, high, low, volume, {}, rate, amountWan].
// `lots` models a SSE/SZSE row (volume in 手), `shares` a STAR row (volume in 股).
function row(date: string, open: number, close: number, high: number, low: number, volume: number, amountWan: number | null = null) {
  return [date, String(open), String(close), String(high), String(low), String(volume), {}, '0.5', amountWan === null ? '' : String(amountWan), '']
}

function payload(key: 'qfqday' | 'hfqday' | 'day', rows: unknown[], name = '贵州茅台', code = 'sh600519') {
  return {
    code: 0,
    msg: '',
    data: {
      [code]: {
        [key]: rows,
        qt: { [code]: ['1', name, code.slice(2), '1322.50'] },
        prec: '1329.00',
        version: '18',
      },
    },
  }
}

const quote = (volume: number, close: number, lots: boolean) =>
  // Turnover in 万元 whose implied average price matches the chosen unit.
  (volume * close * (lots ? 100 : 1)) / 10_000

const rows = [
  row('2026-10-15', 1311.57, 1329.0, 1329.88, 1301.68, 38502, quote(38502, 1329, true)),
  row('2026-10-16', 1322.5, 1337.1, 1348.6, 1321.0, 22179, quote(22179, 1337, true)),
  // The newest row is today's still-running session, so only it is provisional.
  row('2026-10-19', 1322.5, 1337.26, 1348.6, 1321.0, 21007, quote(21007, 1337, true)),
]

function fakeFetch(body: unknown, urls: string[] = []) {
  return (async (input: any) => {
    urls.push(String(input))
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
}

test('history requests are exact and bounded', () => {
  assert.deepEqual(
    parseMarketRequest({ kind: 'history', symbol: 'SH.600519', adjustment: 'forward', limit: 250 }),
    { kind: 'history', symbol: 'SH.600519', adjustment: 'forward', limit: 250 },
  )
  assert.equal(validateAdjustment('none'), 'none')
  assert.equal(validateHistoryLimit(MARKET_HISTORY_MAX_LIMIT), MARKET_HISTORY_MAX_LIMIT)
  const bad = [
    { kind: 'history', symbol: 'SH.600519', adjustment: 'forward' },
    { kind: 'history', symbol: 'SH.600519', adjustment: 'split', limit: 10 },
    { kind: 'history', symbol: 'SH.600519', adjustment: 'forward', limit: 0 },
    { kind: 'history', symbol: 'SH.600519', adjustment: 'forward', limit: 1.5 },
    { kind: 'history', symbol: 'SH.600519', adjustment: 'forward', limit: MARKET_HISTORY_MAX_LIMIT + 1 },
    { kind: 'history', symbol: 'AAPL', adjustment: 'forward', limit: 10 },
    { kind: 'history', symbol: 'SH.600519', adjustment: 'forward', limit: 10, extra: true },
    { kind: 'history', symbol: 'SH.600519', adjustment: 'forward', limit: '10' },
  ]
  for (const request of bad) assert.throws(() => parseMarketRequest(request), { code: 'invalid-input' }, JSON.stringify(request))
  assert.throws(() => validateHistoryLimit(Number.NaN), { code: 'invalid-input' })
})

test('daily rows keep the source open/close/high/low order and drop impossible rows', () => {
  const parsed = parseDailyRows([
    // Upstream order is date, open, close, high, low, volume. Treating it as
    // OHLC would turn close 1337.1 into the high and produce low > high.
    row('2026-10-16', 1322.5, 1337.1, 1348.6, 1321.0, 22179),
    row('2026-10-17', 10, 12, 9, 8, 100), // low > high, dropped
    ['bad-date', '1', '1', '1', '1', '1'],
    row('2026-10-18', 0, 12, 13, 1, 100), // nonpositive price, dropped
    row('2026-10-15', 1311.57, 1329.0, 1329.88, 1301.68, 38502), // earlier than the last accepted date, dropped
    row('2026-10-20', 11, 12, 13, 10, 100),
  ])
  assert.deepEqual(parsed.map(item => item.sessionDate), ['2026-10-16', '2026-10-20'])
  assert.deepEqual(parsed[0], {
    sessionDate: '2026-10-16', open: 1322.5, close: 1337.1, high: 1348.6, low: 1321.0, volume: 22179, amountWan: null,
  })
  assert.throws(() => parseDailyRows([]), /history empty/)
  assert.throws(() => parseDailyRows(null), /history empty/)
})

test('volume unit is inferred from turnover, never assumed', () => {
  const lots: RawDailyRow[] = rows.map(item => ({
    sessionDate: String(item[0]), open: 1, high: 2, low: 0.5, close: Number(item[2]),
    volume: Number(item[5]), amountWan: Number(item[8]),
  }))
  assert.equal(inferVolumeUnit(lots)?.unit, 'lots')
  const shares = lots.map(item => ({ ...item, volume: item.volume! * 100, amountWan: item.amountWan! }))
  assert.equal(inferVolumeUnit(shares)?.unit, 'shares')
  // Missing turnover cannot establish a unit, so volume must stay unknown.
  assert.equal(inferVolumeUnit(lots.map(item => ({ ...item, amountWan: null }))), null)
  // A mixed sample is ambiguous rather than "mostly right".
  const mixed = [...lots, ...shares].map((item, index) => ({ ...item, volume: index % 2 ? item.volume! * 100 : item.volume }))
  assert.equal(inferVolumeUnit(mixed), null)
})

test('history converts lots to shares, keeps unknown volume null and marks only the tail provisional', async () => {
  const urls: string[] = []
  const provider = createTencentMarketProvider({ now: () => NOW, fetchImpl: fakeFetch(payload('qfqday', rows), urls) })
  const history = await provider.history!('SH.600519', { adjustment: 'forward', limit: 250 })
  assert.equal(urls.length, 1)
  assert.equal(urls[0], `${MARKET_HISTORY_ENDPOINT}?param=sh600519,day,,,250,qfq`)
  assert.equal(history.symbol, 'SH.600519')
  assert.equal(history.name, '贵州茅台')
  assert.equal(history.adjustment, 'forward')
  assert.equal(history.volumeBasis, 'lots')
  assert.equal(history.volumeUnit, 'shares')
  assert.equal(history.currency, 'CNY')
  assert.equal(history.bars.length, 3)
  // 手 -> 股: 38,502 手 is 3,850,200 shares.
  assert.equal(history.bars[0]!.volume, 3_850_200)
  assert.equal(history.bars[0]!.amount, Math.round(quote(38502, 1329, true) * 10_000))
  assert.deepEqual(history.bars.map(bar => bar.isFinal), [true, true, false])
  assert.equal(history.firstSessionDate, '2026-10-15')
  assert.equal(history.lastSessionDate, '2026-10-19')
})

test('a source that ignores qfq is reported as unadjusted instead of claiming forward adjustment', async () => {
  const provider = createTencentMarketProvider({ now: () => NOW, fetchImpl: fakeFetch(payload('day', rows)) })
  const history = await provider.history!('SH.600519', { adjustment: 'forward', limit: 250 })
  assert.equal(history.adjustment, 'none')
  assert.match(history.adjustmentLabel, /unadjusted/)
})

test('history without turnover reports null volume and a clear basis', async () => {
  const bare = rows.map(item => [...item.slice(0, 8), '', ''])
  const provider = createTencentMarketProvider({ now: () => NOW, fetchImpl: fakeFetch(payload('day', bare)) })
  const history = await provider.history!('SH.600519', { adjustment: 'none', limit: 250 })
  assert.equal(history.volumeBasis, 'unknown')
  assert.deepEqual(history.bars.map(bar => bar.volume), [null, null, null])
  assert.deepEqual(history.bars.map(bar => bar.amount), [null, null, null])
})

test('history failures stay bounded and never leak the upstream body', async () => {
  const failing = createTencentMarketProvider({
    now: () => NOW,
    fetchImpl: (async () => new Response('upstream secret', { status: 500 })) as typeof fetch,
  })
  await assert.rejects(failing.history!('SH.600519', { adjustment: 'none', limit: 10 }))
  const empty = createTencentMarketProvider({ now: () => NOW, fetchImpl: fakeFetch(payload('day', [])) })
  await assert.rejects(empty.history!('SH.600519', { adjustment: 'none', limit: 10 }), /history empty/)
  const noSymbol = createTencentMarketProvider({ now: () => NOW, fetchImpl: fakeFetch({ code: 0, data: {} }) })
  await assert.rejects(noSymbol.history!('SH.600519', { adjustment: 'none', limit: 10 }), /history missing/)
  const wrongCode = createTencentMarketProvider({ now: () => NOW, fetchImpl: fakeFetch({ code: 1, data: {} }) })
  await assert.rejects(wrongCode.history!('SH.600519', { adjustment: 'none', limit: 10 }), /request failed/)
})

test('history is cached briefly and shares one in-flight request', async () => {
  let calls = 0
  const provider = createTencentMarketProvider({
    now: () => NOW,
    fetchImpl: (async () => { calls++; return new Response(JSON.stringify(payload('day', rows)), { headers: { 'content-type': 'application/json' } }) }) as typeof fetch,
  })
  const [first, second] = await Promise.all([
    provider.history!('SH.600519', { adjustment: 'none', limit: 250 }),
    provider.history!('SH.600519', { adjustment: 'none', limit: 250 }),
  ])
  assert.equal(calls, 1)
  assert.deepEqual(first.bars, second.bars)
  await provider.history!('SH.600519', { adjustment: 'forward', limit: 250 })
  assert.equal(calls, 2, 'a different adjustment is a different request')
})

test('history RPC revalidates the projection and hides a missing adapter', async () => {
  const history = {
    symbol: 'SH.600519', name: '贵州茅台', source: 'test', fetchedAt: new Date(NOW).toISOString(),
    adjustment: 'forward', adjustmentLabel: 'forward', pricePrecision: 2, volumeUnit: 'shares', volumeBasis: 'lots',
    amountUnit: 'CNY', currency: 'CNY', exchangeTimezone: 'Asia/Shanghai',
    firstSessionDate: '2026-10-15', lastSessionDate: '2026-10-16',
    bars: [
      { sessionDate: '2026-10-15', open: 1311.57, high: 1329.88, low: 1301.68, close: 1329, volume: 3_850_200, amount: null, isFinal: true },
      { sessionDate: '2026-10-16', open: 1322.5, high: 1348.6, low: 1321, close: 1337.1, volume: 2_217_900, amount: null, isFinal: true },
      { sessionDate: '2026-10-19', open: 1322.5, high: 1348.6, low: 1321, close: 1337.26, volume: 2_100_700, amount: null, isFinal: false },
    ],
  }
  const provider: any = {
    name: 'test',
    overview: async () => { throw new Error('unused') },
    breadth: async () => { throw new Error('unused') },
    board: async () => { throw new Error('unused') },
    quotes: async () => [],
    history: async () => ({ ...history, extra: 'must not leak' }),
  }
  const owner = { principal: { kind: 'owner' } }
  const handler = createMarketHandler({ provider, now: () => NOW })
  const response: any = await handler(MARKET_ENDPOINT, { kind: 'history', symbol: 'SH.600519', adjustment: 'forward', limit: 250 }, undefined, owner)
  assert.equal(response.ok, true)
  assert.equal(response.value.history.bars.length, 3)
  assert.equal(response.value.history.fetchedAt, new Date(NOW).toISOString())
  assert.equal('extra' in response.value.history, false)
  assert.equal(response.value.history.bars[0].volume, 3_850_200)

  const unadjusted: any = await createMarketHandler({ provider: { ...provider, history: async () => ({ ...history, adjustment: 'none' }) }, now: () => NOW })(
    MARKET_ENDPOINT, { kind: 'history', symbol: 'SH.600519', adjustment: 'forward', limit: 250 }, undefined, owner,
  )
  assert.equal(unadjusted.value.history.adjustment, 'none', 'the adapter, not the request, decides provenance')

  const noHistory: any = await createMarketHandler({ provider: { ...provider, history: undefined }, now: () => NOW })(
    MARKET_ENDPOINT, { kind: 'history', symbol: 'SH.600519', adjustment: 'forward', limit: 250 }, undefined, owner,
  )
  assert.equal(noHistory.error.code, 'finance/history-unavailable')

  const broken: any = await createMarketHandler({
    provider: { ...provider, history: async () => ({ ...history, bars: [...history.bars].reverse() }) }, now: () => NOW,
  })(MARKET_ENDPOINT, { kind: 'history', symbol: 'SH.600519', adjustment: 'forward', limit: 250 }, undefined, owner)
  assert.equal(broken.error.code, 'finance/history-unavailable')
  assert.doesNotMatch(JSON.stringify(broken), /2026-10-1/)
})

test('history projection rejects malformed bars instead of repairing them', () => {
  const base: any = {
    symbol: 'SH.600519', name: 'N', source: 'S', adjustment: 'none', adjustmentLabel: 'none',
    pricePrecision: 2, volumeBasis: 'lots',
    bars: [{ sessionDate: '2026-10-16', open: 1, high: 2, low: 0.5, close: 1.5, volume: null, amount: null, isFinal: true }],
  }
  assert.equal(projectHistoryResponse(base, 'SH.600519', 'none', 250, NOW).bars.length, 1)
  const reject = (change: (value: any) => void) => {
    const value = structuredClone(base)
    change(value)
    assert.throws(() => projectHistoryResponse(value, 'SH.600519', 'none', 250, NOW), { code: 'finance/history-unavailable' })
  }
  reject(value => { value.symbol = 'SZ.000001' })
  reject(value => { value.bars[0].high = 1 })
  reject(value => { value.bars[0].close = -1 })
  reject(value => { value.bars[0].volume = -1 })
  reject(value => { value.bars[0].isFinal = 'yes' })
  reject(value => { value.pricePrecision = 9 })
  reject(value => { value.volumeBasis = 'guessed' })
  reject(value => { value.name = '' })
  reject(value => { value.bars = [] })
  reject(value => { value.bars = [value.bars[0], value.bars[0]] })
})

test('index volume stays the source aggregate and is not labelled as shares', () => {
  assert.equal(isIndexSymbol('SH.000001'), true)
  assert.equal(isIndexSymbol('SZ.399001'), true)
  assert.equal(isIndexSymbol('BJ.899050'), true)
  assert.equal(isIndexSymbol('SZ.000001'), false)
  assert.equal(isIndexSymbol('SH.600519'), false)
  const history = projectHistory({
    symbol: 'SH.000001', name: '上证指数', adjustment: 'none', precision: 2, now: NOW,
    rows: [
      { sessionDate: '2026-10-16', open: 3700, close: 3716, high: 3736, low: 3696, volume: 245_000_000, amountWan: 40_000_000 },
      { sessionDate: '2026-10-19', open: 3694, close: 3725, high: 3733, low: 3692, volume: 266_000_000, amountWan: 44_500_000 },
    ],
  })
  assert.equal(history.volumeBasis, 'reported')
  assert.equal(history.bars[0]!.volume, 245_000_000)
  assert.equal(history.bars[1]!.isFinal, false)
  assert.equal(history.bars[0]!.isFinal, true)
})

test('history accepts exactly the four Hang Seng index codes and nothing else', () => {
  assert.deepEqual(
    parseMarketRequest({ kind: 'history', symbol: 'HK.HSI', adjustment: 'none', limit: 250 }),
    { kind: 'history', symbol: 'HK.HSI', adjustment: 'none', limit: 250 },
  )
  // A wider HK prefix would open the chart for codes the source cannot answer.
  for (const symbol of ['HK.HSX', 'HK.00700', 'HK.hsi', 'HK.HSCEI.X']) {
    assert.throws(() => parseMarketRequest({ kind: 'history', symbol, adjustment: 'none', limit: 10 }), { code: 'invalid-input' }, symbol)
  }
  // The A-share watchlist and quote batch keep rejecting them.
  assert.throws(() => validateSymbol('HK.HSI'))
})

test('Hang Seng bars stay in HKD on the Hong Kong session and never claim share volume', async () => {
  const hkRows = [
    row('2026-10-15', 24649.449, 24761.131, 24791.199, 24648.289, 159_551_820_015, 15_955_182),
    row('2026-10-16', 24523.5, 24510.09, 24537.141, 24275.561, 102_202_959_184, 10_220_295.92),
    row('2026-10-19', 24554.58, 24642.51, 24767.221, 24554.58, 177_482_238_485, 17_748_223.85),
  ]
  const urls: string[] = []
  // The HK host ignores qfq and answers `day`, which the projection reports as
  // unadjusted instead of pretending a forward adjustment was applied.
  const provider = createTencentMarketProvider({
    now: () => NOW,
    fetchImpl: fakeFetch(payload('day', hkRows, '恒生指数', 'hkHSI'), urls),
  })
  const history = await provider.history!('HK.HSI', { adjustment: 'forward', limit: 250 })
  assert.equal(urls[0], `${MARKET_HISTORY_ENDPOINT}?param=hkHSI,day,,,250,qfq`)
  assert.equal(history.symbol, 'HK.HSI')
  assert.equal(history.adjustment, 'none')
  assert.equal(history.currency, 'HKD')
  assert.equal(history.amountUnit, 'HKD')
  assert.equal(history.exchangeTimezone, 'Asia/Hong_Kong')
  // The row's volume slot is turnover in HKD, so it is not published as volume.
  assert.equal(history.volumeBasis, 'unknown')
  assert.deepEqual(history.bars.map(bar => bar.volume), [null, null, null])
  assert.equal(history.bars[0]!.amount, 159_551_820_000)
  assert.deepEqual(history.bars.map(bar => bar.isFinal), [true, true, false])
})

test('the history trust boundary takes the currency and zone from the symbol', () => {
  const raw = {
    symbol: 'HK.HSI', name: '恒生指数', source: '腾讯行情 (unofficial)',
    adjustment: 'none', adjustmentLabel: 'unadjusted', pricePrecision: 2, volumeBasis: 'unknown',
    // A replacement adapter may copy the A-share pair; the Host does not repeat it.
    currency: 'CNY', amountUnit: 'CNY', exchangeTimezone: 'Asia/Shanghai',
    bars: [
      { sessionDate: '2026-10-16', open: 24523.5, high: 24537.1, low: 24275.5, close: 24510.09, volume: null, amount: 102_202_959_184, isFinal: true },
    ],
  }
  const projected = projectHistoryResponse(raw, 'HK.HSI', 'none', 250, NOW)
  assert.equal(projected.currency, 'HKD')
  assert.equal(projected.amountUnit, 'HKD')
  assert.equal(projected.exchangeTimezone, 'Asia/Hong_Kong')
  const mainland = projectHistoryResponse({ ...raw, symbol: 'SH.000001', name: '上证指数' }, 'SH.000001', 'none', 250, NOW)
  assert.equal(mainland.currency, 'CNY')
  assert.equal(mainland.exchangeTimezone, 'Asia/Shanghai')
})
