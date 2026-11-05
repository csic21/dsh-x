import type { NewsItem } from '../../news.ts'

/**
 * Factual alignment between a headline and the minute line, never a causal
 * claim. The panel says "at publish time the price was X, 30 minutes later it
 * was Y"; it never says the headline caused the move. Everything here is pure
 * arithmetic over data the page already has, so it is testable without a DOM.
 */

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

const pad = (value: number) => String(value).padStart(2, '0')

/** Shanghai wall clock (`HH:MM`) for an ISO instant, independent of the host zone. */
export function shanghaiClock(iso: unknown): string | null {
  if (typeof iso !== 'string') return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  const shifted = new Date(ms + SHANGHAI_OFFSET_MS)
  return `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`
}

/** Shanghai calendar day (`YYYY-MM-DD`) for an ISO instant. */
export function shanghaiDay(iso: unknown): string | null {
  if (typeof iso !== 'string') return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  const shifted = new Date(ms + SHANGHAI_OFFSET_MS)
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

export function addMinutes(clock: string, minutes: number): string | null {
  const match = /^(\d{2}):(\d{2})$/.exec(clock)
  if (!match) return null
  const total = Number(match[1]) * 60 + Number(match[2]) + minutes
  if (total < 0 || total >= 24 * 60) return null
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

/** The last minute bar at or before `clock`; the line starts at the open. */
export function priceAtClock(points: any, clock: string): { price: number; at: string } | null {
  if (!Array.isArray(points) || !/^\d{2}:\d{2}$/.test(clock)) return null
  let found: { price: number; at: string } | null = null
  for (const point of points) {
    const time = point && typeof point.time === 'string' ? point.time : ''
    if (!/^\d{2}:\d{2}$/.test(time)) continue
    if (time > clock) break
    if (Number.isFinite(point.price) && point.price > 0) found = { price: point.price, at: time }
  }
  return found
}

export interface AlignedNews {
  item: NewsItem
  /** Shanghai clock of the headline, or null when the timestamp is unusable. */
  clock: string | null
  /** True only when the headline was published during this session's day. */
  inSession: boolean
  price: number | null
  afterPrice: number | null
  /** Price change over `windowMinutes` starting at the headline, in percent. */
  afterChangePercent: number | null
}

/**
 * Attach the minute-line price to each headline. Headlines from another day are
 * returned untouched (`inSession: false`) instead of being priced against a
 * session they do not belong to.
 */
export function alignNews(items: NewsItem[], session: any, windowMinutes = 30): AlignedNews[] {
  const points = session?.points
  const sessionDay = typeof session?.sessionDate === 'string' ? session.sessionDate : null
  return (Array.isArray(items) ? items : []).map(item => {
    const clock = shanghaiClock(item.at)
    const day = shanghaiDay(item.at)
    const inSession = Boolean(clock && sessionDay && day === sessionDay && Array.isArray(points) && points.length)
    if (!inSession || !clock) return { item, clock, inSession: false, price: null, afterPrice: null, afterChangePercent: null }
    const start = priceAtClock(points, clock)
    const later = addMinutes(clock, windowMinutes)
    const end = later ? priceAtClock(points, later) : null
    const afterChangePercent = start && end && start.price > 0
      ? ((end.price - start.price) / start.price) * 100
      : null
    return {
      item,
      clock,
      inSession: true,
      price: start?.price ?? null,
      afterPrice: end?.price ?? null,
      afterChangePercent: Number.isFinite(afterChangePercent) ? afterChangePercent : null,
    }
  })
}

export interface SessionMove {
  from: string
  to: string
  /** Percent change across the window; sign is the direction of travel. */
  changePercent: number
  price: number
}

/**
 * The largest swings of the session, each measured across `step` minutes of
 * clock time (a fraction `threshold`, so 0.008 is 0.8%). A window only counts
 * when the line actually has a bar exactly `step` minutes earlier, so the lunch
 * break and a sparse line cannot manufacture a move. Windows that intersect one
 * already chosen window are dropped, so three rows never describe the same
 * five minutes.
 */
export function sessionMoves(session: any, options: { step?: number; threshold?: number; limit?: number } = {}): SessionMove[] {
  const { step = 5, threshold = 0.008, limit = 3 } = options
  const points = session?.points
  if (!Array.isArray(points) || points.length < 2) return []
  const byClock = new Map<string, number>()
  for (const point of points) {
    if (typeof point?.time !== 'string' || !Number.isFinite(point.price) || point.price <= 0) continue
    byClock.set(point.time, point.price)
  }
  const candidates: SessionMove[] = []
  for (const point of points) {
    if (typeof point?.time !== 'string') continue
    const start = addMinutes(point.time, -step)
    if (!start) continue
    const previous = byClock.get(start)
    if (!Number.isFinite(previous) || !previous || previous <= 0) continue
    const changePercent = ((point.price - previous) / previous) * 100
    if (!Number.isFinite(changePercent) || Math.abs(changePercent) < threshold * 100) continue
    candidates.push({ from: start, to: point.time, changePercent, price: point.price })
  }
  candidates.sort((left, right) => Math.abs(right.changePercent) - Math.abs(left.changePercent))
  const chosen: SessionMove[] = []
  for (const candidate of candidates) {
    const overlaps = chosen.some(move => candidate.from < move.to && move.from < candidate.to)
    if (overlaps) continue
    chosen.push(candidate)
    if (chosen.length >= limit) break
  }
  return chosen
}

/** Headlines published within `minutes` on either side of a move. */
export function newsAroundMove(moves: SessionMove[], items: AlignedNews[], minutes = 20): { move: SessionMove; news: AlignedNews[] }[] {
  return moves.map(move => ({
    move,
    news: items.filter(item => item.clock !== null && item.clock >= (addMinutes(move.from, -minutes) ?? move.from) && item.clock <= (addMinutes(move.to, minutes) ?? move.to)),
  }))
}
