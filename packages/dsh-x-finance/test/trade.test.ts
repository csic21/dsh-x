import test from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluateRanking, isBuyableOpen, isOneWordBar, netReturnPercent, roundTripCostPercent,
  OPEN_LIMIT_TOLERANCE, TRADE_COST_BPS,
} from '../src/trade.ts'
import type { EvaluatedRow, TradeBar } from '../src/trade.ts'

const bar = (open: number, high: number, low: number, close: number): TradeBar => ({
  sessionDate: '2026-01-05', open, high, low, close, volume: 1_000_000,
})

test('an open on the limit is not a tradable entry', () => {
  const previous = 10
  assert.equal(isBuyableOpen(bar(11, 11, 11, 11), previous, 10), false, 'sealed at +10%')
  assert.equal(isBuyableOpen(bar(10.98, 11, 10.8, 10.9), previous, 10), false, 'at 9.8%, inside tolerance')
  assert.equal(isBuyableOpen(bar(10.95, 11, 10.8, 10.9), previous, 10), true, '9.5% is buyable')
  assert.equal(isBuyableOpen(bar(10, 10, 10, 10), previous, 10), false, 'one price, no fill exists')
  assert.equal(isBuyableOpen(bar(0, 10, 10, 10), previous, 10), false, 'no open')
})

test('the one-word test only accepts a single printed price', () => {
  assert.equal(isOneWordBar(bar(10, 10, 10, 10)), true)
  assert.equal(isOneWordBar(bar(10, 10.4, 10, 10.2)), false)
  assert.equal(isOneWordBar(bar(10, 10.01, 9.99, 10)), false)
})

test('the tolerance is narrow enough to keep a 9.6% open buyable on a 10% board', () => {
  assert.ok(OPEN_LIMIT_TOLERANCE > 0 && OPEN_LIMIT_TOLERANCE < 0.5)
  assert.equal(isBuyableOpen(bar(10.96, 11, 10.5, 10.7), 10, 10), true)
})

test('round-trip cost grows with the crowd the entry joined', () => {
  const calm = roundTripCostPercent(0, 10)
  const crowded = roundTripCostPercent(9, 10)
  assert.ok(calm > 0.1 && calm < 0.2, `calm ${calm}`)
  assert.ok(crowded > calm)
  assert.ok(crowded < 0.6, `crowded ${crowded}`)
  const fixed = (2 * TRADE_COST_BPS.commission + TRADE_COST_BPS.stamp + 2 * TRADE_COST_BPS.transfer) / 100
  assert.ok(Math.abs(calm - (fixed + TRADE_COST_BPS.baseSlippage / 100)) < 1e-12)
  assert.equal(roundTripCostPercent(40, 10), roundTripCostPercent(12, 10), 'clamped above the limit')
})

test('net return is measured from the fill and pays the cost once', () => {
  assert.ok(Math.abs(netReturnPercent(10, 11, 0.2)! - 9.8) < 1e-9)
  assert.equal(netReturnPercent(10, 10, 0.2), -0.2)
  assert.equal(netReturnPercent(0, 10, 0.2), null)
  assert.equal(netReturnPercent(10, 11, Number.NaN), null)
})

test('a perfectly ordered score earns the information coefficient and the money', () => {
  const rows: EvaluatedRow[] = []
  for (let day = 0; day < 20; day++) {
    for (let index = 0; index < 10; index++) {
      rows.push({
        symbol: `SH.6000${index}${day}`,
        sessionDate: `2026-01-${String(day + 1).padStart(2, '0')}`,
        score: index,
        netReturn: index - 5,
      })
    }
  }
  const metrics = evaluateRanking(rows, 3)
  assert.equal(metrics.days, 20)
  assert.equal(metrics.trades, 60)
  assert.ok(metrics.ic > 0.999)
  assert.ok(metrics.monotonicity > 0.999)
  assert.ok(metrics.total > 0, 'buying the best names must make money when the order is right')
  assert.equal(metrics.winRate, 100)
  assert.ok(metrics.icIr > 0)
  assert.equal(metrics.maxDrawdown, 0)
})

test('an inverted score loses money and reports a negative ic', () => {
  const rows: EvaluatedRow[] = []
  for (let day = 0; day < 20; day++) {
    for (let index = 0; index < 10; index++) {
      rows.push({
        symbol: `SH.6000${index}${day}`,
        sessionDate: `2026-02-${String(day + 1).padStart(2, '0')}`,
        score: -index,
        netReturn: index - 5,
      })
    }
  }
  const metrics = evaluateRanking(rows, 3)
  assert.ok(metrics.ic < -0.999)
  assert.ok(metrics.monotonicity < -0.999)
  assert.ok(metrics.total < 0)
  assert.equal(metrics.winRate, 0)
})

test('a constant score carries no information and does not invent a drawdown', () => {
  const rows: EvaluatedRow[] = Array.from({ length: 10 }, (_, index) => ({
    symbol: `SZ.00000${index}`,
    sessionDate: '2026-03-02',
    score: 1,
    netReturn: 0.5,
  }))
  const metrics = evaluateRanking(rows, 2)
  assert.equal(metrics.days, 1)
  assert.ok(Math.abs(metrics.total - 0.5) < 1e-9)
  assert.ok(Math.abs(metrics.ic) < 1e-12 || Number.isNaN(metrics.ic) === false)
})
