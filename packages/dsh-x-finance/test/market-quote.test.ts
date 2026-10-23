import test from 'node:test'
import assert from 'node:assert/strict'
import { createTencentMarketProvider, parseStockQuote, parseTencentBatch, parseTencentTimestamp } from '../src/market-provider.ts'
import { projectQuotes } from '../src/market-rpc.ts'
import { MARKET_MAX_QUOTES, MARKET_SOURCE_NAME } from '../src/market.ts'

const now = Date.parse('2026-10-18T09:40:00+08:00')
const NAME = '贵州茅台'

function fields(overrides: Record<number, string> = {}) {
  const values = Array.from({ length: 50 }, () => '')
  Object.assign(values, {
    0: '1', 1: NAME, 2: '600519', 3: '1329.00', 4: '1312.97', 5: '1311.57',
    6: '38502', 29: '', 30: '20261016161447', 31: '16.03', 32: '1.22', 33: '1329.88', 34: '1301.68',
    ...overrides,
  })
  return values
}

const line = (overrides: Record<number, string> = {}) => `v_sh600519="${fields(overrides).join('~')}";`

function gbk(payload: string) {
  // Node has no GBK encoder; the security name is spliced in as its known GBK bytes.
  const start = payload.indexOf(NAME)
  return Buffer.concat([
    Buffer.from(payload.slice(0, start), 'ascii'),
    Buffer.from('b9f3d6ddc3a9cca8', 'hex'),
    Buffer.from(payload.slice(start + NAME.length), 'ascii'),
  ])
}

function stamp(ms: number) {
  return new Date(ms + 8 * 3_600_000).toISOString().replace(/[-:T]/g, '').slice(0, 14)
}

test('parses a Tencent quote line into the projected quote contract', () => {
  const quote = parseStockQuote('sh600519', fields(), now)
  assert.deepEqual(quote, {
    symbol: 'SH.600519',
    status: 'available',
    name: NAME,
    price: 1329,
    changePercent: 1.22,
    quotedAt: '2026-10-16T16:14:47+08:00',
    fetchedAt: null,
    marketStatus: 'unknown',
  })
})

test('keeps the exchange prefix and code, and rejects malformed, truncated or unbounded lines', () => {
  const sz = fields({ 2: '000001', 3: '12.34' })
  assert.equal(parseStockQuote('sz000001', sz, now).symbol, 'SZ.000001')
  assert.throws(() => parseStockQuote('sh600519', sz, now))
  for (const bad of [null, 42, {}, []]) assert.throws(() => parseStockQuote('sh600519', bad as any, now))
  const cases: Record<number, string>[] = [
    { 3: '0' }, { 3: '-1' }, { 3: 'abc' }, { 3: '1e12' },
    { 32: '' }, { 32: 'x' }, { 32: '2000' },
    { 1: '' }, { 1: '   ' }, { 1: 'x'.repeat(65) },
    { 30: '' }, { 30: '20261332161447' }, { 30: '20260230161447' },
    { 30: stamp(now + 3_600_000) },
  ]
  for (const override of cases) assert.throws(() => parseStockQuote('sh600519', fields(override), now), JSON.stringify(override))
})

test('the timestamp parser rejects impossible space and missing values rather than clamping', () => {
  assert.equal(parseTencentTimestamp('20261016161447', now), '2026-10-16T16:14:47+08:00')
  for (const bad of [null, '', '2026-10-16', '20261332161447', '20260230161447', stamp(now + 3_600_000)]) assert.throws(() => parseTencentTimestamp(bad, now))
})

test('one batched request covers the whole fixed bar and decodes GBK without a redirect', async () => {
  const urls: string[] = []
  const provider = createTencentMarketProvider({
    now: () => now,
    fetchImpl: async (url: any, init: any) => {
      urls.push(String(url))
      assert.equal(init.method, 'GET')
      assert.equal(init.redirect, 'error')
      const payload = [line(), line({ 2: '000001', 3: '12.34', 32: '-0.51' }).replace('v_sh600519', 'v_sz000001')]
      return new Response(Buffer.concat(payload.map((row, index) => index ? Buffer.concat([Buffer.from('\n', 'ascii'), gbk(row)]) : gbk(row))), { headers: { 'content-type': 'text/html; charset=GBK' } })
    },
  })
  assert.equal(provider.name, MARKET_SOURCE_NAME)
  const quotes = await provider.quotes(['SH.600519', 'SZ.000001'])
  assert.deepEqual(urls, ['https://qt.gtimg.cn/q=sh600519,sz000001'])
  assert.deepEqual(quotes.map(quote => [quote.symbol, quote.price, quote.changePercent]), [['SH.600519', 1329, 1.22], ['SZ.000001', 12.34, -0.51]])
  assert.equal(quotes[0]!.name, NAME)
})

