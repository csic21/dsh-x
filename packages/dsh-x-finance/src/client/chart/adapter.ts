import * as LightweightCharts from 'lightweight-charts'
import { buildChartData, businessDay, sessionKey, preserveLogicalRange, MA_COLORS, UP_COLOR, DOWN_COLOR } from './model.ts'
import { PALETTES } from './theme.ts'

const samePoint = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b)
const identity = (dataset: any) => [dataset.kind, dataset.id, dataset.symbol, dataset.interval, dataset.adjustment, dataset.adjustmentRevision].join('|')

// Only normalized daily bars enter this adapter. It has no network, quote or
// storage access; a raw quote can never become a line on an adjusted chart.
export function createStockChartAdapter(element: any, {
  selection, onViewport = () => {}, locale = 'en', theme = 'light',
  library = LightweightCharts, ResizeObserverClass = element.ownerDocument.defaultView?.ResizeObserver,
}: any = {}) {
  const { createChart, CandlestickSeries, HistogramSeries, LineSeries, CrosshairMode } = library
  let disposed = false, bars: any = [], data: any = null, datasetId: any = null, suppressRange = false, following = true, newBars = false, maximized = false, restoreHeights: any = null
  const palette = PALETTES[theme as keyof typeof PALETTES] ?? PALETTES.light
  const chart = createChart(element, {
    width: Math.max(1, element.clientWidth), height: Math.max(360, element.clientHeight || 500),
    layout: { background: { type: 'solid', color: palette.background }, textColor: palette.text, fontFamily: 'system-ui, sans-serif', attributionLogo: true,
      panes: { enableResize: true, separatorColor: palette.border, separatorHoverColor: palette.crosshair } },
    grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
    crosshair: { mode: CrosshairMode.Normal, vertLine: { color: palette.crosshair }, horzLine: { color: palette.crosshair } },
    rightPriceScale: { borderColor: palette.border, minimumWidth: 64, mode: 0 },
    timeScale: { borderColor: palette.border, rightOffset: 5, minBarSpacing: 2, shiftVisibleRangeOnNewBar: false, allowShiftVisibleRangeOnWhitespaceReplacement: false },
    handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
    localization: { locale },
  })
  const common = { priceLineVisible: false, lastValueVisible: false }
  const series = {
    candles: chart.addSeries(CandlestickSeries, { ...common, upColor: UP_COLOR, downColor: DOWN_COLOR, borderUpColor: UP_COLOR, borderDownColor: DOWN_COLOR, wickUpColor: UP_COLOR, wickDownColor: DOWN_COLOR }, 0),
    volume: chart.addSeries(HistogramSeries, { ...common, priceFormat: { type: 'volume' } }, 1),
    hist: chart.addSeries(HistogramSeries, { ...common, base: 0 }, 2),
    dif: chart.addSeries(LineSeries, { ...common, color: '#df9635', lineWidth: 2, crosshairMarkerVisible: true }, 2),
    dea: chart.addSeries(LineSeries, { ...common, color: '#8d70e4', lineWidth: 2, crosshairMarkerVisible: true }, 2),
    k: chart.addSeries(LineSeries, { ...common, color: '#df9635', lineWidth: 1, crosshairMarkerVisible: true }, 3),
    d: chart.addSeries(LineSeries, { ...common, color: '#8d70e4', lineWidth: 1, crosshairMarkerVisible: true }, 3),
    j: chart.addSeries(LineSeries, { ...common, color: '#2582cb', lineWidth: 1, crosshairMarkerVisible: true }, 3),
  }
  for (const period of [5, 10, 20]) series[`ma${period}` as keyof typeof series] = chart.addSeries(LineSeries, { ...common, color: MA_COLORS[period as keyof typeof MA_COLORS], lineWidth: 1, crosshairMarkerVisible: false }, 0)
  series.volume.priceScale().applyOptions({ scaleMargins: { top: .18, bottom: 0 }, autoScale: true })
  series.hist.priceScale().applyOptions({ scaleMargins: { top: .15, bottom: .15 }, autoScale: true })
  series.j.priceScale().applyOptions({ scaleMargins: { top: .15, bottom: .15 }, autoScale: true })
  chart.panes()[0].setStretchFactor(6); chart.panes()[1].setStretchFactor(1.4); chart.panes()[2].setStretchFactor(2); chart.panes()[3].setStretchFactor(2)
  const timeScale = chart.timeScale()
  const report = () => onViewport({ following, newBars })
  const rangeChanged = (range: any) => {
    if (disposed || suppressRange || !range || !bars.length) return
    const next = range.to >= bars.length - 1
    if (next !== following || (next && newBars)) { following = next; if (next) newBars = false; report() }
  }
  const hover = (event: any) => { if (!disposed) selection?.hover(sessionKey(event.time)) }
  const click = (event: any) => { if (!disposed) { element.focus({ preventScroll: true }); selection?.click(sessionKey(event.time)) } }
  chart.subscribeCrosshairMove(hover); chart.subscribeClick(click); timeScale.subscribeVisibleLogicalRangeChange(rangeChanged)
  const resize = () => { if (!disposed) chart.resize(Math.max(1, element.clientWidth), Math.max(360, element.clientHeight || 500)) }
  const observer = ResizeObserverClass ? new ResizeObserverClass(resize) : null
  observer?.observe(element)
  const view = element.ownerDocument.defaultView
  if (!observer) view?.addEventListener('resize', resize)
  return {
    setData(dataset: any, indicators: any) {
      if (disposed) return
      const next = buildChartData(dataset, indicators), nextId = identity(dataset), reset = datasetId !== nextId
      const range = timeScale.getVisibleLogicalRange(), oldBars = bars, wasFollowing = following
      const appended = !reset && bars.length > 0 && dataset.bars.at(-1)?.sessionDate > bars.at(-1)?.sessionDate
      suppressRange = true
      // update() handles appended/replaced tail; any earlier correction or
      // parameter change uses setData(), restoring the same date anchor.
      for (const [key, target] of Object.entries(series)) {
        const previous = data?.[key], points = next[key as keyof typeof next]
        const tailOnly = !reset && previous?.length && points.length >= previous.length
          && previous.slice(0, -1).every((point: any, index: any) => samePoint(point, points[index]))
          && sessionKey(previous.at(-1).time) === sessionKey(points[previous.length - 1]?.time)
        if (tailOnly) {
          for (let i = previous.length - 1; i < points.length; i++) if (!samePoint(previous[i], points[i])) target.update(points[i])
        } else target.setData(points)
      }
      bars = dataset.bars; data = next; datasetId = nextId
      const precision = dataset.pricePrecision ?? 2
      for (const key of ['candles', 'ma5', 'ma10', 'ma20']) series[key as keyof typeof series].applyOptions({ priceFormat: { type: 'price', precision, minMove: 10 ** -precision } })
      const indicatorPrecision = Math.max(3, precision)
      for (const key of ['dif', 'dea', 'hist', 'k', 'd', 'j']) series[key as keyof typeof series].applyOptions({ priceFormat: { type: 'price', precision: indicatorPrecision, minMove: 10 ** -indicatorPrecision } })
      selection?.setBars(bars, reset)
      if (reset) {
        following = true; newBars = false
        if (bars.length) timeScale.setVisibleLogicalRange({ from: Math.max(-1, bars.length - 120), to: bars.length + 4 })
      } else if (range) {
        timeScale.setVisibleLogicalRange(preserveLogicalRange(range, oldBars, bars))
        if (appended && wasFollowing) timeScale.scrollToRealTime()
        if (appended && !wasFollowing) newBars = true
      }
      suppressRange = false; report()
    },
    setConfig(config: any) {
      if (disposed) return
      for (const period of [5, 10, 20]) series[`ma${period}` as keyof typeof series].applyOptions({ visible: config.maVisible[period] })
      series.dif.applyOptions({ visible: config.difVisible }); series.dea.applyOptions({ visible: config.deaVisible })
      const kdj = config.kdjVisible !== false
      for (const key of ['k', 'd', 'j']) series[key as keyof typeof series].applyOptions({ visible: kdj })
      chart.panes()[3]?.setStretchFactor(kdj ? 2 : 0.001)
    },
    setLocale(nextLocale: any) { if (!disposed) chart.applyOptions({ localization: { locale: nextLocale } }) },
    setTheme(value: any) {
      if (disposed) return
      const p = PALETTES[value as keyof typeof PALETTES] ?? PALETTES.light
      chart.applyOptions({ layout: { background: { type: 'solid', color: p.background }, textColor: p.text, attributionLogo: true, panes: { enableResize: true, separatorColor: p.border, separatorHoverColor: p.crosshair } }, grid: { vertLines: { color: p.grid }, horzLines: { color: p.grid } }, rightPriceScale: { borderColor: p.border }, timeScale: { borderColor: p.border }, crosshair: { vertLine: { color: p.crosshair }, horzLine: { color: p.crosshair } } })
    },
    setFocused(focused: any) { if (!disposed) chart.applyOptions({ handleScale: { mouseWheel: focused } }) },
    selectDate(date: any) {
      if (disposed) return
      const index = bars.findIndex((bar: any) => bar.sessionDate === date), bar = bars[index]
      if (!bar) return
      selection?.select(date)
      const range = timeScale.getVisibleLogicalRange()
      if (range && (index < range.from || index > range.to)) {
        const width = range.to - range.from
        timeScale.setVisibleLogicalRange({ from: index - width / 2, to: index + width / 2 })
      }
      chart.setCrosshairPosition(bar.close, businessDay(date), series.candles)
    },
    latest() { if (!disposed) { following = true; newBars = false; timeScale.scrollToRealTime(); report() } },
    reset() { if (!disposed) { timeScale.fitContent(); for (const key of ['candles', 'volume', 'hist']) series[key as keyof typeof series].priceScale().applyOptions({ autoScale: true }); following = true; newBars = false; report() } },
    zoom(factor: any) {
      if (disposed) return
      const range = timeScale.getVisibleLogicalRange(); if (!range) return
      const width = Math.max(10, (range.to - range.from) * factor)
      timeScale.setVisibleLogicalRange({ from: range.to - width, to: range.to })
    },
    maximizeMacd() {
      if (disposed) return false
      const panes = chart.panes()
      if (!maximized) { restoreHeights = panes.map((pane: any) => pane.getHeight()); [2, 1, 7, 1].slice(0, panes.length).forEach((factor, index) => panes[index].setStretchFactor(factor)) }
      else restoreHeights?.forEach((height: any, index: any) => panes[index].setStretchFactor(height))
      maximized = !maximized; return maximized
    },
    dispose() {
      if (disposed) return
      disposed = true; observer?.disconnect(); if (!observer) view?.removeEventListener('resize', resize)
      chart.unsubscribeCrosshairMove(hover); chart.unsubscribeClick(click); timeScale.unsubscribeVisibleLogicalRangeChange(rangeChanged)
      chart.remove(); bars = []; data = null
    },
  }
}
