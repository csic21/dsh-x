// Weekly, monthly and yearly candles are merged from daily bars already in
// hand. Nothing is fetched or invented: a missing volume stays missing, and
// the current period stays provisional until Shanghai time has left it.
export const BAR_INTERVALS = ['1d', '1w', '1M', '1y'] as const
export type BarInterval = typeof BAR_INTERVALS[number]

const DAY = 86_400_000

export function normalizeInterval(raw: unknown): BarInterval {
  return BAR_INTERVALS.includes(raw as BarInterval) ? raw as BarInterval : '1d'
}

function utcDate(sessionDate: string) {
  const [year, month, day] = sessionDate.split('-').map(Number)
  return Date.UTC(year!, month! - 1, day!)
}

function formatUtc(ms: number) {
  const date = new Date(ms)
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${date.getUTCFullYear()}-${month}-${day}`
}

/** Monday of the calendar week that contains this session, as a date key. */
export function weekStart(sessionDate: string) {
  const utc = utcDate(sessionDate)
  const weekday = new Date(utc).getUTCDay()
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday
  return formatUtc(utc + mondayOffset * DAY)
}

export function shanghaiSessionDate(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const pick = (type: string) => parts.find(part => part.type === type)?.value ?? ''
  return `${pick('year')}-${pick('month')}-${pick('day')}`
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function sumOrNull(values: unknown[]) {
  if (!values.every(finite)) return null
  let sum = 0
  for (const value of values as number[]) sum += value
  return Number.isFinite(sum) ? sum : null
}

function periodEnded(interval: BarInterval, key: string, today: string, last: any, complete: boolean) {
  if (interval === '1w') {
    const friday = formatUtc(utcDate(key) + 4 * DAY)
    return today > friday || (today === friday && complete && last.sessionDate === friday)
  }
  if (interval === '1M') return today.slice(0, 7) > key
  return today.slice(0, 4) > key
}

/** Merge ascending daily bars. `1d` returns the same array. */
export function resampleBars(bars: any[], interval: BarInterval, now = new Date()) {
  if (!Array.isArray(bars)) throw new TypeError('resample bars must be an array')
  if (interval === '1d') return bars
  const today = shanghaiSessionDate(now)
  const groups: { key: string, bars: any[] }[] = []
  for (const bar of bars) {
    if (!bar || typeof bar.sessionDate !== 'string' || !finite(bar.open) || !finite(bar.high) || !finite(bar.low) || !finite(bar.close)) throw new TypeError('resample requires finite OHLC daily bars')
    const key = interval === '1w' ? weekStart(bar.sessionDate) : interval === '1M' ? bar.sessionDate.slice(0, 7) : bar.sessionDate.slice(0, 4)
    const current = groups.at(-1)
    if (!current || current.key !== key) groups.push({ key, bars: [bar] })
    else current.bars.push(bar)
  }
  return groups.map((group, index) => {
    const members = group.bars
    const last = members.at(-1)
    const complete = members.every((bar: any) => bar.isFinal === true)
    const later = index < groups.length - 1
    return {
      sessionDate: last.sessionDate,
      open: members[0].open,
      high: Math.max(...members.map((bar: any) => bar.high)),
      low: Math.min(...members.map((bar: any) => bar.low)),
      close: last.close,
      volume: sumOrNull(members.map((bar: any) => bar.volume)),
      amount: sumOrNull(members.map((bar: any) => bar.amount)),
      isFinal: complete && (later || periodEnded(interval, group.key, today, last, complete)),
      updatedAt: null,
      revision: `${interval}:${group.key}`,
    }
  })
}

/** A view of a daily dataset. Daily itself is returned unchanged. */
export function resampleDataset(dataset: any, interval: BarInterval, now = new Date()) {
  if (!dataset || dataset.interval !== '1d') throw new TypeError('only daily datasets can be resampled')
  if (interval === '1d') return dataset
  const bars = resampleBars(dataset.bars, interval, now)
  if (!bars.length) throw new TypeError('resample produced no bars')
  return {
    ...dataset,
    id: `${dataset.id}:${interval}`,
    interval,
    datasetRevision: `${dataset.datasetRevision}:${interval}`,
    historyAnchor: bars[0]!.sessionDate,
    bars,
  }
}
