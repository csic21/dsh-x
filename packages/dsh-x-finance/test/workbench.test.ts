import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createImportExample, MAX_IMPORT_BYTES } from '../src/chart-data.ts'
import { workbenchZh, workbenchEn } from '../src/client/workbench-locales.ts'

const SCOPE_A = '11111111-1111-4111-8111-111111111111'
const SCOPE_B = '22222222-2222-4222-8222-222222222222'
const scopeKey = (scope: any) => `dsh-x-finance:chart:v1:${scope}`
const chartSettingsKey = (scope: any) => `dsh-x-finance:history:v1:${scope}`
const t = (dictionary: any) => (key: any, params?: any) => {
  const text = dictionary[key] ?? key
  return params ? text.replace(/\{(\w+)\}/g, (_: any, name: string) => String(params[name] ?? '')) : text
}
const source = (name: any, symbol = 'SH.600519') => {
  const data = JSON.parse(createImportExample())
  data.name = name
  data.symbol = symbol
  return JSON.stringify(data)
}
const localFile = (text: any) => ({ name: 'bars.json', size: new TextEncoder().encode(text).byteLength, text: async () => text })
const deferred = () => { let resolve!: (value?: any) => void, reject!: (reason?: unknown) => void; const promise = new Promise<any>((ok, bad) => { resolve = ok; reject = bad }); return { promise, resolve, reject } }

const bundle = await build({
  entryPoints: [new URL('../src/client/workbench.tsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'],
  plugins: [{
    name: 'stub-charts',
    setup(builder) {
      builder.onResolve({ filter: /\/chart\/StockChart\.tsx$/ }, () => ({ path: 'stock-chart-test-stub', namespace: 'test' }))
      // The intraday line is drawn on a canvas, which jsdom does not implement;
      // the hook and the panel around it are what these tests exercise.
      builder.onResolve({ filter: /\/chart\/IntradayChart\.tsx$/ }, () => ({ path: 'intraday-chart-test-stub', namespace: 'test' }))
      builder.onLoad({ filter: /^stock-chart-test-stub$/, namespace: 'test' }, () => ({ contents: 'export function StockChart(props) { return globalThis.chartStub(props) }', loader: 'js' }))
      builder.onLoad({ filter: /^intraday-chart-test-stub$/, namespace: 'test' }, () => ({ contents: 'export function IntradayChart(props) { return globalThis.intradayStub(props) }', loader: 'js' }))
    },
  }],
})

async function harness(initial: any = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' })
  const original: any = { window: (globalThis as any).window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT }
  ;(globalThis as any).window = dom.window
  globalThis.document = dom.window.document
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  const saved = new Map(Object.entries(initial.saved ?? {})), writes: any = [], charts: any = []
  const storage: any = {
    getItem: (key: any) => saved.get(key) ?? null,
    setItem: (key: any, value: any) => { if (initial.storageDenied) throw new Error('Storage denied'); writes.push({ key, value }); saved.set(key, value) },
  }
  const module: any = { exports: {} }
  vm.runInNewContext(bundle.outputFiles[0].text, {
    module, exports: module.exports, require: createRequire(import.meta.url),
    console, window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    localStorage: storage, Intl, TextEncoder, AbortController, setTimeout, clearTimeout,
    fetch: () => assert.fail('Workbench must not send chart files or demo data to a network'),
    chartStub(props: any) {
      charts.push(props)
      return React.createElement('div', { 'data-chart-stub': props.dataset.kind, 'data-symbol': props.dataset.symbol, 'data-locale': props.locale },
        React.createElement('span', { 'data-chart-name': true }, props.dataset.name),
        React.createElement('button', { type: 'button', 'data-change-config': true, onClick: () => props.onConfigChange({ ...props.config, difVisible: !props.config.difVisible, bars: props.dataset.bars, dataset: props.dataset }) }, 'Change test preference'))
    },
    intradayStub(props: any) {
      return React.createElement('div', { 'data-intraday-stub': props.session.symbol }, props.session.points.at(-1).price)
    },
  })
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(dom.window.document.getElementById('root')!)
  const rpc = initial.rpc ?? {
    call: async (_channel: string, _endpoint: string, payload: any) =>
      payload?.kind === 'history'
        ? { ok: true, value: { status: 'unconfigured', source: null } }
        : { ok: false, error: { code: 'finance/unexpected' } },
  }
  let props: any = { scope: SCOPE_A, symbol: 'SH.600519', locale: 'en', rpc, ...initial.props }
  const render = async (next?: any) => {
    props = { ...props, ...next }
    await act(async () => root.render(React.createElement((module.exports as any).StockWorkbench, {
      ...props, key: `${props.scope}:${props.symbol ?? ''}`,
      t: t(props.locale === 'zh' ? workbenchZh : workbenchEn),
      format: { price: (value: any) => String(value) },
    })))
  }
  const button = (label: any) => [...dom.window.document.querySelectorAll('button')].find(element => element.textContent === label)
  const click = async (element: any) => { assert.ok(element, 'Expected a button'); await act(async () => element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))) }
  const selectFile = async (file: any) => {
    const input = dom.window.document.querySelector<HTMLElement & HTMLInputElement>('input[type="file"]')
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    await act(async () => (input)!.dispatchEvent(new dom.window.Event('change', { bubbles: true })))
  }
  await render()
  return {
    dom, document: dom.window.document, charts, saved, writes, render, button, click, selectFile,
    async close() {
      await act(async () => root.unmount())
      dom.window.close()
      for (const [key, value] of Object.entries(original)) { if (value === undefined) delete (globalThis as any)[key as keyof typeof globalThis]; else (globalThis as any)[key as keyof typeof globalThis] = value }
    },
  }
}

