import test from 'node:test'
import assert from 'node:assert/strict'
import { parseMarketRequest } from '../src/market.ts'
import { MARKET_INTRADAY_ENDPOINT, createTencentMarketProvider, intradayUrl, parseTrendsPayload } from '../src/market-provider.ts'
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
  assert.throws(() => projectIntradayResponse({ ...raw, points: [{ time: '12:00', price: 1, volume: 1, average: 1 }] }, 'SH.600519', NOW), { code: 'stock/intraday-unavailable' })
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
