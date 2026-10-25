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
/**
 * Fallback upstreams. East Money answers the whole catalogue in one request,
 * but it is reachable from some networks and silently unreachable from others
 * (TLS completes, the peer then closes the connection). Tencent's batch feed
 * and Sina's quote feed carry the same public data for most of the catalogue,
 * so the board degrades to a smaller snapshot instead of failing entirely.
 * Both are the same opt-in, unofficial source family as the rest of this
 * plugin: no SLA, no licence, no trading advice.
 */
export const GLOBAL_TENCENT_ENDPOINT = 'https://qt.gtimg.cn/q='
export const GLOBAL_TENCENT_SOURCE = '腾讯全球指数 (unofficial)'
export const GLOBAL_SINA_ENDPOINT = 'https://hq.sinajs.cn/list='
export const GLOBAL_SINA_SOURCE = '新浪全球指数 (unofficial)'
/** Sina answers 403 without a referer from its own site. */
export const GLOBAL_SINA_REFERER = 'https://finance.sina.com.cn/'
/** One batched request covers the whole board. */
export const GLOBAL_MAX_QUOTES = 64
export const GLOBAL_TTL_MS = 60_000
/**
 * A quote older than this is not a current snapshot: Sina still serves some
 * rows stamped more than a year ago, and a stale value shown as "today" would
 * be worse than an omitted card. Long exchange holidays stay well inside it.
 */
export const GLOBAL_MAX_QUOTE_AGE_MS = 30 * 24 * 60 * 60_000

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
  /**
   * Tencent symbol for the fallback feed. Only present where that source was
   * checked to answer with the same index; an index without a symbol is simply
   * absent from that source's snapshot instead of being approximated.
   */
  tencent?: string
  /** Sina symbol for the second fallback feed, same rule as `tencent`. */
  sina?: string
}

/**
 * Curated major indices by region. This is deliberately an identity list: the
 * upstream's own global-index list is not queried, so a new or removed upstream
 * row cannot silently change what the page claims to show.
 *
 * `tencent`/`sina` are only filled in where a live comparison showed the same
 * index at the same level. Sina also carries rows whose names look right but
 * whose values are not the catalogued index — its `b_SMI` is ~18% away from the
 * Swiss Market index and `b_TWSE` ~44% away from TAIEX — so a name match alone
 * was not accepted. Indices with no verified fallback symbol stay absent from
 * the fallback snapshots rather than being filled from a look-alike row.
 */
