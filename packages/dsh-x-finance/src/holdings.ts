// Reported stock holdings for an exchange-traded fund. This is the periodic
// disclosure (top 10 in a quarter, the full book in a semi-annual or annual
// report), not a live creation basket and not the reader's own position.
// Nothing here fetches the network.
export const ETF_HOLDINGS_ENDPOINT = 'https://fundf10.eastmoney.com/FundArchivesDatas.aspx'
export const ETF_HOLDINGS_SOURCE = '天天基金持仓 (unofficial)'
/** Rows asked from the disclosure page. A full CSI 300 book is about 300 names. */
export const ETF_HOLDINGS_TOPLINE = 400
/** Hard cap on names kept from one report. */
export const ETF_HOLDINGS_MAX_ROWS = 400
export const ETF_HOLDINGS_MAX_BYTES = 512 * 1024
/** Quarterly reports stay near the statutory top 10; a real book is much larger. */
export const ETF_HOLDINGS_COMPLETE_MIN = 30
export const ETF_HOLDINGS_TTL_MS = 6 * 60 * 60_000

export interface EtfHolding {
  /** Code as published. A-share codes are six digits; a QDII row may be a ticker. */
  code: string
  name: string
  /** Upstream market id when the row linked one (0 Shenzhen, 1 Shanghai, 105 US). */
  market: string | null
  /** Percent of net asset value. 3.56 means 3.56%, not a fraction. */
  weight: number
  /** Shares, in 万股. Null when the report left the cell blank. */
  shares: number | null
  /** Market value, in 万元. Null when the report left the cell blank. */
  marketValue: number | null
}

export interface EtfHoldingPeriod {
  /** Source label, e.g. `2026年3季度`. */
  label: string
  /** Report cutoff, `YYYY-MM-DD`. */
  reportDate: string
  /** True when this period published a book, not only the statutory top 10. */
  complete: boolean
  /** True when the parser stopped at ETF_HOLDINGS_MAX_ROWS. */
  truncated: boolean
  holdings: EtfHolding[]
}

export interface EtfHoldings {
  symbol: string
  /**
   * False for a code that is not an exchange-traded fund or LOF, so the detail
   * page does not invent a holdings section for an ordinary stock.
   */
  applicable: boolean
  source: string
  fetchedAt: string
  /** Newest disclosed period. Often the quarterly top 10. */
  latest: EtfHoldingPeriod | null
  /** Newest period that published a full book. Null when only a top 10 exists. */
  full: EtfHoldingPeriod | null
}

const FUND_SH = /^(?:51|56|58)\d{4}$|^50[12]\d{3}$/
const CONTROL = /[\u0000-\u001f\u007f]/g

function fail(): never {
  throw Object.assign(new Error('holdings unavailable'), { code: 'finance/holdings-unavailable' })
}

/**
 * Exchange-traded funds and LOFs, by the code ranges the watchlist can already
 * hold. Ordinary A-shares, REITs and Beijing listings are not included: a
 * quarterly stock report is not an ETF book.
 */
export function isExchangeFund(symbol: string): boolean {
  const match = /^(SH|SZ)\.(\d{6})$/.exec(symbol)
  if (!match) return false
  const code = match[2]!
  if (match[1] === 'SZ') return code.startsWith('159') || code.startsWith('16')
  return FUND_SH.test(code)
}

export function etfHoldingsUrl(code: string): string {
  if (!/^\d{6}$/.test(code)) throw new Error('invalid holdings code')
  return `${ETF_HOLDINGS_ENDPOINT}?type=jjcc&code=${code}&topline=${ETF_HOLDINGS_TOPLINE}&year=&month=`
}

export function emptyEtfHoldings(symbol: string, now: number, applicable = false): EtfHoldings {
  return {
    symbol,
    applicable,
    source: ETF_HOLDINGS_SOURCE,
    fetchedAt: new Date(now).toISOString(),
    latest: null,
    full: null,
  }
}

function unescapeJs(raw: string): string {
  return raw.replace(/\\u([0-9a-fA-F]{4})|\\(["'\\/nrt])/g, (_all, hex: string | undefined, ch: string | undefined) => {
    if (hex) return String.fromCharCode(Number.parseInt(hex, 16))
    if (ch === 'n') return '\n'
    if (ch === 'r') return '\r'
    if (ch === 't') return '\t'
    return ch ?? ''
  })
}

function cellText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_all, digits: string) => String.fromCharCode(Number(digits)))
    .replace(CONTROL, '')
    .trim()
}

