import test from 'node:test'
import assert from 'node:assert/strict'
import { fitReturnModel, predictNetReturn, renderReturnModel } from '../src/return-model.ts'
import type { ReturnRow } from '../src/return-model.ts'

const FEATURES = ['x1', 'x2']

function synthetic(count = 800): ReturnRow[] {
  let seed = 7
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
  const rows: ReturnRow[] = []
  for (let index = 0; index < count; index++) {
    const x1 = random() * 2 - 1
    const x2 = random() * 2 - 1
    rows.push({
      sessionDate: `2026-${String(1 + Math.floor(index / 40)).padStart(2, '0')}-01`,
      vector: { x1, x2 },
      netReturn: 1.5 * x1 - 0.8 * x2 + 0.1 + (random() - 0.5) * 0.2,
    })
  }
  return rows
}

function correlation(left: readonly number[], right: readonly number[]): number {
  const n = left.length
  const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / n
  const mx = mean(left), my = mean(right)
  let sxy = 0, sxx = 0, syy = 0
  for (let index = 0; index < n; index++) {
    const dx = left[index]! - mx, dy = right[index]! - my
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy
  }
  return sxy / Math.sqrt(sxx * syy)
}

test('the ridge head recovers the sign and the ordering of a known relation', () => {
  const rows = synthetic()
  const model = fitReturnModel(rows, FEATURES, { lambda: 2 })
  const predicted = rows.map(row => predictNetReturn(model, row.vector))
  assert.ok(correlation(predicted, rows.map(row => row.netReturn)) > 0.85)
  assert.ok(model.coef[0]! > 0, `x1 should push returns up, got ${model.coef[0]}`)
  assert.ok(model.coef[1]! < 0, `x2 should push returns down, got ${model.coef[1]}`)
  assert.ok(predictNetReturn(model, { x1: 1, x2: -1 }) > predictNetReturn(model, { x1: -1, x2: 1 }))
  assert.equal(model.sample.rows, rows.length)
  assert.equal(model.features.length, FEATURES.length)
  assert.ok(model.sample.from <= model.sample.to)
})

test('the target is winsorised so one violent session cannot own the fit', () => {
  const rows = synthetic(400)
  const spike = { ...rows[0]!, netReturn: 900 }
  const model = fitReturnModel([...rows, spike], FEATURES, { lambda: 2 })
  assert.ok(Number.isFinite(model.intercept) && Number.isFinite(model.coef[0]!))
  assert.ok(Math.abs(model.coef[0]!) < 10, `coef ${model.coef[0]}`)
  assert.equal(model.clip, 15)
})

test('a fit with too few rows is refused instead of shipped', () => {
  assert.throws(() => fitReturnModel(synthetic(10), FEATURES), /not enough rows/)
  assert.throws(() => fitReturnModel(synthetic(400), []), /no features/)
})

test('a missing factor falls back to the centre instead of inventing a value', () => {
  const model = fitReturnModel(synthetic(400), FEATURES)
  const withBoth = predictNetReturn(model, { x1: 0, x2: 0 })
  const missing = predictNetReturn(model, {})
  assert.ok(Number.isFinite(missing))
  assert.ok(Math.abs(missing - withBoth) < 10)
})

test('the generated module is a checked TypeScript literal, not JSON', () => {
  const model = fitReturnModel(synthetic(400), FEATURES)
  const text = renderReturnModel(model)
  assert.match(text, /export const RETURN_MODEL: ReturnModel = \{/)
  assert.match(text, /trainedThrough: '2026-\d\d-01'/)
  assert.match(text, /features: \["x1","x2"\]/)
  assert.doesNotMatch(text, /NaN|Infinity/)
})
