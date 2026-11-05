import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { newsZh } from '../src/client/news/locales.ts'
import { createFormatters } from '../src/client/format.ts'
import { alignNews, newsAroundMove, sessionMoves, shanghaiClock, shanghaiDay } from '../src/client/news/align.ts'

const translate = (dictionary: any) => (key: any, params?: any) => {
  const text = dictionary[key] ?? key
  return params ? text.replace(/\{(\w+)\}/g, (_: any, name: string) => String(params[name] ?? '')) : text
}
const t = translate(newsZh)

const bundle = await build({
  entryPoints: [new URL('../src/client/news/NewsPanel.tsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'],
})

// ── pure alignment ──────────────────────────────────────────────────────────

const SESSION = {
  symbol: 'SZ.300308',
  name: '中际旭创',
  sessionDate: '2026-11-05',
  previousClose: 100,
  pricePrecision: 2,
  points: [
    { time: '09:30', price: 100, volume: 10, average: 100 },
    { time: '10:00', price: 100.2, volume: 10, average: 100.1 },
    { time: '10:30', price: 99.4, volume: 30, average: 99.9 },
    { time: '10:35', price: 98.6, volume: 40, average: 99.7 },
    { time: '11:00', price: 98.8, volume: 10, average: 99.6 },
    { time: '11:30', price: 99.5, volume: 10, average: 99.6 },
    { time: '13:00', price: 100.4, volume: 10, average: 99.7 },
    { time: '14:30', price: 101.2, volume: 10, average: 99.9 },
    { time: '15:00', price: 101.0, volume: 10, average: 100 },
  ],
}

const item = (overrides: Record<string, unknown> = {}) => ({
  id: 'sina:1',
  at: '2026-11-05T02:33:00.000Z', // 10:33 Shanghai
  title: '机构下调评级',
  summary: null,
  media: '新浪财经',
  url: 'https://finance.sina.cn/7x24/x.d.html',
  tags: ['公司'],
  direct: true,
  symbols: [{ symbol: 'SZ.300308', name: '中际旭创' }],
  ...overrides,
})

test('news alignment prices a headline against the minute it was published', () => {
  const [entry] = alignNews([item()] as any, SESSION)
  assert.equal(entry!.clock, '10:33')
  assert.equal(entry!.inSession, true)
  // The last bar at or before 10:33 is 10:30's 99.4; 30 minutes later is 98.8.
  assert.equal(entry!.price, 99.4)
  assert.equal(entry!.afterPrice, 98.8)
  assert.ok(Math.abs(entry!.afterChangePercent! - (-0.6036)) < 0.01)
  assert.equal(shanghaiClock('2026-11-05T02:33:00.000Z'), '10:33')
  assert.equal(shanghaiDay('2026-11-05T02:33:00.000Z'), '2026-11-05')
})

test('a headline from another day is never priced against this session', () => {
  const [entry] = alignNews([item({ at: '2026-11-03T02:33:00.000Z' })] as any, SESSION)
  assert.equal(entry!.inSession, false)
  assert.equal(entry!.price, null)
  assert.equal(entry!.afterChangePercent, null)
})

test('the session moves are the largest non-overlapping swings', () => {
  const moves = sessionMoves(SESSION)
  assert.equal(moves.length, 1)
  assert.deepEqual(moves[0]!.from, '10:30')
  assert.deepEqual(moves[0]!.to, '10:35')
  // 99.4 -> 98.6 across 10:30-10:35 is the only window with a bar exactly five
  // minutes earlier; the lunch gap cannot manufacture a second one.
  assert.ok(Math.abs(moves[0]!.changePercent - -0.8048) < 0.01)
})

test('a headline is attached to the swing it sits next to', () => {
  const aligned = alignNews([item()] as any, SESSION)
  const rows = newsAroundMove(sessionMoves(SESSION), aligned)
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0]!.news.map(entry => entry.item.id), ['sina:1'])
})

