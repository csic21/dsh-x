import test from 'node:test'
import assert from 'node:assert/strict'
import { readActivity } from '../src/index.ts'

/** A live session stub whose tail is exactly the events given. */
const session = (events: { type: string, seq?: number, data?: Record<string, unknown> }[]) => ({
  seq: events.length,
  snapshotEvents: (from = 0) => events.slice(from),
})

test('a tool whose result has not arrived is still running', () => {
  const activity = readActivity(session([
    { type: 'step/start', seq: 0, data: { turn: 1, step: 2 } },
    { type: 'assistant/attempt', seq: 1, data: { turn: 1, step: 2 } },
    { type: 'tool/call', seq: 2, data: { turn: 1, step: 2, callId: 'c1', name: 'bash', arguments: '{}' } },
  ]))
  assert.deepEqual(activity, { phase: 'tool', tool: 'bash', step: 2 })
})

test('a settled tool means the model is thinking again', () => {
  const activity = readActivity(session([
    { type: 'tool/call', seq: 0, data: { turn: 1, step: 1, name: 'bash' } },
    { type: 'tool/result', seq: 1, data: { turn: 1, step: 1 } },
  ]))
  assert.equal(activity.phase, 'thinking')
  assert.equal(activity.tool, null)
  assert.equal(activity.step, 1)
})

test('a streaming attempt is thinking, and an unknown tail is generic work', () => {
  assert.equal(readActivity(session([{ type: 'assistant/attempt', seq: 0, data: { turn: 1, step: 1 } }])).phase, 'thinking')
  assert.equal(readActivity(session([{ type: 'turn/start', seq: 0, data: { turn: 1 } }])).phase, 'working')
})

test('an unreadable log degrades instead of throwing', () => {
  assert.deepEqual(readActivity({ seq: 5, snapshotEvents: () => { throw new Error('gone') } }), { phase: 'working', tool: null, step: null })
})
