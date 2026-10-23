// Close-to-close replay of a declared cross. A golden cross opens an
// observation at that bar's close; the next death cross closes it. No
// commission, slippage, position size or order is applied.
export interface CrossPoint { sessionDate: string; close: number | null; fast: number | null; slow: number | null }
export interface ClosedReplay { entryDate: string; exitDate: string; entryClose: number; exitClose: number; returnRatio: number }

export interface CrossReplay {
  closed: ClosedReplay[]
  open: { entryDate: string; entryClose: number } | null
  latest: 'golden' | 'death' | 'above' | 'below' | 'flat' | 'warmup'
}

export function crossReplay(points: CrossPoint[]): CrossReplay {
  if (!Array.isArray(points)) throw new TypeError('replay points must be an array')
  let previous: 'above' | 'below' | null = null
  let open: CrossReplay['open'] = null
  let latest: CrossReplay['latest'] = 'warmup'
  const closed: ClosedReplay[] = []
  for (const point of points) {
    const fast = point?.fast, slow = point?.slow, close = point?.close
    if (fast == null || slow == null) { previous = null; continue }
    if (fast === slow) { latest = 'flat'; continue }
    const side = fast > slow ? 'above' : 'below'
    latest = side
    if (previous && side !== previous && close != null && Number.isFinite(close) && close !== 0) {
      if (side === 'above') {
        latest = 'golden'
        if (!open) open = { entryDate: point.sessionDate, entryClose: close }
      } else if (open && open.entryClose !== 0) {
        latest = 'death'
        closed.push({
          entryDate: open.entryDate, exitDate: point.sessionDate,
          entryClose: open.entryClose, exitClose: close,
          returnRatio: (close - open.entryClose) / open.entryClose,
        })
        open = null
      }
    }
    previous = side
  }
  return { closed, open, latest }
}

export function replaySummary(replay: CrossReplay) {
  const ratios = replay.closed.map(item => item.returnRatio).filter(Number.isFinite)
  const wins = ratios.filter(value => value > 0).length
  const average = ratios.length ? ratios.reduce((sum, value) => sum + value, 0) / ratios.length : null
  return { samples: ratios.length, wins, average, open: replay.open != null, latest: replay.latest }
}
