// Shared US-stock contract for the page lookup. Everything here is plain data
// and pure functions, so the Host, the browser bundle and the tests agree on
// identities, request shapes and validation without a network in the room.
//
// The US board is part of the same explicitly opt-in local free source as the
// A-share board: one switch, one unofficial host family (Tencent), no API key.
// It is quote + forward-adjusted daily bars only. There is no US fundamentals,
// no minute feed, no batch watchlist and no trading surface here.
import { MAX_ABSOLUTE_PRICE } from './chart-data.ts'
import { zonedQuoteTime } from './global.ts'
import { zoneToday } from './market.ts'
import type { MarketDailyBar, MarketHistory } from './market.ts'

export const US_ENDPOINT = 'dsh-x-finance.us'
export const US_SOURCE_NAME = '腾讯美股 (unofficial)'
export const US_CURRENCY = 'USD' as const
export const US_EXCHANGE_TIME_ZONE = 'America/New_York' as const
/** Four years of daily bars, the same ceiling the A-share chart uses. */
export const US_MAX_HISTORY = 1_000
export const US_QUOTE_MAX_BYTES = 64 * 1024
export const US_HISTORY_MAX_BYTES = 512 * 1024
export const US_TIMEOUT_MS = 10_000
/**
 * A US listing can suspend for months and still have a meaningful last price;
 * the timestamp is reported as-is and the browser marks it old. A year is the
 * point where a row stops describing "this security" and starts describing
 * history, so it is the only age cutoff applied here.
 */
export const US_MAX_QUOTE_AGE_MS = 365 * 24 * 60 * 60_000

/**
 * The directory answers `us~aapl.oq~Apple~apple~GP`; the last segment is the
 * venue, not part of the ticker. Only the venues that were observed and
 * cross-checked are accepted — an unknown suffix is skipped rather than guessed.
 */
export const US_VENUES = new Set(['oq', 'n', 'am', 'ps', 'pk'])
const CODE_SHAPE = /^([A-Z][A-Z0-9]{0,5}(?:\.[A-Z])?)\.([A-Z]{1,2})$/
const SYMBOL_SHAPE = /^US\.([A-Z][A-Z0-9]{0,5}(?:\.[A-Z])?)$/

export function usError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code })
}

/** Canonical `US.<ticker>` identity. Rejects A-share, Hong Kong and index codes. */
export function normalizeUsSymbol(input: unknown): string {
  if (typeof input !== 'string') throw usError('finance/us-symbol', '美股代码无效。')
  const match = SYMBOL_SHAPE.exec(input.trim().toUpperCase())
  if (!match) throw usError('finance/us-symbol', '美股代码须形如 US.AAPL。')
  return `US.${match[1]}`
}

export function isUsSymbol(input: unknown): boolean {
  return typeof input === 'string' && SYMBOL_SHAPE.test(input.trim().toUpperCase())
}

/** Ticker only: `US.BRK.A` → `BRK.A`, the part the quote endpoint accepts. */
export function usTickerOf(symbol: string): string {
  const match = SYMBOL_SHAPE.exec(normalizeUsSymbol(symbol))
  return match![1]!
}

/**
 * The venue-qualified code the daily endpoint requires (`AAPL.OQ`, `BRK.A.N`).
 * It must belong to the symbol it is sent with: a client cannot use one US
 * identity to read another security's history.
 */
export function normalizeUsCode(input: unknown, symbol: string): string {
  const ticker = usTickerOf(symbol)
  if (typeof input !== 'string') throw usError('finance/us-symbol', '美股代码无效。')
  const code = input.trim().toUpperCase()
  const match = CODE_SHAPE.exec(code)
  if (!match || match[1] !== ticker || !US_VENUES.has(match[2]!.toLowerCase())) {
    throw usError('finance/us-symbol', '美股代码无效。')
  }
  return code
}