export const GLOBAL_INSTRUMENTS: readonly GlobalInstrument[] = [
  // Americas
  { secid: '100.DJIA', code: 'DJIA', region: 'americas', name: '道琼斯工业指数', nameEn: 'Dow Jones', timeZone: 'America/New_York', tencent: 'usDJI', sina: 'gb_dji' },
  { secid: '100.SPX', code: 'SPX', region: 'americas', name: '标普500', nameEn: 'S&P 500', timeZone: 'America/New_York', tencent: 'usINX', sina: 'gb_inx' },
  { secid: '100.NDX', code: 'NDX', region: 'americas', name: '纳斯达克', nameEn: 'Nasdaq', timeZone: 'America/New_York', tencent: 'usIXIC', sina: 'gb_ixic' },
  { secid: '100.TSX', code: 'TSX', region: 'americas', name: '加拿大标普/TSX', nameEn: 'S&P/TSX', timeZone: 'America/Toronto', sina: 'b_GSPTSE' },
  { secid: '100.BVSP', code: 'BVSP', region: 'americas', name: '巴西BOVESPA', nameEn: 'Bovespa', timeZone: 'America/Sao_Paulo', sina: 'b_IBOV' },
  { secid: '100.MXX', code: 'MXX', region: 'americas', name: '墨西哥BOLSA', nameEn: 'IPC Mexico', timeZone: 'America/Mexico_City', sina: 'b_MXX' },
  // Asia-Pacific
  { secid: '1.000001', code: 'SH.000001', region: 'asiaPacific', name: '上证指数', nameEn: 'SSE Composite', timeZone: 'Asia/Shanghai', tencent: 'sh000001' },
  { secid: '0.399001', code: 'SZ.399001', region: 'asiaPacific', name: '深证成指', nameEn: 'SZSE Component', timeZone: 'Asia/Shanghai', tencent: 'sz399001' },
  { secid: '0.399006', code: 'SZ.399006', region: 'asiaPacific', name: '创业板指', nameEn: 'ChiNext', timeZone: 'Asia/Shanghai', tencent: 'sz399006' },
  { secid: '100.HSI', code: 'HSI', region: 'asiaPacific', name: '恒生指数', nameEn: 'Hang Seng', timeZone: 'Asia/Hong_Kong', tencent: 'hkHSI' },
  { secid: '100.HSCEI', code: 'HSCEI', region: 'asiaPacific', name: '恒生国企指数', nameEn: 'HSCEI', timeZone: 'Asia/Hong_Kong', tencent: 'hkHSCEI' },
  { secid: '124.HSTECH', code: 'HSTECH', region: 'asiaPacific', name: '恒生科技指数', nameEn: 'Hang Seng TECH', timeZone: 'Asia/Hong_Kong', tencent: 'hkHSTECH' },
  { secid: '100.N225', code: 'N225', region: 'asiaPacific', name: '日经225', nameEn: 'Nikkei 225', timeZone: 'Asia/Tokyo', sina: 'b_NKY' },
  { secid: '100.KS11', code: 'KS11', region: 'asiaPacific', name: '韩国KOSPI', nameEn: 'KOSPI', timeZone: 'Asia/Seoul', sina: 'b_KOSPI' },
  { secid: '100.TWII', code: 'TWII', region: 'asiaPacific', name: '台湾加权指数', nameEn: 'TAIEX', timeZone: 'Asia/Taipei' },
  { secid: '100.STI', code: 'STI', region: 'asiaPacific', name: '新加坡海峡时报', nameEn: 'Straits Times', timeZone: 'Asia/Singapore', sina: 'b_STI' },
  { secid: '100.AS51', code: 'AS51', region: 'asiaPacific', name: '澳洲标普200', nameEn: 'S&P/ASX 200', timeZone: 'Australia/Sydney', sina: 'b_AS51' },
  { secid: '100.NZ50', code: 'NZ50', region: 'asiaPacific', name: '新西兰50', nameEn: 'NZX 50', timeZone: 'Pacific/Auckland' },
  { secid: '100.SENSEX', code: 'SENSEX', region: 'asiaPacific', name: '印度孟买SENSEX', nameEn: 'BSE Sensex', timeZone: 'Asia/Kolkata', sina: 'b_SENSEX' },
  { secid: '100.SET', code: 'SET', region: 'asiaPacific', name: '泰国SET', nameEn: 'SET Index', timeZone: 'Asia/Bangkok' },
  { secid: '100.JKSE', code: 'JKSE', region: 'asiaPacific', name: '印尼雅加达综合', nameEn: 'Jakarta Composite', timeZone: 'Asia/Jakarta', sina: 'b_JCI' },
  { secid: '100.PSI', code: 'PSI', region: 'asiaPacific', name: '菲律宾PSEi', nameEn: 'PSEi', timeZone: 'Asia/Manila' },
  // Europe
  { secid: '100.FTSE', code: 'FTSE', region: 'europe', name: '英国富时100', nameEn: 'FTSE 100', timeZone: 'Europe/London', tencent: 'ukUKX', sina: 'b_UKX' },
  { secid: '100.GDAXI', code: 'GDAXI', region: 'europe', name: '德国DAX', nameEn: 'DAX', timeZone: 'Europe/Berlin', sina: 'b_DAX' },
  { secid: '100.FCHI', code: 'FCHI', region: 'europe', name: '法国CAC40', nameEn: 'CAC 40', timeZone: 'Europe/Paris', sina: 'b_CAC' },
  { secid: '100.SX5E', code: 'SX5E', region: 'europe', name: '欧洲斯托克50', nameEn: 'Euro Stoxx 50', timeZone: 'Europe/Brussels', sina: 'b_SX5E' },
  { secid: '100.IBEX', code: 'IBEX', region: 'europe', name: '西班牙IBEX35', nameEn: 'IBEX 35', timeZone: 'Europe/Madrid', sina: 'b_IBEX' },
  { secid: '100.SSMI', code: 'SSMI', region: 'europe', name: '瑞士SMI', nameEn: 'Swiss Market', timeZone: 'Europe/Zurich' },
  { secid: '100.AEX', code: 'AEX', region: 'europe', name: '荷兰AEX', nameEn: 'AEX', timeZone: 'Europe/Amsterdam', sina: 'b_AEX' },
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

/** Offset of `timeZone` from UTC at `instant`, in milliseconds. */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instant))
  const pick = (type: string) => Number(parts.find(part => part.type === type)?.value)
  const asUtc = Date.UTC(pick('year'), pick('month') - 1, pick('day'), pick('hour'), pick('minute'), pick('second'))
  return asUtc - instant
}

