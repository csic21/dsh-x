import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { zh } from '../src/client/locales.ts'
import { createFormatters } from '../src/client/format.ts'
import { shanghaiToday } from '../src/market.ts'
import { SEARCH_RPC_ENDPOINT } from '../src/instrument-search.ts'

const translation = (dictionary: any) => (key: string, params: Record<string, any> = {}) =>
  String(dictionary[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`)
const bundle = await build({
  entryPoints: [new URL('../src/client/watch-signals-view.tsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'],
})
const module_ = { exports: {} as any }
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(module_, module_.exports, createRequire(import.meta.url))

const symbol = 'SH.600519'
function history(isFinal: boolean, direction = 'buy') {
  const end = Date.parse(`${shanghaiToday(Date.now())}T00:00:00Z`)
  return {
    symbol, name: '测试股份', source: '测试源', fetchedAt: new Date().toISOString(), adjustment: 'forward', pricePrecision: 2,
    bars: Array.from({ length: 130 }, (_, index) => {
      const close = direction === 'sell' && index >= 128 ? 150 - (index - 128) * 10 : 100 + index
      return { sessionDate: new Date(end - (129 - index) * 86_400_000).toISOString().slice(0, 10),
        open: close, close, isFinal: index < 129 || isFinal }
    }),
  }
}
async function render(enabled: boolean, kind = 'stock', name = '测试股份', direction = 'buy') {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
  const original: any = { window: (globalThis as any).window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT }
  ;(globalThis as any).window = dom.window
  globalThis.document = dom.window.document
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  const calls: any[] = [], opened: string[] = []
  const rpc = { async call(_channel: string, endpoint: string, request: any) {
    calls.push({ endpoint, request })
    if (endpoint === SEARCH_RPC_ENDPOINT) return { ok: true, value: { status: 'ready', results: [{ symbol, name, kind }] } }
    return { ok: true, value: { status: 'ready', history: history(false, direction) } }
  } }
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(dom.window.document.getElementById('root')!)
  await act(async () => root.render(React.createElement(module_.exports.WatchSignals, {
    rpc, items: [{ symbol, alias: '' }], sourceEnabled: enabled,
    t: translation(zh), format: createFormatters(() => 'zh'), onOpen: (value: string) => opened.push(value),
  })))
  return { dom, document: dom.window.document, calls, opened, async click(text: string) {
    const button = [...dom.window.document.querySelectorAll('button')].find(entry => entry.textContent?.includes(text))
    assert.ok(button, `button ${text} exists`)
    await act(async () => { button!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
  }, async close() {
    await act(async () => root.unmount()); dom.window.close()
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete (globalThis as any)[key]; else (globalThis as any)[key] = value }
  } }
}

test('watchlist signals are opt-in, explain their values and mark provisional bars', async () => {
  const h = await render(true)
  try {
    assert.match(h.document.body.textContent ?? '', /自选量化信号/)
    assert.equal(h.calls.length, 0)
    await h.click('分析我的自选')
    const text = h.document.body.textContent ?? ''
    assert.equal(h.calls.length, 2)
    assert.match(text, /买入观察信号/)
    assert.match(text, /未确认：当日 K 线可能变动/)
    assert.match(text, /此前 20 根最高收盘价/)
    assert.match(text, /不读取持仓，也不下单/)
    assert.match(text, /样本内粗略回放/)
    assert.match(text, /未计最低佣金、停牌、涨跌停/)
    assert.match(text, /已处理 1 \/ 1/)
    assert.doesNotMatch(text, /NaN|undefined/)
    await h.click('测试股份')
    assert.deepEqual(h.opened, [symbol])
  } finally { await h.close() }
})

test('exit signal is conditional on holding and explains both averages', async () => {
  const h = await render(true, 'stock', '测试股份', 'sell')
  try {
    await h.click('分析我的自选')
    const text = h.document.body.textContent ?? ''
    assert.match(text, /若持有：退出／风控信号/)
    assert.match(text, /分别低于当日 MA20/)
    assert.match(text, /未确认：当日 K 线可能变动/)
    assert.doesNotMatch(text, /买入观察信号/)
  } finally { await h.close() }
})

test('disabled source cannot trigger network requests', async () => {
  const h = await render(false)
  try {
    assert.match(h.document.body.textContent ?? '', /先开启本机免费源/)
    const button = [...h.document.querySelectorAll('button')].find(entry => entry.textContent?.includes('分析我的自选'))
    assert.ok(button?.disabled)
    assert.equal(h.calls.length, 0)
  } finally { await h.close() }
})

test('ETFs are not presented with stock buy signals', async () => {
  const h = await render(true, 'etf')
  try {
    await h.click('分析我的自选')
    assert.equal(h.calls.length, 1)
    assert.match(h.document.body.textContent ?? '', /非普通股票/)
    assert.doesNotMatch(h.document.body.textContent ?? '', /买入观察信号/)
  } finally { await h.close() }
})

test('ST directory label suppresses a buy signal', async () => {
  const h = await render(true, 'stock', '*ST 测试')
  try {
    await h.click('分析我的自选')
    const text = h.document.body.textContent ?? ''
    assert.match(text, /风险标记：暂停买入信号/)
    assert.match(text, /状态未与交易所核对/)
    assert.doesNotMatch(text, /买入观察信号/)
  } finally { await h.close() }
})
