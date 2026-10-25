import test from 'node:test'
import assert from 'node:assert/strict'
import {
  HOT_STRATEGIES, HOT_STRATEGY_COUNT, hotHits, hotQualifies, hotScores, hotStrategy, hotWeight, isLimitUp,
  limitPercent, limitStreak, projectHotScan, sortHotHits,
} from '../src/hot.ts'
import type { HotBar, HotHit, HotScanResult, HotSnapshot } from '../src/hot.ts'
import { parseHotPage, parseHotRow } from '../src/market-provider.ts'
import { parseMarketRequest } from '../src/market.ts'
import { zh, en } from '../src/client/locales.ts'

const snapshot = (overrides: Partial<HotSnapshot> = {}): HotSnapshot => ({
  symbol: 'SH.600000',
  name: '测试股份',
  price: 10,
  changePercent: 0,
  turnoverRate: null,
  volumeRatio: null,
  speed: null,
  amplitude: null,
  amount: 1e8,
  floatCap: 1e10,
  totalCap: 2e10,
  mainInflow: null,
  change5d: null,
  change10d: null,
  change20d: null,
  change60d: null,
  board: 'main',
  suspended: false,
  ...overrides,
})

const bars = (closes: number[], volumes: number[] = closes.map(() => 1000)): HotBar[] =>
  closes.map((close, index) => ({
    sessionDate: `2025-01-${String((index % 28) + 1).padStart(2, '0')}`,
    open: close - 0.02,
    high: close + 0.05,
    low: close - 0.05,
    close,
    volume: volumes[index] ?? 1000,
  }))

