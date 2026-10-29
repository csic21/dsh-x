import test from 'node:test'
import assert from 'node:assert/strict'
import { replayWatchSignals } from '../src/watch-signal-backtest.ts'

function bars(closes: number[]) {
  return closes.map((close, i) => ({
    sessionDate: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10),
    open: close, high: close, low: close, close, isFinal: true,
  }))
}

test('entry and exit use the next daily open with explicitly declared costs', () => {
  const closes = [...Array.from({ length: 121 }, (_, i) => 100 + i), 180, 170, 169, 168]
  const series = bars(closes)
  const replay = replayWatchSignals(series)
  assert.equal(replay.status, 'ready')
  assert.equal(replay.tradeCount, 1)
  assert.equal(replay.open, false)
  assert.equal(replay.trades[0]?.entryDate, series[120]!.sessionDate)
  assert.equal(replay.trades[0]?.exitDate, series[123]!.sessionDate)
  const expected = 169 * (1 - 0.0005) * (1 - 0.0005 - 0.0005) / (220 * (1 + 0.0005) * (1 + 0.0005)) - 1
  assert.ok(Math.abs(replay.totalReturn! - expected) < 1e-10)
  assert.ok(Math.abs(replay.trades[0]!.netReturn - expected) < 1e-10)
  const expectedBenchmark = 168 / (220 * (1 + 0.0005) * (1 + 0.0005)) - 1
  assert.ok(Math.abs(replay.buyHoldReturn! - expectedBenchmark) < 1e-10)
  assert.ok(replay.maxDrawdown! < 0)
})

test('open trades are marked to market, never presented as closed wins', () => {
  const series = bars(Array.from({ length: 140 }, (_, i) => 100 + i))
  const replay = replayWatchSignals(series)
  assert.equal(replay.status, 'ready')
  assert.equal(replay.open, true)
  assert.equal(replay.tradeCount, 0)
  assert.ok(replay.totalReturn! > 0)
})

test('provisional final bars are excluded from historical replay', () => {
  const series = bars(Array.from({ length: 140 }, (_, i) => 100 + i))
  series[139]!.isFinal = false
  series[139]!.close = 1
  const replay = replayWatchSignals(series)
  assert.equal(replay.status, 'ready')
  assert.equal(replay.to, series[138]!.sessionDate)
  assert.equal(replay.bars, 139)
  assert.ok(replay.totalReturn! > 0)
})

test('insufficient and malformed histories cannot produce replay figures', () => {
  assert.equal(replayWatchSignals(bars(Array.from({ length: 120 }, () => 100))).status, 'insufficient')
  const series = bars(Array.from({ length: 130 }, () => 100))
  series[0]!.open = 0
  assert.equal(replayWatchSignals(series).status, 'invalid')
  series[0]!.open = 100
  series[50]!.isFinal = false
  assert.equal(replayWatchSignals(series).status, 'invalid')
})
