// Deterministic, local scoring for a market-wide "hot topic" screen.
//
// Every number is computed from a snapshot the Host already fetched (the
// Tencent ranking feed) plus, for a bounded candidate set, daily bars from the
// same provider. Nothing here fetches, persists, predicts or recommends: a hit
// says "this rule matched today", not "buy this".
//
// The registry is split in two layers on purpose. Snapshot rules run over the
// whole market (one paged rank scan); history rules need daily bars, so they
// only run over the highest-scoring snapshot candidates. The result reports
// how many symbols actually received the history layer instead of implying
// that all rules ran on all symbols.
export interface HotBar {
  sessionDate: string
  open: number
  high: number
  low: number
  close: number
  volume: number | null
}

/** Bumped when a rule changes meaning, so a cached run is never mixed with a newer registry. */
export const HOT_STRATEGY_VERSION = 1
/** Results returned to the browser. */
export const HOT_MAX_RESULTS = 60
/** Snapshot-ranked candidates that also receive the history layer. */
export const HOT_HISTORY_DEPTH = 120
/** Daily bars requested per candidate. */
export const HOT_HISTORY_BARS = 80
/** A scan result may be reused by the Host for this long. */
export const HOT_SCAN_TTL_MS = 20_000
/** Snapshot rows may be reused by the Host for this long. */
export const HOT_ROWS_TTL_MS = 60_000
/**
 * A weak rule alone is not a "hit": at least one matched strategy must carry
 * this weight. Otherwise one broad condition (e.g. any main inflow, or a 3%
 * move) would mark most of the market as a match and the headline count would
 * mean nothing. Weight-1 rules still add score and tags.
 */
export const HOT_MIN_WEIGHT = 2
/** Defensive ceiling for one paged snapshot scan. */
export const HOT_MAX_STOCKS = 12_000
export const HOT_MAX_SCAN_MS = 300_000

export type HotBoard = 'main' | 'star' | 'chinext' | 'bse'

export type HotCategory = 'heat' | 'volume' | 'trend' | 'capital' | 'structure'

export interface HotSnapshot {
  /** Exchange-qualified symbol, e.g. `SH.600519`. */
  symbol: string
  name: string
  price: number
  /** Percent, e.g. 7.37 for +7.37%. */
  changePercent: number
  /** Turnover rate in percent, when the source reports it. */
  turnoverRate: number | null
  /** The source's daily volume ratio (量比). */
  volumeRatio: number | null
  /** Price speed today in percent. */
  speed: number | null
  /** Intraday amplitude in percent. */
  amplitude: number | null
  /** Turnover in CNY. */
  amount: number
  /** Free-float market capitalisation in CNY. */
  floatCap: number | null
  /** Total market capitalisation in CNY. */
  totalCap: number | null
  /** Main-force net inflow in CNY. */
  mainInflow: number | null
  change5d: number | null
  change10d: number | null
  change20d: number | null
  change60d: number | null
  board: HotBoard
  suspended: boolean
}

export interface HotHistoryContext {
  /** Null when the history layer did not run for this symbol. */
  bars: HotBar[] | null
}

export interface HotStrategy {
  id: string
  category: HotCategory
  /** Relative importance inside the composite score. */
  weight: number
  layer: 'snapshot' | 'history'
  test: (snapshot: HotSnapshot, context: HotHistoryContext) => boolean
}

export interface HotHit {
  symbol: string
  name: string
  price: number
  changePercent: number
  amount: number
  turnoverRate: number | null
  volumeRatio: number | null
  /** 0–100, relative to the strongest stock in the same run. */
  score: number
  /** Matched strategy ids, in registry order. */
  hits: string[]
}

export interface HotUniverse {
  expected: number
  covered: number
  /** Symbols that received the snapshot layer. */
  scanned: number
  /** Symbols that also received the history layer. */
  historyChecked: number
  historyFailed: number
  partial: boolean
}

export interface HotScanResult {
  source: string
  fetchedAt: string
  durationMs: number
  strategyCount: number
  /** Present when the scan was limited to one industry board. */
  board: { code: string; name: string } | null
  universe: HotUniverse
  /** Every symbol that matched at least one strategy, not only the rows returned. */
  hitCount: number
  hits: HotHit[]
}

function mean(values: number[], count: number, offset = 0): number | null {
  const end = values.length - offset
  if (end < count || count <= 0) return null
  let total = 0
  for (let index = end - count; index < end; index++) total += values[index]!
  return total / count
}

function last<T>(values: T[]): T | null {
  return values.length ? values[values.length - 1]! : null
}

