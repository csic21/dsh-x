import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MARKET_QUOTE_COOLDOWN_MS, createTencentMarketProvider, parseEastmoneyQuotes,
  parseSinaBatch, parseSinaQuote, sinaQuoteKey,
} from '../src/market-provider.ts'

const now = Date.parse('2026-11-17T10:44:00+08:00')

// Shapes below are copied from the three public feeds, with the security names
// replaced by ASCII so the fixtures need no GBK encoder. Field order is what
// the parsers read, and the values stay internally consistent.
const CN_LINE = 'var hq_str_sh600160="JUHUA,30.670,30.410,30.200,30.670,29.520,30.200,30.210,8735800,262444051.000,'
  + '7200,30.200,5100,30.190,400,30.170,500,30.160,1000,30.150,900,30.210,900,30.240,3600,30.250,7000,30.300,1400,30.310,'
  + '2026-11-17,10:42:09,00,";'
const HK_LINE = 'var hq_str_hk00700="TENCENT,腾讯控股,386.600,390.400,386.600,376.800,378.200,-12.200,-3.125,'
  + '378.20001,378.39999,3763854772,9883375,0.000,0.000,633.618,375.200,2026/11/17,10:18";'
const US_LINE = 'var hq_str_gb_aapl="APPLE,352.7800,-0.98,2026-11-17 08:59:56,-3.4900,357.1250,357.1250,351.3100,'
  + '359.3680,242.3500,50292161";'

const fieldsOf = (line: string) => parseSinaBatch(line).values().next().value as string[]

/** A complete Tencent A-share line; the parser needs at least 35 columns. */
function tencentLine(overrides: Record<number, string> = {}) {
  const values = Array.from({ length: 50 }, () => '')
  Object.assign(values, {
    0: '1', 1: 'JUHUA', 2: '600160', 3: '30.40', 4: '30.41', 5: '30.67',
    30: '20261117104300', 31: '-0.01', 32: '-0.03', 33: '30.67', 34: '29.52',
    ...overrides,
  })
  return `v_sh600160="${values.join('~')}";`
}

function eastmoneyPayload(rows: any[]) {
  return JSON.stringify({ rc: 0, data: { total: rows.length, diff: rows } })
}

const emRow = (f12: string, f13: number, f2: number, f3: number, f14 = 'X') => ({
  f2, f3, f12, f13, f14, f124: Math.floor(now / 1000) - 60,
})

test('the Sina row is projected for all three markets and never invents a field', () => {
  assert.deepEqual(parseSinaQuote('sh600160', fieldsOf(CN_LINE), now), {
    symbol: 'SH.600160',
    status: 'available',
    name: 'JUHUA',
    price: 30.2,
    pricePrecision: 3,
    // The A-share row states no percentage, so it is derived from price and
    // previous close and rounded to the width the bar shows.
    changePercent: -0.69,
    quotedAt: '2026-11-17T10:42:09+08:00',
    fetchedAt: null,
    marketStatus: 'unknown',
  })
  assert.deepEqual(parseSinaQuote('hk00700', fieldsOf(HK_LINE), now), {
    symbol: 'HK.00700',
    status: 'available',
    name: '腾讯控股',
    price: 378.2,
    pricePrecision: 3,
    changePercent: -3.125,
    quotedAt: '2026-11-17T10:18:00+08:00',
    fetchedAt: null,
    marketStatus: 'unknown',
  })
  const us = parseSinaQuote('usAAPL', fieldsOf(US_LINE), now)
  assert.deepEqual(
    [us.symbol, us.name, us.price, us.pricePrecision, us.changePercent, us.quotedAt],
    // Sina pads US prices to four decimals; the quoted width is what is left
    // after the padding, and its row is stamped in Beijing time.
    ['US.AAPL', 'APPLE', 352.78, 2, -0.98, '2026-11-17T00:59:56.000Z'],
  )
})

test('the Sina parser rejects impossible rows instead of clamping them', () => {
  const cn = fieldsOf(CN_LINE)
  for (const index of [0, 2, 3, 30, 31]) {
    const broken = [...cn]
    broken[index] = ''
    assert.throws(() => parseSinaQuote('sh600160', broken, now), `field ${index}`)
  }
  const future = [...cn]
  future[30] = '2026-11-18'
  assert.throws(() => parseSinaQuote('sh600160', future, now))
  assert.throws(() => parseSinaQuote('sh600160', [], now))
  assert.throws(() => parseSinaQuote('usZZZZZZZ', fieldsOf(US_LINE), now))
  // The US wall clock is read as Beijing time, so an impossible clock is rejected.
  const badUs = [...fieldsOf(US_LINE)]
  badUs[3] = '2026-11-17 25:61:61'
  assert.throws(() => parseSinaQuote('usAAPL', badUs, now))
})

test('Sina only serves the keys it has a list code for', () => {
  assert.equal(sinaQuoteKey('sh600160'), 'sh600160')
  assert.equal(sinaQuoteKey('sz000001'), 'sz000001')
  assert.equal(sinaQuoteKey('hk00700'), 'hk00700')
  assert.equal(sinaQuoteKey('usAAPL'), 'gb_aapl')
  assert.equal(sinaQuoteKey('pt01801010'), null)
  assert.equal(sinaQuoteKey('pt01801010'), null)
})

