import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SEARCH_MAX_QUERY, SEARCH_MAX_RESULTS, SEARCH_RPC_ENDPOINT, SEARCH_SOURCE_NAME,
  normalizeMatch, normalizeSearchQuery, parseInstrumentHints, parseSearchRequest,
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
    { symbol: 'SZ.002594', name: '比亚迪', kind: 'stock' },
    { symbol: 'SH.600519', name: '贵州茅台', kind: 'stock' },
    { symbol: 'SH.510300', name: '沪深300ETF华泰柏瑞', kind: 'etf' },
    { symbol: 'SZ.159941', name: '纳指ETF广发', kind: 'etf' },
    { symbol: 'SZ.160706', name: '嘉实沪深300ETF联接(LOF)A', kind: 'fund' },
    { symbol: 'SH.508006', name: '富国首创水务REIT', kind: 'reit' },
    { symbol: 'BJ.430047', name: '诺思兰德', kind: 'stock' },
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
  ])), [{ symbol: 'SZ.002594', name: '比亚迪', kind: 'stock' }])
  assert.equal(parseInstrumentHints(hint(Array.from({ length: 30 }, (_, index) => entry('sh', String(600000 + index), `测试${index}`, 'GP-A')))).length, SEARCH_MAX_RESULTS)
  assert.deepEqual(parseInstrumentHints(hint([['sh', '600519', `${escape('贵州')}\n${escape('茅台')}`, 'py', 'GP-A'].join('~')])), [
    { symbol: 'SH.600519', name: '贵州茅台', kind: 'stock' },
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
  assert.deepEqual(parseSearchRequest({ action: 'search', query: ' 比亚 ' }), { action: 'search', query: '比亚' })
  for (const bad of [null, [], {}, { action: 'other' }, { action: 'status', extra: 1 }, { action: 'search' }, { action: 'search', query: '比亚', extra: 1 }, { query: '比亚' }]) {
    assert.throws(() => parseSearchRequest(bad as any), { code: 'invalid-request' })
  }
  assert.throws(() => parseSearchRequest({ action: 'search', query: '' }), { code: 'invalid-query' })
})

test('matches are re-projected so an adapter cannot leak extra fields or a bad identity', () => {
  assert.deepEqual(normalizeMatch({ symbol: 'SZ.002594', name: '比亚迪', kind: 'stock', price: 999, raw: 'x' }), { symbol: 'SZ.002594', name: '比亚迪', kind: 'stock' })
  for (const bad of [null, { symbol: '002594', name: '比亚迪', kind: 'stock' }, { symbol: 'SZ.002594', name: '', kind: 'stock' }, { symbol: 'SZ.002594', name: '比亚迪', kind: 'index' }, 'x']) {
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
    { symbol: 'SZ.002594', name: '比亚迪', kind: 'stock' },
    { symbol: 'SH.510300', name: '沪深300ETF华泰柏瑞', kind: 'etf' },
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
const results = [{ symbol: 'SZ.002594', name: '比亚迪', kind: 'stock', price: 1 }]
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
  assert.deepEqual(search.value, { status: 'ready', enabled: true, available: true, source: 'test-directory', results: [{ symbol: 'SZ.002594', name: '比亚迪', kind: 'stock' }] })
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
