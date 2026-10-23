// Shared browser/host contract for the manual watchlist. The watchlist is a
// long list that only the stock page renders; being on it does NOT put a stock
// in the bottom bar. Only items explicitly marked `fixed` appear there, and
// that bar is the single bounded collection. Quotes and credentials are never
// persisted. Error codes are stable data; the client owns localized
// presentation.
export interface WatchlistItem { symbol: string; alias: string; fixed: boolean }
export interface SavedWatchlist { items: WatchlistItem[]; collapsed: boolean; barHidden: boolean }
export const watchlistError = (code: any) => Object.assign(new Error(code), { code })
/** Safety bound for the scrollable page list, not a product limit. */
export const MAX_WATCHLIST = 200
/** The bottom bar is a glanceable strip and stays small on purpose. */
export const MAX_FIXED = 8
export const STORAGE_KEY = 'dsh-x-finance:watchlist:v2'
/** Pre-split payloads (watchlist == bottom bar) are imported once, unfixed. */
export const LEGACY_STORAGE_KEY = 'dsh-x-finance:watchlist:v1'
/**
 * Keys written before the plugin was renamed from `dsh-x-stock`. The payload
 * is identical, so an existing list is read once as a fallback instead of
 * being silently dropped.
 */
export const PREVIOUS_STORAGE_KEY = 'dsh-x-stock:watchlist:v2'
export const PREVIOUS_LEGACY_STORAGE_KEY = 'dsh-x-stock:watchlist:v1'
export const QUOTE_CHANNEL = '/api'
export function normalizeAShare(exchange: unknown, code: unknown): string {
  const market = String(exchange).trim().toUpperCase()
  const digits = String(code).trim()
  if (!['SH', 'SZ', 'BJ'].includes(market) || !/^\d{6}$/.test(digits)) throw watchlistError('invalid-code')
  return `${market}.${digits}`
}
export function validateSymbol(symbol: unknown): string {
  if (typeof symbol !== 'string' || !/^(SH|SZ|BJ)\.\d{6}$/.test(symbol)) throw watchlistError('invalid-symbol')
  return symbol
}
export function normalizeItem(raw: unknown): WatchlistItem {
  const item = raw as {symbol?: unknown, alias?: unknown, fixed?: unknown}
  if (!item || typeof item !== 'object') throw watchlistError('invalid-item')
  const symbol = validateSymbol(item.symbol)
  const alias = typeof item.alias === 'string' ? item.alias.trim().slice(0, 24) : ''
  return { symbol, alias, fixed: item.fixed === true }
}
export function parseSaved(raw: string | null | undefined): SavedWatchlist {
  if (!raw) return { items: [], collapsed: false, barHidden: false }
  const value = JSON.parse(raw)
  // version 1: `pins` was both the watchlist and the bottom bar.
  if (value?.version === 1) {
    if (!Array.isArray(value.pins) || value.pins.length > MAX_WATCHLIST) throw watchlistError('invalid-saved')
    const items = value.pins.map(normalizeItem)
    if (new Set(items.map((item: WatchlistItem) => item.symbol)).size !== items.length) throw watchlistError('duplicate-saved')
    return { items, collapsed: value.collapsed === true, barHidden: false }
  }
  if (value?.version !== 2 || !Array.isArray(value.items) || value.items.length > MAX_WATCHLIST) throw watchlistError('invalid-saved')
  const items = value.items.map(normalizeItem)
  if (new Set(items.map((item: WatchlistItem) => item.symbol)).size !== items.length) throw watchlistError('duplicate-saved')
  if (items.filter((item: WatchlistItem) => item.fixed).length > MAX_FIXED) throw watchlistError('invalid-saved')
  return { items, collapsed: value.collapsed === true, barHidden: value.barHidden === true }
}
export const fixedItems = (items: WatchlistItem[]) => items.filter(item => item.fixed)
export function quoteStatus(quote?: any, now = Date.now()) {
  if (!quote || quote.status === 'unconfigured') return 'unconfigured'
  if (quote.status === 'unavailable') return 'unavailable'
  if (!quote.quotedAt || !Number.isFinite(Date.parse(quote.quotedAt))) return 'unknown-time'
  if (now - Date.parse(quote.quotedAt) > 180_000) return 'stale'
  return quote.marketStatus === 'closed' ? 'closed' : 'recent'
}
export const SCOPE_ENDPOINT = 'dsh-x-finance.scope'
export function validateScope(scope: unknown): string {
  if (typeof scope !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(scope)) throw watchlistError('invalid-scope')
  return scope.toLowerCase()
}
export const scopedStorageKey = (scope: any) => `${STORAGE_KEY}:${validateScope(scope)}`
export const legacyScopedStorageKey = (scope: any) => `${LEGACY_STORAGE_KEY}:${validateScope(scope)}`
/** Read-only fallbacks from the pre-rename plugin id, newest first. */
export const previousScopedStorageKeys = (scope: any) => {
  const id = validateScope(scope)
  return [`${PREVIOUS_STORAGE_KEY}:${id}`, `${PREVIOUS_LEGACY_STORAGE_KEY}:${id}`]
}
