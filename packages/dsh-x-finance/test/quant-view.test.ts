import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { zh } from '../src/client/locales.ts'
import { createFormatters } from '../src/client/format.ts'
import type { HistoryDataset } from '../src/history-dataset.ts'

const translation = (dictionary: any) => (key: string, params: Record<string, any> = {}) =>
  String(dictionary[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`)

const bundle = await build({
  entryPoints: [new URL('../src/client/quant/QuantPanel.tsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'],
})
const module_ = { exports: {} as any }
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(module_, module_.exports, createRequire(import.meta.url))

const dates = (count: number) => Array.from({ length: count }, (_, index) =>
  new Date(Date.UTC(2025, 0, 1) + index * 86_400_000).toISOString().slice(0, 10))

function dataset(symbol = 'SH.000001', name = '测试指数', count = 90): HistoryDataset {
  const closes = Array.from({ length: count }, (_, index) => 100 + Math.sin(index / 5) * 12 + index * 0.2)
  const bars = closes.map((close, index) => ({
    sessionDate: dates(count)[index]!,
    open: close - 0.5,
    high: close + 1.5,
    low: close - 1.5,
    close,
    volume: 1_000_000 + index,
    amount: 1_000_000_000 + index,
    isFinal: index < count - 1,
    updatedAt: null,
    revision: `${symbol}:none:${dates(count)[index]}`,
  }))
  return {
    schemaVersion: 1, kind: 'market', providerId: 'market-feed', id: `market:${symbol}:none`,
    symbol, name, currency: 'CNY', exchangeTimezone: 'Asia/Shanghai', interval: '1d',
    adjustment: 'none', adjustmentRevision: 'unadjusted', adjustmentMethod: 'unadjusted',
    datasetRevision: `${symbol}:none`, pricePrecision: 2, volumeUnit: 'shares',
    volumeAdjustment: 'unadjusted', volumeAdjustmentMethod: 'none',
    amountAdjustment: 'unadjusted', amountAdjustmentMethod: 'none', amountCurrency: 'CNY',
    source: { kind: 'market-feed', label: '测试源 · unadjusted', provenance: 'test', verified: false },
    historyAnchor: bars[0]!.sessionDate, hasNonPositivePrices: false, logScaleAllowed: true,
    fetchedAt: '2026-01-01T00:00:00.000Z', volumeBasis: 'shares', bars,
  }
}

async function render(panelDataset: HistoryDataset, benchmark?: HistoryDataset) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
  const original: any = { window: (globalThis as any).window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT }
  ;(globalThis as any).window = dom.window
  globalThis.document = dom.window.document
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(dom.window.document.getElementById('root')!)
  await act(async () => root.render(React.createElement(module_.exports.QuantPanel, {
    dataset: panelDataset, benchmark: benchmark ?? null,
    t: translation(zh), format: createFormatters(() => 'zh'),
  })))
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
  return {
    dom, document: dom.window.document,
    async close() {
      await act(async () => root.unmount())
      dom.window.close()
      for (const [key, value] of Object.entries(original)) { if (value === undefined) delete (globalThis as any)[key]; else (globalThis as any)[key] = value }
    },
  }
}

test('the quantitative panel renders statistics, monthly returns, replay and costs', async () => {
  const h = await render(dataset())
  try {
    const text = h.document.body.textContent ?? ''
    assert.match(text, /量化分析/)
    assert.match(text, /区间统计/)
    assert.match(text, /年化收益/)
    assert.match(text, /最大回撤/)
    assert.match(text, /夏普比率/)
    assert.match(text, /月度收益/)
    assert.match(text, /规则回测/)
    assert.match(text, /资金曲线/)
    assert.match(text, /交易明细/)
    assert.match(text, /假设与限制/)
    assert.match(text, /不构成投资建议/)
    assert.doesNotMatch(text, /NaN|undefined/)
    assert.ok(h.document.querySelectorAll('.dxs-quant-stat').length >= 12)
    const rules = h.document.querySelector<HTMLSelectElement>('.dxs-quant-field select')
    assert.ok(rules)
    assert.equal(rules!.options.length, 4)
    assert.equal(rules!.value, 'ma5-20')
    const inputs = [...h.document.querySelectorAll<HTMLInputElement>('.dxs-quant-field input')]
    assert.equal(inputs.length, 2)
    assert.equal(inputs[0]!.value, '5')
    assert.equal(inputs[1]!.value, '5')
    assert.ok(h.document.querySelector('.dxs-quant-monthly tbody tr'))
    assert.ok(h.document.querySelector('.dxs-quant-chart svg'))
    assert.ok(h.document.querySelectorAll('.dxs-quant-chart path').length >= 2)
  } finally { await h.close() }
})

test('a benchmark adds a labelled correlation instead of a blank card', async () => {
  const h = await render(dataset(), dataset('SH.000300', '沪深300'))
  try {
    const text = h.document.body.textContent ?? ''
    assert.match(text, /相关性 · 沪深300/)
    assert.match(text, /个重叠交易日/)
    assert.doesNotMatch(text, /无基准数据/)
  } finally { await h.close() }
})

test('too few bars yields the explicit empty state, not invented metrics', async () => {
  const h = await render(dataset('SH.000001', '测试指数', 1))
  try {
    const text = h.document.body.textContent ?? ''
    assert.match(text, /样本不足，无法计算/)
    assert.equal(h.document.querySelectorAll('.dxs-quant-stat').length, 0)
    assert.equal(h.document.querySelector('.dxs-quant-chart svg'), null)
  } finally { await h.close() }
})