/** Splits a directory code into `{ ticker, code }`; null when it is not usable. */
export function parseUsDirectoryCode(input: unknown): { ticker: string, code: string } | null {
  if (typeof input !== 'string') return null
  const code = input.trim().toUpperCase()
  const match = CODE_SHAPE.exec(code)
  if (!match || !US_VENUES.has(match[2]!.toLowerCase())) return null
  return { ticker: match[1]!, code }
}

/** The quote host answers the bare ticker; the venue suffix belongs to the daily one. */
export function usQuoteUrl(symbol: string): string {
  return `https://qt.gtimg.cn/q=us${usTickerOf(symbol)}`
}

export function usHistoryUrl(code: string, limit: number): string {
  const bounded = validateUsHistoryLimit(limit)
  return `https://proxy.finance.qq.com/ifzqgtimg/appstock/app/usfqkline/get?param=us${code},day,,,${bounded},qfq`
}

export function validateUsHistoryLimit(input: unknown): number {
  if (!Number.isInteger(input) || (input as number) < 1 || (input as number) > US_MAX_HISTORY) {
    throw usError('finance/us-invalid', '美股日 K 数量无效。')
  }
  return input as number
}

export interface UsQuote {
  symbol: string
  name: string
  price: number
  /** Decimal places the source printed, not a formatting preference. */
  pricePrecision: number
  change: number | null
  changePercent: number | null
  open: number | null
  high: number | null
  low: number | null
  previousClose: number | null
  /** Share count when the source stated one; never a lot conversion guess. */
  volume: number | null
  /** Turnover in USD when the source stated one. */
  amount: number | null
  currency: typeof US_CURRENCY
  /** Exchange-local stamp converted to an instant; null when it cannot be trusted. */
  quotedAt: string | null
  fetchedAt: string
  /** The source has no closed flag for a US row, so it never claims one. */
  marketStatus: 'closed' | 'unknown'
  source: string
}

export type UsRequest =
  | { kind: 'quote', symbol: string }
  | { kind: 'history', symbol: string, code: string, limit: number }

export type UsResult =
  | { status: 'disabled' }
  | { status: 'ready', quote: UsQuote }
  | { status: 'ready', history: MarketHistory }

const CONTROL = /[\u0000-\u001f\u007f]/g

function cleanText(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return ''
  const text = raw.replace(CONTROL, '').trim()
  return text && [...text].length <= max ? text : ''
}

/** A finite number in range; `null` for blank, `undefined` for a malformed value. */
function readNumber(raw: unknown, min: number, max: number): number | null | undefined {
  if (raw === '' || raw == null) return null
  const value = Number(raw)
  if (!Number.isFinite(value) || value < min || value > max) return undefined
  return value
}

function decimalsOf(raw: string): number {
  const dot = raw.indexOf('.')
  return dot < 0 ? 0 : Math.min(6, raw.length - dot - 1)
}

/**
 * Projects the `v_usXXXX="..."` payload. Unknown symbols come back as
 * `v_pv_none_match`; that is "no such listing", not a transport failure.
 * Exported for offline tests.
 */