test('workbench is empty by default and DEMO requires an explicit click with isolated identity', async () => {
  const h = await harness()
  try {
    assert.equal(h.charts.length, 0)
    // With the free source off, the daily chart is explicitly unconfigured and
    // no synthetic or placeholder candle is drawn.
    assert.match(h.document.body.textContent, /Daily data is off/)
    assert.equal(h.document.querySelector<HTMLElement & HTMLInputElement>('[data-chart-stub]'), null)
    await h.click(h.button('Synthetic DEMO'))
    assert.equal(h.charts.at(-1).dataset.kind, 'demo')
    assert.equal(h.charts.at(-1).dataset.symbol, 'DEMO:SYNTH')
    assert.equal(h.charts.at(-1).dataset.providerId, 'demo-synthetic')
    assert.match(h.document.body.textContent, /Synthetic data, not a real security or live quotes/)
    assert.equal(h.writes.length, 0, 'Opening synthetic data must not persist bars or modify the watchlist')
    await h.click(h.button('Close chart data'))
    assert.equal(h.document.querySelector<HTMLElement & HTMLInputElement>('[data-chart-stub]'), null)
    assert.match(h.document.body.textContent, /Daily data is off/)
  } finally { await h.close() }
})

test('valid local import retains explicit unknown volume and unverified provenance without persistence', async () => {
  const h = await harness()
  try {
    await h.selectFile(localFile(source('Imported A')))
    assert.equal(h.charts.at(-1).dataset.kind, 'local')
    assert.equal(h.charts.at(-1).dataset.symbol, 'SH.600519')
    assert.equal(h.charts.at(-1).dataset.bars[1].volume, null)
    assert.equal(h.charts.at(-1).dataset.bars[2].volume, 0)
    assert.match(h.document.body.textContent, /self-declared, unverified provenance/)
    assert.match(h.document.body.textContent, /Imported A/)
    assert.equal(h.document.querySelector<HTMLElement & HTMLInputElement>('[role="alert"]'), null)
    assert.equal(h.writes.length, 0)
  } finally { await h.close() }
})

test('bad JSON, oversize, invalid schema and mismatched security preserve the existing chart', async () => {
  const h = await harness()
  try {
    await h.selectFile(localFile(source('Keep this dataset')))
    const id = h.charts.at(-1).dataset.id
    for (const file of [localFile('{broken'), localFile('{}'), { size: MAX_IMPORT_BYTES + 1, text: () => assert.fail('Oversized file must be rejected before reading') }] as const) {
      await h.selectFile(file)
      assert.match((h.document.querySelector<HTMLElement & HTMLInputElement>('[role="alert"]'))!.textContent, /Invalid file or data/)
      assert.equal(h.charts.at(-1).dataset.id, id)
    }
    await h.selectFile(localFile(source('Wrong selected symbol', 'SZ.000001')))
    assert.match((h.document.querySelector<HTMLElement & HTMLInputElement>('[role="alert"]'))!.textContent, /does not match the selected stock/)
    assert.equal(h.charts.at(-1).dataset.id, id)
    assert.equal(h.writes.length, 0)
  } finally { await h.close() }
})

