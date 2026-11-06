import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createFactorEvolve, labelJournalSession } from '../src/factor-evolve.ts'
import type { LabelBar } from '../src/factor-evolve.ts'
import { appendJournalSession, readFactorJournal } from '../src/factor-journal.ts'
import type { JournalSession } from '../src/factor-journal.ts'
import { readFactorState } from '../src/factor-state-store.ts'

// Five calendar days after the signal session: T+1 and T+2 both exist.
const NOW = Date.parse('2026-01-10T04:00:00.000Z')
const SESSION_DATE = '2026-01-05'

const bar = (sessionDate: string, open: number, high: number, low: number, close: number, volume: number | null = 1000): LabelBar =>
  ({ sessionDate, open, high, low, close, volume })

const barsFor = (nextOpen = 10.5): LabelBar[] => [
  bar('2026-01-05', 10.2, 10.6, 10.1, 10.4),
  bar('2026-01-06', nextOpen, nextOpen + 0.4, nextOpen - 0.2, nextOpen + 0.3),
  bar('2026-01-07', nextOpen + 0.3, nextOpen + 0.5, nextOpen + 0.1, nextOpen + 0.4),
]

const session = (count = 10): JournalSession => ({
  sessionDate: SESSION_DATE,
  rows: Array.from({ length: count }, (_, index) => ({
    symbol: `SH.6000${String(index).padStart(2, '0')}`,
    close: 10.4,
    rate: 10,
    vector: { ret5: index / 10, streak: index % 3 },
  })),
})

test('a normal session labels into a net return measured from the fill', () => {
  const observations = labelJournalSession(session(3), () => barsFor())
  assert.equal(observations.length, 3)
  for (const observation of observations) {
    assert.ok(Number.isFinite(observation.netReturn))
    assert.ok(observation.netReturn < (11.4 / 10.5 - 1) * 100, 'cost is deducted')
    assert.ok(observation.label === 0 || observation.label === 1)
  }
})

test('a sealed next open, a suspension and a missing exit are all dropped', () => {
  assert.equal(labelJournalSession(session(3), () => barsFor(11.44)).length, 0, 'open on the limit')
  const suspended = barsFor()
  suspended[1] = bar('2026-01-06', 10.5, 10.9, 10.4, 10.8, 0)
  assert.equal(labelJournalSession(session(3), () => suspended).length, 0, 'no volume')
  assert.equal(labelJournalSession(session(3), () => barsFor().slice(0, 2)).length, 0, 'no T+2 close')
  assert.equal(labelJournalSession(session(3), () => undefined).length, 0, 'no bars at all')
})

test('the job labels a due session, advances the state and empties the journal', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'factor-evolve-'))
  try {
    await appendJournalSession(path.join(directory, '.dsh-x-finance'), session(12))
    const provider = { history: async () => ({ bars: barsFor() }) }
    const evolve = createFactorEvolve({
      profileDirectory: directory,
      provider: async () => provider as any,
      sourceEnabled: async () => true,
      now: () => NOW,
    })
    const status = await evolve.tick()
    assert.equal(status.labeled, 1)
    const state = await readFactorState(path.join(directory, '.dsh-x-finance'))
    assert.ok(state)
    assert.equal(state!.sessions, 1)
    assert.equal(state!.asOf, SESSION_DATE)
    const journal = await readFactorJournal(path.join(directory, '.dsh-x-finance'))
    assert.equal(journal!.sessions.length, 0)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('a session that is not old enough stays pending for the next pass', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'factor-evolve-'))
  try {
    await appendJournalSession(path.join(directory, '.dsh-x-finance'), session(12))
    const provider = { history: async () => ({ bars: barsFor() }) }
    const evolve = createFactorEvolve({
      profileDirectory: directory,
      provider: async () => provider as any,
      sourceEnabled: async () => true,
      // Same day as the signal: no T+2 exists yet, so nothing may be consumed.
      now: () => Date.parse('2026-01-05T08:00:00.000Z'),
    })
    await evolve.tick()
    assert.equal(await readFactorState(path.join(directory, '.dsh-x-finance')), null)
    assert.equal((await readFactorJournal(path.join(directory, '.dsh-x-finance')))!.sessions.length, 1)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('a disabled source does no work and makes no request', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'factor-evolve-'))
  try {
    await appendJournalSession(path.join(directory, '.dsh-x-finance'), session(12))
    let called = 0
    const evolve = createFactorEvolve({
      profileDirectory: directory,
      provider: async () => { called += 1; return undefined },
      sourceEnabled: async () => false,
      now: () => NOW,
    })
    await evolve.tick()
    assert.equal(called, 0)
    assert.equal((await readFactorJournal(path.join(directory, '.dsh-x-finance')))!.sessions.length, 1)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('the job scans once after the close and never before it', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'factor-evolve-'))
  try {
    const store = path.join(directory, '.dsh-x-finance')
    let clock = Date.parse('2026-01-05T01:00:00.000Z') // 09:00 Shanghai, before the close
    let scans = 0
    const evolve = createFactorEvolve({
      profileDirectory: directory,
      provider: async () => ({ history: async () => ({ bars: barsFor() }) } as any),
      sourceEnabled: async () => true,
      scan: async () => { scans += 1; await appendJournalSession(store, session(12)) },
      now: () => clock,
    })
    await evolve.tick()
    assert.equal(scans, 0, 'nothing may be collected during the session')

    clock = Date.parse('2026-01-05T09:00:00.000Z') // 17:00 Shanghai
    await evolve.tick()
    assert.equal(scans, 1)
    assert.equal((await readFactorJournal(store))!.sessions.length, 1)

    clock += 10 * 60_000
    await evolve.tick()
    assert.equal(scans, 1, 'the day is already journaled')
  } finally { await rm(directory, { recursive: true, force: true }) }
})
