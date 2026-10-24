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
  MARKET_MAX_BOARD_STOCKS, MARKET_MAX_PAGES, MARKET_MAX_QUOTES, MARKET_MAX_QUOTE_BATCH, MARKET_MAX_SECTORS, MARKET_MAX_STOCKS,
  MARKET_OVERVIEW_TTL_MS, MARKET_PAGE_SIZE, MARKET_SOURCE_NAME, MARKET_DISTRIBUTION, distributionBucket,
  level2Parent, level1Name, normalizeMarketCode, quotePrecision, shanghaiToday, validateBoardCode, validateHistoryLimit,
  validateAdjustment, isAshareMinute,
} from './market.ts'
import type {
  BoardDetail, MarketAdjustment, MarketBreadth, MarketDailyBar, MarketHistory, MarketIndex, MarketOverview,
  MarketQuote, MarketSector, MarketStock, MarketTopStock, MarketProvider, MarketIntraday,
} from './market.ts'
import { GLOBAL_INSTRUMENTS, GLOBAL_MARKET_ENDPOINT, GLOBAL_MARKET_SOURCE, GLOBAL_TTL_MS, globalQuoteTime, parseGlobalQuotes } from './global.ts'
import {
  TAIL_SCAN_FILTERS, TAIL_SCAN_MAX_HISTORY, TAIL_SCAN_MAX_INTRADAY, TAIL_SCAN_MAX_RESULTS,
  TAIL_SCAN_MIN_AMOUNT, TAIL_SCAN_MIN_DAY_CHANGE, TAIL_SCAN_MIN_TAIL_CHANGE, TAIL_SCAN_MIN_TAIL_RATIO,
  TAIL_SCAN_MIN_VOLUME_RATIO, TAIL_SCAN_TTL_MS, computeDailyVolumeContext, computeTailMetrics,
  scoreTailCandidate, tailQuantFromBars,
} from './tail-scan.ts'
import type { TailMetrics, TailMinutePoint, TailScanCandidate, TailScanResult } from './tail-scan.ts'
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
/** Tencent's own minute feed, used only by the opt-in tail scan. */
export const MARKET_MINUTE_ENDPOINT = 'https://web.ifzq.gtimg.cn/appstock/app/minute/query'
export const MARKET_MINUTE_SOURCE = '腾讯分时 (unofficial)'
export const MARKET_MINUTE_MAX_BYTES = 128 * 1024
/** Fallback minute feed: Sina's 1-minute K-line JSONP, already used by the gold panel. */
export const MARKET_SINA_MINUTE_ENDPOINT = 'https://quotes.sina.cn/cn/api/jsonp_v2.php/var%20_data=/CN_MarketDataService.getKLineData'
export const MARKET_SINA_MINUTE_MAX_BYTES = 256 * 1024
export const MARKET_SINA_MINUTE_SOURCE = '新浪分时 (unofficial)'
export const MARKET_TAIL_SOURCE = `${MARKET_SOURCE_NAME} + 腾讯/新浪分时 (unofficial)`
const EASTMONEY_UT = 'fa5fd1943c7b386f172d6893dbfba10b'
export const MARKET_INTRADAY_TTL_MS = 15_000
export const MARKET_INTRADAY_MAX_POINTS = 300
export const MARKET_TIMEOUT_MS = 10_000
export const MARKET_MAX_BYTES = 512 * 1024
export const MARKET_TOP_LIMIT = 8
const STAMP = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/

