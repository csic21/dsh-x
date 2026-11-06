// The economic half of the limit-up relay screen: what could actually be
// bought, what the round trip cost, and what the trade earned.
//
// The old pipeline ranked names by P(next session closes limit-up) and charged
// a flat 0.2% cost against the next open. A name that opened *on* its limit was
// therefore booked as a fill at the limit price — the one fill a reader can
// never get. Ranking a probability and settling it as money is what made a
// 0.68-AUC model lose 99% of its capital; the ordering was never asked to
// predict the thing it was paid on.
//
// Everything here is pure: given bars and a cost model it returns the same
// numbers on every run, so a backtest and a live replay cannot disagree.

/** A daily bar, in the shape both the Host and the research script hold. */
export interface TradeBar {
  sessionDate: string
  open: number
  high: number
  low: number
  close: number
  volume: number | null
}

/**
 * Round-trip cost in basis points. Commission and transfer are charged on both
 * sides, stamp duty only on the sell. Slippage is not a constant: the closer
 * the open sits to the price limit, the less the printed open says about the
 * price a real order would have paid.
 */
export const TRADE_COST_BPS = Object.freeze({
  commission: 2.5,
  transfer: 0.1,
  stamp: 5,
  baseSlippage: 5,
  maxSlippage: 45,
})

/**
 * A forward-adjusted series never prints the exact limit price, so an open
 * this close to the limit is treated as sealed. 0.3pp matches the tolerance the
 * close-side limit test already uses: wide enough for adjustment rounding, far
 * too narrow to accept a 9.0% open on a 10% board.
 */
export const OPEN_LIMIT_TOLERANCE = 0.3

/** True when the whole session printed one price: no intraday fill exists. */
export function isOneWordBar(bar: TradeBar): boolean {
  if (!(bar.close > 0)) return false
  return bar.high - bar.low <= Math.max(1e-6, bar.close * 1e-4)
}

/**
 * Whether the next session's open could be bought. A board that opens on its
 * limit is excluded even when it later breaks: the queue at the limit is the
 * only fill available at that price, and it is not available to a reader who
 * sees the number after the fact.
 */
export function isBuyableOpen(bar: TradeBar, previousClose: number, rate: number): boolean {
  if (!(previousClose > 0) || !(bar.open > 0)) return false
  if (isOneWordBar(bar)) return false
  return (bar.open / previousClose - 1) * 100 < rate - OPEN_LIMIT_TOLERANCE
}

/**
 * Cost of one round trip in percent, given the gap the entry paid. The gap
 * itself is not a cost — the return is measured from the open, so the gap is
 * already excluded — but it measures how crowded the entry was, and that is
 * what slippage tracks.
 */
export function roundTripCostPercent(gapPercent: number, rate: number): number {
  const fixed = (2 * TRADE_COST_BPS.commission + TRADE_COST_BPS.stamp + 2 * TRADE_COST_BPS.transfer) / 100
  const span = Math.max(1, rate - 1)
  const share = Math.min(1, Math.max(0, (gapPercent - 1) / span))
  const slippage = TRADE_COST_BPS.baseSlippage
    + (TRADE_COST_BPS.maxSlippage - TRADE_COST_BPS.baseSlippage) * share * share
  return fixed + slippage / 100
}

/** Net percent return from a fill at `entryOpen` to an exit at `exitClose`. */
export function netReturnPercent(entryOpen: number, exitClose: number, costPercent: number): number | null {
  if (!(entryOpen > 0) || !(exitClose > 0) || !Number.isFinite(costPercent)) return null
  return (exitClose / entryOpen - 1) * 100 - costPercent
}

export interface EvaluatedRow {
  symbol: string
  sessionDate: string
  score: number
  /** Net percent return of the trade this row proposed. */
  netReturn: number
}

export interface RankingMetrics {
  days: number
  trades: number
  winRate: number
  avgNet: number
  total: number
  maxDrawdown: number
  /** Mean within-session Spearman correlation between score and net return. */
  ic: number
  /** ic divided by its own across-session deviation; the stability of the edge. */
  icIr: number
  /** Spearman correlation between score quintile and mean net return. */
  monotonicity: number
}

