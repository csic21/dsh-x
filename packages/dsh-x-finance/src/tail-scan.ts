// Local, deterministic screening for a market-wide "session-tail volume dump".
//
// Every number here is computed from an already-fetched minute line and daily
// bars. Nothing is fetched, persisted, predicted or recommended. The scan is a
// description of one session tail — the last 30 minutes of the morning or the
// afternoon session: a high tail-volume ratio plus a falling tail is evidence of
// heavy selling into that break, not a forecast or an advice.
import { computeQuantStats } from './analytics.ts'
import type { QuantStats } from './analytics.ts'
import { isAshareMinute, shanghaiToday } from './market.ts'
import type { MarketAdjustment, TailScanWindow } from './market.ts'
import { validateSymbol } from './watchlist.ts'

/** How long one scan result may be reused by the Host. */
export const TAIL_SCAN_TTL_MS = 90_000
/** Candidate minute lines fetched after the daily pre-screen. */
export const TAIL_SCAN_MAX_INTRADAY = 32
/** Daily histories fetched for tail-confirmed candidates. */
export const TAIL_SCAN_MAX_HISTORY = 16
/** Candidates returned to the browser. */
export const TAIL_SCAN_MAX_RESULTS = 20
/** Minimum turnover for a stock to enter the scan (CNY). */
export const TAIL_SCAN_MIN_AMOUNT = 30_000_000
/** Daily change must be at least this negative (percent). */
export const TAIL_SCAN_MIN_DAY_CHANGE = -0.5
/** Daily volume ratio (Tencent field 49) must reach this value. */
export const TAIL_SCAN_MIN_VOLUME_RATIO = 1
/** Tail volume / median prior 30-minute block. */
export const TAIL_SCAN_MIN_TAIL_RATIO = 1.3
/** Tail return must be at least this negative (ratio). */
export const TAIL_SCAN_MIN_TAIL_CHANGE = -0.003
/** A down day counts as volume expansion above this multiple of the prior 5-day mean. */
export const TAIL_SCAN_VOLUME_EXPANSION = 1.2
/** Consecutive sessions needed for the "continuous" badge. */
export const TAIL_SCAN_MIN_STREAK = 2
/** Both windows are the last 30 minutes of one session. */
export const TAIL_SCAN_TAIL_MINUTES = 30
/** Minimum minute points for a tail to count as complete. */
export const TAIL_SCAN_TAIL_MIN_POINTS = 25
/** A baseline block must carry this share of its minutes to be used. */
export const TAIL_SCAN_BLOCK_COVERAGE = 5 / 6

/** The thresholds are returned with the result so the UI never invents them. */
export interface TailScanFilters {
  minAmount: number
  minDayChange: number
  minVolumeRatio: number
  minTailRatio: number
  minTailChange: number
  volumeExpansionMultiple: number
  minStreak: number
}

export const TAIL_SCAN_FILTERS: TailScanFilters = {
  minAmount: TAIL_SCAN_MIN_AMOUNT,
  minDayChange: TAIL_SCAN_MIN_DAY_CHANGE,
  minVolumeRatio: TAIL_SCAN_MIN_VOLUME_RATIO,
  minTailRatio: TAIL_SCAN_MIN_TAIL_RATIO,
  minTailChange: TAIL_SCAN_MIN_TAIL_CHANGE,
  volumeExpansionMultiple: TAIL_SCAN_VOLUME_EXPANSION,
  minStreak: TAIL_SCAN_MIN_STREAK,
}

/** One per-minute point. Volume is a delta for that minute, not a cumulative count. */
export interface TailMinutePoint {
  time: string
  price: number
  volume: number | null
  amount?: number | null
}

export interface TailMetrics {
  sessionDate: string
  complete: boolean
  tailStart: string
  tailEnd: string
  /** Last tail price / price at the window start - 1. */
  tailReturn: number | null
  tailVolume: number | null
  /** Median of the complete baseline blocks before the tail, normalized to 30 minutes. */
  baselineVolume: number | null
  tailVolumeRatio: number | null
  /** Tail volume / volume traded from the open through the window end. */
  tailVolumeShare: number | null
  /** Last price / previous close - 1; null when the previous close is unknown. */
  dayReturn: number | null
  points: number
  blocks: number
}

