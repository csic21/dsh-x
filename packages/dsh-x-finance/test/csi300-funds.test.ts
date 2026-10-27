import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCsi300FundShare, createTencentMarketProvider, parseCsi300FundCatalog, parseCsi300FundScale,
  parseCsi300IndexPerf, parseCsi300IndexQuote,
} from '../src/market-provider.ts'
import { parseMarketRequest } from '../src/market.ts'
import { createMarketHandler, projectCsi300FundShare } from '../src/market-rpc.ts'

const NOW = Date.parse('2026-10-27T08:00:00+08:00')
const QUOTE = '20261026161412'

const catalog = {
  data: [
    { productCode: '510300', fundName: '华泰柏瑞沪深300交易型开放式指数证券投资基金', fundType: 'ETF', aum: '1069.56' },
    { productCode: '510310', fundName: '易方达沪深300交易型开放式指数发起式证券投资基金', fundType: 'ETF', aum: '513.17' },
    { productCode: '519300', fundName: '大成沪深300指数证券投资基金', fundType: '指数基金', aum: '11.31' },
    { productCode: '160706', fundName: '嘉实沪深300交易型开放式指数证券投资基金(LOF)', fundType: 'LOF', aum: '20.00' },
    // Excluded categories: feeder funds would double count the ETF, enhanced
    // funds are not passive exposure, and overseas listings are not CNY funds.
    { productCode: '012712', fundName: '建信沪深300红利ETF联接A', fundType: '联接基金', aum: '35.93' },
    { productCode: '100038', fundName: '富国沪深300增强证券投资基金', fundType: '指数增强', aum: '57.65' },
    { productCode: '3188 HK Equity', fundName: '华夏沪深300ETF', fundType: 'ETF', aum: '141.40' },
    // A zero-size report and a duplicate row must not add a fund.
    { productCode: '000000', fundName: '空规模基金', fundType: 'ETF', aum: '0' },
    { productCode: '510300', fundName: '华泰柏瑞沪深300ETF', fundType: 'ETF', aum: '1069.56' },
  ],
}

const scale = (values: Array<[string, number]>) => `/* x */var Data_fluctuationScale = ${JSON.stringify({
  categories: values.map(([date]) => date),
  series: values.map(([, value]) => ({ y: value, mom: '0%' })),
})};/* y */var Data_netWorthTrend = [];`

const scripts: Record<string, string> = {
  '510300': scale([['2025-09-30', 1000], ['2025-12-31', 1000], ['2026-06-30', 1100], ['2026-09-30', 1069.56]]),
  '510310': scale([['2025-12-31', 480], ['2026-06-30', 500], ['2026-09-30', 513.17]]),
  '519300': scale([['2025-12-31', 10], ['2026-06-30', 11], ['2026-09-30', 11.31]]),
  '160706': scale([['2025-12-31', 18], ['2026-06-30', 19], ['2026-09-30', 20]]),
}

const perf = {
  data: [
    { tradeDate: '20251231', close: 4629.94 },
    { tradeDate: '20260630', close: 4979.43 },
    { tradeDate: '20260930', close: 4357.62 },
    { tradeDate: '20261024', close: 4103.54 },
  ],
}

const quoteLine = (() => {
  const fields = new Array(60).fill('0')
  fields[1] = '沪深300'
  fields[2] = '000300'
  fields[3] = '4103.54'
  fields[30] = QUOTE
  fields[44] = '488918.40'
  fields[45] = '515107.86'
  return `v_sh000300="${fields.join('~')}";\n`
})()

const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
const text = (value: string) => new Response(value, { headers: { 'content-type': 'text/javascript' } })

function fakeFetch(requests: string[]) {
  return async (url: any) => {
    const target = String(url)
    requests.push(target)
    if (target.includes('queryByIndexCode')) return json(catalog)
    if (target.startsWith('https://qt.gtimg.cn/q=')) return text(quoteLine)
    if (target.includes('pingzhongdata/')) {
      const code = /pingzhongdata\/(\d{6})\.js/.exec(target)?.[1] ?? ''
      const body = scripts[code]
      if (!body) throw new Error('no script')
      return text(body)
    }
    if (target.includes('index-perf')) return json(perf)
    throw new Error(`unexpected request ${target}`)
  }
}

