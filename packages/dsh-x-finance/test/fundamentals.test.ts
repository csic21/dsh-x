import test from 'node:test'
import assert from 'node:assert/strict'
import { createTencentMarketProvider } from '../src/market-provider.ts'
import { MARKET_ENDPOINT, parseMarketRequest } from '../src/market.ts'
import { createMarketHandler } from '../src/market-rpc.ts'
import {
  FUNDAMENTALS_MAX_PERIODS, FUNDAMENTALS_SOURCE, composeFundamentals, emptyFundamentals,
  fundamentalsReportsUrl, fundamentalsValuationUrl, parseReportPeriods, parseValuation, projectFundamentals,
} from '../src/fundamentals.ts'

const NOW = Date.parse('2026-11-02T10:00:00+08:00')
const OWNER = { principal: { kind: 'owner' } }

const valuationPayload = {
  rc: 0,
  data: {
    f57: '600519', f58: '贵州茅台',
    f116: 1_798_992_431_999.1, f117: 1_798_992_431_999.1,
    f162: 2093, f163: 2185, f164: 2190, f167: 663,
  },
}

const reportRow = (options: {
  date: string, name: string, notice: string, revenue: number, profit: number,
  eps: number, roe: number, gross: number, revenueYoY: number, profitYoY: number,
}) => ({
  SECUCODE: '600519.SH', SECURITY_NAME_ABBR: '贵州茅台',
  REPORT_DATE: `${options.date} 00:00:00`, REPORT_DATE_NAME: options.name,
  NOTICE_DATE: `${options.notice} 00:00:00`,
  TOTALOPERATEREVE: options.revenue, PARENTNETPROFIT: options.profit,
  EPSJB: options.eps, BPS: 216.94, ROEJQ: options.roe,
  XSMLL: options.gross, XSJLL: 50.94, ZCFZL: 11.9,
  TOTALOPERATEREVETZ: options.revenueYoY, PARENTNETPROFITTZ: options.profitYoY,
})

const reportsPayload = {
  result: {
    pages: 21,
    data: [
      reportRow({ date: '2026-09-30', name: '2026三季报', notice: '2026-10-31', revenue: 133_283_652_508.95, profit: 64_467_425_981.95, eps: 51.53, roe: 24.47, gross: 89.58, revenueYoY: 1.8179466483, profitYoY: -0.246524447439 }),
      reportRow({ date: '2026-06-30', name: '2026中报', notice: '2026-08-15', revenue: 92_278_072_083.21, profit: 44_516_880_421.86, eps: 35.57, roe: 16.75, gross: 89.55, revenueYoY: 1.3, profitYoY: -1.95 }),
      reportRow({ date: '2026-03-31', name: '2026一季报', notice: '2026-04-25', revenue: 54_702_912_385.23, profit: 27_242_512_886.45, eps: 21.76, roe: 10.57, gross: 89.75, revenueYoY: 6.33, profitYoY: 1.47 }),
      reportRow({ date: '2025-12-31', name: '2025年报', notice: '2026-04-17', revenue: 172_054_171_890.91, profit: 82_320_067_101.68, eps: 65.66, roe: 32.53, gross: 91.17, revenueYoY: -1.2, profitYoY: -4.53 }),
    ],
  },
}