export interface TailDailyBar {
  sessionDate: string
  close: number
  volume: number | null
  isFinal?: boolean
}

export interface TailDailyContext {
  sessionDate: string
  /** Today's volume / mean volume of the previous five sessions. */
  volumeRatio5: number | null
  /** Today's volume / mean volume of the previous twenty sessions. */
  volumeRatio20: number | null
  /** Consecutive sessions whose close is below the previous close, ending today. */
  downStreak: number
  /**
   * Consecutive down sessions where each session's volume is above the
   * previous session's volume. This is the strict "increasing volume on the
   * way down" reading.
   */
  volumeExpansionDownStreak: number
  /**
   * Consecutive down sessions where volume is at least
   * TAIL_SCAN_VOLUME_EXPANSION times the previous five-day mean.
   */
  volumeDeclineStreak: number
  /** Down >= 2% sessions with volume expansion in the last twenty sessions. */
  distributionDays20: number
  downDays5: number
  downDays10: number
  todayReturn: number | null
  prior5AvgVolume: number | null
  /** False when today's daily bar is still moving. */
  isFinal: boolean
  samples: number
}

/** The subset of the daily quant engine that is useful on a scan row. */
export interface TailQuantContext {
  samples: number
  from: string | null
  to: string | null
  totalReturn: number | null
  annualVolatility: number | null
  maxDrawdown: number | null
  sharpe: number | null
  rsi14: number | null
  atr14: number | null
  ma20: number | null
  ma60: number | null
  priceVsMa20: number | null
  priceVsMa60: number | null
  momentum20: number | null
  momentum60: number | null
  high52w: number | null
  low52w: number | null
  drawdownFromHigh: number | null
}

export type TailScanFactorKey = 'tail-volume' | 'tail-drop' | 'day-drop' | 'daily-volume' | 'streak'

export interface TailScanFactor {
  key: TailScanFactorKey
  points: number
  max: number
}

export interface TailScanFlags {
  /** Tail volume ratio and tail return both clear their thresholds. */
  tailDump: boolean
  /** Today's volume is expanded, or the strict consecutive reading is met. */
  volumeExpansion: boolean
  /** At least TAIL_SCAN_MIN_STREAK consecutive volume-expansion down sessions. */
  consecutive: boolean
}

export interface TailScanCandidate {
  symbol: string
  name: string
  price: number
  changePercent: number
  /** Turnover in CNY. */
  amount: number
  turnoverPercent: number | null
  /** Tencent's daily volume ratio (量比), not the tail ratio. */
  volumeRatio: number | null
  /** Five-minute change reported by the quote source, when present. */
  fiveMinuteChange: number | null
  sessionDate: string
  tail: TailMetrics
  daily: TailDailyContext | null
  quant: TailQuantContext | null
  historyAvailable: boolean
  adjustment: MarketAdjustment | null
  /** Local, explainable score in 0..100. Not an expected return. */
  score: number
  factors: TailScanFactor[]
  flags: TailScanFlags
}

export interface TailScanUniverse {
  expected: number
  covered: number
  screened: number
  intradayChecked: number
  tailConfirmed: number
  historyChecked: number
  failedIntraday: number
  failedHistory: number
  partial: boolean
}

export interface TailScanResult {
  source: string
  fetchedAt: string
  sessionDate: string | null
  /** False on a weekend or holiday, so the UI says "latest session". */
  sessionIsToday: boolean
  /** Which session tail this result describes. */
  window: TailScanWindow
  /** Start of the scanned tail, e.g. `11:00` or `14:30`. */
  windowStart: string
  /** End of the scanned tail, e.g. `11:30` or `15:00`. */
  windowEnd: string
  /** False when the tail window is not complete. */
  complete: boolean
  universe: TailScanUniverse
  filters: TailScanFilters
  candidates: TailScanCandidate[]
}

const SESSION_DATE = /^\d{4}-\d{2}-\d{2}$/

function isSessionDate(value: unknown): value is string {
  if (typeof value !== 'string' || !SESSION_DATE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year!, month! - 1, day!))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day
}
const MINUTE = /^\d{2}:\d{2}$/