export function parseUsQuote(text: unknown, symbol: string, now: number): UsQuote {
  const canonical = normalizeUsSymbol(symbol)
  const ticker = usTickerOf(canonical)
  if (typeof text !== 'string' || text.length > US_QUOTE_MAX_BYTES) {
    throw usError('finance/us-quote-unavailable', '美股报价暂不可用。')
  }
  const escaped = ticker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`v_us${escaped}="([^"]*)"`).exec(text)
  if (!match) throw usError('finance/us-quote-unavailable', '没有这只美股的有效报价。')
  const fields = match[1]!.split('~')
  if (fields.length < 38) throw usError('finance/us-quote-invalid', '美股报价响应格式无效。')

  const rawPrice = fields[3] ?? ''
  const price = readNumber(rawPrice, Number.MIN_VALUE, MAX_ABSOLUTE_PRICE)
  if (price === null || price === undefined) throw usError('finance/us-quote-invalid', '美股报价响应格式无效。')
  // The row must describe the security it was asked about; the source echoes
  // the venue-qualified code it believes it answered for.
  const echoed = (fields[2] ?? '').trim().toUpperCase()
  if (echoed && !echoed.startsWith(`${ticker}.`)) {
    throw usError('finance/us-quote-invalid', '美股报价响应与请求代码不一致。')
  }
  const currency = (fields[35] ?? '').trim().toUpperCase()
  if (currency && currency !== US_CURRENCY) throw usError('finance/us-quote-invalid', '美股报价币种不是美元。')

  const optional = (index: number, max = MAX_ABSOLUTE_PRICE) => {
    const value = readNumber(fields[index], 0, max)
    if (value === undefined) throw usError('finance/us-quote-invalid', '美股报价包含无效数值。')
    return value === 0 ? null : value
  }
  const previousClose = optional(4)
  const open = optional(5)
  const high = optional(33)
  const low = optional(34)
  const volume = optional(36, Number.MAX_SAFE_INTEGER)
  const amount = optional(37, Number.MAX_SAFE_INTEGER)
  const change = (() => {
    const value = readNumber(fields[31], -MAX_ABSOLUTE_PRICE, MAX_ABSOLUTE_PRICE)
    if (value === undefined) throw usError('finance/us-quote-invalid', '美股报价包含无效数值。')
    return value
  })()
  const changePercent = (() => {
    const value = readNumber(fields[32], -10_000, 10_000)
    if (value === undefined) throw usError('finance/us-quote-invalid', '美股报价包含无效数值。')
    return value
  })()

  if (high !== null && low !== null) {
    if (high < low) throw usError('finance/us-quote-invalid', '美股报价最高价低于最低价。')
    const slack = Math.max(0.01, price * 1e-4)
    if (price > high + slack || price < low - slack) {
      throw usError('finance/us-quote-invalid', '美股报价最新价不在当日区间内。')
    }
  }
  // Change fields are cross-checked against price and previous close instead of
  // being trusted: a shifted layout would otherwise publish a plausible lie.
  if (previousClose !== null && change !== null) {
    const expected = price - previousClose
    if (Math.abs(change - expected) > Math.max(0.02, Math.abs(price) * 1e-4)) {
      throw usError('finance/us-quote-invalid', '美股报价涨跌额与价格不一致。')
    }
    if (changePercent !== null) {
      const percent = expected / previousClose * 100
      if (Math.abs(changePercent - percent) > 0.05) {
        throw usError('finance/us-quote-invalid', '美股报价涨跌幅与价格不一致。')
      }
    }
  }

  return {
    symbol: canonical,
    name: cleanText(fields[1], 64),
    price,
    pricePrecision: decimalsOf(rawPrice),
    change,
    changePercent,
    open,
    high,
    low,
    previousClose,
    volume,
    amount,
    currency: US_CURRENCY,
    quotedAt: zonedQuoteTime(fields[30], US_EXCHANGE_TIME_ZONE, now, US_MAX_QUOTE_AGE_MS),
    fetchedAt: new Date(now).toISOString(),
    marketStatus: 'unknown',
    source: US_SOURCE_NAME,
  }
}

interface RawUsRow {
  sessionDate: string
  open: number
  high: number
  low: number
  close: number
  volume: number | null
  amount: number | null
}

const SESSION_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * The US daily rows use the same open/close/high/low order as the A-share
 * feed. Rows with impossible OHLC, duplicate or unsorted dates are dropped
 * rather than repaired; an empty result is reported as unavailable.
 */
