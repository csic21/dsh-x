import test from 'node:test'
import assert from 'node:assert/strict'
import { GOLD_ENDPOINT, computeGoldSeries, deriveGold, goldStamp, parseGoldHistory, parseGoldQuote, parseGoldQuotes, validateGoldSnapshot } from '../src/gold.ts'
import type { GoldSnapshot } from '../src/gold.ts'
import { createGoldHandler } from '../src/gold-rpc.ts'

const NOW = Date.parse('2026-10-23T10:55:00+08:00')
const XAU = '4023.50,4024.260,4023.50,4023.85,4032.56,3986.78,10:54:00,4024.26,4025.41,0,0,0,2026-10-23,伦敦金（现货黄金）'
const GC = '4038.70,,4037.800,4038.100,4047.800,4000.900,10:54:21,4060.400,4042.200,0,1,2,2026-10-23,纽约黄金,0'
const CNH = '10:54:02,6.671900,6.672000,6.672600,37,6.671600,6.673700,6.670000,6.671900,离岸人民币（香港）,-0.010000,-0.000700,0.0005546,,6.995700,6.670700,,2026-10-23'
const AU9999 = '864.20,0,863.71,864.20,883.98,859.00,10:53:59,880.30,874.50,502878,90.00,53.00,2026-10-23,沪金99'

test('gold futures quotes keep price, range and previous close without inventing fields', () => {
  const quote = parseGoldQuote('hf_XAU', XAU.split(','), NOW)
  assert.equal(quote.key, 'XAU')
  assert.equal(quote.unit, 'usd-ounce')
  assert.equal(quote.price, 4023.5)
  assert.equal(quote.high, 4032.56)
  assert.equal(quote.low, 3986.78)
  assert.equal(quote.previousClose, 4024.26)
  assert.ok(Math.abs(quote.change! - (-0.76)) < 1e-9)
  assert.ok(Math.abs(quote.changePercent! - (-0.0189)) < 0.001)
  assert.ok(Math.abs(quote.amplitudePercent! - 1.1376) < 0.01)
  assert.equal(quote.quotedAt, '2026-10-23T02:54:00.000Z')
})

test('the offshore FX line uses its own clock and change fields', () => {
  const quote = parseGoldQuote('fx_susdcnh', CNH.split(','), NOW)
  assert.equal(quote.key, 'USDCNH')
  assert.equal(quote.unit, 'cny-usd')
  assert.equal(quote.price, 6.6719)
  assert.equal(quote.changePercent, -0.01)
  assert.equal(quote.change, -0.0007)
  assert.equal(quote.previousClose, null)
  assert.equal(quote.quotedAt, '2026-10-23T02:54:02.000Z')
})

test('a malformed or future gold stamp is dropped instead of clamped', () => {
  assert.equal(goldStamp('2026-10-23', '10:54:00', NOW), '2026-10-23T02:54:00.000Z')
  assert.equal(goldStamp('2026-10-23', '22:54:00', NOW), null)
  assert.equal(goldStamp('2026-02-30', '10:00:00', NOW), null)
  assert.equal(goldStamp('', '', NOW), null)
  assert.equal(goldStamp('2025-01-01', '10:00:00', NOW), null)
})

test('the batched feed keeps known instruments and skips everything else', () => {
  const text = [
    `var hq_str_hf_XAU="${XAU}";`,
    `var hq_str_fx_susdcnh="${CNH}";`,
    'var hq_str_sh600519="1~贵州茅台~600519";',
    'var hq_str_hf_BOGUS="1,2,3";',
    'garbage line',
  ].join('\n')
  const quotes = parseGoldQuotes(text, NOW)
  assert.deepEqual(quotes.map(quote => quote.key), ['XAU', 'USDCNH'])
})

test('daily JSONP parses, orders and bounds the series', () => {
  const body = '/*<script>location.href=\'//sina.com\';</script>*/\nvar _GC=(['
    + '{"date":"2026-10-21","open":"4000","high":"4060","low":"3990","close":"4050"},'
    + '{"date":"2026-10-22","open":"4050","high":"4080","low":"4040","close":"4070"},'
    + '{"date":"2026-10-22","open":"1","high":"2","low":"1","close":"2"}'
    + ']);'
  const bars = parseGoldHistory(body)
  assert.equal(bars.length, 2)
  assert.equal(bars.at(-1)!.date, '2026-10-22')
  assert.throws(() => parseGoldHistory('no array here'))
})