export interface TailScanWindowSpec {
  start: string
  end: string
  /** Baseline blocks `(start, end]`, before the tail. */
  blocks: readonly (readonly [string, string])[]
  /** Minutes one baseline block covers; every block is normalized to 30 minutes. */
  blockMinutes: number
}

/**
 * The two sessions a scan can describe, each as its own last 30 minutes. The
 * afternoon window keeps the 30-minute baseline blocks from 10:00 to 14:30 that
 * the panel has always used; the morning window only has 10:00–11:00 available,
 * so it uses six 10-minute blocks scaled to a 30-minute equivalent. Normalizing
 * keeps the tail ratio (and therefore the score) comparable across the two
 * windows instead of roughly doubling it for the morning scan.
 */
export const TAIL_SCAN_WINDOW_SPECS: Readonly<Record<TailScanWindow, TailScanWindowSpec>> = {
  morning: {
    start: '11:00',
    end: '11:30',
    blocks: [
      ['10:00', '10:10'],
      ['10:10', '10:20'],
      ['10:20', '10:30'],
      ['10:30', '10:40'],
      ['10:40', '10:50'],
      ['10:50', '11:00'],
    ],
    blockMinutes: 10,
  },
  afternoon: {
    start: '14:30',
    end: '15:00',
    blocks: [
      ['10:00', '10:30'],
      ['10:30', '11:00'],
      ['11:00', '11:30'],
      ['13:00', '13:30'],
      ['13:30', '14:00'],
      ['14:00', '14:30'],
    ],
    blockMinutes: 30,
  },
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
}

function finite(value: unknown, min = -Infinity, max = Infinity): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function nullableNumber(value: unknown, min = -Infinity, max = Infinity): value is number | null {
  return value === null || finite(value, min, max)
}

function nullableInteger(value: unknown, min = 0, max = 1e9): value is number | null {
  return value === null || (typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max)
}

function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function cleanPoints(input: TailMinutePoint[]): TailMinutePoint[] {
  if (!Array.isArray(input)) return []
  const byTime = new Map<string, TailMinutePoint>()
  for (const raw of input) {
    if (!raw || typeof raw.time !== 'string' || !MINUTE.test(raw.time) || !isAshareMinute(raw.time)) continue
    if (!finite(raw.price, 0.0001, 1e12)) continue
    const volume = raw.volume === null ? null : finite(raw.volume, 0, Number.MAX_SAFE_INTEGER) ? raw.volume : undefined
    if (volume === undefined) continue
    const amount = raw.amount === undefined || raw.amount === null
      ? null
      : finite(raw.amount, 0, Number.MAX_SAFE_INTEGER) ? raw.amount : undefined
    if (amount === undefined) continue
    byTime.set(raw.time, { time: raw.time, price: raw.price, volume, amount })
  }
  return [...byTime.values()].sort((left, right) => left.time.localeCompare(right.time))
}

function totalVolume(points: TailMinutePoint[]): number | null {
  if (!points.length) return null
  if (points.some(point => point.volume === null)) return null
  return points.reduce((sum, point) => sum + point.volume!, 0)
}

/** Resolves a requested window; anything unknown falls back to the afternoon session. */
export function tailWindowSpec(window?: TailScanWindow): TailScanWindowSpec {
  const key: TailScanWindow = window === 'morning' ? 'morning' : 'afternoon'
  return TAIL_SCAN_WINDOW_SPECS[key]
}

/**
 * Computes the session-tail metrics for one completed (or in-progress) minute
 * line. The tail is `(start, end]` inside the requested window, so the print at
 * the window start is the reference price and its volume belongs to the minute
 * before the tail. The baseline is the median of complete baseline blocks before
 * the tail, normalized to 30 minutes; the opening half hour is excluded because
 * the opening auction distorts the first block.
 */
