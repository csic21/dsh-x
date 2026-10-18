import { createWatchlistController } from './controller.ts'
import { mountWhenVacant } from './placement.ts'
import { quoteResource } from './resource.ts'
import { StockBar, StockPage, StockIcon } from './components.tsx'
import { isFixedBarShortcut } from './shortcut.ts'
import { fixedItems, SCOPE_ENDPOINT } from '../watchlist.ts'
import { CSS } from './styles.ts'
import { NS, zh, en } from './locales.ts'
import { createFormatters } from './format.ts'
import { StockToolView } from './tool-view.tsx'

export const inject = ['slots', 'connection', 'resources', 'layout', 'locale']
export function apply(ctx: any) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'stock: dictionaries')
  const t = ctx.locale.bind(NS)
  const format = createFormatters(() => ctx.locale.getLocale().active)
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: 'dsh_x_stock_quote', locale: NS, inject: () => ({ format }) }, StockToolView))
  let storage
  try { storage = globalThis.localStorage } catch { /* Restricted browser storage is reported in the UI. */ }
  const controller = createWatchlistController(storage, globalThis.window)
  let scopeRequest: any
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
  // Alt+Shift+S shows or hides the fixed bar from anywhere in the app. Typing
  // in a field keeps the key, and storage failures stay visible in the UI.
  const shortcut = (event: any) => {
    if (!isFixedBarShortcut(event)) return
    event.preventDefault()
    try { controller.toggleBar() } catch { /* Storage state is reported by the page. */ }
  }
  globalThis.addEventListener?.('keydown', shortcut, true)
  ctx.effect(() => () => globalThis.removeEventListener?.('keydown', shortcut, true), 'stock: fixed bar shortcut')
  const face = () => ({
    format, rpc: ctx.connection.rpc, getLocale: () => ctx.locale.getLocale().active,
    hooks: { watchlist: controller.source },
    retryScope: () => { void loadScope() },
    add: (item: any) => { controller.add(item); controller.select(item.symbol) },
    remove: controller.remove, move: controller.move, select: controller.select, collapse: controller.collapse,
    setFixed: controller.setFixed, toggleBar: controller.toggleBar, hideBar: controller.toggleBar,
    open: (symbol: any) => { if (symbol) controller.select(symbol); ctx.layout.selectPanel('dsh-x-stock') },
    back: () => ctx.layout.selectPanel(null),
  })
  // The bottom slot is single and contested: occupy it only while at least one
  // stock is fixed and the user has not hidden the bar.
  mountWhenVacant(ctx.slots, { inject: face, locale: NS }, StockBar, {
    onPlacement: controller.setPlacement,
    visible: () => {
      const state = controller.source.getSnapshot()
      return !state.barHidden && fixedItems(state.items).length > 0
    },
    subscribe: controller.source.subscribe,
  })
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'dsh-x-stock', inject: face, locale: NS }, StockPage))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'dsh-x-stock', order: 80, label: () => t('title') }, StockIcon))
}
