import { MAX_PINS, normalizePin, parseSaved, scopedStorageKey } from '../watchlist.js'
export function createWatchlistController(storage, eventTarget) {
  const listeners = new Set()
  let storageKey = null
  let state = { pins: [], collapsed: false, storageError: '', scopeStatus: 'loading', placement: 'waiting', selectedSymbol: null }
  const publish = patch => { state = { ...state, ...patch }; for (const listener of listeners) listener() }
  const persist = patch => {
    if (!storageKey || state.scopeStatus !== 'ready') throw new Error('正在确认此 profile 的存储位置，请稍后重试。')
    publish(patch)
    try {
      if (!storage) throw new Error()
      storage.setItem(storageKey, JSON.stringify({ version: 1, pins: state.pins, collapsed: state.collapsed }))
      publish({ storageError: '' })
    } catch { publish({ storageError: '无法保存到此浏览器；当前修改仅在本次使用有效。' }) }
  }
  const storageChanged = event => {
    if (!storageKey || state.scopeStatus !== 'ready' || event.key !== storageKey) return
    try { publish({ ...parseSaved(event.newValue), storageError: '' }) } catch { publish({ storageError: '另一窗口的清单格式无效，已保留当前清单。' }) }
  }
  eventTarget?.addEventListener('storage', storageChanged)
  return {
    source: { getSnapshot: () => state, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) } },
    setScope(scope) {
      const key = scopedStorageKey(scope)
      if (key === storageKey && state.scopeStatus === 'ready') return
      storageKey = key
      let saved = { pins: [], collapsed: false }, storageError = ''
      try { saved = parseSaved(storage?.getItem(storageKey)) } catch { storageError = '无法读取此 profile 的本地清单；本次修改前不会覆盖原记录。' }
      publish({ ...saved, selectedSymbol: saved.pins[0]?.symbol ?? null, storageError, scopeStatus: 'ready' })
    },
    scopeLoading: () => { storageKey = null; publish({ scopeStatus: 'loading', pins: [], selectedSymbol: null, collapsed: false }) },
    scopeFailed: () => { storageKey = null; publish({ pins: [], selectedSymbol: null, scopeStatus: 'failed', storageError: '无法确认此 profile 的存储位置；已暂停读取和保存清单。' }) },
    select: symbol => publish({ selectedSymbol: symbol }),
    setPlacement: placement => { if (state.placement !== placement) publish({ placement }) },
    add(pin) {
      const item = normalizePin(pin)
      if (state.pins.some(p => p.symbol === item.symbol)) throw new Error('这只股票已经固定。')
      if (state.pins.length >= MAX_PINS) throw new Error('最多固定八只股票，请先移除一只。')
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
