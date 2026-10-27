import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PREDICT_BARS, PREDICT_MAX_ROWS, PREDICT_TTL_MS, baseBucketFor, predictProbability,
  predictReasons, projectPredictScan, readRegime, scoreCandidate, sortPredictRows,
} from '../src/predict.ts'
import { PREDICT_MODEL } from '../src/predict-model.ts'
import type { PredictRow, PredictScanResult } from '../src/predict.ts'
import {
  HOT_CHANGE, PREDICT_FEATURE_NAMES, PREDICT_MIN_BARS, boardLimitRate, isLimitClose, isPredictCandidate,
  isPredictUniverse, percentileRank, predictFeatures, predictKnots, predictLimitStreak,
} from '../src/predict-features.ts'
import type { PredictBar, PredictCrossSection } from '../src/predict-features.ts'
import { MARKET_ENDPOINT, parseMarketRequest } from '../src/market.ts'
import { createMarketHandler } from '../src/market-rpc.ts'
import { zh, en } from '../src/client/locales.ts'

const NOW = Date.parse('2026-10-27T05:10:00.000Z')
const CROSS: PredictCrossSection = { upShare: 58, hotShare: 2.4, medianChange: 0.35 }
const TRANSFORM = PREDICT_MODEL.transform

/** A flat base, then one session per move; the last session is the signal day. */
function series(base: number, moves: number[], volumes: number[] = []): PredictBar[] {
  const bars: PredictBar[] = []
  let close = base
  bars.push({ sessionDate: '2025-01-02', open: close, high: close * 1.01, low: close * 0.99, close, volume: volumes[0] ?? 10_000 })
  for (let index = 0; index < moves.length; index++) {
    const open = close
    const next = close * (1 + moves[index]! / 100)
    const sessionDate = `2025-02-${String(index + 1).padStart(2, '0')}`
    bars.push({
      sessionDate,
      open,
      // A limit close prints its high at the same price; a failed board does not.
      high: moves[index]! >= 9.5 ? next : next * 1.004,
      low: open * 0.995,
      close: next,
      volume: volumes[index + 1] ?? 10_000,
    })
    close = next
  }
  return bars
}

const flat = (count: number) => Array.from({ length: count }, () => 0.1)

test('limit rate follows the board, not the price', () => {
  assert.equal(boardLimitRate('SH.600519'), 10)
  assert.equal(boardLimitRate('SZ.000001'), 10)
  assert.equal(boardLimitRate('SZ.300750'), 20)
  assert.equal(boardLimitRate('SH.688981'), 20)
  assert.equal(boardLimitRate('BJ.430047'), 30)
  assert.equal(boardLimitRate('SH.600001', '*ST 示例'), 5)
  // A brand-new listing has no dependable limit; guessing 10% would invent one.
  assert.equal(boardLimitRate('SH.600001', 'N 新股'), null)
  assert.equal(boardLimitRate('SH.600001', '退市示例'), null)
})

test('the research universe excludes special treatment names and new listings', () => {
  assert.equal(isPredictUniverse('贵州茅台'), true)
  assert.equal(isPredictUniverse('*ST 天成'), false)
  assert.equal(isPredictUniverse('ST 中珠'), false)
  assert.equal(isPredictUniverse('N 汉邦'), false)
  assert.equal(isPredictUniverse('C 三态'), false)
  assert.equal(isPredictUniverse('退市海润'), false)
  assert.equal(isPredictUniverse(''), false)
})

test('a limit close needs both the move and the high', () => {
  const limit = series(10, [0, 0, 10])
  assert.equal(isLimitClose(limit, limit.length - 1, 10), true)
  const failed = limit.slice()
  failed[failed.length - 1] = { ...failed.at(-1)!, high: failed.at(-1)!.close * 1.02 }
  assert.equal(isLimitClose(failed, failed.length - 1, 10), false, 'touched then fell back is not a limit close')
  const rounded = series(10, [0, 0, 9.8])
  assert.equal(isLimitClose(rounded, rounded.length - 1, 10), true, 'a rounded 10% close is still a limit close')
  const short = series(10, [0, 0, 9.4])
  assert.equal(isLimitClose(short, short.length - 1, 10), false, 'a 9.4% close is not the limit')
})