test('slow import A cannot overwrite later successful import B or its error state', async () => {
  const h = await harness()
  try {
    const slow = deferred()
    await h.selectFile({ size: 1000, text: () => slow.promise })
    assert.match(h.document.body.textContent, /Validating the file locally/)
    await h.selectFile(localFile(source('Fast B')))
    const id = h.charts.at(-1).dataset.id
    await act(async () => slow.resolve(source('Slow A')))
    assert.equal(h.charts.at(-1).dataset.id, id)
    assert.match(h.document.body.textContent, /Fast B/)
    assert.doesNotMatch(h.document.body.textContent, /Slow A|Validating the file locally/)
    assert.equal(h.document.querySelector<HTMLElement & HTMLInputElement>('[role="alert"]'), null)
    const obsolete = deferred()
    await h.selectFile({ size: 10, text: () => obsolete.promise })
    await h.selectFile(localFile('{newer failure'))
    await act(async () => obsolete.reject(new Error('old rejection')))
    assert.match((h.document.querySelector<HTMLElement & HTMLInputElement>('[role="alert"]'))!.textContent, /Invalid file or data/)
    assert.equal(h.charts.at(-1).dataset.id, id)
  } finally { await h.close() }
})

test('clear and explicit DEMO invalidate an in-flight file read', async () => {
  const h = await harness()
  try {
    await h.selectFile(localFile(source('Initial')))
    const pending = deferred()
    await h.selectFile({ size: 1000, text: () => pending.promise })
    await h.click(h.button('Close chart data'))
    await act(async () => pending.resolve(source('Must stay cleared')))
    assert.equal(h.document.querySelector<HTMLElement & HTMLInputElement>('[data-chart-stub]'), null)
    assert.doesNotMatch(h.document.body.textContent, /Must stay cleared|Validating the file locally/)
    const second = deferred()
    await h.selectFile({ size: 1000, text: () => second.promise })
    await h.click(h.button('Synthetic DEMO'))
    await act(async () => second.resolve(source('Must not replace DEMO')))
    assert.equal(h.charts.at(-1).dataset.kind, 'demo')
    assert.doesNotMatch(h.document.body.textContent, /Must not replace DEMO/)
  } finally { await h.close() }
})

test('keyed scope/security switch clears local data and discards the previous scope pending read', async () => {
  const h = await harness()
  try {
    await h.selectFile(localFile(source('Private scope A')))
    const pending = deferred()
    await h.selectFile({ size: 1000, text: () => pending.promise })
    await h.render({ scope: SCOPE_B })
    assert.equal(h.document.querySelector<HTMLElement & HTMLInputElement>('[data-chart-stub]'), null)
    await act(async () => pending.resolve(source('Old scope late data')))
    assert.equal(h.document.querySelector<HTMLElement & HTMLInputElement>('[data-chart-stub]'), null)
    assert.doesNotMatch(h.document.body.textContent, /Private scope A|Old scope late data/)
    await h.selectFile(localFile(source('Scope B')))
    await h.render({ symbol: 'SZ.000001' })
    assert.equal(h.document.querySelector<HTMLElement & HTMLInputElement>('[data-chart-stub]'), null)
    assert.equal(h.writes.length, 0)
  } finally { await h.close() }
})

