import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { zh, en } from '../src/client/locales.ts'
import { createFormatters } from '../src/client/format.ts'
import { MARKET_CSS } from '../src/client/market/styles.ts'
import { CSS } from '../src/client/styles.ts'
import { SEARCH_RPC_ENDPOINT } from '../src/instrument-search.ts'


/** Brace depth at `index`: 0 means the rule is a top-level rule, not nested. */
function depthAt(text: string, index: number): number {
  let depth = 0
  for (let cursor = 0; cursor < index; cursor++) {
    const char = text[cursor]
    if (char === '{') depth += 1
    else if (char === '}') depth -= 1
  }
  return depth
}

test('the injected stylesheet stays balanced and keeps each panel at top level', () => {
  let depth = 0
  let firstNegative = -1
  for (let index = 0; index < MARKET_CSS.length; index++) {
    if (MARKET_CSS[index] === '{') depth += 1
    else if (MARKET_CSS[index] === '}') {
      depth -= 1
      if (depth < 0 && firstNegative < 0) firstNegative = index
    }
  }
  assert.equal(depth, 0, 'MARKET_CSS has an unclosed block')
  assert.equal(firstNegative, -1, 'MARKET_CSS closes more blocks than it opens')
  // A rule that is nested by accident still parses, but it only applies inside
  // the enclosing media query -- which is how a whole panel went unstyled on a
  // wide window. Check the first rule of every panel explicitly.
  for (const selector of ['.dxs-hot-row{', '.dxs-csi300{', '.dxs-predict-regime{', '.dxs-predict-row{', '.dxs-predict-toggle{']) {
    const index = MARKET_CSS.indexOf(selector)
    assert.ok(index >= 0, `${selector} is missing from the stylesheet`)
    assert.equal(depthAt(MARKET_CSS, index), 0, `${selector} is nested inside another block`)
  }
  // MARKET_CSS is interpolated in the middle of the page stylesheet, so an
  // unclosed block here swallows the watchlist, gold and settings rules too.
  let composed = 0
  for (const char of CSS) {
    if (char === '{') composed += 1
    else if (char === '}') composed -= 1
  }
  assert.equal(composed, 0, 'the composed page stylesheet has an unclosed block')
  for (const selector of ['.dxs-layout{', '.dxs-predict-row{', '.dxs-set-body{']) {
    const index = CSS.indexOf(selector)
    assert.ok(index >= 0, `${selector} is missing from the composed sheet`)
    assert.equal(depthAt(CSS, index), 0, `${selector} is nested inside another block`)
  }
})

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
const tailCandidate = (options: { symbol: string; name: string; consecutive: boolean; score: number; tailRatio: number; tailReturn: number; streak: number }) => ({
  symbol: options.symbol, name: options.name, price: 4.91, changePercent: -6.12, amount: 260_000_000,
  turnoverPercent: 8.2, volumeRatio: 2.5, fiveMinuteChange: null, sessionDate: '2026-10-16',
  tail: {
    sessionDate: '2026-10-16', complete: true, tailStart: '14:30', tailEnd: '15:00',
    tailReturn: options.tailReturn, tailVolume: 9000, baselineVolume: 3270, tailVolumeRatio: options.tailRatio,
    tailVolumeShare: 0.12, dayReturn: -0.0612, points: 242, blocks: 6,
  },
  daily: {
    sessionDate: '2026-10-16', volumeRatio5: 3.87, volumeRatio20: 5.49, downStreak: options.streak,
    volumeExpansionDownStreak: options.consecutive ? options.streak : 0, volumeDeclineStreak: 1,
    distributionDays20: 2, downDays5: options.streak, downDays10: 3, todayReturn: -0.0612,
    prior5AvgVolume: 100, isFinal: true, samples: 250,
  },
  quant: {
    samples: 250, from: '2025-10-01', to: '2026-10-16', totalReturn: 0.2, annualVolatility: 0.4,
    maxDrawdown: -0.3, sharpe: 1.1, rsi14: 77.5, atr14: 0.12, ma20: 3.58, ma60: 3.04,
    priceVsMa20: 0.37, priceVsMa60: 0.61, momentum20: 0.1, momentum60: 0.2,
    high52w: 5, low52w: 2, drawdownFromHigh: -0.02,
  },
  historyAvailable: true, adjustment: 'forward', score: options.score,
  factors: [], flags: { tailDump: true, volumeExpansion: true, consecutive: options.consecutive },
})
const tailScan = {
  source: '腾讯行情 + 腾讯分时 (unofficial)', fetchedAt: '2026-10-18T21:06:57+08:00',
  sessionDate: '2026-10-16', sessionIsToday: false,
  window: 'afternoon', windowStart: '14:30', windowEnd: '15:00', complete: true,
  universe: {
    expected: 5577, covered: 5577, screened: 499, intradayChecked: 32,
    tailConfirmed: 2, historyChecked: 2, failedIntraday: 0, failedHistory: 0, partial: false,
  },
  filters: {
    minAmount: 30_000_000, minDayChange: -0.5, minVolumeRatio: 1, minTailRatio: 1.3,
    minTailChange: -0.003, volumeExpansionMultiple: 1.2, minStreak: 2,
  },
  candidates: [
    tailCandidate({ symbol: 'SH.600293', name: '三峡新材', consecutive: true, score: 84, tailRatio: 2.75, tailReturn: -0.0447, streak: 2 }),
    tailCandidate({ symbol: 'SH.603138', name: '海量数据', consecutive: false, score: 57, tailRatio: 1.4, tailReturn: -0.0246, streak: 1 }),
  ],
}
const morningTailScan = {
  ...tailScan,
  window: 'morning', windowStart: '11:00', windowEnd: '11:30',
  candidates: tailScan.candidates.map(candidate => ({
    ...candidate,
    tail: { ...candidate.tail, tailStart: '11:00', tailEnd: '11:30' },
  })),
}
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

