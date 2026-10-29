import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { zh } from '../src/client/locales.ts'
import { createFormatters } from '../src/client/format.ts'

const translate = (key: string, params: Record<string, any> = {}) => String((zh as any)[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`)
const bundle = await build({ entryPoints: [new URL('../src/client/quant-scan-view.tsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'] })
const module_ = { exports: {} as any }
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(module_, module_.exports, createRequire(import.meta.url))
const scope = '11111111-1111-4111-8111-111111111111'
function sampleResult() {
  const time = '2026-10-28T09:00:00.000Z'
  return { scanId: 'past-1', status: 'incomplete', partial: true, canContinue: false, provisional: true,
    source: '测试免费源', sessionDate: '2026-10-28', updatedAt: time, nextAllowedAt: time, stopReason: 'upstream-failures',
    counts: { expected: 5000, discovered: 5000, attempted: 100, dailySucceeded: 90, dailyInsufficient: 5, dailyFailed: 5, notAttempted: 4900,
      ranked: 80, excludedSuspended: 1, excludedST: 2, excludedStatusUnknown: 3, missingFactors: 4, excludedDateMismatch: 0 },
    rows: [{ symbol: 'SH.600001', name: '测试股份', score: 81, sessionDate: '2026-10-28', adjustment: 'forward', validBars: 250, provisional: true,
      scores: { trend: 30, momentum: 21, liquidity: 16, risk: 14 },
      factors: { close: 10, ma20: 9, ma60: 8, return20: 0.1, return60: 0.2, amountMedian20: 100_000_000, amountSamples20: 20, volatility20: 0.02 } }] }
}
const report = () => ({ date: '2026-10-28', updatedAt: '2026-10-28T09:00:00.000Z', status: 'partial', partial: true, error: 'upstream-failures', result: sampleResult() })
const initial = () => ({ enabled: false, running: false, sourceEnabled: true, lastAttemptDate: null, updatedAt: null,
  error: null, latest: null, reports: [], blockedReason: 'disabled', policy: {} })

async function render(sourceEnabled = true, initialState: any = initial(), failDisable = false) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
  const original: any = { window: (globalThis as any).window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT }
  ;(globalThis as any).window = dom.window; globalThis.document = dom.window.document; (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  let state = initialState
  const calls: any[] = []
  const rpc = { async call(_channel: string, endpoint: string, payload: any) {
    calls.push({ endpoint, payload })
    if (endpoint === 'dsh-x-finance.market') return { ok: true, value: { status: 'ready', quantScan: null } }
    assert.equal(endpoint, 'dsh-x-finance.quant-schedule')
    if (payload.action === 'enable') state = { ...state, enabled: true, blockedReason: 'before-window' }
    if (payload.action === 'disable' && failDisable) return { ok: false, error: { code: 'finance/quant-schedule-storage-unavailable' } }
    if (payload.action === 'disable') state = { ...state, enabled: false, blockedReason: 'disabled' }
    return { ok: true, value: state }
  } }
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(dom.window.document.getElementById('root')!)
  await act(async () => root.render(React.createElement(module_.exports.QuantScanView, {
    rpc, scope, sourceEnabled, t: translate, format: createFormatters(() => 'zh'),
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

test('daily market scanning is explicitly authorized and disabling preserves reports', async () => {
  const h = await render(true, { ...initial(), reports: [report()], latest: report() })
  try {
    assert.deepEqual(h.calls.map(call => call.payload.action).sort(), ['get', 'status'])
    assert.match(h.document.body.textContent ?? '', /可能持续发送数千次免费行情请求/)
    await h.click('同意每日分批请求并启用')
    assert.deepEqual(h.calls.at(-1)?.payload, { action: 'enable', scope, consent: true })
    assert.match(h.document.body.textContent ?? '', /每日全市场分析已启用/)
    await h.click('停用每日全市场分析')
    assert.deepEqual(h.calls.at(-1)?.payload, { action: 'disable', scope })
    assert.match(h.document.body.textContent ?? '', /历史扫描报告/)
  } finally { await h.close() }
})

test('historical partial report remains explicitly dated and never claims full coverage', async () => {
  const h = await render(true, { ...initial(), reports: [report()], latest: report() })
  try {
    await h.click('查看 2026-10-28 的报告')
    const text = h.document.body.textContent ?? ''
    assert.match(text, /正在查看 2026-10-28 的历史报告/)
    assert.match(text, /部分结果/)
    assert.match(text, /不能当作完整全市场排名/)
    assert.match(text, /未确认收盘/)
    assert.match(text, /测试股份/)
  } finally { await h.close() }
})

test('source-off state never enables background requests and can inspect saved reports', async () => {
  const h = await render(false, { ...initial(), sourceEnabled: false, reports: [report()], latest: report() })
  try {
    const button = [...h.document.querySelectorAll('button')].find(entry => entry.textContent?.includes('同意每日分批'))
    assert.ok(button?.disabled)
    assert.deepEqual(h.calls.map(call => call.payload.action), ['get'])
    await h.click('查看 2026-10-28 的报告')
    assert.match(h.document.body.textContent ?? '', /正在查看 2026-10-28 的历史报告/)
  } finally { await h.close() }
})

test('failure to persist disable warns of possible restart and offers retry', async () => {
  const h = await render(true, { ...initial(), enabled: true, blockedReason: 'before-window' }, true)
  try {
    await h.click('停用每日全市场分析')
    assert.match(h.document.body.textContent ?? '', /旧授权可能在重启后恢复/)
    assert.match(h.document.body.textContent ?? '', /重试保存停用/)
  } finally { await h.close() }
})
