import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { zh } from '../src/client/locales.ts'
import { SEARCH_RPC_ENDPOINT } from '../src/instrument-search.ts'
import { MARKET_PREFERENCE_ENDPOINT } from '../src/market.ts'

// jsdom interaction test for the real search component. All directory rows are
// explicit offline fixtures; no assertion here claims a live security.
const bundle = await build({
  entryPoints: [new URL('../src/client/SearchBox.tsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'],
})

const BYD = { symbol: 'SZ.002594', name: '比亚迪', kind: 'stock' }
const ETF = { symbol: 'SH.510300', name: '沪深300ETF华泰柏瑞', kind: 'etf' }
const LOF = { symbol: 'SZ.160706', name: '嘉实沪深300ETF联接(LOF)A', kind: 'fund' }

async function harness(options: any = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' })
  const original: any = { window: (globalThis as any).window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT }
  ;(globalThis as any).window = dom.window
  globalThis.document = dom.window.document
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  const calls: any[] = []
  const picked: any[] = []
  let enabled = options.enabled === true
  const rpc = {
    call: async (_channel: any, endpoint: any, payload: any, signal: any) => {
      calls.push(JSON.parse(JSON.stringify({ endpoint, payload })))
      if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
      if (endpoint === MARKET_PREFERENCE_ENDPOINT) {
        if (payload?.action !== 'set' || payload?.enabled !== true) return { ok: false, error: { code: 'finance/invalid-input' } }
        if (options.enableFails) return { ok: false, error: { code: 'finance/market-preference-unavailable' } }
        enabled = true
        return { ok: true, value: { enabled: true, forced: false } }
      }
      assert.equal(endpoint, SEARCH_RPC_ENDPOINT)
      if (payload?.action === 'status') return options.statusFails ? { ok: false, error: { code: 'finance/not-found' } } : { ok: true, value: { status: enabled ? 'ready' : 'disabled', enabled, available: options.providerMissing ? false : true, source: 'test', results: [] } }
      if (payload?.action !== 'search') return { ok: false, error: { code: 'finance/invalid-query' } }
      if (options.searchFails) return { ok: false, error: { code: 'finance/search-unavailable' } }
      const rows = typeof options.rows === 'function' ? options.rows(payload.query) : options.rows ?? [BYD, ETF, LOF]
      if (options.delayMs) await new Promise(resolve => setTimeout(resolve, options.delayMs))
      if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
      return { ok: true, value: { status: enabled ? 'ready' : 'disabled', enabled, available: true, source: 'test', results: rows } }
    },
  }
  const module: any = { exports: {} }
  vm.runInNewContext(bundle.outputFiles[0].text, {
    module, exports: module.exports, require: createRequire(import.meta.url), console,
    window: dom.window, document: dom.window.document, setTimeout, clearTimeout, AbortController, AbortSignal,
  })
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(dom.window.document.getElementById('root')!)
  const t = (key: any) => zh[key as keyof typeof zh] ?? key
  await act(async () => root.render(React.createElement(module.exports.InstrumentSearch, {
    rpc, t, delay: options.delay ?? 0, onPick: (match: any) => picked.push(JSON.parse(JSON.stringify(match))),
  })))
  const flush = async (ms = 6) => { await act(async () => { await new Promise(resolve => setTimeout(resolve, ms)) }) }
  const input = () => dom.window.document.querySelector<HTMLElement & HTMLInputElement>('input[type="search"]')!
  const type = async (value: string) => {
    const element = input()
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(element, value)
    await act(async () => element.dispatchEvent(new dom.window.Event('input', { bubbles: true })))
  }
  const key = async (name: string) => { await act(async () => input().dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: name, bubbles: true }))) }
  return {
    dom, document: dom.window.document, calls, picked, type, key, flush, input,
    options: () => [...dom.window.document.querySelectorAll('[role="option"]')].map(element => element.textContent),
    button: (label: string) => [...dom.window.document.querySelectorAll('button')].find(element => element.textContent === label),
    async click(element: any) { assert.ok(element, 'Expected a clickable element'); await act(async () => element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))) },
    async close() {
      await act(async () => root.unmount())
      dom.window.close()
      for (const [name, value] of Object.entries(original)) { if (value === undefined) delete (globalThis as any)[name as keyof typeof globalThis]; else (globalThis as any)[name as keyof typeof globalThis] = value }
    },
  }
}

