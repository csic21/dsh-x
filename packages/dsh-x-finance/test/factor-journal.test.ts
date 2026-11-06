import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  FACTOR_JOURNAL_MAX_SESSIONS, appendJournalSession, emptyFactorJournal, parseFactorJournal, readFactorJournal,
  writeFactorJournal,
} from '../src/factor-journal.ts'
import type { JournalRow, JournalSession } from '../src/factor-journal.ts'

const row = (symbol: string, close = 10, rate = 10): JournalRow => ({
  symbol, close, rate, vector: { ret5: 1.5, streak: 1 },
})
const session = (date: string, count = 2): JournalSession => ({
  sessionDate: date,
  rows: Array.from({ length: count }, (_, index) => row(`SH.60000${index}`)),
})

test('a journal round-trips and stays ordered by session date', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'factor-journal-'))
  try {
    await appendJournalSession(directory, session('2026-01-06'))
    await appendJournalSession(directory, session('2026-01-05'))
    const journal = await readFactorJournal(directory)
    assert.deepEqual(journal!.sessions.map(entry => entry.sessionDate), ['2026-01-05', '2026-01-06'])
    assert.equal(journal!.sessions[0]!.rows[0]!.vector.ret5, 1.5)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('re-running a session replaces it instead of duplicating it', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'factor-journal-'))
  try {
    await appendJournalSession(directory, session('2026-01-05', 2))
    await appendJournalSession(directory, session('2026-01-05', 3))
    const journal = await readFactorJournal(directory)
    assert.equal(journal!.sessions.length, 1)
    assert.equal(journal!.sessions[0]!.rows.length, 3)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('the journal keeps only the newest bounded window of sessions', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'factor-journal-'))
  try {
    const start = Date.parse('2026-01-01T00:00:00Z')
    for (let index = 0; index < FACTOR_JOURNAL_MAX_SESSIONS + 5; index++) {
      const date = new Date(start + index * 86_400_000).toISOString().slice(0, 10)
      await appendJournalSession(directory, session(date, 1))
    }
    const journal = await readFactorJournal(directory)
    assert.equal(journal!.sessions.length, FACTOR_JOURNAL_MAX_SESSIONS)
    assert.ok(journal!.sessions.at(-1)!.sessionDate > journal!.sessions[0]!.sessionDate)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('a corrupt journal is refused and reads as absent', async () => {
  assert.deepEqual(parseFactorJournal(emptyFactorJournal()), emptyFactorJournal())
  const rejects = (mutate: (value: any) => void) => {
    const copy = JSON.parse(JSON.stringify({ version: 1, sessions: [session('2026-01-05')] }))
    mutate(copy)
    assert.throws(() => parseFactorJournal(copy), { code: 'finance/factor-journal-invalid' })
  }
  rejects(value => { value.extra = true })
  rejects(value => { value.sessions[0].rows[0].symbol = 'AAPL' })
  rejects(value => { value.sessions[0].rows[0].vector.ret5 = Number.NaN })
  rejects(value => { value.sessions[0].sessionDate = '2026-13-40' })
  rejects(value => { value.sessions = [session('2026-01-06'), session('2026-01-05')] })
})

test('a missing directory reads as an empty journal rather than throwing', async () => {
  assert.equal(await readFactorJournal('/nonexistent/factor-journal'), null)
  assert.equal(await readFactorJournal('relative/path'), null)
})

test('writes are visible to a second read and keep the rows intact', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'factor-journal-'))
  try {
    await writeFactorJournal(directory, { version: 1, sessions: [session('2026-01-05', 1)] })
    const first = await readFactorJournal(directory)
    const second = await readFactorJournal(directory)
    assert.deepEqual(first, second)
    assert.equal(first!.sessions[0]!.rows[0]!.rate, 10)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
