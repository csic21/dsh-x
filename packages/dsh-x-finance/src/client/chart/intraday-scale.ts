// The chart library prints a UTC timestamp as UTC. A-share 分时 instead uses
// Beijing wall time, with the lunch break removed so 13:00 sits beside 11:30.
const OPEN = 9 * 60 + 15
const MORNING_END = 11 * 60 + 30
const AFTERNOON = 13 * 60
const MORNING_SPAN = MORNING_END - OPEN

export function sessionOffset(time: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(time)) return null
  const minutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
  if (minutes >= OPEN && minutes <= MORNING_END) return minutes - OPEN
  if (minutes >= AFTERNOON && minutes <= 15 * 60) return MORNING_SPAN + 1 + (minutes - AFTERNOON)
  return null
}

export function clockFromOffset(offset: number): string {
  const minutes = offset <= MORNING_SPAN ? OPEN + offset : AFTERNOON + (offset - MORNING_SPAN - 1)
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/** Session minute packed onto a UTC clock so the scale can skip lunch and still read as Beijing time. */
export function exchangeStamp(sessionDate: string, time: string): number | null {
  const offset = sessionOffset(time)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sessionDate)
  if (offset === null || !match) return null
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 1000 + offset * 60
}

export function formatExchangeClock(stamp: number): string {
  const date = new Date(stamp * 1000)
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000
  return clockFromOffset(Math.round((stamp - midnight) / 60))
}

/** Price and percent share one centre: the previous close is zero percent. */
export function intradayRange(prices: number[], previousClose: number) {
  let furthest = 0
  for (const price of prices) furthest = Math.max(furthest, Math.abs(price - previousClose) / previousClose)
  const percent = Math.max(furthest * 1.08, 0.002) * 100
  return {
    priceMin: previousClose * (1 - percent / 100),
    priceMax: previousClose * (1 + percent / 100),
    percent,
  }
}

export function formatLots(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1e8) return `${(value / 1e8).toFixed(2)}亿`
  if (abs >= 1e4) return `${(value / 1e4).toFixed(2)}万`
  return String(Math.round(value))
}
