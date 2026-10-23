// Global index board contract. The catalogue is a fixed, reviewed identity
// list, not a discovery scan: a code that the upstream does not answer for is
// omitted rather than shown with an invented value, and a quote that arrives
// for an unknown code is dropped. Names, regions and time zones come from the
// catalogue, so a replacement adapter cannot relabel an index.
//
// This is the same opt-in, unofficial source family as the market board: no
// SLA, no redistribution right, no exchange licence, and no trading advice.

export const GLOBAL_MARKET_ENDPOINT = 'https://push2.eastmoney.com/api/qt/ulist.np/get'
export const GLOBAL_MARKET_SOURCE = '东方财富全球指数 (unofficial)'
/** One batched request covers the whole board. */
export const GLOBAL_MAX_QUOTES = 64
export const GLOBAL_TTL_MS = 60_000

export type GlobalRegionKey = 'americas' | 'asiaPacific' | 'europe'

export interface GlobalRegion {
  key: GlobalRegionKey
  name: string
  nameEn: string
}

export const GLOBAL_REGIONS: readonly GlobalRegion[] = [
  { key: 'americas', name: '美洲', nameEn: 'Americas' },
  { key: 'asiaPacific', name: '亚太', nameEn: 'Asia-Pacific' },
  { key: 'europe', name: '欧洲', nameEn: 'Europe' },
]

export interface GlobalInstrument {
  /** Upstream `market.code` identity, e.g. `100.N225` or `1.000001`. */
  secid: string
  /** Stable display code, e.g. `N225` or `SH.000001`. */
  code: string
  region: GlobalRegionKey
  name: string
  nameEn: string
  /** IANA zone of the exchange that publishes this index. */
  timeZone: string
}

/**
 * Curated major indices by region. This is deliberately an identity list: the
 * upstream's own global-index list is not queried, so a new or removed upstream
 * row cannot silently change what the page claims to show.
 */
