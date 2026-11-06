// The in-process daily job: turn yesterday's journal into today's correction.
//
// It runs while the Host is open, once every half hour, and only ever does work
// that is due. A finished scan writes the journal; this job labels those
// sessions once the T+1 open and the T+2 close exist, folds them into the factor
// state, and writes the state back. If the Host was closed for a week, the
// journal still holds the sessions it saw and the job catches up on the next
// start — it never invents the days it missed, and it never needs a second data
// source.
import { readFactorState, writeFactorState } from './factor-state-store.ts'
import { readFactorJournal, writeFactorJournal } from './factor-journal.ts'
import { FACTOR_MIN_ROWS, updateFactorState } from './factor-state.ts'
import type { FactorObservation } from './factor-state.ts'
import type { MarketDailyBar, MarketProvider } from './market.ts'
import { shanghaiToday } from './market.ts'
import { PREDICT_MODEL } from './predict-model.ts'
import { isBuyableOpen, netReturnPercent, roundTripCostPercent } from './trade.ts'
import { profileStoreDirectory } from './store-path.ts'
import type { JournalSession } from './factor-journal.ts'

/** The Host ticks more often than the journal can change; this throttles the work. */
export const FACTOR_EVOLVE_MIN_INTERVAL_MS = 5 * 60_000
/** The close is at 15:00; 16:45 leaves room for the free source to settle. */
export const FACTOR_SCAN_AFTER_MINUTES = 16 * 60 + 45
/** A failed collection waits this long before its second attempt. */
export const FACTOR_SCAN_RETRY_MS = 45 * 60_000
/** A session needs its T+2 close; four calendar days covers a weekend. */
export const FACTOR_LABEL_AFTER_DAYS = 4
/** A session that still has no usable bars after this long is dropped. */
export const FACTOR_LABEL_GIVE_UP_DAYS = 12
export const FACTOR_LABEL_MAX_SESSIONS = 2
export const FACTOR_LABEL_MAX_REQUESTS = 120
const CONCURRENCY = 4

export interface FactorEvolveState {
  running: boolean
  lastRunAt: number | null
  labeled: number
  pending: number
  error: string | null
}

export interface FactorEvolveOptions {
  profileDirectory: string
  provider: () => Promise<MarketProvider | undefined>
  sourceEnabled: () => Promise<boolean>
  /**
   * Runs one predict scan so the day's candidates reach the journal. The job
   * only calls it after the close and only when the day is still missing:
   * collection has to be automatic, or the loop waits for a human click.
   */
  scan?: () => Promise<void>
  now?: () => number
  maxSessions?: number
  maxRequests?: number
}

export interface FactorEvolve {
  tick(): Promise<FactorEvolveState>
  state(): FactorEvolveState
  dispose(): void
}

const days = 86_400_000

function shanghaiClock(time: number) {
  const shifted = new Date(time + 8 * 3_600_000)
  return {
    date: shifted.toISOString().slice(0, 10),
    weekday: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  }
}

/** The only bar fields a label needs; `MarketDailyBar` satisfies this. */
export interface LabelBar {
  sessionDate: string
  open: number
  high: number
  low: number
  close: number
  volume: number | null
}

function limitUp(bar: LabelBar, previousClose: number, rate: number): boolean {
  if (!(previousClose > 0) || !(bar.close > 0)) return false
  const change = (bar.close / previousClose - 1) * 100
  return change >= rate - 0.4 && bar.high - bar.close <= Math.max(1e-6, bar.close * 1e-4)
}

/**
 * Turns one journal session into labelled observations. A row whose entry open
 * was sealed, or whose bars do not reach the exit, is dropped rather than
 * guessed — the state is only allowed to learn from trades that existed.
 */
export function labelJournalSession(
  session: JournalSession,
  barsOf: (symbol: string) => LabelBar[] | undefined,
): FactorObservation[] {
  const observations: FactorObservation[] = []
  for (const row of session.rows) {
    const bars = barsOf(row.symbol)
    if (!bars?.length) continue
    const index = bars.findIndex(bar => bar.sessionDate === session.sessionDate)
    if (index < 0) continue
    const today = bars[index]!
    const next = bars[index + 1]
    const after = bars[index + 2]
    if (!next || !after) continue
    if (!(next.volume && next.volume > 0) || !(after.volume && after.volume > 0)) continue
    if (!isBuyableOpen(next, today.close, row.rate)) continue
    const gap = (next.open / today.close - 1) * 100
    const net = netReturnPercent(next.open, after.close, roundTripCostPercent(gap, row.rate))
    if (net === null) continue
    observations.push({
      vector: row.vector,
      netReturn: net,
      label: limitUp(next, today.close, row.rate) ? 1 : 0,
    })
  }
  return observations
}