function calendarDate(date: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return false
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  const calendar = new Date(Date.UTC(year, month - 1, day))
  return calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1 && calendar.getUTCDate() === day
}

function dateInQuarter(date: string, label: string): boolean {
  const quarter = /^(\d{4})年([1-4])季度$/.exec(label)
  if (!quarter || !calendarDate(date)) return false
  const year = Number(quarter[1])
  const month = Number(date.slice(5, 7))
  return Number(date.slice(0, 4)) === year && Math.floor((month - 1) / 3) + 1 === Number(quarter[2])
}

function reportIsPlausible(date: string, now: number): boolean {
  const stamp = Date.parse(`${date}T00:00:00+08:00`)
  return Number.isFinite(stamp) && stamp >= Date.parse('1998-01-01T00:00:00+08:00') && stamp <= now + 2 * 86_400_000
}

/** A blank cell is null. Garbage is undefined so the row is dropped. */
function parseWan(raw: string): number | null | undefined {
  if (raw === '--' || raw === '-' || raw === '') return null
  const text = raw.replace(/,/g, '')
  if (!/^\d+(?:\.\d+)?$/.test(text)) return undefined
  const value = Number(text)
  if (!Number.isFinite(value) || value < 0 || value > 1e12) return undefined
  return value
}

function parseHoldingRow(row: string): EtfHolding | null {
  const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(match => cellText(match[1] ?? ''))
  if (cells.length < 4 || !/^\d+$/.test(cells[0] ?? '')) return null
  const link = /unify\/r\/(\d{1,4})\.([A-Za-z0-9._-]{1,16})/.exec(row)
  const code = (link?.[2] ?? cells[1] ?? '').trim()
  if (!/^[A-Za-z0-9._-]{1,16}$/.test(code)) return null
  const name = (cells[2] ?? '').replace(/^\*+/, '').trim()
  if (!name || [...name].length > 64) return null
  let weightAt = -1
  for (let index = cells.length - 1; index >= 0; index -= 1) {
    if (/^\d+(?:\.\d+)?%$/.test(cells[index] ?? '')) { weightAt = index; break }
  }
  if (weightAt < 0 || weightAt + 2 >= cells.length) return null
  const weight = Number((cells[weightAt] ?? '').slice(0, -1))
  if (!Number.isFinite(weight) || weight < 0 || weight > 100) return null
  const shares = parseWan(cells[weightAt + 1] ?? '')
  const marketValue = parseWan(cells[weightAt + 2] ?? '')
  if (shares === undefined || marketValue === undefined) return null
  return { code, name, market: link?.[1] ?? null, weight, shares, marketValue }
}

