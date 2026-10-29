// Illustrative single-stock replay of the exact watchlist rules. This is not an
// execution simulator: daily prices cannot reveal locked price limits, queue
// position, tradability, minimum commissions, or corporate-action cashflows.
// All costs below are explicitly illustrative and are not current broker fees.
import { evaluateWatchSignal } from './watch-signals.ts'

export const WATCH_REPLAY_COMMISSION_BPS = 5
export const WATCH_REPLAY_SLIPPAGE_BPS = 5
export const WATCH_REPLAY_SELL_TAX_BPS = 5
export const WATCH_REPLAY_MIN_BARS = 121
const MAX_BARS = 5000

export interface WatchReplayTrade {
  entryDate: string
  exitDate: string
  entryOpen: number
  exitOpen: number
  netReturn: number
}
export interface WatchReplay {
  status: 'ready' | 'insufficient' | 'invalid'
  from: string | null
  to: string | null
  bars: number
  tradeCount: number
  trades: WatchReplayTrade[]
  open: boolean
  totalReturn: number | null
  buyHoldReturn: number | null
  maxDrawdown: number | null
}

const empty = (status: WatchReplay['status'], bars: number): WatchReplay => ({
  status, from: null, to: null, bars, tradeCount: 0, trades: [], open: false,
  totalReturn: null, buyHoldReturn: null, maxDrawdown: null,
})

/** Input must be one chronologically ordered, consistently adjusted daily series. */
export function replayWatchSignals(input: unknown): WatchReplay {
  if (!Array.isArray(input) || input.length > MAX_BARS) return empty('invalid', 0)
  const bars = input.slice()
  if (bars.length && bars.at(-1)?.isFinal === false) bars.pop()
  if (bars.length < WATCH_REPLAY_MIN_BARS) return empty('insufficient', bars.length)
  let previousDate = ''
  for (const bar of bars) {
    if (!bar || typeof bar !== 'object' || typeof bar.sessionDate !== 'string' || bar.sessionDate <= previousDate
      || bar.isFinal !== true || typeof bar.open !== 'number' || !Number.isFinite(bar.open) || bar.open <= 0
      || typeof bar.close !== 'number' || !Number.isFinite(bar.close) || bar.close <= 0) return empty('invalid', bars.length)
    previousDate = bar.sessionDate
  }
  // The signal engine validates dates, all closes, duplicate bars and flags.
  if (evaluateWatchSignal(bars).reason !== 'ok') return empty('invalid', bars.length)
  const commission = WATCH_REPLAY_COMMISSION_BPS / 10_000
  const slippage = WATCH_REPLAY_SLIPPAGE_BPS / 10_000
  const sellTax = WATCH_REPLAY_SELL_TAX_BPS / 10_000
  const start = 119
  let cash = 1, shares = 0, peak = 1, maxDrawdown = 0
  let open: { date: string; price: number; cashBefore: number } | null = null
  const trades: WatchReplayTrade[] = []
  for (let i = start; i < bars.length - 1; i++) {
    const current = bars[i]!, next = bars[i + 1]!
    const signal = evaluateWatchSignal(bars.slice(0, i + 1))
    if (signal.reason !== 'ok') return empty('invalid', bars.length)
    if (signal.status === 'buy' && !open) {
      const entryPrice = next.open * (1 + slippage)
      open = { date: next.sessionDate, price: next.open, cashBefore: cash }
      shares = cash / (entryPrice * (1 + commission))
      if (!Number.isFinite(shares) || shares <= 0) return empty('invalid', bars.length)
      cash = 0
    } else if (signal.status === 'sell' && open) {
      cash = shares * next.open * (1 - slippage) * (1 - commission - sellTax)
      if (!Number.isFinite(cash) || cash <= 0) return empty('invalid', bars.length)
      trades.push({
        entryDate: open.date, exitDate: next.sessionDate,
        entryOpen: open.price, exitOpen: next.open,
        netReturn: cash / open.cashBefore - 1,
      })
      open = null; shares = 0
    }
    const equity = open ? shares * next.close : cash
    if (!Number.isFinite(equity) || equity <= 0) return empty('invalid', bars.length)
    peak = Math.max(peak, equity)
    maxDrawdown = Math.min(maxDrawdown, equity / peak - 1)
  }
  const last = bars.at(-1)!
  const endingEquity = open ? shares * last.close : cash
  // Compare against buying once at the same first available open, with the
  // same illustrative buy costs, and marking the position at the last close.
  const buyHoldReturn = last.close / (bars[start + 1]!.open * (1 + slippage) * (1 + commission)) - 1
  if (!Number.isFinite(endingEquity) || !Number.isFinite(buyHoldReturn)) return empty('invalid', bars.length)
  return {
    status: 'ready', from: bars[start]!.sessionDate, to: last.sessionDate, bars: bars.length,
    tradeCount: trades.length, trades, open: open !== null,
    totalReturn: endingEquity - 1, buyHoldReturn,
    maxDrawdown,
  }
}
