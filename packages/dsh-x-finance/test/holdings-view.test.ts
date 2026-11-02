import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { zh } from '../src/client/locales.ts'
import { createFormatters } from '../src/client/format.ts'
import { MARKET_ENDPOINT } from '../src/market.ts'

const bundle = await build({
  entryPoints: [new URL('../src/client/HoldingsPanel.tsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'],
})

const holding = (code: string, name: string, weight: number) => ({ code, name, market: '1', weight, shares: 10, marketValue: 1000 })

async function render(symbol: string, payload: any) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' })
  const original: any = { window: (globalThis as any).window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT }
  ;(globalThis as any).window = dom.window
  globalThis.document = dom.window.document
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  const calls: any[] = []
  const rpc = {
    call: async (_channel: any, endpoint: any, request: any) => {
      calls.push({ endpoint, request })
      return payload
    },
  }
  const module: any = { exports: {} }
  vm.runInNewContext(bundle.outputFiles[0].text, {
    module, exports: module.exports, require: createRequire(import.meta.url), console,
    window: dom.window, document: dom.window.document, setTimeout, clearTimeout, AbortController, AbortSignal,
  })
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(dom.window.document.getElementById('root')!)
  const t = (key: string, vars?: Record<string, string>) => {
    let text: string = zh[key as keyof typeof zh] ?? key
    for (const [name, value] of Object.entries(vars ?? {})) text = text.replaceAll(`{${name}}`, value)
    return text
  }
  const format = createFormatters(() => 'zh')
  await act(async () => { root.render(React.createElement(module.exports.EtfHoldingsPanel, { symbol, rpc, t, format })); await Promise.resolve() })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  return {
    calls,
    text: () => dom.window.document.body.textContent ?? '',
    async close() {
      await act(async () => root.unmount())
      dom.window.close()
      for (const [name, value] of Object.entries(original)) {
        if (value === undefined) delete (globalThis as any)[name]
        else (globalThis as any)[name] = value
      }
    },
  }
}

const book = {
  ok: true,
  value: {
    status: 'ready',
    holdings: {
      symbol: 'SH.510300', applicable: true, source: '天天基金持仓 (unofficial)', fetchedAt: '2026-10-27T00:00:00.000Z',
      latest: { label: '2026年3季度', reportDate: '2026-09-30', complete: false, truncated: false, holdings: [holding('600519', '贵州茅台', 3.56), holding('601318', '中国平安', 2.23)] },
      full: { label: '2026年2季度', reportDate: '2026-06-30', complete: true, truncated: false, holdings: Array.from({ length: 30 }, (_, index) => holding(String(600000 + index), `成分${index}`, 1)) },
    },
  },
}

test('a stock detail does not request or render holdings', async () => {
  const view = await render('SH.600519', book)
  try {
    assert.equal(view.text().includes('持仓成分'), false)
    assert.deepEqual(view.calls, [])
  } finally { await view.close() }
})

test('an ETF detail shows the latest top 10 and the newest full book', async () => {
  const view = await render('SH.510300', book)
  try {
    assert.equal(view.calls.length, 1)
    assert.equal(view.calls[0].endpoint, MARKET_ENDPOINT)
    assert.deepEqual({ ...view.calls[0].request }, { kind: 'holdings', symbol: 'SH.510300' })
    assert.match(view.text(), /持仓成分/)
    assert.match(view.text(), /贵州茅台/)
    assert.match(view.text(), /3\.56%/)
    assert.match(view.text(), /最新披露 2026-09-30/)
    assert.match(view.text(), /前十大/)
    assert.match(view.text(), /最近完整持仓 2026-06-30/)
    assert.match(view.text(), /成分0/)
    assert.match(view.text(), /不是实时持仓/)
  } finally { await view.close() }
})

test('a fund with no stock disclosure says so instead of inventing rows', async () => {
  const view = await render('SH.518880', { ok: true, value: { status: 'ready', holdings: { symbol: 'SH.518880', applicable: true, source: '天天基金持仓 (unofficial)', fetchedAt: '2026-10-27T00:00:00.000Z', latest: null, full: null } } })
  try {
    assert.match(view.text(), /没有披露股票持仓/)
    assert.equal(view.text().includes('贵州茅台'), false)
  } finally { await view.close() }
})
