import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SEARCH_MAX_PROBES, SEARCH_MAX_QUERY, SEARCH_MAX_RESULTS, SEARCH_RPC_ENDPOINT, SEARCH_SOURCE_NAME,
  normalizeMatch, normalizeSearchQuery, parseInstrumentHints, parseSearchRequest, parseUsInstrumentHints,
  planSearch, rankCandidates,
} from '../src/instrument-search.ts'
import { SEARCH_MAX_BYTES, SEARCH_URL, createInstrumentSearchProvider } from '../src/instrument-search-provider.ts'
import { createSearchHandler, createSearchRoute } from '../src/search-rpc.ts'

// Offline fixtures in the shape of the upstream `v_hint="..."` payload. They
// are synthetic: no test here contacts the network or claims live securities.
const escape = (text: string) => [...text]
  .map(character => character.codePointAt(0)! > 127 ? `\\u${character.codePointAt(0)!.toString(16).padStart(4, '0')}` : character)
  .join('')
const entry = (market: string, code: string, name: string, klass: string) => [market, code, escape(name), 'py', klass].join('~')
const hint = (entries: string[]) => `v_hint="${entries.join('^')}"`

test('directory projection keeps exchange-tradable A-shares, ETFs, LOFs and REITs only', () => {
  const matches = parseInstrumentHints(hint([
    entry('sz', '002594', '比亚迪', 'GP-A'),
    entry('sh', '600519', '贵州茅台', 'GP-A'),
    entry('sh', '510300', '沪深300ETF华泰柏瑞', 'ETF'),
    entry('sz', '159941', '纳指ETF广发', 'QDII-ETF'),
    entry('sz', '160706', '嘉实沪深300ETF联接(LOF)A', 'LOF'),
    entry('sh', '508006', '富国首创水务REIT', 'FJ'),
    entry('bj', '430047', '诺思兰德', 'GP-A'),
    // Out of scope: other markets, indices, off-exchange funds and warrants.
    entry('hk', '01211', '比亚迪股份', 'GP'),
    entry('us', 'byddy.ps', '比亚迪', 'GP'),
    entry('sh', '000688', '科创50', 'ZS'),
    entry('jj', '000128', '大成景安短融债券A', 'KJ'),
    entry('sh', '100001', '权证示例', 'QZ'),
  ]))
  assert.deepEqual(matches, [
    { symbol: 'SZ.002594', name: '比亚迪', kind: 'stock', market: 'cn' },
    { symbol: 'SH.600519', name: '贵州茅台', kind: 'stock', market: 'cn' },
    { symbol: 'SH.510300', name: '沪深300ETF华泰柏瑞', kind: 'etf', market: 'cn' },
    { symbol: 'SZ.159941', name: '纳指ETF广发', kind: 'etf', market: 'cn' },
    { symbol: 'SZ.160706', name: '嘉实沪深300ETF联接(LOF)A', kind: 'fund', market: 'cn' },
    { symbol: 'SH.508006', name: '富国首创水务REIT', kind: 'reit', market: 'cn' },
    { symbol: 'BJ.430047', name: '诺思兰德', kind: 'stock', market: 'cn' },
  ])
})

test('directory projection handles empty, duplicate, malformed and oversized payloads', () => {
  assert.deepEqual(parseInstrumentHints('v_hint="N";'), [])
  assert.deepEqual(parseInstrumentHints('v_hint=""'), [])
  assert.deepEqual(parseInstrumentHints(hint([
    entry('sz', '002594', '比亚迪', 'GP-A'),
    entry('sz', '002594', '比亚迪', 'GP-A'),
    'sz~00259~broken',
    'sz~ABCDEF~代码非法~py~GP-A',
    `sz~002595~${escape('名'.repeat(80))}~py~GP-A`,
  ])), [{ symbol: 'SZ.002594', name: '比亚迪', kind: 'stock', market: 'cn' }])
  assert.equal(parseInstrumentHints(hint(Array.from({ length: 30 }, (_, index) => entry('sh', String(600000 + index), `测试${index}`, 'GP-A')))).length, SEARCH_MAX_RESULTS)
  assert.deepEqual(parseInstrumentHints(hint([['sh', '600519', `${escape('贵州')}\n${escape('茅台')}`, 'py', 'GP-A'].join('~')])), [
    { symbol: 'SH.600519', name: '贵州茅台', kind: 'stock', market: 'cn' },
  ])
  for (const bad of ['', 'v_other="x"', 'v_hint="unterminated', 42, null, 'x'.repeat(262_145)]) {
    assert.throws(() => parseInstrumentHints(bad as any), { message: 'invalid-search-payload' })
  }
})

