import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { zh } from '../src/client/locales.ts'
import { createFormatters } from '../src/client/format.ts'
import { SEARCH_RPC_ENDPOINT } from '../src/instrument-search.ts'
import { MARKET_PREFERENCE_ENDPOINT } from '../src/market.ts'
import { HK_ENDPOINT } from '../src/hk-market.ts'

// jsdom interaction test for the real published components. Every row and
// quote below is an explicit offline fixture; no assertion claims a live price.
const root = new URL('..', import.meta.url).pathname
const bundle = await build({
  stdin: {
    contents: [
      "export { InstrumentLookup } from './src/client/SearchBox.tsx'",
      "export { HkDetail } from './src/client/hk/HkView.tsx'",
    ].join('\n'),
    resolveDir: root,
    loader: 'tsx',
  },
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'],
})

const BYD = { symbol: 'SZ.002594', name: '比亚迪', kind: 'stock', market: 'cn' }
const TENCENT = { symbol: 'HK.00700', name: '腾讯控股', kind: 'stock', market: 'hk' }
const TRACKER = { symbol: 'HK.02800', name: '盈富基金', kind: 'stock', market: 'hk' }
const t = (key: any, values?: any) => String(zh[key as keyof typeof zh] ?? key).replace(/\{(\w+)\}/g, (_m, name) => values?.[name] ?? `{${name}}`)

const QUOTE = {
  symbol: 'HK.00700', name: '腾讯控股', price: 428, pricePrecision: 3,
  change: 26.4, changePercent: 6.57, open: 413.8, high: 429, low: 410.2, previousClose: 401.6,
  volume: 27_441_498, amount: 11_571_596_893.746, currency: 'HKD',
  quotedAt: '2026-11-05T03:07:55.000Z', fetchedAt: '2026-11-05T03:30:00.000Z',
  marketStatus: 'unknown', source: '腾讯港股 (unofficial)',
}

/** Mounts one component with a host-shaped RPC stub and returns DOM helpers. */
async function harness(component: string, props: (helpers: any) => any, handler: (endpoint: string, payload: any) => any) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
  const original: any = { window: (globalThis as any).window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT }
  ;(globalThis as any).window = dom.window
  globalThis.document = dom.window.document
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  const calls: any[] = []
  const picked: any[] = []
  const rpc = {
    call: async (_channel: any, endpoint: any, payload: any, signal: any) => {
      calls.push(JSON.parse(JSON.stringify({ endpoint, payload })))
      if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
      return handler(endpoint, payload)
    },
  }
  const module: any = { exports: {} }
  vm.runInNewContext(bundle.outputFiles[0].text, {
    module, exports: module.exports, require: createRequire(import.meta.url), console,
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator, setTimeout, clearTimeout, AbortController, AbortSignal,
  })
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(dom.window.document.getElementById('root')!)
  const helpers = {
    rpc, t, calls, picked,
    onPick: (match: any) => picked.push(JSON.parse(JSON.stringify(match))),
    format: createFormatters(() => 'zh'),
  }
  await act(async () => root.render(React.createElement(module.exports[component], { ...helpers, ...props(helpers) })))
  const flush = async (ms = 10) => { await act(async () => { await new Promise(resolve => setTimeout(resolve, ms)) }) }
  await flush(20)
  return {
    dom, document: dom.window.document, calls, picked, flush,
    text: () => dom.window.document.body.textContent ?? '',
    input: () => dom.window.document.querySelector<HTMLElement & HTMLInputElement>('input[type="search"]'),
    async type(value: string) {
      const element = dom.window.document.querySelector<HTMLElement & HTMLInputElement>('input[type="search"]')!
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(element, value)
      await act(async () => element.dispatchEvent(new dom.window.Event('input', { bubbles: true })))
      await flush(10)
    },
    async chooseMarket(value: string) {
      const select = dom.window.document.querySelector('select.dxs-lookup-market') as any
      assert.ok(select, 'expected a market selector')
      Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value')!.set!.call(select, value)
      await act(async () => select.dispatchEvent(new dom.window.Event('change', { bubbles: true })))
      await flush(10)
    },
    options: () => [...dom.window.document.querySelectorAll('[role="option"]')].map(element => element.textContent),
    async close() {
      await act(async () => root.unmount())
      dom.window.close()
      for (const [name, value] of Object.entries(original)) { if (value === undefined) delete (globalThis as any)[name as keyof typeof globalThis]; else (globalThis as any)[name as keyof typeof globalThis] = value }
    },
  }
}

