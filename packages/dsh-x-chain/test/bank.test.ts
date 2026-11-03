import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ChainInputError,
  describeGuard,
  guardHolds,
  jsonEqual,
  lookup,
  parseSteps,
  truncate,
  type StepReceipt,
} from '../src/bank.ts'

const limits = { allowedTools: ['bash', 'write'], maxSteps: 3 }

function receipt(overrides: Partial<StepReceipt> & Pick<StepReceipt, 'id'>): StepReceipt {
  return { tool: 'bash', ok: true, ms: 1, text: '', ...overrides }
}

test('a bank must be a bounded array of literal steps', () => {
  assert.throws(() => parseSteps(undefined, limits), ChainInputError)
  assert.throws(() => parseSteps([], limits), /at least one step/)
  assert.throws(() => parseSteps([{ id: 'a', tool: 'bash' }, { id: 'b', tool: 'bash' }, { id: 'c', tool: 'bash' }, { id: 'd', tool: 'bash' }], limits), /at most 3/)
  assert.throws(() => parseSteps([{ id: 'a', tool: 'bash' }, { id: 'a', tool: 'bash' }], limits), /used twice/)
  assert.throws(() => parseSteps([{ id: 'a', tool: 'rm' }], limits), /not allowed in a chain/)
  assert.throws(() => parseSteps([{ id: 'a', tool: 'chain_run' }], limits), /cannot be chain_run/)
  assert.throws(() => parseSteps([{ id: 'a', tool: 'bash', arguments: ['rm'] }], limits), /must be an object/)
})

test('a guard may only read an earlier step', () => {
  assert.throws(
    () => parseSteps([{ id: 'a', tool: 'bash', when: [{ step: 'b' }] }, { id: 'b', tool: 'bash' }], limits),
    /must name an earlier step/,
  )
  assert.throws(
    () => parseSteps([{ id: 'a', tool: 'bash', when: [{ step: 'a', ok: true }] }], limits),
    /must name an earlier step/,
  )
  assert.throws(
    () => parseSteps([{ id: 'a', tool: 'bash' }, { id: 'b', tool: 'bash', when: [{ step: 'a' }] }], limits),
    /needs ok, path, or equals/,
  )
})

test('a valid bank normalizes defaults and keeps guard conditions', () => {
  const steps = parseSteps([
    { id: 'write', tool: 'write', arguments: { path: 'a.ts', content: 'x' } },
    { id: 'test', tool: 'bash', arguments: { command: 'pnpm test' }, when: [{ step: 'write', ok: true }, { step: 'write', path: 'path', equals: 'a.ts' }] },
  ], limits)
  assert.equal(steps.length, 2)
  assert.deepEqual(steps[0].arguments, { path: 'a.ts', content: 'x' })
  assert.deepEqual(steps[1].when, [
    { step: 'write', ok: true },
    { step: 'write', path: 'path', equals: 'a.ts' },
  ])
  assert.deepEqual(steps[0].when, [])
})

test('guards read real receipt values and fail closed', () => {
  const receipts = new Map<string, StepReceipt>([
    ['ok', receipt({ id: 'ok', value: { exitCode: 0, files: [{ path: 'a.ts' }] } })],
    ['bad', receipt({ id: 'bad', ok: false, tool: 'bash' })],
  ])
  assert.equal(guardHolds({ step: 'ok', ok: true }, receipts), true)
  assert.equal(guardHolds({ step: 'ok', ok: false }, receipts), false)
  assert.equal(guardHolds({ step: 'bad', ok: false }, receipts), true)
  assert.equal(guardHolds({ step: 'ok', path: 'exitCode', equals: 0 }, receipts), true)
  assert.equal(guardHolds({ step: 'ok', path: 'exitCode', equals: 1 }, receipts), false)
  assert.equal(guardHolds({ step: 'ok', path: 'files.0.path', equals: 'a.ts' }, receipts), true)
  assert.equal(guardHolds({ step: 'ok', path: 'missing' }, receipts), false)
  assert.equal(guardHolds({ step: 'never' }, receipts), false)
})

test('a failed guard explains what differed', () => {
  const receipts = new Map<string, StepReceipt>([
    ['ok', receipt({ id: 'ok', value: { exitCode: 2 } })],
  ])
  assert.match(describeGuard({ step: 'ok', path: 'exitCode', equals: 0 }, receipts), /exitCode.*0.*2/)
  assert.match(describeGuard({ step: 'ok', path: 'stdout' }, receipts), /has no "stdout"/)
  assert.match(describeGuard({ step: 'gone' }, receipts), /did not run/)
})

test('JSON comparison and dot lookup stay structural', () => {
  assert.equal(jsonEqual({ a: [1, { b: null }] }, { a: [1, { b: null }] }), true)
  assert.equal(jsonEqual({ a: 1 }, { a: 1, b: 2 }), false)
  assert.deepEqual(lookup({ a: [{ b: 3 }] }, 'a.0.b'), { exists: true, value: 3 })
  assert.deepEqual(lookup({ a: 1 }, 'a.0'), { exists: false })
  assert.deepEqual(lookup([1, 2], '1'), { exists: true, value: 2 })
})

test('a long receipt keeps both ends', () => {
  const text = `HEAD-${'x'.repeat(500)}-TAIL`
  const cut = truncate(text, 120)
  assert.ok(cut.length < text.length)
  assert.match(cut, /^HEAD-/)
  assert.match(cut, /-TAIL$/)
  assert.match(cut, /chars omitted/)
  assert.equal(truncate('short', 120), 'short')
})
