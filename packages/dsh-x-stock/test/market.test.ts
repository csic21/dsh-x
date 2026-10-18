import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeSentiment, marketClock, parseMarketRequest, stockMarketError, validateBoardCode,
  MARKET_ENDPOINT, MARKET_LEVEL1, MARKET_LEVEL1_CODES, MARKET_LEVEL2_PARENT, level2Parent,
} from '../src/market.ts'
import {
  createTencentMarketProvider, parseBoardRank, parseStockRankPage, parseTencentBatch,
} from '../src/market-provider.ts'
import { createMarketHandler, createMarketRoute } from '../src/market-rpc.ts'
import { MARKET_MAX_QUOTES } from '../src/market.ts'

const NOW = Date.parse('2026-10-16T16:20:00+08:00')
const STAMP = '20261016150000'
const value = (code: string, name: string, price: number, percent: number, amountWan = 1000, capYi = 100) => {
  const fields = Array(63).fill('0')
  fields[1] = name
  fields[2] = code
  fields[3] = String(price)
  fields[4] = String(price - 1)
  fields[5] = String(price - 0.5)
  fields[30] = STAMP
  fields[31] = String(percent)
  fields[32] = String(percent)
  fields[33] = String(price + 2)
  fields[34] = String(price - 2)
  fields[37] = String(amountWan)
  fields[45] = String(capYi)
  return fields
}
const indexLine = (key: string, name: string, price: number, percent: number, amountWan = 1000) => {
  const fields = value(key.slice(2), name, price, percent, amountWan)
  return `v_${key}="${fields.join('~')}";`
}
const boardLine = (code: string, name: string, percent: number, capYi = 100, amountWan = 1000, level = 1) => {
  const fields = value(`01${code}`, name, 1000, percent, amountWan, capYi)
  fields[58] = `BK-HY-${level}`
  return `v_pt01${code}="${fields.join('~')}";`
}
const indexLines = [
  ['sh000001', 'SSE', 3716.28, 0.24, 73247519],
  ['sz399001', 'SZSE', 11802.46, -0.12, 82294559],
  ['sz399006', 'ChiNext', 2772.38, -0.39, 39422595],
  ['sh000300', 'CSI300', 4170.61, 0.11, 41374930],
  ['sh000688', 'STAR50', 1358.65, -0.06, 7160760],
  ['bj899050', 'BSE50', 950, -1.81, 1381161],
] as const
const boardLines = MARKET_LEVEL1.map((item, index) => boardLine(item.code, `Board ${index}`, index % 2 ? -0.5 : 0.8, 1000 + index, 2000 + index, 1)).join('\n')
const batchText = `${indexLines.map(line => indexLine(line[0], line[1], line[2], line[3], line[4])).join('\n')}\n${boardLines}`

function quoteRows(offset: number, total: number) {
  const rows = []
  for (let index = 0; index < (offset === 0 ? 200 : total - 200); index++) {
    const absolute = offset + index
    const up = absolute < 120
    const down = absolute >= 120 && absolute < 230
    const percent = absolute === 0 ? 5.5 : up ? 1.5 : down ? -2 : 0
    rows.push({
      code: `sh${String(600000 + absolute).padStart(6, '0')}`,
      name: `测试${absolute}`,
      zxj: String(10 + absolute / 1000),
      zdf: String(percent),
      turnover: String(1000 + absolute),
      zsz: '100',
      state: absolute >= 245 ? 'S' : '',
    })
  }
  return { code: 0, msg: 'ok', data: { total, offset, rank_list: rows } }
}

