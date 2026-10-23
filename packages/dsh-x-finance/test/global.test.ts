import test from 'node:test'
import assert from 'node:assert/strict'
import {
  GLOBAL_INSTRUMENTS, GLOBAL_REGIONS, globalQuoteTime, globalRegionSummary,
  parseGlobalQuotes, projectGlobalOverview,
} from '../src/global.ts'
import type { GlobalMarketOverview } from '../src/global.ts'
import { createTencentMarketProvider } from '../src/market-provider.ts'
import { createMarketHandler } from '../src/market-rpc.ts'
import { parseMarketRequest } from '../src/market.ts'
import { createFormatters } from '../src/client/format.ts'

const NOW = Date.parse('2026-10-23T14:00:00+08:00')
const SECONDS = Math.floor(NOW / 1000) - 60

function row(f13: number, f12: string, overrides: Record<string, unknown> = {}) {
  return {
    f2: 52867.98, f3: 0.02, f4: 11.89,
    f12, f13, f14: 'upstream name',
    f15: 52927.88, f16: 52508.38, f17: 52788.41, f18: 52856.09,
    f124: SECONDS, ...overrides,
  }
}

const payload = {
  rc: 0,
  data: {
    total: 5,
    diff: [
      row(100, 'N225', { f2: 62693.16, f3: -0.34, f4: -214.68 }),
      row(100, 'DJIA'),
      row(100, 'KS11', { f2: 5550.3, f3: 0.3, f4: 16.53 }),
      row(100, 'UNKNOWN', { f2: 1, f3: 0 }),
      row(100, 'HSI', { f2: 0, f3: 1 }),
    ],
  },
}

test('the global catalogue is unique, bounded and uses real exchange time zones', () => {
  assert.ok(GLOBAL_INSTRUMENTS.length >= 25)
  assert.equal(new Set(GLOBAL_INSTRUMENTS.map(item => item.code)).size, GLOBAL_INSTRUMENTS.length)
  assert.equal(new Set(GLOBAL_INSTRUMENTS.map(item => item.secid)).size, GLOBAL_INSTRUMENTS.length)
  const regions = new Set(GLOBAL_REGIONS.map(region => region.key))
  for (const item of GLOBAL_INSTRUMENTS) {
    assert.ok(regions.has(item.region), item.code)
    assert.ok(item.name && item.nameEn, item.code)
    assert.doesNotThrow(() => new Intl.DateTimeFormat('en', { timeZone: item.timeZone }).format(NOW), `${item.code} ${item.timeZone}`)
  }
  for (const code of ['DJIA', 'SPX', 'N225', 'KS11', 'HSI', 'FTSE']) assert.ok(GLOBAL_INSTRUMENTS.some(item => item.code === code), code)
})

test('the parser keeps only catalogued identities and their reviewed names', () => {
  const quotes = parseGlobalQuotes(payload, NOW)
  assert.deepEqual(quotes.map(quote => quote.code), ['DJIA', 'N225', 'KS11'])
  const dow = quotes[0]!
  assert.equal(dow.name, '道琼斯工业指数')
  assert.equal(dow.nameEn, 'Dow Jones')
  assert.equal(dow.region, 'americas')
  assert.equal(dow.timeZone, 'America/New_York')
  assert.equal(dow.price, 52867.98)
  assert.equal(dow.quotedAt, new Date(SECONDS * 1000).toISOString())
  const kospi = quotes[2]!
  assert.equal(kospi.change, 16.53)
  assert.equal(kospi.changePercent, 0.3)
  assert.equal(kospi.previousClose, 52856.09)
})