export function computeTailMetrics(
  input: TailMinutePoint[],
  options: { sessionDate: string; previousClose?: number | null; window?: TailScanWindow },
): TailMetrics {
  const points = cleanPoints(input)
  if (points.length < 2) throw new Error('tail-scan invalid minute line')
  const spec = tailWindowSpec(options.window)
  const last = points.at(-1)!
  const reference = [...points].reverse().find(point => point.time <= spec.start) ?? null
  const tail = points.filter(point => point.time > spec.start && point.time <= spec.end)
  const tailLast = tail.at(-1) ?? null
  const minimum = Math.ceil(spec.blockMinutes * TAIL_SCAN_BLOCK_COVERAGE)
  const blockVolumes: number[] = []
  for (const [start, end] of spec.blocks) {
    const block = points.filter(point => point.time > start && point.time <= end)
    if (block.length < minimum) continue
    const volume = totalVolume(block)
    if (volume !== null) blockVolumes.push(volume * (TAIL_SCAN_TAIL_MINUTES / spec.blockMinutes))
  }
  const baselineVolume = blockVolumes.length >= 4 ? median(blockVolumes) : null
  const tailVolume = totalVolume(tail)
  // Cumulative volume through the end of the window: a morning scan must not be
  // diluted by an afternoon that it has not judged yet.
  const elapsedVolume = totalVolume(points.filter(point => point.time <= spec.end))
  const previousClose = finite(options.previousClose, 0.0001, 1e12) ? options.previousClose : null
  return {
    sessionDate: options.sessionDate,
    complete: last.time >= spec.end && tail.length >= TAIL_SCAN_TAIL_MIN_POINTS && blockVolumes.length >= 4,
    tailStart: spec.start,
    tailEnd: spec.end,
    tailReturn: reference && tailLast && tailLast.price > 0 ? tailLast.price / reference.price - 1 : null,
    tailVolume,
    baselineVolume,
    tailVolumeRatio: tailVolume !== null && baselineVolume !== null && baselineVolume > 0 ? tailVolume / baselineVolume : null,
    tailVolumeShare: tailVolume !== null && elapsedVolume !== null && elapsedVolume > 0 ? tailVolume / elapsedVolume : null,
    dayReturn: previousClose !== null ? last.price / previousClose - 1 : null,
    points: points.length,
    blocks: blockVolumes.length,
  }
}

/**
 * Daily context for the same session. A missing volume on any comparison bar
 * makes that ratio null; no volume is inferred from turnover or price.
 */
