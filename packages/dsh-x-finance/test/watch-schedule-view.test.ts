import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { zh } from '../src/client/locales.ts'
import { createFormatters } from '../src/client/format.ts'

const translate = (key: string, params: Record<string, any> = {}) => String((zh as any)[key] ?? key)
  .replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`)
const bundle = await build({ entryPoints: [new URL('../src/client/watch-signals-view.tsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'] })
const module_ = { exports: {} as any }
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(module_, module_.exports, createRequire(import.meta.url))
const scope = '11111111-1111-4111-8111-111111111111'
const symbol = 'SH.600519'
const initial = () => ({ enabled: false, running: false, syncedCount: 0, lastAttemptDate: null, updatedAt: null,
  resultDate: null, rows: [], error: null, sourceEnabled: true, partial: false, freshness: 'empty', blockedReason: 'disabled' })

async function render(enabled = true, initialState: any = initial(), failDisable = false) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
  const original: any = { window: (globalThis as any).window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT }
  ;(globalThis as any).window = dom.window; globalThis.document = dom.window.document; (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  let state = initialState
  const calls: any[] = []
  const rpc = { async call(_channel: string, endpoint: string, payload: any) {
    calls.push({ endpoint, payload })
    assert.equal(endpoint, 'dsh-x-finance.watch-schedule')
    if (payload.action === 'enable' || payload.action === 'sync') state = { ...state, enabled: true, syncedCount: payload.symbols.length, blockedReason: 'before-window' }
    if (payload.action === 'disable' && failDisable) return { ok: false, error: { code: 'finance/schedule-storage-unavailable' } }
    if (payload.action === 'disable') state = initial()
    return { ok: true, value: state }
  } }
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(dom.window.document.getElementById('root')!)
  await act(async () => root.render(React.createElement(module_.exports.WatchSignals, {
    rpc, scope, items: [{ symbol, alias: '我的自选' }], sourceEnabled: enabled,
    t: translate, format: createFormatters(() => 'zh'),
  })))
  return { dom, document: dom.window.document, calls, async click(text: string) {
    const button = [...dom.window.document.querySelectorAll('button')].find(entry => entry.textContent?.includes(text))
    assert.ok(button, `button ${text} exists`)
    await act(async () => { button!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
  }, async close() {
    await act(async () => root.unmount()); dom.window.close()
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete (globalThis as any)[key]; else (globalThis as any)[key] = value }
  } }
}

test('daily schedule requires explicit consent, scoped symbol sync, and confirmed disabling', async () => {
  const h = await render()
  try {
    assert.deepEqual(h.calls.map(call => call.payload.action), ['get'])
    assert.match(h.document.body.textContent ?? '', /代码及后台分析结果.*保存到此 profile/)
    await h.click('同意同步并启用每日分析')
    assert.deepEqual(h.calls.at(-1)?.payload, { action: 'enable', scope, symbols: [symbol], consent: true })
    assert.match(h.document.body.textContent ?? '', /后台镜像 1 只/)
    assert.match(h.document.body.textContent ?? '', /最后一次同步的清单/)
    await h.click('同步当前自选')
    assert.deepEqual(h.calls.at(-1)?.payload, { action: 'sync', scope, symbols: [symbol] })
    await h.click('停用每日分析')
    assert.equal(h.calls.at(-1)?.payload.action, 'sync', 'first click only asks for confirmation')
    await h.click('确认停用并清除后台镜像与结果')
    assert.deepEqual(h.calls.at(-1)?.payload, { action: 'disable', scope })
    assert.match(h.document.body.textContent ?? '', /尚未启用后台每日分析/)
  } finally { await h.close() }
})

test('failed disable warns that consent may return after restart', async () => {
  const h = await render(true, { ...initial(), enabled: true, syncedCount: 1, blockedReason: 'before-window' }, true)
  try {
    await h.click('停用每日分析')
    await h.click('确认停用并清除后台镜像与结果')
    assert.match(h.document.body.textContent ?? '', /旧授权可能在重启后恢复/)
    assert.match(h.document.body.textContent ?? '', /重试保存停用/)
  } finally { await h.close() }
})

test('free source must be enabled before scheduling starts', async () => {
  const h = await render(false)
  try {
    const button = [...h.document.querySelectorAll('button')].find(entry => entry.textContent?.includes('同意同步并启用'))
    assert.ok(button?.disabled)
    assert.deepEqual(h.calls.map(call => call.payload.action), ['get'])
  } finally { await h.close() }
})

test('stale saved results do not present directional signals', async () => {
  const row = { symbol, name: '测试股份', status: 'ready', source: '测试源', fetchedAt: new Date().toISOString(),
    adjustment: 'forward', pricePrecision: 2, stWarning: false, sourceDate: '2025-01-01', isFinal: true, freshness: 'stale', usable: false,
    signal: { status: 'buy', reason: 'ok', sessionDate: '2025-01-01', samples: 130, isFinal: true,
      close: 20, ma20: 18, ma60: 17, previousClose: 19, previousMa20: 17, prior20High: 19 } }
  const h = await render(true, { ...initial(), enabled: true, syncedCount: 1, rows: [row], resultDate: '2025-01-01', partial: true, freshness: 'historical', blockedReason: 'before-window' })
  try {
    const text = h.document.body.textContent ?? ''
    assert.match(text, /日线距今超过 7 个自然日/)
    assert.doesNotMatch(text, /买入观察信号/)
    assert.match(text, /结果可能不完整/)
  } finally { await h.close() }
})
