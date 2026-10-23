import React, { useEffect, useRef, useState } from 'react'
import * as LightweightCharts from 'lightweight-charts'
import { DOWN_COLOR, UP_COLOR } from './model.ts'
import { PALETTES, resolveChartTheme } from './theme.ts'
import { exchangeStamp, formatExchangeClock, formatLots, intradayRange } from './intraday-scale.ts'

/** A-share 分时: Beijing time, price on the left, percent versus the previous close on the right. */
export function IntradayChart({ session, t }: any) {
  const element = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  const last = session.points.at(-1)
  const previous = session.previousClose
  const up = previous == null || last.price >= previous
  useEffect(() => {
    const node = element.current
    if (!node) return
    let chart: any
    try {
      const palette = PALETTES[resolveChartTheme(node) as keyof typeof PALETTES] ?? PALETTES.light
      const clock = (time: any) => typeof time === 'number' ? formatExchangeClock(time) : ''
      chart = LightweightCharts.createChart(node, {
        width: Math.max(1, node.clientWidth), height: 360,
        layout: { background: { type: LightweightCharts.ColorType.Solid, color: palette.background }, textColor: palette.text, fontFamily: 'system-ui, sans-serif', attributionLogo: true },
        grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
        leftPriceScale: { visible: previous != null, borderColor: palette.border },
        rightPriceScale: { visible: true, borderColor: palette.border },
        localization: { timeFormatter: clock },
        timeScale: { borderColor: palette.border, timeVisible: true, secondsVisible: false, tickMarkFormatter: clock },
        handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      })
      const range = typeof previous === 'number' ? intradayRange(session.points.flatMap((point: any) => point.average == null ? [point.price] : [point.price, point.average]), previous) : null
      const price = chart.addSeries(LightweightCharts.LineSeries, {
        color: up ? UP_COLOR : DOWN_COLOR, lineWidth: 2, priceLineVisible: false, priceScaleId: range ? 'left' : 'right',
        autoscaleInfoProvider: range ? () => ({ priceRange: { minValue: range.priceMin, maxValue: range.priceMax } }) : undefined,
      }, 0)
      const average = chart.addSeries(LightweightCharts.LineSeries, {
        color: '#df9635', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, priceScaleId: range ? 'left' : 'right',
        autoscaleInfoProvider: range ? () => ({ priceRange: { minValue: range.priceMin, maxValue: range.priceMax } }) : undefined,
      }, 0)
      if (range) chart.addSeries(LightweightCharts.LineSeries, {
        priceScaleId: 'right', color: 'transparent', lineVisible: false, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false,
        priceFormat: { type: 'custom', minMove: 0.01, formatter: (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%` },
        autoscaleInfoProvider: () => ({ priceRange: { minValue: -range.percent, maxValue: range.percent } }),
      }, 0).setData(session.points.map((point: any) => ({ time: exchangeStamp(session.sessionDate, point.time), value: (point.price - previous) / previous * 100 })))
      const volume = chart.addSeries(LightweightCharts.HistogramSeries, {
        priceFormat: { type: 'custom', formatter: (value: number) => formatLots(value) },
      }, 1)
      chart.panes()[0].setStretchFactor(3)
      chart.panes()[1].setStretchFactor(1)
      const at = (time: string) => exchangeStamp(session.sessionDate, time)
      price.setData(session.points.map((point: any) => ({ time: at(point.time), value: point.price })))
      average.setData(session.points.filter((point: any) => point.average != null).map((point: any) => ({ time: at(point.time), value: point.average })))
      volume.setData(session.points.map((point: any, index: number) => {
        const prior = index ? session.points[index - 1].price : previous
        const rising = prior == null || point.price >= prior
        const time = at(point.time)
        return point.volume == null ? { time } : { time, value: point.volume, color: rising ? UP_COLOR : DOWN_COLOR }
      }))
      if (previous != null) price.createPriceLine({ price: previous, color: palette.crosshair, lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, title: t('intraday.previous') })
      chart.timeScale().fitContent()
      setFailed(false)
    } catch { setFailed(true) }
    return () => { try { chart?.remove() } catch { /* already gone */ } }
  }, [session, up, previous])
  return <div className="dxs-intraday">
    <p className="dxs-intraday-legend">
      <span><i style={{ background: up ? UP_COLOR : DOWN_COLOR }} />{t('intraday.price')}</span>
      <span><i style={{ background: '#df9635' }} />{t('intraday.average')}</span>
      <span><i className="is-dashed" />{t('intraday.previous')}</span>
      <span>{t(previous == null ? 'intraday.axis-price' : 'intraday.axis')}</span>
    </p>
    {failed ? <p role="alert">{t('intraday.chart-failed')}</p> : <div className="dxs-intraday-plot">
      <div ref={element} className="dxs-intraday-canvas" role="img" aria-label={t('intraday.canvas', { date: session.sessionDate })} />
      <span className="dxs-intraday-volume">{t('intraday.volume')}</span>
    </div>}
  </div>
}