function prev<T>(values: T[], offset = 1): T | null {
  const index = values.length - 1 - offset
  return index >= 0 ? values[index]! : null
}

function emaSeries(values: number[], period: number): number[] {
  const factor = 2 / (period + 1)
  const result: number[] = []
  for (let index = 0; index < values.length; index++) {
    result.push(index === 0 ? values[0]! : values[index]! * factor + result[index - 1]! * (1 - factor))
  }
  return result
}

/**
 * The price limit in percent for the current session. New listings (`N`/`C`)
 * have no reliable limit, so a limit rule stays silent for them instead of
 * guessing. ST names move 5% on the main board and 20% on ChiNext/STAR.
 */
export function limitPercent(snapshot: HotSnapshot): number | null {
  if (/^[NC]/.test(snapshot.name) || /^退市/.test(snapshot.name)) return null
  const st = /^(?:\*?ST|S\*ST)/i.test(snapshot.name)
  if (snapshot.board === 'bse') return 30
  if (snapshot.board === 'star' || snapshot.board === 'chinext') return 20
  return st ? 5 : 10
}

export function isLimitUp(snapshot: HotSnapshot): boolean {
  const limit = limitPercent(snapshot)
  return limit !== null && snapshot.changePercent >= limit - 0.3
}

function bollinger(closes: number[]): { mid: number; upper: number; lower: number } | null {
  const mid = mean(closes, 20)
  if (mid === null) return null
  let variance = 0
  for (let index = closes.length - 20; index < closes.length; index++) {
    const delta = closes[index]! - mid
    variance += delta * delta
  }
  const deviation = Math.sqrt(variance / 20)
  return { mid, upper: mid + 2 * deviation, lower: mid - 2 * deviation }
}

function macd(closes: number[]): { dif: number; dea: number; prevDif: number; prevDea: number } | null {
  if (closes.length < 35) return null
  const fast = emaSeries(closes, 12)
  const slow = emaSeries(closes, 26)
  const dif = fast.map((value, index) => value - slow[index]!)
  const dea = emaSeries(dif, 9)
  return {
    dif: dif[dif.length - 1]!,
    prevDif: dif[dif.length - 2]!,
    dea: dea[dea.length - 1]!,
    prevDea: dea[dea.length - 2]!,
  }
}

/** Wilder's RSI over the whole series; the last value is returned. */
function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null
  let gain = 0
  let loss = 0
  for (let index = 1; index <= period; index++) {
    const delta = closes[index]! - closes[index - 1]!
    if (delta >= 0) gain += delta
    else loss -= delta
  }
  let averageGain = gain / period
  let averageLoss = loss / period
  for (let index = period + 1; index < closes.length; index++) {
    const delta = closes[index]! - closes[index - 1]!
    averageGain = (averageGain * (period - 1) + Math.max(delta, 0)) / period
    averageLoss = (averageLoss * (period - 1) + Math.max(-delta, 0)) / period
  }
  if (averageLoss === 0) return 100
  const strength = averageGain / averageLoss
  return 100 - 100 / (1 + strength)
}

function highest(values: number[], count: number, offset = 0): number | null {
  const end = values.length - offset
  if (end < count || count <= 0) return null
  let max = -Infinity
  for (let index = end - count; index < end; index++) max = Math.max(max, values[index]!)
  return max
}

/** Consecutive limit-up sessions ending at the latest bar (capped at 10). */
export function limitStreak(bars: HotBar[], limit: number | null): number {
  if (limit === null) return 0
  let streak = 0
  for (let index = bars.length - 1; index > 0 && streak < 10; index--) {
    const current = bars[index]!
    const previous = bars[index - 1]!
    if (current.volume !== null && current.volume <= 0) break
    const change = (current.close / previous.close - 1) * 100
    if (change >= limit - 0.3) streak += 1
    else break
  }
  return streak
}

