import React, { useEffect, useRef, useState } from 'react'
import * as LightweightCharts from 'lightweight-charts'
import { DOWN_COLOR, UP_COLOR } from './model.ts'
import { PALETTES } from './theme.ts'

function stamp(sessionDate: string, time: string) {
  return Date.parse(`${sessionDate}T${time}:00+08:00`) / 1000
}

/** Price and volume for one session. Missing volume stays blank; nothing is filled. */
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
      const palette = PALETTES.light
      chart = LightweightCharts.createChart(node, {
        width: Math.max(1, node.clientWidth), height: 360,
        layout: { background: { type: LightweightCharts.ColorType.Solid, color: palette.background }, textColor: palette.text, fontFamily: 'system-ui, sans-serif', attributionLogo: true },
        grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
        rightPriceScale: { borderColor: palette.border },
        timeScale: { borderColor: palette.border, timeVisible: true, secondsVisible: false },
        handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      })
      const price = chart.addSeries(LightweightCharts.LineSeries, { color: up ? UP_COLOR : DOWN_COLOR, lineWidth: 2, priceLineVisible: false }, 0)
      const average = chart.addSeries(LightweightCharts.LineSeries, { color: '#df9635', lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, 0)
      const volume = chart.addSeries(LightweightCharts.HistogramSeries, { priceFormat: { type: 'volume' } }, 1)
      chart.panes()[0].setStretchFactor(3)
      chart.panes()[1].setStretchFactor(1)
      price.setData(session.points.map((point: any) => ({ time: stamp(session.sessionDate, point.time), value: point.price })))
      average.setData(session.points.filter((point: any) => point.average != null).map((point: any) => ({ time: stamp(session.sessionDate, point.time), value: point.average })))
      volume.setData(session.points.map((point: any, index: number) => {
        const prior = index ? session.points[index - 1].price : previous
        const rising = prior == null || point.price >= prior
        return point.volume == null
          ? { time: stamp(session.sessionDate, point.time) }
          : { time: stamp(session.sessionDate, point.time), value: point.volume, color: rising ? UP_COLOR : DOWN_COLOR }
      }))
      if (previous != null) price.createPriceLine({ price: previous, color: '#717885', lineWidth: 1, lineStyle: 2, title: t('intraday.previous') })
      chart.timeScale().fitContent()
      setFailed(false)
    } catch { setFailed(true) }
    return () => { try { chart?.remove() } catch { /* already gone */ } }
  }, [session, up, previous])
  return <div className="dxs-intraday">
    {failed ? <p role="alert">{t('intraday.chart-failed')}</p> : <div ref={element} className="dxs-intraday-canvas" role="img" aria-label={t('intraday.canvas', { date: session.sessionDate })} />}
  </div>
}