test('an enabled directory debounces a name query and picks the chosen instrument', async () => {
  const h = await harness({ enabled: true, delay: 20 })
  try {
    assert.match(h.document.body.textContent!, /搜索使用本机免费源/)
    await h.type('比亚')
    assert.equal(h.calls.length, 1, 'Nothing is requested before the debounce fires')
    await h.flush(40)
    assert.deepEqual(h.calls.at(-1), { endpoint: SEARCH_RPC_ENDPOINT, payload: { action: 'search', query: '比亚' } })
    assert.deepEqual(h.options(), ['比亚迪SZ.002594股票', '沪深300ETF华泰柏瑞SH.510300ETF', '嘉实沪深300ETF联接(LOF)ASZ.160706LOF'])
    assert.equal(h.input().getAttribute('aria-expanded'), 'true')
    await h.click(h.document.querySelector('[role="option"]'))
    assert.deepEqual(h.picked, [BYD])
    assert.equal(h.input().value, '')
    assert.equal(h.document.querySelector('[role="listbox"]'), null)
  } finally { await h.close() }
})

test('keyboard navigation selects a result and escape closes the list', async () => {
  const h = await harness({ enabled: true })
  try {
    await h.type('300ETF')
    await h.flush()
    assert.equal(h.document.querySelector('[role="option"][aria-selected="true"]')!.textContent, '比亚迪SZ.002594股票')
    await h.key('ArrowDown')
    assert.equal(h.document.querySelector('[role="option"][aria-selected="true"]')!.textContent, '沪深300ETF华泰柏瑞SH.510300ETF')
    await h.key('ArrowUp')
    assert.equal(h.document.querySelector('[role="option"][aria-selected="true"]')!.textContent, '比亚迪SZ.002594股票')
    await h.key('Escape')
    assert.equal(h.document.querySelector('[role="listbox"]'), null)
    await h.key('Enter')
    assert.deepEqual(h.picked, [])
    await h.key('ArrowDown')
    await h.key('Enter')
    assert.deepEqual(h.picked, [BYD])
  } finally { await h.close() }
})

test('the disabled directory explains the shared switch and can turn it on in place', async () => {
  const h = await harness({ enabled: false })
  try {
    assert.match(h.document.body.textContent!, /名称搜索未开启/)
    assert.equal(h.document.body.textContent!.includes('名称搜索不可用'), false)
    assert.deepEqual(h.calls, [{ endpoint: SEARCH_RPC_ENDPOINT, payload: { action: 'status' } }])
    await h.click(h.button('开启免费源'))
    assert.ok(h.calls.some((call: any) => call.endpoint === MARKET_PREFERENCE_ENDPOINT && call.payload?.action === 'set' && call.payload?.enabled === true),
      'Turning the switch on goes through the existing owner-only preference route')
    await h.flush()
    assert.match(h.document.body.textContent!, /搜索使用本机免费源/)
    await h.type('比亚')
    await h.flush()
    assert.deepEqual(h.picked, [])
    assert.equal(h.options().length, 3)
  } finally { await h.close() }
})

test('a failing switch reports the error and leaves the manual fields usable', async () => {
  const h = await harness({ enabled: false, enableFails: true })
  try {
    await h.click(h.button('开启免费源'))
    await h.flush()
    assert.match(h.document.querySelector('[role="alert"]')!.textContent!, /无法开启免费源/)
    assert.ok(h.button('开启免费源'), 'The switch stays available for a retry')
  } finally { await h.close() }
})

test('empty, failing and unavailable directories each surface a clear message', async () => {
  const empty = await harness({ enabled: true, rows: [] })
  try {
    await empty.type('不存在')
    await empty.flush()
    assert.match(empty.document.body.textContent!, /没有匹配的 A 股、ETF、LOF 或 REIT/)
  } finally { await empty.close() }

  const failing = await harness({ enabled: true, searchFails: true })
  try {
    await failing.type('比亚')
    await failing.flush()
    assert.match(failing.document.querySelector('[role="alert"]')!.textContent!, /名称搜索暂不可用/)
  } finally { await failing.close() }

  const unavailable = await harness({ enabled: true, statusFails: true })
  try {
    assert.match(unavailable.document.body.textContent!, /名称搜索不可用/)
    assert.equal(unavailable.input().disabled, true)
  } finally { await unavailable.close() }

  const providerMissing = await harness({ enabled: true, providerMissing: true })
  try {
    assert.match(providerMissing.document.body.textContent!, /名称搜索不可用/)
    assert.equal(providerMissing.document.body.textContent!.includes('开启免费源'), false)
  } finally { await providerMissing.close() }
})

test('a stale response never replaces the newest query', async () => {
  const h = await harness({ enabled: true, delayMs: 10, rows: (query: string) => query === 'ab' ? [ETF] : [BYD] })
  try {
    await h.type('a')
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 3)) })
    await h.type('ab')
    await h.flush(40)
    assert.deepEqual(h.options(), ['沪深300ETF华泰柏瑞SH.510300ETF'])
    assert.equal(h.calls.at(-1).payload.query, 'ab')
  } finally { await h.close() }
})
