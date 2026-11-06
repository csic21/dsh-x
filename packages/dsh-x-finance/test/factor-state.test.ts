import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FACTOR_BLEND_SESSIONS, factorAlpha, factorStandardise, factorWeight,
  parseFactorState, shrunkEdge, updateFactorState,
} from '../src/factor-state.ts'
import type { FactorSession } from '../src/factor-state.ts'

const FEATURES = ['a', 'b']

const session = (date: string, values: number[], net = 0, label = 0): FactorSession => ({
  sessionDate: date,
  rows: values.map(value => ({ vector: { a: value, b: 1 }, netReturn: net, label })),
})

const day = (index: number) => `2026-01-${String(index).padStart(2, '0')}`

test('the first session installs its own cross-section as the ruler', () => {
  const state = updateFactorState(null, FEATURES, [session(day(1), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])])
  assert.equal(state.sessions, 1)
  assert.equal(state.asOf, day(1))
  assert.ok(Math.abs(state.center[0]! - 5.5) < 1e-12)
  // Sample standard deviation of 1..10.
  assert.ok(Math.abs(state.spread[0]! - 3.0276503540974917) < 1e-9)
  assert.equal(state.calibration.a, 1)
  assert.equal(state.calibration.b, 0)
})

test('later sessions move the ruler by the half-life weight, not by the whole day', () => {
  const first = updateFactorState(null, FEATURES, [session(day(1), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])])
  const second = updateFactorState(first, FEATURES, [session(day(2), new Array(10).fill(15))])
  assert.equal(second.sessions, 2)
  assert.ok(Math.abs((second.center[0]! - (0.5 * 5.5 + 0.5 * 15))) < 1e-9)
  assert.ok(factorAlpha(1, 60) > 0.4 && factorAlpha(1, 60) < 0.6)
  assert.ok(factorAlpha(100, 60) < 0.02, 'after a hundred sessions the weight is the decay weight')
})

test('replaying a session already folded in changes nothing', () => {
  const first = updateFactorState(null, FEATURES, [session(day(1), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])])
  const again = updateFactorState(first, FEATURES, [session(day(1), new Array(10).fill(99))])
  assert.deepEqual(again, first)
})

test('a cross-section too thin to estimate a spread advances nothing', () => {
  const first = updateFactorState(null, FEATURES, [session(day(1), [1, 2, 3, 4, 5, 6, 7])])
  assert.equal(first.sessions, 0)
  assert.equal(first.asOf, '1970-01-01')
})

test('sessions arrive unordered and are folded in date order', () => {
  const state = updateFactorState(null, FEATURES, [
    session(day(3), new Array(10).fill(30)),
    session(day(1), new Array(10).fill(10)),
    session(day(2), new Array(10).fill(20)),
  ])
  assert.equal(state.sessions, 3)
  assert.equal(state.asOf, day(3))
})

test('the daily state ramps in instead of switching on after a month', () => {
  let state = null
  assert.equal(factorWeight(state, FEATURES), 0)
  for (let index = 1; index <= FACTOR_BLEND_SESSIONS; index++) {
    state = updateFactorState(state, FEATURES, [session(day(index), new Array(10).fill(index))])
  }
  // Ten sessions against ten prior ones: exactly half of the ruler is daily.
  assert.ok(Math.abs(factorWeight(state, FEATURES) - 0.5) < 1e-12)
  assert.ok(factorWeight(state, FEATURES) > 0, 'the first sessions already count')
  assert.equal(factorWeight(state, ['b', 'a']), 0)
  assert.equal(factorWeight(state, ['a']), 0)
  assert.equal(factorWeight(null, FEATURES), 0)
})

test('a persistent mismatch between the shipped probability and the outcome moves the calibration', () => {
  const model = { intercept: -3, coef: [0, 0] }
  let state = null
  for (let index = 1; index <= 40; index++) {
    state = updateFactorState(state, FEATURES, [session(day(index), new Array(10).fill(index), 0, 1)], model)
  }
  assert.ok(state!.calibration.b > 0.05, `b ${state!.calibration.b}`)
  // A constant outcome carries no slope information, so the slope walks to its floor.
  assert.ok(state!.calibration.a >= 0.25 && state!.calibration.a <= 4)
})

