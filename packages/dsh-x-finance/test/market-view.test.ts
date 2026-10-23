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
const goldSnapshot = {
  source: '新浪财经 (unofficial)', fetchedAt: '2026-10-18T21:06:57+08:00',
  instruments: [
    { key: 'XAU', name: '伦敦金（现货黄金）', unit: 'usd-ounce', price: 4035.01, change: -25.39, changePercent: -0.63, open: 4042.2, high: 4047.8, low: 4000.9, previousClose: 4060.4, amplitudePercent: 1.15, quotedAt: QUOTED },
    { key: 'GC', name: '纽约黄金', unit: 'usd-ounce', price: 4038.7, change: -21.7, changePercent: -0.53, open: 4042.2, high: 4047.8, low: 4000.9, previousClose: 4060.4, amplitudePercent: 1.15, quotedAt: QUOTED },
    { key: 'AU9999', name: '沪金99', unit: 'cny-gram', price: 864.2, change: -16.1, changePercent: -1.83, open: 874.5, high: 883.98, low: 859, previousClose: 880.3, amplitudePercent: 2.84, quotedAt: QUOTED },
    { key: 'USDCNH', name: '离岸人民币（香港）', unit: 'cny-usd', price: 6.672, change: -0.0006, changePercent: -0.01, open: null, high: null, low: null, previousClose: 6.6726, amplitudePercent: null, quotedAt: QUOTED },
  ],
  derived: { londonCnyPerGram: 865.5, shanghaiPremium: -1.3, shanghaiPremiumPercent: -0.15, goldSilverRatio: 74.2 },
  series: [
    { key: 'XAU', lastClose: 4035.01, lastDate: '2026-10-22', ranges: [{ label: '5d', changePercent: 1.2 }, { label: '20d', changePercent: 3.4 }, { label: '60d', changePercent: 8.8 }, { label: 'ytd', changePercent: 22.5 }], high52w: 4100, low52w: 3200, drawdownPercent: -1.6 },
  ],
  seriesIncomplete: true,
}
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

async function harness(options: { response?: any; dictionary?: any; rpc?: any; sourceEnabled?: boolean; sourceForced?: boolean } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
  const original: any = { window: (globalThis as any).window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT }
  ;(globalThis as any).window = dom.window
  globalThis.document = dom.window.document
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  const calls: any[] = []
  let sourceEnabled = options.sourceEnabled ?? true
  const sourceForced = options.sourceForced ?? false
  const defaultRpc = {
    call: async (_channel: string, endpoint: string, payload: any) => {
      calls.push(payload)
      if (endpoint === 'dsh-x-finance.market-preference') {
        if (payload.action === 'set' && !sourceForced) sourceEnabled = payload.enabled === true
        return { ok: true, value: { enabled: sourceForced || sourceEnabled, forced: sourceForced } }
      }
      if (!sourceEnabled && !sourceForced) return { ok: true, value: { status: 'unconfigured' } }
      if (payload.kind === 'overview') return { ok: true, value: { status: 'ready', overview } }
      if (payload.kind === 'breadth') return { ok: true, value: { status: 'ready', breadth } }
      if (payload.kind === 'global') return { ok: true, value: { status: 'ready', global: globalOverview } }
      if (payload && typeof payload === 'object' && !Object.keys(payload).length) return { ok: true, value: { status: 'ready', snapshot: goldSnapshot } }
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

test('source switch enables and disables the market feed without profile edits', async () => {
  const h = await harness({ sourceEnabled: false })
  try {
    assert.match(h.document.body.textContent ?? '', /市场数据未开启/)
    const setup = h.document.querySelector<HTMLInputElement>('.dxs-mkt-setup-switch input[type="checkbox"]')
    assert.ok(setup)
    assert.equal(setup!.checked, false)
    await act(async () => setup!.click())
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)) })
    assert.match(h.document.body.textContent ?? '', /市场全景/)
    assert.ok(h.calls.some(call => call.action === 'set' && call.enabled === true))
    const header = h.document.querySelector<HTMLInputElement>('.dxs-mkt-head .dxs-mkt-source-switch input[type="checkbox"]')
    assert.ok(header)
    assert.equal(header!.checked, true)
    await act(async () => header!.click())
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)) })
    assert.match(h.document.body.textContent ?? '', /市场数据未开启/)
    assert.ok(h.calls.some(call => call.action === 'set' && call.enabled === false))
  } finally { await h.close() }
})

test('forced host configuration keeps the switch on and disabled', async () => {
  const h = await harness({ sourceEnabled: true, sourceForced: true })
  try {
    const header = h.document.querySelector<HTMLInputElement>('.dxs-mkt-head .dxs-mkt-source-switch input[type="checkbox"]')
    assert.ok(header)
    assert.equal(header!.checked, true)
    assert.equal(header!.disabled, true)
    assert.match(header!.closest('label')!.getAttribute('title') ?? '', /强制开启/)
  } finally { await h.close() }
})