test('the streak helper only walks backwards', () => {
  const bars = series(10, [0, 0, 10, 10, 10])
  assert.equal(predictLimitStreak(bars, 10), 3)
  // Replacing later bars must not change an earlier verdict.
  const probe = bars.slice(0, 4)
  const before = isLimitClose(probe, 3, 10)
  probe.push(...series(10, [-30]).map(bar => ({ ...bar, close: 1, low: 0.5, high: 1 })))
  assert.equal(isLimitClose(probe, 3, 10), before)
})

test('features are deterministic and describe the last bar', () => {
  const bars = series(10, [...flat(40), 10])
  const first = predictFeatures(bars, 10, CROSS, TRANSFORM)
  const second = predictFeatures(bars, 10, CROSS, TRANSFORM)
  assert.ok(first)
  assert.deepEqual(first, second)
  assert.equal(first!.limitUp, 1)
  assert.equal(first!.streak, 1)
  assert.ok(Math.abs(first!.distLimit) < 0.001)
  assert.equal(first!.closePos, 1, 'a limit close is the session high')
  assert.equal(first!.oneWord, 0)

  const moved = series(10, [...flat(40), 5])
  const softer = predictFeatures(moved, 10, CROSS, TRANSFORM)
  assert.ok(softer)
  assert.equal(softer!.limitUp, 0)
  assert.equal(softer!.streak, 0)
  assert.ok(softer!.distLimit > 4.9 && softer!.distLimit < 5.1)
})

test('features refuse a series they cannot measure instead of filling it in', () => {
  assert.equal(predictFeatures(series(10, flat(5)), 10, CROSS, TRANSFORM), null, 'too short')
  const holed = series(10, [...flat(40), 10])
  holed[holed.length - 3] = { ...holed.at(-3)!, volume: null }
  assert.equal(predictFeatures(holed, 10, CROSS, TRANSFORM), null, 'a missing volume inside the window is a hole')
  assert.equal(predictFeatures(series(10, [...flat(40), 10]), Number.NaN, CROSS, TRANSFORM), null)
})