test('no session means no moves and no fake prices', () => {
  assert.deepEqual(sessionMoves(null), [])
  assert.deepEqual(sessionMoves({ points: [] }), [])
  const [entry] = alignNews([item()] as any, null)
  assert.equal(entry!.inSession, false)
})

// ── rendered panel ──────────────────────────────────────────────────────────

const stockFeed = {
  scope: 'stock',
  symbol: 'SZ.300308',
  source: '东方财富资讯 (unofficial)',
  fetchedAt: '2026-11-05T04:10:00.000Z',
  partial: false,
  items: [item(), item({ id: 'em:2', at: '2026-11-05T01:00:00.000Z', title: '中际旭创获融资买入', summary: '融资余额上升。', media: '第一财经', tags: [], url: 'https://finance.eastmoney.com/a/1.html' })],
}

const flashFeed = {
  scope: 'flash',
  symbol: null,
  source: '新浪财经 7x24 (unofficial)',
  fetchedAt: '2026-11-05T04:10:00.000Z',
  partial: false,
  items: [
    item({ id: 'sina:9', at: '2026-11-05T04:05:00.000Z', title: '白酒股尾盘走弱', tags: ['市场'], symbols: [] }),
    item({ id: 'sina:8', at: '2026-11-05T04:01:00.000Z', title: '中粮科技项目投产', tags: ['公司'], symbols: [{ symbol: 'SZ.000930', name: '中粮科技' }] }),
  ],
}

async function harness({ route }: { route: (payload: any, endpoint: string) => any }) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
  const original: any = { window: (globalThis as any).window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT }
  ;(globalThis as any).window = dom.window
  globalThis.document = dom.window.document
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  const calls: any[] = []
  const rpc = { call: async (_channel: string, endpoint: string, payload: any) => { calls.push({ endpoint, payload }); return route(payload, endpoint) } }
  const module: any = { exports: {} }
  vm.runInNewContext(bundle.outputFiles[0].text, {
    module, exports: module.exports, require: createRequire(import.meta.url),
    console, window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    Intl, TextEncoder, AbortController, setTimeout, clearTimeout, URL,
    fetch: () => assert.fail('The news panel must not open its own network connection'),
  })
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(dom.window.document.getElementById('root')!)
  const opened: any[] = []
  await act(async () => root.render(React.createElement((module.exports as any).NewsPanel, {
    symbol: 'SZ.300308', name: '中际旭创', rpc,
    t, format: createFormatters(() => 'zh'), onOpenStock: (symbol: any, name: any) => opened.push({ symbol, name }),
  })))
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
  const document = dom.window.document
  const button = (label: any) => [...document.querySelectorAll('button')].find(element => element.textContent === label)
  const click = async (element: any) => { assert.ok(element, 'Expected an element'); await act(async () => element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))) }
  const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) }) }
  return {
    document, calls, opened, button, click, settle,
    async close() {
      await act(async () => root.unmount())
      dom.window.close()
      for (const [key, value] of Object.entries(original)) { if (value === undefined) delete (globalThis as any)[key]; else (globalThis as any)[key] = value }
    },
  }
}

const routeFor = (overrides: any = {}) => (payload: any, endpoint: string) => {
  if (endpoint === 'dsh-x-finance.news') {
    if (overrides.news) return overrides.news(payload)
    return { ok: true, value: { status: 'ready', news: payload.kind === 'stock' ? stockFeed : flashFeed } }
  }
  if (endpoint === 'dsh-x-finance.market' && payload.kind === 'intraday') {
    if (overrides.intraday) return overrides.intraday()
    return { ok: true, value: { status: 'ready', intraday: SESSION } }
  }
  return { ok: false, error: { code: 'finance/unexpected' } }
}

