// Shared browser/host contract for the manual watchlist. The watchlist is a
// long list that only the stock page renders; being on it does NOT put a stock
// in the bottom bar. Only items explicitly marked `fixed` appear there, and
// that bar is the single bounded collection. Quotes and credentials are never
// persisted. Error codes are stable data; the client owns localized
// presentation.
export interface WatchlistItem {
  symbol: string
  alias: string
  fixed: boolean
  /**
   * US only: the venue-qualified code (`AAPL.OQ`) the daily endpoint needs.
   * Without it a saved US row could show a quote but not its chart, so it is
   * carried with the item instead of being re-derived on every open. The US
   * route re-validates it; this field is not a trust boundary.
   */
  code?: string
}
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
/**
 * The A-share exchange identity. Everything that is inherently A-share — daily
 * history, intraday, fundamentals, holdings, signals, the tail scan — keeps
 * using this narrower validator, so an overseas row can never drift into a
 * route that would answer it with the wrong market's fields.
 */
export function validateSymbol(symbol: unknown): string {
  if (typeof symbol !== 'string' || !/^(SH|SZ|BJ)\.\d{6}$/.test(symbol)) throw watchlistError('invalid-symbol')
  return symbol
}

/** The three boards the page can save. */
export type WatchMarket = 'cn' | 'hk' | 'us'
const CN_SYMBOL = /^(SH|SZ|BJ)\.\d{6}$/
// Hong Kong listings are five digits with their leading zeros; the Hang Seng
// indices (`HK.HSI`) are letters and belong to the chart-only index route.
const HK_SYMBOL = /^HK\.\d{5}$/
// The same ticker shape the US board uses, including a dotted class (`BRK.A`).
const US_SYMBOL = /^US\.[A-Z][A-Z0-9]{0,5}(?:\.[A-Z])?$/

/** Which board a saved symbol belongs to. Throws for anything else. */
export function marketOf(symbol: unknown): WatchMarket {
  if (typeof symbol !== 'string') throw watchlistError('invalid-symbol')
  if (CN_SYMBOL.test(symbol)) return 'cn'
  if (HK_SYMBOL.test(symbol)) return 'hk'
  if (US_SYMBOL.test(symbol)) return 'us'
  throw watchlistError('invalid-symbol')
}

/** True for a watchable listing on any of the three boards. */
export function isWatchSymbol(symbol: unknown): boolean {
  try { marketOf(symbol); return true } catch { return false }
}

/** True when the symbol is an overseas listing rather than an A-share one. */
export function isOverseasSymbol(symbol: unknown): boolean {
  try { return marketOf(symbol) !== 'cn' } catch { return false }
}

/** The widest identity the watchlist accepts: A-share, Hong Kong or US. */
export function validateWatchSymbol(symbol: unknown): string {
  if (!isWatchSymbol(symbol)) throw watchlistError('invalid-symbol')
  return symbol as string
}

// Shape only: the venue must still belong to the symbol, which the US route
// checks against its own allowlist before a request is made.
const US_VENUE_CODE = /^[A-Z][A-Z0-9]{0,5}(?:\.[A-Z])?\.[A-Z]{1,2}$/

export function normalizeItem(raw: unknown): WatchlistItem {
  const item = raw as {symbol?: unknown, alias?: unknown, fixed?: unknown, code?: unknown}
  if (!item || typeof item !== 'object') throw watchlistError('invalid-item')
  const symbol = validateWatchSymbol(item.symbol)
  const alias = typeof item.alias === 'string' ? item.alias.trim().slice(0, 24) : ''
  const code = marketOf(symbol) === 'us' && typeof item.code === 'string'
    ? item.code.trim().toUpperCase()
    : ''
  if (code && !US_VENUE_CODE.test(code)) throw watchlistError('invalid-item')
  return { symbol, alias, fixed: item.fixed === true, ...(code ? { code } : {}) }
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
