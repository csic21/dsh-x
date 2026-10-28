import test from 'node:test'
import assert from 'node:assert/strict'
import { parseMarketRequest } from '../src/market.ts'
import {
  MARKET_INTRADAY_ATTEMPTS, MARKET_INTRADAY_ENDPOINT, MARKET_INTRADAY_TENCENT_SOURCE,
  createTencentMarketProvider, intradayUrl, parseTencentIntradayPayload, parseTrendsPayload, tencentMinuteUrl,
} from '../src/market-provider.ts'
import { projectIntradayResponse } from '../src/market-rpc.ts'
import { clockFromOffset, exchangeStamp, formatExchangeClock, intradayRange, sessionOffset } from '../src/client/chart/intraday-scale.ts'

const NOW = Date.parse('2026-10-19T11:00:00+08:00')

function row(time: string, close: number, volume: number, average: number) {
  return `${time},${close - 1},${close},${close + 1},${close - 2},${volume},100,${average}`
}

function payload(rows: string[], extra: any = {}) {
  return { data: { code: '600519', name: '贵州茅台', preClose: 1390, trends: rows, ...extra } }
}

test('trends keep the minute close and lots, and drop lunch, duplicates and the wrong symbol', () => {
  const parsed = parseTrendsPayload(payload([
    row('2026-10-19 09:30', 1400, 10, 1400),
    row('2026-10-19 09:30', 1, 1, 1),
    row('2026-10-19 11:31', 1402, 4, 1401),
    row('2026-10-19 09:31', 1401.5, 8, 1400.7),
    'bad',
    row('2026-10-19 15:01', 1, 1, 1),
  ]), 'SH.600519', NOW)
  assert.deepEqual(parsed.points.map(point => [point.time, point.price, point.volume]), [
    ['09:30', 1400, 10], ['09:31', 1401.5, 8],
  ])
  assert.equal(parsed.previousClose, 1390)
  assert.equal(parsed.name, '贵州茅台')
  assert.equal(parsed.volumeBasis, 'lots')
  assert.equal(parsed.closed, false)
  assert.equal(parsed.source.includes('东方财富'), true)
  assert.throws(() => parseTrendsPayload(payload([row('2026-10-19 09:30', 10, 1, 10)], { code: '000001' }), 'SH.600519', NOW), /intraday symbol/)
})