export const GLOBAL_INSTRUMENTS: readonly GlobalInstrument[] = [
  // Americas
  { secid: '100.DJIA', code: 'DJIA', region: 'americas', name: '道琼斯工业指数', nameEn: 'Dow Jones', timeZone: 'America/New_York' },
  { secid: '100.SPX', code: 'SPX', region: 'americas', name: '标普500', nameEn: 'S&P 500', timeZone: 'America/New_York' },
  { secid: '100.NDX', code: 'NDX', region: 'americas', name: '纳斯达克', nameEn: 'Nasdaq', timeZone: 'America/New_York' },
  { secid: '100.TSX', code: 'TSX', region: 'americas', name: '加拿大标普/TSX', nameEn: 'S&P/TSX', timeZone: 'America/Toronto' },
  { secid: '100.BVSP', code: 'BVSP', region: 'americas', name: '巴西BOVESPA', nameEn: 'Bovespa', timeZone: 'America/Sao_Paulo' },
  { secid: '100.MXX', code: 'MXX', region: 'americas', name: '墨西哥BOLSA', nameEn: 'IPC Mexico', timeZone: 'America/Mexico_City' },
  // Asia-Pacific
  { secid: '1.000001', code: 'SH.000001', region: 'asiaPacific', name: '上证指数', nameEn: 'SSE Composite', timeZone: 'Asia/Shanghai' },
  { secid: '0.399001', code: 'SZ.399001', region: 'asiaPacific', name: '深证成指', nameEn: 'SZSE Component', timeZone: 'Asia/Shanghai' },
  { secid: '0.399006', code: 'SZ.399006', region: 'asiaPacific', name: '创业板指', nameEn: 'ChiNext', timeZone: 'Asia/Shanghai' },
  { secid: '100.HSI', code: 'HSI', region: 'asiaPacific', name: '恒生指数', nameEn: 'Hang Seng', timeZone: 'Asia/Hong_Kong' },
  { secid: '100.HSCEI', code: 'HSCEI', region: 'asiaPacific', name: '恒生国企指数', nameEn: 'HSCEI', timeZone: 'Asia/Hong_Kong' },
  { secid: '124.HSTECH', code: 'HSTECH', region: 'asiaPacific', name: '恒生科技指数', nameEn: 'Hang Seng TECH', timeZone: 'Asia/Hong_Kong' },
  { secid: '100.N225', code: 'N225', region: 'asiaPacific', name: '日经225', nameEn: 'Nikkei 225', timeZone: 'Asia/Tokyo' },
  { secid: '100.KS11', code: 'KS11', region: 'asiaPacific', name: '韩国KOSPI', nameEn: 'KOSPI', timeZone: 'Asia/Seoul' },
  { secid: '100.TWII', code: 'TWII', region: 'asiaPacific', name: '台湾加权指数', nameEn: 'TAIEX', timeZone: 'Asia/Taipei' },
  { secid: '100.STI', code: 'STI', region: 'asiaPacific', name: '新加坡海峡时报', nameEn: 'Straits Times', timeZone: 'Asia/Singapore' },
  { secid: '100.AS51', code: 'AS51', region: 'asiaPacific', name: '澳洲标普200', nameEn: 'S&P/ASX 200', timeZone: 'Australia/Sydney' },
  { secid: '100.NZ50', code: 'NZ50', region: 'asiaPacific', name: '新西兰50', nameEn: 'NZX 50', timeZone: 'Pacific/Auckland' },
  { secid: '100.SENSEX', code: 'SENSEX', region: 'asiaPacific', name: '印度孟买SENSEX', nameEn: 'BSE Sensex', timeZone: 'Asia/Kolkata' },
  { secid: '100.SET', code: 'SET', region: 'asiaPacific', name: '泰国SET', nameEn: 'SET Index', timeZone: 'Asia/Bangkok' },
  { secid: '100.JKSE', code: 'JKSE', region: 'asiaPacific', name: '印尼雅加达综合', nameEn: 'Jakarta Composite', timeZone: 'Asia/Jakarta' },
  { secid: '100.PSI', code: 'PSI', region: 'asiaPacific', name: '菲律宾PSEi', nameEn: 'PSEi', timeZone: 'Asia/Manila' },
  // Europe
  { secid: '100.FTSE', code: 'FTSE', region: 'europe', name: '英国富时100', nameEn: 'FTSE 100', timeZone: 'Europe/London' },
  { secid: '100.GDAXI', code: 'GDAXI', region: 'europe', name: '德国DAX', nameEn: 'DAX', timeZone: 'Europe/Berlin' },
  { secid: '100.FCHI', code: 'FCHI', region: 'europe', name: '法国CAC40', nameEn: 'CAC 40', timeZone: 'Europe/Paris' },
  { secid: '100.SX5E', code: 'SX5E', region: 'europe', name: '欧洲斯托克50', nameEn: 'Euro Stoxx 50', timeZone: 'Europe/Brussels' },
  { secid: '100.IBEX', code: 'IBEX', region: 'europe', name: '西班牙IBEX35', nameEn: 'IBEX 35', timeZone: 'Europe/Madrid' },
  { secid: '100.SSMI', code: 'SSMI', region: 'europe', name: '瑞士SMI', nameEn: 'Swiss Market', timeZone: 'Europe/Zurich' },
  { secid: '100.AEX', code: 'AEX', region: 'europe', name: '荷兰AEX', nameEn: 'AEX', timeZone: 'Europe/Amsterdam' },
  { secid: '100.RTS', code: 'RTS', region: 'europe', name: '俄罗斯RTS', nameEn: 'RTS', timeZone: 'Europe/Moscow' },
]

const INSTRUMENTS = new Map<string, GlobalInstrument>(GLOBAL_INSTRUMENTS.map(item => [item.code, item]))
const BY_SECID = new Map<string, GlobalInstrument>(GLOBAL_INSTRUMENTS.map(item => [item.secid, item]))

export function globalInstrument(code: string): GlobalInstrument | undefined {
  return INSTRUMENTS.get(code)
}

