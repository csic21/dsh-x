export interface WatchlistState { pins: {symbol: string, alias: string}[]; collapsed: boolean; storageError: string; scopeStatus: string; scopeId: string | null; placement: string; selectedSymbol: string | null }
import { MAX_PINS, watchlistError, normalizePin, parseSaved, scopedStorageKey } from '../watchlist.ts'
export function createWatchlistController(storage?: any, eventTarget?: any) {
  const listeners = new Set<any>()
  let storageKey: any = null
  let state: WatchlistState = { pins: [], collapsed: false, storageError: '', scopeStatus: 'loading', scopeId: null, placement: 'waiting', selectedSymbol: null }
  const publish = (patch: any) => { state = { ...state, ...patch }; for (const listener of listeners) listener() }
  const persist = (patch: any) => {
    if (!storageKey || state.scopeStatus !== 'ready') throw watchlistError('scope-loading')
    publish(patch)
    try {
      if (!storage) throw new Error()
      storage.setItem(storageKey, JSON.stringify({ version: 1, pins: state.pins, collapsed: state.collapsed }))
      publish({ storageError: '' })
    } catch { publish({ storageError: 'storage-save' }) }
  }
  const storageChanged = (event: any) => {
    if (!storageKey || state.scopeStatus !== 'ready' || event.key !== storageKey) return
    try { publish({ ...parseSaved(event.newValue), storageError: '' }) } catch { publish({ storageError: 'storage-sync' }) }
  }
  eventTarget?.addEventListener('storage', storageChanged)
  return {
    source: { getSnapshot: () => state, subscribe: (listener: any) => { listeners.add(listener); return () => listeners.delete(listener) } },
    setScope(scope: any) {
      const key = scopedStorageKey(scope)
      if (key === storageKey && state.scopeStatus === 'ready') return
      storageKey = key
      let saved: Pick<WatchlistState, 'pins' | 'collapsed'> = { pins: [], collapsed: false }, storageError = ''
      try { saved = parseSaved(storage?.getItem(storageKey)) } catch { storageError = 'storage-read' }
      publish({ ...saved, selectedSymbol: saved.pins[0]?.symbol ?? null, storageError, scopeStatus: 'ready', scopeId: scope })
    },
    scopeLoading: () => { storageKey = null; publish({ scopeStatus: 'loading', scopeId: null, pins: [], selectedSymbol: null, collapsed: false }) },
    scopeFailed: () => { storageKey = null; publish({ pins: [], selectedSymbol: null, scopeStatus: 'failed', scopeId: null, storageError: 'scope-unavailable' }) },
    select: (symbol: any) => publish({ selectedSymbol: symbol }),
    setPlacement: (placement: any) => { if (state.placement !== placement) publish({ placement }) },
    add(pin: any) {
      const item = normalizePin(pin)
      if (state.pins.some(p => p.symbol === item.symbol)) throw watchlistError('duplicate')
      if (state.pins.length >= MAX_PINS) throw watchlistError('limit')
      persist({ pins: [...state.pins, item] })
    },
    remove(symbol: any) {
      const pins = state.pins.filter(p => p.symbol !== symbol)
      persist({ pins, selectedSymbol: state.selectedSymbol === symbol ? pins[0]?.symbol ?? null : state.selectedSymbol })
    },
    move(symbol: any, offset: any) {
      const pins = [...state.pins], index = pins.findIndex(p => p.symbol === symbol), target = index + offset
      if (index < 0 || ![-1, 1].includes(offset) || target < 0 || target >= pins.length) return
      ;[pins[index], pins[target]] = [pins[target], pins[index]]
      persist({ pins })
    },
    collapse: (collapsed: any) => persist({ collapsed: Boolean(collapsed) }),
    dispose() { eventTarget?.removeEventListener('storage', storageChanged); listeners.clear() },
  }
}