test('queries are normalised and bounded before they leave the host', () => {
  assert.equal(normalizeSearchQuery('  比亚  '), '比亚')
  assert.equal(normalizeSearchQuery('  比亚\t 迪  '), '比亚 迪')
  assert.equal(normalizeSearchQuery('e\u0301'), 'é')
  assert.equal(normalizeSearchQuery('byd'), 'byd')
  assert.equal(normalizeSearchQuery('300ETF'), '300ETF')
  for (const bad of ['', '   ', 'a'.repeat(SEARCH_MAX_QUERY + 1), '...', '\u0000', 7, null, undefined]) {
    assert.throws(() => normalizeSearchQuery(bad as any), { code: 'invalid-query' })
  }
  assert.equal(normalizeSearchQuery('x'.repeat(SEARCH_MAX_QUERY)), 'x'.repeat(SEARCH_MAX_QUERY))
})

test('search requests accept only the exact status or search envelopes', () => {
  assert.deepEqual(parseSearchRequest({ action: 'status' }), { action: 'status' })
  assert.deepEqual(parseSearchRequest({ action: 'search', query: ' 比亚 ' }), { action: 'search', query: '比亚', market: 'cn' })
  assert.deepEqual(parseSearchRequest({ action: 'search', query: 'apple', market: 'us' }), { action: 'search', query: 'apple', market: 'us' })
  assert.deepEqual(parseSearchRequest({ action: 'search', query: '00700', market: 'hk' }), { action: 'search', query: '00700', market: 'hk' })
  for (const bad of [null, [], {}, { action: 'other' }, { action: 'status', extra: 1 }, { action: 'search' }, { action: 'search', query: '比亚', extra: 1 }, { query: '比亚' },
    { action: 'search', query: 'apple', market: 'jp' }, { action: 'search', query: 'apple', market: 'US' }]) {
    assert.throws(() => parseSearchRequest(bad as any), { code: 'invalid-request' })
  }
  assert.throws(() => parseSearchRequest({ action: 'search', query: '' }), { code: 'invalid-query' })
})

test('a compound query becomes a short probe ladder instead of one literal string', () => {
  // The untouched query is always probe one, so anything that resolved before
  // still resolves the same way.
  assert.deepEqual(planSearch('比亚'), { query: '比亚', tokens: ['比亚'], probes: ['比亚'] })
  assert.deepEqual(planSearch('hldbetf'), { query: 'hldbetf', tokens: ['hldbetf'], probes: ['hldbetf'] })
  // A keyword / brand pair: the concatenation is tried before either word, and
  // the longest word is the last strict probe.
  assert.deepEqual(planSearch('红利低波动etf 易方达'), {
    query: '红利低波动etf 易方达',
    tokens: ['红利低波动', 'etf', '易方达'],
    probes: ['红利低波动etf 易方达', '红利低波动etf易方达', '红利低波动'],
    // The index says 红利低波动, the fund abbreviates to 红利低波.
    relax: '红利低波',
  })
  assert.deepEqual(planSearch('300ETF 华夏'), {
    query: '300ETF 华夏', tokens: ['300ETF', '华夏'], probes: ['300ETF 华夏', '300ETF华夏', '300ETF'],
  })
  // A class word says what an instrument is, not which one, so it is never a
  // probe of its own; a bare `ETF` query still sends what was typed.
  assert.deepEqual(planSearch('ETF'), { query: 'ETF', tokens: ['ETF'], probes: ['ETF'] })
  // A bare number is noise on its own (`300` → 600300 维维股份), so it is kept
  // for ranking but never probed without the word it belongs to.
  assert.deepEqual(planSearch('沪深300'), { query: '沪深300', tokens: ['沪深', '300'], probes: ['沪深300', '沪深'] })
  assert.deepEqual(planSearch('红利低波动'), { query: '红利低波动', tokens: ['红利低波动'], probes: ['红利低波动'], relax: '红利低波' })
  // The ladder is capped, so no query can turn into an unbounded fan-out.
  for (const query of ['一 二 三 四 五 六', 'a b c d e f', '红利低波动etf 易方达 华夏']) {
    const plan = planSearch(query)
    assert.ok(plan.probes.length <= SEARCH_MAX_PROBES - 1, query)
    assert.ok((plan.probes.length + (plan.relax ? 1 : 0)) <= SEARCH_MAX_PROBES, query)
    assert.equal(plan.probes[0], query)
  }
})

