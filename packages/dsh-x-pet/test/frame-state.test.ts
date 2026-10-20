import test from 'node:test'
import assert from 'node:assert/strict'
import { playbackFor, readFrameFacts, readSessionFacts } from '../src/frame-state.ts'

const NOW = 1_800_000_000_000

const frame = (type: string, seq: number, data?: unknown, time = NOW - 60_000) => ({ type, seq, time, data })

/** A live session whose tail is exactly the events given. */
const session = (id: string, events: ReturnType<typeof frame>[]) => ({
  id,
  seq: events.length,
  snapshotEvents: (from = 0) => events.slice(from),
})

const running = (id: string, startedAt = NOW - 42_000) => session(id, [
  frame('session/title', 0, { title: 'Build the pet' }),
  frame('turn/start', 1, { turn: 1 }, startedAt),
  frame('tool/call', 2, { name: 'bash', step: 2 }),
])

test('a tool with no result yet is the running phase', () => {
  const facts = readSessionFacts(running('s1') as any, NOW)
  assert.equal(facts.state, 'running')
  assert.equal(facts.phase, 'tool')
  assert.equal(facts.tool, 'bash')
  assert.equal(facts.title, 'Build the pet')
  assert.equal(facts.elapsedMs, 42_000)
})

test('a tool result hands the phase back to thinking', () => {
  const s = session('s1', [
    frame('turn/start', 0, { turn: 1 }, NOW - 5_000),
    frame('tool/call', 1, { name: 'bash' }),
    frame('tool/result', 2, { ok: true }),
  ])
  const facts = readSessionFacts(s as any, NOW)
  assert.equal(facts.state, 'running')
  assert.equal(facts.phase, 'thinking')
  assert.equal(facts.tool, null)
})

test('a finished turn is idle and forgets the clock', () => {
  const s = session('s1', [
    frame('turn/start', 0, { turn: 1 }),
    frame('turn/end', 1, { turn: 1 }),
  ])
  const facts = readSessionFacts(s as any, NOW)
  assert.equal(facts.state, 'idle')
  assert.equal(facts.elapsedMs, null)
  assert.equal(facts.phase, 'idle')
})

test('the fold watches the newest running session and counts the rest', () => {
  const older = running('older', NOW - 90_000)
  const newer = running('newer', NOW - 12_000)
  const idle = session('idle', [frame('turn/start', 0), frame('turn/end', 1)])
  const facts = readFrameFacts([older, newer, idle] as any, NOW)
  assert.equal(facts.count, 2)
  assert.equal(facts.sessionId, 'newer')
  assert.equal(facts.state, 'running')
})

test('nothing running folds to a quiet pet', () => {
  const facts = readFrameFacts([session('idle', [])] as any, NOW)
  assert.equal(facts.sessionId, null)
  assert.equal(facts.state, 'idle')
  assert.equal(facts.count, 0)
})

test('an unreadable log degrades instead of throwing', () => {
  const broken = { id: 's1', seq: 2, snapshotEvents: () => { throw new Error('gone') } }
  assert.equal(readSessionFacts(broken as any, NOW).state, 'idle')
  assert.equal(readFrameFacts([broken] as any, NOW).count, 0)
})

test('the host ships the exact frame plan the window paints', () => {
  const runningPlan = playbackFor('running')
  assert.equal(runningPlan.loopStart, 0)
  assert.equal(runningPlan.frames.length, 6)
  assert.deepEqual(runningPlan.frames[0], { row: 7, column: 0, durationMs: 120 })
  const idlePlan = playbackFor('idle')
  assert.equal(idlePlan.loopStart, 0)
  assert.equal(idlePlan.frames[0].row, 0)
  assert.equal(idlePlan.frames[0].durationMs, 1_680)
})