function averageRanks(values: readonly number[]): number[] {
  const order = values.map((value, index) => ({ value, index }))
    .sort((left, right) => left.value - right.value)
  const ranks = new Array<number>(values.length)
  for (let start = 0; start < order.length;) {
    let end = start + 1
    while (end < order.length && order[end]!.value === order[start]!.value) end++
    const rank = (start + end - 1) / 2
    for (let cursor = start; cursor < end; cursor++) ranks[order[cursor]!.index] = rank
    start = end
  }
  return ranks
}

function pearson(left: readonly number[], right: readonly number[]): number | null {
  const n = left.length
  if (n < 3 || n !== right.length) return null
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0
  for (let index = 0; index < n; index++) {
    const x = left[index]!, y = right[index]!
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y
  }
  const denominator = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy))
  return denominator > 0 ? (n * sxy - sx * sy) / denominator : null
}

function spearman(left: readonly number[], right: readonly number[]): number | null {
  if (left.length !== right.length || left.length < 3) return null
  return pearson(averageRanks(left), averageRanks(right))
}

function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

function mean(values: readonly number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

/**
 * Everything a ranking should be judged on: does the order agree with realised
 * net return (ic), is that agreement stable (icIr), does a higher score mean a
 * higher return (monotonicity), and does the equal-weight top-k actually keep
 * its capital after cost.
 */
export function evaluateRanking(rows: readonly EvaluatedRow[], k: number): RankingMetrics {
  const usable = rows.filter(row => Number.isFinite(row.score) && Number.isFinite(row.netReturn))
  const byDay = new Map<string, EvaluatedRow[]>()
  for (const row of usable) {
    const list = byDay.get(row.sessionDate) ?? []
    list.push(row)
    byDay.set(row.sessionDate, list)
  }
  const days = [...byDay.keys()].sort()
  const dailyIc: number[] = []
  const dailyNet: number[] = []
  let wins = 0
  let trades = 0
  let equity = 1
  let peak = 1
  let maxDrawdown = 0
  for (const day of days) {
    const dayRows = byDay.get(day)!
    const ic = spearman(dayRows.map(row => row.score), dayRows.map(row => row.netReturn))
    if (ic !== null) dailyIc.push(ic)
    const picks = dayRows.slice().sort((left, right) => right.score - left.score).slice(0, k)
    if (!picks.length) continue
    const net = mean(picks.map(row => row.netReturn))
    dailyNet.push(net)
    for (const row of picks) { trades += 1; if (row.netReturn > 0) wins += 1 }
    equity *= 1 + net / 100
    peak = Math.max(peak, equity)
    maxDrawdown = Math.min(maxDrawdown, equity / peak - 1)
  }
  // Quintiles need the pooled score distribution, not a per-day one: the screen
  // compares names across sessions of very different breadth.
  const quintiles = Array.from({ length: 5 }, () => [] as number[])
  const sorted = usable.slice().sort((left, right) => left.score - right.score)
  for (let index = 0; index < sorted.length; index++) {
    const bucket = Math.min(4, Math.floor(index * 5 / Math.max(1, sorted.length)))
    quintiles[bucket]!.push(sorted[index]!.netReturn)
  }
  const filled = quintiles
    .map((values, index) => ({ index, mean: mean(values) }))
    .filter(entry => quintiles[entry.index]!.length > 0)
  const monotonicity = filled.length >= 3
    ? spearman(filled.map(entry => entry.index), filled.map(entry => entry.mean)) ?? 0
    : 0
  const icMean = mean(dailyIc)
  const icDeviation = standardDeviation(dailyIc)
  return {
    days: dailyNet.length,
    trades,
    winRate: trades ? wins / trades * 100 : 0,
    avgNet: mean(dailyNet),
    total: (equity - 1) * 100,
    maxDrawdown: maxDrawdown * 100,
    ic: icMean,
    // A perfectly stable edge has zero across-session variance; reporting 0
    // there would read as "no edge", so the ratio is capped instead.
    icIr: icDeviation > 1e-9 ? icMean / icDeviation : Math.abs(icMean) > 1e-9 ? Math.sign(icMean) * 99 : 0,
    monotonicity,
  }
}