test('the valuation snapshot scales source hundredths and keeps a loss negative', () => {
  const parsed = parseValuation(valuationPayload, 'SH.600519')
  assert.equal(parsed.name, '贵州茅台')
  assert.equal(parsed.valuation.totalMarketCap, 1_798_992_431_999.1)
  assert.equal(parsed.valuation.floatMarketCap, parsed.valuation.totalMarketCap)
  assert.equal(parsed.valuation.peStatic, 21.85)
  assert.equal(parsed.valuation.peTtm, 21.9)
  assert.equal(parsed.valuation.peDynamic, 20.93)
  assert.equal(parsed.valuation.pb, 6.63)

  const loss = parseValuation({ data: { f57: '000002', f58: '万科A', f116: 38_178_270_307.2, f117: '-', f162: -120, f163: -43, f164: -45, f167: 41 } }, 'SZ.000002')
  assert.equal(loss.valuation.peStatic, -0.43)
  assert.equal(loss.valuation.peTtm, -0.45)
  assert.equal(loss.valuation.peDynamic, -1.2)
  assert.equal(loss.valuation.floatMarketCap, null)
  assert.equal(loss.valuation.pb, 0.41)

  // Missing cells stay null and are never filled from a previous close.
  const missing = parseValuation({ data: { f57: '600519', f58: '贵州茅台', f116: '-', f117: '-', f162: '-', f163: '-', f164: '-', f167: '-' } }, 'SH.600519')
  assert.deepEqual(missing.valuation, {
    totalMarketCap: null, floatMarketCap: null, peStatic: null, peTtm: null, peDynamic: null, pb: null,
  })
  assert.throws(() => parseValuation({ data: { f57: '000001', f58: '平安银行' } }, 'SH.600519'), { code: 'finance/fundamentals-unavailable' })
  assert.throws(() => parseValuation({ rc: 0, data: null }, 'SH.600519'), { code: 'finance/fundamentals-unavailable' })
})

test('report periods stay cumulative, newest first, and keep a bank without a gross margin', () => {
  const parsed = parseReportPeriods(reportsPayload, 'SH.600519', NOW)
  assert.equal(parsed.name, '贵州茅台')
  assert.deepEqual(parsed.periods.map(period => period.reportDate), ['2026-09-30', '2026-06-30', '2026-03-31', '2025-12-31'])
  assert.equal(parsed.periods[0]!.reportName, '2026三季报')
  assert.equal(parsed.periods[0]!.noticeDate, '2026-10-31')
  assert.equal(parsed.periods[0]!.revenue, 133_283_652_508.95)
  assert.equal(parsed.periods[0]!.revenueYoY, 1.8179466483)
  assert.equal(parsed.periods[0]!.netProfit, 64_467_425_981.95)
  assert.equal(parsed.periods[0]!.netProfitYoY, -0.246524447439)
  assert.equal(parsed.periods[0]!.eps, 51.53)
  assert.equal(parsed.periods[0]!.roe, 24.47)
  assert.equal(parsed.periods[0]!.grossMargin, 89.58)

  const bank = parseReportPeriods({ result: { data: [{ ...reportRow({ date: '2026-09-30', name: '2026三季报', notice: '2026-10-24', revenue: 103_100_000_000, profit: 39_186_000_000, eps: 1.94, roe: 8.07, gross: 0, revenueYoY: 2.42, profitYoY: 2.21 }), SECUCODE: '000001.SZ', XSMLL: null }] } }, 'SZ.000001', NOW)
  assert.equal(bank.periods[0]!.grossMargin, null)
  assert.equal(bank.periods[0]!.netMargin, 50.94)

  // Duplicates collapse, a foreign SECUCODE set is rejected, and the cap holds.
  const quarters = ['2026-09-30', '2026-06-30', '2026-03-31', '2025-12-31', '2025-09-30', '2025-06-30', '2025-03-31', '2024-12-31', '2024-09-30', '2024-06-30', '2024-03-31']
  const many = quarters.map((date, index) => reportRow({
    date, name: `报告${index}`, notice: '2026-10-31',
    revenue: 1_000, profit: 100, eps: 1, roe: 1, gross: 1, revenueYoY: 0, profitYoY: 0,
  }))
  many.push(many[0]!)
  const capped = parseReportPeriods({ result: { data: many } }, 'SH.600519', NOW)
  assert.equal(capped.periods.length, FUNDAMENTALS_MAX_PERIODS)
  assert.throws(() => parseReportPeriods({ result: { data: [{ ...reportsPayload.result.data[0], SECUCODE: '000001.SZ' }] } }, 'SH.600519', NOW), { code: 'finance/fundamentals-unavailable' })
  assert.throws(() => parseReportPeriods({ result: { data: 'nope' } }, 'SH.600519', NOW), { code: 'finance/fundamentals-unavailable' })
  assert.deepEqual(parseReportPeriods({ result: null }, 'SH.600519', NOW), { name: '', periods: [] })
})

