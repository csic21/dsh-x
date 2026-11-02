// Company fundamentals for one A-share: the reported income statement summary
// and the current valuation multiples. This is the quarterly statutory
// disclosure, not a forecast, a consensus estimate or a target price.
//
// Two public, unauthenticated East Money endpoints are projected here. Only
// the fields below leave this module: raw payloads, upstream errors and
// request details are never returned to the browser or written to disk.
//
// The figures are deliberately kept as reported:
// - a period's revenue and net profit are year-to-date cumulative, exactly as
//   the filing states them; no single-quarter split is invented;
// - PE(static), PE(TTM) and PE(dynamic) are the source's own multiples, not
//   recomputed from a share count and an EPS the source did not publish;
// - a negative multiple is a loss and is surfaced as such, never clamped to
//   zero or hidden.
export const FUNDAMENTALS_VALUATION_ENDPOINT = 'https://push2.eastmoney.com/api/qt/stock/get'
export const FUNDAMENTALS_REPORTS_ENDPOINT = 'https://datacenter.eastmoney.com/securities/api/data/v1/get'
export const FUNDAMENTALS_SOURCE = '东方财富财报与估值 (unofficial)'
/** A filing changes quarterly; the multiples move with the price, so the
 * snapshot is cached briefly rather than for a whole reporting cycle. */
export const FUNDAMENTALS_TTL_MS = 5 * 60_000
export const FUNDAMENTALS_MAX_BYTES = 256 * 1024
/** About two years of quarterly filings, newest first. */
export const FUNDAMENTALS_MAX_PERIODS = 8

const SYMBOL = /^(SH|SZ|BJ)\.\d{6}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const CONTROL = /[\u0000-\u001f\u007f]/g

export interface FundamentalPeriod {
  /** Report cutoff, `YYYY-MM-DD`. */
  reportDate: string
  /** Source label such as `2026三季报`. */
  reportName: string
  /** Date the filing was published, `YYYY-MM-DD`; null when not disclosed. */
  noticeDate: string | null
  /** Year-to-date revenue in CNY. */
  revenue: number | null
  /** Year-to-date revenue growth in percent; 1.82 means +1.82%. */
  revenueYoY: number | null
  /** Year-to-date net profit attributable to shareholders, in CNY. */
  netProfit: number | null
  /** Net profit growth in percent; -0.25 means -0.25%. */
  netProfitYoY: number | null
  /** Basic earnings per share in CNY. */
  eps: number | null
  /** Book value per share in CNY. */
  bps: number | null
  /** Return on equity in percent. */
  roe: number | null
  /** Gross margin in percent; null for a bank or another filer without one. */
  grossMargin: number | null
  /** Net margin in percent. */
  netMargin: number | null
  /** Debt-to-asset ratio in percent. */
  debtRatio: number | null
}

export interface FundamentalsValuation {
  /** Total market capitalisation in CNY. */
  totalMarketCap: number | null
  /** Free-float market capitalisation in CNY. */
  floatMarketCap: number | null
  /** Price / previous fiscal year earnings. */
  peStatic: number | null
  /** Price / trailing twelve months earnings. */
  peTtm: number | null
  /** The source's dynamic multiple: the latest period annualised. */
  peDynamic: number | null
  /** Price / book value. */
  pb: number | null
}

export interface Fundamentals {
  symbol: string
  name: string
  /** False for an ETF/LOF, whose periodic disclosure is a holdings book, not a P&L. */
  applicable: boolean
  source: string
  fetchedAt: string
  currency: 'CNY'
  valuation: FundamentalsValuation
  /** Newest first, at most FUNDAMENTALS_MAX_PERIODS. */
  periods: FundamentalPeriod[]
  /** `periods[0]`, repeated so the client does not have to infer it. */
  latest: FundamentalPeriod | null
  /** True when one of the two upstream calls failed and the other was shown. */
  partial: boolean
}

const EMPTY_VALUATION: FundamentalsValuation = {
  totalMarketCap: null, floatMarketCap: null, peStatic: null, peTtm: null, peDynamic: null, pb: null,
}

