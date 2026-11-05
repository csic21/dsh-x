import test from 'node:test'
import assert from 'node:assert/strict'
import {
  NEWS_ENDPOINT, mergeNews, newsSymbolRef, parseEastmoneyNews, parseNewsRequest, parseShanghaiStamp,
  parseSinaFlash, safeNewsUrl, sanitizeText, splitFlash, unwrapJsonp, validateNewsFeed,
} from '../src/news.ts'
import { createSinaNewsProvider, eastmoneySearchUrl } from '../src/news-provider.ts'
import { createNewsHandler } from '../src/news-rpc.ts'
import type { NewsItem } from '../src/news.ts'

const NOW = Date.parse('2026-11-05T12:00:00+08:00')

const flashEntry = (overrides: Record<string, unknown> = {}) => ({
  id: 5195401,
  create_time: '2026-11-05 11:57:14',
  rich_text: '【中际旭创：机构给出1400元目标价】11月5日，某机构上调目标价。',
  tag: [{ id: '10', name: '公司' }, { id: '11', name: '市场' }],
  docurl: 'https://finance.sina.cn/7x24/2026-11-05/detail-inixsezw5620665.d.html',
  ext: JSON.stringify({ stocks: [{ market: 'cn', symbol: 'sz300308', key: '中际旭创' }] }),
  ...overrides,
})

const flashPayload = (list: unknown[]) => ({ result: { status: { code: 0 }, data: { feed: { list } } } })

const article = (overrides: Record<string, unknown> = {}) => ({
  date: '2026-11-05 11:37:17',
  title: '<em>中际旭创</em>A股涨超10%',
  content: '<em>中际旭创</em>A股涨超10%，港股涨幅扩大至6%。',
  mediaName: '第一财经',
  url: 'http://finance.eastmoney.com/a/202611043921858956.html',
  code: '202611043921858956',
  ...overrides,
})

const searchPayload = (list: unknown[]) => ({ result: { cmsArticleWebOld: list } })

test('news text loses inline markup without inventing word breaks', () => {
  assert.equal(sanitizeText('<em>中际旭创</em>A股涨超10%', 40), '中际旭创A股涨超10%')
  assert.equal(sanitizeText('第一行<br>第二行', 40), '第一行 第二行')
  // Entities are decoded, unknown ones stay literal rather than becoming empty.
  assert.equal(sanitizeText('A&amp;B&nbsp;C&bogus;', 40), 'A&B C&bogus;')
  assert.equal(sanitizeText('x'.repeat(30), 10).length, 10)
  assert.equal(sanitizeText(null, 10), '')
})

test('only a public finance host keeps a link, and it is upgraded to https', () => {
  assert.equal(safeNewsUrl('http://finance.eastmoney.com/a/1.html'), 'https://finance.eastmoney.com/a/1.html')
  assert.equal(safeNewsUrl('https://finance.sina.cn/7x24/1.d.html'), 'https://finance.sina.cn/7x24/1.d.html')
  assert.equal(safeNewsUrl('javascript:alert(1)'), null)
  assert.equal(safeNewsUrl('https://evil.example.com/a'), null)
  assert.equal(safeNewsUrl('https://eastmoney.com.evil.example/a'), null)
  assert.equal(safeNewsUrl(42), null)
})

test('a Shanghai wall clock becomes an instant and an impossible date does not', () => {
  assert.equal(parseShanghaiStamp('2026-11-05 11:57:14'), '2026-11-05T03:57:14.000Z')
  assert.equal(parseShanghaiStamp('2026-02-30 10:00:00'), null)
  assert.equal(parseShanghaiStamp('2026-11-05'), null)
  assert.equal(parseShanghaiStamp(20261105), null)
})

test('a bracketed flash splits into headline and body', () => {
  assert.deepEqual(splitFlash('【中际旭创：目标价上调】11月5日，机构上调。'), { title: '中际旭创：目标价上调', summary: '11月5日，机构上调。' })
  assert.equal(splitFlash('美元指数下跌0.26%，至101.21。').summary, null)
})