test('the quote path never caches a live price and shares one request between concurrent callers', async () => {
  let calls = 0
  const provider = createTencentMarketProvider({
    now: () => now,
    fetchImpl: async () => { calls++; await new Promise(resolve => setTimeout(resolve, 5)); return new Response(line(), { headers: { 'content-type': 'text/plain' } }) },
  })
  const [first, second] = await Promise.all([provider.quotes(['SH.600519']), provider.quotes(['SH.600519'])])
  assert.equal(calls, 1)
  assert.equal(first[0]!.price, second[0]!.price)
  await provider.quotes(['SH.600519'])
  assert.equal(calls, 2, 'a later poll must reach the source again')
})

test('bounded batch size and validated symbols are enforced before any request', async () => {
  const provider = createTencentMarketProvider({ now: () => now, fetchImpl: () => assert.fail('must not fetch') })
  for (const input of [[], ['SH.600519', 'SH.600519'], ['AAPL'], Array(MARKET_MAX_QUOTES + 1).fill('SH.600519'), 'SH.600519', null]) {
    await assert.rejects(async () => provider.quotes(input as any))
  }
})

test('an unknown code yields no row instead of a fabricated price, and a broken feed rejects', async () => {
  const provider = (body: string) => createTencentMarketProvider({ now: () => now, fetchImpl: async () => new Response(body, { headers: { 'content-type': 'text/plain' } }) })
  assert.deepEqual(await provider('v_pv_none_match="1";').quotes(['SH.600519']), [])
  await assert.rejects(provider('').quotes(['SH.600519']))
  await assert.rejects(createTencentMarketProvider({ now: () => now, fetchImpl: async () => new Response('secret', { status: 500 }) }).quotes(['SH.600519']))
  // A JSON body from an HTML endpoint is not a quote feed: it yields no rows.
  assert.deepEqual(await createTencentMarketProvider({ now: () => now, fetchImpl: async () => new Response('{"unexpected":true}', { headers: { 'content-type': 'application/json' } }) }).quotes(['SH.600519']), [])
  await assert.rejects(createTencentMarketProvider({ now: () => now, fetchImpl: async () => new Response('x'.repeat(512 * 1024 + 1), { headers: { 'content-type': 'text/plain' } }) }).quotes(['SH.600519']))
  await assert.rejects(createTencentMarketProvider({ now: () => now, fetchImpl: async () => new Response(null, { headers: { 'content-type': 'text/plain' } }) }).quotes(['SH.600519']))
  const hanging = (_url: any, init: any) => new Promise<Response>((_, reject) => { init.signal.addEventListener('abort', () => reject(new Error('aborted'))) })
  await assert.rejects(createTencentMarketProvider({ now: () => now, fetchImpl: hanging, timeoutMs: 10 }).quotes(['SH.600519']))
})

test('the host projection fills unavailable rows, drops extra fields and never leaks the raw payload', () => {
  const projected = projectQuotes([
    { symbol: 'SH.600519', status: 'available', name: NAME, price: 1329, changePercent: 1.22, quotedAt: '2026-10-16T08:14:47Z', marketStatus: 'unknown', credential: 'never' },
    { symbol: 'SH.600519', status: 'available', price: 1, changePercent: 0, quotedAt: '2026-10-16T08:14:47Z' },
    { symbol: 'SZ.000001', status: 'available', name: '平安银行', price: 0, changePercent: 1, quotedAt: '2026-10-16T08:14:47Z' },
    { symbol: 'SZ.000002', status: 'available', name: '万科A', price: 9, changePercent: 1, quotedAt: stamp(now + 3_600_000) },
    'not an object',
  ], ['SH.600519', 'SZ.000001', 'SZ.000002', 'BJ.430047'], now)
  assert.deepEqual(projected.map(quote => [quote.symbol, quote.status, quote.price]), [
    ['SH.600519', 'available', 1329],
    ['SZ.000001', 'unavailable', null],
    ['SZ.000002', 'unavailable', null],
    ['BJ.430047', 'unavailable', null],
  ])
  assert.equal(projected[0]!.fetchedAt, new Date(now).toISOString())
  assert.equal(JSON.stringify(projected).includes('never'), false)
  assert.equal(projected.filter(quote => quote.symbol === 'SH.600519').length, 1, 'a duplicate row must not be projected twice')
})

test('parseTencentBatch keeps only well-formed 35+ field lines', () => {
  const batch = parseTencentBatch(`${line()}\nv_sh600519="1~2";\nv_pt01801080="${fields({ 2: '01801080' }).join('~')}";`)
  assert.deepEqual([...batch.keys()], ['sh600519', 'pt01801080'])
})