function historyHits(snapshot: HotSnapshot, bars: HotBar[]): Set<string> {
  const result = new Set<string>()
  const closes = bars.map(bar => bar.close)
  const highs = bars.map(bar => bar.high)
  const volumes = bars.map(bar => bar.volume ?? 0)
  const close = last(closes)
  const previousClose = prev(closes)
  const volume = last(volumes)
  const volumeMa5 = mean(volumes, 5)
  const ma5 = mean(closes, 5)
  const ma10 = mean(closes, 10)
  const ma20 = mean(closes, 20)
  const prevMa5 = mean(closes, 5, 1)
  const prevMa10 = mean(closes, 10, 1)
  const limit = limitPercent(snapshot)

  if (close !== null && ma20 !== null && close > ma20) result.add('above-ma20')
  if (ma5 !== null && ma10 !== null && ma20 !== null && ma5 > ma10 && ma10 > ma20) result.add('ma-bull')
  if (ma5 !== null && ma10 !== null && prevMa5 !== null && prevMa10 !== null && prevMa5 <= prevMa10 && ma5 > ma10) {
    result.add('ma5-cross-ma10')
  }

  const band = bollinger(closes)
  if (band && close !== null && close > band.upper) result.add('boll-break')

  const trend = macd(closes)
  if (trend) {
    if (trend.dif > trend.dea) result.add('macd-bull')
    if (trend.prevDif <= trend.prevDea && trend.dif > trend.dea) result.add('macd-golden')
  }

  const strength = rsi(closes)
  if (strength !== null && strength >= 60) result.add('rsi-strong')
  if (strength !== null && strength >= 75) result.add('rsi-overbought')

  const high20 = highest(highs, 20, 1)
  const high60 = highest(highs, 60, 1)
  if (close !== null && high20 !== null && close > high20) result.add('break-20d')
  if (close !== null && high60 !== null && close >= high60) result.add('break-60d')

  if (close !== null && high20 !== null && volume !== null && volumeMa5 !== null) {
    if (close > high20 && volume >= volumeMa5 * 1.5) result.add('volume-breakout')
  }

  const oldest = prev(volumes, 2)
  const middle = prev(volumes, 1)
  if (volume !== null && middle !== null && oldest !== null && volumeMa5 !== null) {
    if (volume > middle && middle > oldest && volume >= volumeMa5 * 1.1) result.add('vol-expand-3')
  }

  const lastBar = last(bars)
  if (lastBar && volume !== null && volumeMa5 !== null
    && lastBar.close > lastBar.open && volume >= volumeMa5 * 1.3) {
    result.add('bull-candle')
  }

  if (close !== null && previousClose !== null && ma10 !== null && volume !== null && volumeMa5 !== null) {
    if (close > ma10 && close < previousClose && volume <= volumeMa5 * 0.7) result.add('pullback-shrink')
  }

  const streak = limitStreak(bars, limit)
  if (streak >= 2) result.add('limit-streak')
  if (streak === 1) result.add('limit-first')

  return result
}

/**
 * The strategy registry. Order is the tag order shown in the UI, so rules are
 * grouped by what a reader would look for: heat, volume, trend, capital.
 */