const candidate = (symbol: string, name: string, via: string, order: number) =>
  ({ match: { symbol, name, kind: 'etf' as const, market: 'cn' as const }, via, order })

test('ranking puts the row that answers the whole query first', () => {
  // The reported case: 红利低波动 only names the index, so the row that also
  // carries the typed brand has to outrank the one that matches the word alone.
  const ranked = rankCandidates([
    candidate('SH.563590', 'A500红利低波动ETF国寿', '红利低波动', 0),
    candidate('SH.512890', '红利低波ETF华泰柏瑞', '红利低波', 1),
    candidate('SH.563020', '红利低波ETF易方达', '红利低波', 2),
  ], planSearch('红利低波动etf 易方达'))
  assert.deepEqual(ranked.map(match => match.symbol), ['SH.563020', 'SH.563590', 'SH.512890'])
  // A code the user typed wins outright over a name that merely matches part of it.
  const byCode = rankCandidates([
    candidate('SH.600000', '浦发银行', '600520', 0),
    candidate('SH.600520', '文一科技', '600520', 1),
  ], planSearch('600520'))
  assert.deepEqual(byCode.map(match => match.symbol), ['SH.600520', 'SH.600000'])
  // Pinyin never appears in a CJK name, so those rows keep directory order.
  const byPinyin = rankCandidates([
    candidate('SH.563020', '红利低波ETF易方达', 'hldbetf', 0),
    candidate('SZ.159525', '红利低波ETF富国', 'hldbetf', 1),
  ], planSearch('hldbetf'))
  assert.deepEqual(byPinyin.map(match => match.symbol), ['SH.563020', 'SZ.159525'])
  // A code that merely contains the number is not the number: 600300 must not
  // outrank the ETF the user asked for.
  const byName = rankCandidates([
    candidate('SH.600300', '维维股份', '300', 0),
    candidate('SH.510300', '沪深300ETF华泰柏瑞', '沪深', 1),
  ], planSearch('沪深300'))
  assert.deepEqual(byName.map(match => match.symbol), ['SH.510300', 'SH.600300'])
  assert.deepEqual(rankCandidates([], planSearch('比亚')), [])
})

const directory = (table: Record<string, string[]>) => {
  const calls: string[] = []
  const provider = createInstrumentSearchProvider({
    fetchImpl: async (url: any) => {
      const query = new URL(String(url)).searchParams.get('q')!
      calls.push(query)
      const rows = table[query]
      return new Response(rows ? hint(rows) : 'v_hint="N";', { headers: { 'content-type': 'text/html; charset=utf-8' } })
    },
  })
  return { provider, calls }
}