function parsePeriod(section: string, now: number): EtfHoldingPeriod | null {
  const label = /(\d{4}年[1-4]季度)/.exec(section)?.[1]
  const reportDate = /截止至：<font class=['"]px12['"]>(\d{4}-\d{2}-\d{2})<\/font>/.exec(section)?.[1]
  if (!label || !reportDate || !dateInQuarter(reportDate, label) || !reportIsPlausible(reportDate, now)) return null
  const holdings: EtfHolding[] = []
  const seen = new Set<string>()
  let truncated = false
  for (const match of section.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
    const holding = parseHoldingRow(match[1] ?? '')
    if (!holding || seen.has(holding.code)) continue
    if (holdings.length >= ETF_HOLDINGS_MAX_ROWS) { truncated = true; break }
    seen.add(holding.code)
    holdings.push(holding)
  }
  if (!holdings.length) return null
  return {
    label,
    reportDate,
    complete: holdings.length >= ETF_HOLDINGS_COMPLETE_MIN,
    truncated,
    holdings,
  }
}

/**
 * Parses the `var apidata={ content:"...", arryear:[...], curyear:YYYY }`
 * disclosure script. Periods stay in source order (newest first). A stock, a
 * gold ETF or any code with no stock table comes back with no periods rather
 * than a fabricated book. Exported for offline tests.
 */
export function parseEtfHoldingsScript(payload: unknown, symbol: string, now: number): EtfHoldings {
  if (!isExchangeFund(symbol)) return emptyEtfHoldings(symbol, now, false)
  if (typeof payload !== 'string' || payload.length > ETF_HOLDINGS_MAX_BYTES * 4) fail()
  const text = payload.trim()
  if (!text.startsWith('var apidata=')) fail()
  const start = text.indexOf('content:"')
  const end = text.lastIndexOf('",arryear:')
  if (start < 0 || end <= start || !/,curyear:\d{4}\};?\s*$/.test(text)) fail()
  const html = unescapeJs(text.slice(start + 'content:"'.length, end))
  if (!html.trim()) return emptyEtfHoldings(symbol, now, true)
  const periods: EtfHoldingPeriod[] = []
  for (const section of html.split(/<h4 class=['"]t['"]>/).slice(1)) {
    const period = parsePeriod(section, now)
    if (period) periods.push(period)
  }
  const latest = periods[0] ?? null
  const full = periods.find(period => period.complete) ?? null
  return {
    symbol,
    applicable: true,
    source: ETF_HOLDINGS_SOURCE,
    fetchedAt: new Date(now).toISOString(),
    latest,
    full,
  }
}

function projectPeriod(raw: unknown, now: number): EtfHoldingPeriod | null {
  if (raw === null) return null
  const value = raw as Record<string, unknown>
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail()
  const label = typeof value.label === 'string' ? value.label : ''
  const reportDate = typeof value.reportDate === 'string' ? value.reportDate : ''
  if (!/^(\d{4})年([1-4])季度$/.test(label) || !dateInQuarter(reportDate, label) || !reportIsPlausible(reportDate, now)) fail()
  if (!Array.isArray(value.holdings) || !value.holdings.length || value.holdings.length > ETF_HOLDINGS_MAX_ROWS) fail()
  const holdings: EtfHolding[] = []
  const seen = new Set<string>()
  for (const row of value.holdings) {
    const item = row as Record<string, unknown>
    if (!item || typeof item !== 'object') fail()
    const code = typeof item.code === 'string' ? item.code : ''
    const name = typeof item.name === 'string' ? item.name.replace(CONTROL, '').trim() : ''
    const market = item.market === null ? null : item.market
    const weight = item.weight
    if (!/^[A-Za-z0-9._-]{1,16}$/.test(code) || !name || [...name].length > 64 || seen.has(code)) fail()
    if (market !== null && (typeof market !== 'string' || !/^\d{1,4}$/.test(market))) fail()
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0 || weight > 100) fail()
    const shares = optionalWan(item.shares)
    const marketValue = optionalWan(item.marketValue)
    seen.add(code)
    holdings.push({ code, name, market, weight, shares, marketValue })
  }
  const complete = holdings.length >= ETF_HOLDINGS_COMPLETE_MIN
  if (value.truncated !== true && value.truncated !== false) fail()
  return { label, reportDate, complete, truncated: value.truncated, holdings }
}

function optionalWan(input: unknown): number | null {
  if (input === null) return null
  if (typeof input !== 'number' || !Number.isFinite(input) || input < 0 || input > 1e12) fail()
  return input
}

/** Rebuilds the browser payload. Extra fields and a lied `complete` flag do not pass. */
export function projectEtfHoldings(raw: unknown, symbol: string, now: number): EtfHoldings {
  const value = raw as Record<string, unknown>
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail()
  if (value.symbol !== symbol || !/^(SH|SZ)\.\d{6}$/.test(symbol)) fail()
  if (value.applicable !== true && value.applicable !== false) fail()
  const source = typeof value.source === 'string' ? value.source.replace(CONTROL, '').trim() : ''
  if (!source || [...source].length > 80) fail()
  if (!value.applicable) {
    if (value.latest !== null || value.full !== null) fail()
    return { symbol, applicable: false, source, fetchedAt: new Date(now).toISOString(), latest: null, full: null }
  }
  const latest = projectPeriod(value.latest, now)
  const full = projectPeriod(value.full, now)
  if (full && (!latest || !full.complete)) fail()
  if (latest && full && full.reportDate > latest.reportDate) fail()
  return { symbol, applicable: true, source, fetchedAt: new Date(now).toISOString(), latest, full }
}
