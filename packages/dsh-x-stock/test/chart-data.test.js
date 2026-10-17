import test from 'node:test'
import assert from 'node:assert/strict'
import { ChartDataError, CHART_SCHEMA_VERSION, MAX_IMPORT_BYTES, MAX_BARS, MAX_ABSOLUTE_PRICE, MAX_QUANTITY, DEMO_SYMBOL, DEMO_PROVIDER_ID, isSessionDate, parseChartImport, validateChartDataset, createImportExample, createDemoDataset } from '../src/chart-data.js'

const fixture = () => JSON.parse(createImportExample())
const altered = change => { const value = fixture(); change(value); return value }
const rejects = (change, code) => assert.throws(() => validateChartDataset(altered(change)), error => error instanceof ChartDataError && error.code === code)

test('validates and normalizes a browser-local import without inventing missing quantities', () => {
  const dataset = parseChartImport(createImportExample())
  assert.equal(dataset.schemaVersion, CHART_SCHEMA_VERSION)
  assert.equal(dataset.kind, 'local')
  assert.equal(dataset.providerId, 'local-import')
  assert.equal(dataset.source.kind, 'local-import')
  assert.equal(dataset.source.verified, false)
  assert.match(dataset.id, /^local:/)
  assert.equal(dataset.bars[1].volume, null)
  assert.equal(dataset.bars[2].volume, 0)
  assert.equal(dataset.bars[0].amount, null)
  assert.equal(dataset.bars[0].updatedAt, null)
  assert.equal(dataset.bars[0].revision, dataset.datasetRevision)
  assert.equal(dataset.amountCurrency, 'USD')
  assert.equal(dataset.historyAnchor, '2026-01-05')
  assert.equal(dataset.logScaleAllowed, true)
})

test('enforces UTF-8 byte limit before JSON parsing, not only character count', () => {
  for (const input of [' '.repeat(MAX_IMPORT_BYTES + 1), '中'.repeat(Math.ceil(MAX_IMPORT_BYTES / 3))]) {
    assert.throws(() => parseChartImport(input), error => error.code === 'FILE_SIZE')
  }
  for (const input of ['', '{', 'NaN', 'undefined', 42, null]) assert.throws(() => parseChartImport(input), error => error.code === 'JSON')
})

test('rejects root, schema, unknown-field and nonobject shape mistakes', () => {
  for (const input of [null, [], 42, 'text', Object.create({ schemaVersion: 1 })]) assert.throws(() => validateChartDataset(input), error => error.code === 'OBJECT')
  rejects(value => value.schemaVersion = '1', 'SCHEMA_VERSION')
  rejects(value => value.url = 'https://example.invalid', 'UNKNOWN_FIELD')
  rejects(value => value.bars[0].time = '2026-01-05', 'UNKNOWN_FIELD')
  rejects(value => value.source.url = 'https://example.invalid', 'UNKNOWN_FIELD')
  rejects(value => value.source = [], 'OBJECT')
  rejects(value => value.bars[0] = [], 'OBJECT')
})

test('requires declared source, units, basis and revisions', () => {
  for (const field of ['symbol', 'currency', 'exchangeTimezone', 'adjustmentRevision', 'datasetRevision']) rejects(value => delete value[field], 'TEXT')
  for (const field of ['interval', 'adjustment', 'volumeUnit', 'volumeAdjustment', 'amountAdjustment']) rejects(value => delete value[field], 'ENUM')
  rejects(value => delete value.source.provenance, 'TEXT')
  rejects(value => value.source.kind = 'synthetic-demo', 'SOURCE_KIND')
  rejects(value => value.volumeUnit = 'lots', 'ENUM')
  rejects(value => value.interval = '5m', 'ENUM')
  rejects(value => value.currency = 'usd', 'CURRENCY')
  rejects(value => value.exchangeTimezone = 'Unrecognized/Zone', 'TIMEZONE')
  for (const symbol of ['DEMO:SYNTH', 'demo', 'https://example.com', 'AAPL,MSFT']) rejects(value => value.symbol = symbol, 'SYMBOL')
})

test('bounds and sanitizes text and display precision', () => {
  rejects(value => value.name = 'A\nB', 'TEXT')
  rejects(value => value.source.label = 'x'.repeat(161), 'TEXT')
  rejects(value => value.source.provenance = 'x'.repeat(1001), 'TEXT')
  for (const pricePrecision of [-1, 9, 1.5, '2', null, undefined]) rejects(value => value.pricePrecision = pricePrecision, 'PRECISION')
  for (const pricePrecision of [0, 8]) assert.equal(validateChartDataset(altered(value => value.pricePrecision = pricePrecision)).pricePrecision, pricePrecision)
})