function fakeFetch(url: string) {
  if (url.includes('mktHs/rank')) return json({ code: 0, msg: 'ok', data: [] })
  if (url.includes('getBoardRankList')) {
    const query = new URL(url).searchParams
    const offset = Number(query.get('offset') ?? 0)
    if (query.get('board_code') === 'aStock') return json(quoteRows(offset, 250))
    return json({
      code: 0, msg: 'ok',
      data: {
        total: 3, offset: 0, rank_list: [
          { code: 'sh600000', name: '浦发银行', zxj: '10.10', zdf: '1.00', turnover: '5000', zsz: '3000', state: '' },
          { code: 'sz000001', name: '平安银行', zxj: '11.20', zdf: '-0.50', turnover: '4000', zsz: '2000', state: '' },
          { code: 'sh601398', name: '工商银行', zxj: '6.30', zdf: '0.20', turnover: '3000', zsz: '9000', state: '' },
        ],
      },
    })
  }
  if (url.startsWith('https://qt.gtimg.cn/q=')) return text(batchText)
  return json({ code: 1, msg: 'unexpected' })
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
function text(body: string) {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=GBK' } })
}

test('market request identity is exact and bounded', () => {
  assert.deepEqual(parseMarketRequest({ kind: 'overview' }), { kind: 'overview' })
  assert.deepEqual(parseMarketRequest({ kind: 'breadth' }), { kind: 'breadth' })
  assert.deepEqual(parseMarketRequest({ kind: 'board', board: '801080' }), { kind: 'board', board: '801080' })
  assert.deepEqual(parseMarketRequest({ kind: 'quotes', symbols: ['SH.600519'] }), { kind: 'quotes', symbols: ['SH.600519'] })
  assert.deepEqual(parseMarketRequest({ kind: 'quotes', symbols: ['SH.600519', 'SZ.000001'] }), { kind: 'quotes', symbols: ['SH.600519', 'SZ.000001'] })
  for (const payload of [{ kind: 'quotes' }, { kind: 'quotes', symbols: [] }, { kind: 'quotes', symbols: ['SH.600519', 'SH.600519'] }, { kind: 'quotes', symbols: ['AAPL'] }, { kind: 'quotes', symbols: ['SH.600519'], extra: true }, { kind: 'quotes', symbols: Array(MARKET_MAX_QUOTES + 1).fill('SH.600519') }]) assert.throws(() => parseMarketRequest(payload), { code: 'invalid-input' })
  assert.throws(() => parseMarketRequest({ kind: 'overview', extra: true }), { code: 'invalid-input' })
  assert.throws(() => parseMarketRequest({ kind: 'board' }), { code: 'invalid-input' })
  assert.throws(() => parseMarketRequest({ kind: 'board', board: 'US.AAPL' }), { code: 'invalid-board' })
  assert.throws(() => parseMarketRequest(null), { code: 'invalid-input' })
  assert.throws(() => parseMarketRequest([]), { code: 'invalid-input' })
  assert.throws(() => parseMarketRequest(new (class { kind = 'overview' })()), { code: 'invalid-input' })
  assert.equal(validateBoardCode('801080'), '801080')
  assert.throws(() => validateBoardCode('80108'), { code: 'invalid-board' })
  assert.equal(MARKET_LEVEL1.length, 31)
  assert.equal(new Set(MARKET_LEVEL1_CODES).size, 31)
  for (const item of MARKET_LEVEL1) assert.equal(level2Parent(item.name), null, item.name)
  assert.equal(level2Parent('半导体'), '801080')
  assert.equal(level2Parent('地面兵装Ⅱ'), '801740')
  assert.equal(Object.keys(MARKET_LEVEL2_PARENT).length, 124)
  assert.ok(stockMarketError('invalid-input').code)
})

test('sentiment is an explainable weighted score and marks partial inputs', () => {
  const full = computeSentiment({
    indexChanges: [1], breadth: { up: 300, down: 100, flat: 0 }, sectorChanges: [1, -1, 1],
  })
  assert.ok(full)
  assert.equal(full.score, 68)
  assert.equal(full.partial, false)
  assert.deepEqual(full.factors.map(factor => factor.key), ['index', 'breadth', 'sector', 'momentum'])
  assert.equal(full.factors.find(factor => factor.key === 'breadth')!.score, 75)
  assert.equal(full.label, 'greed')
  assert.ok(Math.abs(full.factors.reduce((sum, factor) => sum + factor.weight, 0) - 1) < 1e-12)
  const partial = computeSentiment({ indexChanges: [0], sectorChanges: [0] })
  assert.ok(partial)
  assert.equal(partial.partial, true)
  assert.deepEqual(partial.factors.map(factor => factor.key), ['index', 'sector', 'momentum'])
  assert.equal(partial.score, 27)
  assert.equal(computeSentiment({ indexChanges: [], sectorChanges: [] }), null)
})

test('market clock never claims trading without a current-session quote', () => {
  const weekend = marketClock(new Date('2026-10-18T21:00:00+08:00'), '2026-10-16T15:00:00+08:00')
  assert.equal(weekend.phase, 'weekend')
  assert.equal(weekend.quoteToday, false)
  const open = marketClock(new Date('2026-10-16T10:00:00+08:00'), '2026-10-16T09:55:00+08:00')
  assert.equal(open.phase, 'open')
  assert.equal(open.quoteToday, true)
  assert.equal(open.stale, false)
  const delayed = marketClock(new Date('2026-10-16T10:00:00+08:00'), '2026-10-16T09:00:00+08:00')
  assert.equal(delayed.stale, true)
  const closed = marketClock(new Date('2026-10-16T21:00:00+08:00'), '2026-10-16T15:00:00+08:00')
  assert.equal(closed.phase, 'closed')
  assert.equal(closed.quoteToday, true)
  assert.equal(closed.stale, true)
  const lunch = marketClock(new Date('2026-10-16T12:00:00+08:00'), '2026-10-16T11:30:00+08:00')
  assert.equal(lunch.phase, 'lunch')
})

test('Tencent batch parser keeps only well-formed quote lines', () => {
  const parsed = parseTencentBatch(`${indexLine(...indexLines[0])}\n${boardLine('801080', '电子', 0.5)}\nnot a quote\nv_sh600000="short";`)
  assert.equal(parsed.size, 2)
  assert.equal(parsed.get('sh000001')![1], 'SSE')
  assert.equal(parsed.get('pt01801080')![58], 'BK-HY-1')
  assert.deepEqual(parseBoardRank({ data: [{ bd_code: 'pt01801080', bd_name: '电子', bd_zdf: '0.5', nzg_code: 'sh600000', nzg_name: '浦发银行', nzg_zdf: '1.2' }] }).get('801080')?.topStock, { code: 'SH.600000', name: '浦发银行', changePercent: 1.2 })
  assert.throws(() => parseStockRankPage({ data: { total: 20_000, rank_list: [] } }))
})

test('overview projects six indices and all 31 industries; board detail stays bounded', async () => {
  let fetches = 0
  const provider = createTencentMarketProvider({
    fetchImpl: (async (input: any) => { fetches++; return fakeFetch(String(input)) }) as typeof fetch,
    now: () => NOW,
  })
  const overview = await provider.overview()
  assert.equal(overview.indices.length, 6)
  assert.equal(overview.sectors.filter(sector => sector.level === 1).length, 31)
  assert.equal(overview.indices[0]!.name, 'SSE')
  assert.equal(overview.indices[0]!.amount, 732_475_190_000)
  const electronics = overview.sectors.find(sector => sector.code === '801080')!
  assert.equal(electronics.name, 'Board 4')
  assert.equal(electronics.marketCap, 1004 * 1e8)
  assert.equal(overview.quotedAt, '2026-10-16T15:00:00+08:00')
  assert.equal(fetches, 2)
  await provider.overview()
  assert.equal(fetches, 2, 'overview is cached')
  const board = await provider.board('801080')
  assert.equal(board.name, 'Board 4')
  assert.equal(board.total, 3)
  assert.equal(board.stocks.length, 3)
  assert.equal(board.truncated, false)
  assert.equal(board.changePercent, electronics.changePercent)
  await provider.overview()
  assert.throws(() => provider.board('999999'), { code: 'invalid-board' })
})

test('breadth counts every valid row and reports coverage and distribution', async () => {
  const provider = createTencentMarketProvider({
    fetchImpl: (async (input: any) => fakeFetch(String(input))) as typeof fetch,
    now: () => NOW,
  })
  const breadth = await provider.breadth()
  assert.equal(breadth.expected, 250)
  assert.equal(breadth.covered, 250)
  assert.equal(breadth.coverage, 1)
  assert.equal(breadth.up, 120)
  assert.equal(breadth.down, 110)
  assert.equal(breadth.flat, 20)
  assert.equal(breadth.suspended, 5)
  assert.equal(breadth.amount, Array.from({ length: 250 }, (_, index) => (1000 + index) * 10_000).reduce((sum, value) => sum + value, 0))
  assert.equal(breadth.distribution.reduce((sum, bucket) => sum + bucket.count, 0), 250)
  assert.equal(breadth.distribution[7]!.count, 119)
  assert.equal(breadth.topGainers[0]!.changePercent, 5.5)
  assert.equal(breadth.topLosers[0]!.changePercent, -2)
  assert.equal(breadth.partial, false)
})

test('market RPC requires owner, validates the exact payload and hides provider failures', async () => {
  const provider = {
    name: 'test',
    overview: async () => ({ source: 'test', fetchedAt: new Date(NOW).toISOString(), quotedAt: null, indices: [], sectors: [] }),
    breadth: async () => ({ source: 'test', fetchedAt: new Date(NOW).toISOString(), expected: 0, covered: 0, up: 0, down: 0, flat: 0, suspended: 0, coverage: 0, partial: false, amount: 0, distribution: [], topGainers: [], topLosers: [], topAmount: [] }),
    board: async () => ({ source: 'test', fetchedAt: new Date(NOW).toISOString(), code: '801080', name: '电子', changePercent: 0, amount: null, marketCap: null, total: 0, truncated: false, stocks: [] }),
    quotes: async (symbols: string[]) => symbols.map(symbol => ({ symbol, status: 'available' as const, name: '电子', price: 10, changePercent: 1, quotedAt: new Date(NOW - 60_000).toISOString(), fetchedAt: null, marketStatus: 'unknown' as const })),
  }
  const handler = createMarketHandler({ provider: provider as any, now: () => NOW })
  const owner = { principal: { kind: 'owner' } }
  assert.equal((await handler(MARKET_ENDPOINT, { kind: 'overview' }, undefined, owner)).ok, true)
  assert.equal(((await handler(MARKET_ENDPOINT, { kind: 'overview' }, undefined, { principal: { kind: 'guest' } })) as any).error.code, 'stock/forbidden')
  assert.equal(((await handler('other', { kind: 'overview' }, undefined, owner)) as any).error.code, 'stock/not-found')
  assert.equal(((await handler(MARKET_ENDPOINT, { kind: 'board', board: 'bad' }, undefined, owner)) as any).error.code, 'stock/invalid-input')
  assert.equal(((await handler(MARKET_ENDPOINT, { kind: 'overview' }, undefined, undefined)) as any).error.code, 'stock/forbidden')
  const quotes = await handler(MARKET_ENDPOINT, { kind: 'quotes', symbols: ['SH.600519'] }, undefined, owner) as any
  assert.equal(quotes.ok, true)
  assert.equal(quotes.value.source, 'test')
  assert.equal(quotes.value.quotes[0].symbol, 'SH.600519')
  assert.equal(quotes.value.quotes[0].price, 10)
  assert.equal(quotes.value.quotes[0].fetchedAt, new Date(NOW).toISOString())
  const noQuotes = await createMarketHandler({ provider: { ...provider, quotes: async () => { throw new Error('raw secret') } } as any })(MARKET_ENDPOINT, { kind: 'quotes', symbols: ['SH.600519'] }, undefined, owner) as any
  assert.equal(noQuotes.error.code, 'stock/market-unavailable')
  assert.doesNotMatch(JSON.stringify(noQuotes), /raw secret/)
  const unconfigured = await createMarketHandler()(MARKET_ENDPOINT, { kind: 'overview' }, undefined, owner)
  assert.deepEqual(unconfigured, { ok: true, value: { status: 'unconfigured', source: null } })
  const broken = createMarketHandler({ provider: { ...provider, overview: async () => { throw new Error('raw secret') } } as any })
  const failure = await broken(MARKET_ENDPOINT, { kind: 'overview' }, undefined, owner) as any
  assert.equal(failure.error.code, 'stock/market-unavailable')
  assert.doesNotMatch(JSON.stringify(failure), /raw secret/)
  const route = createMarketRoute({ provider: provider as any })
  const response = await route.fetch(new Request(`http://localhost${route.path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: 'r1', method: MARKET_ENDPOINT, payload: { kind: 'overview' } }),
  }))
  assert.equal(response.status, 200)
  const envelope = await response.json()
  assert.equal(envelope.type, 'server-response')
  assert.equal(envelope.result.ok, true)
})
