// Shared instrument-directory contract for the watchlist name search.
// The directory is a symbol-resolution aid, not a quote feed: it never carries
// prices, and nothing here fetches the network. The Host provider projects the
// upstream suggestion payload into the fields below before it reaches clients.
export const SEARCH_RPC_ENDPOINT = 'dsh-x-finance.search'
export const SEARCH_SOURCE_NAME = 'smartbox.gtimg.cn (unofficial)'
export const SEARCH_MAX_QUERY = 24
export const SEARCH_MAX_RESULTS = 10

/** Exchange-tradable kinds the watchlist can hold. */
export type InstrumentKind = 'stock' | 'etf' | 'fund' | 'reit'

export interface InstrumentMatch {
  /** Exchange-qualified A-share identity, e.g. `SZ.002594`. */
  symbol: string
  /** Directory name as returned by the source; never verified with an exchange. */
  name: string
  kind: InstrumentKind
}

export type SearchRequest =
  | { action: 'status' }
  | { action: 'search', query: string }

// Only exchange-tradable classes are acceptlisted. `GP` (HK/US), `ZS`
// (indices), `KJ`/`KJ-CX` (off-exchange funds) and `QZ` are deliberately out of
// scope: the watchlist is an A-share page, and a price-free directory should
// not silently widen which instruments it can pin.
const KIND_BY_CLASS: Record<string, InstrumentKind> = {
  'GP-A': 'stock',
  'ETF': 'etf',
  'QDII-ETF': 'etf',
  'LOF': 'fund',
  'QDII-LOF': 'fund',
  'FJ': 'reit',
}
const MARKETS = new Set(['sh', 'sz', 'bj'])
const CONTROL = /[\u0000-\u001f\u007f]/g
const HINT = /^v_hint="([^"]*)"\s*;?\s*$/u

function fail(code: string): never {
  throw Object.assign(new Error(code), { code })
}

/** Trims, NFC-normalises and bounds a user query before it is sent upstream. */
export function normalizeSearchQuery(raw: unknown): string {
  if (typeof raw !== 'string') fail('invalid-query')
  const query = raw.normalize('NFC').trim().replace(/\s+/g, ' ')
  if (!query || [...query].length > SEARCH_MAX_QUERY || /[\u0000-\u001f\u007f]/u.test(query)) fail('invalid-query')
  // Reject punctuation-only probes; every real query (name fragment, pinyin
  // initials or code) contains at least one letter or digit.
  if (!/[\p{L}\p{N}]/u.test(query)) fail('invalid-query')
  return query
}

export function parseSearchRequest(payload: unknown): SearchRequest {
  if (!payload || Object.getPrototypeOf(payload) !== Object.prototype) fail('invalid-request')
  const value = payload as Record<string, unknown>
  const keys = Object.keys(value).sort()
  if (keys.length === 1 && keys[0] === 'action' && value.action === 'status') return { action: 'status' }
  if (keys.length === 2 && keys[0] === 'action' && keys[1] === 'query' && value.action === 'search') {
    return { action: 'search', query: normalizeSearchQuery(value.query) }
  }
  fail('invalid-request')
}

function decodeName(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  // The endpoint escapes CJK as \uXXXX inside a JavaScript string literal.
  const text = raw
    .replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(CONTROL, '')
    .trim()
  if (!text || [...text].length > 64) return ''
  return text
}

/**
 * Parses the `v_hint="..."` suggestion payload. Entries are `^`-separated and
 * fields are `~`-separated: market, code, escaped name, pinyin, class.
 * Malformed entries are skipped rather than trusted; `v_hint="N"` means no
 * match. Exported for offline tests.
 */
export function parseInstrumentHints(payload: unknown): InstrumentMatch[] {
  if (typeof payload !== 'string' || payload.length > 262_144) fail('invalid-search-payload')
  const match = HINT.exec(payload.trim())
  if (!match) fail('invalid-search-payload')
  const body = match[1]!
  if (!body || body === 'N') return []
  const results: InstrumentMatch[] = []
  const seen = new Set<string>()
  for (const raw of body.split('^')) {
    const fields = raw.split('~')
    if (fields.length < 5) continue
    const market = (fields[0] ?? '').toLowerCase()
    const code = fields[1] ?? ''
    const kind = KIND_BY_CLASS[fields[4] ?? '']
    if (!kind || !MARKETS.has(market) || !/^\d{6}$/.test(code)) continue
    const name = decodeName(fields[2])
    if (!name) continue
    const symbol = `${market.toUpperCase()}.${code}`
    if (seen.has(symbol)) continue
    seen.add(symbol)
    results.push({ symbol, name, kind })
    if (results.length >= SEARCH_MAX_RESULTS) break
  }
  return results
}

export function normalizeMatch(raw: unknown): InstrumentMatch {
  const match = raw as Record<string, unknown> | null
  if (!match || typeof match !== 'object') fail('invalid-match')
  const symbol = match.symbol
  const name = typeof match.name === 'string' ? match.name.replace(CONTROL, '').trim() : ''
  const kind = match.kind
  if (typeof symbol !== 'string' || !/^(SH|SZ|BJ)\.\d{6}$/.test(symbol)) fail('invalid-match')
  if (!name || [...name].length > 64) fail('invalid-match')
  if (kind !== 'stock' && kind !== 'etf' && kind !== 'fund' && kind !== 'reit') fail('invalid-match')
  return { symbol, name, kind }
}