test('registry exposes 35 unique strategies with labels in both locales', () => {
  assert.equal(HOT_STRATEGY_COUNT, 35)
  const ids = HOT_STRATEGIES.map(strategy => strategy.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(hotStrategy('limit-up')?.weight, 3)
  assert.equal(hotStrategy('nope'), undefined)
  for (const id of ids) {
    const key = `hot.strategy.${id}` as keyof typeof zh
    assert.equal(typeof zh[key], 'string', `zh label for ${id}`)
    assert.equal(typeof (en as Record<string, string>)[key], 'string', `en label for ${id}`)
  }
})

test('limit rate follows board and ST status', () => {
  assert.equal(limitPercent(snapshot()), 10)
  assert.equal(limitPercent(snapshot({ name: 'ST测试' })), 5)
  assert.equal(limitPercent(snapshot({ name: '*ST测试' })), 5)
  assert.equal(limitPercent(snapshot({ board: 'chinext' })), 20)
  assert.equal(limitPercent(snapshot({ board: 'star' })), 20)
  assert.equal(limitPercent(snapshot({ board: 'bse' })), 30)
  // A new listing has no reliable limit, so the rule stays silent.
  assert.equal(limitPercent(snapshot({ name: 'N测试' })), null)
  assert.equal(isLimitUp(snapshot({ changePercent: 9.8 })), true)
  assert.equal(isLimitUp(snapshot({ changePercent: 9.5 })), false)
  assert.equal(isLimitUp(snapshot({ board: 'chinext', changePercent: 19.9 })), true)
})

test('snapshot rules fire on their thresholds and stay quiet below them', () => {
  const hot = hotHits(snapshot({
    changePercent: 9.9,
    volumeRatio: 2.4,
    turnoverRate: 12,
    amount: 2e9,
    mainInflow: 2e8,
    speed: 0.8,
    amplitude: 9,
    change5d: 20,
    change20d: 40,
  }), null)
  for (const id of ['limit-up', 'surge-7', 'volume-ratio-2', 'turnover-10', 'amount-10e', 'main-inflow-strong', 'speed-up']) {
    assert.ok(hot.includes(id), `expected ${id}`)
  }
  const quiet = hotHits(snapshot({ changePercent: 1, volumeRatio: 0.8, turnoverRate: 1 }), null)
  assert.deepEqual(quiet, [])
  // No bars means no history rule can match, even when the snapshot is strong.
  assert.ok(hot.every(id => hotStrategy(id)?.layer === 'snapshot'))
})

test('history rules run only when bars exist', () => {
  const closes = Array.from({ length: 70 }, (_, index) => 10 + index * 0.1)
  const volumes = closes.map((_, index) => {
    if (index === closes.length - 3) return 2000
    if (index === closes.length - 2) return 3000
    if (index === closes.length - 1) return 8000
    return 1000
  })
  const hits = hotHits(snapshot(), bars(closes, volumes))
  for (const id of ['break-60d', 'break-20d', 'ma-bull', 'above-ma20', 'macd-bull', 'rsi-strong', 'volume-breakout', 'vol-expand-3']) {
    assert.ok(hits.includes(id), `expected ${id} in ${hits.join(',')}`)
  }
  assert.ok(!hits.includes('limit-up'))
})

test('consecutive limit-ups count from the latest session', () => {
  const closes = [...Array.from({ length: 21 }, () => 10), 11, 12.1, 13.31]
  const streak = limitStreak(bars(closes), 10)
  assert.equal(streak, 3)
  const hits = hotHits(snapshot({ changePercent: 10 }), bars(closes))
  assert.ok(hits.includes('limit-streak'))
  assert.ok(!hits.includes('limit-first'))
  assert.equal(limitStreak(bars([10, 10, 10]), 10), 0)
  assert.equal(limitStreak(bars(closes), null), 0)
})

test('a hit needs one strong rule, not a pile of weak ones', () => {
  assert.equal(hotQualifies(['surge-3']), false)
  assert.equal(hotQualifies(['surge-3', 'turnover-3', 'main-inflow']), false)
  assert.equal(hotQualifies(['surge-3', 'surge-7']), true)
  assert.equal(hotQualifies(['limit-up']), true)
  assert.equal(hotQualifies([]), false)
})

test('weights and scores normalise against the strongest hit list', () => {
  assert.equal(hotWeight(['limit-up']), 3)
  assert.equal(hotWeight(['limit-up', 'nope']), 3)
  assert.deepEqual(hotScores([3, 6, 0]), [50, 100, 0])
  assert.deepEqual(hotScores([]), [])
})

test('sorting is deterministic for equal scores', () => {
  const hit = (symbol: string, score: number, changePercent: number): HotHit => ({
    symbol, name: symbol, price: 10, changePercent, amount: 1e8, turnoverRate: null, volumeRatio: null, score, hits: ['limit-up'],
  })
  const sorted = sortHotHits([hit('SH.600003', 50, 1), hit('SH.600001', 50, 1), hit('SH.600002', 80, 2)])
  assert.deepEqual(sorted.map(item => item.symbol), ['SH.600002', 'SH.600001', 'SH.600003'])
})

test('parses one ranking row with unit conversions', () => {
  const row = parseHotRow({
    code: 'sz002249', name: '大洋电机', zxj: '7.58', zdf: '7.37', hsl: '15.77', lb: '7.80',
    speed: '-0.13', zf: '11.76', turnover: '217702', ltsz: '141.93', zsz: '187.65',
    zljlr: '-18161.40', zdf_d5: '23.86', zdf_d10: '18.81', zdf_d20: '20.13', zdf_d60: '8.60', state: '',
  })
  assert.ok(row)
  assert.equal(row.symbol, 'SZ.002249')
  assert.equal(row.amount, 2_177_020_000)
  assert.equal(row.floatCap, 1.4193e10)
  assert.equal(row.mainInflow, -181_614_000)
  assert.equal(row.board, 'main')
  assert.equal(parseHotRow({ code: 'sz002249', name: '', zxj: '7.58' }), null)
  assert.equal(parseHotRow({ code: 'xx1', name: '甲', zxj: '7.58' }), null)
})

test('parses a hot page and rejects an impossible total', () => {
  const page = parseHotPage({ data: { total: 5578, rank_list: [{ code: 'sh600519', name: '贵州茅台', zxj: '1335.00', zdf: '1.25', turnover: '767722' }] } })
  assert.equal(page.total, 5578)
  assert.equal(page.rows.length, 1)
  assert.throws(() => parseHotPage({ data: { total: 99_999, rank_list: [] } }))
  assert.throws(() => parseHotPage({ data: { total: -1, rank_list: [] } }))
})

test('the market request accepts an optional board and rejects anything else', () => {
  assert.deepEqual(parseMarketRequest({ kind: 'hot-scan' }), { kind: 'hot-scan' })
  assert.deepEqual(parseMarketRequest({ board: '801010', kind: 'hot-scan' }), { kind: 'hot-scan', board: '801010' })
  assert.throws(() => parseMarketRequest({ board: 'BK0493', kind: 'hot-scan' }))
  assert.throws(() => parseMarketRequest({ board: '801010', extra: 1, kind: 'hot-scan' }))
  assert.throws(() => parseMarketRequest({ kind: 'hot-scan', limit: 10 }))
})

test('projection bounds the result and drops unknown strategy ids', () => {
  const now = Date.UTC(2026, 9, 24)
  const raw = {
    source: 'test feed',
    fetchedAt: new Date(now).toISOString(),
    durationMs: 1234,
    strategyCount: HOT_STRATEGY_COUNT,
    board: null,
    universe: { expected: 5578, covered: 5578, scanned: 5500, historyChecked: 120, historyFailed: 3, partial: false },
    hitCount: 171,
    hits: [{
      symbol: 'SH.600000', name: '测试', price: 10, changePercent: 5, amount: 1e8,
      turnoverRate: 3, volumeRatio: 1.2, score: 100, hits: ['limit-up', 'bogus', 'limit-up'],
    }],
  }
  const result: HotScanResult = projectHotScan(raw, now)
  assert.equal(result.hits[0]?.hits.join(','), 'limit-up')
  assert.equal(result.universe.partial, true)
  assert.equal(result.hitCount, 171)
  assert.equal(result.fetchedAt, new Date(now).toISOString())
  // A symbol without an exchange qualifier is not a symbol we produced.
  assert.throws(() => projectHotScan({ ...raw, hits: [{ ...raw.hits[0], symbol: '600000' }] }, now))
  // Coverage that claims more scanned symbols than covered is inconsistent.
  assert.throws(() => projectHotScan({ ...raw, universe: { ...raw.universe, scanned: 6000 } }, now))
  // A row without a single known strategy is dropped, not shown without tags.
  assert.equal(projectHotScan({ ...raw, hits: [{ ...raw.hits[0], hits: ['bogus'] }] }, now).hits.length, 0)
})

test('the market handler serves a hot scan to the owner and fails closed otherwise', async () => {
  const { createMarketHandler } = await import('../src/market-rpc.ts')
  const { MARKET_ENDPOINT } = await import('../src/market.ts')
  const now = Date.UTC(2026, 9, 24, 8)
  const source: HotScanResult = {
    source: 'test feed',
    fetchedAt: new Date(now).toISOString(),
    durationMs: 2000,
    strategyCount: HOT_STRATEGY_COUNT,
    board: null,
    universe: { expected: 5578, covered: 5578, scanned: 5500, historyChecked: 120, historyFailed: 0, partial: false },
    hitCount: 171,
    hits: [{ symbol: 'SZ.002249', name: '大洋电机', price: 7.58, changePercent: 7.37, amount: 2.17e9, turnoverRate: 15.77, volumeRatio: 7.8, score: 100, hits: ['limit-up'] }],
  }
  const handler = createMarketHandler({ provider: { name: 'test', hotScan: async () => source } as any, now: () => now })
  const owner: any = await handler(MARKET_ENDPOINT, { kind: 'hot-scan' }, undefined, { principal: { kind: 'owner' } })
  assert.equal(owner.ok, true)
  assert.equal(owner.value.status, 'ready')
  assert.equal(owner.value.hotScan.hitCount, 171)
  assert.equal(owner.value.hotScan.hits[0].symbol, 'SZ.002249')
  const peer: any = await handler(MARKET_ENDPOINT, { kind: 'hot-scan' }, undefined, { principal: { kind: 'peer' } })
  assert.equal(peer.ok, false)
  const missing = createMarketHandler({ provider: { name: 'test' } as any, now: () => now })
  const unavailable: any = await missing(MARKET_ENDPOINT, { kind: 'hot-scan' }, undefined, { principal: { kind: 'owner' } })
  assert.equal(unavailable.ok, false)
  assert.equal(unavailable.error.code, 'finance/hot-scan-unavailable')
})
