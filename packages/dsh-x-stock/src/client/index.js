import { createWatchlistController } from './controller.js'
import { mountWhenVacant } from './placement.js'
import { quoteResource } from './resource.js'
import { StockBar, StockPage, StockIcon } from './components.jsx'
import { SCOPE_ENDPOINT } from '../watchlist.js'
import { CSS } from './styles.js'

export const inject = ['slots', 'connection', 'resources', 'layout']
export function apply(ctx) {
  let storage
  try { storage = globalThis.localStorage } catch { /* Restricted browser storage is reported in the UI. */ }
  const controller = createWatchlistController(storage, globalThis.window)
  let scopeRequest
  let disposed = false
  const loadScope = async () => {
    scopeRequest?.abort()
    const request = new AbortController()
    scopeRequest = request
    controller.scopeLoading()
    const timeout = setTimeout(() => { if (!disposed && scopeRequest === request) { controller.scopeFailed(); request.abort() } }, 10_000)
    try {
      const result = await ctx.connection.rpc.call('/api', SCOPE_ENDPOINT, {}, request.signal)
      if (disposed || request.signal.aborted) return
      if (!result.ok) throw new Error()
      controller.setScope(result.value.scope)
    } catch { if (!disposed && !request.signal.aborted) controller.scopeFailed() }
    finally { clearTimeout(timeout) }
  }
  ctx.effect(() => () => { disposed = true; scopeRequest?.abort(); controller.dispose() }, 'stock: watchlist')
  ctx.on('connection/reset', () => { void loadScope() })
  void loadScope()
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = 'dsh-x-stock'
    style.textContent = CSS
    document.head.appendChild(style)
    return () => style.remove()
  }, 'stock: styles')
  ctx.effect(() => ctx.resources.register(quoteResource(ctx.connection.rpc)), 'stock: quote resources')
  const face = () => ({
    hooks: { watchlist: controller.source },
    retryScope: () => { void loadScope() },
    add: pin => { controller.add(pin); controller.select(pin.symbol) },
    remove: controller.remove, move: controller.move, select: controller.select, collapse: controller.collapse,
    open: symbol => { if (symbol) controller.select(symbol); ctx.layout.selectPanel('dsh-x-stock') },
    back: () => ctx.layout.selectPanel(null),
  })
  mountWhenVacant(ctx.slots, { inject: face }, StockBar, controller.setPlacement)
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'dsh-x-stock', inject: face }, StockPage))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'dsh-x-stock', order: 80, label: '股票' }, StockIcon))
}