test('only validated config is saved by scope; bar data never persists and reload starts empty', async () => {
  const h = await harness({ saved: { 'unrelated-watchlist-key': 'keep me' } })
  try {
    await h.selectFile(localFile(source('Never persist these bars')))
    await h.click(h.document.querySelector<HTMLElement & HTMLInputElement>('[data-change-config]'))
    assert.equal(h.writes.length, 1)
    assert.equal(h.writes[0].key, scopeKey(SCOPE_A))
    const value = JSON.parse(h.writes[0].value)
    assert.deepEqual(Object.keys(value).sort(), ['bollVisible', 'deaVisible', 'difVisible', 'kdjVisible', 'maVisible', 'macd', 'percentBVisible', 'zscoreVisible'])
    assert.equal(value.difVisible, false)
    assert.doesNotMatch(h.writes[0].value, /bars|dataset|Never persist|sessionDate|volume|source/)
    assert.equal(h.saved.get('unrelated-watchlist-key'), 'keep me')
    await h.render({ scope: SCOPE_B })
    await h.click(h.button('Synthetic DEMO'))
    assert.equal(h.charts.at(-1).config.difVisible, true)
    await h.render({ scope: SCOPE_A })
    assert.equal(h.document.querySelector<HTMLElement & HTMLInputElement>('[data-chart-stub]'), null)
    await h.click(h.button('Synthetic DEMO'))
    assert.equal(h.charts.at(-1).config.difVisible, false)
    assert.equal(h.writes.length, 1)
  } finally { await h.close() }
})

test('storage failure stays visible without losing current chart or in-memory preference', async () => {
  const h = await harness({ storageDenied: true })
  try {
    await h.click(h.button('Synthetic DEMO'))
    await h.click(h.document.querySelector<HTMLElement & HTMLInputElement>('[data-change-config]'))
    assert.match(h.document.body.textContent, /preferences were not saved/)
    assert.equal(h.charts.at(-1).config.difVisible, false)
    assert.equal(h.charts.at(-1).dataset.kind, 'demo')
    assert.equal(h.writes.length, 0)
  } finally { await h.close() }
})

test('persisted unknown MACD fields are removed and malformed config falls back safely', async () => {
  for (const value of [
    { macd: { fast: 8, slow: 26, signal: 9, histScale: 2, unsupported: 'must not reach engine' } },
    { macd: null },
    { macd: { fast: 50, slow: 2 } },
    null,
  ] as const) {
    const h = await harness({ saved: { [scopeKey(SCOPE_A)]: JSON.stringify(value) } })
    try {
      await h.click(h.button('Synthetic DEMO'))
      const macd = h.charts.at(-1).config.macd
      assert.deepEqual(Object.keys(macd).sort(), ['fast', 'histScale', 'signal', 'slow'])
      assert.equal(macd.fast, value?.macd?.unsupported ? 8 : 12)
      assert.equal(macd.slow, 26)
      assert.equal(h.writes.length, 0)
    } finally { await h.close() }
  }
})

test('historical close heading honors declared display precision rather than a fixed two decimals', async () => {
  const h = await harness()
  try {
    const data = JSON.parse(source('High precision stock'))
    data.pricePrecision = 4
    data.bars.at(-1).close = 11.1234
    await h.selectFile(localFile(JSON.stringify(data)))
    assert.match((h.document.querySelector<HTMLElement & HTMLInputElement>('.dxs-dataset-heading'))!.textContent, /11\.1234 USD/)
    assert.equal(h.charts.at(-1).dataset.pricePrecision, 4)
  } finally { await h.close() }
})

test('locale switches immediately without changing imported identity, data or chart preferences', async () => {
  assert.deepEqual(Object.keys(workbenchZh).sort(), Object.keys(workbenchEn).sort())
  const h = await harness()
  try {
    await h.selectFile(localFile(source('Keep original name')))
    const dataset = h.charts.at(-1).dataset
    await h.render({ locale: 'zh' })
    assert.match(h.document.body.textContent, /图表工作台|本地导入/)
    assert.equal((h.document.querySelector<HTMLElement & HTMLInputElement>('[data-chart-stub]'))!.dataset.locale, 'zh')
    assert.equal(h.charts.at(-1).dataset, dataset)
    assert.match(h.document.body.textContent, /Keep original name/)
    assert.equal(h.writes.length, 0)
  } finally { await h.close() }
})