test('an earlier Beijing session is closed and the request names the Shanghai secid', async () => {
  const parsed = parseTrendsPayload(payload([row('2026-10-16 15:00', 10, 3, 10)]), 'SH.600519', NOW)
  assert.equal(parsed.closed, true)
  const urls: string[] = []
  const provider = createTencentMarketProvider({
    now: () => NOW,
    fetchImpl: (async (input: any) => {
      urls.push(String(input))
      return new Response(JSON.stringify(payload([row('2026-10-19 09:30', 1400, 10, 1400)])), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch,
  })
  const line = await provider.intraday!('SH.600519')
  assert.equal(urls[0], intradayUrl('SH.600519'))
  assert.equal(urls[0]?.startsWith(`${MARKET_INTRADAY_ENDPOINT}?`), true)
  assert.match(urls[0] ?? '', /secid=1\.600519/)
  assert.equal(line.points.length, 1)
  assert.throws(() => parseTrendsPayload(payload([]), 'SH.600519', NOW), /intraday empty/)
  assert.throws(() => parseMarketRequest({ kind: 'intraday', symbol: 'SH.600519', limit: 1 }), { code: 'invalid-input' })
})

test('the browser projection drops extra fields and rejects a point outside the session', () => {
  const raw = parseTrendsPayload(payload([row('2026-10-19 09:30', 1400, 10, 1400)]), 'SH.600519', NOW)
  const projected = projectIntradayResponse({ ...raw, secret: 'nope', points: raw.points.map(point => ({ ...point, note: 'x' })) }, 'SH.600519', NOW)
  assert.equal('secret' in projected, false)
  assert.equal('note' in projected.points[0]!, false)
  assert.throws(() => projectIntradayResponse({ ...raw, points: [{ time: '12:00', price: 1, volume: 1, average: 1 }] }, 'SH.600519', NOW), { code: 'finance/intraday-unavailable' })
})

test('the time axis is Beijing time and the lunch break does not take space', () => {
  assert.equal(formatExchangeClock(exchangeStamp('2026-10-19', '09:30')!), '09:30')
  assert.equal(formatExchangeClock(exchangeStamp('2026-10-19', '15:00')!), '15:00')
  assert.equal(sessionOffset('13:00')! - sessionOffset('11:30')!, 1)
  assert.equal(clockFromOffset(sessionOffset('13:00')!), '13:00')
  const range = intradayRange([110, 90], 100)
  assert.equal(range.priceMin < 90 && range.priceMax > 110, true)
  assert.equal(range.percent, -range.priceMin + 100 ? range.percent : range.percent)
  assert.ok(Math.abs((range.priceMax - 100) / 100 * 100 - range.percent) < 1e-9)
})

const json = (value: any) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })

/**
 * Tencent's minute rows are `HHmm price cumulativeVolume cumulativeAmount`: the
 * counters are session-to-date, and `qt[4]` is the previous close. The numbers
 * below are consistent (amount / lots × 100 is the same minute's price).
 */
function tencentPayload(code: string, rows: string[], extra: any = {}) {
  return {
    data: {
      [code]: {
        data: { date: '20261019', data: rows, ...extra.block },
        qt: { [code]: ['51', '贵州茅台', code.slice(2), '1401', '1390', '1400'] },
      },
    },
  }
}

test('the Tencent fallback derives per-minute volume and the running average from its counters', () => {
  const line = parseTencentIntradayPayload(tencentPayload('sh600519', [
    '0930 1400 10 1400000.00',
    '0931 1401 30 4203000.00',
    '1131 1402 40 5608000.00',
    '1505 1403 50 7015000.00',
  ]), 'SH.600519', NOW)
  assert.equal(line.source, MARKET_INTRADAY_TENCENT_SOURCE)
  assert.equal(line.sessionDate, '2026-10-19')
  assert.equal(line.previousClose, 1390)
  assert.equal(line.name, '贵州茅台')
  assert.equal(line.volumeBasis, 'lots')
  assert.equal(line.closed, false)
  // 09:31 keeps 20 lots (30 cumulative) and its average is 4,203,000 / (30 × 100).
  assert.deepEqual(line.points.map(point => [point.time, point.price, point.volume]), [['09:30', 1400, 10], ['09:31', 1401, 20]])
  assert.equal(line.points[0]!.average, 1400)
  assert.ok(Math.abs((line.points[1]!.average ?? 0) - 4203000 / 3000) < 1e-9)
  // The same projection the Host applies to the primary source accepts the fallback line.
  const projected = projectIntradayResponse(line, 'SH.600519', NOW)
  assert.equal(projected.points.length, 2)
  assert.equal(projected.volumeBasis, 'lots')
  assert.throws(() => parseTencentIntradayPayload(tencentPayload('sh600519', ['0930 1400 10 1400000.00'], { block: { date: '20261020' } }), 'SH.600519', NOW), /in the future/)
  assert.throws(() => parseTencentIntradayPayload(tencentPayload('sh600519', []), 'SH.600519', NOW), /intraday empty/)
})

test('a dropped connection is retried on the primary source instead of failing the line', async () => {
  const urls: string[] = []
  const provider = createTencentMarketProvider({
    now: () => NOW,
    retryDelayMs: 0,
    fetchImpl: (async (input: any) => {
      urls.push(String(input))
      if (urls.length === 1) throw new TypeError('Empty reply from server')
      return json(payload([row('2026-10-19 09:30', 1400, 10, 1400)]))
    }) as typeof fetch,
  })
  const line = await provider.intraday!('SH.600519')
  assert.equal(urls.length, 2)
  assert.equal(urls[0], intradayUrl('SH.600519'))
  assert.equal(line.source.includes('东方财富'), true)
})

test('a throttled East Money host falls back to the Tencent feed and says so', async () => {
  const urls: string[] = []
  const provider = createTencentMarketProvider({
    now: () => NOW,
    retryDelayMs: 0,
    fetchImpl: (async (input: any) => {
      const url = String(input)
      urls.push(url)
      // This is what push2.eastmoney.com does under load: it closes the socket.
      if (url.startsWith(MARKET_INTRADAY_ENDPOINT)) throw new TypeError('Empty reply from server')
      return json(tencentPayload('sh600519', ['0930 1400 10 1400000.00', '0931 1401 30 4203000.00']))
    }) as typeof fetch,
  })
  const line = await provider.intraday!('SH.600519')
  assert.equal(line.source, MARKET_INTRADAY_TENCENT_SOURCE)
  assert.equal(line.points.length, 2)
  assert.equal(urls.filter(url => url.startsWith(MARKET_INTRADAY_ENDPOINT)).length, MARKET_INTRADAY_ATTEMPTS)
  assert.equal(urls.at(-1), tencentMinuteUrl('SH.600519'))
})

test('a 分时 source that just failed is skipped for its cooldown', async () => {
  const urls: string[] = []
  const provider = createTencentMarketProvider({
    now: () => NOW,
    retryDelayMs: 0,
    fetchImpl: (async (input: any) => {
      const url = String(input)
      urls.push(url)
      if (url.startsWith(MARKET_INTRADAY_ENDPOINT)) throw new TypeError('Empty reply from server')
      return json(tencentPayload(url.includes('sz002594') ? 'sz002594' : 'sh600519', ['0930 1400 10 1400000.00']))
    }) as typeof fetch,
  })
  await provider.intraday!('SH.600519')
  urls.length = 0
  const line = await provider.intraday!('SZ.002594')
  assert.equal(line.source, MARKET_INTRADAY_TENCENT_SOURCE)
  // East Money stays on cooldown, so the next symbol costs one request, not two.
  assert.equal(urls.length, 1)
  assert.equal(urls[0]?.startsWith(MARKET_INTRADAY_ENDPOINT), false)
})

test('both 分时 sources down is a failure, while an empty answer is "no line for this symbol"', async () => {
  const urls: string[] = []
  const down = createTencentMarketProvider({
    now: () => NOW,
    retryDelayMs: 0,
    fetchImpl: (async (input: any) => { urls.push(String(input)); throw new TypeError('fetch failed') }) as typeof fetch,
  })
  await assert.rejects(() => down.intraday!('SH.600519'), (error: any) => error?.code !== 'finance/intraday-unavailable')
  // With nothing serving the chart the back-off buys nothing: the next request
  // starts over at the primary source instead of skipping it for a minute.
  urls.length = 0
  await assert.rejects(() => down.intraday!('SZ.002594'))
  assert.equal(urls[0]?.startsWith(MARKET_INTRADAY_ENDPOINT), true)
  const empty = createTencentMarketProvider({
    now: () => NOW,
    retryDelayMs: 0,
    fetchImpl: (async (input: any) => String(input).startsWith(MARKET_INTRADAY_ENDPOINT)
      ? json({ data: { code: '600519', name: '贵州茅台', preClose: 1390, trends: [] } })
      : json(tencentPayload('sh600519', []))) as typeof fetch,
  })
  await assert.rejects(() => empty.intraday!('SH.600519'), { code: 'finance/intraday-unavailable' })
})
