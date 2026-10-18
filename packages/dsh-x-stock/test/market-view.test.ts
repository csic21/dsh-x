import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { zh, en } from '../src/client/locales.ts'
import { createFormatters } from '../src/client/format.ts'

const NOW = new Date('2026-10-18T21:06:57+08:00')
const QUOTED = '2026-10-16T15:00:00+08:00'
const index = (code: string, name: string, price: number, percent: number, amount: number) => ({ code, name, price, changePercent: percent, change: percent * price / 100, open: price - 10, high: price + 20, low: price - 20, previousClose: price - 2, amount, quotedAt: QUOTED })
const overview = {
  source: '腾讯行情 (unofficial)', fetchedAt: '2026-10-18T21:06:57+08:00', quotedAt: QUOTED,
  indices: [
    index('SH.000001', '上证指数', 3716.28, 0.24, 732_475_190_000),
    index('SZ.399001', '深证成指', 11802.46, -0.12, 822_945_590_000),
    index('SZ.399006', '创业板指', 2772.38, -0.39, 394_225_950_000),
  ],
  sectors: [
    { code: '801080', name: '电子', level: 1, parent: null, changePercent: -0.56, amount: 365_500_000_000, marketCap: 19_657_670_000_000, topStock: null, quotedAt: QUOTED },
    { code: '801740', name: '国防军工', level: 1, parent: null, changePercent: 2.99, amount: 96_323_800_000, marketCap: 2_771_108_000_000, topStock: null, quotedAt: QUOTED },
    { code: '801780', name: '银行', level: 1, parent: null, changePercent: -0.07, amount: 133_036_485_000, marketCap: 16_790_637_000_000, topStock: null, quotedAt: QUOTED },
    { code: '801120', name: '食品饮料', level: 1, parent: null, changePercent: 0.84, amount: 92_710_384_000, marketCap: 3_762_160_000_000, topStock: null, quotedAt: QUOTED },
    { code: '801081', name: '半导体', level: 2, parent: '801080', changePercent: -0.45, amount: 181_054_000_000, marketCap: 4_500_000_000_000, topStock: { code: 'SH.688385', name: '复旦微电', changePercent: 14.61 }, quotedAt: QUOTED },
    { code: '801082', name: '消费电子', level: 2, parent: '801080', changePercent: 0.41, amount: 60_000_000_000, marketCap: 2_000_000_000_000, topStock: { code: 'SZ.002475', name: '立讯精密', changePercent: 0.04 }, quotedAt: QUOTED },
    { code: '801741', name: '航天装备Ⅱ', level: 2, parent: '801740', changePercent: 3.47, amount: 20_000_000_000, marketCap: 500_000_000_000, topStock: { code: 'SZ.300722', name: '新余国科', changePercent: 7.58 }, quotedAt: QUOTED },
    { code: '801742', name: '航空装备Ⅱ', level: 2, parent: '801740', changePercent: 3.71, amount: 22_000_000_000, marketCap: 1_100_000_000_000, topStock: { code: 'SZ.300581', name: '晨曦航空', changePercent: 20.02 }, quotedAt: QUOTED },
    { code: '801781', name: '国有大型银行Ⅱ', level: 2, parent: '801780', changePercent: -0.58, amount: 50_000_000_000, marketCap: 8_000_000_000_000, topStock: { code: 'SH.601939', name: '建设银行', changePercent: 0 }, quotedAt: QUOTED },
    { code: '801121', name: '白酒Ⅱ', level: 2, parent: '801120', changePercent: 1.2, amount: 30_000_000_000, marketCap: 2_500_000_000_000, topStock: { code: 'SH.600519', name: '贵州茅台', changePercent: 1.22 }, quotedAt: QUOTED },
  ],
}
const distribution = [
  { from: null, to: -7, count: 65 }, { from: -7, to: -5, count: 98 }, { from: -5, to: -3, count: 224 },
  { from: -3, to: -1, count: 882 }, { from: -1, to: 0, count: 859 }, { from: 0, to: 0, count: 148 },
  { from: 0, to: 1, count: 1192 }, { from: 1, to: 3, count: 1528 }, { from: 3, to: 5, count: 339 },
  { from: 5, to: 7, count: 105 }, { from: 7, to: null, count: 137 },
]
const stock = (code: string, name: string, price: number, percent: number, amount: number, cap: number) => ({ code, name, price, changePercent: percent, amount, marketCap: cap, suspended: false })
const breadth = {
  source: '腾讯行情 (unofficial)', fetchedAt: '2026-10-18T21:06:57+08:00', expected: 5577, covered: 5577,
  up: 3301, down: 2128, flat: 148, suspended: 10, coverage: 1, partial: false, amount: 1_569_065_980_000,
  distribution,
  topGainers: [stock('BJ.920196', 'N南乳', 22.56, 58.76, 599_335_786, 3_000_000_000), stock('SZ.920690', '捷众科技', 19.24, 30, 158_998_589, 2_000_000_000)],
  topLosers: [stock('SZ.301231', '荣信文化', 30.62, -3.59, 44_981_000, 2_584_000_000), stock('SH.600000', '浦发银行', 10.1, -1, 500_000_000, 300_000_000_000)],
  topAmount: [stock('SZ.300308', '中际旭创', 100, 1.99, 16_364_600_000, 500_000_000_000), stock('SH.688825', '长鑫科技', 45.02, 3.28, 13_661_020_000, 3_056_142_000_000)],
}
const board = {
  source: '腾讯行情 (unofficial)', fetchedAt: '2026-10-18T21:06:57+08:00', code: '801080', name: '电子',
  changePercent: -0.56, amount: 365_500_000_000, marketCap: 19_657_670_000_000, total: 496, truncated: true,
  stocks: [
    stock('SH.688825', '长鑫科技', 45.02, 3.28, 13_661_020_000, 3_056_142_000_000),
    stock('SH.603986', '兆易创新', 281.86, 1.31, 9_807_340_000, 198_421_000_000),
    stock('SH.688981', '中芯国际', 80, -1.7, 8_000_000_000, 600_000_000_000),
  ],
}

