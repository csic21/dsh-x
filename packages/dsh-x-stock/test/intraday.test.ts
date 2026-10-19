import test from 'node:test'
import assert from 'node:assert/strict'
import { parseMarketRequest } from '../src/market.ts'
import { MARKET_MINUTE_ENDPOINT, createTencentMarketProvider, parseMinutePayload } from '../src/market-provider.ts'
import { projectIntradayResponse } from '../src/market-rpc.ts'

const NOW = Date.parse('2026-10-19T11:00:00+08:00')

function payload(rows: string[], date = '20261019') {
  return {
    code: 0,
    data: {
      sh600519: {
        data: { date, data: rows },
        qt: { sh600519: ['1', '贵州茅台', '600519', '1401.50', '1390.00'] },
      },
    },
  }
}

test('minute rows keep lots, drop lunch and duplicates, and stay open during the session', () => {
  const parsed = parseMinutePayload(payload([
    '0930 1400.00 10 1400.00',
    '0930 1 1 1',
    '1131 1402.00 4 1401.00',
    '0931 1401.50 8 1400.70',
    'bad',
    '1501 1 1 1',
  ]), 'SH.600519', NOW)
  assert.deepEqual(parsed.points.map(point => point.time), ['09:30', '09:31'])
  assert.equal(parsed.points[0]!.volume, 10)
  assert.equal(parsed.previousClose, 1390)
  assert.equal(parsed.name, '贵州茅台')
  assert.equal(parsed.volumeBasis, 'lots')
  assert.equal(parsed.closed, false)
  assert.equal(parsed.sessionDate, '2026-10-19')
})

test('a session from an earlier Shanghai date is closed and is not relabelled', () => {
  const parsed = parseMinutePayload(payload(['1500 10.00 3 10.00'], '20261016'), 'SH.600519', NOW)
  assert.equal(parsed.closed, true)
  assert.equal(parsed.pricePrecision, 2)
})

test('the provider requests one symbol and does not invent a line when the source is empty', async () => {
  const urls: string[] = []
  const provider = createTencentMarketProvider({
    now: () => NOW,
    fetchImpl: (async (input: any) => {
      urls.push(String(input))
      return new Response(JSON.stringify(payload(['0930 1400.00 10 1400.00'])), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch,
  })
  const line = await provider.intraday!('SH.600519')
  assert.equal(urls[0], `${MARKET_MINUTE_ENDPOINT}sh600519`)
  assert.equal(line.points.length, 1)
  assert.throws(() => parseMinutePayload(payload([]), 'SH.600519', NOW), /intraday empty/)
  assert.throws(() => parseMarketRequest({ kind: 'intraday', symbol: 'SH.600519', limit: 1 }), { code: 'invalid-input' })
  assert.deepEqual(parseMarketRequest({ kind: 'intraday', symbol: 'SH.600519' }), { kind: 'intraday', symbol: 'SH.600519' })
})

test('the browser projection drops extra fields and rejects a point outside the session', () => {
  const raw = parseMinutePayload(payload(['0930 1400.00 10 1400.00']), 'SH.600519', NOW)
  const projected = projectIntradayResponse({ ...raw, secret: 'nope', points: raw.points.map(point => ({ ...point, note: 'x' })) }, 'SH.600519', NOW)
  assert.equal('secret' in projected, false)
  assert.equal('note' in projected.points[0]!, false)
  assert.throws(() => projectIntradayResponse({ ...raw, points: [{ time: '12:00', price: 1, volume: 1, average: 1 }] }, 'SH.600519', NOW), { code: 'stock/intraday-unavailable' })
})
