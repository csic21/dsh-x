import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { apply } from '../src/index.ts'
import { SEARCH_RPC_ENDPOINT } from '../src/instrument-search.ts'
import { MARKET_PREFERENCE_ENDPOINT } from '../src/market.ts'

const NAME = '贵州茅台'
function payload() {
  const fields = Array.from({ length: 50 }, () => '')
  Object.assign(fields, {
    0: '1', 1: NAME, 2: '600519', 3: '1329.00', 4: '1312.97', 5: '1311.57',
    6: '38502', 29: '', 30: '20261016161447', 31: '16.03', 32: '1.22', 33: '1329.88', 34: '1301.68',
  })
  return `v_sh600519="${fields.join('~')}";`
}

function gbk(text: string) {
  const start = text.indexOf(NAME)
  return Buffer.concat([
    Buffer.from(text.slice(0, start), 'ascii'),
    Buffer.from('b9f3d6ddc3a9cca8', 'hex'),
    Buffer.from(text.slice(start + NAME.length), 'ascii'),
  ])
}

function harness(dir = '/tmp') {
  const routes: any[] = []
  const ctx: any = {
    tools: { register() {} },
    inject(_deps: any, callback: any) {
      callback({
        connection: { fetch: { register: (route: any) => routes.push(route) } },
        profileContext: { dir },
      })
    },
  }
  return { ctx, routes }
}

async function callEndpoint(routes: any[], endpoint: string, payload: any) {
  const route = routes.find(item => item.path === `/api/${endpoint}`)
  const request = new Request(`http://localhost/api/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: 'r1', method: endpoint, payload }),
  })
  return (await (await route.fetch(request)).json()) as any
}

const escapeHintName = (text: string) => [...text]
  .map(character => character.codePointAt(0)! > 127 ? `\\u${character.codePointAt(0)!.toString(16).padStart(4, '0')}` : character)
  .join('')

/** The stock page and the fixed bottom bar both read quotes from this route. */
async function call(routes: any[], symbols: string[] = ['SH.600519']) {
  const endpoint = 'dsh-x-finance.market'
  const route = routes.find(item => item.path === `/api/${endpoint}`)
  const request = new Request(`http://localhost/api/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request', rpcId: 'r1', method: endpoint, payload: { kind: 'quotes', symbols },
    }),
  })
  return (await (await route.fetch(request)).json()) as any
}

test('defaults to no provider: the route reports unconfigured and never fetches', async () => {
  const original = globalThis.fetch
  globalThis.fetch = () => assert.fail('must not fetch without opt-in')
  try {
    const { ctx, routes } = harness()
    apply(ctx)
    const body = await call(routes)
    assert.equal(body.result.ok, true)
    assert.deepEqual(body.result.value, { status: 'unconfigured', source: null })
  } finally {
    globalThis.fetch = original
  }
})

test('the deprecated freeSource flag still forces the one shared A-share source on', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async (url: any) => {
    assert.equal(String(url), 'https://qt.gtimg.cn/q=sh600519')
    return new Response(gbk(payload()), { headers: { 'content-type': 'text/html; charset=GBK' } })
  }
  try {
    const { ctx, routes } = harness()
    apply(ctx, { freeSource: true })
    const body = await call(routes)
    assert.equal(body.result.ok, true)
    assert.equal(body.result.value.source, '腾讯行情 (unofficial)')
    assert.deepEqual(body.result.value.quotes[0], {
      symbol: 'SH.600519',
      status: 'available',
      name: NAME,
      price: 1329,
      changePercent: 1.22,
      quotedAt: '2026-10-16T16:14:47+08:00',
      fetchedAt: body.result.value.quotes[0].fetchedAt,
      marketStatus: 'unknown',
    })
  } finally {
    globalThis.fetch = original
  }
})

test('name search stays disabled and never fetches without a free-source opt-in', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-x-finance-search-'))
  const original = globalThis.fetch
  globalThis.fetch = () => assert.fail('must not fetch without opt-in')
  try {
    const { ctx, routes } = harness(dir)
    apply(ctx)
    const status = await callEndpoint(routes, SEARCH_RPC_ENDPOINT, { action: 'status' })
    assert.deepEqual(status.result.value, { status: 'disabled', enabled: false, available: false, source: null, results: [] })
    const search = await callEndpoint(routes, SEARCH_RPC_ENDPOINT, { action: 'search', query: '比亚' })
    assert.equal(search.result.value.status, 'disabled')
    assert.deepEqual(search.result.value.results, [])
  } finally {
    globalThis.fetch = original
    await rm(dir, { recursive: true, force: true })
  }
})

