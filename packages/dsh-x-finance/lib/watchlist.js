export const watchlistError = (code) => Object.assign(new Error(code), { code });
/** Safety bound for the scrollable page list, not a product limit. */
export const MAX_WATCHLIST = 200;
/** The bottom bar is a glanceable strip and stays small on purpose. */
export const MAX_FIXED = 8;
export const STORAGE_KEY = 'dsh-x-finance:watchlist:v2';
/** Pre-split payloads (watchlist == bottom bar) are imported once, unfixed. */
export const LEGACY_STORAGE_KEY = 'dsh-x-finance:watchlist:v1';
/**
 * Keys written before the plugin was renamed from `dsh-x-stock`. The payload
 * is identical, so an existing list is read once as a fallback instead of
 * being silently dropped.
 */
export const PREVIOUS_STORAGE_KEY = 'dsh-x-stock:watchlist:v2';
export const PREVIOUS_LEGACY_STORAGE_KEY = 'dsh-x-stock:watchlist:v1';
export const QUOTE_CHANNEL = '/api';
export function normalizeAShare(exchange, code) {
    const market = String(exchange).trim().toUpperCase();
    const digits = String(code).trim();
    if (!['SH', 'SZ', 'BJ'].includes(market) || !/^\d{6}$/.test(digits))
        throw watchlistError('invalid-code');
    return `${market}.${digits}`;
}
/**
 * The A-share exchange identity. Everything that is inherently A-share — daily
 * history, intraday, fundamentals, holdings, signals, the tail scan — keeps
 * using this narrower validator, so an overseas row can never drift into a
 * route that would answer it with the wrong market's fields.
 */
export function validateSymbol(symbol) {
    if (typeof symbol !== 'string' || !/^(SH|SZ|BJ)\.\d{6}$/.test(symbol))
        throw watchlistError('invalid-symbol');
    return symbol;
}
const CN_SYMBOL = /^(SH|SZ|BJ)\.\d{6}$/;
// Hong Kong listings are five digits with their leading zeros; the Hang Seng
// indices (`HK.HSI`) are letters and belong to the chart-only index route.
const HK_SYMBOL = /^HK\.\d{5}$/;
// The same ticker shape the US board uses, including a dotted class (`BRK.A`).
const US_SYMBOL = /^US\.[A-Z][A-Z0-9]{0,5}(?:\.[A-Z])?$/;
/** Which board a saved symbol belongs to. Throws for anything else. */
export function marketOf(symbol) {
    if (typeof symbol !== 'string')
        throw watchlistError('invalid-symbol');
    if (CN_SYMBOL.test(symbol))
        return 'cn';
    if (HK_SYMBOL.test(symbol))
        return 'hk';
    if (US_SYMBOL.test(symbol))
        return 'us';
    throw watchlistError('invalid-symbol');
}
/** True for a watchable listing on any of the three boards. */
export function isWatchSymbol(symbol) {
    try {
        marketOf(symbol);
        return true;
    }
    catch {
        return false;
    }
}
/** True when the symbol is an overseas listing rather than an A-share one. */
export function isOverseasSymbol(symbol) {
    try {
        return marketOf(symbol) !== 'cn';
    }
    catch {
        return false;
    }
}
/** The widest identity the watchlist accepts: A-share, Hong Kong or US. */
export function validateWatchSymbol(symbol) {
    if (!isWatchSymbol(symbol))
        throw watchlistError('invalid-symbol');
    return symbol;
}
// Shape only: the venue must still belong to the symbol, which the US route
// checks against its own allowlist before a request is made.
const US_VENUE_CODE = /^[A-Z][A-Z0-9]{0,5}(?:\.[A-Z])?\.[A-Z]{1,2}$/;
export function normalizeItem(raw) {
    const item = raw;
    if (!item || typeof item !== 'object')
        throw watchlistError('invalid-item');
    const symbol = validateWatchSymbol(item.symbol);
    const alias = typeof item.alias === 'string' ? item.alias.trim().slice(0, 24) : '';
    const code = marketOf(symbol) === 'us' && typeof item.code === 'string'
        ? item.code.trim().toUpperCase()
        : '';
    if (code && !US_VENUE_CODE.test(code))
        throw watchlistError('invalid-item');
    return { symbol, alias, fixed: item.fixed === true, ...(code ? { code } : {}) };
}
export function parseSaved(raw) {
    if (!raw)
        return { items: [], collapsed: false, barHidden: false };
    const value = JSON.parse(raw);
    // version 1: `pins` was both the watchlist and the bottom bar.
    if (value?.version === 1) {
        if (!Array.isArray(value.pins) || value.pins.length > MAX_WATCHLIST)
            throw watchlistError('invalid-saved');
        const items = value.pins.map(normalizeItem);
        if (new Set(items.map((item) => item.symbol)).size !== items.length)
            throw watchlistError('duplicate-saved');
        return { items, collapsed: value.collapsed === true, barHidden: false };
    }
    if (value?.version !== 2 || !Array.isArray(value.items) || value.items.length > MAX_WATCHLIST)
        throw watchlistError('invalid-saved');
    const items = value.items.map(normalizeItem);
    if (new Set(items.map((item) => item.symbol)).size !== items.length)
        throw watchlistError('duplicate-saved');
    if (items.filter((item) => item.fixed).length > MAX_FIXED)
        throw watchlistError('invalid-saved');
    return { items, collapsed: value.collapsed === true, barHidden: value.barHidden === true };
}
export const fixedItems = (items) => items.filter(item => item.fixed);
export function quoteStatus(quote, now = Date.now()) {
    if (!quote || quote.status === 'unconfigured')
        return 'unconfigured';
    if (quote.status === 'unavailable')
        return 'unavailable';
    if (!quote.quotedAt || !Number.isFinite(Date.parse(quote.quotedAt)))
        return 'unknown-time';
    if (now - Date.parse(quote.quotedAt) > 180_000)
        return 'stale';
    return quote.marketStatus === 'closed' ? 'closed' : 'recent';
}
export const SCOPE_ENDPOINT = 'dsh-x-finance.scope';
export function validateScope(scope) {
    if (typeof scope !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(scope))
        throw watchlistError('invalid-scope');
    return scope.toLowerCase();
}
export const scopedStorageKey = (scope) => `${STORAGE_KEY}:${validateScope(scope)}`;
export const legacyScopedStorageKey = (scope) => `${LEGACY_STORAGE_KEY}:${validateScope(scope)}`;
/** Read-only fallbacks from the pre-rename plugin id, newest first. */
export const previousScopedStorageKeys = (scope) => {
    const id = validateScope(scope);
    return [`${PREVIOUS_STORAGE_KEY}:${id}`, `${PREVIOUS_LEGACY_STORAGE_KEY}:${id}`];
};
