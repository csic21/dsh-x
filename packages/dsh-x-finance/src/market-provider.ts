// Optional, opt-in A-share market-board adapter backed by Tencent's public
// quote and ranking endpoints. This is NOT a licensed market-data feed: no
// SLA, no redistribution right, and it can break, delay or rate-limit at any
// time. It exists for local, single-user use behind an explicit opt-in and
// must never become the default source of a distributed build.
//
// Only projected fields leave this module. Raw payloads, upstream errors and
// request details are never returned to the browser or written to disk.
import {
  MARKET_BOARD_TTL_MS, MARKET_CACHE_TTL_MS, MARKET_HISTORY_MAX_LIMIT, MARKET_LEVEL1_CODES,
  MARKET_MAX_BOARD_STOCKS, MARKET_MAX_PAGES, MARKET_MAX_QUOTES, MARKET_MAX_SECTORS, MARKET_MAX_STOCKS,
  MARKET_OVERVIEW_TTL_MS, MARKET_PAGE_SIZE, MARKET_SOURCE_NAME, MARKET_DISTRIBUTION, distributionBucket,
  level2Parent, level1Name, normalizeMarketCode, quotePrecision, shanghaiToday, validateBoardCode, validateHistoryLimit,
  validateAdjustment, isAshareMinute,
} from './market.ts'
import type {
  BoardDetail, MarketAdjustment, MarketBreadth, MarketDailyBar, MarketHistory, MarketIndex, MarketOverview,
  MarketQuote, MarketSector, MarketStock, MarketTopStock, MarketProvider, MarketIntraday,
} from './market.ts'
import { GLOBAL_INSTRUMENTS, GLOBAL_MARKET_ENDPOINT, GLOBAL_MARKET_SOURCE, GLOBAL_TTL_MS, parseGlobalQuotes } from './global.ts'
import type { GlobalMarketOverview } from './global.ts'
import { validateSymbol } from './watchlist.ts'
import { MAX_ABSOLUTE_PRICE } from './chart-data.ts'

export const MARKET_QUOTE_ENDPOINT = 'https://qt.gtimg.cn/q='
export const MARKET_BOARD_RANK_ENDPOINT = 'https://proxy.finance.qq.com/ifzqgtimg/appstock/app/mktHs/rank'
export const MARKET_STOCK_RANK_ENDPOINT = 'https://proxy.finance.qq.com/cgi/cgi-bin/rank/hs/getBoardRankList'
/** Daily OHLCV for one symbol. Same opt-in source and same bounded client. */
export const MARKET_HISTORY_ENDPOINT = 'https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get'
/**
 * Today's 分时. East Money's trends feed, not the Tencent daily host: each row
 * is already a Beijing wall-clock minute. The `ut` value is the public page
 * token shipped in that site's script, not a credential.
 */
export const MARKET_INTRADAY_ENDPOINT = 'https://push2.eastmoney.com/api/qt/stock/trends2/get'
export const MARKET_INTRADAY_SOURCE = '东方财富分时 (unofficial)'
const EASTMONEY_UT = 'fa5fd1943c7b386f172d6893dbfba10b'
export const MARKET_INTRADAY_TTL_MS = 15_000
export const MARKET_INTRADAY_MAX_POINTS = 300
export const MARKET_TIMEOUT_MS = 10_000
export const MARKET_MAX_BYTES = 512 * 1024
export const MARKET_TOP_LIMIT = 8
const STAMP = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/

const INDEXES = [
  { quote: 'sh000001', code: 'SH.000001' },
  { quote: 'sz399001', code: 'SZ.399001' },
  { quote: 'sz399006', code: 'SZ.399006' },
  { quote: 'sh000300', code: 'SH.000300' },
  { quote: 'sh000688', code: 'SH.000688' },
  { quote: 'bj899050', code: 'BJ.899050' },
] as const

export interface MarketProviderOptions {
  fetchImpl?: typeof fetch
  now?: () => number
  timeoutMs?: number
  overviewTtlMs?: number
  breadthTtlMs?: number
  boardTtlMs?: number
  globalTtlMs?: number
  retryDelayMs?: number
  concurrency?: number
}

interface CacheEntry<T> { expires: number; value: T }

function cleanText(raw: unknown, max = 64): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  if (!value || [...value].length > max) return null
  return value
}

function finiteNumber(raw: unknown, min = -Infinity, max = Infinity): number | null {
  if (typeof raw !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(raw)) return null
  const value = Number(raw)
  return Number.isFinite(value) && value >= min && value <= max ? value : null
}

function positiveOrNull(value: number | null, max = 1e15): number | null {
  return value !== null && value > 0 && value < max ? value : null
}

function isoNow(now: number): string {
  return new Date(now).toISOString()
}

function laterQuote(left: string | null, right: string | null): string | null {
  if (!left) return right
  if (!right) return left
  return Date.parse(right) > Date.parse(left) ? right : left
}

function toCnyFromWan(value: number | null): number | null {
  return value === null ? null : value * 10_000
}

/**
 * The upstream stamp is `yyyyMMddHHmmss` in exchange time (China Standard
 * Time, UTC+08:00, no DST). Invalid, impossible or future stamps are rejected
 * instead of being silently clamped. Exported for tests.
 */