const INDEXES = [
  { quote: 'sh000001', code: 'SH.000001', market: 'cn' },
  { quote: 'sz399001', code: 'SZ.399001', market: 'cn' },
  { quote: 'sz399006', code: 'SZ.399006', market: 'cn' },
  { quote: 'sh000300', code: 'SH.000300', market: 'cn' },
  { quote: 'sh000688', code: 'SH.000688', market: 'cn' },
  { quote: 'bj899050', code: 'BJ.899050', market: 'cn' },
  // Broad large/mid/small-cap coverage that the same Tencent endpoint answers
  // for. 中证500 and 中证800 complete the 300/500/800/1000 ladder; without them
  // the board jumps from 沪深300 straight to 中证1000.
  { quote: 'sh000905', code: 'SH.000905', market: 'cn' },
  { quote: 'sh000906', code: 'SH.000906', market: 'cn' },
  { quote: 'sh000852', code: 'SH.000852', market: 'cn' },
  { quote: 'sh000985', code: 'SH.000985', market: 'cn' },
  // Hang Seng family: Tencent answers these under its HK index namespace.
  { quote: 'hkHSI', code: 'HK.HSI', market: 'hk' },
  { quote: 'hkHSCEI', code: 'HK.HSCEI', market: 'hk' },
  { quote: 'hkHSTECH', code: 'HK.HSTECH', market: 'hk' },
  { quote: 'hkHSCCI', code: 'HK.HSCCI', market: 'hk' },
] as const
/** CSI 2000 is not served by Tencent/Sina; try both known East Money secids. */
const CN_EXTRA_SECIDS = ['1.932000', '2.932000'] as const

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
  // Tencent fields are strings; East Money rows are numbers. Both are accepted
  // so the two upstreams share the same numeric validation.
  if (typeof raw === 'number') return Number.isFinite(raw) && raw >= min && raw <= max ? raw : null
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

const HK_STAMP = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/

/**
 * Hang Seng lines stamp `yyyy/MM/dd HH:mm:ss` in Hong Kong time (UTC+8, no
 * DST). Impossible or future stamps are rejected, not clamped. Exported for tests.
 */
