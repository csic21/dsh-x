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
import { US_ENDPOINT } from '../src/us-market.ts'

// jsdom interaction test for the real published components. Every row and
// quote below is an explicit offline fixture; no assertion claims a live price.
const root = new URL('..', import.meta.url).pathname
const bundle = await build({
  stdin: {
    contents: [
      "export { InstrumentLookup } from './src/client/SearchBox.tsx'",
      "export { UsDetail } from './src/client/us/UsView.tsx'",
    ].join('\n'),
    resolveDir: root,
    loader: 'tsx',
  },
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'],
})

const BYD = { symbol: 'SZ.002594', name: '比亚迪', kind: 'stock', market: 'cn' }
const AAPL = { symbol: 'US.AAPL', name: 'Apple', kind: 'stock', market: 'us', code: 'AAPL.OQ' }
const BRKB = { symbol: 'US.BRK.B', name: 'Berkshire Hathaway', kind: 'stock', market: 'us', code: 'BRK.B.N' }
const t = (key: any, values?: any) => String(zh[key as keyof typeof zh] ?? key).replace(/\{(\w+)\}/g, (_m, name) => values?.[name] ?? `{${name}}`)

const QUOTE = {
  symbol: 'US.AAPL', name: '苹果', price: 123.45, pricePrecision: 2,
  change: 3.45, changePercent: 2.88, open: 120.5, high: 124, low: 119.8, previousClose: 120,
  volume: 1_000_000, amount: 123_450_000, currency: 'USD',
  quotedAt: '2026-11-03T21:00:02.000Z', fetchedAt: '2026-11-04T07:00:00.000Z',
  marketStatus: 'unknown', source: '腾讯美股 (unofficial)',
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
    // The directory's own status/search answers are stubbed separately below.
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

test('the page lookup switches to the US directory and keeps A-share rows out of it', async () => {
  const h = await harness('InstrumentLookup', () => ({ delay: 0 }), (endpoint, payload) => {
    if (endpoint === MARKET_PREFERENCE_ENDPOINT) return { ok: true, value: { enabled: true, forced: false } }
    assert.equal(endpoint, SEARCH_RPC_ENDPOINT)
    if (payload?.action === 'status') return { ok: true, value: { status: 'ready', enabled: true, available: true, source: 'test', results: [] } }
    // The Host answers for the requested market; this fixture keeps both kinds
    // of row in one payload to prove the browser filters by market too.
    return { ok: true, value: { status: 'ready', enabled: true, available: true, source: 'test', results: [BYD, AAPL, BRKB] } }
  })
  try {
    assert.ok(h.document.querySelector('select.dxs-lookup-market'), 'the pill exposes a market choice')
    assert.equal(h.input()!.getAttribute('placeholder'), '搜索股票 / ETF')

    await h.type('a')
    // The default market keeps the two-key envelope an older Host understands.
    assert.deepEqual(h.calls.at(-1).payload, { action: 'search', query: 'a' })
    assert.deepEqual(h.options(), ['比亚迪SZ.002594股票'])

    await h.chooseMarket('us')
    assert.equal(h.calls.at(-1).payload.market, 'us')
    assert.deepEqual(h.options(), ['AppleUS.AAPL美股', 'Berkshire HathawayUS.BRK.B美股'])
    assert.equal(h.input()!.getAttribute('placeholder'), '搜索美股名称或代码，如 Apple、AAPL')

    await act(async () => h.document.querySelector('[role="option"]')!.dispatchEvent(new h.dom.window.MouseEvent('click', { bubbles: true })))
    assert.deepEqual(h.picked, [AAPL])
    assert.equal(h.input()!.value, '')
  } finally { await h.close() }
})

test('the US detail renders the quote, exchange-time stamp and the view-only boundary', async () => {
  const h = await harness('UsDetail', () => ({ item: AAPL, scope: 'scope-1', locale: 'zh' }), (endpoint, payload) => {
    assert.equal(endpoint, US_ENDPOINT)
    if (payload.kind === 'quote') return { ok: true, value: { status: 'ready', quote: QUOTE } }
    // The payload is built in the bundle's realm, so compare it as data.
    assert.deepEqual(JSON.parse(JSON.stringify(payload)), { kind: 'history', symbol: 'US.AAPL', code: 'AAPL.OQ', limit: 1000 })
    // No daily bars in this fixture: the page must say so instead of drawing one.
    return { ok: true, value: { status: 'disabled' } }
  })
  try {
    const quoteCall = h.calls.find((call: any) => call.payload.kind === 'quote')
    assert.ok(quoteCall, 'the detail asks for the quote')
    assert.equal(quoteCall.payload.symbol, 'US.AAPL')
    assert.ok(h.calls.some((call: any) => call.payload.kind === 'history'), 'the chart asks for the daily bars')
    const text = h.text()
    assert.match(text, /US\.AAPL/)
    assert.match(text, /123\.45/)
    assert.match(text, /\+2\.88%/)
    assert.match(text, /\+3\.45/)
    assert.match(text, /120\.50/)
    assert.match(text, /腾讯美股 \(unofficial\)/)
    // The stamp is shown in exchange time, not Beijing time and not retrieval time.
    assert.match(text, /2026\/11\/03 GMT-5 16:00/)
    assert.match(text, /不是北京时间/)
    assert.match(text, /可以加入自选/)
    assert.match(text, /日 K 数据未开启/)
  } finally { await h.close() }
})

test('the US detail stays empty and says why when the source is off', async () => {
  const h = await harness('UsDetail', () => ({ item: { ...AAPL, code: undefined }, scope: 'scope-1', locale: 'zh' }), (endpoint, payload) => {
    assert.equal(endpoint, US_ENDPOINT)
    if (payload.kind === 'quote') return { ok: true, value: { status: 'disabled' } }
    return { ok: true, value: { status: 'disabled' } }
  })
  try {
    const text = h.text()
    assert.match(text, /行情未开启/)
    assert.equal(h.document.querySelector('.dxs-price')!.textContent, '—')
    // No code means no daily request at all: the venue code is required.
    assert.equal(h.calls.filter((call: any) => call.payload.kind === 'history').length, 0)
    assert.equal(h.calls.find((call: any) => call.payload.kind === 'quote').payload.symbol, 'US.AAPL')
  } finally { await h.close() }
})