export function computeDailyVolumeContext(input: unknown, sessionDate: string): TailDailyContext {
  const empty: TailDailyContext = {
    sessionDate,
    volumeRatio5: null,
    volumeRatio20: null,
    downStreak: 0,
    volumeExpansionDownStreak: 0,
    volumeDeclineStreak: 0,
    distributionDays20: 0,
    downDays5: 0,
    downDays10: 0,
    todayReturn: null,
    prior5AvgVolume: null,
    isFinal: false,
    samples: 0,
  }
  if (!Array.isArray(input) || !isSessionDate(sessionDate)) return empty
  const unique = new Map<string, TailDailyBar>()
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const bar = raw as Record<string, unknown>
    if (!isSessionDate(bar.sessionDate)) continue
    if (!finite(bar.close, 0.0001, 1e12)) continue
    if (bar.volume !== null && !finite(bar.volume, 0, Number.MAX_SAFE_INTEGER)) continue
    unique.set(bar.sessionDate, {
      sessionDate: bar.sessionDate,
      close: bar.close,
      volume: bar.volume as number | null,
      isFinal: bar.isFinal === true,
    })
  }
  const bars = [...unique.values()].sort((left, right) => left.sessionDate.localeCompare(right.sessionDate))
  const index = bars.findIndex(bar => bar.sessionDate === sessionDate)
  if (index < 0) return empty
  const current = bars[index]!
  const prior = (count: number) => {
    const start = index - count
    if (start < 0) return null
    const rows = bars.slice(start, index)
    if (rows.length !== count || rows.some(bar => bar.volume === null)) return null
    const average = mean(rows.map(bar => bar.volume!))
    return average > 0 ? average : null
  }
  const average5 = prior(5)
  const average20 = prior(20)
  const todayVolume = current.volume
  const todayReturn = index > 0 ? current.close / bars[index - 1]!.close - 1 : null
  let downStreak = 0
  for (let cursor = index; cursor >= 1; cursor--) {
    if (!(bars[cursor]!.close < bars[cursor - 1]!.close)) break
    downStreak++
  }
  let volumeExpansionDownStreak = 0
  for (let cursor = index; cursor >= 1; cursor--) {
    const bar = bars[cursor]!
    const previous = bars[cursor - 1]!
    if (!(bar.close < previous.close)) break
    if (bar.volume === null || previous.volume === null || !(bar.volume > previous.volume)) break
    volumeExpansionDownStreak++
  }
  let volumeDeclineStreak = 0
  for (let cursor = index; cursor >= 1; cursor--) {
    if (!(bars[cursor]!.close < bars[cursor - 1]!.close)) break
    if (cursor < 5 || bars[cursor]!.volume === null) break
    const rows = bars.slice(cursor - 5, cursor)
    if (rows.some(bar => bar.volume === null)) break
    const average = mean(rows.map(bar => bar.volume!))
    if (!(average > 0) || bars[cursor]!.volume! < TAIL_SCAN_VOLUME_EXPANSION * average) break
    volumeDeclineStreak++
  }
  let distributionDays20 = 0
  for (let cursor = Math.max(1, index - 19); cursor <= index; cursor++) {
    const bar = bars[cursor]!
    if (!(bar.close < bars[cursor - 1]!.close)) continue
    if (!(bar.close <= bars[cursor - 1]!.close * 0.98)) continue
    if (cursor < 5 || bar.volume === null) continue
    const rows = bars.slice(cursor - 5, cursor)
    if (rows.some(row => row.volume === null)) continue
    const average = mean(rows.map(row => row.volume!))
    if (average > 0 && bar.volume >= TAIL_SCAN_VOLUME_EXPANSION * average) distributionDays20++
  }
  const downDays = (count: number) => {
    let value = 0
    for (let cursor = Math.max(1, index - count + 1); cursor <= index; cursor++) {
      if (bars[cursor]!.close < bars[cursor - 1]!.close) value++
    }
    return value
  }
  return {
    sessionDate,
    volumeRatio5: todayVolume !== null && average5 !== null ? todayVolume / average5 : null,
    volumeRatio20: todayVolume !== null && average20 !== null ? todayVolume / average20 : null,
    downStreak,
    volumeExpansionDownStreak,
    volumeDeclineStreak,
    distributionDays20,
    downDays5: downDays(5),
    downDays10: downDays(10),
    todayReturn,
    prior5AvgVolume: average5,
    isFinal: current.isFinal === true,
    samples: bars.length,
  }
}

export function tailQuantSnapshot(stats: QuantStats): TailQuantContext {
  return {
    samples: stats.samples,
    from: stats.from,
    to: stats.to,
    totalReturn: stats.totalReturn,
    annualVolatility: stats.annualVolatility,
    maxDrawdown: stats.maxDrawdown,
    sharpe: stats.sharpe,
    rsi14: stats.rsi14,
    atr14: stats.atr14,
    ma20: stats.ma20,
    ma60: stats.ma60,
    priceVsMa20: stats.priceVsMa20,
    priceVsMa60: stats.priceVsMa60,
    momentum20: stats.momentum20,
    momentum60: stats.momentum60,
    high52w: stats.high52w,
    low52w: stats.low52w,
    drawdownFromHigh: stats.drawdownFromHigh,
  }
}

