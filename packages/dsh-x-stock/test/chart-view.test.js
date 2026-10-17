import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createDemoDataset } from '../src/chart-data.js'
import { computeIndicators } from '../src/indicators.js'
import { businessDay, sessionKey, buildChartData, createSelectionStore, preserveLogicalRange } from '../src/client/chart/model.js'
import { normalizeChartConfig } from '../src/client/chart/config.js'
import { createStockChartAdapter } from '../src/client/chart/adapter.js'
import { chartZh, chartEn } from '../src/client/chart/locales.js'
import { resolveChartTheme, observeChartTheme } from '../src/client/chart/theme.js'

const translate = dictionary => (key, values = {}) => (dictionary[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? `{${name}}`))

test('chart data preserves session dates, sparse indicators and unknown volume', () => {
  assert.deepEqual(businessDay('2026-03-08'), { year: 2026, month: 3, day: 8 })
  assert.equal(sessionKey(businessDay('2026-11-01')), '2026-11-01')
  const dataset = createDemoDataset({ count: 40 }), bars = dataset.bars.map((bar, index) => ({ ...bar, volume: index === 0 ? null : index === 1 ? 0 : bar.volume }))
  const indicators = computeIndicators(bars), missing = indicators.rows[36]
  const data = buildChartData({ ...dataset, bars }, { ...indicators, rows: indicators.rows.filter(row => row !== missing) })
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
  for (const key of Object.keys(chartZh)) assert.deepEqual(chartZh[key].match(/\{\w+\}/g)?.sort(), chartEn[key].match(/\{\w+\}/g)?.sort(), key)
  assert.deepEqual(normalizeChartConfig().macd, { fast: 12, slow: 26, signal: 9, histScale: 2 })
  const sanitized = normalizeChartConfig({ macd: { fast: 8, unknownSavedKey: true } })
  assert.deepEqual(sanitized.macd, { fast: 8, slow: 26, signal: 9, histScale: 2 })
  assert.doesNotThrow(() => computeIndicators(createDemoDataset({ count: 40 }).bars, { macd: sanitized.macd }))
  for (const malformed of [null, [], 'bad', { macd: null }, { macd: [] }, { macd: 'bad' }]) assert.throws(() => normalizeChartConfig(malformed))
  for (const macd of [{ fast: 30 }, { fast: 0 }, { slow: 2.5 }, { signal: 251 }, { histScale: 3 }]) assert.throws(() => normalizeChartConfig({ macd }))
})
test('prepend preserves logical viewport by its original date anchor', () => {
  const all = createDemoDataset({ count: 100 }).bars, range = { from: 9.5, to: 29.5 }
  assert.deepEqual(preserveLogicalRange(range, all.slice(20), all), { from: 29.5, to: 49.5 })
})
function mockLibrary() {
  const log = { options: [], series: [], crosshair: null, click: null, rangeChange: null, remove: 0, resize: 0, realtime: 0, observe: 0, disconnect: 0 }, panes = [320, 80, 150].map(height => ({ getHeight: () => height, setHeight: next => { height = next }, setStretchFactor: factor => { height = factor * 50 } }))
  let range = null
  const timeScale = {
    getVisibleLogicalRange: () => range,
    setVisibleLogicalRange: next => { range = next; log.rangeChange?.(range) },
    subscribeVisibleLogicalRangeChange: fn => { log.rangeChange = fn }, unsubscribeVisibleLogicalRangeChange: fn => { assert.equal(fn, log.rangeChange); log.rangeChange = null },
    scrollToRealTime: () => { log.realtime++ }, fitContent: () => {},
  }
  const chart = {
    addSeries(definition, options, pane) { const item = { definition, options: [options], pane, data: [], sets: 0, updates: [], scale: [] }; log.series.push(item); return { setData: data => { item.data = data; item.sets++ }, update: point => item.updates.push(point), applyOptions: options => item.options.push(options), priceScale: () => ({ applyOptions: options => item.scale.push(options) }) } },
    applyOptions: value => log.options.push(value), panes: () => panes, timeScale: () => timeScale,
    subscribeCrosshairMove: fn => { log.crosshair = fn }, unsubscribeCrosshairMove: fn => { assert.equal(fn, log.crosshair); log.crosshair = null },
    subscribeClick: fn => { log.click = fn }, unsubscribeClick: fn => { assert.equal(fn, log.click); log.click = null },
    setCrosshairPosition: (...value) => { log.selected = value }, resize: () => log.resize++, remove: () => log.remove++,
  }
  class Observer { observe() { log.observe++ } disconnect() { log.disconnect++ } }
  return { log, chart, timeScale, Observer, library: { createChart: (element, options) => { log.options.push(options); return chart }, CandlestickSeries: 'Candle', HistogramSeries: 'Histogram', LineSeries: 'Line', CrosshairMode: { Normal: 0 } } }
}
test('single-chart adapter uses three native panes, tail updates and preserves history viewport', () => {
  const dom = new JSDOM('<div tabindex="0"></div>'), element = dom.window.document.querySelector('div'), mock = mockLibrary(), selection = createSelectionStore(), states = []
  const adapter = createStockChartAdapter(element, { selection, library: mock.library, ResizeObserverClass: mock.Observer, onViewport: value => states.push(value) })
  const dataset = createDemoDataset({ count: 100 }), first = { ...dataset, bars: dataset.bars.slice(0, 80) }
  adapter.setData(first, computeIndicators(first.bars)); adapter.setConfig(normalizeChartConfig())
  assert.deepEqual(mock.log.series.map(s => s.pane), [0, 1, 2, 2, 2, 0, 0, 0])
  assert.equal(mock.log.options[0].layout.attributionLogo, true)
  assert.equal(mock.log.options[0].layout.panes.enableResize, true)
  assert.equal(mock.log.options[0].handleScale.mouseWheel, false)
  assert.equal(mock.log.series.every(s => s.options[0].priceLineVisible === false), true)
  mock.timeScale.setVisibleLogicalRange({ from: 10.5, to: 40.5 })
  adapter.setData(dataset, computeIndicators(dataset.bars))
  assert.deepEqual(mock.timeScale.getVisibleLogicalRange(), { from: 10.5, to: 40.5 })
  assert.equal(mock.log.realtime, 0); assert.deepEqual(states.at(-1), { following: false, newBars: true })
  assert.equal(mock.log.series[0].sets, 1); assert.equal(mock.log.series[0].updates.length, 20)
  adapter.latest(); assert.equal(mock.log.realtime, 1); assert.deepEqual(states.at(-1), { following: true, newBars: false })
  adapter.setFocused(true); assert.equal(mock.log.options.at(-1).handleScale.mouseWheel, true)
  adapter.setTheme('dark'); assert.equal(mock.log.options.at(-1).layout.background.color, '#151c2a')
  adapter.setLocale('zh-CN'); assert.equal(mock.log.options.at(-1).localization.locale, 'zh-CN')
  mock.log.crosshair({ time: businessDay(dataset.bars[20].sessionDate) }); mock.log.click({ time: businessDay(dataset.bars[20].sessionDate) }); mock.log.crosshair({ time: businessDay(dataset.bars[40].sessionDate) })
  assert.equal(selection.getSnapshot().sessionDate, dataset.bars[20].sessionDate)
  adapter.selectDate(dataset.bars[15].sessionDate); assert.deepEqual(mock.log.selected[1], businessDay(dataset.bars[15].sessionDate))
  assert.equal(adapter.maximizeMacd(), true); assert.equal(adapter.maximizeMacd(), false)
  adapter.dispose(); adapter.dispose(); assert.equal(mock.log.remove, 1); assert.equal(mock.log.observe, 1); assert.equal(mock.log.disconnect, 1)
  assert.equal(mock.log.crosshair, null); assert.equal(mock.log.click, null); assert.equal(mock.log.rangeChange, null)
  dom.window.close()
})
test('adapter restores prepend anchor and revises history without recreating canvases', () => {
  const dom = new JSDOM('<div></div>'), mock = mockLibrary(), adapter = createStockChartAdapter(dom.window.document.querySelector('div'), { selection: createSelectionStore(), library: mock.library, ResizeObserverClass: mock.Observer })
  const dataset = createDemoDataset({ count: 100 }), clipped = { ...dataset, bars: dataset.bars.slice(20) }
  adapter.setData(clipped, computeIndicators(clipped.bars)); mock.timeScale.setVisibleLogicalRange({ from: 10, to: 30 })
  adapter.setData(dataset, computeIndicators(dataset.bars)); assert.deepEqual(mock.timeScale.getVisibleLogicalRange(), { from: 30, to: 50 })
  const revised = { ...dataset, bars: dataset.bars.map((bar, i) => i === 40 ? { ...bar, close: bar.high } : bar) }
  adapter.setData(revised, computeIndicators(revised.bars)); assert.equal(mock.log.series[0].sets, 3)
  assert.deepEqual(mock.timeScale.getVisibleLogicalRange(), { from: 30, to: 50 }); adapter.dispose(); dom.window.close()
})
test('twenty chart mount/unmount cycles release every observer and subscription', () => {
  const dom = new JSDOM('<div></div>'), dataset = createDemoDataset({ count: 260 }), indicators = computeIndicators(dataset.bars)
  for (let cycle = 0; cycle < 20; cycle++) {
    const mock = mockLibrary(), adapter = createStockChartAdapter(dom.window.document.querySelector('div'), { selection: createSelectionStore(), library: mock.library, ResizeObserverClass: mock.Observer })
    adapter.setData(dataset, indicators); adapter.dispose()
    assert.equal(mock.log.remove, 1); assert.equal(mock.log.disconnect, 1)
    assert.equal(mock.log.crosshair, null); assert.equal(mock.log.click, null); assert.equal(mock.log.rangeChange, null)
  }
  dom.window.close()
})
test('theme follows host choice and observer cleans up', async () => {
  const dom = new JSDOM('<body class="light"><div></div></body>'), element = dom.window.document.querySelector('div'), seen = []
  const dispose = observeChartTheme(element, 'auto', theme => seen.push(theme))
  assert.equal(resolveChartTheme(element), 'light')
  dom.window.document.body.className = 'dark'; await new Promise(resolve => setTimeout(resolve, 0)); assert.deepEqual(seen, ['light', 'dark'])
  dispose(); dom.window.document.body.className = 'light'; await new Promise(resolve => setTimeout(resolve, 0)); assert.deepEqual(seen, ['light', 'dark']); dom.window.close()
})
test('React chart applies parameters explicitly, scopes keyboard, translates, shows accessible data and disposes', async () => {
  const result = await build({ entryPoints: [new URL('../src/client/chart/StockChart.jsx', import.meta.url).pathname], bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'] })
  const dom = new JSDOM('<!doctype html><html><body class="light"><div id="root"></div></body></html>', { url: 'http://localhost/' })
  const original = { window: globalThis.window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT }
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const module = { exports: {} }; vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require: createRequire(import.meta.url), console, window: dom.window, document: dom.window.document, navigator: dom.window.navigator, Intl, setTimeout, clearTimeout })
  const observers = { created: 0, disconnected: 0 }, NativeObserver = dom.window.MutationObserver
  dom.window.MutationObserver = class extends NativeObserver {
    constructor(callback) { super(callback); observers.created++ }
    disconnect() { observers.disconnected++; super.disconnect() }
  }
  const { StockChart } = module.exports, { createRoot } = await import('react-dom/client'), root = createRoot(document.getElementById('root'))
  const dataset = createDemoDataset({ count: 60 }), log = { created: 0, disposed: 0, data: 0, config: [] }, changes = []
  const createAdapter = (element, options) => { log.created++; log.selection = options.selection; return { setData: next => { log.data++; options.selection.setBars(next.bars) }, setConfig: config => log.config.push(config), setLocale: () => {}, setTheme: () => {}, setFocused: value => { log.focused = value }, selectDate: date => options.selection.select(date), dispose: () => log.disposed++, zoom: () => {}, latest: () => {}, reset: () => {}, maximizeMacd: () => true } }
  const render = async (locale = 'en', inputDataset = dataset) => act(async () => root.render(React.createElement(StockChart, { dataset: inputDataset, t: translate(locale === 'zh' ? chartZh : chartEn), locale, createAdapter, onConfigChange: value => changes.push(value) })))
  const click = async button => act(async () => button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  const named = name => [...document.querySelectorAll('button')].find(button => button.textContent === name)
  const input = async (element, value) => act(async () => { const prototype = element.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value); element.dispatchEvent(new dom.window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })) })
  try {
    await render(); assert.equal(log.created, 1); assert.match(document.body.textContent, /DEMO · SYNTHETIC DATA/)
    const plot = document.querySelector('.dxs-chart-canvas')
    await act(async () => { plot.focus(); plot.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true })) })
    assert.equal(log.focused, true); assert.equal(document.querySelector('[data-selected-date]').dataset.selectedDate, dataset.bars.at(-2).sessionDate)
    await act(async () => log.selection.hover(dataset.bars[10].sessionDate)); assert.equal(document.querySelector('[data-selected-date]').dataset.selectedDate, dataset.bars.at(-2).sessionDate)
    await act(async () => plot.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))); assert.equal(log.selection.getSnapshot().locked, false)
    const dataCalls = log.data; await click(document.querySelector('input[type="checkbox"]')); assert.equal(log.config.at(-1).maVisible[5], false); assert.equal(log.data, dataCalls)
    await click(named('MACD settings')); await input(document.querySelector('input[aria-label="Fast period"]'), '40')
    assert.equal(changes.at(-1).macd.fast, 12)
    await act(async () => document.querySelector('.dxs-chart-settings').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })))
    assert.match(document.querySelector('[role="alert"]').textContent, /fast must be less than slow/); assert.equal(changes.at(-1).macd.fast, 12)
    await input(document.querySelector('input[aria-label="Fast period"]'), '8'); await input(document.querySelector('.dxs-chart-settings select'), '1')
    const before = log.selection.getSnapshot().sessionDate
    await act(async () => { document.querySelector('input[aria-label="Fast period"]').focus(); document.querySelector('input[aria-label="Fast period"]').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })) })
    assert.equal(log.selection.getSnapshot().sessionDate, before)
    await act(async () => document.querySelector('.dxs-chart-settings').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })))
    assert.equal(changes.at(-1).macd.fast, 8); assert.equal(changes.at(-1).macd.histScale, 1); assert.match(document.body.textContent, /MACD \(8, 26, 9\) · histogram ×1/)
    await click(named('View data table')); assert.equal(document.querySelectorAll('tbody tr').length, 60); assert.equal(document.querySelector('thead th').getAttribute('scope'), 'col'); assert.match(document.querySelector('tbody tr').textContent, /—/)
    await render('zh'); assert.match(document.body.textContent, /DEMO · 合成数据/); assert.match(document.body.textContent, /MACD（8, 26, 9）· 柱 ×1/); assert.equal(log.created, 1)
    await act(async () => { document.body.className = 'dark'; await new Promise(resolve => setTimeout(resolve, 0)) }); assert.equal(document.querySelector('.dxs-chart').dataset.chartTheme, 'dark')
    await render('zh', { ...dataset, id: `${dataset.id}-replacement` }); assert.equal(log.created, 2); assert.equal(log.disposed, 1); assert.equal(log.config.at(-1).maVisible[5], false); assert.equal(log.config.at(-1).macd.fast, 8)
    for (let cycle = 0; cycle < 20; cycle++) {
      await act(async () => root.render(null))
      await render('en')
    }
    assert.equal(log.created, 22); assert.equal(log.disposed, 21)
  } finally {
    await act(async () => root.unmount()); assert.equal(log.disposed, log.created); assert.equal(observers.disconnected, observers.created); dom.window.close()
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value }
  }
})
