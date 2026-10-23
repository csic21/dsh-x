export interface DailyBar {
  sessionDate: string; open: number; high: number; low: number; close: number
  volume: number | null; amount: number | null; isFinal: boolean; updatedAt: string | null; revision: string
}
export interface ChartDataset {
  id: string; schemaVersion: number; kind: string; providerId: string
  symbol: string; name: string; currency: string; exchangeTimezone: string; interval: string
  adjustment: string; adjustmentRevision: string; adjustmentMethod: string; datasetRevision: string
  pricePrecision: number; volumeUnit: string; volumeAdjustment: string; volumeAdjustmentMethod: string
  amountAdjustment: string; amountAdjustmentMethod: string; amountCurrency: string
  source: {kind: string, label: string, provenance: string, verified: boolean}
  historyAnchor: string; hasNonPositivePrices: boolean; logScaleAllowed: boolean; bars: DailyBar[]
}
/**
 * Browser-local daily OHLCV data contract. This module performs no network,
 * storage, quote-store or model operations. Imported metadata is user-declared.
 * Dates remain exchange session dates, never local/UTC-converted timestamps.
 */
export const CHART_SCHEMA_VERSION = 1
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024
export const MAX_BARS = 5000
// Supported local-chart numeric range, not theoretical limits on financial data.
// Keeps all supported indicator parameter changes and chart axis arithmetic safe.
export const MAX_ABSOLUTE_PRICE = 1e12
export const MAX_QUANTITY = Number.MAX_SAFE_INTEGER
export const DEMO_SYMBOL = 'DEMO:SYNTH'
export const DEMO_PROVIDER_ID = 'demo-synthetic'

const ROOT_FIELDS = new Set(['schemaVersion', 'symbol', 'name', 'currency', 'exchangeTimezone', 'interval', 'adjustment', 'adjustmentRevision', 'adjustmentMethod', 'datasetRevision', 'pricePrecision', 'volumeUnit', 'volumeAdjustment', 'volumeAdjustmentMethod', 'amountAdjustment', 'amountAdjustmentMethod', 'source', 'bars'])
const BAR_FIELDS = new Set(['sessionDate', 'open', 'high', 'low', 'close', 'volume', 'amount', 'isFinal', 'updatedAt', 'revision'])
const SOURCE_FIELDS = new Set(['kind', 'label', 'provenance'])

export class ChartDataError extends Error {
  declare name: string
  declare code: any
  declare path: any

  constructor(code: any, path: any, detail: any) {
    super(`${path}: ${detail}`)
    this.name = 'ChartDataError'
    this.code = code
    this.path = path
  }
}

function fail(code: any, path: any, detail: any) { throw new ChartDataError(code, path, detail) }
function record(value: any, path: any) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('OBJECT', path, 'expected a JSON object')
}
function knownFields(value: any, fields: any, path: any) {
  for (const key of Object.keys(value)) if (!fields.has(key)) fail('UNKNOWN_FIELD', path, 'contains an unsupported field')
}
function text(value: any, path: any, max = 160) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) fail('TEXT', path, `expected nonempty text of at most ${max} characters`)
  return value.trim()
}
function choice(value: any, allowed: any, path: any) {
  if (!allowed.includes(value)) fail('ENUM', path, `expected ${allowed.join(' or ')}`)
  return value
}
function finite(value: any, path: any, nullable = false) {
  if (nullable && value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) fail('NUMBER', path, nullable ? 'expected a finite number or explicit null' : 'expected a finite number')
  return Object.is(value, -0) ? 0 : value
}
function nonnegative(value: any, path: any) {
  const number = finite(value, path, true)
  if (number !== null && number < 0) fail('NONNEGATIVE', path, 'must be nonnegative or null')
  if (number !== null && number > MAX_QUANTITY) fail('QUANTITY_RANGE', path, `exceeds the supported local-import range of ${MAX_QUANTITY}`)
  return number
}
function freeze(value: any) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

