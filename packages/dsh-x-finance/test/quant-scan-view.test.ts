import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { zh } from '../src/client/locales.ts'
import { createFormatters } from '../src/client/format.ts'

const translation = (dictionary: any) => (key: string, params: Record<string, any> = {}) =>
  String(dictionary[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`)
const bundle = await build({
  entryPoints: [new URL('../src/client/quant-scan-view.tsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'],
})
const module_ = { exports: {} as any }
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(module_, module_.exports, createRequire(import.meta.url))

function result() {
  const date = new Date().toISOString()
  return {
    scanId: 'test-1', status: 'incomplete', partial: true, canContinue: true, provisional: true,
    source: '测试免费源', sessionDate: '2026-10-28', updatedAt: date,
    nextAllowedAt: new Date(Date.now() + 120_000).toISOString(), stopReason: 'batch-limit',
    counts: { expected: 5000, discovered: 5000, attempted: 150, dailySucceeded: 145, dailyInsufficient: 3, dailyFailed: 2, notAttempted: 4850,
      ranked: 120, excludedSuspended: 1, excludedST: 2, excludedStatusUnknown: 3, missingFactors: 4, excludedDateMismatch: 5 },
    rows: [{ symbol: 'SH.600001', name: '测试股份', score: 81, sessionDate: '2026-10-28', adjustment: 'forward', validBars: 250, provisional: true,
      scores: { trend: 30, momentum: 21, liquidity: 16, risk: 14 },
      factors: { close: 10, ma20: 9, ma60: 8, return20: 0.1, return60: 0.2, amountMedian20: 100_000_000, amountSamples20: 20, volatility20: 0.02 } }],
  }
}
async function render(enabled: boolean) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
  const original: any = { window: (globalThis as any).window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT }
  ;(globalThis as any).window = dom.window; globalThis.document = dom.window.document; (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  const calls: any[] = [], opened: any[] = []
  const rpc = { async call(_channel: string, _endpoint: string, payload: any) {
    calls.push(payload)
    return { ok: true, value: { status: 'ready', quantScan: payload.action === 'status' ? null : result() } }
  } }
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(dom.window.document.getElementById('root')!)
  await act(async () => root.render(React.createElement(module_.exports.QuantScanView, {
    rpc, sourceEnabled: enabled, t: translation(zh), format: createFormatters(() => 'zh'),
    onOpenStock: (symbol: string, name: string) => opened.push({ symbol, name }),
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

test('market scan is explicit and reports partial coverage and provisional data', async () => {
  const h = await render(true)
  try {
    assert.deepEqual(h.calls.map(call => call.action), ['status'])
    assert.match(h.document.body.textContent ?? '', /不会在页面打开时自动全市场扫描/)
    await h.click('开始分批扫描')
    assert.deepEqual(h.calls.map(call => call.action), ['status', 'start'])
    const text = h.document.body.textContent ?? ''
    assert.match(text, /部分结果/)
    assert.match(text, /不能当作完整全市场排名/)
    assert.match(text, /未确认收盘/)
    assert.match(text, /已识别 5,000/)
    assert.match(text, /测试股份/)
    assert.match(text, /趋势 30.00\/30/)
    assert.match(text, /单独启用每日任务后才保存报告/)
    assert.doesNotMatch(text, /NaN|undefined/)
    await h.click('测试股份')
    assert.deepEqual(h.opened, [{ symbol: 'SH.600001', name: '测试股份' }])
    await h.click('停止扫描')
    assert.match(h.document.body.textContent ?? '', /已停止自动继续/)
    await h.click('继续扫描')
    assert.deepEqual(h.calls.map(call => call.action), ['status', 'start', 'continue'])
    assert.equal(h.calls.at(-1)?.scanId, 'test-1')
  } finally { await h.close() }
})

test('disabled source makes no calls', async () => {
  const h = await render(false)
  try {
    assert.equal(h.calls.length, 0)
    assert.match(h.document.body.textContent ?? '', /请先打开本机免费源/)
    const start = [...h.document.querySelectorAll('button')].find(entry => entry.textContent?.includes('开始分批扫描'))
    assert.ok(start?.disabled)
  } finally { await h.close() }
})
