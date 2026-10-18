// Shared browser/host contract. Quotes and credentials are never persisted.
// Error codes are stable data; the client owns localized presentation.
export const watchlistError = (code) => Object.assign(new Error(code), { code });
export const MAX_PINS = 8;
export const STORAGE_KEY = 'dsh-x-stock:watchlist:v1';
export const QUOTE_CHANNEL = '/api';
export const QUOTE_ENDPOINT = 'dsh-x-stock.quotes';
export function normalizeAShare(exchange, code) {
    const market = String(exchange).trim().toUpperCase();
    const digits = String(code).trim();
    if (!['SH', 'SZ', 'BJ'].includes(market) || !/^\d{6}$/.test(digits))
        throw watchlistError('invalid-code');
    return `${market}.${digits}`;
}
export function validateSymbol(symbol) {
    if (typeof symbol !== 'string' || !/^(SH|SZ|BJ)\.\d{6}$/.test(symbol))
        throw watchlistError('invalid-symbol');
    return symbol;
}
export function normalizePin(raw) {
    const pin = raw;
    if (!pin || typeof pin !== 'object')
        throw watchlistError('invalid-pin');
    const symbol = validateSymbol(pin.symbol);
    const alias = typeof pin.alias === 'string' ? pin.alias.trim().slice(0, 24) : '';
    return { symbol, alias };
}
export function parseSaved(raw) {
    if (!raw)
        return { pins: [], collapsed: false };
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !Array.isArray(value.pins) || value.pins.length > MAX_PINS)
        throw watchlistError('invalid-saved');
    const pins = value.pins.map(normalizePin);
    if (new Set(pins.map((p) => p.symbol)).size !== pins.length)
        throw watchlistError('duplicate-saved');
    return { pins, collapsed: value.collapsed === true };
}
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
export const SCOPE_ENDPOINT = 'dsh-x-stock.scope';
export function validateScope(scope) {
    if (typeof scope !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(scope))
        throw watchlistError('invalid-scope');
    return scope.toLowerCase();
}
export const scopedStorageKey = (scope) => `${STORAGE_KEY}:${validateScope(scope)}`;