test('the East Money batch is matched back by code and market, dropping mismatches', () => {
  const quotes = parseEastmoneyQuotes(JSON.parse(eastmoneyPayload([
    emRow('600160', 1, 30.15, -0.85, 'JUHUA'),
    // Same code, wrong market: the Shenzhen row must not answer for `sh600160`.
    emRow('600160', 0, 99, 9, 'WRONG'),
    emRow('00700', 116, 378.2, -2.82, 'TENCENT'),
    emRow('999999', 1, 1, 1, 'UNKNOWN'),
    { f12: '000001', f13: 0, f14: 'NO NUMBERS' },
  ])), ['sh600160', 'hk00700'], now)
  assert.deepEqual(quotes.map(quote => [quote.symbol, quote.name, quote.price, quote.changePercent, quote.pricePrecision]), [
    ['SH.600160', 'JUHUA', 30.15, -0.85, 2],
    ['HK.00700', 'TENCENT', 378.2, -2.82, 2],
  ])
  assert.equal(quotes[0]!.quotedAt, new Date((Math.floor(now / 1000) - 60) * 1000).toISOString())
  assert.deepEqual(parseEastmoneyQuotes({ rc: 0 }, ['sh600160'], now), [])
})

test('a dead primary feed falls through to Sina in the same poll', async () => {
  const calls: string[] = []
  const provider = createTencentMarketProvider({
    now: () => now,
    fetchImpl: async (url: any, init: any) => {
      const { host } = new URL(String(url))
      calls.push(host)
      if (host === 'qt.gtimg.cn') return new Response('blocked', { status: 500 })
      if (host === 'hq.sinajs.cn') {
        assert.equal(init.headers.referer, 'https://finance.sina.com.cn/')
        return new Response(CN_LINE, { headers: { 'content-type': 'text/plain; charset=GBK' } })
      }
      assert.fail(`unexpected host ${host}`)
    },
  })
  const quotes = await provider.quotes(['SH.600160'])
  assert.deepEqual(calls, ['qt.gtimg.cn', 'hq.sinajs.cn'])
  assert.deepEqual([quotes[0]!.symbol, quotes[0]!.price, quotes[0]!.changePercent], ['SH.600160', 30.2, -0.69])
})

test('a feed that just failed is skipped until its cooldown expires', async () => {
  let clock = now
  let primaryDown = true
  const calls: string[] = []
  const provider = createTencentMarketProvider({
    now: () => clock,
    fetchImpl: async (url: any) => {
      const { host } = new URL(String(url))
      calls.push(host)
      if (host === 'qt.gtimg.cn') {
        if (primaryDown) return new Response('blocked', { status: 500 })
        return new Response(tencentLine(), { headers: { 'content-type': 'text/plain' } })
      }
      if (host === 'hq.sinajs.cn') return new Response(CN_LINE, { headers: { 'content-type': 'text/plain' } })
      assert.fail(`unexpected host ${host}`)
    },
  })
  assert.equal((await provider.quotes(['SH.600160']))[0]!.price, 30.2)
  assert.deepEqual(calls, ['qt.gtimg.cn', 'hq.sinajs.cn'])

  // Still inside the cooldown: the blocked host is not asked again.
  assert.equal((await provider.quotes(['SH.600160']))[0]!.price, 30.2)
  assert.deepEqual(calls, ['qt.gtimg.cn', 'hq.sinajs.cn', 'hq.sinajs.cn'])

  // Once the cooldown expires the primary is tried again and wins.
  clock = now + MARKET_QUOTE_COOLDOWN_MS + 1
  primaryDown = false
  assert.equal((await provider.quotes(['SH.600160']))[0]!.price, 30.4)
  assert.deepEqual(calls.slice(3), ['qt.gtimg.cn'])
})

test('East Money answers only after both text feeds are gone', async () => {
  const calls: string[] = []
  const provider = createTencentMarketProvider({
    now: () => now,
    fetchImpl: async (url: any) => {
      const { host } = new URL(String(url))
      calls.push(host)
      if (host === 'qt.gtimg.cn' || host === 'hq.sinajs.cn') return new Response('blocked', { status: 403 })
      if (host === 'push2.eastmoney.com') {
        return new Response(eastmoneyPayload([emRow('600160', 1, 30.15, -0.85, 'JUHUA')]), { headers: { 'content-type': 'application/json' } })
      }
      assert.fail(`unexpected host ${host}`)
    },
  })
  const quotes = await provider.quotes(['SH.600160'])
  assert.deepEqual(calls, ['qt.gtimg.cn', 'hq.sinajs.cn', 'push2.eastmoney.com'])
  assert.deepEqual([quotes[0]!.symbol, quotes[0]!.price, quotes[0]!.changePercent], ['SH.600160', 30.15, -0.85])
})

test('when every feed fails the bar reports failure instead of inventing a price', async () => {
  let attempts = 0
  const provider = createTencentMarketProvider({
    now: () => now,
    fetchImpl: async () => { attempts++; return new Response('down', { status: 502 }) },
  })
  await assert.rejects(() => provider.quotes(['SH.600160', 'HK.00700']), /market http 502/)
  assert.equal(attempts, 3, 'each feed is tried once')
  // All three are cooling down now, so a poll in the same window fails fast.
  await assert.rejects(() => provider.quotes(['SH.600160']))
  assert.equal(attempts, 3)
})