export function createFactorEvolve(options: FactorEvolveOptions): FactorEvolve {
  const now = options.now ?? Date.now
  const maxSessions = options.maxSessions ?? FACTOR_LABEL_MAX_SESSIONS
  const maxRequests = options.maxRequests ?? FACTOR_LABEL_MAX_REQUESTS
  let current: FactorEvolveState = { running: false, lastRunAt: null, labeled: 0, pending: 0, error: null }
  let running: Promise<FactorEvolveState> | null = null
  let disposed = false
  let scanDay = ''
  let scanAttempts = 0
  let scanAt = 0

  /**
   * One scan per trading day, after the close. Two attempts at most, spaced
   * out: a holiday has no final bar for today, and the job must not spend the
   * budget retrying a day that will never produce one.
   */
  async function collect(directory: string, journal: Awaited<ReturnType<typeof readFactorJournal>>): Promise<boolean> {
    if (!options.scan) return false
    const clock = shanghaiClock(now())
    if (clock.weekday < 1 || clock.weekday > 5 || clock.minutes < FACTOR_SCAN_AFTER_MINUTES) return false
    if (scanDay !== clock.date) { scanDay = clock.date; scanAttempts = 0; scanAt = 0 }
    if (scanAttempts >= 2) return false
    if (scanAt && now() - scanAt < FACTOR_SCAN_RETRY_MS) return false
    if (journal?.sessions.some(session => session.sessionDate === clock.date)) return false
    scanAttempts += 1
    scanAt = now()
    try {
      await options.scan()
      return true
    } catch {
      return false
    }
  }

  async function run(): Promise<FactorEvolveState> {
    try {
      if (!(await options.sourceEnabled())) return current
      const provider = await options.provider()
      if (!provider?.history) return current
      const directory = await profileStoreDirectory(options.profileDirectory)
      let journal = await readFactorJournal(directory)
      if (await collect(directory, journal)) journal = await readFactorJournal(directory)
      if (!journal?.sessions.length) return current

      const today = shanghaiToday(now())
      const due = journal.sessions.filter(session => {
        const age = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${session.sessionDate}T00:00:00Z`)) / days)
        return age >= FACTOR_LABEL_AFTER_DAYS
      })
      current = { ...current, pending: journal.sessions.length, error: null }
      if (!due.length) return current

      const state = await readFactorState(directory)
      let next = state
      const consumed = new Set<string>()
      for (const session of due.slice(0, maxSessions)) {
        const rows = session.rows.slice(0, maxRequests)
        const bars = new Map<string, MarketDailyBar[]>()
        await pool(rows, CONCURRENCY, async row => {
          try {
            const history = await provider.history!(row.symbol, { adjustment: 'forward', limit: 20 })
            if (history.bars.length) bars.set(row.symbol, history.bars)
          } catch { /* a missing symbol is one lost row, not a lost day */ }
        })
        const observations = labelJournalSession({ sessionDate: session.sessionDate, rows }, symbol => bars.get(symbol))
        if (observations.length >= FACTOR_MIN_ROWS) {
          next = updateFactorState(next, PREDICT_MODEL.features, [{
            sessionDate: session.sessionDate,
            rows: observations,
          }], {
            intercept: PREDICT_MODEL.limitUp.intercept,
            coef: PREDICT_MODEL.limitUp.coef,
            buckets: {
              streak: PREDICT_MODEL.baseRates.streak,
              regime: PREDICT_MODEL.baseRates.sentiment,
            },
          })
          current = { ...current, labeled: current.labeled + 1 }
        }
        // An old session with no usable bars is dropped so it cannot retry
        // forever; a recent one stays for another pass.
        const age = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${session.sessionDate}T00:00:00Z`)) / days)
        if (observations.length >= FACTOR_MIN_ROWS || age >= FACTOR_LABEL_GIVE_UP_DAYS) consumed.add(session.sessionDate)
      }

      if (next && next !== state) await writeFactorState(directory, next)
      if (consumed.size) {
        const remaining = journal.sessions.filter(session => !consumed.has(session.sessionDate))
        await writeFactorJournal(directory, { version: 1, sessions: remaining })
      }
      current = { ...current, pending: journal.sessions.length - consumed.size }
      return current
    } catch (error: any) {
      current = { ...current, error: typeof error?.message === 'string' ? error.message.slice(0, 120) : 'failed' }
      return current
    } finally {
      current = { ...current, lastRunAt: now() }
    }
  }

  return {
    state: () => ({ ...current }),
    tick: () => {
      if (disposed) return Promise.resolve({ ...current })
      if (running) return running
      if (current.lastRunAt !== null && now() - current.lastRunAt < FACTOR_EVOLVE_MIN_INTERVAL_MS) {
        return Promise.resolve({ ...current })
      }
      current = { ...current, running: true }
      running = run().finally(() => {
        current = { ...current, running: false }
        running = null
      })
      return running
    },
    dispose() { disposed = true },
  }
}

async function pool<T>(items: readonly T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      await worker(items[index]!)
    }
  })
  await Promise.all(runners)
}
