import { MAX_PINS, watchlistError, normalizePin, parseSaved, scopedStorageKey } from '../watchlist.js'
export function createWatchlistController(storage, eventTarget) {
  const listeners = new Set()
  let storageKey = null
  let state = { pins: [], collapsed: false, storageError: '', scopeStatus: 'loading', scopeId: null, placement: 'waiting', selectedSymbol: null }
  const publish = patch => { state = { ...state, ...patch }; for (const listener of listeners) listener() }
  const persist = patch => {
    if (!storageKey || state.scopeStatus !== 'ready') throw watchlistError('scope-loading')
    publish(patch)
    try {
      if (!storage) throw new Error()
      storage.setItem(storageKey, JSON.stringify({ version: 1, pins: state.pins, collapsed: state.collapsed }))
      publish({ storageError: '' })
    } catch { publish({ storageError: 'storage-save' }) }
  }
  const storageChanged = event => {
    if (!storageKey || state.scopeStatus !== 'ready' || event.key !== storageKey) return
    try { publish({ ...parseSaved(event.newValue), storageError: '' }) } catch { publish({ storageError: 'storage-sync' }) }
  }
  eventTarget?.addEventListener('storage', storageChanged)
  return {
    source: { getSnapshot: () => state, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) } },
    setScope(scope) {
      const key = scopedStorageKey(scope)
      if (key === storageKey && state.scopeStatus === 'ready') return
      storageKey = key
      let saved = { pins: [], collapsed: false }, storageError = ''
      try { saved = parseSaved(storage?.getItem(storageKey)) } catch { storageError = 'storage-read' }
      publish({ ...saved, selectedSymbol: saved.pins[0]?.symbol ?? null, storageError, scopeStatus: 'ready', scopeId: scope })
    },
    scopeLoading: () => { storageKey = null; publish({ scopeStatus: 'loading', scopeId: null, pins: [], selectedSymbol: null, collapsed: false }) },
    scopeFailed: () => { storageKey = null; publish({ pins: [], selectedSymbol: null, scopeStatus: 'failed', scopeId: null, storageError: 'scope-unavailable' }) },
    select: symbol => publish({ selectedSymbol: symbol }),
    setPlacement: placement => { if (state.placement !== placement) publish({ placement }) },
    add(pin) {
      const item = normalizePin(pin)
      if (state.pins.some(p => p.symbol === item.symbol)) throw watchlistError('duplicate')
      if (state.pins.length >= MAX_PINS) throw watchlistError('limit')
      persist({ pins: [...state.pins, item] })
    },
    remove(symbol) {
      const pins = state.pins.filter(p => p.symbol !== symbol)
      persist({ pins, selectedSymbol: state.selectedSymbol === symbol ? pins[0]?.symbol ?? null : state.selectedSymbol })
    },
    move(symbol, offset) {
      const pins = [...state.pins], index = pins.findIndex(p => p.symbol === symbol), target = index + offset
      if (index < 0 || ![-1, 1].includes(offset) || target < 0 || target >= pins.length) return
      ;[pins[index], pins[target]] = [pins[target], pins[index]]
      persist({ pins })
    },
    collapse: collapsed => persist({ collapsed: Boolean(collapsed) }),
    dispose() { eventTarget?.removeEventListener('storage', storageChanged); listeners.clear() },
  }
}
