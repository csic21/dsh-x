// Bounded, explicit-run watchlist research. The list stays in the browser; only
// individual symbol lookups and daily-history requests go to the opt-in source.
// No broker account, holding, trading instruction, model or disk is involved.
import { MARKET_ENDPOINT } from '../market.ts'
import type { MarketHistory } from '../market.ts'
import { SEARCH_RPC_ENDPOINT } from '../instrument-search.ts'
import { MAX_WATCHLIST, validateSymbol } from '../watchlist.ts'
import { evaluateWatchSignal } from '../watch-signals.ts'
import type { WatchSignal } from '../watch-signals.ts'
import { replayWatchSignals } from '../watch-signal-backtest.ts'
import type { WatchReplay } from '../watch-signal-backtest.ts'

export const WATCH_SIGNAL_CONCURRENCY = 2
export const WATCH_SIGNAL_PAUSE_MS = 1_000
export const WATCH_SIGNAL_FAILURE_LIMIT = 6
export const WATCH_SIGNAL_HISTORY_BARS = 250
export const WATCH_SIGNAL_MAX_AGE_DAYS = 7

export interface SignalWatchItem { symbol: string; alias: string }
export type WatchRowStatus = 'pending' | 'ready' | 'unavailable' | 'unknown-kind' | 'unsupported' | 'unadjusted' | 'stale' | 'skipped'
export interface WatchSignalRow {
  symbol: string
  alias: string
  name: string
  status: WatchRowStatus
  signal: WatchSignal | null
  replay: WatchReplay | null
  source: string | null
  fetchedAt: string | null
  adjustment: MarketHistory['adjustment'] | null
  pricePrecision: number | null
  /** A directory-name warning, not authoritative exchange status. */
  stWarning: boolean
}

const initial = (item: SignalWatchItem): WatchSignalRow => ({
  symbol: item.symbol, alias: item.alias, name: '', status: 'pending', signal: null, replay: null,
  source: null, fetchedAt: null, adjustment: null, pricePrecision: null, stWarning: false,
})

function checkedItems(input: readonly SignalWatchItem[]): SignalWatchItem[] {
  if (!Array.isArray(input) || input.length > MAX_WATCHLIST) throw new TypeError('invalid watchlist')
  const seen = new Set<string>()
  return input.map(item => {
    const symbol = validateSymbol(item?.symbol)
    if (seen.has(symbol)) throw new TypeError('duplicate symbol')
    seen.add(symbol)
    return { symbol, alias: typeof item.alias === 'string' ? item.alias.slice(0, 24) : '' }
  })
}

function ageDays(date: string, now: number): number | null {
  const value = Date.parse(`${date}T00:00:00+08:00`)
  if (!Number.isFinite(value) || !Number.isFinite(now) || value > now) return null
  return Math.floor((now - value) / 86_400_000)
}

function pause(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return }
    const timer = setTimeout(done, WATCH_SIGNAL_PAUSE_MS)
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason) }
    function done() { signal.removeEventListener('abort', abort); resolve() }
    signal.addEventListener('abort', abort, { once: true })
  })
}

/** Process all listed items at concurrency two; partial successes are observable. */
export async function scanWatchSignals(
  rpc: any,
  input: readonly SignalWatchItem[],
  options: { signal: AbortSignal; now?: () => number; onProgress?: (rows: WatchSignalRow[]) => void; wait?: (signal: AbortSignal) => Promise<void> },
): Promise<WatchSignalRow[]> {
  const items = checkedItems(input)
  const rows = items.map(initial)
  const { signal, onProgress, now = Date.now, wait = pause } = options
  const publish = () => { if (!signal.aborted) onProgress?.(rows.map(row => ({ ...row }))) }
  if (!rpc?.call) throw new TypeError('connection unavailable')
  signal.throwIfAborted()
  publish()
  let next = 0, consecutiveFailures = 0, stopped = false
  async function check(index: number): Promise<void> {
    const item = items[index]!
    const row = rows[index]!
    try {
      // The existing symbol directory is only a hint, not an exchange-verified
      // listing. Require an exact stock match so funds/ETFs are not silently
      // assigned stock-specific advice; do not guess from code prefixes.
      const directory = await rpc.call('/api', SEARCH_RPC_ENDPOINT, { action: 'search', query: item.symbol.slice(3) }, signal)
      signal.throwIfAborted()
      if (!directory?.ok || directory.value?.status !== 'ready' || !Array.isArray(directory.value?.results)) {
        row.status = 'unavailable'; return
      }
      const matches = directory.value.results.filter((entry: any) => entry?.symbol === item.symbol)
      if (matches.length !== 1) { row.status = 'unknown-kind'; return }
      const match = matches[0]
      if (typeof match.name !== 'string' || !match.name.trim()) { row.status = 'unknown-kind'; return }
      row.name = match.name.slice(0, 64)
      row.stWarning = /^(?:\*?ST|S\*ST)/i.test(row.name.trim())
      if (!['stock', 'etf', 'fund', 'reit'].includes(match.kind)) { row.status = 'unknown-kind'; return }
      if (match.kind !== 'stock') { row.status = 'unsupported'; return }
      const result = await rpc.call('/api', MARKET_ENDPOINT, {
        kind: 'history', symbol: item.symbol, adjustment: 'forward', limit: WATCH_SIGNAL_HISTORY_BARS,
      }, signal)
      signal.throwIfAborted()
      const history = result?.ok && result.value?.status === 'ready' ? result.value.history as MarketHistory : null
      if (!history || history.symbol !== item.symbol || !Array.isArray(history.bars) || !history.bars.length) {
        row.status = 'unavailable'; return
      }
      row.source = typeof history.source === 'string' ? history.source.slice(0, 64) : null
      row.fetchedAt = typeof history.fetchedAt === 'string' && Number.isFinite(Date.parse(history.fetchedAt)) ? history.fetchedAt : null
      row.adjustment = history.adjustment
      row.pricePrecision = Number.isInteger(history.pricePrecision) && history.pricePrecision >= 0 && history.pricePrecision <= 8
        ? history.pricePrecision : null
      // A requested forward-adjusted history may actually be unadjusted. Do not
      // make a directional signal across potentially unaccounted dividends or splits.
      if (history.adjustment !== 'forward') { row.status = 'unadjusted'; return }
      const evaluation = evaluateWatchSignal(history.bars)
      row.signal = evaluation
      if (evaluation.status === 'insufficient') { row.status = 'ready'; return }
      const age = evaluation.sessionDate ? ageDays(evaluation.sessionDate, now()) : null
      if (age === null || age > WATCH_SIGNAL_MAX_AGE_DAYS) { row.status = 'stale'; return }
      row.replay = replayWatchSignals(history.bars)
      row.status = 'ready'
    } catch {
      if (signal.aborted) return
      row.status = 'unavailable'
    } finally {
      if (!signal.aborted) {
        if (row.status === 'unavailable') {
          consecutiveFailures++
          if (consecutiveFailures >= WATCH_SIGNAL_FAILURE_LIMIT) stopped = true
        } else consecutiveFailures = 0
      }
      publish()
    }
  }
  async function worker() {
    while (!signal.aborted && !stopped && next < items.length) {
      const index = next++
      await check(index)
      if (!signal.aborted && !stopped && next < items.length) await wait(signal)
    }
  }
  await Promise.all(Array.from({ length: Math.min(WATCH_SIGNAL_CONCURRENCY, items.length) }, worker))
  signal.throwIfAborted()
  if (stopped) {
    for (const row of rows) if (row.status === 'pending') row.status = 'skipped'
    publish()
  }
  return rows.map(row => ({ ...row }))
}