const WALL_CLOCK = [
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/,
  /^(\d{4})\/(\d{2})\/(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/,
  /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/,
]

/**
 * Converts a source's wall-clock stamp into an instant. Tencent and Sina stamp
 * their global rows in the exchange's own local time (verified against East
 * Money for NY, London, Hong Kong and Shanghai), so the zone is an argument
 * rather than an assumption. Three stamp spellings are accepted because the
 * feeds differ: `2026-10-23 16:42:55`, `2026/10/23 18:31:07` and the compact
 * `20261023161500`. Impossible dates, unknown zones and future instants become
 * null; a stamp older than `GLOBAL_MAX_QUOTE_AGE_MS` also becomes null, because
 * a year-old value shown as today's quote is worse than no card at all.
 */
export function zonedQuoteTime(wall: unknown, timeZone: string, now: number): string | null {
  if (typeof wall !== 'string') return null
  const text = wall.trim()
  const match = WALL_CLOCK.map(pattern => pattern.exec(text)).find(Boolean)
  if (!match) return null
  const [year, month, day, hour, minute] = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4]), Number(match[5])]
  const second = Number(match[6] ?? '0')
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null
  const calendar = new Date(Date.UTC(year, month - 1, day))
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return null
  let zone: string
  try { zone = new Intl.DateTimeFormat('en', { timeZone }).resolvedOptions().timeZone }
  catch { return null }
  if (!zone) return null
  const naive = Date.UTC(year, month - 1, day, hour, minute, second)
  // Two passes so a DST boundary cannot shift the result by an hour.
  let instant = naive - zoneOffsetMs(naive, zone)
  instant = naive - zoneOffsetMs(instant, zone)
  if (!Number.isFinite(instant) || instant > now + 300_000) return null
  if (now - instant > GLOBAL_MAX_QUOTE_AGE_MS) return null
  return new Date(instant).toISOString()
}

function catalogueOrder(quotes: GlobalQuote[]): GlobalQuote[] {
  const order = new Map(GLOBAL_INSTRUMENTS.map((item, index) => [item.code, index]))
  return quotes.sort((left, right) => (order.get(left.code) ?? 0) - (order.get(right.code) ?? 0))
}

