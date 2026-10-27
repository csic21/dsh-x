import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { zh, en } from '../src/client/locales.ts'
import { createFormatters } from '../src/client/format.ts'
import { PREDICT_MODEL } from '../src/predict-model.ts'
import { baseBucketFor, readRegime, scoreCandidate, sortPredictRows } from '../src/predict.ts'
import type { PredictRow, PredictScanResult } from '../src/predict.ts'
import type { PredictBar, PredictCrossSection } from '../src/predict-features.ts'

const NOW = Date.parse('2026-10-27T05:10:00.000Z')
const CROSS: PredictCrossSection = { upShare: 58, hotShare: 2.4, medianChange: 0.35 }

function series(base: number, moves: number[]): PredictBar[] {
  const bars: PredictBar[] = []
  let close = base
  bars.push({ sessionDate: '2025-01-02', open: close, high: close * 1.01, low: close * 0.99, close, volume: 10_000 })
  for (let index = 0; index < moves.length; index++) {
    const open = close
    const next = close * (1 + moves[index]! / 100)
    bars.push({
      sessionDate: `2025-02-${String(index + 1).padStart(2, '0')}`,
      open,
      high: moves[index]! >= 9.5 ? next : next * 1.004,
      low: open * 0.995,
      close: next,
      volume: 10_000,
    })
    close = next
  }
  return bars
}

const flat = (count: number) => Array.from({ length: count }, () => 0.1)

function row(symbol: string, name: string, price: number, moves: number[]): PredictRow {
  const scored = scoreCandidate({ symbol, name, price, changePercent: moves.at(-1)!, bars: series(10, [...flat(40), ...moves]), final: true }, CROSS)
  assert.ok(scored)
  return scored!
}

const rows = sortPredictRows([
  row('SH.603528', '多伦科技', 13.31, [10, 10, 10]),
  row('SZ.000058', '深赛格', 9.9, [10]),
  row('SH.600838', '上海九百', 11.2, [10, 10, 10, 10, 10]),
])
// The last-ranked row models a sealed one-word board: it must disappear when
// the reader asks for names that could actually be bought at the open.
rows[rows.length - 1] = { ...rows[rows.length - 1]!, oneWord: true }

const reading = readRegime(CROSS)
const result: PredictScanResult = {
  source: '腾讯行情 (unofficial) 排行/日K',
  fetchedAt: '2026-10-27T05:10:00.000Z',
  sessionDate: '2026-10-27',
  barFinal: false,
  durationMs: 1286,
  board: null,
  model: {
    version: PREDICT_MODEL.version,
    trainedThrough: PREDICT_MODEL.trainedThrough,
    costPercent: PREDICT_MODEL.costPercent,
    staleDays: 4,
    sample: PREDICT_MODEL.sample,
    metrics: PREDICT_MODEL.metrics,
  },
  regime: {
    upShare: CROSS.upShare, hotShare: CROSS.hotShare, medianChange: CROSS.medianChange,
    rank: reading.rank, level: reading.level,
    base: baseBucketFor(PREDICT_MODEL.baseRates.sentiment, reading.rank),
  },
  universe: { expected: 5577, covered: 5570, candidates: 88, scored: rows.length, failed: 2, partial: true },
  baseRates: PREDICT_MODEL.baseRates,
  rows,
}

const bundle = await build({
  entryPoints: [new URL('../src/client/market/PredictView.tsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'],
})
const module_ = { exports: {} as any }
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(module_, module_.exports, createRequire(import.meta.url))

const translation = (dictionary: any) => (key: string, params: Record<string, any> = {}) =>
  String(dictionary[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`)

async function harness(dictionary: any = zh) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
  const original: any = { window: (globalThis as any).window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT }
  ;(globalThis as any).window = dom.window
  globalThis.document = dom.window.document
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  const calls: any[] = []
  const rpc = {
    call: async (_channel: string, _endpoint: string, payload: any) => {
      calls.push(payload)
      return { ok: true, value: { status: 'ready', predictScan: result } }
    },
  }
  const t = translation(dictionary)
  const format = createFormatters(() => dictionary === en ? 'en' : 'zh')
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(dom.window.document.getElementById('root')!)
  await act(async () => root.render(React.createElement(module_.exports.PredictView, { rpc, t, format })))
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
  const button = (text: string) => [...dom.window.document.querySelectorAll('button')].find(element => element.textContent?.includes(text))
  const click = async (element: any) => {
    assert.ok(element, 'expected a clickable element')
    await act(async () => element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
  }
  const text = () => dom.window.document.body.textContent ?? ''
  return {
    dom, document: dom.window.document, calls, click, button, text,
    async close() {
      await act(async () => root.unmount())
      dom.window.close()
      for (const [key, value] of Object.entries(original)) { if (value === undefined) delete (globalThis as any)[key]; else (globalThis as any)[key] = value }
    },
  }
}

test('the relay panel starts idle and only fetches when asked', async () => {
  const page = await harness()
  try {
    assert.match(page.text(), /涨停接力/)
    assert.match(page.text(), /点击「运行预测」/)
    assert.equal(page.calls.length, 0, 'mounting must not fetch')
  } finally { await page.close() }
})

test('running the panel renders probabilities, bucket context and the honest verdict', async () => {
  const page = await harness()
  try {
    await page.click(page.button('运行预测'))
    assert.deepEqual(page.calls.at(-1), { kind: 'predict-scan' })
    const text = page.text()
    assert.match(text, /多伦科技/)
    assert.match(text, /晋级概率/)
    assert.match(text, /同组/)
    assert.match(text, /偏差/)
    assert.match(text, /样本外按此排序接力/)
    assert.match(text, /不是买入信号/)
    assert.match(text, /历史规律/)
    assert.match(text, /未封板|首板|2 板/)
    // Sorted by probability: the first row is the highest one.
    const probabilities = [...page.document.querySelectorAll('.dxs-predict-prob strong')].map(node => Number(String(node.textContent).replace(/[^\d.]/g, '')))
    assert.deepEqual(probabilities.slice().sort((left, right) => right - left), probabilities)
  } finally { await page.close() }
})

test('the model block keeps the out-of-sample backtest visible', async () => {
  const page = await harness()
  try {
    await page.click(page.button('运行预测'))
    const text = page.text()
    assert.match(text, /模型与样本外检验/)
    assert.match(text, /AUC/)
    assert.match(text, /残差排序组合回测/)
    assert.match(text, /最大回撤/)
    assert.match(text, /口径与边界/)
  } finally { await page.close() }
})

test('the panel translates to English', async () => {
  const page = await harness(en)
  try {
    await page.click(page.button('Run forecast'))
    const text = page.text()
    assert.match(text, /Limit-up relay/)
    assert.match(text, /Promotion/)
    assert.match(text, /not a buy signal/)
    assert.match(text, /Measured patterns/)
  } finally { await page.close() }
})

test('the buyable filter hides a sealed one-word board', async () => {
  const page = await harness()
  try {
    await page.click(page.button('运行预测'))
    const name = rows[rows.length - 1]!.name
    assert.match(page.text(), new RegExp(name), 'the sealed row starts visible')
    assert.equal(page.document.querySelectorAll('.dxs-predict-row').length, rows.length)
    const toggle = page.document.querySelector('input[type="checkbox"]') as HTMLInputElement
    assert.ok(toggle, 'expected the buyable filter')
    await page.click(toggle)
    const remaining = page.document.querySelectorAll('.dxs-predict-row').length
    assert.equal(remaining, rows.length - 1)
    assert.doesNotMatch(page.text(), new RegExp(name))
  } finally { await page.close() }
})
