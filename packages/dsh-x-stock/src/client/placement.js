// Never replace an occupant, including a hidden inspector. Low precedence is
// a second safety fence: if another plugin mounts, it wins before we withdraw.
export function mountWhenVacant(slots, options, Component, onPlacement) {
  return slots.inject('shell.bottom', () => {
    let disposeEntry, stopped = false
    const occupied = () => slots.entries('shell.bottom').some(entry => entry.component !== Component)
    const reconcile = () => {
      if (stopped) return
      if (occupied()) {
        const dispose = disposeEntry
        disposeEntry = undefined
        dispose?.()
        onPlacement('occupied')
      } else if (!disposeEntry) {
        disposeEntry = slots.register({ ...options, name: 'shell.bottom', priority: Number.MAX_SAFE_INTEGER }, Component)
        onPlacement('mounted')
      }
    }
    const unsubscribe = slots.subscribe('shell.bottom', reconcile)
    reconcile()
    return () => { stopped = true; unsubscribe(); disposeEntry?.(); onPlacement('waiting') }
  })
}