/** Valid calendar dates only; no parsing through a browser locale or timezone. */
export function isSessionDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  if (year < 1900 || year > 2199 || month < 1 || month > 12) return false
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  return day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
}

function timestamp(value: any, path: any) {
  if (value === undefined || value === null) return null
  // Require an explicit UTC instant. Session dates themselves remain untouched.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) || !isSessionDate(value.slice(0, 10)) || !Number.isFinite(Date.parse(value))) fail('TIMESTAMP', path, 'expected an ISO UTC timestamp ending in Z or null')
  if (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) fail('TIMESTAMP', path, 'invalid time of day')
  return value
}

function method(input: any, adjustment: any, field: any) {
  if (adjustment === 'adjusted') return text(input[field], field, 500)
  if (input[field] !== undefined && input[field] !== 'none') fail('PROVENANCE', field, 'must be omitted or none for unadjusted values')
  return 'none'
}

function fingerprint(input: any) {
  // A deterministic content identity for UI state, not a security/authentication hash.
  const value = JSON.stringify(input)
  let a = 0x811c9dc5
  let b = 0x9e3779b9
  for (let i = 0; i < value.length; i++) {
    a = Math.imul(a ^ value.charCodeAt(i), 0x01000193)
    b = Math.imul(b ^ value.charCodeAt(i), 0x85ebca6b)
  }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`
}

/**
 * Validate a parsed import; reject unsorted/duplicate dates rather than silently
 * choosing a revision. Raw prices must be positive. Adjusted prices may be
 * nonpositive only with declared adjustment provenance. Volume is in shares;
 * null means unknown and zero means an explicitly reported zero.
 */
export function validateChartDataset(raw: unknown): ChartDataset {
  const input = raw as Record<string, any>
  record(input, 'dataset')
  knownFields(input, ROOT_FIELDS, 'dataset')
  if (input.schemaVersion !== CHART_SCHEMA_VERSION) fail('SCHEMA_VERSION', 'schemaVersion', 'expected 1')
  const symbol = text(input.symbol, 'symbol', 64)
  if (!/^[A-Za-z0-9][A-Za-z0-9.:_\-]{0,63}$/.test(symbol) || /^DEMO(?:$|[:._-])/i.test(symbol)) fail('SYMBOL', 'symbol', 'expected a security identifier outside the reserved DEMO namespace')
  const currency = text(input.currency, 'currency', 3)
  if (!/^[A-Z]{3}$/.test(currency)) fail('CURRENCY', 'currency', 'expected an uppercase three-letter currency code')
  const exchangeTimezone = text(input.exchangeTimezone, 'exchangeTimezone', 80)
  try { new Intl.DateTimeFormat('en', { timeZone: exchangeTimezone }) } catch { fail('TIMEZONE', 'exchangeTimezone', 'expected a recognized IANA timezone') }
  choice(input.interval, ['1d'], 'interval')
  const adjustment = choice(input.adjustment, ['none', 'forward', 'backward'], 'adjustment')
  const adjustmentRevision = text(input.adjustmentRevision, 'adjustmentRevision')
  const adjustmentMethod = method(input, adjustment === 'none' ? 'unadjusted' : 'adjusted', 'adjustmentMethod')
  const datasetRevision = text(input.datasetRevision, 'datasetRevision')
  const pricePrecision = input.pricePrecision
  if (!Number.isInteger(pricePrecision) || pricePrecision < 0 || pricePrecision > 8) fail('PRECISION', 'pricePrecision', 'expected an integer from 0 to 8')
  choice(input.volumeUnit, ['shares'], 'volumeUnit')
  const volumeAdjustment = choice(input.volumeAdjustment, ['unadjusted', 'adjusted'], 'volumeAdjustment')
  const volumeAdjustmentMethod = method(input, volumeAdjustment, 'volumeAdjustmentMethod')
  const amountAdjustment = choice(input.amountAdjustment, ['not-provided', 'unadjusted', 'adjusted'], 'amountAdjustment')
  const amountAdjustmentMethod = method(input, amountAdjustment, 'amountAdjustmentMethod')
  record(input.source, 'source')
  knownFields(input.source, SOURCE_FIELDS, 'source')
  if (input.source.kind !== undefined && input.source.kind !== 'local-import') fail('SOURCE_KIND', 'source.kind', 'imports may only declare local-import')
  const source = { kind: 'local-import', label: text(input.source.label, 'source.label'), provenance: text(input.source.provenance, 'source.provenance', 1000), verified: false }
  if (!Array.isArray(input.bars) || input.bars.length < 1 || input.bars.length > MAX_BARS) fail('BAR_LIMIT', 'bars', `expected 1 to ${MAX_BARS} daily bars`)
  let previousDate = ''
  let hasNonPositivePrices = false
  const bars = input.bars.map((value: any, index: any) => {
    const path = `bars[${index}]`
    record(value, path)
    knownFields(value, BAR_FIELDS, path)
    if (!isSessionDate(value.sessionDate)) fail('DATE', `${path}.sessionDate`, 'expected a valid YYYY-MM-DD date from 1900 to 2199')
    if (value.sessionDate <= previousDate) fail(value.sessionDate === previousDate ? 'DUPLICATE_DATE' : 'DATE_ORDER', `${path}.sessionDate`, 'dates must be unique and strictly increasing')
    previousDate = value.sessionDate
    const bar = { sessionDate: value.sessionDate } as DailyBar
    for (const key of ['open', 'high', 'low', 'close'] as const) {
      bar[key] = finite(value[key], `${path}.${key}`)
      if (Math.abs(bar[key]) > MAX_ABSOLUTE_PRICE) fail('PRICE_RANGE', `${path}.${key}`, 'absolute price exceeds the supported local-import range of 1e12')
      if (bar[key] <= 0) {
        if (adjustment === 'none') fail('RAW_PRICE', `${path}.${key}`, 'unadjusted stock prices must be positive')
        hasNonPositivePrices = true
      }
    }
    if (bar.low > Math.min(bar.open, bar.close) || bar.high < Math.max(bar.open, bar.close) || bar.low > bar.high) fail('OHLC_ORDER', path, 'expected low <= open/close <= high')
    bar.volume = nonnegative(value.volume, `${path}.volume`)
    bar.amount = nonnegative(value.amount === undefined ? null : value.amount, `${path}.amount`)
    if (amountAdjustment === 'not-provided' && bar.amount !== null) fail('AMOUNT_PROVENANCE', `${path}.amount`, 'amountAdjustment must describe supplied amounts')
    bar.isFinal = value.isFinal
    if (typeof bar.isFinal !== 'boolean') fail('FINAL_FLAG', `${path}.isFinal`, 'expected a boolean')
    bar.updatedAt = timestamp(value.updatedAt, `${path}.updatedAt`)
    bar.revision = value.revision === undefined ? datasetRevision : text(value.revision, `${path}.revision`)
    return bar
  })
  const result: Omit<ChartDataset, 'id'> & {id?: string} = {
    schemaVersion: CHART_SCHEMA_VERSION, kind: 'local', providerId: 'local-import',
    symbol, name: input.name === undefined ? symbol : text(input.name, 'name'),
    currency, exchangeTimezone, interval: '1d', adjustment, adjustmentRevision,
    adjustmentMethod, datasetRevision, pricePrecision, volumeUnit: 'shares',
    volumeAdjustment, volumeAdjustmentMethod, amountAdjustment, amountAdjustmentMethod,
    amountCurrency: currency, source, historyAnchor: bars[0].sessionDate,
    hasNonPositivePrices, logScaleAllowed: !hasNonPositivePrices, bars,
  }
  result.id = `local:${fingerprint(result)}`
  return freeze(result) as ChartDataset
}

/** Check UTF-8 size before JSON parsing; callers should also check File.size. */
export function parseChartImport(jsonText: any) {
  if (typeof jsonText !== 'string') fail('JSON', 'file', 'expected JSON text')
  if (jsonText.length > MAX_IMPORT_BYTES || new TextEncoder().encode(jsonText).byteLength > MAX_IMPORT_BYTES) fail('FILE_SIZE', 'file', 'JSON import is limited to 2 MiB')
  let input
  try { input = JSON.parse(jsonText) } catch { fail('JSON', 'file', 'invalid JSON') }
  return validateChartDataset(input)
}

/** A small valid, explicitly synthetic template for the browser-local importer. */
export function createImportExample() {
  return JSON.stringify({
    schemaVersion: 1, symbol: 'EXAMPLE:LOCAL', name: 'Local import example (synthetic)',
    currency: 'USD', exchangeTimezone: 'America/New_York', interval: '1d',
    adjustment: 'none', adjustmentRevision: 'none', datasetRevision: 'example-v1',
    pricePrecision: 2, volumeUnit: 'shares', volumeAdjustment: 'unadjusted',
    amountAdjustment: 'not-provided',
    source: { label: 'Synthetic import template', provenance: 'Invented examples only. Replace with daily OHLCV you are authorized to use, declare its source and adjustment methods; dates are exchange session dates.' },
    bars: [
      { sessionDate: '2026-01-05', open: 10, high: 12, low: 9, close: 11, volume: 1000, isFinal: true },
      { sessionDate: '2026-01-06', open: 11, high: 13, low: 10, close: 12, volume: null, isFinal: true },
      { sessionDate: '2026-01-07', open: 12, high: 13, low: 11, close: 11.5, volume: 0, isFinal: true },
    ],
  }, null, 2)
}

/**
 * Deterministic synthetic fixture with its own identity. Weekday spacing is a
 * visual fixture, not an exchange calendar; no quote is inferred from these bars.
 */
export function createDemoDataset({ count = 260 }: any = {}) {
  if (!Number.isInteger(count) || count < 1 || count > MAX_BARS) fail('BAR_LIMIT', 'count', `expected 1 to ${MAX_BARS}`)
  let seed = 0x54e2a31b
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 0x100000000 }
  const round = (value: any) => Math.round(value * 100) / 100
  let price = 80
  const date = new Date('2024-01-02T00:00:00Z')
  const bars: any[] = []
  while (bars.length < count) {
    const weekday = date.getUTCDay()
    if (weekday !== 0 && weekday !== 6) {
      const i = bars.length
      const open = round(price + (random() - 0.5) * 1.6)
      const close = round(Math.max(5, open + Math.sin(i / 9) * 0.8 + (random() - 0.48) * 2))
      const high = round(Math.max(open, close) + 0.2 + random() * 1.5)
      const low = round(Math.min(open, close) - 0.2 - random() * 1.5)
      const sessionDate = date.toISOString().slice(0, 10)
      const volume = Math.round(500000 + random() * 1500000)
      bars.push({ sessionDate, open, high, low, close, volume, amount: null, isFinal: true, updatedAt: null, revision: 'synthetic-v1' })
      price = close
    }
    date.setUTCDate(date.getUTCDate() + 1)
  }
  return freeze({
    schemaVersion: 1, kind: 'demo', id: `demo:synthetic-v1:${count}`, providerId: DEMO_PROVIDER_ID,
    symbol: DEMO_SYMBOL, name: 'Synthetic DEMO', currency: 'USD', exchangeTimezone: 'UTC',
    interval: '1d', adjustment: 'none', adjustmentRevision: 'synthetic-unadjusted-v1',
    adjustmentMethod: 'none', datasetRevision: 'synthetic-v1', pricePrecision: 2,
    volumeUnit: 'shares', volumeAdjustment: 'unadjusted', volumeAdjustmentMethod: 'none',
    amountAdjustment: 'not-provided', amountAdjustmentMethod: 'none', amountCurrency: 'USD',
    source: { kind: 'synthetic-demo', label: 'DEMO · synthetic data', provenance: 'Deterministic invented OHLCV, not a security, historical market feed or trading calendar. For chart interaction only.', verified: false },
    historyAnchor: bars[0].sessionDate, hasNonPositivePrices: false, logScaleAllowed: true, bars,
  })
}