export function parseUsDailyRows(rows: unknown): RawUsRow[] {
  const list = Array.isArray(rows) ? rows : []
  if (list.length > US_MAX_HISTORY + 50) throw usError('finance/us-history-invalid', '美股日 K 响应过大。')
  const parsed: RawUsRow[] = []
  let previous = ''
  for (const row of list) {
    if (!Array.isArray(row) || row.length < 6) continue
    const sessionDate = row[0]
    if (typeof sessionDate !== 'string' || !SESSION_DATE.test(sessionDate) || sessionDate <= previous) continue
    const open = Number(row[1]), close = Number(row[2]), high = Number(row[3]), low = Number(row[4])
    if (![open, close, high, low].every(Number.isFinite)) continue
    if (open <= 0 || close <= 0 || high <= 0 || low <= 0) continue
    if (low > Math.min(open, close) || high < Math.max(open, close) || low > high) continue
    if (Math.max(open, high, low, close) > MAX_ABSOLUTE_PRICE) continue
    const rawVolume = row[5]
    const volume = rawVolume === '' || rawVolume == null ? null : Number(rawVolume)
    const rawAmount = row[8]
    const amount = rawAmount === '' || rawAmount == null ? null : Number(rawAmount)
    if (volume !== null && (!Number.isFinite(volume) || volume < 0)) continue
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) continue
    previous = sessionDate
    parsed.push({ sessionDate, open, high, low, close, volume, amount })
  }
  if (!parsed.length) throw usError('finance/us-history-unavailable', '这只美股没有可用的日 K 数据。')
  return parsed
}

/**
 * The daily endpoint reports volume in shares for US rows, but a unit claim
 * needs evidence: the embedded quote block carries the same session's volume,
 * so a matching last bar confirms shares (`×100` would mean lots). Without that
 * block the unit stays unknown and volume is omitted instead of guessed.
 */
export function usVolumeBasis(rows: RawUsRow[], quotedVolume: number | null): 'shares' | 'lots' | 'unknown' {
  const last = rows.at(-1)
  if (!last || last.volume === null || quotedVolume === null || quotedVolume <= 0) return 'unknown'
  const ratio = last.volume / quotedVolume
  if (ratio >= 0.98 && ratio <= 1.02) return 'shares'
  if (ratio >= 98 && ratio <= 102) return 'lots'
  return 'unknown'
}

function quoteField(entry: any, code: string, index: number): unknown {
  const fields = entry?.qt?.[`us${code}`]
  return Array.isArray(fields) ? fields[index] : undefined
}

/** Projects the US daily response; exported for offline tests. */
export function parseUsHistory(
  payload: unknown,
  options: { symbol: string, code: string, limit: number, now: number },
): MarketHistory {
  const { symbol, code, limit, now } = options
  const canonical = normalizeUsSymbol(symbol)
  const vendor = normalizeUsCode(code, canonical)
  const body = payload as any
  if (!body || typeof body !== 'object' || body.code !== 0) {
    throw usError('finance/us-history-unavailable', '这只美股没有可用的日 K 数据。')
  }
  const entry = body.data?.[`us${vendor}`]
  if (!entry || typeof entry !== 'object') {
    throw usError('finance/us-history-unavailable', '这只美股没有可用的日 K 数据。')
  }
  const adjusted = Array.isArray(entry.qfqday) && entry.qfqday.length
  const key = adjusted ? 'qfqday' : Array.isArray(entry.day) && entry.day.length ? 'day' : null
  const rows = key ? parseUsDailyRows(entry[key]) : null
  if (!rows) throw usError('finance/us-history-unavailable', '这只美股没有可用的日 K 数据。')
  const bounded = limit > 0 && limit <= US_MAX_HISTORY ? limit : US_MAX_HISTORY
  const bars = rows.slice(-bounded)
  const rawQuotedVolume = readNumber(quoteField(entry, vendor, 36), 0, Number.MAX_SAFE_INTEGER)
  const quotedVolume = typeof rawQuotedVolume === 'number' && rawQuotedVolume > 0 ? rawQuotedVolume : null
  const basis = usVolumeBasis(bars, quotedVolume)
  const scale = basis === 'lots' ? 100 : 1
  const today = zoneToday(now, US_EXCHANGE_TIME_ZONE)
  const projected: MarketDailyBar[] = bars.map((bar, index) => ({
    sessionDate: bar.sessionDate,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: basis === 'unknown' || bar.volume === null ? null : Math.round(bar.volume * scale),
    amount: bar.amount,
    // Only today's newest bar can still be moving; the source has no close flag
    // for a US row, so an older last bar is final.
    isFinal: index < bars.length - 1 || bar.sessionDate !== today,
  }))
  // Report what the source actually returned: it silently ignores qfq for some
  // listings (BRK.A) and answers with unadjusted rows instead.
  const adjustment = adjusted ? 'forward' as const : 'none' as const
  return {
    symbol: canonical,
    name: cleanText(quoteField(entry, vendor, 1), 64) || cleanText(quoteField(entry, vendor, 46), 64) || canonical,
    source: US_SOURCE_NAME,
    fetchedAt: new Date(now).toISOString(),
    adjustment,
    adjustmentLabel: adjustment === 'forward' ? 'forward-adjusted (qfq)' : 'unadjusted',
    pricePrecision: 2,
    volumeUnit: 'shares',
    volumeBasis: basis,
    amountUnit: US_CURRENCY,
    currency: US_CURRENCY,
    exchangeTimezone: US_EXCHANGE_TIME_ZONE,
    firstSessionDate: projected[0]!.sessionDate,
    lastSessionDate: projected.at(-1)!.sessionDate,
    bars: projected,
  }
}