test('malformed, impossible and future values are dropped or nulled instead of repaired', () => {
  assert.throws(() => parseGlobalQuotes({ rc: 0 }, NOW))
  assert.throws(() => parseGlobalQuotes({ data: { diff: new Array(200).fill(null) } }, NOW))
  const negative = parseGlobalQuotes({ data: { diff: [row(100, 'DJIA', { f2: -1 })] } }, NOW)
  assert.deepEqual(negative, [])
  const stringPrice = parseGlobalQuotes({ data: { diff: [row(100, 'DJIA', { f2: '52867.98', f3: '0.5' })] } }, NOW)
  assert.equal(stringPrice[0]!.price, 52867.98)
  assert.equal(stringPrice[0]!.changePercent, 0.5)
  const noNumbers = parseGlobalQuotes({ data: { diff: [row(100, 'DJIA', { f3: 'x', f4: 'x', f15: '-', f16: '', f17: '0', f18: '-1' })] } }, NOW)
  assert.equal(noNumbers[0]!.changePercent, null)
  assert.equal(noNumbers[0]!.change, null)
  assert.equal(noNumbers[0]!.high, null)
  assert.equal(noNumbers[0]!.low, null)
  assert.equal(noNumbers[0]!.open, null)
  assert.equal(noNumbers[0]!.previousClose, null)
  const future = parseGlobalQuotes({ data: { diff: [row(100, 'DJIA', { f124: Math.floor(NOW / 1000) + 3600 })] } }, NOW)
  assert.equal(future[0]!.quotedAt, null)
  assert.equal(globalQuoteTime(SECONDS * 1000, NOW), null)
  assert.equal(globalQuoteTime('bad', NOW), null)
  assert.equal(globalQuoteTime(1.5, NOW), null)
  const missingTime = parseGlobalQuotes({ data: { diff: [row(100, 'DJIA', { f124: 0 })] } }, NOW)
  assert.equal(missingTime[0]!.quotedAt, null)
  const inverted = parseGlobalQuotes({ data: { diff: [row(100, 'DJIA', { f15: 1, f16: 2 })] } }, NOW)
  assert.deepEqual(inverted, [])
})

test('projection enforces the catalogue and cannot be relabelled by an adapter', () => {
  const raw: GlobalMarketOverview = {
    source: 'test source', fetchedAt: new Date(NOW).toISOString(), quotedAt: null,
    quotes: [{
      code: 'DJIA', name: 'Spoofed', nameEn: 'Spoofed', region: 'europe', timeZone: 'Europe/London',
      price: 52867.98, change: 11.89, changePercent: 0.02,
      open: 52788.41, high: 52927.88, low: 52508.38, previousClose: 52856.09,
      quotedAt: new Date(SECONDS * 1000).toISOString(),
    }],
  }
  const projected = projectGlobalOverview(raw, NOW)
  assert.equal(projected.source, 'test source')
  assert.equal(projected.fetchedAt, new Date(NOW).toISOString())
  assert.equal(projected.quotedAt, new Date(SECONDS * 1000).toISOString())
  assert.equal(projected.quotes[0]!.name, '道琼斯工业指数')
  assert.equal(projected.quotes[0]!.nameEn, 'Dow Jones')
  assert.equal(projected.quotes[0]!.region, 'americas')
  assert.equal(projected.quotes[0]!.timeZone, 'America/New_York')
  const bad = (overrides: Record<string, unknown>) => ({
    ...raw,
    quotes: [{ ...raw.quotes[0], ...overrides }],
  })
  assert.throws(() => projectGlobalOverview(bad({ code: 'AAPL' }), NOW))
  assert.throws(() => projectGlobalOverview(bad({ price: 0 }), NOW))
  assert.throws(() => projectGlobalOverview(bad({ changePercent: 500 }), NOW))
  assert.throws(() => projectGlobalOverview(bad({ open: -1 }), NOW))
  assert.throws(() => projectGlobalOverview(bad({ high: 1, low: 2 }), NOW))
  assert.throws(() => projectGlobalOverview(bad({ quotedAt: new Date(NOW + 600_000).toISOString() }), NOW))
  assert.throws(() => projectGlobalOverview(bad({ quotedAt: 'yesterday' }), NOW))
  assert.throws(() => projectGlobalOverview({ ...raw, quotes: [] }, NOW))
  assert.throws(() => projectGlobalOverview({ ...raw, quotes: [raw.quotes[0], raw.quotes[0]] }, NOW))
  assert.throws(() => projectGlobalOverview(null, NOW))
})

test('regional averages are unweighted and ignore indices without a change', () => {
  const quotes = parseGlobalQuotes({
    data: {
      diff: [
        row(100, 'DJIA', { f3: 1 }), row(100, 'N225', { f3: -0.5 }), row(100, 'KS11', { f3: 'x' }),
      ],
    },
  }, NOW)
  const americas = globalRegionSummary(quotes, 'americas')
  assert.equal(americas.count, 1)
  assert.equal(americas.averageChangePercent, 1)
  assert.equal(americas.up, 1)
  const asia = globalRegionSummary(quotes, 'asiaPacific')
  assert.equal(asia.count, 2)
  assert.equal(asia.averageChangePercent, -0.5)
  assert.equal(asia.down, 1)
  assert.equal(asia.up, 0)
  assert.equal(globalRegionSummary(quotes, 'europe').averageChangePercent, null)
})