export function parseTencentTimestamp(raw: unknown, now: number): string {
  const match = typeof raw === 'string' ? STAMP.exec(raw) : null
  if (!match) throw new Error('invalid quote timestamp')
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) throw new Error('invalid quote timestamp')
  const calendar = new Date(Date.UTC(year, month - 1, day))
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) throw new Error('invalid quote timestamp')
  const stamp = Date.UTC(year, month - 1, day, hour - 8, minute, second)
  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}+08:00`
  if (!Number.isFinite(stamp) || Date.parse(iso) !== stamp) throw new Error('invalid quote timestamp')
  if (stamp > now + 300_000) throw new Error('quote timestamp is in the future')
  return iso
}

async function readBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  const length = Number(response.headers.get('content-length'))
  if (Number.isFinite(length) && length > maxBytes) throw new Error('market response too large')
  if (!response.body) throw new Error('market response is empty')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) throw new Error('market response too large')
      chunks.push(value)
    }
  } finally {
    void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return bytes
}

function assertTextResponse(response: Response): void {
  if (!response.ok) throw new Error(`market http ${response.status}`)
  const type = (response.headers.get('content-type') ?? '').toLowerCase()
  if (type && !type.includes('json') && !type.startsWith('text/')) throw new Error('market response type')
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      results[index] = await worker(items[index]!)
    }
  })
  await Promise.all(runners)
  return results
}

/** Parses the tilde-separated Tencent batch format. Exported for tests. */
export function parseTencentBatch(text: string): Map<string, string[]> {
  const result = new Map<string, string[]>()
  for (const raw of text.trim().split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const match = /^v_((?:sh|sz|bj)\d{6}|pt\d{8})="([^"]*)";?$/.exec(line)
    if (!match) continue
    const fields = match[2]!.split('~')
    if (fields.length < 35) continue
    result.set(match[1]!, fields)
  }
  return result
}

interface RankBoard {
  code: string
  name: string
  changePercent: number | null
  topStock: MarketTopStock | null
}

/** Parses `mktHs/rank` (level-2 boards and their leading stock). */
export function parseBoardRank(payload: any): Map<string, RankBoard> {
  const rows = Array.isArray(payload?.data) ? payload.data : []
  if (rows.length > MARKET_MAX_SECTORS) throw new Error('market board list too large')
  const result = new Map<string, RankBoard>()
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const code = typeof row.bd_code === 'string' && /^pt01801\d{3}$/.test(row.bd_code) ? row.bd_code.slice(4) : null
    const name = cleanText(row.bd_name, 48)
    if (!code || !name) continue
    const rawPercent = row.bd_zdf
    const changePercent = rawPercent === '' || rawPercent == null ? Number.NaN : Number(rawPercent)
    const topCode = normalizeMarketCode(row.nzg_code)
    const topName = cleanText(row.nzg_name, 64)
    const rawTopPercent = row.nzg_zdf
    const topPercent = rawTopPercent === '' || rawTopPercent == null ? Number.NaN : Number(rawTopPercent)
    result.set(code, {
      code,
      name,
      changePercent: Number.isFinite(changePercent) && Math.abs(changePercent) <= 100 ? changePercent : null,
      topStock: topCode && topName && Number.isFinite(topPercent) && Math.abs(topPercent) <= 100
        ? { code: topCode, name: topName, changePercent: topPercent }
        : null,
    })
  }
  return result
}

interface StockRankPage {
  total: number
  rows: MarketStock[]
}

/** Parses one `getBoardRankList` page. Exported for tests. */
export function parseStockRankPage(payload: any): StockRankPage {
  const data = payload?.data
  const total = Number(data?.total)
  if (!Number.isInteger(total) || total < 0 || total > MARKET_MAX_STOCKS) throw new Error('market stock total')
  const list = Array.isArray(data?.rank_list) ? data.rank_list : []
  if (list.length > MARKET_PAGE_SIZE) throw new Error('market stock page too large')
  const rows: MarketStock[] = []
  for (const row of list) {
    if (!row || typeof row !== 'object') continue
    const code = normalizeMarketCode(row.code)
    const name = cleanText(row.name, 64)
    const price = Number(row.zxj)
    const changePercent = Number(row.zdf)
    const amount = Number(row.turnover)
    const marketCap = Number(row.zsz)
    if (!code || !name || !Number.isFinite(price) || price <= 0 || price >= 1e10) continue
    if (!Number.isFinite(changePercent) || Math.abs(changePercent) > 1000) continue
    if (!Number.isFinite(amount) || amount < 0 || amount > 1e12) continue
    rows.push({
      code,
      name,
      price,
      changePercent,
      amount: amount * 10_000,
      marketCap: Number.isFinite(marketCap) && marketCap >= 0 && marketCap < 1e8 ? marketCap * 1e8 : null,
      suspended: row.state === 'S',
    })
  }
  return { total, rows }
}

function boardTopStock(rank: Map<string, RankBoard>, code: string): MarketTopStock | null {
  return rank.get(code)?.topStock ?? null
}

function parseIndexQuote(key: string, fields: string[], now: number): MarketIndex {
  const [market, digits] = [key.slice(0, 2), key.slice(2)] as [string, string]
  const name = cleanText(fields[1], 32)
  const price = finiteNumber(fields[3], 0.0001, 1e9)
  const change = finiteNumber(fields[31], -1e9, 1e9)
  const changePercent = finiteNumber(fields[32], -100, 100)
  if (!name || price === null || change === null || changePercent === null) throw new Error('invalid index quote')
  if (fields[2] !== digits) throw new Error('index quote mismatch')
  const amount = toCnyFromWan(positiveOrNull(finiteNumber(fields[37], 0, 1e12)))
  return {
    code: `${market.toUpperCase()}.${digits}`,
    name,
    price,
    change,
    changePercent,
    open: positiveOrNull(finiteNumber(fields[5], 0, 1e9)),
    high: positiveOrNull(finiteNumber(fields[33], 0, 1e9)),
    low: positiveOrNull(finiteNumber(fields[34], 0, 1e9)),
    previousClose: positiveOrNull(finiteNumber(fields[4], 0, 1e9)),
    amount,
    quotedAt: parseTencentTimestamp(fields[30], now),
  }
}

/** Parses one `v_sh600519="..."` stock line into the projected quote. */
export function parseStockQuote(key: string, fields: string[], now: number): MarketQuote {
  const [market, digits] = [key.slice(0, 2), key.slice(2)] as [string, string]
  const symbol = `${market.toUpperCase()}.${digits}`
  validateSymbol(symbol)
  if (fields[2] !== digits) throw new Error('stock quote mismatch')
  const name = cleanText(fields[1], 64)
  const price = finiteNumber(fields[3], 0.0001, 1e9)
  const changePercent = finiteNumber(fields[32], -100, 100)
  if (!name || price === null || changePercent === null) throw new Error('invalid stock quote')
  return {
    symbol,
    status: 'available',
    name,
    price,
    // The raw field keeps the quoted width, so a 3- or 4-decimal ETF price is
    // displayed as quoted instead of being rounded to two decimals.
    pricePrecision: quotePrecision(fields[3]),
    changePercent,
    quotedAt: parseTencentTimestamp(fields[30], now),
    fetchedAt: null,
    // The source has no suspension flag; the UI labels freshness instead of
    // claiming a session state it cannot verify.
    marketStatus: 'unknown',
  }
}

function parseBoardQuote(key: string, fields: string[], now: number, rank: Map<string, RankBoard>): MarketSector | null {
  const code = key.slice(4)
  if (!/^801\d{3}$/.test(code)) return null
  if (fields[2] !== `01${code}`) return null
  const name = cleanText(fields[1], 48)
  const changePercent = finiteNumber(fields[32], -100, 100)
  if (!name || changePercent === null) return null
  const level = fields[58] === 'BK-HY-1' ? 1 : fields[58] === 'BK-HY-2' ? 2 : null
  if (!level) return null
  const amount = toCnyFromWan(positiveOrNull(finiteNumber(fields[37], 0, 1e12)))
  const capYi = positiveOrNull(finiteNumber(fields[45], 0, 1e8))
  return {
    code,
    name,
    level,
    parent: level === 2 ? level2Parent(name) : null,
    changePercent,
    amount,
    marketCap: capYi === null ? null : capYi * 1e8,
    topStock: level === 2 ? boardTopStock(rank, code) : null,
    quotedAt: parseTencentTimestamp(fields[30], now),
  }
}

function sortTop(stocks: MarketStock[], pick: (stock: MarketStock) => number, direction: 1 | -1): MarketStock[] {
  return [...stocks]
    .filter(stock => Number.isFinite(pick(stock)))
    .sort((left, right) => (pick(right) - pick(left)) * direction)
    .slice(0, MARKET_TOP_LIMIT)
}

/** Daily rows arrive as arrays; a malformed row is dropped, never repaired. */
export interface RawDailyRow {
  sessionDate: string
  open: number
  high: number
  low: number
  close: number
  volume: number | null
  /** Upstream turnover in 万元 (10,000 CNY) when the row carries it. */
  amountWan: number | null
}

const HISTORY_ROW = /^\d{4}-\d{2}-\d{2}$/

/**
 * Parses `[date, open, close, high, low, volume, ..., rate, amountWan]` rows.
 * The upstream order is open/close/high/low, not OHLC; treating it as OHLC
 * would silently swap close and high. Impossible OHLC relationships are
 * rejected rather than clamped, and the result stays sorted and unique.
 */
export function parseDailyRows(rows: unknown): RawDailyRow[] {
  const list = Array.isArray(rows) ? rows : []
  if (list.length > MARKET_HISTORY_MAX_LIMIT + 50) throw new Error('history response too large')
  const parsed: RawDailyRow[] = []
  let previous = ''
  for (const row of list) {
    if (!Array.isArray(row) || row.length < 6) continue
    const sessionDate = row[0]
    if (typeof sessionDate !== 'string' || !HISTORY_ROW.test(sessionDate)) continue
    const open = Number(row[1]), close = Number(row[2]), high = Number(row[3]), low = Number(row[4])
    if (![open, close, high, low].every(Number.isFinite)) continue
    if (open <= 0 || close <= 0 || high <= 0 || low <= 0) continue
    if (low > Math.min(open, close) || high < Math.max(open, close) || low > high) continue
    if (Math.max(open, high, low, close) > MAX_ABSOLUTE_PRICE) continue
    const rawVolume = row[5]
    const volume = rawVolume === '' || rawVolume == null ? null : Number(rawVolume)
    const rawAmount = row[8]
    const amountWan = rawAmount === '' || rawAmount == null ? null : Number(rawAmount)
    if (volume !== null && (!Number.isFinite(volume) || volume < 0)) continue
    if (amountWan !== null && (!Number.isFinite(amountWan) || amountWan < 0)) continue
    if (sessionDate <= previous) continue
    previous = sessionDate
    parsed.push({ sessionDate, open, close, high, low, volume, amountWan })
  }
  if (!parsed.length) throw new Error('history empty')
  return parsed
}

/**
 * Tencent sends volume in lots (手, 100 shares) for most SSE/SZSE/ETF rows but
 * in shares for STAR rows, so the unit is inferred from each row's own
 * turnover instead of assumed: `amountWan * 1e4 / volume` is an average traded
 * price, so it lands near `close` for shares and near `100 × close` for lots.
 * When turnover is missing or the ratio is ambiguous the volume stays unknown
 * rather than being published under a guessed unit.
 */
export function inferVolumeUnit(rows: RawDailyRow[]): { unit: 'shares' | 'lots'; samples: number } | null {
  let shares = 0, lots = 0
  for (const row of rows) {
    if (row.volume === null || !row.volume || row.amountWan === null || !row.amountWan) continue
    const ratio = ((row.amountWan * 10_000) / row.volume) / row.close
    if (ratio >= 0.5 && ratio <= 2) shares++
    else if (ratio >= 50 && ratio <= 200) lots++
  }
  const total = shares + lots
  // Require a clear majority: a mixed or barely-supported sample stays unknown.
  if (shares > lots && shares >= Math.max(2, Math.ceil(total * 0.8))) return { unit: 'shares', samples: total }
  if (lots > shares && lots >= Math.max(2, Math.ceil(total * 0.8))) return { unit: 'lots', samples: total }
  return null
}

/**
 * Index codes share the A-share symbol shape but their reported volume is an
 * exchange aggregate, not a share count. Treating it as shares would mislabel
 * the axis, so indices carry the source's own unit and say so.
 */
export function isIndexSymbol(symbol: string): boolean {
  return /^(?:SH\.000|SZ\.399|BJ\.899)\d{3}$/.test(symbol)
}

/** Builds the projected history; bars the unit cannot be established for are dropped. */
export function projectHistory(options: {
  symbol: string
  name: string
  rows: RawDailyRow[]
  adjustment: MarketAdjustment
  precision: number
  now: number
}): MarketHistory {
  const { symbol, name, rows, adjustment, precision, now } = options
  const index = isIndexSymbol(symbol)
  const unit = index ? { unit: 'reported' as const, samples: 0 } : inferVolumeUnit(rows)
  const scale = unit?.unit === 'lots' ? 100 : 1
  const bars: MarketDailyBar[] = rows.map((row, index) => ({
    sessionDate: row.sessionDate,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    // An unknown unit is reported as unknown; a lot count is never presented
    // as a share count.
    volume: unit && row.volume !== null ? Math.round(row.volume * scale) : null,
    amount: row.amountWan !== null ? Math.round(row.amountWan * 10_000) : null,
    // Only today's newest bar can still be moving. The source has no final
    // flag, so a last bar from an earlier session is final, not provisional.
    isFinal: index < rows.length - 1 || row.sessionDate !== shanghaiToday(now),
  }))
  return {
    symbol,
    name,
    source: MARKET_SOURCE_NAME,
    fetchedAt: isoNow(now),
    adjustment,
    adjustmentLabel: adjustment === 'none' ? 'unadjusted' : adjustment === 'forward' ? 'forward-adjusted (qfq)' : 'backward-adjusted (hfq)',
    pricePrecision: precision,
    volumeUnit: 'shares',
    volumeBasis: unit?.unit ?? 'unknown',
    amountUnit: 'CNY',
    currency: 'CNY',
    exchangeTimezone: 'Asia/Shanghai',
    firstSessionDate: bars[0]!.sessionDate,
    lastSessionDate: bars.at(-1)!.sessionDate,
    bars,
  }
}


function buildBreadth(rows: MarketStock[], expected: number, partial: boolean, now: number): MarketBreadth {
  const unique = new Map<string, MarketStock>()
  for (const row of rows) if (!unique.has(row.code)) unique.set(row.code, row)
  const stocks = [...unique.values()]
  const covered = stocks.length
  if (!covered || covered < expected * 0.9) throw new Error('market breadth coverage too low')
  let up = 0, down = 0, flat = 0, suspended = 0
  const distribution = MARKET_DISTRIBUTION.map(bucket => ({ ...bucket, count: 0 }))
  for (const stock of stocks) {
    if (stock.changePercent > 0) up++
    else if (stock.changePercent < 0) down++
    else flat++
    if (stock.suspended) suspended++
    distribution[distributionBucket(stock.changePercent)]!.count++
  }
  return {
    source: MARKET_SOURCE_NAME,
    fetchedAt: isoNow(now),
    expected,
    covered,
    up,
    down,
    flat,
    suspended,
    coverage: Math.min(1, covered / expected),
    partial,
    amount: stocks.reduce((sum, stock) => sum + stock.amount, 0),
    distribution,
    topGainers: sortTop(stocks, stock => stock.changePercent, 1),
    topLosers: sortTop(stocks, stock => stock.changePercent, -1),
    topAmount: sortTop(stocks, stock => stock.amount, 1),
  }
}

export function createTencentMarketProvider(options: MarketProviderOptions = {}): MarketProvider {
  const {
    fetchImpl = globalThis.fetch,
    now = Date.now,
    timeoutMs = MARKET_TIMEOUT_MS,
    overviewTtlMs = MARKET_OVERVIEW_TTL_MS,
    breadthTtlMs = MARKET_CACHE_TTL_MS,
    boardTtlMs = MARKET_BOARD_TTL_MS,
    globalTtlMs = GLOBAL_TTL_MS,
    retryDelayMs = 200,
    concurrency = 6,
  } = options
  if (typeof fetchImpl !== 'function') throw new Error('market fetch unavailable')
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new Error('invalid market timeout')
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 12) throw new Error('invalid market concurrency')
  if (![overviewTtlMs, breadthTtlMs, boardTtlMs, globalTtlMs, retryDelayMs].every(value => Number.isFinite(value) && value >= 0)) throw new Error('invalid market cache')

  const cache = new Map<string, CacheEntry<any>>()
  const inflight = new Map<string, Promise<any>>()

  async function request(url: string, encoding: 'utf-8' | 'gbk', maxBytes: number): Promise<string> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        redirect: 'error',
        signal: controller.signal,
        headers: { accept: 'application/json, text/plain, text/html', 'user-agent': 'dsh-x-finance/0.3 (local-only)' },
      })
      assertTextResponse(response)
      const bytes = await readBody(response, maxBytes)
      return new TextDecoder(encoding).decode(bytes)
    } finally {
      clearTimeout(timer)
      controller.abort()
    }
  }

  async function requestJson(url: string, maxBytes = MARKET_MAX_BYTES): Promise<any> {
    const text = await request(url, 'utf-8', maxBytes)
    let value: any
    try { value = JSON.parse(text) } catch { throw new Error('market invalid json') }
    if (!value || typeof value !== 'object') throw new Error('market invalid json')
    return value
  }

  async function quoteBatch(codes: string[], { requireAny = true }: { requireAny?: boolean } = {}): Promise<Map<string, string[]>> {
    if (!codes.length || codes.length > 300) throw new Error('invalid market quote batch')
    const text = await request(`${MARKET_QUOTE_ENDPOINT}${codes.join(',')}`, 'gbk', MARKET_MAX_BYTES)
    // An empty body means the request itself failed; a body without any usable
    // line means the source does not know these codes. Only the first case is a
    // transport failure, so the callers can tell "no data for this symbol" from
    // "the feed is gone".
    if (!text.trim()) throw new Error('empty market quote response')
    const parsed = parseTencentBatch(text)
    const allowed = new Set(codes)
    const result = new Map<string, string[]>()
    for (const [key, fields] of parsed) if (allowed.has(key)) result.set(key, fields)
    if (!result.size && requireAny) throw new Error('empty market quote batch')
    return result
  }

  async function fetchBoardRank(): Promise<Map<string, RankBoard>> {
    const url = `${MARKET_BOARD_RANK_ENDPOINT}?l=200&p=1&t=01/averatio&ordertype=&o=0`
    const payload = await requestJson(url)
    if (payload.code !== 0) throw new Error('market board rank failed')
    return parseBoardRank(payload)
  }

  /**
   * One batched request for the whole global board. The catalogue supplies the
   * secids, names, regions and time zones; the upstream only supplies numbers.
   * Rows the source does not answer for are missing from the response, never
   * filled with a neighbouring market's value.
   */
  function loadGlobalOverview(): Promise<GlobalMarketOverview> {
    const query = [
      'fltt=2',
      `secids=${GLOBAL_INSTRUMENTS.map(item => item.secid).join(',')}`,
      'fields=f2,f3,f4,f12,f13,f14,f15,f16,f17,f18,f124',
      `ut=${EASTMONEY_UT}`,
    ].join('&')
    return requestJson(`${GLOBAL_MARKET_ENDPOINT}?${query}`).then(payload => {
      if (payload?.rc !== 0 || !payload.data) throw new Error('global market failed')
      const stamp = now()
      const quotes = parseGlobalQuotes(payload, stamp)
      if (!quotes.length) throw new Error('global market empty')
      let quotedAt: string | null = null
      for (const quote of quotes) {
        if (quote.quotedAt && (!quotedAt || Date.parse(quote.quotedAt) > Date.parse(quotedAt))) quotedAt = quote.quotedAt
      }
      return { source: GLOBAL_MARKET_SOURCE, fetchedAt: isoNow(stamp), quotedAt, quotes }
    })
  }

  async function loadOverview(): Promise<MarketOverview> {
    const rank = await fetchBoardRank()
    const quotes = [
      ...INDEXES.map(index => index.quote),
      ...MARKET_LEVEL1_CODES.map(code => `pt01${code}`),
      ...[...rank.keys()].map(code => `pt01${code}`),
    ]
    const batch = await quoteBatch([...new Set(quotes)])
    const stamp = now()
    const indices: MarketIndex[] = []
    for (const index of INDEXES) {
      const fields = batch.get(index.quote)
      if (!fields) continue
      try { indices.push(parseIndexQuote(index.quote, fields, stamp)) } catch { /* one bad index must not hide the board */ }
    }
    if (indices.length < 3) throw new Error('market indices unavailable')
    const sectors: MarketSector[] = []
    for (const code of MARKET_LEVEL1_CODES) {
      const fields = batch.get(`pt01${code}`)
      if (!fields) continue
      try {
        const sector = parseBoardQuote(`pt01${code}`, fields, stamp, rank)
        if (sector) sectors.push(sector)
      } catch { /* skip one malformed board, keep the rest */ }
    }
    for (const [code, board] of rank) {
      const fields = batch.get(`pt01${code}`)
      if (fields) {
        try {
          const sector = parseBoardQuote(`pt01${code}`, fields, stamp, rank)
          if (sector) { sectors.push(sector); continue }
        } catch { /* fall through to the rank-only projection */ }
      }
      // A board without a quote is still a real board: show its rank change and
      // leader, but never invent turnover or market capitalisation.
      if (board.changePercent === null) continue
      sectors.push({
        code, name: board.name, level: 2, parent: level2Parent(board.name),
        changePercent: board.changePercent, amount: null, marketCap: null,
        topStock: board.topStock, quotedAt: null,
      })
    }
    if (sectors.filter(sector => sector.level === 1).length < 20) throw new Error('market sectors unavailable')
    let quotedAt: string | null = null
    for (const sector of sectors) quotedAt = laterQuote(quotedAt, sector.quotedAt)
    for (const index of indices) quotedAt = laterQuote(quotedAt, index.quotedAt)
    return {
      source: MARKET_SOURCE_NAME,
      fetchedAt: isoNow(stamp),
      quotedAt,
      indices,
      sectors: sectors.slice(0, MARKET_MAX_SECTORS),
    }
  }

  async function loadBreadth(): Promise<MarketBreadth> {
    const first = await retry(() => requestJson(`${MARKET_STOCK_RANK_ENDPOINT}?_appver=11.17.0&board_code=aStock&sort_type=turnover&direct=down&offset=0&count=${MARKET_PAGE_SIZE}`), 2)
    const firstPage = parseStockRankPage(first)
    const pages = Math.min(MARKET_MAX_PAGES, Math.ceil(firstPage.total / MARKET_PAGE_SIZE))
    if (pages < 1) throw new Error('market breadth empty')
    const offsets = Array.from({ length: pages }, (_, index) => index * MARKET_PAGE_SIZE)
    const results = await mapLimit(offsets, concurrency, async offset => {
      if (offset === 0) return { offset, page: firstPage }
      try {
        const payload = await retry(() => requestJson(`${MARKET_STOCK_RANK_ENDPOINT}?_appver=11.17.0&board_code=aStock&sort_type=turnover&direct=down&offset=${offset}&count=${MARKET_PAGE_SIZE}`), 2)
        return { offset, page: parseStockRankPage(payload) }
      } catch { return null }
    })
    const rows: MarketStock[] = []
    let failed = 0
    for (const result of results) {
      if (!result) { failed++; continue }
      rows.push(...result.page.rows)
    }
    return buildBreadth(rows, firstPage.total, failed > 0, now())
  }

  async function retry<T>(action: () => Promise<T>, attempts: number): Promise<T> {
    let error: unknown
    for (let attempt = 0; attempt < attempts; attempt++) {
      try { return await action() } catch (failure) { error = failure }
      if (attempt + 1 < attempts && retryDelayMs) await sleep(retryDelayMs)
    }
    throw error
  }

  async function loadBoard(code: string): Promise<BoardDetail> {
    const payload = await requestJson(`${MARKET_STOCK_RANK_ENDPOINT}?_appver=11.17.0&board_code=pt01${code}&sort_type=turnover&direct=down&offset=0&count=${MARKET_PAGE_SIZE}`)
    const page = parseStockRankPage(payload)
    const stocks = page.rows.slice(0, MARKET_MAX_BOARD_STOCKS)
    let name = level1Name(code) ?? code
    let changePercent: number | null = null
    let amount: number | null = null
    let marketCap: number | null = null
    const overviewEntry = cache.get('overview')
    const cachedOverview: MarketOverview | undefined = overviewEntry && overviewEntry.expires > now() ? overviewEntry.value : undefined
    const known = cachedOverview?.sectors.find(sector => sector.code === code)
    if (known) {
      name = known.name
      changePercent = known.changePercent
      amount = known.amount
      marketCap = known.marketCap
    } else {
      const quotes = await quoteBatch([`pt01${code}`])
      const fields = quotes.get(`pt01${code}`)
      if (fields) {
        try {
          const sector = parseBoardQuote(`pt01${code}`, fields, now(), new Map())
          if (sector) { name = sector.name; changePercent = sector.changePercent; amount = sector.amount; marketCap = sector.marketCap }
        } catch { /* keep the code as the name, no fabricated numbers */ }
      }
    }
    return {
      source: MARKET_SOURCE_NAME,
      fetchedAt: isoNow(now()),
      code,
      name,
      changePercent,
      amount,
      marketCap,
      total: page.total,
      truncated: page.total > stocks.length,
      stocks,
    }
  }

  /**
   * Today's 分时. Each source row is `HHmm price volume average`: volume is
   * lots (手) and is not converted, because this endpoint has no turnover to
   * prove the unit. Points outside the A-share session, duplicates and
   * malformed rows are dropped; nothing is interpolated.
   */
  function loadIntraday(symbol: string): Promise<MarketIntraday> {
    return requestJson(intradayUrl(symbol), MARKET_MAX_BYTES).then(payload => {
      const unavailable = (message: string) => Object.assign(new Error(message), { code: 'finance/intraday-unavailable' })
      try { return parseTrendsPayload(payload, symbol, now()) }
      catch (error: any) { throw unavailable(error?.message || 'intraday empty') }
    })
  }

  /**
   * One symbol's daily history. The source returns `qfqday`/`hfqday`/`day`
   * depending on adjustment, and silently falls back to `day` for symbols it
   * cannot adjust (STAR, some ETFs); the key is therefore read, not assumed.
   */
  async function loadHistory(symbol: string, adjustment: MarketAdjustment, limit: number): Promise<MarketHistory> {
    const code = `${symbol.slice(0, 2).toLowerCase()}${symbol.slice(3)}`
    const parameter = `${code},day,,,${limit},${adjustment === 'none' ? '' : adjustment === 'forward' ? 'qfq' : 'hfq'}`
    const payload = await requestJson(`${MARKET_HISTORY_ENDPOINT}?param=${parameter}`, MARKET_MAX_BYTES)
    if (payload.code !== 0) throw new Error('history request failed')
    const entry = payload.data?.[code]
    if (!entry || typeof entry !== 'object') throw new Error('history missing')
    // The source drops qfq/hfq for symbols it cannot adjust and answers with
    // `day`; that fallback is detected, never silently relabelled as adjusted.
    const preferred = adjustment === 'forward' ? 'qfqday' : adjustment === 'backward' ? 'hfqday' : 'day'
    const key = Array.isArray(entry[preferred]) && entry[preferred].length
      ? preferred
      : Array.isArray(entry.day) && entry.day.length ? 'day' : null
    if (!key) throw new Error('history empty')
    const parsed = parseDailyRows(entry[key])
    const fields = entry.qt?.[code]
    const quotedName = Array.isArray(fields) ? cleanText(fields[1], 64) : null
    const quotedPrice = Array.isArray(fields) ? finiteNumber(fields[3], 0, 1e9) : null
    // Sub-10-CNY ETFs quote three decimals; everything else two.
    const precision = quotedPrice !== null && quotedPrice < 10 ? 3 : 2
    return projectHistory({
      symbol,
      name: quotedName ?? symbol,
      rows: parsed.slice(-limit),
      // Report the adjustment actually returned: the source ignores qfq/hfq for
      // some symbols and sends `day` instead.
      adjustment: key === 'qfqday' ? 'forward' : key === 'hfqday' ? 'backward' : 'none',
      precision,
      now: now(),
    })
  }

  function getOrLoad<T>(key: string, ttl: number, loader: () => Promise<T>): Promise<T> {
    const cached = cache.get(key)
    if (cached && cached.expires > now()) return Promise.resolve(cached.value as T)
    const pending = inflight.get(key)
    if (pending) return pending as Promise<T>
    const promise = loader().then(value => {
      if (cache.size >= 64) {
        const oldest = cache.keys().next().value
        if (oldest !== undefined) cache.delete(oldest)
      }
      cache.set(key, { expires: now() + ttl, value })
      return value
    }).finally(() => { inflight.delete(key) })
    inflight.set(key, promise)
    return promise
  }

  return {
    name: MARKET_SOURCE_NAME,
    overview: () => getOrLoad('overview', overviewTtlMs, loadOverview),
    breadth: () => getOrLoad('breadth', breadthTtlMs, loadBreadth),
    globalOverview: () => getOrLoad('global', globalTtlMs, loadGlobalOverview),
    board: (input: unknown) => {
      const code = validateBoardCode(input)
      return getOrLoad(`board:${code}`, boardTtlMs, () => loadBoard(code))
    },
    // Deliberately uncached: the bottom bar is the one place that polls for a
    // live price, and a cached snapshot would make it look fresher than it is.
    // Concurrent callers still share a single upstream request.
    quotes: (input: unknown) => {
      if (!Array.isArray(input) || !input.length || input.length > MARKET_MAX_QUOTES) throw new Error('invalid market quote request')
      const symbols = input.map(validateSymbol)
      if (new Set(symbols).size !== symbols.length) throw new Error('invalid market quote request')
      const codes = symbols.map(symbol => `${symbol.slice(0, 2).toLowerCase()}${symbol.slice(3)}`)
      return getOrLoad(`quotes:${codes.join(',')}`, 0, async () => {
        const batch = await quoteBatch(codes, { requireAny: false })
        const stamp = now()
        const quotes: MarketQuote[] = []
        for (const [key, fields] of batch) {
          try { quotes.push(parseStockQuote(key, fields, stamp)) } catch { /* one bad line must not hide the others */ }
        }
        return quotes
      })
    },
    // A closed daily bar does not change during the session, so history is
    // cached briefly; the newest (provisional) bar refreshes with it.
    history: (input: unknown, options: unknown) => {
      const symbol = validateSymbol(input)
      const { adjustment, limit } = (options ?? {}) as { adjustment?: unknown; limit?: unknown }
      const normalized = validateAdjustment(adjustment)
      const count = validateHistoryLimit(limit)
      return getOrLoad(`history:${symbol}:${normalized}:${count}`, overviewTtlMs, () => loadHistory(symbol, normalized, count))
    },
    intraday: (input: unknown) => {
      const symbol = validateSymbol(input)
      return getOrLoad(`intraday:${symbol}`, MARKET_INTRADAY_TTL_MS, () => loadIntraday(symbol))
    },
  }
}

/** Shanghai / Shenzhen are market 1 / 0. Beijing shares the Shenzhen market id; the codes do not overlap. */
export function eastmoneySecId(symbol: string): string {
  const market = symbol.slice(0, 2)
  const code = symbol.slice(3)
  if (market === 'SH') return `1.${code}`
  if (market === 'SZ' || market === 'BJ') return `0.${code}`
  throw new Error('intraday market')
}

export function intradayUrl(symbol: string): string {
  const params = new URLSearchParams({
    secid: eastmoneySecId(symbol),
    fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58',
    iscr: '0',
    ndays: '1',
    ut: EASTMONEY_UT,
  })
  return `${MARKET_INTRADAY_ENDPOINT}?${params}`
}

function trendNumber(raw: string): number | null {
  if (!raw || raw === '-') return null
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

/**
 * One trends2 row is `time,open,close,high,low,volume,amount,average`.
 * The 分时 price is the minute close. Volume stays in lots. Exported for tests.
 */
export function parseTrendsPayload(payload: any, symbol: string, now: number): MarketIntraday {
  const data = payload?.data
  const rows = data?.trends
  if (!data || !Array.isArray(rows)) throw new Error('intraday missing')
  const code = symbol.slice(3)
  if (String(data.code ?? '') !== code) throw new Error('intraday symbol')
  const today = shanghaiToday(now)
  const points: MarketIntraday['points'] = []
  let sessionDate = ''
  let previous = ''
  for (const row of rows) {
    if (points.length >= MARKET_INTRADAY_MAX_POINTS || typeof row !== 'string') continue
    const fields = row.split(',')
    if (fields.length < 8) continue
    const stamp = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})$/.exec(fields[0] ?? '')
    if (!stamp) continue
    const date = stamp[1]!
    const time = `${stamp[2]}:${stamp[3]}`
    if (date > today || !isAshareMinute(time)) continue
    if (!sessionDate) sessionDate = date
    if (date !== sessionDate) { points.length = 0; sessionDate = date; previous = '' }
    if (time <= previous) continue
    const price = trendNumber(fields[2] ?? '')
    const volume = trendNumber(fields[5] ?? '')
    const average = trendNumber(fields[7] ?? '')
    if (price === null || price <= 0 || price > 1e12) continue
    if (volume !== null && (volume < 0 || volume > Number.MAX_SAFE_INTEGER)) continue
    if (average !== null && (average <= 0 || average > 1e12)) continue
    previous = time
    points.push({ time, price, volume, average })
  }
  if (!sessionDate || !points.length) throw new Error('intraday empty')
  const quotedName = cleanText(data.name, 64)
  const previousClose = positiveOrNull(typeof data.preClose === 'number' ? data.preClose : finiteNumber(String(data.preClose ?? ''), 0, 1e12))
  const sample = previousClose ?? points.at(-1)!.price
  const clock = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(now))
  const pick = (type: string) => clock.find(part => part.type === type)?.value ?? ''
  const minutes = Number(pick('hour')) * 60 + Number(pick('minute'))
  const weekend = pick('weekday') === 'Sat' || pick('weekday') === 'Sun'
  return {
    symbol,
    name: quotedName ?? symbol,
    source: MARKET_INTRADAY_SOURCE,
    fetchedAt: isoNow(now),
    sessionDate,
    previousClose,
    pricePrecision: sample < 10 ? 3 : 2,
    volumeBasis: 'lots',
    currency: 'CNY',
    exchangeTimezone: 'Asia/Shanghai',
    closed: sessionDate < today || weekend || minutes >= 15 * 60,
    points,
  }
}

export { INDEXES as MARKET_INDEXES }