test('Sina symbols map to the identities the watchlist already stores', () => {
  assert.equal(newsSymbolRef('cn', 'sz300308'), 'SZ.300308')
  assert.equal(newsSymbolRef('cn', 'sh600519'), 'SH.600519')
  assert.equal(newsSymbolRef('hk', '00700'), 'HK.00700')
  assert.equal(newsSymbolRef('us', 'nvda'), 'US.NVDA')
  // Fund / index / FX rows are real tags but are not watchable listings here.
  assert.equal(newsSymbolRef('fund', '159363'), null)
  assert.equal(newsSymbolRef('foreign', 'fx_susdirr'), null)
  assert.equal(newsSymbolRef('cn', 'si000688'), null)
  assert.equal(newsSymbolRef('hk', '700'), null)
})

test('the flash parser keeps usable rows and drops the rest', () => {
  const items = parseSinaFlash(flashPayload([
    flashEntry(),
    // Future timestamp, broken id, and a row with no text are all dropped.
    flashEntry({ id: 5195402, create_time: '2026-11-05 23:59:59' }),
    flashEntry({ id: 'not-a-number' }),
    flashEntry({ id: 5195403, rich_text: '   ' }),
    // `ext` may be a string or an object; both shapes are accepted.
    flashEntry({ id: 5195404, rich_text: '港股全线大涨', ext: { stocks: [{ market: 'hk', symbol: '00700', key: '腾讯控股' }] } }),
  ]), NOW)
  assert.deepEqual(items.map(item => item.id), ['sina:5195401', 'sina:5195404'])
  assert.equal(items[0]!.title, '中际旭创：机构给出1400元目标价')
  assert.deepEqual(items[0]!.tags, ['公司', '市场'])
  assert.deepEqual(items[0]!.symbols, [{ symbol: 'SZ.300308', name: '中际旭创' }])
  assert.equal(items[0]!.url, 'https://finance.sina.cn/7x24/2026-11-05/detail-inixsezw5620665.d.html')
  assert.deepEqual(items[1]!.symbols, [{ symbol: 'HK.00700', name: '腾讯控股' }])
})

test('a malformed flash envelope is a failure, not an empty feed', () => {
  assert.throws(() => parseSinaFlash({ result: {} }, NOW), /malformed/)
  assert.throws(() => parseSinaFlash(null, NOW), /malformed/)
})

test('article rows keep the publisher, strip the highlight and bound old dates', () => {
  const items = parseEastmoneyNews(searchPayload([
    article(),
    // Duplicate id, unsafe link and a stale row.
    article(),
    article({ code: 'x2', url: 'javascript:alert(1)' }),
    article({ code: 'x3', date: '2026-08-01 09:00:00' }),
  ]), NOW)
  assert.deepEqual(items.map(item => item.id), ['em:202611043921858956', 'em:x2'])
  assert.equal(items[0]!.title, '中际旭创A股涨超10%')
  assert.equal(items[0]!.media, '第一财经')
  assert.equal(items[0]!.url, 'https://finance.eastmoney.com/a/202611043921858956.html')
  assert.equal(items[1]!.url, null)
})

test('JSONP unwrapping refuses a body that is not a call', () => {
  assert.deepEqual(unwrapJsonp('cb({"ok":1})'), { ok: 1 })
  assert.throws(() => unwrapJsonp('<html></html>'))
})

test('the news request accepts exactly two shapes', () => {
  assert.deepEqual(parseNewsRequest({ kind: 'flash' }), { kind: 'flash' })
  assert.deepEqual(parseNewsRequest({ kind: 'stock', symbol: 'SZ.300308', name: '中际旭创' }), { kind: 'stock', symbol: 'SZ.300308', name: '中际旭创' })
  for (const payload of [
    { kind: 'flash', extra: 1 },
    { kind: 'stock', symbol: 'XX.000001', name: 'x' },
    { kind: 'stock', symbol: 'SZ.300308', name: '   ' },
    { kind: 'stock', symbol: 'SZ.300308' },
    { kind: 'other' },
    null,
    [],
  ]) assert.throws(() => parseNewsRequest(payload), /news/, `rejects ${JSON.stringify(payload)}`)
})