test('range moves use daily closes and leave short history empty', () => {
  const bars = Array.from({ length: 61 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 6, 1 + index)).toISOString().slice(0, 10)
    const close = 3000 + index * 10
    return { date, open: close - 5, high: close + 5, low: close - 10, close }
  })
  const series = computeGoldSeries('XAU', bars)
  const range = (label: string) => series.ranges.find(entry => entry.label === label)!.changePercent
  assert.ok(Math.abs(range('5d')! - ((3600 / 3550 - 1) * 100)) < 1e-9)
  assert.ok(Math.abs(range('20d')! - ((3600 / 3400 - 1) * 100)) < 1e-9)
  assert.equal(series.high52w, 3605)
  assert.equal(series.low52w, 2990)
  assert.equal(computeGoldSeries('GC', bars.slice(0, 2)).ranges[1]!.changePercent, null)
})

test('restatement and the Shanghai premium are arithmetic, not a signal', () => {
  const xau = parseGoldQuote('hf_XAU', XAU.split(','), NOW)
  const cnh = parseGoldQuote('fx_susdcnh', CNH.split(','), NOW)
  const sge = parseGoldQuote('gds_AU9999', AU9999.split(','), NOW)
  const derived = deriveGold([xau, cnh, sge])
  const expected = (4023.5 * 6.6719) / 31.1034768
  assert.ok(Math.abs(derived.londonCnyPerGram! - expected) < 1e-9)
  assert.ok(Math.abs(derived.shanghaiPremium! - (864.2 - expected)) < 1e-9)
  assert.ok(Math.abs(derived.shanghaiPremiumPercent! - ((864.2 - expected) / expected) * 100) < 1e-9)
  assert.equal(derived.goldSilverRatio, null)
})

function snapshot(): GoldSnapshot {
  return {
    source: '新浪财经 (unofficial)',
    fetchedAt: new Date(NOW).toISOString(),
    instruments: [
      parseGoldQuote('hf_XAU', XAU.split(','), NOW),
      parseGoldQuote('fx_susdcnh', CNH.split(','), NOW),
      parseGoldQuote('gds_AU9999', AU9999.split(','), NOW),
    ],
    derived: deriveGold([]),
    series: [],
    seriesIncomplete: true,
  }
}

test('the gold trust boundary rejects an unusable price and recomputes derived fields', () => {
  const valid = validateGoldSnapshot(snapshot(), NOW)
  assert.equal(valid.instruments.length, 3)
  assert.ok(Math.abs(valid.derived.londonCnyPerGram! - (4023.5 * 6.6719) / 31.1034768) < 1e-9)
  const broken = snapshot()
  ;(broken.instruments[0] as any).price = 0
  assert.throws(() => validateGoldSnapshot(broken, NOW))
  const unknown = snapshot()
  ;(unknown.instruments[1] as any).key = 'BTC'
  assert.throws(() => validateGoldSnapshot(unknown, NOW))
})

const provider = { name: 'fake', snapshot: async () => snapshot() }
const owner = { principal: { kind: 'owner' } }

test('gold route refuses non-owners, extra payload keys and a missing provider', async () => {
  const handle = createGoldHandler({ provider, now: () => NOW }) as any
  assert.equal((await handle(GOLD_ENDPOINT, {}, undefined, { principal: { kind: 'guest' } })).error.code, 'finance/forbidden')
  assert.equal((await handle(GOLD_ENDPOINT, { extra: 1 }, undefined, owner)).error.code, 'finance/invalid-input')
  assert.equal((await handle('dsh-x-finance.other', {}, undefined, owner)).error.code, 'finance/not-found')
  assert.deepEqual(await createGoldHandler({ provider: undefined })(GOLD_ENDPOINT, {}, undefined, owner), { ok: true, value: { status: 'unconfigured' } })
})

test('gold route projects a validated snapshot and hides upstream failures', async () => {
  const result: any = await createGoldHandler({ provider, now: () => NOW })(GOLD_ENDPOINT, {}, undefined, owner)
  assert.equal(result.ok, true)
  assert.equal(result.value.status, 'ready')
  assert.equal(result.value.snapshot.instruments.length, 3)
  const failing = createGoldHandler({ provider: { name: 'x', snapshot: async () => { throw new Error('boom') } }, now: () => NOW }) as any
  assert.equal((await failing(GOLD_ENDPOINT, {}, undefined, owner)).error.code, 'finance/gold-unavailable')
})