function fail(): never {
  throw Object.assign(new Error('fundamentals unavailable'), { code: 'finance/fundamentals-unavailable' })
}

function cleanText(raw: unknown, max = 64): string {
  if (typeof raw !== 'string') return ''
  return raw.replace(CONTROL, '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function numeric(raw: unknown): number | null {
  const value = typeof raw === 'number' ? raw
    : typeof raw === 'string' && raw.trim() !== '' && raw.trim() !== '-' ? Number(raw) : NaN
  return Number.isFinite(value) ? value : null
}

/** Eastmoney encodes a multiple as integer hundredths (`2093` → `20.93`). */
function scaled(raw: unknown, scale: number, min: number, max: number): number | null {
  const value = numeric(raw)
  if (value === null) return null
  const result = value / scale
  // A zero multiple is not a valid PE/PB; the cell is missing, not "free".
  if (!Number.isFinite(result) || result === 0 || result < min || result > max) return null
  return result
}

/** A reported ratio in percent, where zero is a real value (flat growth, no debt). */
function ratio(raw: unknown, min: number, max: number): number | null {
  const value = numeric(raw)
  return value !== null && value >= min && value <= max ? value : null
}

/** Revenue: a zero or negative top line is a missing cell, not a report. */
function positiveAmount(raw: unknown, min: number, max: number): number | null {
  const value = numeric(raw)
  return value !== null && value !== 0 && value >= min && value <= max ? value : null
}

/** Net profit: a loss is negative and a breakeven is zero, so both are kept. */
function signedAmount(raw: unknown, min: number, max: number): number | null {
  const value = numeric(raw)
  return value !== null && value >= min && value <= max ? value : null
}

export function eastmoneySecIdFor(symbol: string): string {
  if (!SYMBOL.test(symbol)) throw fail()
  const market = symbol.slice(0, 2)
  const code = symbol.slice(3)
  if (market === 'SH') return `1.${code}`
  return `0.${code}`
}

export function fundamentalsValuationUrl(symbol: string): string {
  const params = new URLSearchParams({
    secid: eastmoneySecIdFor(symbol),
    fields: 'f57,f58,f116,f117,f162,f163,f164,f167',
  })
  return `${FUNDAMENTALS_VALUATION_ENDPOINT}?${params}`
}

/** Requested explicitly so an upstream schema change cannot silently add a column. */
export const FUNDAMENTALS_REPORT_COLUMNS = [
  'SECUCODE', 'SECURITY_NAME_ABBR', 'REPORT_DATE', 'REPORT_DATE_NAME', 'NOTICE_DATE',
  'TOTALOPERATEREVE', 'PARENTNETPROFIT', 'EPSJB', 'BPS', 'ROEJQ',
  'XSMLL', 'XSJLL', 'ZCFZL', 'TOTALOPERATEREVETZ', 'PARENTNETPROFITTZ',
].join(',')

export function fundamentalsReportsUrl(symbol: string): string {
  if (!SYMBOL.test(symbol)) throw fail()
  const secucode = `${symbol.slice(3)}.${symbol.slice(0, 2)}`
  const params = new URLSearchParams({
    reportName: 'RPT_F10_FINANCE_MAINFINADATA',
    columns: FUNDAMENTALS_REPORT_COLUMNS,
    filter: `(SECUCODE="${secucode}")`,
    pageNumber: '1',
    pageSize: String(FUNDAMENTALS_MAX_PERIODS),
    sortTypes: '-1',
    sortColumns: 'REPORT_DATE',
  })
  return `${FUNDAMENTALS_REPORTS_ENDPOINT}?${params}`
}

export function emptyValuation(): FundamentalsValuation {
  return { ...EMPTY_VALUATION }
}

export function emptyFundamentals(symbol: string, now: number, applicable = false): Fundamentals {
  return {
    symbol,
    name: '',
    applicable,
    source: FUNDAMENTALS_SOURCE,
    fetchedAt: new Date(now).toISOString(),
    currency: 'CNY',
    valuation: emptyValuation(),
    periods: [],
    latest: null,
    partial: false,
  }
}

/**
 * The valuation snapshot. A source that does not answer for this code, or
 * answers for another one, is a failure rather than an all-null "success".
 */
export function parseValuation(payload: any, symbol: string): { name: string, valuation: FundamentalsValuation } {
  const data = payload?.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw fail()
  if (cleanText(data.f57, 16) !== symbol.slice(3)) throw fail()
  return {
    name: cleanText(data.f58),
    valuation: {
      totalMarketCap: positiveAmount(data.f116, 1, 1e15),
      floatMarketCap: positiveAmount(data.f117, 1, 1e15),
      peStatic: scaled(data.f163, 100, -1e5, 1e5),
      peTtm: scaled(data.f164, 100, -1e5, 1e5),
      peDynamic: scaled(data.f162, 100, -1e5, 1e5),
      pb: scaled(data.f167, 100, -1e5, 1e5),
    },
  }
}

/**
 * The report periods. Rows for another security are dropped, duplicate dates
 * are collapsed, and the result is newest first. An upstream answer with no
 * reports at all is an empty series, not an error: a new listing can be
 * quoted before its first filing reaches this endpoint.
 */
export function parseReportPeriods(payload: any, symbol: string, now: number): { name: string, periods: FundamentalPeriod[] } {
  const result = payload?.result
  if (result == null) return { name: '', periods: [] }
  const rows = result.data
  if (!Array.isArray(rows)) throw fail()
  const expected = `${symbol.slice(3)}.${symbol.slice(0, 2)}`
  const latestAllowed = new Date(now + 24 * 60 * 60_000).toISOString().slice(0, 10)
  const byDate = new Map<string, FundamentalPeriod>()
  let name = ''
  let matched = 0
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    if (cleanText(row.SECUCODE, 16).toUpperCase() !== expected) continue
    matched += 1
    if (!name) name = cleanText(row.SECURITY_NAME_ABBR)
    const reportDate = typeof row.REPORT_DATE === 'string' ? row.REPORT_DATE.slice(0, 10) : ''
    if (!DATE.test(reportDate) || reportDate < '1990-01-01' || reportDate > latestAllowed) continue
    if (byDate.has(reportDate)) continue
    const notice = typeof row.NOTICE_DATE === 'string' ? row.NOTICE_DATE.slice(0, 10) : ''
    byDate.set(reportDate, {
      reportDate,
      reportName: cleanText(row.REPORT_DATE_NAME, 32) || reportDate,
      noticeDate: DATE.test(notice) && notice >= '1990-01-01' && notice <= latestAllowed ? notice : null,
      revenue: positiveAmount(row.TOTALOPERATEREVE, 0, 1e15),
      revenueYoY: ratio(row.TOTALOPERATEREVETZ, -1e6, 1e6),
      netProfit: signedAmount(row.PARENTNETPROFIT, -1e15, 1e15),
      netProfitYoY: ratio(row.PARENTNETPROFITTZ, -1e6, 1e6),
      eps: ratio(row.EPSJB, -1e6, 1e6),
      bps: ratio(row.BPS, -1e6, 1e6),
      roe: ratio(row.ROEJQ, -1e5, 1e5),
      grossMargin: ratio(row.XSMLL, -1e5, 1e5),
      netMargin: ratio(row.XSJLL, -1e5, 1e5),
      debtRatio: ratio(row.ZCFZL, -1e5, 1e5),
    })
  }
  if (rows.length && !matched) throw fail()
  const periods = [...byDate.values()].sort((left, right) => right.reportDate.localeCompare(left.reportDate)).slice(0, FUNDAMENTALS_MAX_PERIODS)
  return { name, periods }
}

