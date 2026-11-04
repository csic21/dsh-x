// Shared instrument-directory contract for the page lookup. The directory is
// a symbol-resolution aid, not a quote feed: it never carries prices, and
// nothing here fetches the network. The Host provider projects the upstream
// suggestion payload into the fields below before it reaches clients.
//
// Two markets share the same upstream host. A-share entries resolve to an
// exchange-qualified `SH.600519` identity; US entries resolve to `US.AAPL`
// plus the venue-qualified code (`AAPL.OQ`) the US daily endpoint requires.
// The US directory does not distinguish stocks from ETFs, so a US match keeps
// `kind: 'stock'` and the UI labels the market instead of the class.
import { normalizeUsCode, normalizeUsSymbol, parseUsDirectoryCode } from './us-market.ts'

export const SEARCH_RPC_ENDPOINT = 'dsh-x-finance.search'
export const SEARCH_SOURCE_NAME = 'smartbox.gtimg.cn (unofficial)'
export const SEARCH_MAX_QUERY = 24
export const SEARCH_MAX_RESULTS = 10

/** Exchange-tradable kinds the watchlist can hold. */
export type InstrumentKind = 'stock' | 'etf' | 'fund' | 'reit'
/** `cn` is the A-share watchlist directory; `us` adds view-only US listings. */
export type InstrumentMarket = 'cn' | 'us'

export interface InstrumentMatch {
  /** Exchange-qualified identity, e.g. `SZ.002594` or `US.BRK.A`. */
  symbol: string
  /** Directory name as returned by the source; never verified with an exchange. */
  name: string
  kind: InstrumentKind
  market: InstrumentMarket
  /** US only: the venue-qualified code the daily endpoint needs, e.g. `AAPL.OQ`. */
  code?: string
}

export type SearchRequest =
  | { action: 'status' }
  | { action: 'search', query: string, market: InstrumentMarket }

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

function normalizeMarket(raw: unknown): InstrumentMarket {
  return raw === 'us' ? 'us' : 'cn'
}

export function parseSearchRequest(payload: unknown): SearchRequest {
  if (!payload || Object.getPrototypeOf(payload) !== Object.prototype) fail('invalid-request')
  const value = payload as Record<string, unknown>
  const keys = Object.keys(value).sort()
  if (keys.length === 1 && keys[0] === 'action' && value.action === 'status') return { action: 'status' }
  const search = keys.length === 2
    ? keys[0] === 'action' && keys[1] === 'query'
    : keys.length === 3 && keys[0] === 'action' && keys[1] === 'market' && keys[2] === 'query'
  if (value.action === 'search' && search) {
    // An absent market is the pre-existing A-share behaviour; an explicit value
    // must be one of the two known markets rather than any string.
    if (keys.length === 3 && value.market !== 'cn' && value.market !== 'us') fail('invalid-request')
    return { action: 'search', query: normalizeSearchQuery(value.query), market: normalizeMarket(value.market) }
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

/** Splits the `v_hint="..."` body into `~`-separated entries. */
function hintEntries(payload: unknown): string[][] {
  if (typeof payload !== 'string' || payload.length > 262_144) fail('invalid-search-payload')
  const match = HINT.exec(payload.trim())
  if (!match) fail('invalid-search-payload')
  const body = match[1]!
  if (!body || body === 'N') return []
  return body.split('^').map(raw => raw.split('~'))
}

/**
 * Parses the A-share `v_hint="..."` suggestion payload. Entries are
 * `^`-separated and fields are `~`-separated: market, code, escaped name,
 * pinyin, class. Malformed entries are skipped rather than trusted; a
 * `v_hint="N"` body means no match. Exported for offline tests.
 */
export function parseInstrumentHints(payload: unknown): InstrumentMatch[] {
  const results: InstrumentMatch[] = []
  const seen = new Set<string>()
  for (const fields of hintEntries(payload)) {
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
    results.push({ symbol, name, kind, market: 'cn' })
    if (results.length >= SEARCH_MAX_RESULTS) break
  }
  return results
}

/**
 * Parses the US entries of the same payload: market `us`, class `GP`, and a
 * venue-qualified code (`aapl.oq`, `brk.a.n`). The venue is stripped from the
 * identity and kept as `code`, because the quote host takes the bare ticker
 * while the daily host takes the qualified one. Unknown venues are skipped
 * instead of being guessed. Exported for offline tests.
 */
export function parseUsInstrumentHints(payload: unknown): InstrumentMatch[] {
  const results: InstrumentMatch[] = []
  const seen = new Set<string>()
  for (const fields of hintEntries(payload)) {
    if (fields.length < 5) continue
    if ((fields[0] ?? '').toLowerCase() !== 'us' || fields[4] !== 'GP') continue
    const parsed = parseUsDirectoryCode(fields[1])
    if (!parsed) continue
    const name = decodeName(fields[2])
    if (!name) continue
    const symbol = `US.${parsed.ticker}`
    if (seen.has(symbol)) continue
    seen.add(symbol)
    results.push({ symbol, name, kind: 'stock', market: 'us', code: parsed.code })
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
  // An absent market is the pre-existing A-share behaviour, so a provider
  // compiled against the previous contract keeps working; an explicit unknown
  // value is still rejected rather than silently read as A-share.
  const market = match.market === undefined || match.market === 'cn' ? 'cn' : match.market === 'us' ? 'us' : null
  if (typeof symbol !== 'string' || !name || [...name].length > 64) fail('invalid-match')
  if (kind !== 'stock' && kind !== 'etf' && kind !== 'fund' && kind !== 'reit') fail('invalid-match')
  if (market === null) fail('invalid-match')
  if (market === 'cn') {
    if (!/^(SH|SZ|BJ)\.\d{6}$/.test(symbol)) fail('invalid-match')
    return { symbol, name, kind, market }
  }
  try {
    const canonical = normalizeUsSymbol(symbol)
    if (match.code === undefined) return { symbol: canonical, name, kind, market }
    return { symbol: canonical, name, kind, market, code: normalizeUsCode(match.code, canonical) }
  } catch { fail('invalid-match') }
}
