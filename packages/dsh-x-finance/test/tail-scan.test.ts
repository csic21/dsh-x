import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TAIL_SCAN_FILTERS, computeDailyVolumeContext, computeTailMetrics, projectTailScan,
  scoreTailCandidate, tailQuantFromBars, type TailDailyContext, type TailMinutePoint,
} from '../src/tail-scan.ts'

const SESSION = '2026-10-23'

function minuteLine(options: { tailVolume?: number; blockVolume?: number; tailPrice?: number } = {}): TailMinutePoint[] {
  const { tailVolume = 300, blockVolume = 100, tailPrice = 9.5 } = options
  const points: TailMinutePoint[] = []
  const push = (time: string) => {
    const price = time > '14:30' ? tailPrice : 10
    const volume = time > '14:30' ? tailVolume : blockVolume
    points.push({ time, price, volume, amount: price * volume * 100 })
  }
  for (let minutes = 9 * 60 + 30; minutes <= 11 * 60 + 30; minutes++) {
    push(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`)
  }
  for (let minutes = 13 * 60; minutes <= 15 * 60; minutes++) {
    push(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`)
  }
  return points
}

function dailyBars() {
  const bars: { sessionDate: string; open: number; close: number; high: number; low: number; volume: number; isFinal: boolean }[] = []
  for (let index = 0; index < 30; index++) {
    const date = new Date(Date.UTC(2026, 8, 24 + index)).toISOString().slice(0, 10)
    const close = index >= 29 ? 9.5 : index === 28 ? 9.8 : 10
    const volume = index === 29 ? 250 : index === 28 ? 150 : 100
    bars.push({
      sessionDate: date,
      open: close,
      close,
      high: close + 0.1,
      low: close - 0.1,
      volume,
      isFinal: true,
    })
  }
  return bars
}

test('the tail metrics use the 14:30 print as reference and the median prior 30-minute block', () => {
  const metrics = computeTailMetrics(minuteLine(), { sessionDate: SESSION, previousClose: 10 })
  assert.equal(metrics.sessionDate, SESSION)
  assert.equal(metrics.complete, true)
  assert.equal(metrics.points, 242)
  assert.equal(metrics.blocks, 6)
  assert.equal(metrics.tailVolume, 30 * 300)
  assert.equal(metrics.baselineVolume, 3000)
  assert.equal(metrics.tailVolumeRatio, 3)
  assert.ok(Math.abs(metrics.tailReturn! - -0.05) < 1e-12)
  assert.ok(Math.abs(metrics.dayReturn! - -0.05) < 1e-12)
  assert.ok(Math.abs(metrics.tailVolumeShare! - 9000 / (212 * 100 + 9000)) < 1e-12)
})

test('an unfinished tail is never reported as a completed close', () => {
  const points = minuteLine().filter(point => point.time <= '11:30')
  const metrics = computeTailMetrics(points, { sessionDate: SESSION, previousClose: 10 })
  assert.equal(metrics.complete, false)
  assert.equal(metrics.tailVolume, null)
  assert.equal(metrics.tailVolumeRatio, null)
  assert.equal(metrics.tailReturn, null)
  assert.equal(metrics.tailVolumeShare, null)
})

test('a missing minute volume makes the ratio unknown instead of under-counting', () => {
  const points = minuteLine()
  const index = points.findIndex(point => point.time === '10:15')
  points[index] = { ...points[index]!, volume: null }
  const metrics = computeTailMetrics(points, { sessionDate: SESSION, previousClose: 10 })
  assert.equal(metrics.baselineVolume, 3000)
  // The 10:15 volume is inside a baseline block; that block is dropped.
  assert.equal(metrics.blocks, 5)
  assert.equal(metrics.tailVolumeRatio, 3)
})

test('daily context counts consecutive down days with rising volume and prior-5-day expansion', () => {
  const daily = computeDailyVolumeContext(dailyBars(), SESSION)
  assert.equal(daily.samples, 30)
  assert.equal(daily.downStreak, 2)
  assert.equal(daily.volumeExpansionDownStreak, 2)
  assert.equal(daily.volumeDeclineStreak, 2)
  assert.equal(daily.distributionDays20, 2)
  assert.equal(daily.downDays5, 2)
  assert.equal(daily.downDays10, 2)
  assert.ok(Math.abs(daily.volumeRatio5! - 250 / 110) < 1e-12)
  assert.ok(Math.abs(daily.todayReturn! - -0.030612244897959) < 1e-12)
  assert.equal(daily.isFinal, true)
})