export function composeFundamentals(input: {
  symbol: string
  name: string
  valuation: FundamentalsValuation
  periods: FundamentalPeriod[]
  now: number
  partial: boolean
}): Fundamentals {
  const periods = [...input.periods].sort((left, right) => right.reportDate.localeCompare(left.reportDate)).slice(0, FUNDAMENTALS_MAX_PERIODS)
  return {
    symbol: input.symbol,
    name: cleanText(input.name) || input.symbol,
    applicable: true,
    source: FUNDAMENTALS_SOURCE,
    fetchedAt: new Date(input.now).toISOString(),
    currency: 'CNY',
    valuation: { ...input.valuation },
    periods,
    latest: periods[0] ?? null,
    partial: input.partial,
  }
}

function nullable(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw fail()
  return value
}

/**
 * Re-validates a snapshot at the same trust boundary as the other projectors,
 * so a replacement adapter cannot ship a NaN, a wrong symbol or a period list
 * that contradicts its own `latest`. Extra fields are dropped.
 */
export function projectFundamentals(raw: unknown, symbol: string, now: number): Fundamentals {
  const value = raw as Record<string, any>
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail()
  if (!SYMBOL.test(symbol) || value.symbol !== symbol) throw fail()
  if (typeof value.applicable !== 'boolean') throw fail()
  const source = cleanText(value.source)
  if (!source) throw fail()
  const fetchedAt = typeof value.fetchedAt === 'string' ? value.fetchedAt : ''
  if (!Number.isFinite(Date.parse(fetchedAt))) throw fail()
  if (value.currency !== 'CNY') throw fail()
  const valuation = value.valuation
  if (!valuation || typeof valuation !== 'object' || Array.isArray(valuation)) throw fail()
  const cleanValuation: FundamentalsValuation = {
    totalMarketCap: nullable(valuation.totalMarketCap, 0, 1e15),
    floatMarketCap: nullable(valuation.floatMarketCap, 0, 1e15),
    peStatic: nullable(valuation.peStatic, -1e5, 1e5),
    peTtm: nullable(valuation.peTtm, -1e5, 1e5),
    peDynamic: nullable(valuation.peDynamic, -1e5, 1e5),
    pb: nullable(valuation.pb, -1e5, 1e5),
  }
  const rows = Array.isArray(value.periods) ? value.periods : null
  if (!rows) throw fail()
  if (!value.applicable && (rows.length || Object.values(cleanValuation).some(item => item !== null))) throw fail()
  const periods: FundamentalPeriod[] = []
  let previous = '9999-12-31'
  for (const row of rows.slice(0, FUNDAMENTALS_MAX_PERIODS)) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw fail()
    const reportDate = row.reportDate
    if (typeof reportDate !== 'string' || !DATE.test(reportDate)) throw fail()
    if (reportDate >= previous || reportDate < '1990-01-01') throw fail()
    previous = reportDate
    const reportName = cleanText(row.reportName, 32)
    if (!reportName) throw fail()
    const noticeDate = row.noticeDate === null ? null : typeof row.noticeDate === 'string' && DATE.test(row.noticeDate) ? row.noticeDate : undefined
    if (noticeDate === undefined) throw fail()
    periods.push({
      reportDate,
      reportName,
      noticeDate,
      revenue: nullable(row.revenue, 0, 1e15),
      revenueYoY: nullable(row.revenueYoY, -1e6, 1e6),
      netProfit: nullable(row.netProfit, -1e15, 1e15),
      netProfitYoY: nullable(row.netProfitYoY, -1e6, 1e6),
      eps: nullable(row.eps, -1e6, 1e6),
      bps: nullable(row.bps, -1e6, 1e6),
      roe: nullable(row.roe, -1e5, 1e5),
      grossMargin: nullable(row.grossMargin, -1e5, 1e5),
      netMargin: nullable(row.netMargin, -1e5, 1e5),
      debtRatio: nullable(row.debtRatio, -1e5, 1e5),
    })
  }
  return {
    symbol,
    name: cleanText(value.name) || symbol,
    applicable: value.applicable,
    source,
    fetchedAt: new Date(Date.parse(fetchedAt)).toISOString(),
    currency: 'CNY',
    valuation: cleanValuation,
    periods,
    latest: periods[0] ?? null,
    partial: value.partial === true,
  }
}