test('the page lookup switches to the Hong Kong directory and keeps A-share rows out of it', async () => {
  const h = await harness('InstrumentLookup', () => ({ delay: 0 }), (endpoint, payload) => {
    if (endpoint === MARKET_PREFERENCE_ENDPOINT) return { ok: true, value: { enabled: true, forced: false } }
    assert.equal(endpoint, SEARCH_RPC_ENDPOINT)
    if (payload?.action === 'status') return { ok: true, value: { status: 'ready', enabled: true, available: true, source: 'test', results: [] } }
    // The Host answers for the requested market; this fixture keeps every kind
    // of row in one payload to prove the browser filters by market too.
    return { ok: true, value: { status: 'ready', enabled: true, available: true, source: 'test', results: [BYD, TENCENT, TRACKER] } }
  })
  try {
    const select = h.document.querySelector('select.dxs-lookup-market') as any
    assert.ok(select, 'the pill exposes a market choice')
    assert.deepEqual([...select.options].map((option: any) => option.value), ['cn', 'hk', 'us'])
    assert.deepEqual([...select.options].map((option: any) => option.textContent), ['A股', '港股', '美股'])

    await h.type('腾')
    assert.deepEqual(h.calls.at(-1).payload, { action: 'search', query: '腾' })
    assert.deepEqual(h.options(), ['比亚迪SZ.002594股票'])

    await h.chooseMarket('hk')
    // A non-default market travels as an explicit third field.
    assert.deepEqual(h.calls.at(-1).payload, { action: 'search', query: '腾', market: 'hk' })
    assert.deepEqual(h.options(), ['腾讯控股HK.00700港股', '盈富基金HK.02800港股'])
    assert.equal(h.input()!.getAttribute('placeholder'), '搜索港股名称或代码，如 腾讯、00700')

    await act(async () => h.document.querySelector('[role="option"]')!.dispatchEvent(new h.dom.window.MouseEvent('click', { bubbles: true })))
    assert.deepEqual(h.picked, [TENCENT])
    assert.equal(h.input()!.value, '')
  } finally { await h.close() }
})

test('a Hong Kong query with no match says so in its own words', async () => {
  const h = await harness('InstrumentLookup', () => ({ delay: 0 }), (endpoint, payload) => {
    if (endpoint === MARKET_PREFERENCE_ENDPOINT) return { ok: true, value: { enabled: true, forced: false } }
    if (payload?.action === 'status') return { ok: true, value: { status: 'ready', enabled: true, available: true, source: 'test', results: [] } }
    return { ok: true, value: { status: 'ready', enabled: true, available: true, source: 'test', results: [] } }
  })
  try {
    await h.chooseMarket('hk')
    await h.type('不存在的港股')
    assert.match(h.text(), /没有匹配的港股/)
  } finally { await h.close() }
})

test('the HK detail renders the quote, exchange-time stamp and the view-only boundary', async () => {
  const h = await harness('HkDetail', () => ({ item: TENCENT, scope: 'scope-1', locale: 'zh' }), (endpoint, payload) => {
    assert.equal(endpoint, HK_ENDPOINT)
    if (payload.kind === 'quote') return { ok: true, value: { status: 'ready', quote: QUOTE } }
    // The payload is built in the bundle's realm, so compare it as data.
    assert.deepEqual(JSON.parse(JSON.stringify(payload)), { kind: 'history', symbol: 'HK.00700', limit: 1000 })
    // No daily bars in this fixture: the page must say so instead of drawing one.
    return { ok: true, value: { status: 'disabled' } }
  })
  try {
    const quoteCall = h.calls.find((call: any) => call.payload.kind === 'quote')
    assert.ok(quoteCall, 'the detail asks for the quote')
    assert.equal(quoteCall.payload.symbol, 'HK.00700')
    assert.ok(h.calls.some((call: any) => call.payload.kind === 'history'), 'the chart asks for the daily bars')
    const text = h.text()
    assert.match(text, /HK\.00700/)
    assert.match(text, /428\.000/)
    assert.match(text, /\+6\.57%/)
    assert.match(text, /\+26\.400/)
    assert.match(text, /413\.800/)
    assert.match(text, /腾讯港股 \(unofficial\)/)
    // The stamp is shown in exchange time and converted to an instant.
    assert.match(text, /2026\/11\/05/)
    assert.match(text, /11:07/)
    assert.match(text, /不是抓取时间/)
    assert.match(text, /可以加入自选/)
    assert.match(text, /RMB 双柜台/)
  } finally { await h.close() }
})

test('the HK detail stays empty and says why when the source is off', async () => {
  const h = await harness('HkDetail', () => ({ item: TENCENT, scope: 'scope-1', locale: 'zh' }), (endpoint, payload) => {
    assert.equal(endpoint, HK_ENDPOINT)
    return { ok: true, value: { status: 'disabled' } }
  })
  try {
    const text = h.text()
    assert.match(text, /行情未开启/)
    assert.equal(h.document.querySelector('.dxs-price')!.textContent, '—')
    assert.equal(h.calls.find((call: any) => call.payload.kind === 'quote').payload.symbol, 'HK.00700')
    assert.equal(h.calls.filter((call: any) => call.payload.kind === 'history').length, 1)
  } finally { await h.close() }
})