export function tailQuantFromBars(bars: unknown): TailQuantContext {
  return tailQuantSnapshot(computeQuantStats(bars))
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/**
 * Explainable 0..100 score. The weights sum to 100:
 * tail volume 30, tail drop 25, day drop 15, daily volume 15, streak 15.
 * A missing component contributes zero, never a substitute value.
 */
export function scoreTailCandidate(input: {
  tailReturn: number | null
  tailVolumeRatio: number | null
  changePercent: number
  daily: TailDailyContext | null
}): { score: number; factors: TailScanFactor[]; flags: TailScanFlags } {
  const streak = Math.max(input.daily?.volumeExpansionDownStreak ?? 0, input.daily?.volumeDeclineStreak ?? 0)
  const tailVolumePoints = input.tailVolumeRatio === null ? 0 : clamp01((input.tailVolumeRatio - 1) / 2) * 30
  const tailDropPoints = input.tailReturn === null ? 0 : clamp01(-input.tailReturn / 0.03) * 25
  const dayDropPoints = clamp01(-input.changePercent / 7) * 15
  const dailyVolumePoints = input.daily?.volumeRatio5 == null ? 0 : clamp01((input.daily.volumeRatio5 - 1) / 2) * 15
  const streakPoints = clamp01(streak / 3) * 15
  const factors: TailScanFactor[] = [
    { key: 'tail-volume', points: Math.round(tailVolumePoints * 10) / 10, max: 30 },
    { key: 'tail-drop', points: Math.round(tailDropPoints * 10) / 10, max: 25 },
    { key: 'day-drop', points: Math.round(dayDropPoints * 10) / 10, max: 15 },
    { key: 'daily-volume', points: Math.round(dailyVolumePoints * 10) / 10, max: 15 },
    { key: 'streak', points: Math.round(streakPoints * 10) / 10, max: 15 },
  ]
  const tailDump = input.tailVolumeRatio !== null && input.tailVolumeRatio >= TAIL_SCAN_MIN_TAIL_RATIO
    && input.tailReturn !== null && input.tailReturn <= TAIL_SCAN_MIN_TAIL_CHANGE
  return {
    score: Math.round(factors.reduce((sum, factor) => sum + factor.points, 0)),
    factors,
    flags: {
      tailDump,
      volumeExpansion: (input.daily?.volumeRatio5 ?? 0) >= TAIL_SCAN_VOLUME_EXPANSION || streak >= TAIL_SCAN_MIN_STREAK,
      consecutive: streak >= TAIL_SCAN_MIN_STREAK,
    },
  }
}

function projectDaily(raw: unknown, sessionDate: string): TailDailyContext | null {
  if (raw === null || raw === undefined) return null
  if (!isRecord(raw)) throw new Error('tail-scan invalid daily context')
  if (raw.sessionDate !== sessionDate) throw new Error('tail-scan daily session mismatch')
  const ratio = (value: unknown) => value === null || finite(value, 0, 1e6)
  const nullable = (value: unknown, min: number, max: number) => value === null || finite(value, min, max)
  if (!ratio(raw.volumeRatio5) || !ratio(raw.volumeRatio20)) throw new Error('tail-scan invalid daily ratio')
  for (const key of ['downStreak', 'volumeExpansionDownStreak', 'volumeDeclineStreak', 'distributionDays20', 'downDays5', 'downDays10', 'samples']) {
    if (!finite(raw[key], 0, 1e6) || !Number.isInteger(raw[key])) throw new Error('tail-scan invalid daily count')
  }
  if (!nullable(raw.todayReturn, -1, 10) || !nullable(raw.prior5AvgVolume, 0, Number.MAX_SAFE_INTEGER)) throw new Error('tail-scan invalid daily value')
  if (typeof raw.isFinal !== 'boolean') throw new Error('tail-scan invalid daily final flag')
  return {
    sessionDate,
    volumeRatio5: raw.volumeRatio5,
    volumeRatio20: raw.volumeRatio20,
    downStreak: raw.downStreak,
    volumeExpansionDownStreak: raw.volumeExpansionDownStreak,
    volumeDeclineStreak: raw.volumeDeclineStreak,
    distributionDays20: raw.distributionDays20,
    downDays5: raw.downDays5,
    downDays10: raw.downDays10,
    todayReturn: raw.todayReturn,
    prior5AvgVolume: raw.prior5AvgVolume,
    isFinal: raw.isFinal,
    samples: raw.samples,
  }
}

function projectQuant(raw: unknown): TailQuantContext | null {
  if (raw === null || raw === undefined) return null
  if (!isRecord(raw)) throw new Error('tail-scan invalid quant context')
  const keys: (keyof TailQuantContext)[] = [
    'samples', 'from', 'to', 'totalReturn', 'annualVolatility', 'maxDrawdown', 'sharpe', 'rsi14', 'atr14',
    'ma20', 'ma60', 'priceVsMa20', 'priceVsMa60', 'momentum20', 'momentum60', 'high52w', 'low52w', 'drawdownFromHigh',
  ]
  for (const key of keys) if (!(key in raw)) throw new Error('tail-scan missing quant field')
  if (!finite(raw.samples, 0, 1e6) || !Number.isInteger(raw.samples)) throw new Error('tail-scan invalid quant samples')
  if (raw.from !== null && !isSessionDate(raw.from)) throw new Error('tail-scan invalid quant from')
  if (raw.to !== null && !isSessionDate(raw.to)) throw new Error('tail-scan invalid quant to')
  for (const key of ['totalReturn', 'annualVolatility', 'maxDrawdown', 'sharpe', 'rsi14', 'atr14', 'ma20', 'ma60', 'priceVsMa20', 'priceVsMa60', 'momentum20', 'momentum60', 'high52w', 'low52w', 'drawdownFromHigh']) {
    if (!nullableNumber(raw[key], -1e9, 1e9)) throw new Error('tail-scan invalid quant value')
  }
  return {
    samples: raw.samples, from: raw.from, to: raw.to,
    totalReturn: raw.totalReturn, annualVolatility: raw.annualVolatility, maxDrawdown: raw.maxDrawdown,
    sharpe: raw.sharpe, rsi14: raw.rsi14, atr14: raw.atr14, ma20: raw.ma20, ma60: raw.ma60,
    priceVsMa20: raw.priceVsMa20, priceVsMa60: raw.priceVsMa60, momentum20: raw.momentum20, momentum60: raw.momentum60,
    high52w: raw.high52w, low52w: raw.low52w, drawdownFromHigh: raw.drawdownFromHigh,
  }
}

/**
 * Trust boundary for a provider-supplied scan. Required fields are re-checked,
 * optional contexts are kept only in their declared shape, and the score and
 * flags are recomputed from the metrics instead of trusting the adapter.
 */
export function projectTailScan(raw: unknown, now: number): TailScanResult {
  if (!isRecord(raw)) throw new Error('tail-scan invalid result')
  const source = typeof raw.source === 'string' && raw.source.trim() && raw.source.length <= 64
    ? raw.source.replace(/[\u0000-\u001f\u007f]/g, '').trim()
    : null
  if (!source) throw new Error('tail-scan invalid source')
  const window = raw.window === 'morning' || raw.window === 'afternoon'
    ? raw.window
    : null
  if (!window) throw new Error('tail-scan invalid window')
  const spec = tailWindowSpec(window)
  const sessionDate = raw.sessionDate === null ? null : isSessionDate(raw.sessionDate) ? raw.sessionDate : undefined
  if (sessionDate === undefined) throw new Error('tail-scan invalid session date')
  const universe = raw.universe
  if (!isRecord(universe) || typeof raw.complete !== 'boolean') throw new Error('tail-scan invalid universe')
  const counts: (keyof TailScanUniverse)[] = ['expected', 'covered', 'screened', 'intradayChecked', 'tailConfirmed', 'historyChecked', 'failedIntraday', 'failedHistory']
  for (const key of counts) {
    if (typeof universe[key] !== 'number' || !Number.isInteger(universe[key]) || universe[key] < 0 || universe[key] > 100_000) throw new Error('tail-scan invalid universe count')
  }
  if (typeof universe.partial !== 'boolean') throw new Error('tail-scan invalid partial flag')
  const rawCandidates = Array.isArray(raw.candidates) ? raw.candidates : null
  if (!rawCandidates || rawCandidates.length > TAIL_SCAN_MAX_RESULTS) throw new Error('tail-scan invalid candidate list')
  const candidates: TailScanCandidate[] = rawCandidates.map(item => {
    if (!isRecord(item)) throw new Error('tail-scan invalid candidate')
    if (typeof item.symbol !== 'string') throw new Error('tail-scan invalid symbol')
    const symbol = validateSymbol(item.symbol)
    if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 64) throw new Error('tail-scan invalid name')
    if (!finite(item.price, 0.0001, 1e12) || !finite(item.changePercent, -1000, 1000)) throw new Error('tail-scan invalid quote')
    if (!finite(item.amount, 0, 1e15)) throw new Error('tail-scan invalid amount')
    if (!nullableNumber(item.turnoverPercent, 0, 1000) || !nullableNumber(item.volumeRatio, 0, 1e4) || !nullableNumber(item.fiveMinuteChange, -100, 100)) throw new Error('tail-scan invalid quote field')
    if (typeof item.sessionDate !== 'string' || item.sessionDate !== sessionDate) throw new Error('tail-scan candidate session mismatch')
    const tail = item.tail
    if (!isRecord(tail) || typeof tail.complete !== 'boolean') throw new Error('tail-scan invalid tail')
    if (!nullableNumber(tail.tailReturn, -1, 1) || !nullableNumber(tail.tailVolumeRatio, 0, 1e6) || !nullableNumber(tail.tailVolumeShare, 0, 1)) throw new Error('tail-scan invalid tail metric')
    if (!nullableNumber(tail.dayReturn, -1, 10) || !nullableNumber(tail.tailVolume, 0, Number.MAX_SAFE_INTEGER) || !nullableNumber(tail.baselineVolume, 0, Number.MAX_SAFE_INTEGER)) throw new Error('tail-scan invalid tail volume')
    if (!finite(tail.points, 0, 1000) || !Number.isInteger(tail.points) || !finite(tail.blocks, 0, 1000) || !Number.isInteger(tail.blocks)) throw new Error('tail-scan invalid tail count')
    if (typeof tail.tailStart !== 'string' || typeof tail.tailEnd !== 'string') throw new Error('tail-scan invalid tail window')
    // The row must describe the window the scan claims; a mismatched tail is a
    // broken adapter, not something the UI should relabel.
    if (tail.tailStart !== spec.start || tail.tailEnd !== spec.end) throw new Error('tail-scan window mismatch')
    const daily = projectDaily(item.daily, sessionDate)
    const quant = projectQuant(item.quant)
    const adjustment = item.adjustment === null ? null : ['none', 'forward', 'backward'].includes(item.adjustment) ? item.adjustment as MarketAdjustment : undefined
    if (adjustment === undefined) throw new Error('tail-scan invalid adjustment')
    if (typeof item.historyAvailable !== 'boolean') throw new Error('tail-scan invalid history flag')
    const scored = scoreTailCandidate({ tailReturn: tail.tailReturn, tailVolumeRatio: tail.tailVolumeRatio, changePercent: item.changePercent, daily })
    return {
      symbol,
      name: item.name.replace(/[\u0000-\u001f\u007f]/g, '').trim(),
      price: item.price,
      changePercent: item.changePercent,
      amount: item.amount,
      turnoverPercent: item.turnoverPercent,
      volumeRatio: item.volumeRatio,
      fiveMinuteChange: item.fiveMinuteChange,
      sessionDate,
      tail: {
        sessionDate,
        complete: tail.complete,
        tailStart: tail.tailStart,
        tailEnd: tail.tailEnd,
        tailReturn: tail.tailReturn,
        tailVolume: tail.tailVolume,
        baselineVolume: tail.baselineVolume,
        tailVolumeRatio: tail.tailVolumeRatio,
        tailVolumeShare: tail.tailVolumeShare,
        dayReturn: tail.dayReturn,
        points: tail.points,
        blocks: tail.blocks,
      },
      daily,
      quant,
      historyAvailable: item.historyAvailable,
      adjustment,
      ...scored,
    }
  }).sort((left, right) => right.score - left.score)
  return {
    source,
    fetchedAt: new Date(now).toISOString(),
    sessionDate,
    sessionIsToday: sessionDate !== null && sessionDate === shanghaiToday(now),
    window,
    windowStart: spec.start,
    windowEnd: spec.end,
    complete: raw.complete && sessionDate !== null && candidates.every(candidate => candidate.tail.complete),
    universe: {
      expected: universe.expected,
      covered: universe.covered,
      screened: universe.screened,
      intradayChecked: universe.intradayChecked,
      tailConfirmed: universe.tailConfirmed,
      historyChecked: universe.historyChecked,
      failedIntraday: universe.failedIntraday,
      failedHistory: universe.failedHistory,
      partial: universe.partial,
    },
    filters: TAIL_SCAN_FILTERS,
    candidates,
  }
}

/** Export for tests; the provider uses the same scale. */
export function tailBlockCount(window?: TailScanWindow): number {
  return tailWindowSpec(window).blocks.length
}