test('standardising centres, scales and clips', () => {
  const state = updateFactorState(null, FEATURES, [session(day(1), [1, 2, 3, 4, 5, 6, 7, 8, 9, 11])])!
  assert.ok(Math.abs(factorStandardise(state, 0, state.center[0]!)) < 1e-12)
  assert.equal(factorStandardise(state, 0, 1e6), 5)
  assert.equal(factorStandardise(state, 0, -1e6), -5)
})

test('a corrupt state is refused instead of partially applied', () => {
  const state = updateFactorState(null, FEATURES, [session(day(1), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])])
  assert.deepEqual(parseFactorState(JSON.parse(JSON.stringify(state))), state)
  const rejects = (mutate: (value: any) => void) => {
    const copy = JSON.parse(JSON.stringify(state))
    mutate(copy)
    assert.throws(() => parseFactorState(copy), { code: 'finance/factor-state-invalid' })
  }
  rejects(value => { value.extra = 1 })
  rejects(value => { value.center = [...value.center, 0] })
  rejects(value => { value.spread = [0, 1] })
  rejects(value => { value.center = [Number.NaN, 0] })
  rejects(value => { value.calibration = { a: 10, b: 0 } })
  rejects(value => { value.version = 3 })
  rejects(value => { value.asOf = 'not-a-date' })
  rejects(value => { value.features = ['a', 'a'] })
})

test('a feature list that does not match the state is refused', () => {
  const state = updateFactorState(null, FEATURES, [session(day(1), new Array(10).fill(1))])
  assert.throws(() => updateFactorState(state, ['b', 'a'], []), { code: 'finance/factor-state-invalid' })
})

const EDGE_MODEL = {
  intercept: 0,
  coef: [0, 0],
  buckets: {
    streak: [{ key: 's0', from: -1, to: 0.5 }, { key: 's4', from: 3.5, to: null }],
    regime: [{ key: 'cold', from: -1, to: 33 }, { key: 'hot', from: 67, to: null }],
  },
}

const edgeSession = (date: string, streak: number, hotShare: number, netReturn: number): FactorSession => ({
  sessionDate: date,
  rows: Array.from({ length: 10 }, (_, index) => ({
    vector: { a: index, b: 1, streak, hotShare },
    netReturn,
    label: 0,
  })),
})

test('bucket edges learn from labelled trades and are shrunk toward their prior', () => {
  let state = null
  for (let index = 1; index <= 30; index++) {
    state = updateFactorState(state, FEATURES, [edgeSession(day(index), 4, 80, 2)], EDGE_MODEL)
  }
  assert.ok(state)
  // Observed +2% against a -1% prior, with 300 effective observations.
  const shrunk = shrunkEdge(state, 'streak', 's4', -1)
  assert.ok(shrunk > 1.5 && shrunk < 2, `shrunk ${shrunk}`)
  const regime = shrunkEdge(state, 'regime', 'hot', -2)
  assert.ok(regime > 1 && regime < 2, `regime ${regime}`)
  assert.equal(shrunkEdge(state, 'streak', 's0', -3), -3, 'an unseen bucket keeps its prior')
  assert.equal(shrunkEdge(null, 'streak', 's4', -1), -1)
})

test('a bucket that stops appearing loses evidence instead of keeping it forever', () => {
  let state = null
  for (let index = 1; index <= 30; index++) {
    state = updateFactorState(state, FEATURES, [edgeSession(day(index), 4, 80, 2)], EDGE_MODEL)
  }
  const before = state!.edges.streak.find(bucket => bucket.key === 's4')!.n
  for (let index = 1; index <= 20; index++) {
    state = updateFactorState(state, FEATURES, [edgeSession(day(index + 30), 0, 10, -1)], EDGE_MODEL)
  }
  const after = state!.edges.streak.find(bucket => bucket.key === 's4')?.n ?? 0
  assert.ok(after < before, `${after} should be below ${before}`)
})

test('a version 1 state is migrated with empty bucket edges', () => {
  const legacy = {
    version: 1, asOf: '1970-01-01', halfLife: 60, sessions: 0,
    features: FEATURES, center: [0, 0], spread: [1, 1], ic: [0, 0], icSpread: [0, 0],
    calibration: { a: 1, b: 0 },
  }
  const migrated = parseFactorState(legacy)
  assert.equal(migrated.version, 2)
  assert.deepEqual(migrated.edges, { streak: [], regime: [] })
})