test('provider walks the ladder and ranks the rows it collects', async () => {
  const { provider, calls } = directory({
    '红利低波动': [entry('sh', '563590', 'A500红利低波动ETF国寿', 'ETF'), entry('jj', '020602', '易方达中证红利低波动ETF联接发起式A', 'KJ')],
    '红利低波': [entry('sh', '512890', '红利低波ETF华泰柏瑞', 'ETF'), entry('sh', '563020', '红利低波ETF易方达', 'ETF')],
  })
  assert.deepEqual(await provider.search('红利低波动etf 易方达'), [
    // The off-exchange 联接 fund is still filtered out; the ETF it tracks is not.
    { symbol: 'SH.563020', name: '红利低波ETF易方达', kind: 'etf', market: 'cn' },
    // Next the row that matches the typed word exactly, then the near miss.
    { symbol: 'SH.563590', name: 'A500红利低波动ETF国寿', kind: 'etf', market: 'cn' },
    { symbol: 'SH.512890', name: '红利低波ETF华泰柏瑞', kind: 'etf', market: 'cn' },
  ])
  assert.deepEqual(calls, ['红利低波动etf 易方达', '红利低波动etf易方达', '红利低波动', '红利低波'])
})

test('provider stops probing once the query has answered or filled a page', async () => {
  // An exact name ends the ladder: the user typed exactly the instrument.
  const exact = directory({ '贵州茅台': [entry('sh', '600519', '贵州茅台', 'GP-A')] })
  assert.deepEqual((await exact.provider.search('贵州 茅台')).map(match => match.symbol), ['SH.600519'])
  assert.deepEqual(exact.calls, ['贵州 茅台', '贵州茅台'])
  // A full page ends it too, even though more probes were planned.
  const full = directory({
    '红利': Array.from({ length: 12 }, (_, index) => entry('sh', String(512890 + index), `红利低波ETF${index}`, 'ETF')),
  })
  assert.equal((await full.provider.search('红利 etf')).length, SEARCH_MAX_RESULTS)
  assert.deepEqual(full.calls, ['红利 etf', '红利etf', '红利'])
  // A single-token query that already answers stays a one-request lookup.
  const single = directory({ '比亚': [entry('sz', '002594', '比亚迪', 'GP-A')] })
  await single.provider.search('比亚')
  assert.deepEqual(single.calls, ['比亚'])
})

test('provider keeps the strict results when a later probe fails', async () => {
  let call = 0
  const provider = createInstrumentSearchProvider({
    fetchImpl: async () => {
      call++
      if (call === 1) return new Response(hint([entry('sh', '563590', 'A500红利低波动ETF国寿', 'ETF')]), { headers: { 'content-type': 'text/plain' } })
      throw new Error('upstream down')
    },
  })
  assert.deepEqual(await provider.search('红利低波动etf 易方达'), [
    { symbol: 'SH.563590', name: 'A500红利低波动ETF国寿', kind: 'etf', market: 'cn' },
  ])
  // The typed query's own failure is still an error, not an empty list.
  const broken = createInstrumentSearchProvider({
    fetchImpl: async () => { throw new Error('upstream down') },
  })
  await assert.rejects(() => broken.search('红利低波动etf 易方达'), { message: 'upstream down' })
})

test('matches are re-projected so an adapter cannot leak extra fields or a bad identity', () => {
  assert.deepEqual(normalizeMatch({ symbol: 'SZ.002594', name: '比亚迪', kind: 'stock', price: 999, raw: 'x' }), { symbol: 'SZ.002594', name: '比亚迪', kind: 'stock', market: 'cn' })
  // A provider compiled before the market field existed is still read as A-share.
  assert.deepEqual(normalizeMatch({ symbol: 'SZ.002594', name: '比亚迪', kind: 'stock', market: 'cn' }), { symbol: 'SZ.002594', name: '比亚迪', kind: 'stock', market: 'cn' })
  assert.deepEqual(normalizeMatch({ symbol: 'US.AAPL', name: 'Apple', kind: 'stock', market: 'us', code: 'AAPL.OQ' }), { symbol: 'US.AAPL', name: 'Apple', kind: 'stock', market: 'us', code: 'AAPL.OQ' })
  assert.deepEqual(normalizeMatch({ symbol: 'us.brk.a', name: 'Berkshire', kind: 'stock', market: 'us', code: 'brk.a.n' }), { symbol: 'US.BRK.A', name: 'Berkshire', kind: 'stock', market: 'us', code: 'BRK.A.N' })
  for (const bad of [null, { symbol: '002594', name: '比亚迪', kind: 'stock', market: 'cn' }, { symbol: 'SZ.002594', name: '', kind: 'stock', market: 'cn' }, { symbol: 'SZ.002594', name: '比亚迪', kind: 'index', market: 'cn' }, 'x',
    { symbol: 'US.AAPL', name: 'Apple', kind: 'stock', market: 'us', code: 'MSFT.OQ' },
    { symbol: 'US.AAPL', name: 'Apple', kind: 'stock', market: 'us', code: 'AAPL.XX' },
    { symbol: 'US.AAPL', name: 'Apple', kind: 'stock', market: 'eu' }]) {
    assert.throws(() => normalizeMatch(bad as any), { message: 'invalid-match' })
  }
})

