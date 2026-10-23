import test from 'node:test'
import assert from 'node:assert/strict'
import {
  averageTrueRange, bollingerPercentB, computeQuantStats, correlationWith,
  monthlyReturns, normalizeQuantBars, relativeStrengthIndex, ruleSignals, runBacktest,
} from '../src/analytics.ts'

const dates = (count: number, start = Date.UTC(2025, 0, 1)) =>
  Array.from({ length: count }, (_, index) => new Date(start + index * 86_400_000).toISOString().slice(0, 10))

const bar = (sessionDate: string, close: number, open = close, high = close + 1, low = close - 1) =>
  ({ sessionDate, open, high, low, close, isFinal: true })

const series = (closes: number[]) => closes.map((close, index) => bar(dates(closes.length)[index]!, close))

test('normalisation sorts, de-duplicates, bounds and drops unusable bars', () => {
  const input = [
    bar('2025-01-03', 12),
    bar('2025-01-02', 10),
    bar('2025-01-02', 11),
    { sessionDate: '2025-01-04', open: 1, high: 1, low: 1, close: 0 },
    { sessionDate: 'bad', open: 1, high: 2, low: 1, close: 1 },
    { sessionDate: '2025-01-05', open: 1, high: 1, low: 2, close: 1 },
  ]
  const result = normalizeQuantBars(input)
  assert.deepEqual(result.map(item => item.sessionDate), ['2025-01-02', '2025-01-03'])
  assert.equal(result[0]!.close, 11)
  assert.deepEqual(normalizeQuantBars(null), [])
  assert.deepEqual(normalizeQuantBars('nope'), [])
})

test('descriptive statistics use the actual closes and leave unsupported metrics null', () => {
  const stats = computeQuantStats(series([100, 110, 105, 120, 90, 100]))
  assert.equal(stats.samples, 6)
  assert.equal(stats.totalReturn, 0)
  assert.ok(Math.abs(stats.maxDrawdown! + 0.25) < 1e-12)
  assert.equal(stats.drawdownPeakDate, '2025-01-04')
  assert.equal(stats.drawdownTroughDate, '2025-01-05')
  assert.ok(Math.abs(stats.dailyWinRate! - 0.6) < 1e-12)
  assert.ok(Math.abs(stats.bestDay! - (120 / 105 - 1)) < 1e-12)
  assert.ok(Math.abs(stats.worstDay! + 0.25) < 1e-12)
  assert.equal(stats.cagr, null)
  assert.equal(stats.atr14, null)
  assert.equal(stats.rsi14, null)
  assert.equal(stats.ma20, null)
  assert.equal(stats.momentum20, null)
  assert.equal(stats.monthly.length, 1)
  assert.ok(Math.abs(stats.monthly[0]!.returnRatio) < 1e-12)
  const empty = computeQuantStats([])
  assert.equal(empty.samples, 0)
  assert.equal(empty.totalReturn, null)
  assert.deepEqual(empty.monthly, [])
})

test('a long flat window is neutral rather than a fabricated trend', () => {
  const flat = Array.from({ length: 40 }, (_, index) => bar(dates(40)[index]!, 100, 100, 100, 100))
  const stats = computeQuantStats(flat)
  assert.equal(stats.totalReturn, 0)
  assert.equal(stats.annualVolatility, 0)
  assert.equal(stats.sharpe, null)
  assert.equal(stats.atr14, 0)
  assert.equal(stats.rsi14, 50)
  assert.equal(stats.bollingerPercentB, null)
  assert.equal(stats.priceVsMa20, 0)
  assert.equal(stats.momentum20, 0)
})

test('ATR, RSI, Bollinger and momentum are bounded and deterministic', () => {
  const closes = Array.from({ length: 80 }, (_, index) => 100 + Math.sin(index / 3) * 8)
  const bars = closes.map((close, index) => bar(dates(80)[index]!, close, close, close + 1.5, close - 1.5))
  const stats = computeQuantStats(bars)
  assert.ok(stats.atr14 !== null && stats.atr14 > 0)
  assert.ok(stats.rsi14 !== null && stats.rsi14 >= 0 && stats.rsi14 <= 100)
  assert.ok(stats.bollingerPercentB !== null && Number.isFinite(stats.bollingerPercentB))
  assert.ok(stats.ma20 !== null && stats.ma60 !== null)
  assert.ok(stats.momentum20 !== null && stats.momentum60 !== null)
  assert.ok(stats.high52w !== null && stats.low52w !== null && stats.high52w >= stats.low52w)
  assert.ok(stats.drawdownFromHigh !== null && stats.drawdownFromHigh <= 0)
  assert.ok(stats.cagr !== null && stats.annualVolatility !== null)
  assert.deepEqual(computeQuantStats(bars), stats)
})

test('monthly returns group by calendar month and mark a moving last month', () => {
  const bars = [
    bar('2025-01-02', 100), bar('2025-01-31', 110),
    bar('2025-02-03', 110), bar('2025-02-28', 99),
    bar('2025-03-03', 99), bar('2025-03-04', 100, 100, 101, 99),
  ]
  bars.at(-1)!.isFinal = false
  const months = monthlyReturns(normalizeQuantBars(bars))
  assert.deepEqual(months.map(item => `${item.year}-${item.month}`), ['2025-1', '2025-2', '2025-3'])
  assert.ok(Math.abs(months[0]!.returnRatio - 0.1) < 1e-12)
  assert.ok(Math.abs(months[1]!.returnRatio + 0.1) < 1e-12)
  assert.equal(months[2]!.partial, true)
  assert.equal(months[1]!.partial, false)
})