test('composed fundamentals describe the latest period and its provenance', () => {
  const valuation = parseValuation(valuationPayload, 'SH.600519').valuation
  const periods = parseReportPeriods(reportsPayload, 'SH.600519', NOW).periods
  const value = composeFundamentals({ symbol: 'SH.600519', name: '贵州茅台', valuation, periods, now: NOW, partial: false })
  assert.equal(value.applicable, true)
  assert.equal(value.source, FUNDAMENTALS_SOURCE)
  assert.equal(value.latest?.reportDate, '2026-09-30')
  assert.equal(value.currency, 'CNY')
  assert.equal(value.partial, false)
  assert.equal(value.fetchedAt, new Date(NOW).toISOString())
})

test('the request parser accepts only one A-share symbol for fundamentals', () => {
  assert.deepEqual(parseMarketRequest({ kind: 'fundamentals', symbol: 'SH.600519' }), { kind: 'fundamentals', symbol: 'SH.600519' })
  for (const payload of [
    { kind: 'fundamentals' },
    { kind: 'fundamentals', symbol: 'AAPL' },
    { kind: 'fundamentals', symbol: 'SH.510300', extra: true },
  ]) assert.throws(() => parseMarketRequest(payload), { code: 'invalid-input' })
})

test('projection rejects a snapshot that contradicts itself', () => {
  const valuation = parseValuation(valuationPayload, 'SH.600519').valuation
  const periods = parseReportPeriods(reportsPayload, 'SH.600519', NOW).periods
  const raw = composeFundamentals({ symbol: 'SH.600519', name: '贵州茅台', valuation, periods, now: NOW, partial: false })
  const projected = projectFundamentals({ ...raw, extra: 'drop me' }, 'SH.600519', NOW)
  assert.equal('extra' in projected, false)
  assert.equal(projected.latest?.reportDate, '2026-09-30')

  assert.throws(() => projectFundamentals({ ...raw, symbol: 'SZ.000001' }, 'SH.600519', NOW), { code: 'finance/fundamentals-unavailable' })
  assert.throws(() => projectFundamentals({ ...raw, valuation: { ...valuation, pb: Number.NaN } }, 'SH.600519', NOW), { code: 'finance/fundamentals-unavailable' })
  assert.throws(() => projectFundamentals({ ...raw, valuation: { ...valuation, totalMarketCap: -1 } }, 'SH.600519', NOW), { code: 'finance/fundamentals-unavailable' })
  assert.throws(() => projectFundamentals({ ...raw, periods: [...periods].reverse() }, 'SH.600519', NOW), { code: 'finance/fundamentals-unavailable' })
  assert.throws(() => projectFundamentals({ ...raw, fetchedAt: 'nope' }, 'SH.600519', NOW), { code: 'finance/fundamentals-unavailable' })
  // An ETF answer may not smuggle in a P&L or a valuation.
  assert.throws(() => projectFundamentals({ ...emptyFundamentals('SH.510300', NOW, false), valuation }, 'SH.510300', NOW), { code: 'finance/fundamentals-unavailable' })
  assert.equal(projectFundamentals(emptyFundamentals('SH.510300', NOW, false), 'SH.510300', NOW).applicable, false)
})

