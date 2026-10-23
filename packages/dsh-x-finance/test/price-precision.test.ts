import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { quotePrecision } from '../src/market.ts'
import { parseStockQuote } from '../src/market-provider.ts'
import { projectQuotes } from '../src/market-rpc.ts'
import { createFormatters, quoteDigits } from '../src/client/format.ts'
import { zh } from '../src/client/locales.ts'

const QUOTED = '2026-10-16T15:00:00+08:00'

const fields = (price: string) => {
  const values = Array.from({ length: 50 }, () => '')
  Object.assign(values, {
    0: '1', 1: '沪深300ETF易方达', 2: '510310', 3: price, 4: '3.989', 5: '3.954',
    30: '20261016150000', 31: '0.038', 32: '1.22', 33: '4.030', 34: '3.950',
  })
  return values
}

test('the quoted width comes from the raw field, including trailing zeros', () => {
  assert.equal(quotePrecision('4.027'), 3)
  assert.equal(quotePrecision('4.0240'), 4)
  assert.equal(quotePrecision('100.908'), 3)
  assert.equal(quotePrecision('1329'), 0)
  assert.equal(quotePrecision('1.2345678'), null)
  assert.equal(quotePrecision('-1.20'), null)
  assert.equal(quotePrecision(''), null)
  assert.equal(quotePrecision(undefined), null)
})

test('a three- or four-decimal ETF price keeps its width through parsing and projection', () => {
  const now = Date.parse('2026-10-16T15:01:00+08:00')
  const three = parseStockQuote('sh510310', fields('4.027'), now)
  assert.equal(three.price, 4.027)
  assert.equal(three.pricePrecision, 3)
  const four = parseStockQuote('sh510310', fields('4.0240'), now)
  assert.equal(four.pricePrecision, 4)

  const projected = projectQuotes([three], ['SH.510310'], now)
  assert.equal(projected[0]!.pricePrecision, 3)
  // A replacement adapter cannot smuggle in a nonsensical width.
  const odd = projectQuotes([{ ...three, pricePrecision: 9 }], ['SH.510310'], now)
  assert.equal(odd[0]!.pricePrecision, null)
  const missing = projectQuotes([{ ...three, pricePrecision: undefined }], ['SH.510310'], now)
  assert.equal(missing[0]!.pricePrecision, null)
})

test('formatting at the quoted width never rounds the price away', () => {
  const format = createFormatters(() => 'zh')
  assert.equal(format.priceAt(4.027, 3), '4.027')
  assert.equal(format.priceAt(4.024, 4), '4.0240')
  assert.equal(format.priceAt(100.908, 3), '100.908')
  assert.equal(format.signedAt(0.038, 3), '+0.038')
  assert.equal(format.signedAt(-0.038, 3), '-0.038')
  // A source that states no width still gets a readable, documented fallback.
  assert.equal(format.priceAt(4.027, null), '4.03')
  assert.equal(quoteDigits(undefined), 2)
  assert.equal(quoteDigits(7), 2)
  // Truly zero digits are not padded beyond their own width.
  assert.equal(format.priceAt(1329, 0), '1,329')
})

const bundle = await build({
  entryPoints: [new URL('../src/client/components.tsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'],
  plugins: [{
    name: 'stub-workbench',
    setup(builder) {
      builder.onResolve({ filter: /\/workbench\.tsx$/ }, () => ({ path: 'workbench-stub', namespace: 'test' }))
      builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export function StockWorkbench() { return null }', loader: 'js' }))
    },
  }],
})
const pageModule = { exports: {} as any }
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(pageModule, pageModule.exports, createRequire(import.meta.url))
const t = (key: string, params: Record<string, any> = {}) => String((zh as any)[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`)

async function renderBar(quote: any) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
  const original: any = { window: (globalThis as any).window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT }
  ;(globalThis as any).window = dom.window
  globalThis.document = dom.window.document
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  const state = {
    items: [{ symbol: 'SH.510310', alias: '沪深300ETF易方达', fixed: true }], collapsed: false, barHidden: false,
    storageError: '', scopeStatus: 'ready', scopeId: '11111111-1111-4111-8111-111111111111', placement: 'mounted', selectedSymbol: 'SH.510310',
  }
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(dom.window.document.getElementById('root')!)
  try {
    await act(async () => root.render(React.createElement(pageModule.exports.StockBar, {
      useWatchlist: (selector: any) => selector(state),
      useResource: () => ({ status: 'live', value: { source: 'test-source', quotes: [quote] } }),
      rpc: { call: async () => ({ ok: true, value: { enabled: true, forced: false } }) },
      collapse: () => {}, open: () => {}, hideBar: () => {}, t,
      format: createFormatters(() => 'zh'),
    })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    return (dom.window.document.body.textContent ?? '').replace(/\s+/g, ' ')
  } finally {
    await act(async () => root.unmount())
    dom.window.close()
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete (globalThis as any)[key]; else (globalThis as any)[key] = value }
  }
}

test('the fixed bar shows the ETF price exactly as quoted', async () => {
  const quote = { symbol: 'SH.510310', status: 'available', name: '沪深300ETF易方达', price: 4.027, pricePrecision: 3, changePercent: 1.22, quotedAt: QUOTED, fetchedAt: QUOTED, marketStatus: 'unknown' }
  const text = await renderBar(quote)
  assert.match(text, /4\.027/)
  assert.doesNotMatch(text, /4\.03\b/)
})

test('a four-decimal quote is not truncated to two decimals in the bar', async () => {
  const quote = { symbol: 'SH.510310', status: 'available', name: '沪深300ETF易方达', price: 4.024, pricePrecision: 4, changePercent: 0.88, quotedAt: QUOTED, fetchedAt: QUOTED, marketStatus: 'unknown' }
  const text = await renderBar(quote)
  assert.match(text, /4\.0240/)
})
