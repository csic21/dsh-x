import test from 'node:test'
import assert from 'node:assert/strict'
import { kdj, DEFAULT_KDJ } from '../src/indicators.ts'
import { crossReplay, replaySummary } from '../src/quant.ts'

test('KDJ(3,3,3) matches the hand-smoothed RSV, K, D and J', () => {
  const bars = [
    { high: 2, low: 1, close: 1.5 },
    { high: 3, low: 1, close: 2 },
    { high: 4, low: 2, close: 3 },
    { high: 5, low: 3, close: 4 },
  ]
  const result = kdj(bars, { n: 3, k: 3, d: 3 })
  assert.deepEqual(result.k.slice(0, 2), [null, null])
  const near = (actual: any, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`)
  near(result.rsv[2], 200 / 3)
  near(result.k[2], 500 / 9)
  near(result.d[2], 1400 / 27)
  near(result.j[2], 1700 / 27)
  near(result.rsv[3], 75)
  near(result.k[3], 1675 / 27)
  near(result.d[3], 4475 / 81)
  assert.deepEqual(kdj(bars).params, DEFAULT_KDJ)
})

test('a flat range uses RSV 50 and a gap resets KDJ', () => {
  const flat = Array.from({ length: 9 }, () => ({ high: 10, low: 10, close: 10 }))
  const result = kdj(flat, { n: 9, k: 3, d: 3 })
  assert.equal(result.k[7], null)
  assert.equal(result.rsv[8], 50)
  assert.equal(result.k[8], 50)
  const gapped = [...flat, { high: null, low: 10, close: 10 }, ...flat]
  const reset = kdj(gapped, { n: 9, k: 3, d: 3 })
  assert.equal(reset.k[9], null)
  assert.equal(reset.k[17], null)
  assert.equal(reset.k[18], 50)
})

test('close-to-close replay records a finished cross and leaves an open one out of the average', () => {
  const points = [
    { sessionDate: '2026-01-01', close: 10, fast: 1, slow: 2 },
    { sessionDate: '2026-01-02', close: 12, fast: 3, slow: 2 },
    { sessionDate: '2026-01-03', close: 9, fast: 1, slow: 2 },
    { sessionDate: '2026-01-04', close: 11, fast: 4, slow: 2 },
  ]
  const replay = crossReplay(points)
  assert.equal(replay.closed.length, 1)
  assert.equal(replay.closed[0].entryDate, '2026-01-02')
  assert.equal(replay.closed[0].exitDate, '2026-01-03')
  assert.equal(replay.closed[0].returnRatio, (9 - 12) / 12)
  assert.deepEqual(replay.open, { entryDate: '2026-01-04', entryClose: 11 })
  assert.equal(replay.latest, 'golden')
  const summary = replaySummary(replay)
  assert.equal(summary.samples, 1)
  assert.equal(summary.wins, 0)
  assert.equal(summary.open, true)
  assert.equal(summary.average, (9 - 12) / 12)
})