test('validates calendar dates, leap years and bounded years independently of timezone', () => {
  for (const date of ['1900-01-01', '2000-02-29', '2024-02-29', '2199-12-31']) assert.equal(isSessionDate(date), true)
  for (const date of ['1900-02-29', '2025-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '2026-1-01', '2026-01-01T00:00:00Z', '1899-12-31', '2200-01-01', null]) assert.equal(isSessionDate(date), false)
  rejects(value => value.bars[0].sessionDate = '2026-02-30', 'DATE')
  const input = fixture()
  input.exchangeTimezone = 'Pacific/Kiritimati'
  assert.deepEqual(validateChartDataset(input).bars.map(bar => bar.sessionDate), input.bars.map(bar => bar.sessionDate))
})

test('strictly increasing unique dates: no silent sorting, revision winner or fabricated gap bars', () => {
  rejects(value => value.bars[1].sessionDate = value.bars[0].sessionDate, 'DUPLICATE_DATE')
  rejects(value => value.bars.reverse(), 'DATE_ORDER')
  const input = fixture()
  input.bars.splice(1, 1)
  assert.equal(validateChartDataset(input).bars.length, 2)
})

test('enforces nonempty bounded bars', () => {
  rejects(value => value.bars = [], 'BAR_LIMIT')
  rejects(value => value.bars = {}, 'BAR_LIMIT')
  rejects(value => value.bars = Array(MAX_BARS + 1).fill(value.bars[0]), 'BAR_LIMIT')
})

test('OHLC must be finite numbers with low <= open/close <= high', () => {
  for (const key of ['open', 'high', 'low', 'close']) {
    for (const bad of [NaN, Infinity, -Infinity, '10', null, undefined]) rejects(value => value.bars[0][key] = bad, 'NUMBER')
  }
  rejects(value => value.bars[0].high = 10, 'OHLC_ORDER')
  rejects(value => value.bars[0].low = 10.5, 'OHLC_ORDER')
  rejects(value => { value.bars[0].low = 12; value.bars[0].high = 9 }, 'OHLC_ORDER')
  for (const bad of [0, -1]) rejects(value => value.bars[0].low = bad, 'RAW_PRICE')
})

test('nonpositive adjusted prices require price provenance and disable ordinary log scale', () => {
  const input = fixture()
  input.adjustment = 'forward'
  input.adjustmentRevision = 'declared-dividend-v2'
  input.adjustmentMethod = 'User-declared cash-dividend additive adjustment'
  input.bars[0] = { sessionDate: '2026-01-05', open: -3, high: 0, low: -4, close: -2, volume: 1000, isFinal: true }
  const result = validateChartDataset(input)
  assert.equal(result.bars[0].close, -2)
  assert.equal(result.bars[0].high, 0)
  assert.equal(result.logScaleAllowed, false)
  assert.equal(result.hasNonPositivePrices, true)
  assert.equal(result.volumeAdjustment, 'unadjusted')
  delete input.adjustmentMethod
  assert.throws(() => validateChartDataset(input), error => error.code === 'TEXT')
  rejects(value => value.adjustmentMethod = 'split adjusted', 'PROVENANCE')
})

test('local import bounds finite numeric magnitude for safe indicators and chart axes', () => {
  for (const key of ['open', 'high', 'low', 'close']) {
    rejects(value => value.bars[0][key] = MAX_ABSOLUTE_PRICE + 1, 'PRICE_RANGE')
    rejects(value => { value.adjustment = 'forward'; value.adjustmentMethod = 'Declared additive adjustment'; value.bars[0][key] = -MAX_ABSOLUTE_PRICE - 1 }, 'PRICE_RANGE')
  }
  for (const key of ['volume', 'amount']) {
    rejects(value => { value.amountAdjustment = 'unadjusted'; value.bars[0][key] = MAX_QUANTITY + 1 }, 'QUANTITY_RANGE')
    rejects(value => { value.amountAdjustment = 'unadjusted'; value.bars[0][key] = Number.MAX_VALUE }, 'QUANTITY_RANGE')
  }
  const input = fixture()
  input.amountAdjustment = 'unadjusted'
  Object.assign(input.bars[0], { open: MAX_ABSOLUTE_PRICE, high: MAX_ABSOLUTE_PRICE, low: MAX_ABSOLUTE_PRICE, close: MAX_ABSOLUTE_PRICE, volume: MAX_QUANTITY, amount: MAX_QUANTITY })
  const result = validateChartDataset(input)
  assert.equal(result.bars[0].close, MAX_ABSOLUTE_PRICE)
  assert.equal(result.bars[0].volume, MAX_QUANTITY)
  input.bars[0].volume = 10.5
  assert.equal(validateChartDataset(input).bars[0].volume, 10.5, 'Fractional normalized shares remain allowed')
})

test('volume and amount have independent provenance; missing values never become zeros', () => {
  for (const bad of [undefined, NaN, Infinity, '1000']) rejects(value => value.bars[0].volume = bad, 'NUMBER')
  rejects(value => value.bars[0].volume = -1, 'NONNEGATIVE')
  rejects(value => value.bars[0].amount = -1, 'NONNEGATIVE')
  rejects(value => value.bars[0].amount = 0, 'AMOUNT_PROVENANCE')
  rejects(value => value.volumeAdjustment = 'adjusted', 'TEXT')
  rejects(value => value.amountAdjustment = 'adjusted', 'TEXT')
  const input = fixture()
  input.volumeAdjustment = 'adjusted'
  input.volumeAdjustmentMethod = 'Split-only normalization from declared file source'
  input.amountAdjustment = 'unadjusted'
  input.bars[0].amount = 11000
  const result = validateChartDataset(input)
  assert.equal(result.bars[0].volume, 1000)
  assert.equal(result.bars[0].amount, 11000)
  assert.equal(result.bars[1].volume, null)
})

test('validates final flags and explicit UTC update instants without inventing freshness', () => {
  rejects(value => value.bars[0].isFinal = 'true', 'FINAL_FLAG')
  rejects(value => delete value.bars[0].isFinal, 'FINAL_FLAG')
  for (const bad of ['2026-01-05', '2026-02-30T00:00:00Z', '2026-01-05T24:00:00Z', '2026-01-05T12:60:00Z', '2026-01-05T12:00:00+08:00', 0]) rejects(value => value.bars[0].updatedAt = bad, 'TIMESTAMP')
  const result = validateChartDataset(altered(value => {
    value.bars.at(-1).isFinal = false
    value.bars.at(-1).updatedAt = '2026-01-07T20:15:30.123Z'
    value.bars.at(-1).revision = 'provisional-v2'
  }))
  assert.equal(result.bars.at(-1).isFinal, false)
  assert.equal(result.bars.at(-1).updatedAt, '2026-01-07T20:15:30.123Z')
})

test('normalization is immutable, nonmutating and content identity notices revisions', () => {
  const input = fixture()
  const before = structuredClone(input)
  const first = validateChartDataset(input)
  assert.deepEqual(input, before)
  assert.equal(first.id, validateChartDataset(input).id)
  input.bars[0].volume++
  assert.notEqual(first.id, validateChartDataset(input).id)
  assert.throws(() => first.bars.push(first.bars[0]), TypeError)
  assert.throws(() => first.bars[0].close = 1, TypeError)
  assert.throws(() => first.source.kind = 'market', TypeError)
})

test('synthetic demo is deterministic, isolated and clearly labelled', () => {
  const demo = createDemoDataset()
  assert.deepEqual(demo, createDemoDataset())
  assert.equal(demo.bars.length, 260)
  assert.equal(demo.kind, 'demo')
  assert.equal(demo.symbol, DEMO_SYMBOL)
  assert.equal(demo.providerId, DEMO_PROVIDER_ID)
  assert.match(demo.id, /^demo:/)
  assert.match(demo.source.label, /DEMO/)
  assert.match(demo.source.provenance, /invented/)
  assert.deepEqual(createDemoDataset({ count: 2 }).bars, demo.bars.slice(0, 2))
  for (const bar of demo.bars) {
    assert.ok(bar.low <= bar.open && bar.low <= bar.close && bar.high >= bar.open && bar.high >= bar.close)
    assert.ok(bar.low > 0 && bar.volume > 0)
  }
  assert.ok(Object.isFrozen(demo.bars))
  for (const count of [0, -1, 1.5, MAX_BARS + 1, '260']) assert.throws(() => createDemoDataset({ count }))
})

test('demo and local parse never fetch or write browser storage', () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = () => assert.fail('No network access is allowed in chart data helpers')
  try {
    createDemoDataset()
    parseChartImport(createImportExample())
  } finally { globalThis.fetch = originalFetch }
})