function quoteFrom(instrument: GlobalInstrument, numbers: {
  price: unknown
  change?: unknown
  changePercent?: unknown
  open?: unknown
  high?: unknown
  low?: unknown
  previousClose?: unknown
  quotedAt: string | null
}): GlobalQuote | null {
  const price = finiteInRange(numbers.price, Number.MIN_VALUE, MAX_INDEX_VALUE)
  if (price === null || price <= 0) return null
  const high = positiveOrNull(numbers.high)
  const low = positiveOrNull(numbers.low)
  // An inverted day range is impossible; the row is dropped rather than
  // repaired or drawn with a range bar that cannot be true.
  if (high !== null && low !== null && high < low) return null
  return {
    code: instrument.code,
    name: instrument.name,
    nameEn: instrument.nameEn,
    region: instrument.region,
    timeZone: instrument.timeZone,
    price,
    change: finiteInRange(numbers.change, -MAX_INDEX_VALUE, MAX_INDEX_VALUE),
    changePercent: finiteInRange(numbers.changePercent, -100, 100),
    open: positiveOrNull(numbers.open),
    high,
    low,
    previousClose: positiveOrNull(numbers.previousClose),
    quotedAt: numbers.quotedAt,
  }
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
    const quote = quoteFrom(instrument, {
      price: row.f2,
      changePercent: row.f3,
      change: row.f4,
      high: row.f15,
      low: row.f16,
      open: row.f17,
      previousClose: row.f18,
      quotedAt: globalQuoteTime(row.f124, now),
    })
    if (!quote) continue
    seen.add(instrument.code)
    quotes.push(quote)
  }
  return catalogueOrder(quotes)
}

/** Tencent's batch body: one `v_<symbol>="a~b~c~...";` line per request. */
const TENCENT_LINE = /^v_([A-Za-z0-9]+)="([^"]*)"\s*;?$/

/**
 * Reads Tencent's tilde-separated global rows. The global feeds share the
 * A-share column layout — `[3]` price, `[4]` previous close, `[5]` open,
 * `[30]` stamp, `[31]` change, `[32]` percent, `[33]` high, `[34]` low — which
 * was checked against East Money for NY, London, Hong Kong, Tokyo and Shanghai
 * rows. A row is only kept for a catalogued symbol with a plausible, recent
 * stamp; nothing is inferred from the request order.
 */
export function parseTencentGlobalQuotes(text: string, now: number): GlobalQuote[] {
  const bySymbol = new Map<string, GlobalInstrument>()
  for (const instrument of GLOBAL_INSTRUMENTS) if (instrument.tencent) bySymbol.set(instrument.tencent, instrument)
  const seen = new Set<string>()
  const quotes: GlobalQuote[] = []
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const match = TENCENT_LINE.exec(line)
    if (!match) continue
    const instrument = bySymbol.get(match[1]!)
    if (!instrument || seen.has(instrument.code)) continue
    const fields = match[2]!.split('~')
    if (fields.length < 35) continue
    // Unlike the primary feed, a fallback row without a usable stamp is
    // dropped: these feeds carry rows that stopped updating, and a stale value
    // presented as the current quote is worse than an omitted card.
    const quotedAt = zonedQuoteTime(fields[30], instrument.timeZone, now)
    if (!quotedAt) continue
    const quote = quoteFrom(instrument, {
      price: fields[3],
      previousClose: fields[4],
      open: fields[5],
      change: fields[31],
      changePercent: fields[32],
      high: fields[33],
      low: fields[34],
      quotedAt,
    })
    if (!quote) continue
    seen.add(instrument.code)
    quotes.push(quote)
  }
  return catalogueOrder(quotes)
}

/** Sina's quote body: one `var hq_str_<symbol>="a,b,c,...";` line per request. */
const SINA_LINE = /^var hq_str_([A-Za-z0-9_]+)="([^"]*)"\s*;?$/
const SINA_STAMP = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/

/**
 * Reads Sina's global rows. Sina stamps them in Beijing time regardless of the
 * exchange, so the conversion uses `Asia/Shanghai` and the result is still
 * displayed in the exchange's own zone by the client.
 *
 * The two Sina families have different layouts: `gb_*` (US) is
 * `name,price,percent,stamp,change,open,high,low,...,previousClose`, while
 * `b_*` is `name,price,change,percent,...,date,time,open,previousClose,high,
 * low,turnover`. A row is only used when every required column is present.
 */