async function harness(options: { response?: any; dictionary?: any; rpc?: any; sourceEnabled?: boolean; sourceForced?: boolean; tailDelayMs?: number } = {}) {
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
      if (payload.kind === 'tail-scan') {
        if (options.tailDelayMs) await new Promise(resolve => setTimeout(resolve, options.tailDelayMs))
        return { ok: true, value: { status: 'ready', tailScan: payload.window === 'morning' ? morningTailScan : tailScan } }
      }
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

test('the index grid adds mainland broad indices and Hang Seng quotes without inventing turnover', async () => {
  const extraIndex = (code: string, name: string, price: number, percent: number) => ({
    code, name, price, change: percent * price / 100, changePercent: percent,
    open: price - 10, high: price + 20, low: price - 20, previousClose: price - 2,
    amount: null, quotedAt: QUOTED,
  })
  const expanded = {
    ...overview,
    indices: [
      ...overview.indices,
      extraIndex('SH.000300', '沪深300', 4105.33, 1.71),
      extraIndex('SH.000688', '科创50', 1345.51, 3.04),
      extraIndex('BJ.899050', '北证50', 984.9, 1.88),
      extraIndex('SH.000905', '中证500', 6814.44, 1.42),
      extraIndex('SH.000906', '中证800', 4567.26, 1.89),
      extraIndex('SH.000852', '中证1000', 6734.55, 2.38),
      extraIndex('SH.000985', '中证全指', 5253.73, 1.93),
      extraIndex('HK.HSI', '恒生指数', 23093.37, 0.69),
      extraIndex('HK.HSCEI', '国企指数', 7756.25, 0.87),
      extraIndex('HK.HSTECH', '恒生科技指数', 3871.66, 2.05),
      extraIndex('HK.HSCCI', '红筹指数', 3842.67, 0.2),
      extraIndex('SH.932000', '中证2000', 4321.5, 1.2),
    ],
  }
  const rpc = {
    call: async (_channel: string, endpoint: string, payload: any) => {
      if (endpoint === 'dsh-x-finance.market-preference') return { ok: true, value: { enabled: true, forced: false } }
      if (payload?.kind === 'overview') return { ok: true, value: { status: 'ready', overview: expanded } }
      if (payload?.kind === 'breadth') return { ok: true, value: { status: 'ready', breadth } }
      return { ok: true, value: { status: 'ready', board } }
    },
  }
  const h = await harness({ rpc })
  try {
    const cards = [...h.document.querySelectorAll<HTMLElement>('.dxs-mkt-index')]
    assert.equal(cards.length, 15)
    const byText = (text: string) => cards.find(card => card.textContent?.includes(text))
    // Hang Seng indices have their own daily route, so their cards drill down
    // like the mainland ones; only 中证2000 has no history source at all.
    assert.equal(byText('恒生指数')!.getAttribute('role'), 'button')
    assert.equal(byText('国企指数')!.getAttribute('role'), 'button')
    assert.equal(byText('恒生科技指数')!.getAttribute('role'), 'button')
    assert.equal(byText('红筹指数')!.getAttribute('role'), 'button')
    assert.equal(byText('中证2000')!.getAttribute('role'), null)
    assert.equal(byText('中证1000')!.getAttribute('role'), 'button')
    // 中证500/800 are mainland indices with a working history route, so they drill down.
    assert.equal(byText('中证500')!.getAttribute('role'), 'button')
    assert.equal(byText('中证800')!.getAttribute('role'), 'button')
    assert.match(byText('恒生指数')!.textContent ?? '', /日 K 与量化/)
    assert.doesNotMatch(byText('中证2000')!.textContent ?? '', /日 K 与量化/)
    assert.match(byText('恒生指数')!.textContent ?? '', /GMT\+8/)
    assert.match(h.document.body.textContent ?? '', /港股指数按香港时间、港币计价/)
    assert.match(h.document.body.textContent ?? '', /中证2000 由东方财富公开接口补充/)
    assert.doesNotMatch(h.document.body.textContent ?? '', /NaN|undefined/)
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

test('the tail scan is manual, renders candidates and can filter consecutive deals', async () => {
  const h = await harness()
  try {
    assert.match(h.document.body.textContent ?? '', /尾盘放量下跌扫描/)
    assert.equal(h.document.body.textContent?.includes('三峡新材'), false)
    assert.equal(h.calls.some(call => call.kind === 'tail-scan'), false)
    await h.click(h.button('开始扫描'))
    assert.ok(h.calls.some(call => call.kind === 'tail-scan'))
    const text = h.document.body.textContent ?? ''
    assert.match(text, /三峡新材/)
    assert.match(text, /海量数据/)
    assert.match(text, /2\.75/)
    assert.match(text, /84/)
    assert.match(text, /连续放量/)
    const checkbox = h.document.querySelector('.dxs-tail-controls input') as any
    assert.ok(checkbox)
    await act(async () => { checkbox.click() })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    const filtered = h.document.body.textContent ?? ''
    assert.match(filtered, /三峡新材/)
    assert.equal(filtered.includes('海量数据'), false)
  } finally {
    await h.close()
  }
})

test('the tail scan switches to the morning window and requests that window explicitly', async () => {
  const h = await harness()
  try {
    // The panel opens on the afternoon tail and has not scanned anything yet.
    assert.match(h.document.body.textContent ?? '', /最近交易日 14:30–15:00/)
    assert.equal(h.document.body.textContent?.includes('三峡新材'), false)
    await h.click(h.button('开始扫描'))
    assert.ok(h.calls.some(call => call.kind === 'tail-scan' && call.window === 'afternoon'))
    assert.match(h.document.body.textContent ?? '', /三峡新材/)

    // Switching the session must not show the afternoon table as if it were the
    // morning one, and the next request must name the morning window.
    await h.click(h.button('上午盘'))
    assert.equal(h.document.body.textContent?.includes('三峡新材'), false)
    assert.match(h.document.body.textContent ?? '', /最近交易日 11:00–11:30/)
    await h.click(h.button('开始扫描'))
    assert.ok(h.calls.some(call => call.kind === 'tail-scan' && call.window === 'morning'))
    const text = h.document.body.textContent ?? ''
    assert.match(text, /三峡新材/)
    assert.match(text, /11:00–11:30/)
    assert.equal(h.document.querySelector('.dxs-tail-windows button[aria-pressed="true"]')?.textContent, '上午盘')
  } finally {
    await h.close()
  }
})

test('a result that lands after switching sessions is discarded, not relabelled', async () => {
  const h = await harness({ tailDelayMs: 60 })
  try {
    await h.click(h.button('开始扫描'))
    // The afternoon scan is still in flight when the user switches to the
    // morning window.
    await h.click(h.button('上午盘'))
    assert.match(h.document.body.textContent ?? '', /最近交易日 11:00–11:30/)
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 120)) })
    const text = h.document.body.textContent ?? ''
    assert.equal(text.includes('三峡新材'), false, 'the afternoon table must not appear under the morning window')
    assert.match(text, /尚未|先按成交额/, 'the panel explains it is idle instead of going blank')
    assert.equal(h.document.querySelector('.dxs-tail-windows button[aria-pressed="true"]')?.textContent, '上午盘')
  } finally {
    await h.close()
  }
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

test('the switch paints its on state from theme tokens, never a fixed white knob', () => {
  // Regression: the on state used the host accent as the track and a literal
  // #fff knob. A dark theme can resolve brand-primary to near-white, which
  // collapsed track and knob into one blank pill; the screenshot that reported
  // this showed exactly that. Track and knob must come from opposing tokens.
  const checked = MARKET_CSS.match(/input:checked\+\.dxs-mkt-switch-track\{([^}]*)\}/)![1]
  const knob = MARKET_CSS.match(/input:checked\+\.dxs-mkt-switch-track span\{([^}]*)\}/)![1]
  assert.match(checked, /background:var\(--dxs-fg/)
  assert.match(knob, /background:var\(--dxs-bg/)
  assert.doesNotMatch(knob, /background:#fff/i, 'a literal white knob disappears on a light accent')
  assert.doesNotMatch(checked, /brand-primary/, 'the host accent can equal the knob colour in a dark theme')
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
test('finance page tabs switch between the watchlist, the market panorama, the hot screen, the relay forecast, global markets and gold', async () => {
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
      if (payload.kind === 'tail-scan') return { ok: true, value: { status: 'ready', tailScan: payload.window === 'morning' ? morningTailScan : tailScan } }
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
      useWatchlist, useResource, add: noop, remove: noop, move: noop, select: noop, closePreview: noop, setFixed: noop, toggleBar: noop, back: noop, retryScope: noop,
      t: translation(zh), format: createFormatters(() => 'zh'), getLocale: () => 'zh', rpc,
    })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    const tabs = [...dom.window.document.querySelectorAll<HTMLElement>('.dxs-view-tabs button')]
    assert.equal(tabs.length, 6)
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
    const hotText = dom.window.document.body.textContent ?? ''
    assert.match(hotText, /热点题材/)
    assert.match(hotText, /运行筛选|重新运行/)
    assert.doesNotMatch(hotText, /NaN|undefined/)
    // The relay tab starts idle: mounting it must not fire a market request.
    const before = calls.length
    await act(async () => tabs[3]!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    assert.equal(tabs[3]!.getAttribute('aria-pressed'), 'true')
    const predictText = dom.window.document.body.textContent ?? ''
    assert.match(predictText, /涨停接力/)
    assert.match(predictText, /运行预测/)
    assert.match(predictText, /不是收益承诺/)
    assert.doesNotMatch(predictText, /NaN|undefined/)
    assert.equal(calls.length, before, 'an idle relay tab sends nothing')
    await act(async () => tabs[4]!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    assert.equal(tabs[4]!.getAttribute('aria-pressed'), 'true')
    const globalText = dom.window.document.body.textContent ?? ''
    assert.match(globalText, /全球市场/)
    assert.match(globalText, /道琼斯工业指数/)
    assert.match(globalText, /日经225/)
    assert.match(globalText, /韩国KOSPI/)
    assert.match(globalText, /52,867\.98/)
    // The page names the source that actually answered, so a degraded board
    // never looks like the primary feed.
    assert.match(globalText, /当前来源：东方财富全球指数/)
    assert.doesNotMatch(globalText, /NaN|undefined/)
    await act(async () => tabs[5]!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    assert.equal(tabs[5]!.getAttribute('aria-pressed'), 'true')
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
      if (payload.kind === 'tail-scan') return { ok: true, value: { status: 'ready', tailScan } }
      return { ok: true, value: { status: 'ready', board } }
    },
  }
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(dom.window.document.getElementById('root')!)
  const added: any[] = [], selected: any[] = [], previews: any[] = []
  const state: any = { items: [], collapsed: false, barHidden: false, storageError: '', scopeStatus: 'ready', scopeId: '11111111-1111-4111-8111-111111111111', placement: 'mounted', selectedSymbol: null, preview: null }
  const useWatchlist = (selector: any) => selector(state)
  const useResource = () => ({ status: 'live', value: null })
  const noop = () => {}
  try {
    await act(async () => root.render(React.createElement(pageModule.exports.StockPage, {
      useWatchlist, useResource, add: (item: any) => { added.push(item); state.items.push({ ...item }); state.preview = null; state.selectedSymbol = item.symbol },
      remove: noop, move: noop, select: (symbol: any) => { selected.push(symbol); state.selectedSymbol = symbol; state.preview = null },
      preview: (symbol: any, name: any) => { previews.push({ symbol, name }); state.preview = { symbol, name } },
      closePreview: () => { state.preview = null },
      setFixed: noop, toggleBar: noop, back: noop, retryScope: noop,
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
    // An unknown stock opens as a preview: the watchlist is not touched.
    assert.deepEqual(previews, [{ symbol: 'SH.688825', name: '长鑫科技' }])
    assert.deepEqual(added, [], 'drilling into a stock must not add it to the watchlist')
    assert.match(dom.window.document.body.textContent ?? '', /正在临时查看 长鑫科技/)
    assert.match(dom.window.document.body.textContent ?? '', /临时查看（未加入自选）/)
    // The preview is its own page: no watchlist rail and no tab claims it.
    assert.equal(dom.window.document.querySelector('.dxs-rail'), null, 'a preview must not show the watchlist rail')
    assert.equal(tabs.filter(tab => tab.getAttribute('aria-pressed') === 'true').length, 0)
    assert.ok(dom.window.document.querySelector('.dxs-preview-back'), 'the preview offers a way back')
    // The stub workbench receives the previewed symbol; the real component then
    // requests its history (covered by workbench/history tests).
    const mounted = (globalThis as any).__workbenchStub.calls.at(-1)
    assert.equal(mounted.symbol, 'SH.688825')
    assert.equal(mounted.rpc, rpc)
    // Saving is an explicit second step, and it is the only thing that writes.
    const save = dom.window.document.querySelector<HTMLElement>('.dxs-preview-add')
    assert.ok(save, 'the preview offers an explicit add action')
    assert.equal(save!.textContent, '加入自选')
    await act(async () => save!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    assert.deepEqual(added, [{ symbol: 'SH.688825', alias: '长鑫科技', fixed: false }])
    assert.match(dom.window.document.body.textContent ?? '', /已把 长鑫科技 加入自选/)
    assert.equal(dom.window.document.querySelector('.dxs-preview-add'), null, 'the add action disappears once the stock is saved')
    // Choosing a saved row is how a preview is left; the list is never written.
    await act(async () => tabs[1]!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    const moverAgain = [...dom.window.document.querySelectorAll<HTMLElement>('.dxs-mkt-movers-grid .dxs-mkt-link')][0]
    await act(async () => moverAgain!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    assert.equal(state.preview?.symbol, 'BJ.920196')
    assert.ok(dom.window.document.querySelector('.dxs-preview-add'), 'the preview keeps offering the add action')
    assert.equal(dom.window.document.querySelector('.dxs-rail'), null, 'the preview still hides the rail')
    await act(async () => tabs[0]!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    assert.equal(state.preview, null, 'switching tabs leaves the preview')
    const savedRow = dom.window.document.querySelector<HTMLElement>('.dxs-rail .dxs-select')
    assert.ok(savedRow, 'the saved stock is listed in the rail once the preview closes')
    assert.deepEqual(added, [{ symbol: 'SH.688825', alias: '长鑫科技', fixed: false }], 'leaving a preview saves nothing')
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
      if (payload.kind === 'tail-scan') return { ok: true, value: { status: 'ready', tailScan } }
      return { ok: true, value: { status: 'ready', board } }
    },
  }
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(dom.window.document.getElementById('root')!)
  const added: any[] = [], selected: any[] = [], previews: any[] = []
  const state: any = { items: [{ symbol: 'SH.600519', alias: '茅台', fixed: false }], collapsed: false, barHidden: false, storageError: '', scopeStatus: 'ready', scopeId: '11111111-1111-4111-8111-111111111111', placement: 'mounted', selectedSymbol: 'SH.600519', preview: null }
  const useWatchlist = (selector: any) => selector(state)
  const useResource = () => ({ status: 'live', value: null })
  const noop = () => {}
  try {
    await act(async () => root.render(React.createElement(pageModule.exports.StockPage, {
      useWatchlist, useResource, add: (item: any) => added.push(item), remove: noop, move: noop,
      select: (symbol: any) => { selected.push(symbol); state.selectedSymbol = symbol; state.preview = null },
      preview: (symbol: any, name: any) => { previews.push({ symbol, name }); state.preview = { symbol, name } },
      closePreview: () => { state.preview = null },
      setFixed: noop, toggleBar: noop, back: noop, retryScope: noop,
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
    assert.deepEqual(previews, [{ symbol: 'BJ.920196', name: 'N南乳' }])
    assert.deepEqual(added, [], 'a mover row opens a preview, not a watchlist write')
    assert.match(dom.window.document.body.textContent ?? '', /正在临时查看 N南乳/)
    assert.equal(dom.window.document.querySelector('.dxs-rail'), null, 'a preview hides the watchlist rail')
    const backButton = dom.window.document.querySelector<HTMLElement>('.dxs-preview-back')
    assert.ok(backButton, 'the preview page has a back action')
    await act(async () => backButton!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    assert.equal(state.preview, null, 'back leaves the preview')
    assert.match(dom.window.document.body.textContent ?? '', /市场全景/, 'back returns to the market tab')
    // An index is opened too, but it is not an exchange-qualified A-share, so it
    // must not be written to the watchlist.
    await act(async () => tabs[1]!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    const index = dom.window.document.querySelector<HTMLElement>('.dxs-mkt-index.is-clickable')
    assert.ok(index, 'index cards must be clickable')
    assert.equal(index!.getAttribute('role'), 'button')
    // The big number is part of the card, so clicking it must open the chart
    // rather than requiring the small name link.
    const indexPrice = index!.querySelector<HTMLElement>('.dxs-mkt-index-price')
    assert.ok(indexPrice, 'index card price is rendered')
    await act(async () => indexPrice!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    assert.deepEqual(added, [], 'indices never enter the A-share watchlist')
    assert.deepEqual(previews, [{ symbol: 'BJ.920196', name: 'N南乳' }], 'an index is not previewed as a stock')
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

test('the hot screen runs on demand and renders scores, tags and counts', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
  const original: any = { window: (globalThis as any).window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT }
  ;(globalThis as any).window = dom.window
  globalThis.document = dom.window.document
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  const hotScan = {
    source: '腾讯行情 (unofficial) 排行/日K',
    fetchedAt: '2026-10-24T16:38:00+08:00',
    durationMs: 3868.7,
    strategyCount: 35,
    board: null,
    universe: { expected: 5578, covered: 5578, scanned: 5500, historyChecked: 120, historyFailed: 0, partial: false },
    hitCount: 171,
    hits: [
      { symbol: 'SZ.002249', name: '大洋电机', price: 7.58, changePercent: 7.37, amount: 2_177_020_000, turnoverRate: 15.77, volumeRatio: 7.8, score: 100, hits: ['limit-up', 'volume-ratio-2', 'turnover-10', 'amount-10e', 'main-inflow'] },
      { symbol: 'SZ.300622', name: '博士眼镜', price: 15.57, changePercent: 8.05, amount: 378_000_000, turnoverRate: 6, volumeRatio: 2.1, score: 99.35, hits: ['surge-7', 'volume-ratio-2', 'macd-golden'] },
    ],
  }
  const rpc = {
    call: async (_channel: string, _endpoint: string, payload: any) => {
      if (payload?.action === 'get') return { ok: true, value: { enabled: true, forced: false } }
      if (payload?.kind === 'hot-scan') return { ok: true, value: { status: 'ready', hotScan } }
      if (payload?.kind === 'overview') return { ok: true, value: { status: 'ready', overview } }
      return { ok: true, value: { status: 'unconfigured', source: null } }
    },
  }
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(dom.window.document.getElementById('root')!)
  const state = { items: [], collapsed: false, barHidden: false, storageError: '', scopeStatus: 'ready', scopeId: '11111111-1111-4111-8111-111111111111', placement: 'mounted', selectedSymbol: null }
  const useWatchlist = (selector: any) => selector(state)
  const useResource = () => ({ status: 'live', value: null })
  const noop = () => {}
  try {
    await act(async () => root.render(React.createElement(pageModule.exports.StockPage, {
      useWatchlist, useResource, add: noop, addMany: () => 0, remove: noop, move: noop, select: noop, closePreview: noop, setFixed: noop, toggleBar: noop, back: noop, retryScope: noop,
      t: translation(zh), format: createFormatters(() => 'zh'), getLocale: () => 'zh', rpc,
    })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    const tab = [...dom.window.document.querySelectorAll<HTMLElement>('.dxs-view-tabs button')][2]!
    await act(async () => tab.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    assert.match(dom.window.document.body.textContent ?? '', /热点题材/)
    assert.match(dom.window.document.body.textContent ?? '', /运行筛选/)
    const run = dom.window.document.querySelector<HTMLElement>('.dxs-hot-run')
    assert.ok(run)
    await act(async () => run!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)) })
    const text = dom.window.document.body.textContent ?? ''
    assert.match(text, /大洋电机/)
    assert.match(text, /博士眼镜/)
    assert.match(text, /100\.00/)
    assert.match(text, /99\.35/)
    assert.match(text, /涨停/)
    assert.match(text, /MACD金叉/)
    assert.match(text, /命中 171 只/)
    assert.match(text, /展示前 2 只/)
    assert.doesNotMatch(text, /NaN|undefined/)
    assert.ok(dom.window.document.querySelectorAll('.dxs-hot-row').length === 2)
  } finally {
    await act(async () => root.unmount())
    dom.window.close()
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete (globalThis as any)[key]; else (globalThis as any)[key] = value }
  }
})

test('the CSI 300 drill-down carries the fund-share snapshot and its quarterly trend', async () => {
  const csi300Overview = {
    ...overview,
    indices: [
      index('SH.000001', '上证指数', 3716.28, 0.24, 732_475_190_000),
      index('SH.000300', '沪深300', 4105.33, 1.71, 456_246_629_218),
    ],
  }
  const fund = (code: string, name: string, aum: number) => ({ code, name, type: 'ETF', aum })
  const share = {
    source: '中证指数 + 天天基金 + 腾讯行情 (unofficial)',
    fetchedAt: '2026-10-18T21:06:57+08:00',
    reportDate: '2026-09-30',
    indexFloatCap: 488_918.40e8,
    indexClose: 4103.54,
    indexQuotedAt: QUOTED,
    totalAum: 1614.04e8,
    ratio: 1614.04e8 / (488_918.40e8),
    fundCount: 4,
    funds: [
      fund('510300', '沪深300ETF华泰柏瑞', 1069.56e8),
      fund('510310', '沪深300ETF易方达', 513.17e8),
      fund('160706', '沪深300ETF嘉实', 20e8),
      fund('519300', '大成沪深300指数', 11.31e8),
    ],
    history: [
      { date: '2025-12-31', fundAum: 1508e8, floatCap: 5.51e13, ratio: 1508e8 / 5.51e13 },
      { date: '2026-06-30', fundAum: 1630e8, floatCap: 5.93e13, ratio: 1630e8 / 5.93e13 },
      { date: '2026-09-30', fundAum: 1614.04e8, floatCap: 5.19e13, ratio: 1614.04e8 / 5.19e13 },
    ],
    historyCoverage: 0.98,
    estimatedFloatCap: true,
  }
  const rpc = {
    call: async (_channel: string, endpoint: string, payload: any) => {
      if (endpoint === 'dsh-x-finance.market-preference') return { ok: true, value: { enabled: true, forced: false } }
      if (payload.kind === 'overview') return { ok: true, value: { status: 'ready', overview: csi300Overview } }
      if (payload.kind === 'breadth') return { ok: true, value: { status: 'ready', breadth } }
      if (payload.kind === 'csi300-funds') return { ok: true, value: { status: 'ready', csi300Funds: share } }
      if (payload.kind === 'global') return { ok: true, value: { status: 'ready', global: globalOverview } }
      if (payload.kind === 'history') return { ok: false, error: { code: 'finance/history-unavailable' } }
      return { ok: true, value: { status: 'ready', board } }
    },
  }
  const h = await harness({ rpc })
  try {
    const sse = h.document.querySelector<HTMLElement>('[aria-label="查看 上证指数 的日 K"]')
    await h.click(sse)
    assert.equal(h.document.querySelector('.dxs-csi300'), null, 'the panel is CSI 300 only')

    const csi = h.document.querySelector<HTMLElement>('[aria-label="查看 沪深300 的日 K"]')
    await h.click(csi)
    const text = h.document.body.textContent ?? ''
    assert.match(text, /沪深300基金市值占流通市值比例/)
    assert.match(text, /0\.33%/)
    assert.match(text, /1614\.04亿/)
    assert.match(text, /沪深300ETF华泰柏瑞/)
    assert.match(text, /510300/)
    assert.match(text, /季度趋势/)
    assert.match(text, /查看季度数据表/)
    assert.match(text, /0\.98|98\.00%/)
    assert.ok(h.document.querySelector('.dxs-csi300 svg'), 'the trend is drawn')
    assert.ok(h.document.querySelectorAll('.dxs-csi300-table tbody tr').length >= 4)
    assert.doesNotMatch(text, /NaN|undefined/)
  } finally { await h.close() }
})

test('searching from the page opens a preview and leaves the watchlist untouched', async () => {
  ;(globalThis as any).__workbenchStub = Object.assign((props: any) => { (globalThis as any).__workbenchStub.calls.push(props); return null }, { calls: [] as any[] })
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
  const original: any = { window: (globalThis as any).window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT }
  ;(globalThis as any).window = dom.window
  globalThis.document = dom.window.document
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  const rpc = {
    call: async (_channel: string, endpoint: string, payload: any) => {
      if (endpoint === SEARCH_RPC_ENDPOINT) {
        if (payload?.action === 'status') return { ok: true, value: { enabled: true, available: true, source: 'test', results: [] } }
        return { ok: true, value: { enabled: true, available: true, source: 'test', results: [{ symbol: 'SZ.002594', name: '比亚迪', kind: 'stock' }] } }
      }
      if (payload?.action === 'get') return { ok: true, value: { enabled: true, forced: false } }
      if (payload.kind === 'quotes') return { ok: true, value: { status: 'unconfigured', source: null } }
      if (payload.kind === 'overview') return { ok: true, value: { status: 'ready', overview } }
      if (payload.kind === 'breadth') return { ok: true, value: { status: 'ready', breadth } }
      if (payload.kind === 'global') return { ok: true, value: { status: 'ready', global: globalOverview } }
      if (payload.kind === 'tail-scan') return { ok: true, value: { status: 'ready', tailScan } }
      return { ok: true, value: { status: 'ready', board } }
    },
  }
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(dom.window.document.getElementById('root')!)
  const added: any[] = [], previews: any[] = []
  const state: any = { items: [], collapsed: false, barHidden: false, storageError: '', scopeStatus: 'ready', scopeId: '11111111-1111-4111-8111-111111111111', placement: 'mounted', selectedSymbol: null, preview: null }
  const useWatchlist = (selector: any) => selector(state)
  const useResource = () => ({ status: 'live', value: null })
  const noop = () => {}
  const flush = async (ms = 20) => { await act(async () => { await new Promise(resolve => setTimeout(resolve, ms)) }) }
  try {
    await act(async () => root.render(React.createElement(pageModule.exports.StockPage, {
      useWatchlist, useResource, add: (item: any) => { added.push(item) },
      remove: noop, move: noop, select: (symbol: any) => { state.selectedSymbol = symbol; state.preview = null },
      preview: (symbol: any, name: any) => { previews.push({ symbol, name }); state.preview = { symbol, name } },
      closePreview: () => { state.preview = null },
      setFixed: noop, toggleBar: noop, back: noop, retryScope: noop,
      t: translation(zh), format: createFormatters(() => 'zh'), getLocale: () => 'zh', rpc,
    })))
    await flush()
    const input = dom.window.document.querySelector<HTMLInputElement>('.dxs-lookup input[type="search"]')
    assert.ok(input, 'the page offers a lookup field')
    assert.equal(input!.closest('.dxs-form'), null, 'looking a stock up is not a step of the add form')
    assert.ok(dom.window.document.querySelector('.dxs-form input[type="search"]'), 'the add form keeps its own search')
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, '比亚')
    await act(async () => input!.dispatchEvent(new dom.window.Event('input', { bubbles: true })))
    // The directory call is debounced, exactly like the add form.
    await flush(320)
    const option = dom.window.document.querySelector<HTMLElement>('.dxs-lookup [role="option"]')
    assert.ok(option, 'the lookup lists matches')
    assert.match(option!.textContent ?? '', /比亚迪/)
    await act(async () => option!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
    await flush()
    assert.deepEqual(previews, [{ symbol: 'SZ.002594', name: '比亚迪' }])
    assert.deepEqual(added, [], 'looking a stock up must not add it to the watchlist')
    assert.equal(input!.value, '')
    const text = dom.window.document.body.textContent ?? ''
    assert.match(text, /正在临时查看 比亚迪/)
    assert.match(text, /临时查看（未加入自选）/)
    assert.ok(dom.window.document.querySelector('.dxs-preview-add'), 'saving stays an explicit second step')
    assert.ok(dom.window.document.querySelector('.dxs-rail') === null, 'a preview keeps its own full-width page')
    assert.ok(dom.window.document.querySelector('.dxs-lookup input'), 'the lookup stays usable while previewing')
  } finally {
    await act(async () => root.unmount())
    dom.window.close()
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete (globalThis as any)[key]; else (globalThis as any)[key] = value }
  }
})
