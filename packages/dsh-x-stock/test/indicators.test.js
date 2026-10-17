import test from 'node:test'
import assert from 'node:assert/strict'
import { sma, ema, macd, computeIndicators, createIndicatorEngine, validateMacdParams, validateIndicatorConfig, DEFAULT_MACD, INDICATOR_ALGORITHM_VERSION } from '../src/indicators.js'
import { createDemoDataset } from '../src/chart-data.js'

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-10 + 1e-10 * Math.abs(expected), `${actual} != ${expected}`)
const bars = closes => closes.map((close, index) => ({ sessionDate: `2026-01-${String(index + 1).padStart(2, '0')}`, close }))
const config = { maPeriods: [2, 3], macd: { fast: 2, slow: 3, signal: 2, histScale: 2 } }

test('MA and independent SMA-seeded EMA match hand-calculated gold values', () => {
  const values = [1, 2, 4, 8]
  const ma = sma(values, 3)
  const exponential = ema(values, 3)
  assert.deepEqual(ma.slice(0, 2), [null, null])
  assert.deepEqual(exponential.slice(0, 2), [null, null])
  near(ma[2], 7 / 3)
  near(ma[3], 14 / 3)
  near(exponential[2], 7 / 3)
  near(exponential[3], 31 / 6)
})

test('MACD(2,3,2) independent seeds match exact DIF 11/9, DEA 37/36, histogram 7/18', () => {
  const result = macd([1, 2, 4, 8], config.macd)
  assert.deepEqual(result.dif.slice(0, 2), [null, null])
  assert.deepEqual(result.dea.slice(0, 3), [null, null, null])
  assert.deepEqual(result.hist.slice(0, 3), [null, null, null])
  near(result.dif[3], 11 / 9)
  near(result.dea[3], 37 / 36)
  near(result.histRaw[3], 7 / 36)
  near(result.hist[3], 7 / 18)
  assert.notEqual(result.dif[3], 7 / 6, 'Do not silently use TA-Lib aligned MACD seed')
  for (let index = 2; index < 4; index++) assert.equal(result.dif[index], result.fastEma[index] - result.slowEma[index])
})

test('default MACD remains null until full 26+9-1 warmup', () => {
  for (const count of [0, 1, 12, 25, 26, 33]) {
    const result = macd(Array.from({ length: count }, (_, i) => i + 1))
    assert.ok(result.hist.every(value => value === null))
  }
  const result = macd(Array.from({ length: 34 }, (_, i) => i + 1))
  assert.deepEqual(result.params, DEFAULT_MACD)
  assert.ok(result.dif[25] !== null)
  assert.equal(result.dea[32], null)
  assert.ok(result.dea[33] !== null)
  near(result.hist[33], 0)
})

test('constant inputs produce exact positive zero rather than fake warmup zeros or negative zero', () => {
  const result = macd(Array(100).fill(10))
  assert.equal(result.dif[0], null)
  for (const value of result.dif.slice(25)) assert.equal(value, 0)
  for (const value of result.hist.slice(33)) assert.equal(value, 0)
  for (const value of result.hist) assert.equal(Object.is(value, -0), false)
  assert.deepEqual(sma([-0, -0], 1), [0, 0])
  assert.deepEqual(ema([-0, -0], 1), [0, 0])
})

test('histogram scale is explicit and never changes DIF, DEA or raw difference', () => {
  const values = Array.from({ length: 80 }, (_, index) => 50 + Math.sin(index / 5) * 9)
  const one = macd(values, { histScale: 1 })
  const two = macd(values, { histScale: 2 })
  assert.deepEqual(one.dif, two.dif)
  assert.deepEqual(one.dea, two.dea)
  assert.deepEqual(one.histRaw, two.histRaw)
  two.hist.forEach((value, index) => value === null ? assert.equal(one.hist[index], null) : assert.equal(value, 2 * one.hist[index]))
  assert.ok(one.hist.some(value => value > 0) && one.hist.some(value => value < 0))
})

test('gaps reset both SMA and EMA; missing samples are not zero or carried-forward prices', () => {
  const values = [1, 2, 4, null, 8, 10, 12, 14]
  assert.deepEqual(sma(values, 3), [null, null, 7 / 3, null, null, null, 10, 12])
  assert.deepEqual(ema(values, 3), [null, null, 7 / 3, null, null, null, 10, 12])
  const result = macd(values, config.macd)
  assert.equal(result.dif[3], null)
  assert.equal(result.dif[5], null)
  assert.equal(result.dea[6], null)
  assert.ok(result.dea[7] !== null)
})