test('provider calls the fixed directory endpoint with a bounded body and projects matches', async () => {
  const calls: any[] = []
  const payload = hint([
    entry('sz', '002594', '比亚迪', 'GP-A'),
    entry('sh', '510300', '沪深300ETF华泰柏瑞', 'ETF'),
    entry('hk', '01211', '比亚迪股份', 'GP'),
  ])
  const provider = createInstrumentSearchProvider({
    fetchImpl: async (url: any, init: any) => {
      calls.push({ url: String(url), init })
      return new Response(payload, { headers: { 'content-type': 'text/html; charset=utf-8' } })
    },
  })
  assert.equal(provider.name, SEARCH_SOURCE_NAME)
  const matches = await provider.search('比亚')
  assert.deepEqual(matches, [
    { symbol: 'SZ.002594', name: '比亚迪', kind: 'stock', market: 'cn' },
    { symbol: 'SH.510300', name: '沪深300ETF华泰柏瑞', kind: 'etf', market: 'cn' },
  ])
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, `${SEARCH_URL}?q=${encodeURIComponent('比亚')}&t=all`)
  assert.equal(calls[0].init.method, 'GET')
  assert.equal(calls[0].init.redirect, 'error')
  assert.equal(calls[0].init.headers.accept, 'text/plain')
  assert.ok(calls[0].init.signal instanceof AbortSignal)
  assert.throws(() => createInstrumentSearchProvider({ fetchImpl: null as any }), { message: 'search fetch unavailable' })
  assert.throws(() => createInstrumentSearchProvider({ fetchImpl: async () => new Response(''), timeoutMs: 0 }), { message: 'invalid search timeout' })
})

test('provider rejects upstream failures without exposing payloads or errors', async () => {
  const provider = (response: any) => createInstrumentSearchProvider({ fetchImpl: async () => response })
  await assert.rejects(() => provider(new Response('denied', { status: 403 })).search('比亚'), { message: 'http 403' })
  await assert.rejects(() => provider(new Response('x', { headers: { 'content-type': 'application/json' } })).search('比亚'), { message: 'unexpected content type' })
  await assert.rejects(() => provider(new Response('x', { headers: { 'content-length': String(SEARCH_MAX_BYTES + 1) } })).search('比亚'), { message: 'response too large' })
  await assert.rejects(() => provider(new Response('x'.repeat(SEARCH_MAX_BYTES + 1), { headers: { 'content-type': 'text/plain' } })).search('比亚'), { message: 'response too large' })
  await assert.rejects(() => provider(new Response('not a hint', { headers: { 'content-type': 'text/plain' } })).search('比亚'), { message: 'invalid-search-payload' })
  await assert.rejects(() => provider(new Response('', { status: 200 })).search('比亚'), { message: 'invalid-search-payload' })
  await assert.rejects(() => provider(new Response('v_hint="N"', { headers: { 'content-type': 'text/html' } })).search('   '), { code: 'invalid-query' })
})