export interface GlobalQuote {
  code: string
  name: string
  nameEn: string
  region: GlobalRegionKey
  timeZone: string
  price: number
  change: number | null
  changePercent: number | null
  open: number | null
  high: number | null
  low: number | null
  previousClose: number | null
  /** Exchange-local instant as an ISO string, or null when the source omitted it. */
  quotedAt: string | null
}

export interface GlobalMarketOverview {
  source: string
  fetchedAt: string
  /** Newest quote time among the returned indices. */
  quotedAt: string | null
  quotes: GlobalQuote[]
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/
const MAX_INDEX_VALUE = 1e9
/** Anything older than this is not a plausible current quote timestamp. */
const MIN_QUOTE_SECONDS = 946_684_800 // 2000-01-01T00:00:00Z

function finiteInRange(raw: unknown, min: number, max: number): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw >= min && raw <= max ? raw : null
  if (typeof raw === 'string' && /^-?\d+(?:\.\d+)?$/.test(raw.trim())) {
    const value = Number(raw.trim())
    return Number.isFinite(value) && value >= min && value <= max ? value : null
  }
  return null
}

function positiveOrNull(raw: unknown): number | null {
  const value = finiteInRange(raw, Number.MIN_VALUE, MAX_INDEX_VALUE)
  return value !== null && value > 0 ? value : null
}

/** Epoch seconds into ISO; impossible, absurd or future values become null. */
export function globalQuoteTime(raw: unknown, now: number): string | null {
  const seconds = finiteInRange(raw, MIN_QUOTE_SECONDS, now / 1000 + 300)
  if (seconds === null || !Number.isInteger(seconds)) return null
  const iso = new Date(seconds * 1000).toISOString()
  return Date.parse(iso) <= now + 300_000 ? iso : null
}

/**
 * Reads East Money's `ulist.np` payload. Only catalogued identities are kept;
 * a row with an unknown code, a non-positive price or an impossible change is
 * dropped rather than repaired. Missing optional fields stay null.
 */
export function parseGlobalQuotes(payload: any, now: number): GlobalQuote[] {
  const diff = payload?.data?.diff
  if (!Array.isArray(diff)) throw new Error('global market missing')
  if (diff.length > GLOBAL_MAX_QUOTES * 2) throw new Error('global market too large')
  const seen = new Set<string>()
  const quotes: GlobalQuote[] = []
  for (const row of diff) {
    if (!row || typeof row !== 'object') continue
    const market = finiteInRange(row.f13, 0, 999)
    const upstreamCode = typeof row.f12 === 'string' ? row.f12.trim() : ''
    if (market === null || !Number.isInteger(market) || !upstreamCode) continue
    const instrument = BY_SECID.get(`${market.toFixed(0)}.${upstreamCode}`)
    if (!instrument || seen.has(instrument.code)) continue
    const price = finiteInRange(row.f2, Number.MIN_VALUE, MAX_INDEX_VALUE)
    if (price === null || price <= 0) continue
    const changePercent = finiteInRange(row.f3, -100, 100)
    const change = finiteInRange(row.f4, -MAX_INDEX_VALUE, MAX_INDEX_VALUE)
    const high = positiveOrNull(row.f15)
    const low = positiveOrNull(row.f16)
    // An inverted day range is impossible; the row is dropped rather than
    // repaired or shown with a range bar that cannot be true.
    if (high !== null && low !== null && high < low) continue
    seen.add(instrument.code)
    quotes.push({
      code: instrument.code,
      name: instrument.name,
      nameEn: instrument.nameEn,
      region: instrument.region,
      timeZone: instrument.timeZone,
      price,
      change,
      changePercent,
      open: positiveOrNull(row.f17),
      high,
      low,
      previousClose: positiveOrNull(row.f18),
      quotedAt: globalQuoteTime(row.f124, now),
    })
  }
  const order = new Map(GLOBAL_INSTRUMENTS.map((item, index) => [item.code, index]))
  return quotes.sort((left, right) => (order.get(left.code) ?? 0) - (order.get(right.code) ?? 0))
}

