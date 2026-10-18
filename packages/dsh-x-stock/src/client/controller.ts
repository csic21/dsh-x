import { MAX_FIXED, MAX_WATCHLIST, fixedItems, watchlistError, normalizeItem, parseSaved, scopedStorageKey, validateScope, legacyScopedStorageKey } from '../watchlist.ts'
import type { WatchlistItem } from '../watchlist.ts'
export interface WatchlistState { items: WatchlistItem[]; collapsed: boolean; barHidden: boolean; storageError: string; scopeStatus: string; scopeId: string | null; placement: string; selectedSymbol: string | null }
export function createWatchlistController(storage?: any, eventTarget?: any) {
  const listeners = new Set<any>()
  let storageKey: any = null
  let state: WatchlistState = { items: [], collapsed: false, barHidden: false, storageError: '', scopeStatus: 'loading', scopeId: null, placement: 'waiting', selectedSymbol: null }
  const publish = (patch: any) => { state = { ...state, ...patch }; for (const listener of listeners) listener() }
  const persist = (patch: any) => {
    if (!storageKey || state.scopeStatus !== 'ready') throw watchlistError('scope-loading')
    publish(patch)
    try {
      if (!storage) throw new Error()
      storage.setItem(storageKey, JSON.stringify({ version: 2, items: state.items, collapsed: state.collapsed, barHidden: state.barHidden }))
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
      let saved: any = { items: [], collapsed: false, barHidden: false }, storageError = ''
      try {
        // Payload v1 kept the watchlist and the bottom bar in one list. Import
        // it once, unfixed, instead of dropping the user's list.
        const raw = storage?.getItem(key) ?? storage?.getItem(legacyScopedStorageKey(validateScope(scope)))
        saved = parseSaved(raw)
      } catch { storageError = 'storage-read' }
      publish({ ...saved, selectedSymbol: saved.items[0]?.symbol ?? null, storageError, scopeStatus: 'ready', scopeId: scope })
    },
    scopeLoading: () => { storageKey = null; publish({ scopeStatus: 'loading', scopeId: null, items: [], selectedSymbol: null, collapsed: false, barHidden: false }) },
    scopeFailed: () => { storageKey = null; publish({ items: [], selectedSymbol: null, scopeStatus: 'failed', scopeId: null, storageError: 'scope-unavailable' }) },
    select: (symbol: any) => publish({ selectedSymbol: symbol }),
    setPlacement: (placement: any) => { if (state.placement !== placement) publish({ placement }) },
    add(raw: any) {
      const item = normalizeItem(raw)
      if (state.items.some(current => current.symbol === item.symbol)) throw watchlistError('duplicate')
      if (state.items.length >= MAX_WATCHLIST) throw watchlistError('limit')
      if (item.fixed && fixedItems(state.items).length >= MAX_FIXED) throw watchlistError('fixed-limit')
      persist({ items: [...state.items, item] })
    },
    remove(symbol: any) {
      const items = state.items.filter(item => item.symbol !== symbol)
      persist({ items, selectedSymbol: state.selectedSymbol === symbol ? items[0]?.symbol ?? null : state.selectedSymbol })
    },
    move(symbol: any, offset: any) {
      const items = [...state.items], index = items.findIndex(item => item.symbol === symbol), target = index + offset
      if (index < 0 || ![-1, 1].includes(offset) || target < 0 || target >= items.length) return
      ;[items[index], items[target]] = [items[target]!, items[index]!]
      persist({ items })
    },
    /** Fixing a stock for the bottom bar is a separate, bounded decision. */
    setFixed(symbol: any, fixed: any) {
      const wanted = fixed === true
      const current = state.items.find(item => item.symbol === symbol)
      if (!current || current.fixed === wanted) return
      if (wanted && fixedItems(state.items).length >= MAX_FIXED) throw watchlistError('fixed-limit')
      persist({ items: state.items.map(item => item.symbol === symbol ? { ...item, fixed: wanted } : item) })
    },
    toggleBar: () => persist({ barHidden: !state.barHidden }),
    collapse: (collapsed: any) => persist({ collapsed: Boolean(collapsed) }),
    dispose() { eventTarget?.removeEventListener('storage', storageChanged); listeners.clear() },
  }
}