test('provider honours caller cancellation', async () => {
  const abort = new AbortController()
  const provider = createInstrumentSearchProvider({
    fetchImpl: async (_url: any, init: any) => new Promise<Response>((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true })
    }),
  })
  const pending = provider.search('比亚', { signal: abort.signal })
  abort.abort()
  await assert.rejects(() => pending, { name: 'AbortError' })
  const cancelled = new AbortController()
  cancelled.abort()
  await assert.rejects(() => provider.search('比亚', { signal: cancelled.signal }), { message: 'cancelled' })
})

const OWNER = { principal: { kind: 'owner' } }
const results = [{ symbol: 'SZ.002594', name: '比亚迪', kind: 'stock', market: 'cn', price: 1 }]
// The handler returns a discriminated union; tests assert on both branches.
const invoke = async (handler: any, payload: any, signal?: any, peer: any = OWNER): Promise<any> =>
  handler(SEARCH_RPC_ENDPOINT, payload, signal, peer)

test('search handler is owner-only and endpoint-exact', async () => {
  const handler = createSearchHandler({ enabled: () => true, provider: { name: 'test', search: async () => [] as any } })
  assert.equal((await invoke(handler, { action: 'status' }, undefined, { principal: { kind: 'guest' } })).error.code, 'finance/forbidden')
  assert.equal((await handler('dsh-x-finance.other', { action: 'status' }, undefined, OWNER) as any).error.code, 'finance/not-found')
  assert.equal((await invoke(handler, { action: 'nope' })).error.code, 'finance/invalid-query')
  const abort = new AbortController()
  abort.abort()
  assert.equal((await invoke(handler, { action: 'status' }, abort.signal)).error.code, 'finance/cancelled')
})

test('search handler never fetches while the free source is off', async () => {
  let searched = 0
  const handler = createSearchHandler({ enabled: () => false, provider: { name: 'test', search: async () => { searched++; return results as any } } })
  const status = await invoke(handler, { action: 'status' })
  const search = await invoke(handler, { action: 'search', query: '比亚' })
  for (const result of [status, search]) {
    assert.equal(result.ok, true)
    assert.equal(result.value.status, 'disabled')
    assert.equal(result.value.enabled, false)
    assert.equal(result.value.available, false)
    assert.equal(result.value.source, null)
    assert.deepEqual(result.value.results, [])
  }
  assert.equal(searched, 0)
})

test('search handler projects allowlisted fields only and maps provider failure', async () => {
  let seen: any
  const handler = createSearchHandler({
    enabled: async () => true,
    provider: { name: 'test-directory', search: async (query: any) => { seen = query; return results as any } },
  })
  const status = await invoke(handler, { action: 'status' })
  assert.deepEqual(status.value, { status: 'ready', enabled: true, available: true, source: SEARCH_SOURCE_NAME, results: [] })
  const search = await invoke(handler, { action: 'search', query: ' 比亚 ' })
  assert.equal(seen, '比亚')
  assert.deepEqual(search.value, { status: 'ready', enabled: true, available: true, source: 'test-directory', results: [{ symbol: 'SZ.002594', name: '比亚迪', kind: 'stock', market: 'cn' }] })
  const failing = createSearchHandler({ enabled: () => true, provider: { name: 'test', search: async () => { throw new Error('upstream secret') } } })
  const failure = await invoke(failing, { action: 'search', query: '比亚' })
  assert.deepEqual(failure, { ok: false, error: { code: 'finance/search-unavailable', message: '名称搜索暂不可用，请稍后重试。', details: {} } })
  const missing = createSearchHandler({ enabled: () => true })
  assert.equal((await invoke(missing, { action: 'status' })).value.available, false)
  assert.equal((await invoke(missing, { action: 'search', query: '比亚' })).error.code, 'finance/search-unavailable')
})

