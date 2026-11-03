/**
 * Per-session chain accounting.
 *
 * One record per `chain_run` call, folded into a small durable snapshot under
 * the profile directory. The page reads the same snapshot, so the numbers a
 * user sees are the numbers the tool reported — no re-derivation from logs and
 * no invented savings.
 *
 * @module dsh-x-chain/stats
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** One finished `chain_run` call. */
export interface ChainRecord {
  /** Session that ran the chain. */
  readonly sessionId: string
  /** Unix epoch milliseconds at settlement. */
  readonly at: number
  /** Steps that actually executed. */
  readonly executed: number
  /** Counterfactual model round trips saved, as the tool reported it. */
  readonly saved: number
  /** Why the chain stopped early, when it did. */
  readonly stopped?: 'guard' | 'error' | 'aborted'
  /** Tools the chain dispatched, in order. */
  readonly tools: readonly string[]
}

/** One session's folded counters. */
export interface SessionSummary {
  sessionId: string
  chains: number
  steps: number
  saved: number
  stopped: number
  lastAt: number
}

/** Everything the page renders. */
export interface StatsSnapshot {
  totals: {
    chains: number
    steps: number
    saved: number
    stopped: number
  }
  sessions: SessionSummary[]
  updatedAt: number
}

/** Options for {@link createStatsStore}. */
export interface StatsStoreOptions {
  /** Profile directory; the snapshot lives in `.dsh-x-chain/stats.json`. */
  profileDirectory?: string
  /** Clock override for tests. */
  now?: () => number
  /** Sessions kept in the snapshot, newest first. Defaults to 200. */
  maxSessions?: number
}

/** The durable store behind the tool and the page. */
export interface StatsStore {
  /** Fold one finished chain into the snapshot. */
  record(record: ChainRecord): void
  /** Current snapshot, newest session first. */
  snapshot(): StatsSnapshot
  /** Wait for the pending write, including the initial load. */
  flush(): Promise<void>
}

interface Persisted {
  version: 1
  sessions: Record<string, SessionSummary>
  updatedAt: number
}

const empty = (): Persisted => ({ version: 1, sessions: {}, updatedAt: 0 })

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readSummary(value: unknown): SessionSummary | undefined {
  if (!isRecord(value)) return undefined
  const numbers = ['chains', 'steps', 'saved', 'stopped', 'lastAt'] as const
  if (numbers.some(key => typeof value[key] !== 'number' || !Number.isFinite(value[key]))) return undefined
  if (typeof value.sessionId !== 'string') return undefined
  return {
    sessionId: value.sessionId,
    chains: value.chains as number,
    steps: value.steps as number,
    saved: value.saved as number,
    stopped: value.stopped as number,
    lastAt: value.lastAt as number,
  }
}

/** Fold one record into a session summary, creating it when absent. */
function fold(previous: SessionSummary | undefined, record: ChainRecord): SessionSummary {
  return {
    sessionId: record.sessionId,
    chains: (previous?.chains ?? 0) + 1,
    steps: (previous?.steps ?? 0) + record.executed,
    saved: (previous?.saved ?? 0) + record.saved,
    stopped: (previous?.stopped ?? 0) + (record.stopped === undefined ? 0 : 1),
    lastAt: Math.max(previous?.lastAt ?? 0, record.at),
  }
}

/**
 * Create the stats store.
 * @param options - profile directory, clock, and retention bound.
 * @returns the store the tool records into and the page reads.
 */
export function createStatsStore(options: StatsStoreOptions = {}): StatsStore {
  const now = options.now ?? Date.now
  const maxSessions = options.maxSessions ?? 200
  const directory = options.profileDirectory === undefined
    ? undefined
    : path.join(options.profileDirectory, '.dsh-x-chain')
  const file = directory === undefined ? undefined : path.join(directory, 'stats.json')

  let state: Persisted | undefined
  let loading: Promise<void> | undefined
  let writing: Promise<void> | undefined
  let dirty = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const pending: ChainRecord[] = []

  const apply = (record: ChainRecord): void => {
    if (state === undefined) return
    state.sessions[record.sessionId] = fold(state.sessions[record.sessionId], record)
    state.updatedAt = now()
    dirty = true
  }

  const trim = (): void => {
    if (state === undefined) return
    const entries = Object.entries(state.sessions)
    if (entries.length <= maxSessions) return
    entries.sort((a, b) => b[1].lastAt - a[1].lastAt)
    for (const [id] of entries.slice(maxSessions)) delete state.sessions[id]
  }

  const persist = async (): Promise<void> => {
    if (file === undefined || state === undefined) return
    trim()
    await mkdir(directory as string, { recursive: true })
    const temporary = `${file}.${process.pid}.tmp`
    await writeFile(temporary, JSON.stringify(state), 'utf8')
    await rename(temporary, file)
  }

  const schedule = (): void => {
    if (file === undefined) return
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      if (!dirty) return
      dirty = false
      writing = persist().catch(() => { dirty = true })
    }, 250)
    timer.unref?.()
  }

  const load = async (): Promise<void> => {
    let loaded = empty()
    if (file !== undefined) {
      try {
        const parsed: unknown = JSON.parse(await readFile(file, 'utf8'))
        if (isRecord(parsed) && isRecord(parsed.sessions)) {
          for (const [id, value] of Object.entries(parsed.sessions)) {
            const summary = readSummary(value)
            if (summary !== undefined && summary.sessionId === id) loaded.sessions[id] = summary
          }
          loaded.updatedAt = typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0
        }
      } catch { loaded = empty() }
    }
    state = loaded
    for (const record of pending.splice(0)) apply(record)
    if (dirty) schedule()
  }

  const ready = (): Promise<void> => (loading ??= load())

  return {
    record(record) {
      if (state === undefined) {
        pending.push(record)
        void ready()
        return
      }
      apply(record)
      schedule()
    },
    snapshot() {
      const byId = new Map(Object.entries(state?.sessions ?? {}))
      // Before the first load settles, the page must still see the chains that
      // already ran in this process: fold the queued records without writing.
      if (state === undefined) {
        for (const record of pending) byId.set(record.sessionId, fold(byId.get(record.sessionId), record))
      }
      const sessions = [...byId.values()].sort((a, b) => b.lastAt - a.lastAt)
      const totals = { chains: 0, steps: 0, saved: 0, stopped: 0 }
      for (const session of sessions) {
        totals.chains += session.chains
        totals.steps += session.steps
        totals.saved += session.saved
        totals.stopped += session.stopped
      }
      const updatedAt = state?.updatedAt ?? (pending.length === 0 ? 0 : Math.max(...pending.map(record => record.at)))
      return { totals, sessions, updatedAt }
    },
    async flush() {
      await ready()
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
      while (writing !== undefined) await writing
      if (dirty) await persist()
      dirty = false
    },
  }
}