test('finite nonpositive adjusted inputs are calculated without clipping', () => {
  const positive = macd([1, 2, 4, 8], config.macd)
  const shifted = macd([-19, -18, -16, -12], config.macd)
  near(shifted.dif[3], positive.dif[3])
  near(shifted.dea[3], positive.dea[3])
  near(shifted.hist[3], positive.hist[3])
  const negative = macd([-1, -2, -4, -8], config.macd)
  near(negative.hist[3], -positive.hist[3])
})

test('validates numeric samples and bounded integer parameters', () => {
  for (const values of [undefined, {}, [undefined], [NaN], [Infinity], ['2'], [false]]) {
    assert.throws(() => sma(values, 3))
    assert.throws(() => ema(values, 3))
    assert.throws(() => macd(values))
  }
  for (const size of [0, -1, 501, 2.5, '3', null, Infinity]) {
    assert.throws(() => sma([1, 2, 3], size))
    assert.throws(() => ema([1, 2, 3], size))
  }
  for (const input of [{ fast: 26 }, { fast: 27 }, { slow: 0 }, { signal: 501 }, { histScale: 0 }, { histScale: 3 }, { histScale: '2' }, { seed: 'first' }, [], null]) assert.throws(() => validateMacdParams(input))
  for (const input of [{ maPeriods: [3, 3] }, { maPeriods: [0] }, { maPeriods: Array.from({ length: 9 }, (_, i) => i + 1) }, { maPeriods: '5' }, { histogram: 2 }, { historyAnchor: '2026-02-30' }]) assert.throws(() => validateIndicatorConfig(input))
  assert.deepEqual(sma([1, 2], 1), [1, 2])
  assert.deepEqual(ema([1, 2], 1), [1, 2])
})

test('overflow cannot silently produce Infinity/NaN output', () => {
  near(sma([1e308, 1e308], 2)[1] / 1e308, 1)
  near(ema([1e308, 1e308, 1e308], 2)[2] / 1e308, 1)
  assert.throws(() => macd([-1.7e308, -1.7e308, 1.7e308], { fast: 1, slow: 3, signal: 1, histScale: 2 }), /finite number range/)
})

test('full result is date-keyed, versioned, nullable and independent of visual configuration', () => {
  const result = computeIndicators(bars([1, 2, 4, 8]), config)
  assert.equal(result.spec.algorithmVersion, INDICATOR_ALGORITHM_VERSION)
  assert.equal(result.spec.seedPolicy, 'independent-sma')
  assert.equal(result.spec.historyAnchor, '2026-01-01')
  assert.equal(result.spec.missingPolicy, 'reset-and-reseed-on-null')
  assert.deepEqual(result.times, bars([1, 2, 4, 8]).map(bar => bar.sessionDate))
  assert.equal(result.rows[0].ma[3], null)
  assert.equal(result.rows[0].hist, null)
  assert.equal(result.rows[3].dif, result.macd.dif[3])
  assert.equal(result.rows[3].ma[2], result.ma[2][3])
  assert.deepEqual(result.warmup, { macdBars: 4, availableBars: 4, complete: true })
  const hiddenMa = computeIndicators(bars([1, 2, 4, 8]), { ...config, maPeriods: [] })
  assert.deepEqual(hiddenMa.macd, result.macd)
})

test('engine validates dates/order/history anchor and reports an empty history honestly', () => {
  assert.throws(() => computeIndicators([{ sessionDate: 'bad', close: 1 }]))
  assert.throws(() => computeIndicators(bars([1, 2]).reverse()))
  assert.throws(() => computeIndicators([bars([1])[0], bars([1])[0]]))
  assert.throws(() => computeIndicators(bars([1, 2]), { historyAnchor: '2025-12-31' }), /historyAnchor/)
  assert.equal(computeIndicators([]).spec.historyAnchor, null)
  assert.equal(computeIndicators([]).warmup.complete, false)
  const input = bars([1, 2, 4, 8])
  input[1].sessionDate = '2026-01-03'
  input[2].sessionDate = '2026-01-07'
  input[3].sessionDate = '2026-01-09'
  assert.equal(computeIndicators(input, config).rows.length, 4, 'Absent sessions must not be manufactured')
})

test('append and repeated same-last-bar replacements equal fresh full-history computation', () => {
  const all = createDemoDataset({ count: 100 }).bars
  const engine = createIndicatorEngine(all.slice(0, 40))
  for (let i = 40; i < all.length; i++) {
    const provisional = { ...all[i], close: all[i].close + 1, isFinal: false }
    engine.update(provisional)
    engine.update({ ...provisional, close: all[i].close + 2 })
    const actual = engine.update(all[i])
    assert.equal(actual.bars.length, i + 1)
    assert.equal(actual.historyAnchor, all[0].sessionDate)
    assert.deepEqual(actual.indicators, computeIndicators(all.slice(0, i + 1)))
  }
})