test('freeSource alone enables the directory and projects A-share and ETF matches', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-x-finance-search-'))
  const original = globalThis.fetch
  const names = ['比亚迪', '沪深300ETF华泰柏瑞']
  globalThis.fetch = async (url: any) => {
    assert.equal(String(url), `https://smartbox.gtimg.cn/s3/?q=${encodeURIComponent('比亚')}&t=all`)
    return new Response(`v_hint="sz~002594~${escapeHintName(names[0]!)}~byd~GP-A^sh~510300~${escapeHintName(names[1]!)}~hs300etf~ETF^hk~01211~${escapeHintName('比亚迪股份')}~bydgf~GP"`, { headers: { 'content-type': 'text/html; charset=utf-8' } })
  }
  try {
    const { ctx, routes } = harness(dir)
    apply(ctx, { freeSource: true })
    const status = await callEndpoint(routes, SEARCH_RPC_ENDPOINT, { action: 'status' })
    assert.deepEqual(status.result.value, { status: 'ready', enabled: true, available: true, source: 'smartbox.gtimg.cn (unofficial)', results: [] })
    const search = await callEndpoint(routes, SEARCH_RPC_ENDPOINT, { action: 'search', query: '比亚' })
    assert.deepEqual(search.result.value.results, [
      { symbol: 'SZ.002594', name: names[0], kind: 'stock' },
      { symbol: 'SH.510300', name: names[1], kind: 'etf' },
    ])
  } finally {
    globalThis.fetch = original
    await rm(dir, { recursive: true, force: true })
  }
})

test('the market free-source switch also gates the directory and stops requests when off', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-x-finance-search-'))
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => { calls++; return new Response('v_hint="N";', { headers: { 'content-type': 'text/html' } }) }
  try {
    const { ctx, routes } = harness(dir)
    apply(ctx)
    assert.equal((await callEndpoint(routes, SEARCH_RPC_ENDPOINT, { action: 'status' })).result.value.status, 'disabled')
    const enabling = await callEndpoint(routes, MARKET_PREFERENCE_ENDPOINT, { action: 'set', enabled: true })
    assert.equal(enabling.result.value.enabled, true)
    assert.equal((await callEndpoint(routes, SEARCH_RPC_ENDPOINT, { action: 'status' })).result.value.status, 'ready')
    assert.equal((await callEndpoint(routes, SEARCH_RPC_ENDPOINT, { action: 'search', query: 'xx' })).result.value.status, 'ready')
    assert.equal(calls, 1)
    await callEndpoint(routes, MARKET_PREFERENCE_ENDPOINT, { action: 'set', enabled: false })
    assert.equal((await callEndpoint(routes, SEARCH_RPC_ENDPOINT, { action: 'search', query: 'xx' })).result.value.status, 'disabled')
    assert.equal(calls, 1, 'a disabled directory must not keep fetching')
  } finally {
    globalThis.fetch = original
    await rm(dir, { recursive: true, force: true })
  }
})

test('the one market switch turns the page and bar quotes on and off without a restart', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-x-finance-source-'))
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async (url: any) => {
    calls++
    assert.equal(String(url), 'https://qt.gtimg.cn/q=sh600519')
    return new Response(gbk(payload()), { headers: { 'content-type': 'text/html; charset=GBK' } })
  }
  try {
    const { ctx, routes } = harness(dir)
    apply(ctx)
    // Off by default: the page and the fixed bar share this one switch, and an
    // off switch must not produce a single request.
    assert.deepEqual((await call(routes)).result.value, { status: 'unconfigured', source: null })
    assert.equal(calls, 0)
    await callEndpoint(routes, MARKET_PREFERENCE_ENDPOINT, { action: 'set', enabled: true })
    const body = await call(routes)
    assert.equal(body.result.value.source, '腾讯行情 (unofficial)')
    assert.deepEqual(body.result.value.quotes.map((quote: any) => [quote.symbol, quote.price, quote.changePercent, quote.quotedAt]), [['SH.600519', 1329, 1.22, '2026-10-16T16:14:47+08:00']])
    assert.equal(calls, 1)
    await callEndpoint(routes, MARKET_PREFERENCE_ENDPOINT, { action: 'set', enabled: false })
    assert.deepEqual((await call(routes)).result.value, { status: 'unconfigured', source: null })
    assert.equal(calls, 1, 'a disabled source must not keep fetching')
  } finally {
    globalThis.fetch = original
    await rm(dir, { recursive: true, force: true })
  }
})

test('a symbol the source does not answer for is unavailable, never a fabricated price', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-x-finance-source-'))
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response('v_pv_none_match="1";', { headers: { 'content-type': 'text/html; charset=GBK' } })
  try {
    const { ctx, routes } = harness(dir)
    apply(ctx, { marketSource: true })
    const body = await call(routes, ['SH.600519', 'SZ.000001'])
    assert.deepEqual(body.result.value.quotes.map((quote: any) => [quote.symbol, quote.status, quote.price]), [['SH.600519', 'unavailable', null], ['SZ.000001', 'unavailable', null]])
    assert.equal(body.result.value.source, '腾讯行情 (unofficial)')
  } finally {
    globalThis.fetch = original
    await rm(dir, { recursive: true, force: true })
  }
})
