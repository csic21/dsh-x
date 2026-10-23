export function mountWhenVacant(slots: any, options: any, Component: any, hooks: any) {
  return slots.inject('shell.bottom', () => {
    let disposeEntry: any, stopped = false
    const occupied = () => slots.entries('shell.bottom').some((entry: any) => entry.component !== Component)
    const withdraw = (placement: string) => { const dispose = disposeEntry; disposeEntry = undefined; dispose?.(); hooks.onPlacement(placement) }
    const reconcile = () => {
      if (stopped) return
      // An empty or deliberately hidden bar releases the single bottom slot
      // instead of holding it invisibly.
      if (!hooks.visible()) { if (disposeEntry) withdraw('waiting'); return }
      // Never replace an occupant, including a hidden inspector; remove() then
      // mount() instead of updating in place, so no other plugin is shadowed.
      if (occupied()) { withdraw('occupied'); return }
      if (!disposeEntry) {
        disposeEntry = slots.register({ ...options, name: 'shell.bottom', priority: Number.MAX_SAFE_INTEGER }, Component)
        hooks.onPlacement('mounted')
      }
    }
    const unsubscribeSlots = slots.subscribe('shell.bottom', reconcile)
    const unsubscribeState = hooks.subscribe(reconcile)
    reconcile()
    return () => { stopped = true; unsubscribeSlots(); unsubscribeState(); disposeEntry?.(); hooks.onPlacement('waiting') }
  })
}