function cleanText(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return value && value.length <= max ? value : null
}

/**
 * Host trust boundary: re-validates an adapter's overview and replaces every
 * identity field with the catalogue's values. A replacement adapter cannot add
 * an unknown index, rename one, or claim a different region/time zone.
 */
export function projectGlobalOverview(raw: unknown, now: number): GlobalMarketOverview {
  const value = raw as Record<string, any>
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('global market invalid')
  const source = cleanText(value.source, 64)
  if (!source) throw new Error('global market invalid')
  const rows = Array.isArray(value.quotes) ? value.quotes : null
  if (!rows || !rows.length || rows.length > GLOBAL_MAX_QUOTES) throw new Error('global market invalid')
  const seen = new Set<string>()
  const quotes: GlobalQuote[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('global market invalid')
    const instrument = globalInstrument(row.code)
    if (!instrument || seen.has(instrument.code)) throw new Error('global market invalid')
    const price = finiteInRange(row.price, Number.MIN_VALUE, MAX_INDEX_VALUE)
    if (price === null || price <= 0) throw new Error('global market invalid')
    const changePercent = row.changePercent === null ? null : finiteInRange(row.changePercent, -100, 100)
    const change = row.change === null ? null : finiteInRange(row.change, -MAX_INDEX_VALUE, MAX_INDEX_VALUE)
    const open = row.open === null ? null : positiveOrNull(row.open)
    const high = row.high === null ? null : positiveOrNull(row.high)
    const low = row.low === null ? null : positiveOrNull(row.low)
    const previousClose = row.previousClose === null ? null : positiveOrNull(row.previousClose)
    const fields: [unknown, number | null][] = [
      [row.changePercent, changePercent], [row.change, change], [row.open, open],
      [row.high, high], [row.low, low], [row.previousClose, previousClose],
    ]
    for (const [input, projected] of fields) if (input !== null && projected === null) throw new Error('global market invalid')
    if (high !== null && low !== null && high < low) throw new Error('global market invalid')
    let quotedAt: string | null = null
    if (row.quotedAt !== null) {
      if (typeof row.quotedAt !== 'string' || !ISO.test(row.quotedAt)) throw new Error('global market invalid')
      const stamp = Date.parse(row.quotedAt)
      if (!Number.isFinite(stamp) || stamp > now + 300_000) throw new Error('global market invalid')
      quotedAt = new Date(stamp).toISOString()
    }
    seen.add(instrument.code)
    quotes.push({
      code: instrument.code,
      name: instrument.name,
      nameEn: instrument.nameEn,
      region: instrument.region,
      timeZone: instrument.timeZone,
      price,
      change,
      changePercent,
      open,
      high,
      low,
      previousClose,
      quotedAt,
    })
  }
  const order = new Map(GLOBAL_INSTRUMENTS.map((item, index) => [item.code, index]))
  quotes.sort((left, right) => (order.get(left.code) ?? 0) - (order.get(right.code) ?? 0))
  let quotedAt: string | null = null
  for (const quote of quotes) {
    if (quote.quotedAt && (!quotedAt || Date.parse(quote.quotedAt) > Date.parse(quotedAt))) quotedAt = quote.quotedAt
  }
  return { source, fetchedAt: new Date(now).toISOString(), quotedAt, quotes }
}

/** Unweighted regional averages over available indices; null when none has a change. */
export function globalRegionSummary(quotes: GlobalQuote[], region: GlobalRegionKey): {
  count: number
  up: number
  down: number
  flat: number
  averageChangePercent: number | null
} {
  const rows = quotes.filter(quote => quote.region === region)
  const changes = rows.map(quote => quote.changePercent).filter((value): value is number => typeof value === 'number')
  return {
    count: rows.length,
    up: changes.filter(value => value > 0).length,
    down: changes.filter(value => value < 0).length,
    flat: changes.filter(value => value === 0).length,
    averageChangePercent: changes.length ? changes.reduce((sum, value) => sum + value, 0) / changes.length : null,
  }
}