test('daily context stops at an up day and does not invent missing volume', () => {
  const bars = dailyBars()
  bars[28] = { ...bars[28]!, close: 10.05 }
  const daily = computeDailyVolumeContext(bars, SESSION)
  assert.equal(daily.downStreak, 1)
  assert.equal(daily.volumeExpansionDownStreak, 1)
  assert.equal(daily.volumeDeclineStreak, 1)
  const missing = bars.map((bar, index) => index === 27 ? { ...bar, volume: null } : bar)
  const context = computeDailyVolumeContext(missing, SESSION)
  assert.equal(context.volumeRatio5, null)
  assert.equal(context.volumeDeclineStreak, 0)
  assert.equal(context.samples, 30)
})

test('the score is explainable, bounded and recomputed from metrics', () => {
  const daily = computeDailyVolumeContext(dailyBars(), SESSION)
  const scored = scoreTailCandidate({ tailReturn: -0.05, tailVolumeRatio: 3, changePercent: -6, daily })
  assert.equal(scored.score, 87)
  assert.deepEqual(scored.factors.map(factor => factor.max), [30, 25, 15, 15, 15])
  assert.equal(scored.flags.tailDump, true)
  assert.equal(scored.flags.volumeExpansion, true)
  assert.equal(scored.flags.consecutive, true)
  const empty = scoreTailCandidate({ tailReturn: null, tailVolumeRatio: null, changePercent: 0, daily: null })
  assert.equal(empty.score, 0)
  assert.equal(empty.flags.consecutive, false)
})

function fixture() {
  const daily: TailDailyContext = computeDailyVolumeContext(dailyBars(), SESSION)
  return {
    source: 'Tencent + minute (unofficial)',
    fetchedAt: '2000-01-01T00:00:00.000Z',
    sessionDate: SESSION,
    sessionIsToday: false,
    complete: true,
    universe: {
      expected: 5577, covered: 5577, screened: 499, intradayChecked: 32,
      tailConfirmed: 1, historyChecked: 1, failedIntraday: 0, failedHistory: 0, partial: false,
    },
    filters: { ...TAIL_SCAN_FILTERS, minTailRatio: 99 },
    candidates: [{
      symbol: 'SH.600293',
      name: '三峡新材',
      price: 4.91,
      changePercent: -6.12,
      amount: 260_000_000,
      turnoverPercent: 8.2,
      volumeRatio: 2.5,
      fiveMinuteChange: null,
      sessionDate: SESSION,
      tail: {
        sessionDate: SESSION, complete: true, tailStart: '14:30', tailEnd: '15:00',
        tailReturn: -0.0447, tailVolume: 9000, baselineVolume: 3270, tailVolumeRatio: 2.75,
        tailVolumeShare: 0.12, dayReturn: -0.0612, points: 242, blocks: 6,
      },
      daily,
      quant: tailQuantFromBars(dailyBars()),
      historyAvailable: true,
      adjustment: 'forward',
      score: 999,
      factors: [],
      flags: { tailDump: false, volumeExpansion: false, consecutive: false },
    }],
  }
}

test('the Host projection re-checks metrics, recomputes the score and ignores adapter thresholds', () => {
  const projected = projectTailScan(fixture(), Date.parse('2026-10-25T00:30:00+08:00'))
  assert.equal(projected.source, 'Tencent + minute (unofficial)')
  assert.equal(projected.sessionDate, SESSION)
  assert.equal(projected.sessionIsToday, false)
  assert.equal(projected.complete, true)
  assert.equal(projected.filters.minTailRatio, 1.3)
  assert.equal(projected.candidates.length, 1)
  const candidate = projected.candidates[0]!
  assert.equal(candidate.symbol, 'SH.600293')
  assert.equal(candidate.score, 84)
  assert.equal(candidate.flags.tailDump, true)
  assert.equal(candidate.tail.tailVolumeRatio, 2.75)
  assert.equal(candidate.daily?.volumeExpansionDownStreak, 2)
})

test('the projection rejects malformed candidates rather than passing them through', () => {
  const invalid = fixture()
  invalid.candidates[0]!.tail = { ...invalid.candidates[0]!.tail, tailReturn: 5 } as any
  assert.throws(() => projectTailScan(invalid, Date.now()), /tail-scan invalid/)
  const missing = fixture()
  ;(missing.candidates[0] as any).daily = { ...missing.candidates[0]!.daily, sessionDate: '2026-10-22' }
  assert.throws(() => projectTailScan(missing, Date.now()), /daily session mismatch/)
  assert.throws(() => projectTailScan({ ...fixture(), sessionDate: '2026-02-30' }, Date.now()), /tail-scan invalid/)
})