test('the fund catalogue keeps only domestic passive CSI 300 funds and sorts by size', () => {
  const funds = parseCsi300FundCatalog(catalog)
  assert.deepEqual(funds.map(fund => fund.code), ['510300', '510310', '160706', '519300'])
  assert.equal(funds[0]!.type, 'ETF')
  assert.equal(funds[0]!.aum, 1069.56e8)
  assert.throws(() => parseCsi300FundCatalog({ data: [] }), /csi300 catalog empty/)
  assert.throws(() => parseCsi300FundCatalog({}), /csi300 catalog missing/)
})

test('one fund script yields its quarterly sizes and drops unusable rows', () => {
  const points = parseCsi300FundScale(scripts['510300']!)
  assert.deepEqual(points.map(point => point.date), ['2025-09-30', '2025-12-31', '2026-06-30', '2026-09-30'])
  assert.equal(points[0]!.aum, 1000e8)
  const dirty = scale([['2025-13-40', 10], ['2025-09-30', -1], ['2025-12-31', 12]])
  assert.deepEqual(parseCsi300FundScale(dirty).map(point => point.date), ['2025-12-31'])
  assert.throws(() => parseCsi300FundScale('var x = 1;'), /csi300 fund scale missing/)
})

test('index levels and the index float cap are validated, not guessed', () => {
  assert.deepEqual(parseCsi300IndexPerf(perf).at(-1), { date: '2026-10-24', close: 4103.54 })
  const quote = parseCsi300IndexQuote(quoteLine.trim().split('="')[1]!.replace(/";$/, '').split('~'), NOW)
  assert.equal(quote.close, 4103.54)
  assert.equal(quote.floatCap, 488918.40e8)
  assert.match(quote.quotedAt!, /^2026-10-26T16:14:12\+08:00$/)
  assert.throws(() => parseCsi300IndexQuote(undefined, NOW), /csi300 quote mismatch/)
})

test('the ratio joins reported sizes with the index cap and drops thin quarters', () => {
  const funds = parseCsi300FundCatalog(catalog)
  const history = new Map(Object.entries(scripts).map(([code, script]) => [code, parseCsi300FundScale(script)]))
  const share = buildCsi300FundShare({
    funds,
    history,
    perf: parseCsi300IndexPerf(perf),
    indexClose: 4103.54,
    indexFloatCap: 488918.40e8,
    indexQuotedAt: '2026-10-26T16:14:12+08:00',
    now: NOW,
  })
  assert.equal(share.fundCount, 4)
  assert.equal(share.reportDate, '2026-09-30')
  assert.equal(share.totalAum, 1614.04e8)
  assert.ok(Math.abs(share.ratio - 1614.04e8 / (488918.40e8)) < 1e-9)
  // 2025-09-30 is reported by one fund covering only ~66% of the catalogue.
  assert.deepEqual(share.history.map(point => point.date), ['2025-12-31', '2026-06-30', '2026-09-30'])
  const latest = share.history.at(-1)!
  assert.equal(latest.fundAum, 1614.04e8)
  assert.ok(latest.floatCap > 488918.40e8, 'a higher index level scales the float cap up')
  assert.equal(share.estimatedFloatCap, true)
  assert.equal(share.historyCoverage, 1)
})

test('the provider joins the four upstreams and caches the joined answer', async () => {
  const requests: string[] = []
  const provider = createTencentMarketProvider({ fetchImpl: fakeFetch(requests) as any, now: () => NOW, concurrency: 2 })
  const share = await provider.csi300Funds!()
  assert.equal(share.fundCount, 4)
  assert.equal(share.history.length, 3)
  assert.equal(share.source, '中证指数 + 天天基金 + 腾讯行情 (unofficial)')
  assert.equal(share.historyCoverage, 1)
  assert.ok(!JSON.stringify(share).includes('queryByIndexCode'), 'raw URLs never reach the browser')
  assert.ok(!JSON.stringify(share).includes('Data_fluctuationScale'), 'raw scripts never reach the browser')
  const catalogRequests = requests.filter(url => url.includes('queryByIndexCode')).length
  const second = await provider.csi300Funds!()
  assert.equal(second, share, 'the cached value is reused')
  assert.equal(requests.filter(url => url.includes('queryByIndexCode')).length, catalogRequests)
})

test('a fund whose script cannot be read still counts in the snapshot', async () => {
  const requests: string[] = []
  const fetchImpl = fakeFetch(requests)
  const provider = createTencentMarketProvider({
    fetchImpl: (async (url: any) => {
      if (String(url).includes('pingzhongdata/519300')) throw new Error('blocked')
      return fetchImpl(url)
    }) as any,
    now: () => NOW,
    concurrency: 2,
  })
  const share = await provider.csi300Funds!()
  assert.equal(share.fundCount, 4)
  assert.equal(share.totalAum, 1614.04e8)
  assert.ok(share.historyCoverage < 1)
  assert.equal(share.history.at(-1)!.fundAum, 1614.04e8 - 11.31e8)
})

test('the request parser accepts only the bare fund-share kind', () => {
  assert.deepEqual(parseMarketRequest({ kind: 'csi300-funds' }), { kind: 'csi300-funds' })
  assert.throws(() => parseMarketRequest({ kind: 'csi300-funds', board: '801010' }), /invalid-input/)
})

test('the RPC projection recomputes totals and rejects inconsistent payloads', () => {
  const raw = {
    source: '中证指数 + 天天基金 + 腾讯行情 (unofficial)',
    reportDate: '2026-09-30',
    indexFloatCap: 488918.40e8,
    indexClose: 4103.54,
    indexQuotedAt: '2026-10-26T16:14:12+08:00',
    totalAum: 1,
    ratio: 1,
    fundCount: 99,
    funds: [
      { code: '510300', name: '沪深300ETF华泰柏瑞', type: 'ETF', aum: 1069.56e8 },
      { code: '510310', name: '沪深300ETF易方达', type: 'ETF', aum: 513.17e8 },
    ],
    history: [
      { date: '2026-06-30', fundAum: 1500e8, floatCap: 5.19e13, ratio: 0.9 },
      { date: '2026-09-30', fundAum: 1582.73e8, floatCap: 5.19e13, ratio: 0.9 },
    ],
    historyCoverage: 1,
    estimatedFloatCap: true,
  }
  const projected = projectCsi300FundShare(raw, NOW)
  assert.equal(projected.fundCount, 2)
  assert.equal(projected.totalAum, 1582.73e8)
  assert.ok(Math.abs(projected.ratio - 1582.73e8 / 488918.40e8) < 1e-9)
  assert.equal(projected.history.at(-1)!.ratio, 1582.73e8 / 5.19e13)
  assert.equal(projected.fetchedAt, new Date(NOW).toISOString())
  assert.throws(() => projectCsi300FundShare({ ...raw, estimatedFloatCap: false }, NOW), /unavailable/)
  assert.throws(() => projectCsi300FundShare({ ...raw, funds: [] }, NOW), /unavailable/)
  assert.throws(() => projectCsi300FundShare({ ...raw, funds: [{ code: 'abc', name: 'x', type: 'ETF', aum: 1 }] }, NOW), /unavailable/)
})

test('the market route answers the fund-share kind and degrades when the source lacks it', async () => {
  const share = {
    source: '中证指数 + 天天基金 + 腾讯行情 (unofficial)',
    reportDate: '2026-09-30',
    indexFloatCap: 488918.40e8,
    indexClose: 4103.54,
    indexQuotedAt: '2026-10-26T16:14:12+08:00',
    totalAum: 1614.04e8,
    ratio: 0,
    fundCount: 1,
    funds: [{ code: '510300', name: '沪深300ETF华泰柏瑞', type: 'ETF', aum: 1614.04e8 }],
    history: [{ date: '2026-09-30', fundAum: 1614.04e8, floatCap: 5.19e13, ratio: 0 }],
    historyCoverage: 1,
    estimatedFloatCap: true,
  }
  const provider: any = {
    name: 'stub', overview: async () => ({}), breadth: async () => ({}), board: async () => ({}), quotes: async () => [],
    csi300Funds: async () => share,
  }
  const owner = { principal: { kind: 'owner' } }
  const handler = createMarketHandler({ provider, now: () => NOW })
  const answer: any = await handler('dsh-x-finance.market', { kind: 'csi300-funds' }, undefined, owner)
  assert.equal(answer.ok, true)
  assert.equal(answer.value.status, 'ready')
  assert.equal(answer.value.csi300Funds.fundCount, 1)
  assert.ok(Math.abs(answer.value.csi300Funds.ratio - 1614.04e8 / (488918.40e8)) < 1e-9)

  const without = createMarketHandler({ provider: { ...provider, csi300Funds: undefined }, now: () => NOW })
  const missing: any = await without('dsh-x-finance.market', { kind: 'csi300-funds' }, undefined, owner)
  assert.equal(missing.ok, false)
  assert.equal(missing.error.code, 'finance/csi300-funds-unavailable')
})
