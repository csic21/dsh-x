import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { zh, en } from '../src/client/locales.ts'
import { createFormatters } from '../src/client/format.ts'

const bundle = await build({
  entryPoints: [new URL('../src/client/FundamentalsPanel.tsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'],
})
const module = { exports: {} as any }
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(module, module.exports, createRequire(import.meta.url))

const NOW = '2026-11-02T10:00:00+08:00'
const period = (reportDate: string, reportName: string, noticeDate: string, revenue: number, profit: number, revenueYoY: number, profitYoY: number) => ({
  reportDate, reportName, noticeDate,
  revenue, revenueYoY, netProfit: profit, netProfitYoY: profitYoY,
  eps: 51.53, bps: 216.95, roe: 24.47, grossMargin: 89.58, netMargin: 50.94, debtRatio: 11.9,
})
const fundamentals = {
  symbol: 'SH.600519', name: '贵州茅台', applicable: true,
  source: '东方财富财报与估值 (unofficial)', fetchedAt: NOW, currency: 'CNY',
  valuation: {
    totalMarketCap: 1_798_992_431_999.1, floatMarketCap: 1_798_992_431_999.1,
    peStatic: 21.85, peTtm: 21.9, peDynamic: 20.93, pb: 6.63,
  },
  periods: [
    period('2026-09-30', '2026三季报', '2026-10-31', 133_283_652_508.95, 64_467_425_981.95, 1.8179, -0.2465),
    period('2026-06-30', '2026中报', '2026-08-15', 92_278_072_083.21, 44_516_880_421.86, 1.3, -1.95),
  ],
  latest: null as any,
  partial: false,
}
fundamentals.latest = fundamentals.periods[0]

const translation = (dictionary: any) => (key: string, params: Record<string, any> = {}) =>
  String(dictionary[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`)

async function harness(options: {
  dictionary?: any
  symbol?: string
  answer?: (payload: any) => any
} = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
  const original: any = { window: (globalThis as any).window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT }
  ;(globalThis as any).window = dom.window
  globalThis.document = dom.window.document
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  const calls: any[] = []
  const rpc = {
    call: async (_channel: string, endpoint: string, payload: any) => {
      calls.push({ endpoint, payload })
      return options.answer ? options.answer(payload) : { ok: true, value: { status: 'ready', fundamentals } }
    },
  }
  const dictionary = options.dictionary ?? zh
  const t = translation(dictionary)
  const format = createFormatters(() => dictionary === en ? 'en' : 'zh')
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(dom.window.document.getElementById('root')!)
  const render = async (symbol = options.symbol ?? 'SH.600519') => {
    await act(async () => root.render(React.createElement(module.exports.FundamentalsPanel, { symbol, rpc, t, format })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
  }
  await render()
  return {
    dom, document: dom.window.document, calls,
    async close() {
      await act(async () => root.unmount())
      dom.window.close()
      for (const [key, value] of Object.entries(original)) { if (value === undefined) delete (globalThis as any)[key]; else (globalThis as any)[key] = value }
    },
  }
}

test('the fundamentals panel shows valuation multiples and cumulative report periods', async () => {
  const h = await harness()
  try {
    const text = h.document.body.textContent ?? ''
    assert.match(text, /基本面/)
    assert.match(text, /东方财富财报与估值/)
    assert.match(text, /估值/)
    assert.match(text, /总市值/)
    assert.match(text, /1\.8万亿/)
    assert.match(text, /PE（静）/)
    assert.match(text, /21\.85/)
    assert.match(text, /PE（TTM）/)
    assert.match(text, /21\.90/)
    assert.match(text, /PE（动）/)
    assert.match(text, /20\.93/)
    assert.match(text, /PB/)
    assert.match(text, /6\.63/)
    assert.match(text, /报告期财务/)
    assert.match(text, /年初至报告期末累计/)
    assert.match(text, /2026三季报/)
    assert.match(text, /2026中报/)
    assert.match(text, /披露日 2026-10-31/)
    assert.match(text, /营业收入/)
    assert.match(text, /归母净利润/)
    assert.match(text, /\+1\.82%/)
    assert.match(text, /-0\.25%/)
    assert.match(text, /51\.53/)
    assert.match(text, /24\.47%/)
    assert.match(text, /89\.58%/)
    assert.match(text, /不构成投资建议/)
    assert.equal(h.document.querySelectorAll('.dxs-fundamentals-cell').length, 6)
    assert.equal(h.document.querySelectorAll('tbody tr').length, 2)
    assert.equal(h.document.querySelectorAll('tbody tr.is-latest').length, 1)
    assert.deepEqual(h.calls, [{ endpoint: 'dsh-x-finance.market', payload: { kind: 'fundamentals', symbol: 'SH.600519' } }])
  } finally { await h.close() }
})

test('a negative multiple is labelled as a loss, not printed as a number', async () => {
  const loss = {
    ...fundamentals,
    valuation: { ...fundamentals.valuation, peStatic: -0.43, peTtm: -0.45, peDynamic: -1.2 },
  }
  const h = await harness({ answer: () => ({ ok: true, value: { status: 'ready', fundamentals: loss } }) })
  try {
    const cells = [...h.document.querySelectorAll<HTMLElement>('.dxs-fundamentals-cell')]
    const byLabel = (label: string) => cells.find(cell => cell.textContent?.includes(label))!
    assert.match(byLabel('PE（静）').textContent ?? '', /亏损/)
    assert.match(byLabel('PE（动）').textContent ?? '', /亏损/)
    assert.equal(byLabel('PE（静）').querySelector('strong')!.getAttribute('title'), '-0.43')
  } finally { await h.close() }
})

test('unconfigured, error, retry and partial states stay explicit', async () => {
  const off = await harness({ answer: () => ({ ok: true, value: { status: 'unconfigured' } }) })
  try {
    assert.match(off.document.body.textContent ?? '', /共用同一个本机免费源开关/)
    assert.equal(off.document.querySelectorAll('.dxs-fundamentals-cell').length, 0)
  } finally { await off.close() }

  let attempts = 0
  const retry = await harness({
    answer: () => {
      attempts += 1
      if (attempts === 1) return { ok: false, error: { code: 'finance/fundamentals-unavailable' } }
      return { ok: true, value: { status: 'ready', fundamentals: { ...fundamentals, partial: true } } }
    },
  })
  try {
    assert.match(retry.document.body.textContent ?? '', /公司基本面暂不可用/)
    const button = [...retry.document.querySelectorAll('button')].find(element => element.textContent === '重试')!
    assert.ok(button)
    await act(async () => button.dispatchEvent(new retry.dom.window.MouseEvent('click', { bubbles: true })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    assert.equal(attempts, 2)
    assert.match(retry.document.body.textContent ?? '', /部分数据暂不可用/)
    assert.match(retry.document.body.textContent ?? '', /2026三季报/)
  } finally { await retry.close() }
})

test('an ETF renders no fundamentals panel and sends no request', async () => {
  const h = await harness({ symbol: 'SH.510300' })
  try {
    assert.equal(h.calls.length, 0)
    assert.equal(h.document.querySelector('.dxs-fundamentals'), null)
    assert.equal((h.document.body.textContent ?? '').trim(), '')
  } finally { await h.close() }
})

test('the English panel keeps the same figures and states', async () => {
  const h = await harness({ dictionary: en })
  try {
    const text = h.document.body.textContent ?? ''
    assert.match(text, /Fundamentals/)
    assert.match(text, /Valuation/)
    assert.match(text, /Market cap/)
    assert.match(text, /P\/E \(static\)/)
    assert.match(text, /Reported financials/)
    assert.match(text, /Year-to-date cumulative/)
    assert.match(text, /Not investment advice/)
  } finally { await h.close() }
})