export const HOT_STRATEGIES: readonly HotStrategy[] = [
  { id: 'limit-up', category: 'heat', weight: 3, layer: 'snapshot', test: (snapshot) => isLimitUp(snapshot) },
  { id: 'surge-7', category: 'heat', weight: 2, layer: 'snapshot', test: (snapshot) => snapshot.changePercent >= 7 },
  { id: 'surge-3', category: 'heat', weight: 1, layer: 'snapshot', test: (snapshot) => snapshot.changePercent >= 3 },
  { id: 'volume-ratio-2', category: 'volume', weight: 2, layer: 'snapshot', test: (snapshot) => (snapshot.volumeRatio ?? 0) >= 2 },
  { id: 'volume-ratio-1-5', category: 'volume', weight: 1, layer: 'snapshot', test: (snapshot) => (snapshot.volumeRatio ?? 0) >= 1.5 },
  { id: 'turnover-10', category: 'volume', weight: 2, layer: 'snapshot', test: (snapshot) => (snapshot.turnoverRate ?? 0) >= 10 },
  { id: 'turnover-5', category: 'volume', weight: 1, layer: 'snapshot', test: (snapshot) => (snapshot.turnoverRate ?? 0) >= 5 },
  { id: 'turnover-3', category: 'volume', weight: 1, layer: 'snapshot', test: (snapshot) => (snapshot.turnoverRate ?? 0) >= 3 },
  { id: 'amount-10e', category: 'capital', weight: 2, layer: 'snapshot', test: (snapshot) => snapshot.amount >= 1e9 },
  { id: 'amount-3e', category: 'capital', weight: 1, layer: 'snapshot', test: (snapshot) => snapshot.amount >= 3e8 },
  { id: 'main-inflow', category: 'capital', weight: 1, layer: 'snapshot', test: (snapshot) => (snapshot.mainInflow ?? 0) > 0 },
  { id: 'main-inflow-strong', category: 'capital', weight: 2, layer: 'snapshot', test: (snapshot) => (snapshot.mainInflow ?? 0) >= 1e8 },
  { id: 'speed-up', category: 'heat', weight: 1, layer: 'snapshot', test: (snapshot) => (snapshot.speed ?? 0) >= 0.5 },
  { id: 'amplitude-8', category: 'heat', weight: 1, layer: 'snapshot', test: (snapshot) => (snapshot.amplitude ?? 0) >= 8 },
  { id: 'strong-5d', category: 'trend', weight: 1, layer: 'snapshot', test: (snapshot) => (snapshot.change5d ?? 0) >= 15 },
  { id: 'strong-20d', category: 'trend', weight: 2, layer: 'snapshot', test: (snapshot) => (snapshot.change20d ?? 0) >= 30 },
  { id: 'turnover-15', category: 'volume', weight: 2, layer: 'snapshot', test: (snapshot) => (snapshot.turnoverRate ?? 0) >= 15 },
  { id: 'amount-20e', category: 'capital', weight: 2, layer: 'snapshot', test: (snapshot) => snapshot.amount >= 2e9 },
  {
    id: 'near-limit',
    category: 'heat',
    weight: 2,
    layer: 'snapshot',
    test: (snapshot) => {
      const limit = limitPercent(snapshot)
      return limit !== null && snapshot.changePercent >= limit - 2 && snapshot.changePercent < limit - 0.3
    },
  },
  { id: 'boll-break', category: 'trend', weight: 2, layer: 'history', test: () => false },
  { id: 'macd-golden', category: 'trend', weight: 2, layer: 'history', test: () => false },
  { id: 'macd-bull', category: 'trend', weight: 1, layer: 'history', test: () => false },
  { id: 'ma-bull', category: 'trend', weight: 2, layer: 'history', test: () => false },
  { id: 'above-ma20', category: 'trend', weight: 1, layer: 'history', test: () => false },
  { id: 'volume-breakout', category: 'volume', weight: 2, layer: 'history', test: () => false },
  { id: 'break-20d', category: 'trend', weight: 2, layer: 'history', test: () => false },
  { id: 'break-60d', category: 'structure', weight: 3, layer: 'history', test: () => false },
  { id: 'rsi-strong', category: 'trend', weight: 1, layer: 'history', test: () => false },
  { id: 'rsi-overbought', category: 'heat', weight: 1, layer: 'history', test: () => false },
  { id: 'vol-expand-3', category: 'volume', weight: 1, layer: 'history', test: () => false },
  { id: 'pullback-shrink', category: 'structure', weight: 1, layer: 'history', test: () => false },
  { id: 'bull-candle', category: 'volume', weight: 1, layer: 'history', test: () => false },
  { id: 'ma5-cross-ma10', category: 'trend', weight: 1, layer: 'history', test: () => false },
  { id: 'limit-streak', category: 'heat', weight: 3, layer: 'history', test: () => false },
  { id: 'limit-first', category: 'heat', weight: 2, layer: 'history', test: () => false },
] as const

export const HOT_STRATEGY_COUNT = HOT_STRATEGIES.length

const STRATEGY_BY_ID = new Map(HOT_STRATEGIES.map(strategy => [strategy.id, strategy]))

export function hotStrategy(id: string): HotStrategy | undefined {
  return STRATEGY_BY_ID.get(id)
}

/**
 * Runs the registry against one symbol. Snapshot rules always run; history
 * rules only run when bars were actually fetched for this symbol.
 */
export function hotHits(snapshot: HotSnapshot, bars: HotBar[] | null): string[] {
  const history = bars && bars.length >= 21 ? historyHits(snapshot, bars) : null
  const result: string[] = []
  for (const strategy of HOT_STRATEGIES) {
    if (strategy.layer === 'history') {
      if (history && history.has(strategy.id)) result.push(strategy.id)
      continue
    }
    if (strategy.test(snapshot, { bars })) result.push(strategy.id)
  }
  return result
}

/** True when at least one matched rule is strong enough to count as a hit. */
export function hotQualifies(hits: readonly string[]): boolean {
  return hits.some(id => (STRATEGY_BY_ID.get(id)?.weight ?? 0) >= HOT_MIN_WEIGHT)
}

export function hotWeight(hits: readonly string[]): number {
  let weight = 0
  for (const id of hits) weight += STRATEGY_BY_ID.get(id)?.weight ?? 0
  return weight
}

/**
 * Normalises each hit list against the strongest list in the same run, so the
 * top stock is 100 and the rest are comparable within this run only. The UI
 * must not present the number as an absolute quality measure.
 */