test('the projection drops malformed rows, orders named stories first and dedupes', () => {
  const raw = {
    source: 'test-source',
    partial: false,
    items: [
      // Mentioned but not named, older than the named rows.
      { id: 'a', at: '2026-11-05T02:00:00.000Z', title: '板块普涨', direct: false, symbols: [] },
      { id: 'b', at: '2026-11-05T01:00:00.000Z', title: '中际旭创 涨超10%', direct: true, symbols: [{ symbol: 'SZ.300308', name: '中际旭创' }] },
      { id: 'c', at: '2026-11-05T01:00:00.000Z', title: '中际旭创 涨超10%', direct: true, symbols: [] },
      { id: 'd', at: 'not-a-date', title: 'bad time' },
      { id: 'e', at: '2026-11-05T03:00:00.000Z', title: '' },
      { id: 'f', at: '2026-11-05T03:00:00.000Z', title: '未知代码', symbols: [{ symbol: 'ZZ.1', name: '?' }] },
    ],
  }
  const feed = validateNewsFeed(raw, { kind: 'stock', symbol: 'SZ.300308', name: '中际旭创' }, NOW)
  assert.equal(feed.scope, 'stock')
  assert.equal(feed.symbol, 'SZ.300308')
  assert.deepEqual(feed.items.map(item => item.id), ['b', 'f', 'a'])
  assert.deepEqual(feed.items[2]!.symbols, [])
  assert.equal(feed.items[0]!.direct, true)
})

test('mergeNews never returns more rows than the cap', () => {
  const items: NewsItem[] = Array.from({ length: 80 }, (_, index) => ({
    id: `i${index}`, at: new Date(NOW - index * 1000).toISOString(), title: `t${index}`,
    summary: null, media: null, url: null, tags: [], direct: index % 2 === 0, symbols: [],
  }))
  const merged = mergeNews(items, 10)
  assert.equal(merged.length, 10)
  assert.ok(merged.slice(0, 5).every(item => item.direct), 'named rows lead the list')
})

// ── provider ────────────────────────────────────────────────────────────────

