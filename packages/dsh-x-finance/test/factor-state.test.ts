import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FACTOR_MIN_SESSIONS, factorAlpha, factorCalibrate, factorStandardise,
  isFactorStateReady, parseFactorState, updateFactorState,
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

test('readiness needs both enough sessions and the exact feature order', () => {
  let state = null
  for (let index = 1; index < FACTOR_MIN_SESSIONS; index++) {
    state = updateFactorState(state, FEATURES, [session(day(index), new Array(10).fill(index))])
  }
  assert.equal(isFactorStateReady(state, FEATURES), false)
  state = updateFactorState(state, FEATURES, [session(day(FACTOR_MIN_SESSIONS), new Array(10).fill(99))])
  assert.equal(isFactorStateReady(state, FEATURES), true)
  assert.equal(isFactorStateReady(state, ['b', 'a']), false)
  assert.equal(isFactorStateReady(state, ['a']), false)
  assert.equal(isFactorStateReady(null, FEATURES), false)
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
  assert.equal(factorCalibrate({ ...state, calibration: { a: 1, b: 0 } }, 2), 2)
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
  rejects(value => { value.version = 2 })
  rejects(value => { value.asOf = 'not-a-date' })
  rejects(value => { value.features = ['a', 'a'] })
})

test('a feature list that does not match the state is refused', () => {
  const state = updateFactorState(null, FEATURES, [session(day(1), new Array(10).fill(1))])
  assert.throws(() => updateFactorState(state, ['b', 'a'], []), { code: 'finance/factor-state-invalid' })
})