test('unconfigured and failed market sources fail closed without placeholder prices', async () => {
  const unconfigured = await harness({ response: { ok: true, value: { status: 'unconfigured', source: null } } })
  try {
    assert.match(unconfigured.document.body.textContent ?? '', /市场数据未开启/)
    assert.match(unconfigured.document.body.textContent ?? '', /marketSource: true/)
    assert.equal(unconfigured.document.querySelector('.dxs-mkt-tile'), null)
  } finally { await unconfigured.close() }
  const failed = await harness({ response: { ok: false, error: { code: 'finance/market-unavailable' } } })
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
      builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export function StockWorkbench(props) { return globalThis.__workbenchStub(props) }', loader: 'js' }))
    },
  }],
})
const pageModule = { exports: {} as any }
new Function('module', 'exports', 'require', pageBundle.outputFiles[0].text)(pageModule, pageModule.exports, createRequire(import.meta.url))

const globalOverview = {
  source: '东方财富全球指数 (unofficial)', fetchedAt: '2026-10-18T21:06:57+08:00', quotedAt: QUOTED,
  quotes: [
    { code: 'DJIA', name: '道琼斯工业指数', nameEn: 'Dow Jones', region: 'americas', timeZone: 'America/New_York', price: 52867.98, change: 11.89, changePercent: 0.02, open: 52788.41, high: 52927.88, low: 52508.38, previousClose: 52856.09, quotedAt: QUOTED },
    { code: 'N225', name: '日经225', nameEn: 'Nikkei 225', region: 'asiaPacific', timeZone: 'Asia/Tokyo', price: 62693.16, change: -214.68, changePercent: -0.34, open: 62667.05, high: 62786.89, low: 61462.61, previousClose: 62907.84, quotedAt: QUOTED },
    { code: 'KS11', name: '韩国KOSPI', nameEn: 'KOSPI', region: 'asiaPacific', timeZone: 'Asia/Seoul', price: 5550.3, change: 16.53, changePercent: 0.3, open: 5403.17, high: 5547.13, low: 5305.98, previousClose: 5533.77, quotedAt: QUOTED },
  ],
}
test('finance page tabs switch between the watchlist, the market panorama, global markets and gold', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
  const original: any = { window: (globalThis as any).window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT }
  ;(globalThis as any).window = dom.window
  globalThis.document = dom.window.document
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  const rpc = {
    call: async (_channel: string, _endpoint: string, payload: any) => {
      if (payload?.action === 'get') return { ok: true, value: { enabled: true, forced: false } }
      if (payload.kind === 'quotes') return { ok: true, value: { status: 'unconfigured', source: null } }
      if (payload.kind === 'overview') return { ok: true, value: { status: 'ready', overview } }
      if (payload.kind === 'breadth') return { ok: true, value: { status: 'ready', breadth } }
      if (payload.kind === 'global') return { ok: true, value: { status: 'ready', global: globalOverview } }
      if (payload && typeof payload === 'object' && !Object.keys(payload).length) return { ok: true, value: { status: 'ready', snapshot: goldSnapshot } }
      return { ok: true, value: { status: 'ready', board } }
    },
  }
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(dom.window.document.getElementById('root')!)
  const state = { items: [], collapsed: false, barHidden: false, storageError: '', scopeStatus: 'loading', scopeId: '11111111-1111-4111-8111-111111111111', placement: 'mounted', selectedSymbol: null }
  const useWatchlist = (selector: any) => selector(state)
  const useResource = () => ({ status: 'live', value: null })
  const noop = () => {}
  try {
    await act(async () => root.render(React.createElement(pageModule.exports.StockPage, {
      useWatchlist, useResource, add: noop, remove: noop, move: noop, select: noop, setFixed: noop, toggleBar: noop, back: noop, retryScope: noop,
      t: translation(zh), format: createFormatters(() => 'zh'), getLocale: () => 'zh', rpc,
    })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    const tabs = [...dom.window.document.querySelectorAll<HTMLElement>('.dxs-view-tabs button')]
    assert.equal(tabs.length, 4)
    assert.equal(tabs[0]!.getAttribute('aria-pressed'), 'true')
    assert.match(dom.window.document.body.textContent ?? '', /我的自选/)
    await act(async () => tabs[1]!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    assert.match(dom.window.document.body.textContent ?? '', /市场全景/)
    assert.match(dom.window.document.body.textContent ?? '', /3,301/)
    assert.doesNotMatch(dom.window.document.body.textContent ?? '', /我的自选/)
    assert.equal(tabs[1]!.getAttribute('aria-pressed'), 'true')
    await act(async () => tabs[2]!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    assert.equal(tabs[2]!.getAttribute('aria-pressed'), 'true')
    const globalText = dom.window.document.body.textContent ?? ''
    assert.match(globalText, /全球市场/)
    assert.match(globalText, /道琼斯工业指数/)
    assert.match(globalText, /日经225/)
    assert.match(globalText, /韩国KOSPI/)
    assert.match(globalText, /52,867\.98/)
    assert.doesNotMatch(globalText, /NaN|undefined/)
    await act(async () => tabs[3]!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    assert.equal(tabs[3]!.getAttribute('aria-pressed'), 'true')
    const goldText = dom.window.document.body.textContent ?? ''
    assert.match(goldText, /折算与价差/)
    assert.match(goldText, /4,035.01/)
    assert.match(goldText, /沪伦价差/)
    assert.match(goldText, /伦敦金/)
    assert.match(goldText, /离岸人民币/)
    assert.match(goldText, /52周高/)
    assert.doesNotMatch(goldText, /NaN|undefined/)
  } finally {
    await act(async () => root.unmount())
    dom.window.close()
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete (globalThis as any)[key]; else (globalThis as any)[key] = value }
  }
})

test('market panorama drills into a stock and the workbench requests its daily bars', async () => {
  ;(globalThis as any).__workbenchStub = Object.assign((props: any) => { (globalThis as any).__workbenchStub.calls.push(props); return null }, { calls: [] as any[] })
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
  const original: any = { window: (globalThis as any).window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT }
  ;(globalThis as any).window = dom.window
  globalThis.document = dom.window.document
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  const history = {
    symbol: 'SH.688825', name: '长鑫科技', source: '腾讯行情 (unofficial)', fetchedAt: QUOTED,
    adjustment: 'forward', adjustmentLabel: 'forward-adjusted (qfq)', pricePrecision: 2,
    volumeUnit: 'shares', volumeBasis: 'lots', amountUnit: 'CNY', currency: 'CNY', exchangeTimezone: 'Asia/Shanghai',
    firstSessionDate: '2026-10-15', lastSessionDate: '2026-10-19',
    bars: [
      { sessionDate: '2026-10-15', open: 44, high: 46, low: 43.5, close: 45.02, volume: 1_000_000, amount: 45_000_000, isFinal: true },
      { sessionDate: '2026-10-16', open: 45, high: 47, low: 44.8, close: 46.5, volume: 1_200_000, amount: 55_000_000, isFinal: true },
      { sessionDate: '2026-10-19', open: 46.4, high: 47.2, low: 46, close: 46.9, volume: 800_000, amount: 37_000_000, isFinal: false },
    ],
  }
  const calls: any[] = []
  const rpc = {
    call: async (_channel: string, _endpoint: string, payload: any) => {
      calls.push(payload)
      if (payload?.action === 'get') return { ok: true, value: { enabled: true, forced: false } }
      if (payload.kind === 'history') return { ok: true, value: { status: 'ready', history: { ...history, symbol: payload.symbol } } }
      if (payload.kind === 'quotes') return { ok: true, value: { status: 'unconfigured', source: null } }
      if (payload.kind === 'overview') return { ok: true, value: { status: 'ready', overview } }
      if (payload.kind === 'breadth') return { ok: true, value: { status: 'ready', breadth } }
      if (payload.kind === 'global') return { ok: true, value: { status: 'ready', global: globalOverview } }
      return { ok: true, value: { status: 'ready', board } }
    },
  }
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(dom.window.document.getElementById('root')!)
  const added: any[] = [], selected: any[] = []
  const state: any = { items: [], collapsed: false, barHidden: false, storageError: '', scopeStatus: 'ready', scopeId: '11111111-1111-4111-8111-111111111111', placement: 'mounted', selectedSymbol: null }
  const useWatchlist = (selector: any) => selector(state)
  const useResource = () => ({ status: 'live', value: null })
  const noop = () => {}
  try {
    await act(async () => root.render(React.createElement(pageModule.exports.StockPage, {
      useWatchlist, useResource, add: (item: any) => { added.push(item); state.items.push({ ...item }); state.selectedSymbol = item.symbol },
      remove: noop, move: noop, select: (symbol: any) => { selected.push(symbol); state.selectedSymbol = symbol }, setFixed: noop, toggleBar: noop, back: noop, retryScope: noop,
      t: translation(zh), format: createFormatters(() => 'zh'), getLocale: () => 'zh', rpc,
    })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    const tabs = [...dom.window.document.querySelectorAll<HTMLElement>('.dxs-view-tabs button')]
    await act(async () => tabs[1]!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    // Open the sector panel, pick a constituent, then drill into it.
    const tile = [...dom.window.document.querySelectorAll<HTMLElement>('.dxs-mkt-tile')].find(element => element.textContent?.includes('半导体'))
    await act(async () => tile!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    const drill = [...dom.window.document.querySelectorAll<HTMLElement>('.dxs-mkt-drill')].find(element => element.textContent === '查看详情')
    assert.ok(drill, 'constituent rows must offer a drill-down action')
    await act(async () => drill!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    // An unknown stock is added unfixed and selected, never silently fixed.
    assert.deepEqual(added, [{ symbol: 'SH.688825', alias: '长鑫科技', fixed: false }])
    assert.match(dom.window.document.body.textContent ?? '', /已加入自选并打开/)
    assert.equal(tabs[0]!.getAttribute('aria-pressed'), 'true')
    // The stub workbench receives the drilled symbol; the real component then
    // requests its history (covered by workbench/history tests).
    const mounted = (globalThis as any).__workbenchStub.calls.at(-1)
    assert.equal(mounted.symbol, 'SH.688825')
    assert.equal(mounted.rpc, rpc)
  } finally {
    await act(async () => root.unmount())
    dom.window.close()
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete (globalThis as any)[key]; else (globalThis as any)[key] = value }
  }
})

test('a mover row and an index card drill down without touching the watchlist', async () => {
  ;(globalThis as any).__workbenchStub = Object.assign((props: any) => { (globalThis as any).__workbenchStub.calls.push(props); return null }, { calls: [] as any[] })
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
  const original: any = { window: (globalThis as any).window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT }
  ;(globalThis as any).window = dom.window
  globalThis.document = dom.window.document
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  const calls: any[] = []
  const rpc = {
    call: async (_channel: string, _endpoint: string, payload: any) => {
      calls.push(payload)
      if (payload?.action === 'get') return { ok: true, value: { enabled: true, forced: false } }
      if (payload.kind === 'quotes') return { ok: true, value: { status: 'unconfigured', source: null } }
      if (payload.kind === 'overview') return { ok: true, value: { status: 'ready', overview } }
      if (payload.kind === 'breadth') return { ok: true, value: { status: 'ready', breadth } }
      if (payload.kind === 'global') return { ok: true, value: { status: 'ready', global: globalOverview } }
      return { ok: true, value: { status: 'ready', board } }
    },
  }
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(dom.window.document.getElementById('root')!)
  const added: any[] = [], selected: any[] = []
  const state: any = { items: [{ symbol: 'SH.600519', alias: '茅台', fixed: false }], collapsed: false, barHidden: false, storageError: '', scopeStatus: 'ready', scopeId: '11111111-1111-4111-8111-111111111111', placement: 'mounted', selectedSymbol: 'SH.600519' }
  const useWatchlist = (selector: any) => selector(state)
  const useResource = () => ({ status: 'live', value: null })
  const noop = () => {}
  try {
    await act(async () => root.render(React.createElement(pageModule.exports.StockPage, {
      useWatchlist, useResource, add: (item: any) => added.push(item), remove: noop, move: noop,
      select: (symbol: any) => { selected.push(symbol); state.selectedSymbol = symbol }, setFixed: noop, toggleBar: noop, back: noop, retryScope: noop,
      t: translation(zh), format: createFormatters(() => 'zh'), getLocale: () => 'zh', rpc,
    })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    const tabs = [...dom.window.document.querySelectorAll<HTMLElement>('.dxs-view-tabs button')]
    await act(async () => tabs[1]!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    const mover = [...dom.window.document.querySelectorAll<HTMLElement>('.dxs-mkt-movers-grid .dxs-mkt-link')][0]
    assert.ok(mover, 'mover rows must offer a drill-down action')
    await act(async () => mover!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    assert.deepEqual(added, [{ symbol: 'BJ.920196', alias: 'N南乳', fixed: false }])
    assert.match(dom.window.document.body.textContent ?? '', /已加入自选并打开/)
    // An index is opened too, but it is not an exchange-qualified A-share, so it
    // must not be written to the watchlist.
    await act(async () => tabs[1]!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    const index = dom.window.document.querySelector<HTMLElement>('.dxs-mkt-index .dxs-mkt-link')
    assert.ok(index, 'index cards must offer a drill-down action')
    await act(async () => index!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    assert.deepEqual(added, [{ symbol: 'BJ.920196', alias: 'N南乳', fixed: false }], 'indices never enter the A-share watchlist')
    assert.match(dom.window.document.body.textContent ?? '', /上证指数 · SH\.000001/)
    assert.match(dom.window.document.body.textContent ?? '', /指数日 K 来自同一个本机免费源/)
    const chart = (globalThis as any).__workbenchStub.calls.at(-1)
    assert.equal(chart.symbol, 'SH.000001')
    assert.equal(chart.rpc, rpc)
  } finally {
    await act(async () => root.unmount())
    dom.window.close()
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete (globalThis as any)[key]; else (globalThis as any)[key] = value }
  }
})