test('the provider reads both hosts once, caches, and keeps half a snapshot when one host fails', async () => {
  const calls: string[] = []
  const fetchImpl = async (url: string | URL | Request) => {
    const target = String(url)
    calls.push(target)
    if (target.startsWith(fundamentalsValuationUrl('SH.600519'))) return new Response(JSON.stringify(valuationPayload), { headers: { 'content-type': 'application/json' } })
    if (target.startsWith(fundamentalsReportsUrl('SH.600519'))) return new Response(JSON.stringify(reportsPayload), { headers: { 'content-type': 'application/json' } })
    return new Response('{}', { status: 500, headers: { 'content-type': 'application/json' } })
  }
  const provider = createTencentMarketProvider({ fetchImpl: fetchImpl as any, now: () => NOW })
  const first = await provider.fundamentals!('SH.600519')
  assert.equal(first.latest?.reportName, '2026三季报')
  assert.equal(first.valuation.peDynamic, 20.93)
  await provider.fundamentals!('SH.600519')
  assert.equal(calls.length, 2)
  assert.match(calls[0]!, /push2\.eastmoney\.com\/api\/qt\/stock\/get\?secid=1\.600519/)
  assert.match(calls[0]!, /f162/)
  assert.match(calls[1]!, /datacenter\.eastmoney\.com\/securities\/api\/data\/v1\/get\?/)
  assert.match(calls[1]!, /SECUCODE%3D%22600519\.SH%22/)

  // A stock never reaches the fund host: the ETF branch answers locally.
  const etfCalls: string[] = []
  const etfProvider = createTencentMarketProvider({ fetchImpl: (async (url: any) => { etfCalls.push(String(url)); return new Response('{}') }) as any, now: () => NOW })
  const etf = await etfProvider.fundamentals!('SH.510300')
  assert.equal(etf.applicable, false)
  assert.deepEqual(etfCalls, [])

  // The report host is down: the multiples still render, marked partial.
  const half = createTencentMarketProvider({
    fetchImpl: (async (url: any) => String(url).includes('datacenter.eastmoney.com')
      ? new Response('', { status: 503, headers: { 'content-type': 'application/json' } })
      : new Response(JSON.stringify(valuationPayload), { headers: { 'content-type': 'application/json' } })) as any,
    now: () => NOW,
  })
  const partial = await half.fundamentals!('SH.600519')
  assert.equal(partial.partial, true)
  assert.equal(partial.valuation.peTtm, 21.9)
  assert.deepEqual(partial.periods, [])

  // Both down is an error, not an empty "success".
  const broken = createTencentMarketProvider({
    fetchImpl: (async () => new Response('', { status: 503, headers: { 'content-type': 'application/json' } })) as any,
    now: () => NOW,
  })
  await assert.rejects(() => broken.fundamentals!('SH.600519'))
})

test('the owner-only route projects fundamentals and attributes failures to the panel', async () => {
  const fetchImpl = async (url: any) => String(url).includes('datacenter.eastmoney.com')
    ? new Response(JSON.stringify(reportsPayload), { headers: { 'content-type': 'application/json' } })
    : new Response(JSON.stringify(valuationPayload), { headers: { 'content-type': 'application/json' } })
  const provider = createTencentMarketProvider({ fetchImpl: fetchImpl as any, now: () => NOW })
  const handler = createMarketHandler({ provider, now: () => NOW })

  const answer: any = await handler(MARKET_ENDPOINT, { kind: 'fundamentals', symbol: 'SH.600519' }, undefined, OWNER)
  assert.equal(answer.ok, true)
  assert.equal(answer.value.fundamentals.symbol, 'SH.600519')
  assert.equal(answer.value.fundamentals.valuation.pb, 6.63)
  assert.equal(answer.value.fundamentals.latest.revenueYoY, 1.8179466483)

  const guest: any = await handler(MARKET_ENDPOINT, { kind: 'fundamentals', symbol: 'SH.600519' }, undefined, { principal: { kind: 'guest' } })
  assert.equal(guest.error.code, 'finance/forbidden')
  const invalid: any = await handler(MARKET_ENDPOINT, { kind: 'fundamentals', symbol: 'AAPL' }, undefined, OWNER)
  assert.equal(invalid.error.code, 'finance/invalid-input')

  const stub: any = { name: 'stub', overview: async () => ({}), breadth: async () => ({}), board: async () => ({}), quotes: async () => [] }
  const without = createMarketHandler({ provider: stub, now: () => NOW })
  const missing: any = await without(MARKET_ENDPOINT, { kind: 'fundamentals', symbol: 'SH.600519' }, undefined, OWNER)
  assert.equal(missing.error.code, 'finance/fundamentals-unavailable')

  const failing = createMarketHandler({ provider: { ...stub, fundamentals: async () => { throw new Error('upstream') } }, now: () => NOW })
  const failed: any = await failing(MARKET_ENDPOINT, { kind: 'fundamentals', symbol: 'SH.600519' }, undefined, OWNER)
  assert.equal(failed.error.code, 'finance/fundamentals-unavailable')

  const disabled = createMarketHandler({ provider: async () => undefined, now: () => NOW })
  assert.deepEqual(await disabled(MARKET_ENDPOINT, { kind: 'fundamentals', symbol: 'SH.600519' }, undefined, OWNER), { ok: true, value: { status: 'unconfigured', source: null } })
})