export function hotScores(weights: readonly number[]): number[] {
  const max = weights.length ? Math.max(...weights) : 0
  return weights.map(weight => max > 0 ? Math.round((weight / max) * 10_000) / 100 : 0)
}

/** Sorts by score, then today's move, then symbol: deterministic for equal scores. */
export function sortHotHits(hits: HotHit[]): HotHit[] {
  return hits.slice().sort((left, right) =>
    right.score - left.score
    || right.changePercent - left.changePercent
    || left.symbol.localeCompare(right.symbol))
}

/** Bounds and validates a scan result before it leaves the Host. */
export function projectHotScan(raw: unknown, now: number): HotScanResult {
  const fail = () => Object.assign(new Error('hot scan unavailable'), { code: 'finance/hot-scan-invalid' })
  const value = raw as Record<string, any>
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail()

  const finite = (input: unknown, min: number, max: number): number | null =>
    typeof input === 'number' && Number.isFinite(input) && input >= min && input <= max ? input : null
  const text = (input: unknown, max: number): string | null =>
    typeof input === 'string' && input.trim() && input.length <= max
      ? input.replace(/[\u0000-\u001f\u007f]/g, '').trim() : null

  const source = text(value.source, 64)
  const fetchedAt = text(value.fetchedAt, 40)
  const duration = finite(value.durationMs, 0, HOT_MAX_SCAN_MS)
  const strategyCount = finite(value.strategyCount, 1, 200)
  if (!source || !fetchedAt || !Number.isFinite(Date.parse(fetchedAt)) || duration === null || strategyCount === null) throw fail()

  const universe = value.universe
  if (!universe || typeof universe !== 'object') throw fail()
  const expected = finite(universe.expected, 0, HOT_MAX_STOCKS)
  const covered = finite(universe.covered, 0, HOT_MAX_STOCKS)
  const scanned = finite(universe.scanned, 0, HOT_MAX_STOCKS)
  const historyChecked = finite(universe.historyChecked, 0, HOT_MAX_STOCKS)
  const historyFailed = finite(universe.historyFailed, 0, HOT_MAX_STOCKS)
  if (expected === null || covered === null || scanned === null || historyChecked === null || historyFailed === null) throw fail()
  if (scanned > covered || covered > expected || historyChecked > scanned) throw fail()

  let board: HotScanResult['board'] = null
  if (value.board !== null && value.board !== undefined) {
    const code = text(value.board.code, 8)
    const name = text(value.board.name, 32)
    if (!code || !name || !/^801\d{3}$/.test(code)) throw fail()
    board = { code, name }
  }

  const hitCount = finite(value.hitCount, 0, HOT_MAX_STOCKS)
  if (hitCount === null) throw fail()
  const rows = Array.isArray(value.hits) ? value.hits.slice(0, HOT_MAX_RESULTS) : []
  if (!Array.isArray(value.hits)) throw fail()
  const hits: HotHit[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw fail()
    const symbol = text(row.symbol, 12)
    const name = text(row.name, 64)
    const price = finite(row.price, 0.0001, 1e9)
    const changePercent = finite(row.changePercent, -100, 100)
    const amount = finite(row.amount, 0, 1e15)
    const turnoverRate = row.turnoverRate === null ? null : finite(row.turnoverRate, 0, 100)
    const volumeRatio = row.volumeRatio === null ? null : finite(row.volumeRatio, 0, 1000)
    const score = finite(row.score, 0, 100)
    if (!symbol || !/^(SH|SZ|BJ)\.\d{6}$/.test(symbol) || !name) throw fail()
    if (price === null || changePercent === null || amount === null || score === null) throw fail()
    if (!Array.isArray(row.hits) || row.hits.length > HOT_STRATEGY_COUNT) throw fail()
    const ids: string[] = []
    for (const id of row.hits) {
      const strategy = typeof id === 'string' ? STRATEGY_BY_ID.get(id) : undefined
      if (!strategy || ids.includes(strategy.id)) continue
      ids.push(strategy.id)
    }
    if (!ids.length) continue
    hits.push({ symbol, name, price, changePercent, amount, turnoverRate, volumeRatio, score, hits: ids })
  }

  return {
    source,
    fetchedAt: new Date(now).toISOString(),
    durationMs: Math.round(duration),
    strategyCount: Math.round(strategyCount),
    board,
    universe: {
      expected, covered, scanned, historyChecked, historyFailed,
      partial: universe.partial === true || historyFailed > 0,
    },
    hitCount: Math.max(hitCount, hits.length),
    hits: sortHotHits(hits),
  }
}
