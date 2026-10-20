import test from 'node:test'
import assert from 'node:assert/strict'
import { ACTIONS, ACTION_SPEC, EMBEDDED_ACTIONS, NAVIGATION, actionFields, isAction } from '../src/contract/commands.ts'
import { CDP_CAPABILITIES, EMBEDDED_CAPABILITIES, assertCapability, capabilitiesOf, supports } from '../src/contract/capabilities.ts'
import { fail, isBrowserFailure } from '../src/contract/errors.ts'
import { boundedJson } from '../src/contract/json.ts'
import { MAX_OBSERVATION_REFS, MAX_OBSERVATION_TEXT_BYTES } from '../src/contract/limits.ts'
import { boundObservation } from '../src/contract/observation.ts'
import { validateCommand } from '../src/protocol.ts'

test('every action carries one spec and the embedded protocol stays a strict subset', () => {
  assert.deepEqual(Object.keys(ACTION_SPEC).sort(), [...ACTIONS].sort())
  assert.deepEqual([...NAVIGATION].sort(), ['back', 'forward', 'navigate', 'reload'])
  for (const action of EMBEDDED_ACTIONS) assert.ok((ACTIONS as readonly string[]).includes(action))
  assert.equal(EMBEDDED_ACTIONS.length < ACTIONS.length, true)
  assert.equal(isAction('select'), true)
  assert.equal(isAction('evaluate'), false)
  assert.deepEqual(actionFields('select'), ['target', 'value'])
})

test('the embedded command protocol still rejects everything outside its nine actions', () => {
  assert.throws(() => validateCommand({ action: 'select', target: 'e1', value: 'x' }), { code: 'BROWSER_INPUT' })
  assert.throws(() => validateCommand({ action: 'evaluate', script: '1' }), { code: 'BROWSER_INPUT' })
  assert.throws(() => validateCommand({ action: 'click', target: '@e1' }), { code: 'BROWSER_TARGET' })
  assert.equal(validateCommand({ action: 'navigate', url: 'example.test' }).url, 'https://example.test/')
  assert.equal(validateCommand({ action: 'click', target: 'e1:s1:n1' }).target, 'e1:s1:n1')
})

test('capabilities describe what each backend may expose without backend branches', () => {
  assert.equal(supports(CDP_CAPABILITIES, 'select'), true)
  assert.equal(supports(EMBEDDED_CAPABILITIES, 'select'), false)
  assert.equal(supports(EMBEDDED_CAPABILITIES, 'read'), false)
  assert.deepEqual([...capabilitiesOf('embedded')], [...EMBEDDED_CAPABILITIES])
  assert.throws(() => assertCapability(EMBEDDED_CAPABILITIES, 'select'), { code: 'BROWSER_UNSUPPORTED' })
})

test('observations bound text and refs and remove private URL parts', () => {
  const refs: Record<string, string> = { e1: 'link: Example' }
  for (let index = 0; index < MAX_OBSERVATION_REFS + 5; index++) refs[`e${index + 2}`] = `item ${index}`
  refs['bad key!'] = 'invalid reference key'
  const observation = boundObservation({ targetId: 't1', revision: 3, url: 'https://example.test/a?token=secret#frag', title: 'Example', refs, text: 'x'.repeat(MAX_OBSERVATION_TEXT_BYTES + 10) })
  assert.equal(observation.url, 'https://example.test/a')
  assert.equal(observation.revision, 3)
  assert.equal(Object.keys(observation.refs).length, MAX_OBSERVATION_REFS)
  assert.equal(observation.refs['bad key!'], undefined)
  assert.equal(Buffer.byteLength(observation.text) <= MAX_OBSERVATION_TEXT_BYTES, true)
  assert.equal(observation.truncated, true)
  assert.throws(() => boundObservation({ targetId: 't1', revision: -1 }), { code: 'BROWSER_RESULT' })
  assert.throws(() => boundObservation({ targetId: 't 1', revision: 0 }), { code: 'BROWSER_INPUT' })
  assert.throws(() => boundObservation({ targetId: 't1', revision: 0, refs: [] }), { code: 'BROWSER_RESULT' })
})

test('browser failures keep a stable code and are distinguishable from other errors', () => {
  const error = fail('BROWSER_PROTOCOL', 'bad JSON')
  assert.equal(error.code, 'BROWSER_PROTOCOL')
  assert.equal(isBrowserFailure(error), true)
  assert.equal(isBrowserFailure(new Error('plain')), false)
  assert.equal(isBrowserFailure({ code: 'BROWSER_PROTOCOL' }), false)
})

test('bounded JSON enforces the result budget', () => {
  assert.deepEqual(boundedJson({ ok: true }), { ok: true })
  assert.throws(() => boundedJson({ text: 'x'.repeat(70000) }), { code: 'BROWSER_RESULT' })
  assert.throws(() => boundedJson(undefined), { code: 'BROWSER_RESULT' })
})