export function parseSinaGlobalQuotes(text: string, now: number): GlobalQuote[] {
  const bySymbol = new Map<string, GlobalInstrument>()
  for (const instrument of GLOBAL_INSTRUMENTS) if (instrument.sina) bySymbol.set(instrument.sina, instrument)
  const seen = new Set<string>()
  const quotes: GlobalQuote[] = []
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const match = SINA_LINE.exec(line)
    if (!match) continue
    const instrument = bySymbol.get(match[1]!)
    if (!instrument || seen.has(instrument.code)) continue
    const fields = match[2]!.split(',')
    let quote: GlobalQuote | null = null
    if (match[1]!.startsWith('gb_')) {
      // [1] price [2] percent [3] Beijing stamp [4] change [5] open [6] high [7] low [26] previous close
      const stamp = SINA_STAMP.exec(fields[3] ?? '')
      if (fields.length >= 27 && stamp) {
        // A row without a usable, recent stamp is dropped, not shown undated.
        const quotedAt = zonedQuoteTime(`${stamp[1]} ${stamp[2]}`, 'Asia/Shanghai', now)
        if (quotedAt) {
          quote = quoteFrom(instrument, {
            price: fields[1],
            changePercent: fields[2],
            change: fields[4],
            open: fields[5],
            high: fields[6],
            low: fields[7],
            previousClose: fields[26],
            quotedAt,
          })
        }
      }
    } else {
      // [1] price [2] change [3] percent [8] open [9] previous [10] high [11] low
      // [6] date [7] time (Beijing). Some rows omit the date; those are skipped
      // rather than dated from the browser clock.
      const stamp = SINA_STAMP.exec(`${fields[6] ?? ''} ${fields[7] ?? ''}`)
      if (fields.length >= 12 && stamp) {
        const quotedAt = zonedQuoteTime(`${stamp[1]} ${stamp[2]}`, 'Asia/Shanghai', now)
        if (quotedAt) {
          quote = quoteFrom(instrument, {
            price: fields[1],
            change: fields[2],
            changePercent: fields[3],
            open: fields[8],
            previousClose: fields[9],
            high: fields[10],
            low: fields[11],
            quotedAt,
          })
        }
      }
    }
    if (!quote) continue
    seen.add(instrument.code)
    quotes.push(quote)
  }
  return catalogueOrder(quotes)
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

/** Newest quote stamp across the rows, or null when none carried one. */
export function globalNewestQuote(quotes: GlobalQuote[]): string | null {
  let quotedAt: string | null = null
  for (const quote of quotes) {
    if (quote.quotedAt && (!quotedAt || Date.parse(quote.quotedAt) > Date.parse(quotedAt))) quotedAt = quote.quotedAt
  }
  return quotedAt
}

/**
 * Merges several sources' snapshots into one overview. `preferred` is the
 * ordered list of `[source, quotes]` layers; the first layer that carries a
 * code wins it, so a healthy primary source is never diluted by a fallback.
 * Indices no layer answered for are simply absent — the page already renders
 * that as an empty region rather than inventing a number.
 */
export function mergeGlobalSnapshots(
  layers: readonly { source: string; quotes: GlobalQuote[] }[], now: number,
): GlobalMarketOverview | null {
  const merged = new Map<string, GlobalQuote>()
  const used: string[] = []
  for (const layer of layers) {
    let contributed = false
    for (const quote of layer.quotes) {
      if (merged.has(quote.code)) continue
      merged.set(quote.code, quote)
      contributed = true
    }
    if (contributed && !used.includes(layer.source)) used.push(layer.source)
  }
  if (!merged.size) return null
  const quotes = catalogueOrder([...merged.values()])
  return {
    source: used.join(' + '),
    fetchedAt: new Date(now).toISOString(),
    quotedAt: globalNewestQuote(quotes),
    quotes,
  }
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
