import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeInterval, resampleBars, resampleDataset, weekStart } from '../src/resample.ts'

const bar = (sessionDate: string, close: number, extra: any = {}) => ({
  sessionDate, open: close - 1, high: close + 1, low: close - 2, close,
  volume: 10, amount: 100, isFinal: true, ...extra,
})

test('weeks start on Monday and merge OHLC without inventing a missing volume', () => {
  assert.equal(weekStart('2026-03-02'), '2026-03-02')
  assert.equal(weekStart('2026-03-08'), '2026-03-02')
  const daily = [
    bar('2026-03-02', 10), bar('2026-03-03', 12, { volume: null }), bar('2026-03-06', 11),
    bar('2026-03-09', 13), bar('2026-03-10', 14, { isFinal: false }),
  ]
  const weeks = resampleBars(daily, '1w', new Date('2026-03-10T10:00:00+08:00'))
  assert.equal(weeks.length, 2)
  assert.equal(weeks[0].sessionDate, '2026-03-06')
  assert.equal(weeks[0].open, 9)
  assert.equal(weeks[0].high, 13)
  assert.equal(weeks[0].low, 8)
  assert.equal(weeks[0].close, 11)
  assert.equal(weeks[0].volume, null)
  assert.equal(weeks[0].isFinal, true)
  assert.equal(weeks[1].sessionDate, '2026-03-10')
  assert.equal(weeks[1].close, 14)
  assert.equal(weeks[1].isFinal, false)
})

test('months and years close only after Shanghai time leaves the period', () => {
  const daily = [bar('2025-12-31', 8), bar('2026-01-30', 9), bar('2026-02-02', 10)]
  const months = resampleBars(daily, '1M', new Date('2026-02-02T15:00:00+08:00'))
  assert.deepEqual(months.map(item => [item.sessionDate, item.isFinal]), [
    ['2025-12-31', true], ['2026-01-30', true], ['2026-02-02', false],
  ])
  const years = resampleBars(daily, '1y', new Date('2026-02-02T15:00:00+08:00'))
  assert.deepEqual(years.map(item => [item.sessionDate, item.close, item.isFinal]), [
    ['2025-12-31', 8, true], ['2026-02-02', 10, false],
  ])
  assert.equal(years[1].volume, 20)
})

test('daily datasets pass through and other intervals get a distinct id', () => {
  const dataset = { id: 'market:x', interval: '1d', datasetRevision: 'r', historyAnchor: '2026-03-02', bars: [bar('2026-03-02', 10), bar('2026-03-03', 11)] }
  assert.equal(resampleDataset(dataset, '1d'), dataset)
  const weekly = resampleDataset(dataset, '1w', new Date('2026-03-10T00:00:00+08:00'))
  assert.equal(weekly.interval, '1w')
  assert.equal(weekly.id, 'market:x:1w')
  assert.equal(weekly.bars.length, 1)
  assert.equal(normalizeInterval('1y'), '1y')
  assert.equal(normalizeInterval('5m'), '1d')
})