test('correlation is scale-free, aligned by session date and requires a real sample', () => {
  const closes = Array.from({ length: 60 }, (_, index) => 100 + Math.sin(index / 4) * 10 + index * 0.3)
  const left = series(closes)
  const same = series(closes.map(value => value * 3))
  assert.ok(Math.abs(correlationWith(left, same)!.value - 1) < 1e-12)
  assert.equal(correlationWith(left, same)!.samples, 59)
  const inverted: number[] = [100]
  for (let index = 1; index < closes.length; index++) {
    inverted.push(inverted[index - 1]! * (1 - (closes[index]! / closes[index - 1]! - 1)))
  }
  assert.ok(correlationWith(left, series(inverted))!.value < -0.99)
  assert.equal(correlationWith(left, series(closes.slice(0, 10))), null)
  assert.equal(correlationWith(left, []), null)
})

const crossingCloses = [
  ...Array.from({ length: 25 }, (_, index) => 100 - index),
  ...Array.from({ length: 15 }, (_, index) => 76 + (index + 1) * 3),
  ...Array.from({ length: 15 }, (_, index) => 121 - (index + 1) * 3),
  ...Array.from({ length: 15 }, (_, index) => 76 + (index + 1) * 3),
  ...Array.from({ length: 15 }, (_, index) => 121 - (index + 1) * 3),
]
const crossingBars = crossingCloses.map((close, index) => bar(dates(crossingCloses.length)[index]!, close, close, close + 1, close - 1))

test('the backtest enters at the next open after a close signal, never on the signal bar', () => {
  const bars = normalizeQuantBars(crossingBars)
  const signals = ruleSignals(bars, 'ma5-20')
  const firstBuy = signals.indexOf('buy')
  assert.ok(firstBuy > 0 && firstBuy < bars.length - 1)
  const result = runBacktest(crossingBars, { rule: 'ma5-20', commissionBps: 0, slippageBps: 0 })
  assert.ok(result.trades.length >= 2)
  const first = result.trades[0]!
  assert.equal(first.entryDate, bars[firstBuy + 1]!.sessionDate)
  assert.equal(first.entryPrice, bars[firstBuy + 1]!.open)
  assert.equal(first.open, false)
  assert.equal(result.points.length, bars.length)
  assert.equal(result.points[0]!.strategy, 1)
  assert.ok(result.points.every(point => Number.isFinite(point.strategy) && Number.isFinite(point.buyHold)))
  assert.ok(result.exposure !== null && result.exposure > 0 && result.exposure <= 1)
  assert.ok(result.winRate !== null && result.winRate >= 0 && result.winRate <= 1)
  assert.ok(result.maxDrawdown !== null && result.maxDrawdown <= 0)
})

test('costs reduce the replay and are applied on both sides', () => {
  const free = runBacktest(crossingBars, { rule: 'ma5-20', commissionBps: 0, slippageBps: 0 })
  const costly = runBacktest(crossingBars, { rule: 'ma5-20', commissionBps: 10, slippageBps: 10 })
  assert.ok(costly.totalReturn! < free.totalReturn!)
  assert.ok(costly.trades[0]!.returnRatio < free.trades[0]!.returnRatio)
  assert.equal(costly.commissionBps, 10)
  assert.equal(costly.slippageBps, 10)
})

test('every declared rule runs and invalid inputs fail closed without invented numbers', () => {
  for (const rule of ['ma5-20', 'ma10-60', 'macd', 'kdj'] as const) {
    const result = runBacktest(crossingBars, { rule })
    assert.equal(result.rule, rule)
    assert.equal(result.points.length, crossingBars.length)
    assert.ok(Number.isFinite(result.totalReturn!))
  }
  const invalidRule = runBacktest(crossingBars, { rule: 'unknown' as any })
  assert.equal(invalidRule.rule, 'ma5-20')
  const costs = runBacktest(crossingBars, { commissionBps: -1, slippageBps: 500 })
  assert.equal(costs.commissionBps, 5)
  assert.equal(costs.slippageBps, 5)
  const empty = runBacktest([])
  assert.equal(empty.totalReturn, null)
  assert.equal(empty.buyHoldReturn, null)
  assert.deepEqual(empty.trades, [])
  assert.deepEqual(empty.points, [])
  const single = runBacktest(series([100]))
  assert.equal(single.totalReturn, 0)
  assert.equal(single.tradeCount, 0)
})

test('ATR and RSI expose their warm-up boundary', () => {
  const short = series(Array.from({ length: 14 }, () => 100))
  assert.equal(averageTrueRange(short), null)
  assert.equal(relativeStrengthIndex(short), null)
  assert.equal(bollingerPercentB(short), null)
  const enough = Array.from({ length: 15 }, (_, index) => bar(dates(15)[index]!, 100, 100, 100, 100))
  assert.equal(averageTrueRange(enough), 0)
  assert.equal(relativeStrengthIndex(enough), 50)
})
