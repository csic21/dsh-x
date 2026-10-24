import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createDemoDataset } from '../src/chart-data.ts'
import { computeIndicators } from '../src/indicators.ts'
import { businessDay, sessionKey, buildChartData, createSelectionStore, preserveLogicalRange } from '../src/client/chart/model.ts'
import { normalizeChartConfig } from '../src/client/chart/config.ts'
import { createStockChartAdapter } from '../src/client/chart/adapter.ts'
import { chartZh, chartEn } from '../src/client/chart/locales.ts'
import { resolveChartTheme, observeChartTheme } from '../src/client/chart/theme.ts'

const translate = (dictionary: any) => (key: any, values: any = {}) => (dictionary[key] ?? key).replace(/\{(\w+)\}/g, (_: any, name: any) => String(values[name] ?? `{${name}}`))

test('chart data preserves session dates, sparse indicators and unknown volume', () => {
  assert.deepEqual(businessDay('2026-03-08'), { year: 2026, month: 3, day: 8 })
  assert.equal(sessionKey(businessDay('2026-11-01')), '2026-11-01')
  const dataset = createDemoDataset({ count: 40 }), bars = dataset.bars.map((bar: any, index: any) => ({ ...bar, volume: index === 0 ? null : index === 1 ? 0 : bar.volume }))
  const indicators = computeIndicators(bars), missing = indicators.rows[36]
  const data = buildChartData({ ...dataset, bars }, { ...indicators, rows: indicators.rows.filter((row: any) => row !== missing) })
  assert.deepEqual(data.volume[0], { time: businessDay(bars[0].sessionDate) })
  assert.equal(data.volume[1].value, 0)
  assert.equal(data.dif[36].value, undefined)
  assert.equal(data.dif[37].value, indicators.rows[37].dif)
  assert.equal(data.hist[32].value, undefined)
  assert.equal(data.hist[33].value, indicators.rows[33].hist)
})
test('selection locks by trading date, survives append and ignores hover until unlock', () => {
  const store = createSelectionStore(), bars = createDemoDataset({ count: 45 }).bars
  let notifications = 0; const unsubscribe = store.subscribe(() => notifications++)
  store.setBars(bars.slice(0, 40)); store.hover(bars[20].sessionDate); store.click(bars[20].sessionDate)
  store.hover(bars[30].sessionDate); store.setBars(bars)
  assert.deepEqual(store.getSnapshot(), { sessionDate: bars[20].sessionDate, locked: true })
  assert.equal(store.move('ArrowLeft').sessionDate, bars[19].sessionDate)
  assert.equal(store.move('Home').sessionDate, bars[0].sessionDate)
  assert.equal(store.move('ArrowLeft').sessionDate, bars[0].sessionDate)
  assert.equal(store.move('End').sessionDate, bars.at(-1).sessionDate)
  store.click(bars[3].sessionDate); assert.equal(store.getSnapshot().locked, false)
  store.hover(bars[3].sessionDate); assert.equal(store.getSnapshot().sessionDate, bars[3].sessionDate)
  unsubscribe(); const count = notifications; store.unlock(); store.dispose(); assert.equal(notifications, count)
})
test('configuration validation and bilingual locale keys stay aligned', () => {
  assert.deepEqual(Object.keys(chartZh).sort(), Object.keys(chartEn).sort())
  for (const key of Object.keys(chartZh)) assert.deepEqual(chartZh[key as keyof typeof chartZh].match(/\{\w+\}/g)?.sort(), chartEn[key as keyof typeof chartEn].match(/\{\w+\}/g)?.sort(), key)
  assert.deepEqual(normalizeChartConfig().macd, { fast: 12, slow: 26, signal: 9, histScale: 2 })
  const sanitized = normalizeChartConfig({ macd: { fast: 8, unknownSavedKey: true } })
  assert.deepEqual(sanitized.macd, { fast: 8, slow: 26, signal: 9, histScale: 2 })
  assert.doesNotThrow(() => computeIndicators(createDemoDataset({ count: 40 }).bars, { macd: sanitized.macd }))
  for (const malformed of [null, [], 'bad', { macd: null }, { macd: [] }, { macd: 'bad' }] as const) assert.throws(() => normalizeChartConfig(malformed))
  for (const macd of [{ fast: 30 }, { fast: 0 }, { slow: 2.5 }, { signal: 251 }, { histScale: 3 }] as const) assert.throws(() => normalizeChartConfig({ macd }))
  // The short trio is the default; the long 季线/年线 are opt-in so a fresh
  // chart never opens with two blank lines.
  assert.deepEqual(normalizeChartConfig().maVisible, { 5: true, 10: true, 20: true, 50: false, 250: false })
  // A setting saved before MA50/MA250 existed keeps the user's short-line
  // choices and leaves the new periods at their own defaults.
  assert.deepEqual(normalizeChartConfig({ maVisible: { 5: false, 10: true, 20: true } }).maVisible, { 5: false, 10: true, 20: true, 50: false, 250: false })
  assert.deepEqual(normalizeChartConfig({ maVisible: { 250: true } }).maVisible, { 5: true, 10: true, 20: true, 50: false, 250: true })
  assert.deepEqual(normalizeChartConfig({ maVisible: { 50: true, 250: true, 5: false } }).maVisible, { 5: false, 10: true, 20: true, 50: true, 250: true })
  // Unknown keys never survive normalization.
  assert.deepEqual(Object.keys(normalizeChartConfig({ maVisible: { 999: true } }).maVisible), ['5', '10', '20', '50', '250'])
})
test('MA50 and MA250 are computed from daily closes and stay empty without enough bars', () => {
  const bars = createDemoDataset({ count: 300 }).bars
  const full = computeIndicators(bars, { maPeriods: [50, 250] })
  const ma250 = full.rows.map((row: any) => row.ma[250]).filter((value: any) => value !== null)
  assert.equal(ma250.length, bars.length - 249)
  assert.ok(new Set(ma250.map((value: any) => value.toFixed(6))).size > 1, 'MA250 must vary, not repeat one value')
  // A 100-bar history cannot support MA250 at all: no padded or partial line.
  const short = computeIndicators(bars.slice(0, 100), { maPeriods: [50, 250] })
  assert.equal(short.rows.every((row: any) => row.ma[250] === null), true)
  assert.equal(short.rows.filter((row: any) => row.ma[50] !== null).length, 51)
})
test('prepend preserves logical viewport by its original date anchor', () => {
  const all = createDemoDataset({ count: 100 }).bars, range: any = { from: 9.5, to: 29.5 }
  assert.deepEqual(preserveLogicalRange(range, all.slice(20), all), { from: 29.5, to: 49.5 })
})
function mockLibrary() {
  const log: any = { options: [], series: [], priceLines: [], crosshair: null, click: null, rangeChange: null, remove: 0, resize: 0, realtime: 0, observe: 0, disconnect: 0 }, panes = [320, 80, 150, 120, 90, 90].map(height => ({ getHeight: () => height, setHeight: (next: any) => { height = next }, setStretchFactor: (factor: any) => { height = factor * 50 } }))
  let range: any = null
  const timeScale: any = {
    getVisibleLogicalRange: () => range,
    setVisibleLogicalRange: (next: any) => { range = next; log.rangeChange?.(range) },
    subscribeVisibleLogicalRangeChange: (fn: any) => { log.rangeChange = fn }, unsubscribeVisibleLogicalRangeChange: (fn: any) => { assert.equal(fn, log.rangeChange); log.rangeChange = null },
    scrollToRealTime: () => { log.realtime++ }, fitContent: () => {},
  }
  const chart: any = {
    addSeries(definition: any, options: any, pane: any) { const item: any = { definition, options: [options], pane, data: [], sets: 0, updates: [], scale: [] }; log.series.push(item); return { setData: (data: any) => { item.data = data; item.sets++ }, update: (point: any) => item.updates.push(point), applyOptions: (options: any) => item.options.push(options), priceScale: () => ({ applyOptions: (options: any) => item.scale.push(options) }), createPriceLine: (options: any) => { const line: any = { options: [options], updates: [] }; line.applyOptions = (next: any) => line.updates.push(next); log.priceLines.push(line); return line } } },
    applyOptions: (value: any) => log.options.push(value), panes: () => panes, timeScale: () => timeScale,
    subscribeCrosshairMove: (fn: any) => { log.crosshair = fn }, unsubscribeCrosshairMove: (fn: any) => { assert.equal(fn, log.crosshair); log.crosshair = null },
    subscribeClick: (fn: any) => { log.click = fn }, unsubscribeClick: (fn: any) => { assert.equal(fn, log.click); log.click = null },
    setCrosshairPosition: (...value: any[]) => { (log as any).selected = value }, resize: () => log.resize++, remove: () => log.remove++,
  }
  class Observer { observe() { log.observe++ } disconnect() { log.disconnect++ } }
  return { log, chart, timeScale, Observer, library: { createChart: (element: any, options: any) => { log.options.push(options); return chart }, CandlestickSeries: 'Candle', HistogramSeries: 'Histogram', LineSeries: 'Line', CrosshairMode: { Normal: 0 }, LineStyle: { Solid: 0, Dotted: 1, Dashed: 2 } } }
}
test('single-chart adapter uses six native panes, tail updates and preserves history viewport', () => {
  const dom = new JSDOM('<div tabindex="0"></div>'), element = dom.window.document.querySelector<HTMLElement & HTMLInputElement>('div'), mock = mockLibrary(), selection = createSelectionStore(), states: any = []
  const adapter = createStockChartAdapter(element, { selection, library: mock.library, ResizeObserverClass: mock.Observer, onViewport: (value: any) => states.push(value) })
  const dataset = createDemoDataset({ count: 100 }), first: any = { ...dataset, bars: dataset.bars.slice(0, 80) }
  adapter.setData(first, computeIndicators(first.bars, { maPeriods: [5, 10, 20, 50, 250] })); adapter.setConfig(normalizeChartConfig())
  // candles, volume, hist, dif, dea, k, d, j, MA5/10/20/50/250 and the three
  // Bollinger lines on the price pane, then %B and Z-Score panes.
  assert.deepEqual(mock.log.series.map((s: any) => (s as any).pane), [0, 1, 2, 2, 2, 3, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 4, 5])
  // The two long lines exist as series but start hidden, and turning MA250 on
  // reaches the adapter as a real visibility change.
  assert.deepEqual(mock.log.series.slice(8, 13).map((s: any) => (s as any).options[0].color), ['#b07b00', '#9957d4', '#2582cb', '#0f8b8d', '#c2410c'])
  // The channel is one colour; its edges are dashed so the mid line reads as the mean.
  assert.deepEqual(mock.log.series.slice(13, 16).map((s: any) => (s as any).options[0].color), ['#607a9c', '#607a9c', '#607a9c'])
  assert.equal((mock.log.series[13] as any).options[0].lineStyle, 2)
  assert.equal((mock.log.series[14] as any).options[0].lineStyle, undefined)
  // Only the %B and Z panes carry horizontal reference lines: 0.5, +2σ, 0, −2σ.
  assert.deepEqual(mock.log.priceLines.map((line: any) => line.options[0].price), [0.5, 2, 0, -2])
  assert.deepEqual(mock.log.series.slice(13).map((s: any) => (s as any).options.at(-1).visible), [true, true, true, false, true])
  adapter.setConfig(normalizeChartConfig({ percentBVisible: true, bollVisible: false }))
  assert.deepEqual(mock.log.series.slice(13).map((s: any) => (s as any).options.at(-1).visible), [false, false, false, true, true])
  adapter.setConfig(normalizeChartConfig())
  adapter.setConfig(normalizeChartConfig({ maVisible: { 250: true } }))
  assert.equal(mock.log.series[12].options.at(-1).visible, true)
  assert.equal(mock.log.series[11].options.at(-1).visible, false)
  assert.equal((mock.log.options[0] as any).layout.attributionLogo, true)
  assert.equal((mock.log.options[0] as any).layout.panes.enableResize, true)
  assert.equal((mock.log.options[0] as any).handleScale.mouseWheel, false)
  assert.equal(mock.log.series.every((s: any) => (s as any).options[0].priceLineVisible === false), true)
  mock.timeScale.setVisibleLogicalRange({ from: 10.5, to: 40.5 })
  adapter.setData(dataset, computeIndicators(dataset.bars))
  assert.deepEqual(mock.timeScale.getVisibleLogicalRange(), { from: 10.5, to: 40.5 })
  assert.equal(mock.log.realtime, 0); assert.deepEqual(states.at(-1), { following: false, newBars: true })
  assert.equal((mock.log.series[0] as any).sets, 1); assert.equal((mock.log.series[0] as any).updates.length, 20)
  adapter.latest(); assert.equal(mock.log.realtime, 1); assert.deepEqual(states.at(-1), { following: true, newBars: false })
  adapter.setFocused(true); assert.equal((mock.log.options.at(-1))!.handleScale.mouseWheel, true)
  adapter.setTheme('dark'); assert.equal((mock.log.options.at(-1))!.layout.background.color, '#151c2a')
  adapter.setLocale('zh-CN'); assert.equal((mock.log.options.at(-1))!.localization.locale, 'zh-CN')
  ;(mock.log.crosshair)!({ time: businessDay(dataset.bars[20].sessionDate) }); (mock.log.click)!({ time: businessDay(dataset.bars[20].sessionDate) }); (mock.log.crosshair)!({ time: businessDay(dataset.bars[40].sessionDate) })
  assert.equal(selection.getSnapshot().sessionDate, dataset.bars[20].sessionDate)
  adapter.selectDate(dataset.bars[15].sessionDate); assert.deepEqual((mock.log as any).selected[1], businessDay(dataset.bars[15].sessionDate))
  assert.equal(adapter.maximizeMacd(), true); assert.equal(adapter.maximizeMacd(), false)
  adapter.dispose(); adapter.dispose(); assert.equal(mock.log.remove, 1); assert.equal(mock.log.observe, 1); assert.equal(mock.log.disconnect, 1)
  assert.equal(mock.log.crosshair, null); assert.equal(mock.log.click, null); assert.equal(mock.log.rangeChange, null)
  dom.window.close()
})
test('adapter restores prepend anchor and revises history without recreating canvases', () => {
  const dom = new JSDOM('<div></div>'), mock = mockLibrary(), adapter = createStockChartAdapter(dom.window.document.querySelector<HTMLElement & HTMLInputElement>('div'), { selection: createSelectionStore(), library: mock.library, ResizeObserverClass: mock.Observer })
  const dataset = createDemoDataset({ count: 100 }), clipped: any = { ...dataset, bars: dataset.bars.slice(20) }
  adapter.setData(clipped, computeIndicators(clipped.bars)); mock.timeScale.setVisibleLogicalRange({ from: 10, to: 30 })
  adapter.setData(dataset, computeIndicators(dataset.bars)); assert.deepEqual(mock.timeScale.getVisibleLogicalRange(), { from: 30, to: 50 })
  const revised: any = { ...dataset, bars: dataset.bars.map((bar: any, i: any) => i === 40 ? { ...bar, close: bar.high } : bar) }
  adapter.setData(revised, computeIndicators(revised.bars)); assert.equal((mock.log.series[0] as any).sets, 3)
  assert.deepEqual(mock.timeScale.getVisibleLogicalRange(), { from: 30, to: 50 }); adapter.dispose(); dom.window.close()
})
test('twenty chart mount/unmount cycles release every observer and subscription', () => {
  const dom = new JSDOM('<div></div>'), dataset = createDemoDataset({ count: 260 }), indicators = computeIndicators(dataset.bars)
  for (let cycle = 0; cycle < 20; cycle++) {
    const mock = mockLibrary(), adapter = createStockChartAdapter(dom.window.document.querySelector<HTMLElement & HTMLInputElement>('div'), { selection: createSelectionStore(), library: mock.library, ResizeObserverClass: mock.Observer })
    adapter.setData(dataset, indicators); adapter.dispose()
    assert.equal(mock.log.remove, 1); assert.equal(mock.log.disconnect, 1)
    assert.equal(mock.log.crosshair, null); assert.equal(mock.log.click, null); assert.equal(mock.log.rangeChange, null)
  }
  dom.window.close()
})
test('theme follows host choice and observer cleans up', async () => {
  const dom = new JSDOM('<body class="light"><div></div></body>'), element = dom.window.document.querySelector<HTMLElement & HTMLInputElement>('div'), seen: any = []
  const dispose = observeChartTheme(element, 'auto', (theme: any) => seen.push(theme))
  assert.equal(resolveChartTheme(element), 'light')
  dom.window.document.body.className = 'dark'; await new Promise<any>(resolve => setTimeout(resolve, 0)); assert.deepEqual(seen, ['light', 'dark'])
  dispose(); dom.window.document.body.className = 'light'; await new Promise<any>(resolve => setTimeout(resolve, 0)); assert.deepEqual(seen, ['light', 'dark']); dom.window.close()
})
test('React chart applies parameters explicitly, scopes keyboard, translates, shows accessible data and disposes', async () => {
  const result = await build({ entryPoints: [new URL('../src/client/chart/StockChart.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'] })
  const dom = new JSDOM('<!doctype html><html><body class="light"><div id="root"></div></body></html>', { url: 'http://localhost/' })
  const original: any = { window: (globalThis as any).window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT }
  ;(globalThis as any).window = dom.window; globalThis.document = dom.window.document; (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  const module: any = { exports: {} }; vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require: createRequire(import.meta.url), console, window: dom.window, document: dom.window.document, navigator: dom.window.navigator, Intl, setTimeout, clearTimeout })
  const observers: any = { created: 0, disconnected: 0 }, NativeObserver = dom.window.MutationObserver
  dom.window.MutationObserver = class extends NativeObserver {
    constructor(callback: any) { super(callback); observers.created++ }
    disconnect() { observers.disconnected++; super.disconnect() }
  }
  const { StockChart } = module.exports, { createRoot } = await import('react-dom/client'), root = createRoot(document.getElementById('root')!)
  const dataset = createDemoDataset({ count: 60 }), log: any = { created: 0, disposed: 0, data: 0, config: [] }, changes: any = []
  const createAdapter = (element: any, options: any) => { log.created++; (log as any).selection = options.selection; return { setData: (next: any) => { log.data++; options.selection.setBars(next.bars) }, setConfig: (config: any) => log.config.push(config), setLocale: () => {}, setTheme: () => {}, setFocused: (value: any) => { (log as any).focused = value }, selectDate: (date: any) => options.selection.select(date), dispose: () => log.disposed++, zoom: () => {}, latest: () => {}, reset: () => {}, maximizeMacd: () => true } }
  const render = async (locale = 'en', inputDataset = dataset) => act(async () => root.render(React.createElement(StockChart, { dataset: inputDataset, t: translate(locale === 'zh' ? chartZh : chartEn), locale, createAdapter, onConfigChange: (value: any) => changes.push(value) })))
  const click = async (button: any) => act(async () => button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  const named = (name: any) => [...document.querySelectorAll('button')].find(button => button.textContent === name)
  const input = async (element: any, value: any) => act(async () => { const prototype = element.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype; (Object.getOwnPropertyDescriptor(prototype, 'value'))!.set!.call(element, value); element.dispatchEvent(new dom.window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })) })
  try {
    await render(); assert.equal(log.created, 1); assert.match(document.body.textContent, /DEMO · SYNTHETIC DATA/)
    const plot = document.querySelector<HTMLElement & HTMLInputElement>('.dxs-chart-canvas')
    await act(async () => { (plot)!.focus(); (plot)!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true })) })
    assert.equal((log as any).focused, true); assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('[data-selected-date]'))!.dataset.selectedDate, dataset.bars.at(-2).sessionDate)
    await act(async () => (log as any).selection.hover(dataset.bars[10].sessionDate)); assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('[data-selected-date]'))!.dataset.selectedDate, dataset.bars.at(-2).sessionDate)
    await act(async () => (plot)!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))); assert.equal((log as any).selection.getSnapshot().locked, false)
    const dataCalls = log.data; await click(document.querySelector<HTMLElement & HTMLInputElement>('input[type="checkbox"]')); assert.equal(((log.config.at(-1))! as any).maVisible[5], false); assert.equal(log.data, dataCalls)
    await click(named('MACD settings')); await input(document.querySelector<HTMLElement & HTMLInputElement>('input[aria-label="Fast period"]'), '40')
    assert.equal(changes.at(-1).macd.fast, 12)
    await act(async () => (document.querySelector<HTMLElement & HTMLInputElement>('.dxs-chart-settings'))!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })))
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('[role="alert"]'))!.textContent, /fast must be less than slow/); assert.equal(changes.at(-1).macd.fast, 12)
    await input(document.querySelector<HTMLElement & HTMLInputElement>('input[aria-label="Fast period"]'), '8'); await input(document.querySelector<HTMLElement & HTMLInputElement>('.dxs-chart-settings select'), '1')
    const before = (log as any).selection.getSnapshot().sessionDate
    await act(async () => { (document.querySelector<HTMLElement & HTMLInputElement>('input[aria-label="Fast period"]'))!.focus(); (document.querySelector<HTMLElement & HTMLInputElement>('input[aria-label="Fast period"]'))!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })) })
    assert.equal((log as any).selection.getSnapshot().sessionDate, before)
    await act(async () => (document.querySelector<HTMLElement & HTMLInputElement>('.dxs-chart-settings'))!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })))
    assert.equal(changes.at(-1).macd.fast, 8); assert.equal(changes.at(-1).macd.histScale, 1); assert.match(document.body.textContent, /MACD \(8, 26, 9\) · histogram ×1/)
    await click(named('View data table')); assert.equal(document.querySelectorAll('tbody tr').length, 60); assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('thead th'))!.getAttribute('scope'), 'col'); assert.match((document.querySelector<HTMLElement & HTMLInputElement>('tbody tr'))!.textContent, /—/)
    await render('zh'); assert.match(document.body.textContent, /DEMO · 合成数据/); assert.match(document.body.textContent, /MACD（8, 26, 9）· 柱 ×1/); assert.equal(log.created, 1)
    await act(async () => { document.body.className = 'dark'; await new Promise<any>(resolve => setTimeout(resolve, 0)) }); assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('.dxs-chart'))!.dataset.chartTheme, 'dark')
    await render('zh', { ...dataset, id: `${dataset.id}-replacement` }); assert.equal(log.created, 2); assert.equal(log.disposed, 1); assert.equal(((log.config.at(-1))! as any).maVisible[5], false); assert.equal(((log.config.at(-1))! as any).macd.fast, 8)
    for (let cycle = 0; cycle < 20; cycle++) {
      await act(async () => root.render(null))
      await render('en')
    }
    assert.equal(log.created, 22); assert.equal(log.disposed, 21)
  } finally {
    await act(async () => root.unmount()); assert.equal(log.disposed, log.created); assert.equal(observers.disconnected, observers.created); dom.window.close()
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete (globalThis as any)[key as keyof typeof globalThis]; else (globalThis as any)[key as keyof typeof globalThis] = value }
  }
})