test('historical revisions and explicit adjustment replacement match a full recomputation', () => {
  const all = createDemoDataset({ count: 120 }).bars.map(bar => ({ ...bar }))
  const engine = createIndicatorEngine(all)
  for (const index of [0, 11, 25, 70, 119]) {
    all[index] = { ...all[index], close: all[index].close - 2, revision: 'revised' }
    const actual = engine.revise(all[index])
    assert.deepEqual(actual.indicators, computeIndicators(all))
    assert.equal(actual.historyAnchor, all[0].sessionDate)
  }
  const adjusted = all.map(bar => ({ ...bar, close: bar.close - 80 }))
  assert.deepEqual(engine.replace(adjusted).indicators, computeIndicators(adjusted))
})

test('prepending changes the declared history anchor explicitly and recomputes subsequent seeds', () => {
  const all = createDemoDataset({ count: 100 }).bars
  const engine = createIndicatorEngine(all.slice(30))
  const before = engine.snapshot()
  const next = engine.prepend(all.slice(0, 30))
  assert.equal(before.historyAnchor, all[30].sessionDate)
  assert.equal(next.historyAnchor, all[0].sessionDate)
  assert.deepEqual(next.indicators, computeIndicators(all))
  assert.deepEqual(engine.prepend([]), next)
  assert.throws(() => engine.prepend(all.slice(0, 2)), /precede/)
})

test('configuration changes preserve all loaded history, and invalid updates are transactional', () => {
  const all = createDemoDataset({ count: 90 }).bars
  const engine = createIndicatorEngine(all)
  const changed = engine.configure(config)
  assert.deepEqual(changed.indicators, computeIndicators(all, config))
  assert.equal(changed.historyAnchor, all[0].sessionDate)
  const before = engine.snapshot()
  for (const action of [
    () => engine.update(all[20]),
    () => engine.update({ ...all.at(-1), close: Infinity }),
    () => engine.revise({ sessionDate: '1900-01-01', close: 4 }),
    () => engine.replace([...all].reverse()),
    () => engine.configure({ macd: { fast: 30, slow: 10 } }),
  ]) { assert.throws(action); assert.deepEqual(engine.snapshot(), before) }
})

test('caller mutations cannot corrupt retained engine history or results', () => {
  const input = bars([1, 2, 4, 8])
  const engine = createIndicatorEngine(input, config)
  const expected = computeIndicators(input, config)
  input[0].close = 1000
  const snapshot = engine.snapshot()
  snapshot.bars[0].close = -1000
  snapshot.indicators.macd.hist[3] = 1000
  assert.deepEqual(engine.snapshot().indicators, expected)
  const finalBar = { sessionDate: '2026-01-05', close: 16 }
  engine.update(finalBar)
  finalBar.close = 2000
  assert.equal(engine.snapshot().bars.at(-1).close, 16)
})

test('empty engine can begin with one bar and later reset to a different dataset', () => {
  const engine = createIndicatorEngine([], config)
  const first = engine.update({ sessionDate: '2026-01-01', close: 10 })
  assert.equal(first.historyAnchor, '2026-01-01')
  assert.equal(first.indicators.rows[0].dif, null)
  const replacement = engine.replace([{ sessionDate: '2025-01-01', close: 20 }])
  assert.equal(replacement.historyAnchor, '2025-01-01')
  assert.equal(replacement.bars.length, 1)
})

test('deterministic long oscillation fixture matches an independent reference recurrence', () => {
  const values = createDemoDataset({ count: 5000 }).bars.map(bar => bar.close)
  const referenceEma = (data, size) => {
    let state = null
    const out = data.map((value, index) => {
      if (index < size - 1) return null
      state = state === null ? data.slice(0, size).reduce((sum, item) => sum + item, 0) / size : state + (value - state) * 2 / (size + 1)
      return state
    })
    return out
  }
  const result = macd(values)
  const fast = referenceEma(values, 12)
  const slow = referenceEma(values, 26)
  const dif = values.slice(25).map((_, index) => fast[index + 25] - slow[index + 25])
  const dea = referenceEma(dif, 9)
  for (let i = 33; i < values.length; i++) {
    near(result.dif[i], dif[i - 25])
    near(result.dea[i], dea[i - 25])
    near(result.hist[i], (dif[i - 25] - dea[i - 25]) * 2)
  }
})