test('percentile rank is bounded, monotone and clamped', () => {
  const knots = predictKnots([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  assert.equal(knots.length, 21)
  assert.equal(percentileRank(knots, 0), 0)
  assert.equal(percentileRank(knots, 99), 100)
  const low = percentileRank(knots, 2)
  const high = percentileRank(knots, 9)
  assert.ok(low < high)
  assert.ok(low >= 0 && high <= 100)
  assert.equal(percentileRank([], 3), 50)
})

test('the shipped model matches the shared feature list', () => {
  assert.equal(PREDICT_MODEL.features.length, PREDICT_FEATURE_NAMES.length)
  assert.deepEqual(new Set(PREDICT_MODEL.features), new Set(PREDICT_FEATURE_NAMES))
  assert.equal(PREDICT_MODEL.mean.length, PREDICT_FEATURE_NAMES.length)
  assert.equal(PREDICT_MODEL.scale.length, PREDICT_FEATURE_NAMES.length)
  assert.equal(PREDICT_MODEL.limitUp.coef.length, PREDICT_FEATURE_NAMES.length)
  assert.ok(PREDICT_MODEL.scale.every(value => Number.isFinite(value) && value > 0))
  assert.ok(PREDICT_MODEL.mean.every(value => Number.isFinite(value)))
  assert.equal(PREDICT_MODEL.transform.hotShare.length, 21)
  for (const knots of Object.values(PREDICT_MODEL.transform)) {
    for (let index = 1; index < knots.length; index++) assert.ok(knots[index]! >= knots[index - 1]!, 'knots must be sorted')
  }
  assert.ok(PREDICT_MODEL.metrics.auc > 0.5 && PREDICT_MODEL.metrics.auc < 1)
  assert.ok(PREDICT_MODEL.metrics.baseRate > 1 && PREDICT_MODEL.metrics.baseRate < 60)
  assert.deepEqual(PREDICT_MODEL.metrics.top.map(entry => entry.k), [3, 5, 10])
  assert.ok(PREDICT_MODEL.metrics.holdout.rows > 100)
})

test('the probability moves with the fitted sign of each feature', () => {
  const bars = series(10, [...flat(40), 10])
  const base = predictFeatures(bars, 10, CROSS, TRANSFORM)
  assert.ok(base)
  const index = PREDICT_MODEL.features.indexOf('streak')
  const coefficient = PREDICT_MODEL.limitUp.coef[index]!
  const raised = predictProbability({ ...base!, streak: base!.streak + 2 })
  const lowered = predictProbability({ ...base!, streak: base!.streak - 1 })
  assert.equal(raised > lowered, coefficient > 0)
  assert.ok(predictProbability(base!) > 0 && predictProbability(base!) < 1)
})

test('reasons name stock-level features only', () => {
  const bars = series(10, [...flat(40), 10, 10, 10])
  const vector = predictFeatures(bars, 10, CROSS, TRANSFORM)
  assert.ok(vector)
  const { reasons, risks } = predictReasons(vector!)
  assert.ok(reasons.length <= 2)
  assert.ok(risks.length <= 3)
  for (const id of reasons) assert.ok(!['upShare', 'hotShare', 'medianChange', 'streakHot'].includes(id))
  assert.ok(risks.includes('high-board'), 'three boards is a high board')
})

test('scoring one candidate produces a row the browser can trust', () => {
  const bars = series(10, [...flat(40), 10, 10, 10])
  const row = scoreCandidate({
    symbol: 'SH.600000', name: '测试股份', price: 13.31, changePercent: 10,
    bars, final: true,
  }, CROSS)
  assert.ok(row)
  assert.equal(row!.streak, 3)
  assert.equal(row!.limitRate, 10)
  assert.ok(row!.pLimitUp > 0 && row!.pLimitUp < 1)
  assert.equal(Math.round(row!.edge * 10) / 10, Math.round((row!.pLimitUp * 100 - row!.basePLimitUp) * 10) / 10)
  assert.ok(row!.baseN > 0)
})

test('the regime label follows the frozen knots', () => {
  const cold = readRegime({ upShare: 20, hotShare: -5, medianChange: -1 })
  const hot = readRegime({ upShare: 90, hotShare: 90, medianChange: 4 })
  assert.equal(cold.level, 'cold')
  assert.equal(hot.level, 'hot')
  assert.equal(cold.rank, 0)
  assert.equal(hot.rank, 100)
  assert.equal(readRegime({ upShare: 50, hotShare: 2, medianChange: 0.2 }).level, 'normal')
})

test('the prediction request is a closed shape', () => {
  assert.deepEqual(parseMarketRequest({ kind: 'predict-scan' }), { kind: 'predict-scan' })
  assert.deepEqual(parseMarketRequest({ kind: 'predict-scan', board: '801080' }), { kind: 'predict-scan', board: '801080' })
  assert.throws(() => parseMarketRequest({ kind: 'predict-scan', board: '123' }))
  assert.throws(() => parseMarketRequest({ kind: 'predict-scan', extra: 1 }))
  assert.throws(() => parseMarketRequest({ kind: 'predict-scan', board: null }))
})

test('the population gate matches the trained threshold', () => {
  assert.equal(isPredictCandidate(9.5, 10), true)
  assert.equal(isPredictCandidate(8.4, 10), false)
  assert.equal(isPredictCandidate(18.6, 20), true)
  assert.equal(isPredictCandidate(9.9, null), false)
})

test('projection keeps a well-formed result and sorts by probability', () => {
  const bars = series(10, [...flat(40), 10, 10])
  const rows: PredictRow[] = [
    scoreCandidate({ symbol: 'SH.600000', name: '甲股份', price: 12.1, changePercent: 10, bars, final: true }, CROSS)!,
    scoreCandidate({ symbol: 'SH.600001', name: '乙股份', price: 12.1, changePercent: 10, bars: series(10, [...flat(40), 10]), final: true }, CROSS)!,
  ].filter(Boolean)
  const reading = readRegime(CROSS)
  const result: PredictScanResult = {
    source: '腾讯行情 (unofficial) 排行/日K',
    fetchedAt: '2026-10-27T05:10:00.000Z',
    sessionDate: '2026-10-27',
    barFinal: false,
    durationMs: 1234,
    board: null,
    model: {
      version: PREDICT_MODEL.version,
      trainedThrough: PREDICT_MODEL.trainedThrough,
      costPercent: PREDICT_MODEL.costPercent,
      staleDays: 4,
      sample: PREDICT_MODEL.sample,
      metrics: PREDICT_MODEL.metrics,
    },
    regime: {
      upShare: CROSS.upShare, hotShare: CROSS.hotShare, medianChange: CROSS.medianChange,
      rank: reading.rank, level: reading.level,
      base: baseBucketFor(PREDICT_MODEL.baseRates.sentiment, reading.rank),
    },
    universe: { expected: 5577, covered: 5570, candidates: 90, scored: rows.length, failed: 3, partial: true },
    baseRates: PREDICT_MODEL.baseRates,
    rows,
  }
  const projected = projectPredictScan(JSON.parse(JSON.stringify(result)), NOW)
  assert.equal(projected.rows.length, rows.length)
  assert.equal(projected.sessionDate, '2026-10-27')
  assert.equal(projected.barFinal, false)
  assert.equal(projected.regime.level, reading.level)
  assert.ok(projected.rows[0]!.pLimitUp >= projected.rows[1]!.pLimitUp)
  assert.equal(projected.fetchedAt, '2026-10-27T05:10:00.000Z')
})

test('projection rejects a tampered result instead of repairing it', () => {
  const reading = readRegime(CROSS)
  const base = {
    source: 's', sessionDate: '2026-10-27', barFinal: true, durationMs: 1, board: null,
    model: {
      version: 1, trainedThrough: '2026-10-23', costPercent: 0.2, staleDays: 4,
      sample: PREDICT_MODEL.sample, metrics: PREDICT_MODEL.metrics,
    },
    regime: { upShare: 50, hotShare: 2, medianChange: 0, rank: reading.rank, level: reading.level, base: null },
    universe: { expected: 1, covered: 1, candidates: 1, scored: 0, failed: 0, partial: false },
    baseRates: PREDICT_MODEL.baseRates,
    rows: [],
  }
  assert.doesNotThrow(() => projectPredictScan(base, NOW))
  assert.throws(() => projectPredictScan({ ...base, sessionDate: '27/10/2026' }, NOW), /predict scan|unavailable/i)
  assert.throws(() => projectPredictScan({ ...base, barFinal: 'yes' }, NOW), /predict scan|unavailable/i)
  assert.throws(() => projectPredictScan({ ...base, regime: { ...base.regime, level: 'hot' } }, NOW), /predict scan|unavailable/i)
  assert.throws(() => projectPredictScan({ ...base, model: { ...base.model, costPercent: 99 } }, NOW), /predict scan|unavailable/i)
  // A malformed row is dropped, never repaired into a plausible-looking one.
  const dropped = projectPredictScan({ ...base, rows: [{ symbol: 'bad' }, { symbol: 'SH.600000', name: '甲', price: 0 }] }, NOW)
  assert.equal(dropped.rows.length, 0)
})

test('projection drops unknown tags and bounds the row count', () => {
  const bars = series(10, [...flat(40), 10])
  const row = scoreCandidate({ symbol: 'SH.600000', name: '甲股份', price: 12.1, changePercent: 10, bars, final: true }, CROSS)!
  const reading = readRegime(CROSS)
  const projected = projectPredictScan({
    source: 's', sessionDate: '2026-10-27', barFinal: true, durationMs: 1, board: null,
    model: { version: 1, trainedThrough: '2026-10-23', costPercent: 0.2, staleDays: 4, sample: PREDICT_MODEL.sample, metrics: PREDICT_MODEL.metrics },
    regime: { upShare: 50, hotShare: 2, medianChange: 0, rank: reading.rank, level: reading.level, base: null },
    universe: { expected: 1, covered: 1, candidates: 1, scored: 1, failed: 0, partial: false },
    baseRates: PREDICT_MODEL.baseRates,
    rows: Array.from({ length: PREDICT_MAX_ROWS + 20 }, (_, index) => ({
      ...row, symbol: `SH.${String(600000 + index)}`,
      reasons: ['streak', 'made-up', 'closePos'],
      risks: ['high-board', 'not-a-risk'],
    })),
  }, NOW)
  assert.equal(projected.rows.length, PREDICT_MAX_ROWS)
  for (const entry of projected.rows) {
    // `streak` is a real feature but is not a valid row tag any more: the board
    // count is already the chip, so the projection must not echo it back.
    assert.deepEqual(entry.reasons, ['closePos'])
    assert.deepEqual(entry.risks, ['high-board'])
  }
})

test('sorting is deterministic for equal probabilities', () => {
  const bars = series(10, [...flat(40), 10])
  const row = scoreCandidate({ symbol: 'SH.600000', name: '甲', price: 12, changePercent: 10, bars, final: true }, CROSS)!
  const sorted = sortPredictRows([
    { ...row, symbol: 'SH.600002', pLimitUp: 0.4 },
    { ...row, symbol: 'SH.600001', pLimitUp: 0.4, streak: 2 },
    { ...row, symbol: 'SH.600003', pLimitUp: 0.5 },
  ])
  assert.deepEqual(sorted.map(entry => entry.symbol), ['SH.600003', 'SH.600001', 'SH.600002'])
})

test('the panel constants stay within the response bounds', () => {
  assert.ok(PREDICT_BARS >= PREDICT_MIN_BARS)
  assert.ok(PREDICT_TTL_MS >= 60_000)
  assert.ok(HOT_CHANGE > 0 && HOT_CHANGE < 15)
})

test('every predict locale key exists in both dictionaries', () => {
  const keys = Object.keys(zh).filter(key => key.startsWith('predict.') || key === 'page.view.predict')
  assert.ok(keys.length > 40)
  for (const key of keys) assert.equal(typeof (en as any)[key], 'string', `missing English for ${key}`)
  for (const key of Object.keys(en).filter(key => key.startsWith('predict.'))) {
    assert.equal(typeof (zh as any)[key], 'string', `missing Chinese for ${key}`)
  }
})

test('the RPC handler projects a provider result and hides upstream failures', async () => {
  const bars = series(10, [...flat(40), 10, 10])
  const rows = [
    scoreCandidate({ symbol: 'SH.603528', name: '多伦科技', price: 13.31, changePercent: 10, bars, final: true }, CROSS)!,
  ]
  const reading = readRegime(CROSS)
  const payload = {
    source: '腾讯行情 (unofficial) 排行/日K',
    fetchedAt: '2026-10-27T05:10:00.000Z',
    sessionDate: '2026-10-27',
    barFinal: true,
    durationMs: 42,
    board: null,
    model: {
      version: PREDICT_MODEL.version, trainedThrough: PREDICT_MODEL.trainedThrough,
      costPercent: PREDICT_MODEL.costPercent, staleDays: 4,
      sample: PREDICT_MODEL.sample, metrics: PREDICT_MODEL.metrics,
    },
    regime: { ...CROSS, rank: reading.rank, level: reading.level, base: null },
    universe: { expected: 5577, covered: 5570, candidates: 88, scored: rows.length, failed: 0, partial: false },
    baseRates: PREDICT_MODEL.baseRates,
    rows,
  }
  let seen: any = null
  const handler = createMarketHandler({
    provider: { predictScan: async (input: any) => { seen = input; return payload } } as any,
    now: () => NOW,
  })
  const owner = { principal: { kind: 'owner' } }
  const ok: any = await handler(MARKET_ENDPOINT, { kind: 'predict-scan', board: '801080' }, undefined, owner)
  assert.equal(ok.ok, true)
  assert.equal(ok.value.status, 'ready')
  assert.equal(ok.value.predictScan.rows.length, 1)
  assert.equal(ok.value.predictScan.rows[0].symbol, 'SH.603528')
  assert.deepEqual(seen, { board: '801080' })

  const failing = createMarketHandler({ provider: { predictScan: async () => { throw new Error('upstream detail') } } as any, now: () => NOW })
  const failed: any = await failing(MARKET_ENDPOINT, { kind: 'predict-scan' }, undefined, owner)
  assert.equal(failed.ok, false)
  assert.equal(failed.error.code, 'finance/predict-scan-unavailable')

  const tampered = createMarketHandler({ provider: { predictScan: async () => ({ ...payload, sessionDate: 'x' }) } as any, now: () => NOW })
  const rejected: any = await tampered(MARKET_ENDPOINT, { kind: 'predict-scan' }, undefined, owner)
  assert.equal(rejected.ok, false)
  assert.equal(rejected.error.code, 'finance/predict-scan-unavailable')

  const noClients = createMarketHandler({ provider: {} as any, now: () => NOW })
  const unavailable: any = await noClients(MARKET_ENDPOINT, { kind: 'predict-scan' }, undefined, owner)
  assert.equal(unavailable.error.code, 'finance/predict-scan-unavailable')
  const peer: any = await handler(MARKET_ENDPOINT, { kind: 'predict-scan' }, undefined, { principal: { kind: 'peer' } })
  assert.equal(peer.error.code, 'finance/forbidden')
})