test('finite but arithmetically unsupported prices are rejected before rendering and preserve the old dataset', async () => {
  const h = await harness()
  try {
    await h.selectFile(localFile(source('Keep supported dataset')))
    const id = h.charts.at(-1).dataset.id
    const extreme = JSON.parse(source('Unsupported extreme'))
    extreme.bars = Array.from({ length: 40 }, (_, index) => ({
      sessionDate: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
      open: Number.MAX_VALUE, high: Number.MAX_VALUE, low: Number.MAX_VALUE, close: Number.MAX_VALUE,
      volume: 0, isFinal: true,
    }))
    await h.selectFile(localFile(JSON.stringify(extreme)))
    assert.match(h.document.querySelector<HTMLElement & HTMLInputElement>('[role="alert"]')?.textContent ?? '', /Invalid file or data/)
    assert.equal(h.charts.at(-1).dataset.id, id)
    assert.doesNotMatch(h.document.body.textContent, /Unsupported extreme/)
  } finally { await h.close() }
})

const INTRADAY_SESSION = {
  symbol: 'SH.600519', name: '贵州茅台', source: '东方财富分时 (unofficial)',
  fetchedAt: '2026-10-19T03:00:00.000Z', sessionDate: '2026-10-19', previousClose: 1390,
  pricePrecision: 2, volumeBasis: 'lots', currency: 'CNY', exchangeTimezone: 'Asia/Shanghai',
  closed: false,
  points: [{ time: '09:30', price: 1400, volume: 10, average: 1400 }, { time: '09:31', price: 1401, volume: 20, average: 1400.5 }],
}
const settle = async (ms: number) => { await act(async () => { await new Promise(resolve => setTimeout(resolve, ms)) }) }

test('a dropped 分时 request is retried before the error card, and a failed refresh keeps the line', async () => {
  let calls = 0
  let failing = true
  const rpc = {
    call: async (_channel: string, _endpoint: string, payload: any) => {
      if (payload?.kind !== 'intraday') return { ok: false, error: { code: 'finance/unexpected' } }
      calls++
      if (failing) throw Object.assign(new Error('fetch failed'), { code: 'finance/market-unavailable' })
      return { ok: true, value: { status: 'ready', intraday: INTRADAY_SESSION } }
    },
  }
  const h = await harness({ rpc, props: { locale: 'zh' }, saved: { [chartSettingsKey(SCOPE_A)]: JSON.stringify({ interval: 'intraday' }) } })
  try {
    // The first request fails; the hook retries instead of painting the error card.
    assert.equal(calls, 1)
    failing = false
    await settle(900)
    assert.equal(calls, 2)
    assert.equal(h.document.querySelector<HTMLElement & HTMLInputElement>('[data-intraday-stub]')?.dataset.intradayStub, 'SH.600519')
    assert.match(h.document.body.textContent ?? '', /贵州茅台/)
    assert.doesNotMatch(h.document.body.textContent ?? '', /分时获取失败/)

    // A refresh that fails for good keeps the fetched line and says how old it is.
    failing = true
    const before = calls
    await h.click(h.button('刷新日K'))
    await settle(2600)
    assert.equal(calls - before, 3, 'the refresh is retried before it gives up')
    assert.equal(h.document.querySelector<HTMLElement & HTMLInputElement>('[data-intraday-stub]')?.dataset.intradayStub, 'SH.600519')
    assert.match(h.document.body.textContent ?? '', /刷新失败，仍在显示/)
    assert.match(h.document.body.textContent ?? '', /2026-10-19T03:00:00\.000Z/, 'the note says when that line was fetched')
    assert.doesNotMatch(h.document.body.textContent ?? '', /分时获取失败/)
  } finally { await h.close() }
})

test('an intraday line the Host reports as absent stays a hard "unavailable" and is not retried', async () => {
  let calls = 0
  const rpc = {
    call: async (_channel: string, _endpoint: string, payload: any) => {
      if (payload?.kind !== 'intraday') return { ok: false, error: { code: 'finance/unexpected' } }
      calls++
      return { ok: false, error: { code: 'finance/intraday-unavailable' } }
    },
  }
  const h = await harness({ rpc, props: { locale: 'zh' }, saved: { [chartSettingsKey(SCOPE_A)]: JSON.stringify({ interval: 'intraday' }) } })
  try {
    await settle(900)
    assert.equal(calls, 1, 'a symbol with no line will not change on a retry')
    assert.match(h.document.body.textContent ?? '', /暂无分时/)
    assert.doesNotMatch(h.document.body.textContent ?? '', /分时获取失败/)
  } finally { await h.close() }
})