function fakeFetch(routes: Record<string, () => Response>) {
  const calls: string[] = []
  const impl = (async (input: any) => {
    const url = String(input)
    calls.push(url)
    for (const [fragment, make] of Object.entries(routes)) if (url.includes(fragment)) return make()
    return new Response('missing', { status: 500, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch
  return { calls, impl }
}

const json = (body: unknown) => () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
const js = (body: string) => () => new Response(body, { status: 200, headers: { 'content-type': 'text/javascript' } })

test('the search URL carries the name and the requested sort', () => {
  const url = eastmoneySearchUrl('中际旭创', 24, 'default')
  assert.match(url, /^https:\/\/search-api-web\.eastmoney\.com\/search\/jsonp\?cb=cb&param=/)
  const param = JSON.parse(decodeURIComponent(url.slice(url.indexOf('param=') + 6)))
  assert.equal(param.keyword, '中际旭创')
  assert.equal(param.param.cmsArticleWebOld.sort, 'default')
  assert.equal(param.param.cmsArticleWebOld.pageSize, 24)
})

test('the flash feed is fetched once and cached for the next reader', async () => {
  const { calls, impl } = fakeFetch({ 'zhibo.sina.com.cn': json(flashPayload([flashEntry()])) })
  const provider = createSinaNewsProvider({ fetchImpl: impl, now: () => NOW })
  const first = await provider.flash()
  const second = await provider.flash()
  assert.equal(first.items.length, 1)
  assert.equal(calls.length, 1)
  assert.equal(second.items[0]!.id, 'sina:5195401')
})

test('a stock feed merges named flashes with article search and drops unrelated flashes', async () => {
  const { impl } = fakeFetch({
    'zhibo.sina.com.cn': json(flashPayload([
      flashEntry(),
      // Tagged with another company: not this stock's news.
      flashEntry({ id: 5195499, rich_text: '同有科技：存储原材料国产化占比较高', ext: JSON.stringify({ stocks: [{ market: 'cn', symbol: 'sz300302', key: '同有科技' }] }) }),
    ])),
    'search-api-web.eastmoney.com': js(`cb(${JSON.stringify(searchPayload([article()]))})`),
  })
  const provider = createSinaNewsProvider({ fetchImpl: impl, now: () => NOW })
  const feed = await provider.stock({ symbol: 'SZ.300308', name: '中际旭创' })
  assert.deepEqual(feed.items.map(item => item.id), ['sina:5195401', 'em:202611043921858956'])
  assert.ok(feed.items.every(item => item.direct))
  assert.equal(feed.partial, false)
})

test('one dead layer leaves a partial feed instead of an empty panel', async () => {
  const { impl } = fakeFetch({
    'zhibo.sina.com.cn': json(flashPayload([flashEntry()])),
    'search-api-web.eastmoney.com': () => new Response('<html>waf</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
  })
  const provider = createSinaNewsProvider({ fetchImpl: impl, now: () => NOW })
  const feed = await provider.stock({ symbol: 'SZ.300308', name: '中际旭创' })
  assert.equal(feed.items.length, 1)
  assert.equal(feed.partial, true)
})

test('a search result that never names the company is not shown on its page', async () => {
  const { impl } = fakeFetch({
    'zhibo.sina.com.cn': json(flashPayload([])),
    'search-api-web.eastmoney.com': js(`cb(${JSON.stringify(searchPayload([
      article({ code: 'm1', title: '港股全线大涨', content: '腾讯控股领涨' }),
      article({ code: 'm2', title: '英伟达股价上涨3%', content: '英伟达' }),
    ]))})`),
  })
  const provider = createSinaNewsProvider({ fetchImpl: impl, now: () => NOW })
  const feed = await provider.stock({ symbol: 'HK.00700', name: '腾讯控股' })
  assert.deepEqual(feed.items, [])
})

test('both layers failing is a failure, not "no news"', async () => {
  const { impl } = fakeFetch({})
  const provider = createSinaNewsProvider({ fetchImpl: impl, now: () => NOW })
  await assert.rejects(() => provider.stock({ symbol: 'SZ.300308', name: '中际旭创' }))
})

// ── route ───────────────────────────────────────────────────────────────────

const owner = { principal: { kind: 'owner' } }
const peer = { principal: { kind: 'peer' } }
const providerStub = (items: any[]) => ({
  name: 'test-news',
  flash: async () => ({ source: 'test-news', items }),
  stock: async () => ({ source: 'test-news', items, partial: false }),
})

test('the news route refuses other principals and malformed requests', async () => {
  const handle = createNewsHandler({ provider: providerStub([]), now: () => NOW })
  assert.equal((await handle(NEWS_ENDPOINT, { kind: 'flash' }, undefined, peer)).ok, false)
  assert.equal((await handle(NEWS_ENDPOINT, { kind: 'flash' }, undefined, undefined)).ok, false)
  const invalid = await handle(NEWS_ENDPOINT, { kind: 'stock', symbol: 'XX.1', name: 'x' }, undefined, owner)
  assert.equal(invalid.ok, false)
  assert.equal((invalid as any).error.code, 'finance/invalid-input')
})

test('the news route answers unconfigured without a provider and projects a ready feed', async () => {
  const off = await createNewsHandler({ now: () => NOW })(NEWS_ENDPOINT, { kind: 'flash' }, undefined, owner)
  assert.deepEqual(off, { ok: true, value: { status: 'unconfigured' } })
  const items = parseSinaFlash(flashPayload([flashEntry()]), NOW)
  const on = await createNewsHandler({ provider: providerStub(items), now: () => NOW })(NEWS_ENDPOINT, { kind: 'flash' }, undefined, owner)
  assert.equal(on.ok, true)
  assert.equal((on as any).value.status, 'ready')
  assert.equal((on as any).value.news.items.length, 1)
  assert.equal((on as any).value.news.scope, 'flash')
})

test('a failing provider is reported as unavailable, never as raw upstream text', async () => {
  const handle = createNewsHandler({
    provider: { name: 'x', flash: async () => { throw new Error('upstream said SECRET') }, stock: async () => { throw new Error('nope') } },
    now: () => NOW,
  })
  const result = await handle(NEWS_ENDPOINT, { kind: 'flash' }, undefined, owner)
  assert.equal(result.ok, false)
  assert.equal((result as any).error.code, 'finance/news-unavailable')
  assert.doesNotMatch(JSON.stringify(result), /SECRET/)
})