export function parseTencentHkTimestamp(raw: unknown, now: number): string {
  const match = typeof raw === 'string' ? HK_STAMP.exec(raw) : null
  if (!match) throw new Error('invalid hk quote timestamp')
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  const hour = Number(match[4]), minute = Number(match[5]), second = Number(match[6])
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) throw new Error('invalid hk quote timestamp')
  const calendar = new Date(Date.UTC(year, month - 1, day))
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) throw new Error('invalid hk quote timestamp')
  const stamp = Date.UTC(year, month - 1, day, hour - 8, minute, second)
  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}+08:00`
  if (!Number.isFinite(stamp) || Date.parse(iso) !== stamp) throw new Error('invalid hk quote timestamp')
  if (stamp > now + 300_000) throw new Error('hk quote timestamp is in the future')
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
  if (type && !type.includes('json') && !type.includes('javascript') && !type.startsWith('text/')) throw new Error('market response type')
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
    const match = /^v_((?:sh|sz|bj)\d{6}|hk[A-Z]+|pt\d{8})="([^"]*)";?$/.exec(line)
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
  // Hang Seng lines use the same numeric columns but a slash timestamp and an
  // HKD turnover field whose unit is not verified; turnover is therefore left
  // null instead of being labelled as CNY.
  if (market === 'hk') {
    if (!/^[A-Z]+$/.test(digits)) throw new Error('invalid hk index code')
    return {
      code: `HK.${digits}`,
      name,
      price,
      change,
      changePercent,
      open: positiveOrNull(finiteNumber(fields[5], 0, 1e9)),
      high: positiveOrNull(finiteNumber(fields[33], 0, 1e9)),
      low: positiveOrNull(finiteNumber(fields[34], 0, 1e9)),
      previousClose: positiveOrNull(finiteNumber(fields[4], 0, 1e9)),
      amount: null,
      quotedAt: parseTencentHkTimestamp(fields[30], now),
    }
  }
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

/** Extra Tencent quote fields used only by the local tail scan. */
export interface TailQuote {
  symbol: string
  name: string
  price: number
  pricePrecision: number | null
  changePercent: number
  previousClose: number
  /** Today's volume in lots (手), the source's own unit. */
  volumeLots: number
  /** Turnover in CNY. */
  amount: number
  turnoverPercent: number
  /** Tencent's daily volume ratio (量比), not the tail ratio. */
  volumeRatio: number
  quotedAt: string
  sessionDate: string
}

/**
 * Parses the fields the tail scan needs. A missing or malformed field makes the
 * row unusable rather than being replaced by a zero; the scan then has fewer
 * candidates, which is honest. Exported for tests.
 */
export function parseTailQuote(key: string, fields: string[], now: number): TailQuote | null {
  const match = /^(sh|sz|bj)(\d{6})$/.exec(key)
  if (!match) return null
  const market = match[1]!
  const digits = match[2]!
  if (fields[2] !== digits) return null
  const name = cleanText(fields[1], 64)
  const price = finiteNumber(fields[3], 0.0001, 1e9)
  const changePercent = finiteNumber(fields[32], -1000, 1000)
  const previousClose = finiteNumber(fields[4], 0.0001, 1e9)
  const volumeLots = finiteNumber(fields[6], 0, 1e15)
  const amountWan = finiteNumber(fields[37], 0, 1e12)
  const turnoverPercent = finiteNumber(fields[38], 0, 1000)
  const volumeRatio = finiteNumber(fields[49], 0, 1e4)
  if (!name || price === null || changePercent === null || previousClose === null
    || volumeLots === null || amountWan === null || turnoverPercent === null
    || volumeRatio === null || !(amountWan > 0) || !(volumeRatio > 0)) return null
  const quotedAt = parseTencentTimestamp(fields[30], now)
  return {
    symbol: `${market.toUpperCase()}.${digits}`,
    name,
    price,
    pricePrecision: quotePrecision(fields[3]),
    changePercent,
    previousClose,
    volumeLots,
    amount: amountWan * 10_000,
    turnoverPercent,
    volumeRatio,
    quotedAt,
    sessionDate: quotedAt.slice(0, 10),
  }
}

export interface TailMinuteSeries {
  symbol: string
  name: string
  sessionDate: string
  previousClose: number | null
  /** Per-minute deltas; volume is lots and amount is CNY. */
  points: TailMinutePoint[]
}

/**
 * Tencent's minute rows are `HHmm price cumulativeVolume cumulativeAmount`, not
 * per-minute values, and the feed appends after-hours rows beyond 15:00. This
 * parser keeps only A-share minutes, differences the cumulative counters, and
 * drops non-monotonic rows instead of turning them into negative volume.
 * Exported for tests.
 */
export function parseTencentMinutePayload(payload: any, symbol: string, now: number): TailMinuteSeries {
  const code = `${symbol.slice(0, 2).toLowerCase()}${symbol.slice(3)}`
  const entry = payload?.data?.[code]
  const block = entry?.data
  const rows = block?.data
  if (!block || !Array.isArray(rows)) throw new Error('minute missing')
  if (rows.length > 400) throw new Error('minute response too large')
  const stamp = /^(\d{4})(\d{2})(\d{2})$/.exec(String(block.date ?? ''))
  if (!stamp) throw new Error('minute session date')
  const sessionDate = `${stamp[1]}-${stamp[2]}-${stamp[3]}`
  if (sessionDate > shanghaiToday(now)) throw new Error('minute session date is in the future')
  const quote = entry?.qt?.[code]
  const name = Array.isArray(quote) ? cleanText(quote[1], 64) : null
  const previousClose = Array.isArray(quote) ? finiteNumber(quote[4], 0.0001, 1e12) : null
  const points: TailMinutePoint[] = []
  let previousVolume = 0
  let previousAmount = 0
  let previousTime = ''
  for (const raw of rows) {
    if (typeof raw !== 'string') continue
    const fields = raw.trim().split(/\s+/)
    if (fields.length < 4) continue
    const clock = fields[0]!
    if (!/^\d{4}$/.test(clock)) continue
    const time = `${clock.slice(0, 2)}:${clock.slice(2)}`
    if (!isAshareMinute(time) || time <= previousTime) continue
    const price = finiteNumber(fields[1], 0.0001, 1e12)
    const cumulativeVolume = finiteNumber(fields[2], 0, Number.MAX_SAFE_INTEGER)
    const cumulativeAmount = finiteNumber(fields[3], 0, Number.MAX_SAFE_INTEGER)
    if (price === null || cumulativeVolume === null || cumulativeAmount === null) continue
    // A reset or a skipped upstream row must not fabricate negative volume.
    if (cumulativeVolume < previousVolume || cumulativeAmount < previousAmount) {
      previousVolume = cumulativeVolume
      previousAmount = cumulativeAmount
      continue
    }
    const volume = cumulativeVolume - previousVolume
    const amount = cumulativeAmount - previousAmount
    previousVolume = cumulativeVolume
    previousAmount = cumulativeAmount
    previousTime = time
    points.push({ time, price, volume, amount })
  }
  if (points.length < 2) throw new Error('minute empty')
  if (points.length > MARKET_INTRADAY_MAX_POINTS) throw new Error('minute too many points')
  return {
    symbol,
    name: name ?? symbol,
    sessionDate,
    previousClose,
    points,
  }
}

/**
 * Sina's minute K-line is a JSONP array of `{day, open, high, low, close,
 * volume, amount}` rows. Volume is shares and amount is CNY. The feed may carry
 * the previous session too, so only the newest session date is kept. Exported
 * for tests.
 */
export function parseSinaMinutePayload(text: string, symbol: string, now: number, previousClose: number | null = null): TailMinuteSeries {
  const match = /var\s+_data\s*=\s*\((\[.*\])\)/s.exec(String(text))
  if (!match) throw new Error('sina minute missing')
  let rows: any
  try { rows = JSON.parse(match[1]!) } catch { throw new Error('sina minute invalid json') }
  if (!Array.isArray(rows) || !rows.length || rows.length > 400) throw new Error('sina minute invalid rows')
  let sessionDate = ''
  const parsed: TailMinutePoint[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const stamp = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):\d{2}$/.exec(String(row.day ?? ''))
    if (!stamp) continue
    const date = stamp[1]!
    if (date > sessionDate) { sessionDate = date; parsed.length = 0 }
    if (date !== sessionDate) continue
    const time = `${stamp[2]}:${stamp[3]}`
    if (!isAshareMinute(time)) continue
    const price = finiteNumber(row.close, 0.0001, 1e12)
    const volume = finiteNumber(row.volume, 0, Number.MAX_SAFE_INTEGER)
    const amount = finiteNumber(row.amount, 0, Number.MAX_SAFE_INTEGER)
    if (price === null || volume === null || amount === null) continue
    parsed.push({ time, price, volume, amount })
  }
  if (!sessionDate || !parsed.length) throw new Error('sina minute empty')
  if (sessionDate > shanghaiToday(now)) throw new Error('sina minute session date is in the future')
  const unique = new Map(parsed.map(point => [point.time, point]))
  const points = [...unique.values()].sort((left, right) => left.time.localeCompare(right.time))
  if (points.length < 2) throw new Error('sina minute short')
  return { symbol, name: symbol, sessionDate, previousClose, points }
}

export async function loadTailMinuteSeries(
  symbol: string,
  previousClose: number | null,
  options: { request: (url: string, encoding: 'utf-8' | 'gbk', maxBytes: number) => Promise<string>; now: () => number },
): Promise<TailMinuteSeries> {
  try {
    const payload = await options.request(tencentMinuteUrl(symbol), 'utf-8', MARKET_MINUTE_MAX_BYTES)
    const value = JSON.parse(payload)
    return parseTencentMinutePayload(value, symbol, options.now())
  } catch {
    const code = `${symbol.slice(0, 2).toLowerCase()}${symbol.slice(3)}`
    const query = `?symbol=${encodeURIComponent(code)}&scale=1&ma=no&datalen=300`
    const text = await options.request(`${MARKET_SINA_MINUTE_ENDPOINT}${query}`, 'gbk', MARKET_SINA_MINUTE_MAX_BYTES)
    return parseSinaMinutePayload(text, symbol, options.now(), previousClose)
  }
}

export function tencentMinuteUrl(symbol: string): string {
  const code = `${symbol.slice(0, 2).toLowerCase()}${symbol.slice(3)}`
  return `${MARKET_MINUTE_ENDPOINT}?code=${encodeURIComponent(code)}`
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
    if (!codes.length || codes.length > MARKET_MAX_QUOTE_BATCH) throw new Error('invalid market quote batch')
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

  /**
   * CSI 2000 is not served by the Tencent/Sina endpoints used for the rest of
   * the board. East Money is already the global-board upstream, so it is tried
   * here as a best-effort supplement; a failure simply omits the card and never
   * fails the A-share overview.
   */
  async function loadCnExtra(): Promise<MarketIndex | null> {
    try {
      const query = [
        'fltt=2',
        `secids=${CN_EXTRA_SECIDS.join(',')}`,
        'fields=f2,f3,f4,f12,f13,f14,f15,f16,f17,f18,f124',
        `ut=${EASTMONEY_UT}`,
      ].join('&')
      const payload = await requestJson(`${GLOBAL_MARKET_ENDPOINT}?${query}`)
      const rows = payload?.data?.diff
      const row = Array.isArray(rows) ? rows.find((item: any) => item?.f12 === '932000') : null
      if (!row) return null
      const price = finiteNumber(row.f2, 0.0001, 1e9)
      const change = finiteNumber(row.f4, -1e9, 1e9)
      const changePercent = finiteNumber(row.f3, -100, 100)
      const quotedAt = globalQuoteTime(row.f124, now())
      if (price === null || change === null || changePercent === null || !quotedAt) return null
      return {
        code: 'SH.932000',
        name: '中证2000',
        price, change, changePercent,
        open: positiveOrNull(finiteNumber(row.f17, 0, 1e9)),
        high: positiveOrNull(finiteNumber(row.f15, 0, 1e9)),
        low: positiveOrNull(finiteNumber(row.f16, 0, 1e9)),
        previousClose: positiveOrNull(finiteNumber(row.f18, 0, 1e9)),
        amount: null,
        quotedAt,
      }
    } catch { return null }
  }

  async function loadOverview(): Promise<MarketOverview> {
    const rank = await fetchBoardRank()
    const quotes = [
      ...INDEXES.map(index => index.quote),
      ...MARKET_LEVEL1_CODES.map(code => `pt01${code}`),
      ...[...rank.keys()].map(code => `pt01${code}`),
    ]
    const [batch, extraIndex] = await Promise.all([quoteBatch([...new Set(quotes)]), loadCnExtra()])
    const stamp = now()
    const indices: MarketIndex[] = []
    for (const index of INDEXES) {
      const fields = batch.get(index.quote)
      if (!fields) continue
      try { indices.push(parseIndexQuote(index.quote, fields, stamp)) } catch { /* one bad index must not hide the board */ }
    }
    if (extraIndex) indices.push(extraIndex)
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
    // The header clock and market status describe the A-share session; a later
    // Hang Seng timestamp must not move that clock past the Shanghai close.
    let quotedAt: string | null = null
    for (const sector of sectors) quotedAt = laterQuote(quotedAt, sector.quotedAt)
    for (const index of indices) if (!index.code.startsWith('HK.')) quotedAt = laterQuote(quotedAt, index.quotedAt)
    return {
      source: MARKET_SOURCE_NAME,
      fetchedAt: isoNow(stamp),
      quotedAt,
      indices,
      sectors: sectors.slice(0, MARKET_MAX_SECTORS),
    }
  }

  interface BreadthRowsState { rows: MarketStock[]; expected: number; partial: boolean }

  /**
   * The full valid A-share list, not only the breadth aggregates. The board and
   * the tail scan share this one cached fetch sequence, so opening the scan
   * does not re-download the market the page already loaded.
   */
  async function loadBreadthRowsRaw(): Promise<BreadthRowsState> {
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
    const unique = new Map<string, MarketStock>()
    let failed = 0
    for (const result of results) {
      if (!result) { failed++; continue }
      for (const stock of result.page.rows) if (!unique.has(stock.code)) unique.set(stock.code, stock)
    }
    const rows = [...unique.values()]
    if (!rows.length || rows.length < firstPage.total * 0.9) throw new Error('market breadth coverage too low')
    return { rows, expected: firstPage.total, partial: failed > 0 }
  }

  function loadBreadthRows(): Promise<BreadthRowsState> {
    return getOrLoad('breadth-rows', breadthTtlMs, loadBreadthRowsRaw)
  }

  async function loadBreadth(): Promise<MarketBreadth> {
    const state = await loadBreadthRows()
    return buildBreadth(state.rows, state.expected, state.partial, now())
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

  /**
   * Market-wide late-session scan. Stage 1 uses the already-cached breadth list
   * and batched quotes to find liquid decliners with volume expansion; stage 2
   * fetches minute lines and keeps only a falling tail with excessive volume;
   * stage 3 fetches daily bars for the survivors and computes the daily
   * volume-decline context plus the same quant snapshot used by the chart.
   * Every stage is bounded and a failed symbol is counted, never filled in.
   */
  async function loadTailScan(): Promise<TailScanResult> {
    const stamp = now()
    const breadthState = await loadBreadthRows()
    const pool = breadthState.rows.filter(stock =>
      !stock.suspended
      && stock.price > 0
      && stock.changePercent <= TAIL_SCAN_MIN_DAY_CHANGE
      && stock.amount >= TAIL_SCAN_MIN_AMOUNT
      && !/^(?:\*?ST|S\*ST)(?![A-Za-z])/i.test(stock.name)
      && !/^退市/.test(stock.name)
      && !/^[NC]/.test(stock.name),
    )
    const quotes = new Map<string, TailQuote>()
    let quoteFailures = 0
    for (let offset = 0; offset < pool.length; offset += MARKET_MAX_QUOTE_BATCH) {
      const batch = pool.slice(offset, offset + MARKET_MAX_QUOTE_BATCH)
      const codes = batch.map(stock => `${stock.code.slice(0, 2).toLowerCase()}${stock.code.slice(3)}`)
      try {
        const rows = await retry(() => quoteBatch(codes), 2)
        for (const [key, fields] of rows) {
          try {
            const quote = parseTailQuote(key, fields, stamp)
            if (quote) quotes.set(quote.symbol, quote)
          } catch { /* one malformed line must not hide the pool */ }
        }
      } catch { quoteFailures += batch.length }
    }
    let sessionDate: string | null = null
    for (const quote of quotes.values()) if (!sessionDate || quote.sessionDate > sessionDate) sessionDate = quote.sessionDate
    if (!sessionDate) {
      return {
        source: MARKET_TAIL_SOURCE,
        fetchedAt: isoNow(stamp),
        sessionDate: null,
        sessionIsToday: false,
        complete: false,
        universe: {
          expected: breadthState.expected, covered: breadthState.rows.length, screened: 0,
          intradayChecked: 0, tailConfirmed: 0, historyChecked: 0,
          failedIntraday: 0, failedHistory: 0, partial: breadthState.partial || quoteFailures > 0,
        },
        filters: TAIL_SCAN_FILTERS,
        candidates: [],
      }
    }
    const activeSession = sessionDate
    const screened = [...quotes.values()].filter(quote =>
      quote.sessionDate === activeSession
      && quote.changePercent <= TAIL_SCAN_MIN_DAY_CHANGE
      && quote.volumeRatio >= TAIL_SCAN_MIN_VOLUME_RATIO
      && quote.amount >= TAIL_SCAN_MIN_AMOUNT,
    ).sort((left, right) => {
      const score = (quote: TailQuote) => (-quote.changePercent) * 0.5
        + Math.log(Math.max(quote.volumeRatio, 0.1)) * 2
        + Math.log10(Math.max(quote.amount, 1)) * 0.2
      return score(right) - score(left) || left.symbol.localeCompare(right.symbol)
    })
    const intradayPool = screened.slice(0, TAIL_SCAN_MAX_INTRADAY)
    const checked: { quote: TailQuote; tail: TailMetrics }[] = []
    let failedIntraday = 0
    await mapLimit(intradayPool, Math.min(4, concurrency), async quote => {
      try {
        const series = await loadTailMinuteSeries(quote.symbol, quote.previousClose, { request, now })
        if (series.sessionDate !== activeSession) throw new Error('minute session mismatch')
        const tail = computeTailMetrics(series.points, { sessionDate: activeSession, previousClose: quote.previousClose })
        checked.push({ quote, tail })
      } catch { failedIntraday++ }
    })
    const confirmed = checked.filter(item =>
      item.tail.complete
      && item.tail.tailVolumeRatio !== null
      && item.tail.tailVolumeRatio >= TAIL_SCAN_MIN_TAIL_RATIO
      && item.tail.tailReturn !== null
      && item.tail.tailReturn <= TAIL_SCAN_MIN_TAIL_CHANGE,
    )
    const historyCandidates: TailScanCandidate[] = confirmed.map(item => {
      const scored = scoreTailCandidate({
        tailReturn: item.tail.tailReturn,
        tailVolumeRatio: item.tail.tailVolumeRatio,
        changePercent: item.quote.changePercent,
        daily: null,
      })
      return {
        symbol: item.quote.symbol,
        name: item.quote.name,
        price: item.quote.price,
        changePercent: item.quote.changePercent,
        amount: item.quote.amount,
        turnoverPercent: item.quote.turnoverPercent,
        volumeRatio: item.quote.volumeRatio,
        fiveMinuteChange: null,
        sessionDate: activeSession,
        tail: item.tail,
        daily: null,
        quant: null,
        historyAvailable: false,
        adjustment: null,
        ...scored,
      }
    }).sort((left, right) => right.score - left.score)
    const forHistory = historyCandidates.slice(0, TAIL_SCAN_MAX_HISTORY)
    let failedHistory = 0
    await mapLimit(forHistory, Math.min(4, concurrency), async candidate => {
      try {
        const history = await loadHistory(candidate.symbol, 'forward', 250)
        const daily = computeDailyVolumeContext(history.bars, activeSession)
        const quant = tailQuantFromBars(history.bars)
        const scored = scoreTailCandidate({
          tailReturn: candidate.tail.tailReturn,
          tailVolumeRatio: candidate.tail.tailVolumeRatio,
          changePercent: candidate.changePercent,
          daily: daily.samples > 0 ? daily : null,
        })
        candidate.daily = daily.samples > 0 ? daily : null
        candidate.quant = quant
        candidate.adjustment = history.adjustment
        candidate.historyAvailable = daily.samples > 0
        candidate.score = scored.score
        candidate.factors = scored.factors
        candidate.flags = scored.flags
      } catch { failedHistory++ }
    })
    const candidates = historyCandidates
      .sort((left, right) => right.score - left.score)
      .slice(0, TAIL_SCAN_MAX_RESULTS)
    return {
      source: MARKET_TAIL_SOURCE,
      fetchedAt: isoNow(stamp),
      sessionDate: activeSession,
      sessionIsToday: activeSession === shanghaiToday(stamp),
      complete: checked.length > 0 && checked.every(item => item.tail.complete),
      universe: {
        expected: breadthState.expected,
        covered: breadthState.rows.length,
        screened: screened.length,
        intradayChecked: intradayPool.length,
        tailConfirmed: confirmed.length,
        historyChecked: forHistory.length,
        failedIntraday,
        failedHistory,
        partial: breadthState.partial || quoteFailures > 0 || failedIntraday > 0 || failedHistory > 0,
      },
      filters: TAIL_SCAN_FILTERS,
      candidates,
    }
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
    tailScan: () => getOrLoad('tail-scan', TAIL_SCAN_TTL_MS, loadTailScan),
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
