// A trading session is a date, never a shifted UTC timestamp.
export function businessDay(sessionDate) {
  const [year, month, day] = sessionDate.split('-').map(Number)
  return { year, month, day }
}
export function sessionKey(time) {
  if (typeof time === 'string') return time
  return time && typeof time === 'object'
    ? `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}` : null
}
export const MA_COLORS = { 5: '#b07b00', 10: '#9957d4', 20: '#2582cb' }
export const UP_COLOR = '#cf3b4c', DOWN_COLOR = '#168463'
export function buildChartData(dataset, indicators) {
  // Join by trading date: indicators may be sparse and are never index-zipped.
  const rows = new Map(indicators.rows.map(row => [row.sessionDate, row]))
  const result = { candles: [], volume: [], ma5: [], ma10: [], ma20: [], dif: [], dea: [], hist: [] }
  for (const bar of dataset.bars) {
    const time = businessDay(bar.sessionDate), row = rows.get(bar.sessionDate)
    result.candles.push({ time, open: bar.open, high: bar.high, low: bar.low, close: bar.close })
    result.volume.push(Number.isFinite(bar.volume) ? { time, value: bar.volume, color: bar.close >= bar.open ? UP_COLOR : DOWN_COLOR } : { time })
    for (const period of [5, 10, 20]) result[`ma${period}`].push(Number.isFinite(row?.ma?.[period]) ? { time, value: row.ma[period] } : { time })
    for (const key of ['dif', 'dea', 'hist']) result[key].push(Number.isFinite(row?.[key])
      ? { time, value: row[key], ...(key === 'hist' ? { color: row[key] >= 0 ? UP_COLOR : DOWN_COLOR } : {}) } : { time })
  }
  return result
}
export function createSelectionStore() {
  let bars = [], state = { sessionDate: null, locked: false }, listeners = new Set()
  const publish = (sessionDate, locked) => {
    if (state.sessionDate === sessionDate && state.locked === locked) return
    state = { sessionDate, locked }; for (const listener of listeners) listener()
  }
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    setBars(next, reset = false) {
      bars = next
      if (reset || !bars.some(bar => bar.sessionDate === state.sessionDate)) publish(bars.at(-1)?.sessionDate ?? null, false)
    },
    hover(date) { if (!state.locked && bars.some(bar => bar.sessionDate === date)) publish(date, false) },
    click(date) { if (state.locked) publish(state.sessionDate, false); else if (bars.some(bar => bar.sessionDate === date)) publish(date, true) },
    select(date) { if (bars.some(bar => bar.sessionDate === date)) publish(date, true) },
    unlock() { publish(state.sessionDate, false) },
    move(key) {
      if (!bars.length) return null
      const found = bars.findIndex(bar => bar.sessionDate === state.sessionDate), current = found < 0 ? bars.length - 1 : found
      const index = key === 'Home' ? 0 : key === 'End' ? bars.length - 1 : Math.max(0, Math.min(bars.length - 1, current + (key === 'ArrowLeft' ? -1 : 1)))
      publish(bars[index].sessionDate, true); return bars[index]
    },
    dispose() { listeners.clear(); bars = [] },
  }
}
export function preserveLogicalRange(range, previousBars, nextBars) {
  if (!range || !previousBars.length || !nextBars.length) return range
  const anchor = Math.max(0, Math.min(previousBars.length - 1, Math.floor(range.from)))
  const mapped = nextBars.findIndex(bar => bar.sessionDate === previousBars[anchor].sessionDate)
  return mapped < 0 ? range : { from: range.from + mapped - anchor, to: range.to + mapped - anchor }
}