const QUOTE_KEYS = ['kind', 'symbol']
const HISTORY_KEYS = ['code', 'kind', 'limit', 'symbol']

/** Accepts only the two documented request shapes; extra keys are rejected. */
export function parseUsRequest(payload: unknown): UsRequest {
  if (!payload || Object.getPrototypeOf(payload) !== Object.prototype) {
    throw usError('finance/us-invalid', '美股请求格式无效。')
  }
  const value = payload as Record<string, unknown>
  const keys = Object.keys(value).sort()
  if (keys.join(',') === QUOTE_KEYS.join(',') && value.kind === 'quote') {
    return { kind: 'quote', symbol: normalizeUsSymbol(value.symbol) }
  }
  if (keys.join(',') === HISTORY_KEYS.join(',') && value.kind === 'history') {
    const symbol = normalizeUsSymbol(value.symbol)
    return {
      kind: 'history', symbol,
      code: normalizeUsCode(value.code, symbol),
      limit: validateUsHistoryLimit(value.limit),
    }
  }
  throw usError('finance/us-invalid', '美股请求格式无效。')
}

/**
 * Re-validates a provider's quote at the RPC boundary, so a replacement
 * adapter cannot publish extra fields, another symbol or an impossible price.
 */
export function projectUsQuote(raw: unknown, symbol: string, now: number): UsQuote {
  const canonical = normalizeUsSymbol(symbol)
  const value = raw as UsQuote | null
  const price = value?.price
  if (!value || typeof value !== 'object' || !Number.isFinite(price) || price! <= 0 || price! > MAX_ABSOLUTE_PRICE) {
    throw usError('finance/us-quote-invalid', '美股报价响应格式无效。')
  }
  if (value.symbol !== canonical) throw usError('finance/us-quote-invalid', '美股报价响应与请求代码不一致。')
  if (value.currency !== US_CURRENCY) throw usError('finance/us-quote-invalid', '美股报价币种不是美元。')
  const precision = Number.isInteger(value.pricePrecision) && value.pricePrecision >= 0 && value.pricePrecision <= 6
    ? value.pricePrecision : 2
  const optional = (input: unknown, max = MAX_ABSOLUTE_PRICE) =>
    typeof input === 'number' && Number.isFinite(input) && input >= 0 && input <= max ? input : null
  const signed = (input: unknown, max: number) =>
    typeof input === 'number' && Number.isFinite(input) && Math.abs(input) <= max ? input : null
  const quotedAt = typeof value.quotedAt === 'string' && Number.isFinite(Date.parse(value.quotedAt))
    && Date.parse(value.quotedAt) <= now + 300_000 ? value.quotedAt : null
  return {
    symbol: canonical,
    name: typeof value.name === 'string' ? value.name.replace(CONTROL, '').trim().slice(0, 64) : '',
    price: price!,
    pricePrecision: precision,
    change: signed(value.change, MAX_ABSOLUTE_PRICE),
    changePercent: signed(value.changePercent, 10_000),
    open: optional(value.open),
    high: optional(value.high),
    low: optional(value.low),
    previousClose: optional(value.previousClose),
    volume: optional(value.volume, Number.MAX_SAFE_INTEGER),
    amount: optional(value.amount, Number.MAX_SAFE_INTEGER),
    currency: US_CURRENCY,
    quotedAt,
    fetchedAt: new Date(now).toISOString(),
    marketStatus: 'unknown',
    source: US_SOURCE_NAME,
  }
}