test('exact search route echoes generic RPC envelopes and rejects malformed requests', async () => {
  const route = createSearchRoute({ enabled: () => true, provider: { name: 'test', search: async () => results as any } })
  assert.equal(route.path, `/api/${SEARCH_RPC_ENDPOINT}`)
  assert.deepEqual(route.methods, ['POST'])
  const request = (value: any, headers: any = {}) => new Request(`http://host${route.path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers },
    body: typeof value === 'string' ? value : JSON.stringify(value),
  })
  const message = { type: 'client-request', rpcId: 'r1', method: SEARCH_RPC_ENDPOINT, payload: { action: 'search', query: '比亚' } }
  const response = await route.fetch(request(message)), body = await response.json() as any
  assert.equal(response.status, 200)
  assert.equal(body.type, 'server-response')
  assert.equal(body.rpcId, 'r1')
  assert.equal(body.result.value.results[0].symbol, 'SZ.002594')
  assert.equal(JSON.stringify(body).includes('price'), false)
  for (const input of [null, [], {}, { ...message, method: 'other' }, { ...message, rpcId: 4 }, { ...message, extra: true }, '{broken'] as const) {
    assert.equal((await route.fetch(request(input))).status, 400)
  }
  assert.equal((await route.fetch(request(message, { 'content-type': 'text/plain' }))).status, 415)
  assert.equal((await route.fetch(request('x'.repeat(8193)))).status, 413)
})


test('US directory entries resolve to a US identity plus a venue-qualified code', () => {
  const matches = parseUsInstrumentHints(hint([
    entry('us', 'aapl.oq', 'Apple', 'GP'),
    entry('us', 'brk.a.n', 'Berkshire Hathaway', 'GP'),
    entry('us', 'spy.am', 'SPDR S&P 500 ETF', 'GP'),
    entry('us', 'babaf.ps', 'Alibaba', 'GP'),
    // Out of scope: unknown venues, a missing venue, other markets and indices.
    entry('us', 'bad.zz', 'Unknown venue', 'GP'),
    entry('us', 'tsla', 'No venue', 'GP'),
    entry('hk', '01211', '比亚迪股份', 'GP'),
    entry('us', 'some.zs', 'Index', 'ZS'),
    entry('sh', '600519', '贵州茅台', 'GP-A'),
  ]))
  assert.deepEqual(matches, [
    { symbol: 'US.AAPL', name: 'Apple', kind: 'stock', market: 'us', code: 'AAPL.OQ' },
    { symbol: 'US.BRK.A', name: 'Berkshire Hathaway', kind: 'stock', market: 'us', code: 'BRK.A.N' },
    { symbol: 'US.SPY', name: 'SPDR S&P 500 ETF', kind: 'stock', market: 'us', code: 'SPY.AM' },
    { symbol: 'US.BABAF', name: 'Alibaba', kind: 'stock', market: 'us', code: 'BABAF.PS' },
  ])
  // The same malformed/oversized payload rules apply to both markets.
  assert.deepEqual(parseUsInstrumentHints('v_hint="N";'), [])
  for (const bad of ['', 'v_other="x"', 'not a hint', 42, null]) {
    assert.throws(() => parseUsInstrumentHints(bad as any), { message: 'invalid-search-payload' })
  }
})

test('a US query reuses the same host but keeps only US rows', async () => {
  const calls: any[] = []
  const payload = hint([
    entry('sh', '600519', '贵州茅台', 'GP-A'),
    entry('us', 'aapl.oq', 'Apple', 'GP'),
  ])
  const provider = createInstrumentSearchProvider({
    fetchImpl: async (url: any) => {
      calls.push(String(url))
      return new Response(payload, { headers: { 'content-type': 'text/html; charset=utf-8' } })
    },
  })
  assert.deepEqual(await provider.search('apple', { market: 'us' }), [
    { symbol: 'US.AAPL', name: 'Apple', kind: 'stock', market: 'us', code: 'AAPL.OQ' },
  ])
  assert.deepEqual(await provider.search('茅台'), [
    { symbol: 'SH.600519', name: '贵州茅台', kind: 'stock', market: 'cn' },
  ])
  assert.deepEqual(calls, [`${SEARCH_URL}?q=apple&t=all`, `${SEARCH_URL}?q=${encodeURIComponent('茅台')}&t=all`])
})

test('a Hong Kong query reuses the same host but keeps only HK rows', async () => {
  const calls: any[] = []
  const payload = hint([
    entry('sh', '600519', '贵州茅台', 'GP-A'),
    entry('hk', '00700', '腾讯控股', 'GP'),
    entry('hk', '80700', '腾讯控股r', 'GP'),
    entry('hk', '14203', '盈富麦银七五购A', 'QZ'),
  ])
  const provider = createInstrumentSearchProvider({
    fetchImpl: async (url: any) => {
      calls.push(String(url))
      return new Response(payload, { headers: { 'content-type': 'text/html; charset=utf-8' } })
    },
  })
  assert.deepEqual(await provider.search('腾讯', { market: 'hk' }), [
    { symbol: 'HK.00700', name: '腾讯控股', kind: 'stock', market: 'hk' },
  ])
  assert.deepEqual(calls, [`${SEARCH_URL}?q=${encodeURIComponent('腾讯')}&t=all`])
  // A-share and US rows are not advertised under the HK board.
  assert.deepEqual(await provider.search('腾讯'), [
    { symbol: 'SH.600519', name: '贵州茅台', kind: 'stock', market: 'cn' },
  ])
})

test('Hong Kong matches are re-validated like the other boards', () => {
  assert.deepEqual(normalizeMatch({ symbol: 'HK.00700', name: '腾讯控股', kind: 'stock', market: 'hk' }),
    { symbol: 'HK.00700', name: '腾讯控股', kind: 'stock', market: 'hk' })
  assert.deepEqual(normalizeMatch({ symbol: 'hk.02800', name: '盈富基金', kind: 'stock', market: 'hk' }),
    { symbol: 'HK.02800', name: '盈富基金', kind: 'stock', market: 'hk' })
  for (const bad of [
    // A Hang Seng index is letters and belongs to the index route, not a listing.
    { symbol: 'HK.HSI', name: '恒生指数', kind: 'stock', market: 'hk' },
    { symbol: 'HK.0070', name: '短代码', kind: 'stock', market: 'hk' },
    // The HK envelope carries no venue code; a stray one is a contract error.
    { symbol: 'HK.00700', name: '腾讯控股', kind: 'stock', market: 'hk', code: '00700' },
  ]) {
    assert.throws(() => normalizeMatch(bad as any), { message: 'invalid-match' })
  }
  const seen: any[] = []
  const handler = createSearchHandler({
    enabled: () => true,
    provider: {
      name: 'test-directory',
      async search(query: any, options: any) {
        seen.push([query, options?.market])
        return [{ symbol: 'HK.00700', name: '腾讯控股', kind: 'stock', market: 'hk' }] as any
      },
    },
  })
  return invoke(handler, { action: 'search', query: '腾讯', market: 'hk' }).then((result: any) => {
    assert.deepEqual(seen, [['腾讯', 'hk']])
    assert.deepEqual(result.value.results, [{ symbol: 'HK.00700', name: '腾讯控股', kind: 'stock', market: 'hk' }])
  })
})

test('the search handler forwards the requested market and re-validates US identities', async () => {
  const seen: any[] = []
  const handler = createSearchHandler({
    enabled: () => true,
    provider: {
      name: 'test-directory',
      async search(query: any, options: any) {
        seen.push([query, options?.market])
        return [{ symbol: 'US.AAPL', name: 'Apple', kind: 'stock', market: 'us', code: 'AAPL.OQ' }] as any
      },
    },
  })
  const result = await invoke(handler, { action: 'search', query: 'apple', market: 'us' })
  assert.deepEqual(seen, [['apple', 'us']])
  assert.deepEqual(result.value.results, [{ symbol: 'US.AAPL', name: 'Apple', kind: 'stock', market: 'us', code: 'AAPL.OQ' }])
  const legacy = await invoke(handler, { action: 'search', query: 'apple' })
  assert.deepEqual(seen.at(-1), ['apple', 'cn'])
  assert.equal(legacy.value.results[0].market, 'us')
})