const bundle = await build({
  entryPoints: [new URL('../src/client/market/MarketView.tsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'],
})
const marketModule = { exports: {} as any }
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(marketModule, marketModule.exports, createRequire(import.meta.url))

const translation = (dictionary: any) => (key: string, params: Record<string, any> = {}) =>
  String(dictionary[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`)

async function harness(options: { response?: any; dictionary?: any; rpc?: any } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
  const original: any = { window: (globalThis as any).window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT }
  ;(globalThis as any).window = dom.window
  globalThis.document = dom.window.document
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  const calls: any[] = []
  const defaultRpc = {
    call: async (_channel: string, _endpoint: string, payload: any) => {
      calls.push(payload)
      if (payload.kind === 'overview') return { ok: true, value: { status: 'ready', overview } }
      if (payload.kind === 'breadth') return { ok: true, value: { status: 'ready', breadth } }
      return { ok: true, value: { status: 'ready', board: { ...board, code: payload.board } } }
    },
  }
  const rpc = options.rpc ?? defaultRpc
  const response = options.response
  if (response) rpc.call = async () => response
  const dictionary = options.dictionary ?? zh
  const t = translation(dictionary)
  const format = createFormatters(() => dictionary === en ? 'en' : 'zh')
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(dom.window.document.getElementById('root')!)
  const render = async (component = marketModule.exports.MarketView) => {
    await act(async () => root.render(React.createElement(component, { rpc, t, format, locale: dictionary === en ? 'en' : 'zh', now: () => NOW })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
  }
  const click = async (element: any) => {
    assert.ok(element, 'expected clickable element')
    await act(async () => element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
  }
  const button = (text: string) => [...dom.window.document.querySelectorAll('button')].find(element => element.textContent?.includes(text))
  await render()
  return {
    dom, document: dom.window.document, calls, rpc, render, click, button,
    async close() {
      await act(async () => root.unmount())
      dom.window.close()
      for (const [key, value] of Object.entries(original)) { if (value === undefined) delete (globalThis as any)[key]; else (globalThis as any)[key] = value }
    },
  }
}

test('market dashboard renders indices, sentiment, heatmap, breadth and movers', async () => {
  const h = await harness()
  try {
    const text = h.document.body.textContent ?? ''
    assert.match(text, /市场全景/)
    assert.match(text, /3,301/)
    assert.match(text, /2,128/)
    assert.match(text, /1\.57万亿/)
    assert.match(text, /国防军工/)
    assert.match(text, /半导体/)
    assert.match(text, /涨幅前列/)
    assert.ok(h.document.querySelectorAll('.dxs-mkt-tile').length >= 6)
    assert.ok(h.document.querySelectorAll('.dxs-mkt-group-label').length >= 3)
    assert.ok(h.calls.some(call => call.kind === 'overview'))
    assert.ok(h.calls.some(call => call.kind === 'breadth'))
  } finally { await h.close() }
})

test('selecting an industry opens its constituent panel and close removes it', async () => {
  const h = await harness()
  try {
    const tile = [...h.document.querySelectorAll<HTMLElement>('.dxs-mkt-tile')].find(element => element.textContent?.includes('半导体'))
    await h.click(tile)
    assert.match(h.document.body.textContent ?? '', /行业成分/)
    assert.match(h.document.body.textContent ?? '', /电子/)
    assert.match(h.document.body.textContent ?? '', /长鑫科技/)
    assert.match(h.document.body.textContent ?? '', /兆易创新/)
    assert.ok(h.calls.some(call => call.kind === 'board' && call.board === '801081'))
    await h.click(h.button('收起'))
    assert.doesNotMatch(h.document.body.textContent ?? '', /行业成分/)
  } finally { await h.close() }
})

test('unconfigured and failed market sources fail closed without placeholder prices', async () => {
  const unconfigured = await harness({ response: { ok: true, value: { status: 'unconfigured', source: null } } })
  try {
    assert.match(unconfigured.document.body.textContent ?? '', /市场数据未开启/)
    assert.match(unconfigured.document.body.textContent ?? '', /marketSource: true/)
    assert.equal(unconfigured.document.querySelector('.dxs-mkt-tile'), null)
  } finally { await unconfigured.close() }
  const failed = await harness({ response: { ok: false, error: { code: 'stock/market-unavailable' } } })
  try {
    assert.match(failed.document.body.textContent ?? '', /市场数据暂不可用/)
    assert.equal(failed.document.querySelector('.dxs-mkt-tile'), null)
  } finally { await failed.close() }
})

test('market dashboard switches to English without losing the loaded snapshot', async () => {
  const h = await harness({ dictionary: en })
  try {
    assert.match(h.document.body.textContent ?? '', /Market panorama/)
    assert.match(h.document.body.textContent ?? '', /Top gainers/)
    assert.match(h.document.body.textContent ?? '', /Advancers/)
  } finally { await h.close() }
})

const pageBundle = await build({
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
new Function('module', 'exports', 'require', pageBundle.outputFiles[0].text)(pageModule, pageModule.exports, createRequire(import.meta.url))

test('stock page tabs switch between the watchlist and the market panorama', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
  const original: any = { window: (globalThis as any).window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT }
  ;(globalThis as any).window = dom.window
  globalThis.document = dom.window.document
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  const rpc = {
    call: async (_channel: string, _endpoint: string, payload: any) => {
      if (payload.kind === 'overview') return { ok: true, value: { status: 'ready', overview } }
      if (payload.kind === 'breadth') return { ok: true, value: { status: 'ready', breadth } }
      return { ok: true, value: { status: 'ready', board } }
    },
  }
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(dom.window.document.getElementById('root')!)
  const state = { pins: [], collapsed: false, storageError: '', scopeStatus: 'loading', scopeId: '11111111-1111-4111-8111-111111111111', placement: 'mounted', selectedSymbol: null }
  const useWatchlist = (selector: any) => selector(state)
  const useResource = () => ({ status: 'live', value: null })
  const noop = () => {}
  try {
    await act(async () => root.render(React.createElement(pageModule.exports.StockPage, {
      useWatchlist, useResource, add: noop, remove: noop, move: noop, select: noop, back: noop, retryScope: noop,
      t: translation(zh), format: createFormatters(() => 'zh'), getLocale: () => 'zh', rpc,
    })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    const tabs = [...dom.window.document.querySelectorAll<HTMLElement>('.dxs-view-tabs button')]
    assert.equal(tabs.length, 2)
    assert.equal(tabs[0]!.getAttribute('aria-pressed'), 'true')
    assert.match(dom.window.document.body.textContent ?? '', /我的自选/)
    await act(async () => tabs[1]!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    assert.match(dom.window.document.body.textContent ?? '', /市场全景/)
    assert.match(dom.window.document.body.textContent ?? '', /3,301/)
    assert.doesNotMatch(dom.window.document.body.textContent ?? '', /我的自选/)
    assert.equal(tabs[1]!.getAttribute('aria-pressed'), 'true')
  } finally {
    await act(async () => root.unmount())
    dom.window.close()
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete (globalThis as any)[key]; else (globalThis as any)[key] = value }
  }
})