/** Re-validates a provider's history: identity, bars, ordering and provenance. */
export function projectUsHistory(raw: unknown, symbol: string, now: number): MarketHistory {
  const canonical = normalizeUsSymbol(symbol)
  const value = raw as MarketHistory | null
  if (!value || typeof value !== 'object' || value.symbol !== canonical || !Array.isArray(value.bars) || !value.bars.length) {
    throw usError('finance/us-history-invalid', '美股日 K 响应格式无效。')
  }
  const bars: MarketDailyBar[] = []
  let previous = ''
  for (const bar of value.bars.slice(-US_MAX_HISTORY)) {
    const date = bar?.sessionDate
    if (typeof date !== 'string' || !SESSION_DATE.test(date) || date <= previous) continue
    const [open, high, low, close] = [bar.open, bar.high, bar.low, bar.close]
    if (![open, high, low, close].every(Number.isFinite)) continue
    if (open <= 0 || close <= 0 || high <= 0 || low <= 0) continue
    if (low > Math.min(open, close) || high < Math.max(open, close) || low > high) continue
    if (Math.max(open, high, low, close) > MAX_ABSOLUTE_PRICE) continue
    const volume = typeof bar.volume === 'number' && Number.isFinite(bar.volume) && bar.volume >= 0 ? bar.volume : null
    const amount = typeof bar.amount === 'number' && Number.isFinite(bar.amount) && bar.amount >= 0 ? bar.amount : null
    previous = date
    bars.push({ sessionDate: date, open, high, low, close, volume, amount, isFinal: bar.isFinal === true })
  }
  if (!bars.length) throw usError('finance/us-history-invalid', '美股日 K 响应格式无效。')
  return {
    symbol: canonical,
    name: typeof value.name === 'string' ? value.name.replace(CONTROL, '').trim().slice(0, 64) : canonical,
    source: US_SOURCE_NAME,
    fetchedAt: new Date(now).toISOString(),
    adjustment: value.adjustment === 'forward' || value.adjustment === 'backward' ? value.adjustment : 'none',
    adjustmentLabel: value.adjustment === 'forward' ? 'forward-adjusted (qfq)' : value.adjustment === 'backward' ? 'backward-adjusted (hfq)' : 'unadjusted',
    pricePrecision: 2,
    volumeUnit: 'shares',
    volumeBasis: value.volumeBasis === 'lots' || value.volumeBasis === 'unknown' ? value.volumeBasis : 'shares',
    amountUnit: US_CURRENCY,
    currency: US_CURRENCY,
    exchangeTimezone: US_EXCHANGE_TIME_ZONE,
    firstSessionDate: bars[0]!.sessionDate,
    lastSessionDate: bars.at(-1)!.sessionDate,
    bars,
  }
}