test('the provider sends one bounded global request and caches the response', async () => {
  const urls: string[] = []
  let calls = 0
  const provider = createTencentMarketProvider({
    now: () => NOW,
    globalTtlMs: 60_000,
    fetchImpl: (async (url: string) => {
      urls.push(String(url))
      calls++
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as any,
  })
  const first = await provider.globalOverview!()
  const second = await provider.globalOverview!()
  assert.equal(calls, 1)
  assert.equal(first.quotes.length, 3)
  assert.deepEqual(second, first)
  assert.equal(urls.length, 1)
  assert.match(urls[0]!, /^https:\/\/push2\.eastmoney\.com\/api\/qt\/ulist\.np\/get\?/)
  assert.match(urls[0]!, /fltt=2/)
  assert.match(urls[0]!, /ut=fa5fd1943c7b386f172d6893dbfba10b/)
  for (const item of GLOBAL_INSTRUMENTS) assert.ok(urls[0]!.includes(item.secid), item.secid)
})

test('the market RPC exposes the global board only to the owner and projects it', async () => {
  assert.deepEqual(parseMarketRequest({ kind: 'global' }), { kind: 'global' })
  assert.throws(() => parseMarketRequest({ kind: 'global', extra: true }), { code: 'invalid-input' })
  const overview = projectGlobalOverview({
    source: 'test source', fetchedAt: new Date(NOW).toISOString(), quotedAt: null,
    quotes: [{
      code: 'DJIA', name: 'x', nameEn: 'x', region: 'americas', timeZone: 'America/New_York',
      price: 1, change: null, changePercent: null, open: null, high: null, low: null, previousClose: null, quotedAt: null,
    }],
  }, NOW)
  const handler = createMarketHandler({ provider: { name: 'test', overview: async () => ({} as any), breadth: async () => ({} as any), board: async () => ({} as any), quotes: async () => [], globalOverview: async () => overview }, now: () => NOW })
  const peer = { principal: { kind: 'owner' } }
  const ok: any = await handler('dsh-x-finance.market', { kind: 'global' }, undefined, peer)
  assert.equal(ok.ok, true)
  assert.equal(ok.value.status, 'ready')
  assert.equal(ok.value.global.quotes[0].code, 'DJIA')

  const forbidden: any = await handler('dsh-x-finance.market', { kind: 'global' }, undefined, { principal: { kind: 'alias' } })
  assert.equal(forbidden.ok, false)
  assert.equal(forbidden.error.code, 'finance/forbidden')

  const noGlobal = createMarketHandler({ provider: { name: 'test', overview: async () => ({} as any), breadth: async () => ({} as any), board: async () => ({} as any), quotes: async () => [] }, now: () => NOW })
  const unavailable: any = await noGlobal('dsh-x-finance.market', { kind: 'global' }, undefined, peer)
  assert.equal(unavailable.ok, false)
  assert.equal(unavailable.error.code, 'finance/global-unavailable')

  const unconfigured = await createMarketHandler({ provider: async () => undefined })(( 'dsh-x-finance.market' ), { kind: 'global' }, undefined, peer)
  assert.deepEqual(unconfigured, { ok: true, value: { status: 'unconfigured', source: null } })
})

test('quote times render in each exchange zone, not in Beijing time or the browser zone', () => {
  const format = createFormatters(() => 'en')
  const t = (key: string) => key
  assert.match(format.zoneTime('2026-10-22T20:00:00Z', 'America/New_York', t), /10\/22\/2026.*16:00/)
  assert.match(format.zoneTime('2026-10-22T20:00:00Z', 'Asia/Tokyo', t), /10\/23\/2026.*05:00/)
  assert.match(format.zoneTime('2026-10-22T20:00:00Z', 'Asia/Seoul', t), /10\/23\/2026.*05:00/)
  assert.equal(format.zoneTime('2026-10-22T20:00:00Z', 'Not/AZone', t), 'time.missing')
  assert.equal(format.zoneTime(null, 'Asia/Tokyo', t), 'time.missing')
})