test('the stock tab pairs each headline with the price it was published at', async () => {
  const h = await harness({ route: routeFor() })
  try {
    const text = h.document.body.textContent ?? ''
    assert.match(text, /中际旭创/)
    assert.match(text, /今日异动/)
    assert.match(text, /发布时 99\.40/)
    assert.match(text, /30 分钟后 98\.80/)
    // The slice it was priced against is labelled, and causality is denied.
    assert.match(text, /只做时间对照，不代表因果关系/)
    assert.match(text, /时间相邻不代表因果/)
    const tabs = [...h.document.querySelectorAll('.dxs-news-head .dxs-view-tabs button')]
    assert.deepEqual(tabs.map(tab => tab.textContent), ['本股', '全市场'])
    assert.equal(tabs[0]!.getAttribute('aria-pressed'), 'true')
    // The article link is an anchor to the publisher, not a local action. The
    // move board repeats the headline it pairs with the swing, so the first row
    // is expected twice: once as context, once in the full timeline.
    const links = [...h.document.querySelectorAll('.dxs-news-title a')] as HTMLAnchorElement[]
    assert.deepEqual(links.map(link => link.getAttribute('href')), ['https://finance.sina.cn/7x24/x.d.html', 'https://finance.sina.cn/7x24/x.d.html', 'https://finance.eastmoney.com/a/1.html'])
    assert.equal(links[0]!.getAttribute('rel'), 'noreferrer')
    // The tagged symbol is a real button into the page's drill-down.
    await h.click([...h.document.querySelectorAll('.dxs-news-symbol')][0])
    assert.deepEqual(h.opened, [{ symbol: 'SZ.300308', name: '中际旭创' }])
    // Only the stock route and the minute line were requested.
    assert.deepEqual(h.calls.map(call => call.payload.kind), ['stock', 'intraday'])
  } finally { await h.close() }
})

test('the market tab loads the wire, filters by topic and keeps the request shape', async () => {
  const h = await harness({ route: routeFor() })
  try {
    await h.click(h.button('全市场'))
    await h.settle()
    const text = h.document.body.textContent ?? ''
    assert.match(text, /白酒股尾盘走弱/)
    assert.match(text, /中粮科技项目投产/)
    assert.equal(h.calls.filter(call => call.payload.kind === 'flash').length, 1)
    const chips = [...h.document.querySelectorAll('.dxs-news-filters button')].map(button => button.textContent)
    assert.deepEqual(chips, ['全部', '市场', '公司'])
    await h.click(h.button('市场'))
    const filtered = h.document.body.textContent ?? ''
    assert.match(filtered, /白酒股尾盘走弱/)
    assert.doesNotMatch(filtered, /中粮科技项目投产/)
    await h.click(h.button('全部'))
    assert.match(h.document.body.textContent ?? '', /中粮科技项目投产/)
  } finally { await h.close() }
})

test('a closed source says so instead of asking for data', async () => {
  const h = await harness({ route: routeFor({ news: () => ({ ok: true, value: { status: 'unconfigured' } }) }) })
  try {
    assert.match(h.document.body.textContent ?? '', /资讯未开启/)
    assert.match(h.document.body.textContent ?? '', /共用同一个本机免费源/)
    assert.doesNotMatch(h.document.body.textContent ?? '', /NaN|undefined/)
  } finally { await h.close() }
})

test('an empty answer is an empty state, not an error card', async () => {
  const h = await harness({
    route: routeFor({ news: (payload: any) => ({ ok: true, value: { status: 'ready', news: { ...(payload.kind === 'stock' ? stockFeed : flashFeed), items: [] } } }) }),
  })
  try {
    assert.match(h.document.body.textContent ?? '', /今天没有找到直接提到这只股票的资讯/)
    assert.doesNotMatch(h.document.body.textContent ?? '', /资讯暂不可用/)
  } finally { await h.close() }
})

test('a failed request offers a retry instead of pretending the list is empty', async () => {
  const h = await harness({ route: routeFor({ news: () => ({ ok: false, error: { code: 'finance/news-unavailable' } }) }) })
  try {
    assert.match(h.document.body.textContent ?? '', /资讯暂不可用/)
    assert.ok(h.button('重试'), 'the error state keeps a retry action')
  } finally { await h.close() }
})
