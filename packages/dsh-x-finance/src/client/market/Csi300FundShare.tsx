import React from 'react'
import type { Csi300Fund, Csi300FundSharePoint } from '../../market.ts'
import { useCsi300FundShare } from './data.ts'

const CHART_WIDTH = 640
const CHART_HEIGHT = 200
const CHART_PAD = { left: 48, right: 14, top: 14, bottom: 26 }

function quarterLabel(date: string, t: (key: string, params?: Record<string, any>) => string): string {
  const month = Number(date.slice(5, 7))
  return t('csi300.quarter', { year: date.slice(0, 4), quarter: Math.floor((month - 1) / 3) + 1 })
}

/**
 * A small SVG line for the quarterly ratio. The vertical domain follows the
 * series so a one-point move is visible, and every point carries its own
 * figures in a tooltip. No library is pulled in for one chart.
 */
function TrendChart({ points, t, format }: { points: Csi300FundSharePoint[], t: any, format: any }) {
  const values = points.map(point => point.ratio * 100)
  const low = Math.min(...values)
  const high = Math.max(...values)
  // Snap the vertical domain to round steps so the axis reads like a chart and
  // not like three arbitrary decimals.
  const span = high - low
  const rough = (span > 0 ? span : Math.max(high * 0.2, 0.05)) / 4
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map(factor => factor * magnitude).find(candidate => candidate >= rough) ?? magnitude * 10
  const min = Math.max(0, Math.floor(low / step) * step)
  const max = Math.max(min + step, Math.ceil(high / step) * step)
  const ticks: number[] = []
  for (let value = min; value <= max + step / 2; value += step) ticks.push(Number(value.toFixed(6)))
  const plotWidth = CHART_WIDTH - CHART_PAD.left - CHART_PAD.right
  const plotHeight = CHART_HEIGHT - CHART_PAD.top - CHART_PAD.bottom
  const x = (index: number) => CHART_PAD.left + plotWidth * (points.length <= 1 ? 0.5 : index / (points.length - 1))
  const y = (value: number) => CHART_PAD.top + plotHeight * (1 - (value - min) / (max - min || 1))
  const line = points.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(point.ratio * 100).toFixed(1)}`).join(' ')
  const area = `${line} L${x(points.length - 1).toFixed(1)},${(CHART_PAD.top + plotHeight).toFixed(1)} L${x(0).toFixed(1)},${(CHART_PAD.top + plotHeight).toFixed(1)} Z`
  const labelEvery = Math.max(1, Math.ceil(points.length / 6))
  return <figure className="dxs-csi300-figure">
    <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label={t('csi300.trend-aria', { from: points[0]!.date, to: points[points.length - 1]!.date })}>
      {ticks.map((tick, index) => <g key={index}>
        <line x1={CHART_PAD.left} x2={CHART_WIDTH - CHART_PAD.right} y1={y(tick)} y2={y(tick)} className="dxs-csi300-grid" />
        <text x={CHART_PAD.left - 8} y={y(tick) + 3} textAnchor="end" className="dxs-csi300-axis">{format.ratio(tick)}%</text>
      </g>)}
      <path d={area} className="dxs-csi300-area" />
      <path d={line} className="dxs-csi300-line" />
      {points.map((point, index) => <g key={point.date}>
        <circle cx={x(index)} cy={y(point.ratio * 100)} r={3.2} className="dxs-csi300-dot">
          <title>{`${point.date} · ${t('csi300.ratio-label')} ${format.ratio(point.ratio * 100)}% · ${t('csi300.total-aum')} ${format.compact(point.fundAum)} · ${t('csi300.float-cap')} ${format.compact(point.floatCap)}`}</title>
        </circle>
        {index % labelEvery === 0 || index === points.length - 1
          ? <text x={x(index)} y={CHART_HEIGHT - 8} textAnchor={index === points.length - 1 && index !== 0 ? 'end' : 'middle'} className="dxs-csi300-axis">{quarterLabel(point.date, t)}</text>
          : null}
      </g>)}
    </svg>
  </figure>
}

function FundRows({ funds, totalAum, floatCap, t, format }: {
  funds: Csi300Fund[]
  totalAum: number
  floatCap: number
  t: any
  format: any
}) {
  const shown = funds.slice(0, 10)
  const rest = funds.slice(10)
  const restAum = rest.reduce((sum, fund) => sum + fund.aum, 0)
  return <div className="dxs-mkt-table-wrap dxs-csi300-table">
    <table>
      <caption>{t('csi300.table-caption')}</caption>
      <thead><tr>
        <th scope="col">{t('csi300.fund')}</th>
        <th scope="col">{t('csi300.type')}</th>
        <th scope="col">{t('csi300.aum')}</th>
        <th scope="col">{t('csi300.share-of-funds')}</th>
        <th scope="col">{t('csi300.share-of-cap')}</th>
      </tr></thead>
      <tbody>
        {shown.map(fund => <tr key={fund.code}>
          <td><span>{fund.name}</span><small>{fund.code}</small></td>
          <td>{t(`csi300.type.${fund.type === 'ETF' ? 'etf' : fund.type === 'LOF' ? 'lof' : 'index'}`)}</td>
          <td>{format.compact(fund.aum)}</td>
          <td>{format.ratio(totalAum > 0 ? (fund.aum / totalAum) * 100 : 0)}%</td>
          <td>{format.ratio(floatCap > 0 ? (fund.aum / floatCap) * 100 : 0)}%</td>
        </tr>)}
        {rest.length ? <tr className="is-rest">
          <td><span>{t('csi300.others', { count: rest.length })}</span></td>
          <td>—</td>
          <td>{format.compact(restAum)}</td>
          <td>{format.ratio(totalAum > 0 ? (restAum / totalAum) * 100 : 0)}%</td>
          <td>{format.ratio(floatCap > 0 ? (restAum / floatCap) * 100 : 0)}%</td>
        </tr> : null}
      </tbody>
    </table>
  </div>
}

/**
 * The special CSI 300 fund-share panel, rendered only inside the CSI 300
 * drill-down. It shows how large the funds that track the index are relative to
 * the index's free-float capitalisation, both as the latest reported snapshot
 * and as a quarterly trend.
 */
export function Csi300FundShare({ rpc, t, format }: { rpc: any, t: any, format: any }) {
  const resource = useCsi300FundShare(rpc)
  const data = resource.value
  if (!data) {
    if (resource.status === 'error' || resource.status === 'unconfigured') return <section className="dxs-csi300" role="status">
      <p className="dxs-mkt-error">{t('csi300.error')} <button type="button" onClick={resource.refresh}>{t('market.retry')}</button></p>
    </section>
    return <section className="dxs-csi300" role="status">
      <p className="dxs-mkt-muted">{t('csi300.loading')}</p>
    </section>
  }
  const top = data.funds.slice(0, 6)
  const rest = data.funds.slice(6)
  const restAum = rest.reduce((sum, fund) => sum + fund.aum, 0)
  const segments = [
    ...top.map(fund => ({ key: fund.code, label: fund.name, aum: fund.aum })),
    ...(rest.length ? [{ key: 'rest', label: t('csi300.others', { count: rest.length }), aum: restAum }] : []),
  ]
  const segmentTotal = segments.reduce((sum, segment) => sum + segment.aum, 0)
  return <section className="dxs-csi300" aria-labelledby="dxs-csi300-title">
    <div className="dxs-csi300-head">
      <div>
        <h4 id="dxs-csi300-title">{t('csi300.title')}</h4>
        <p>{t('csi300.subtitle', { date: data.reportDate ?? t('csi300.no-report') })}</p>
      </div>
      <span className="dxs-csi300-source">{t('csi300.source')}</span>
    </div>
    {resource.error ? <p className="dxs-mkt-note">{t('csi300.stale')}</p> : null}
    <div className="dxs-csi300-kpis">
      <div className="dxs-csi300-ratio">
        <strong>{format.ratio(data.ratio * 100)}%</strong>
        <span>{t('csi300.ratio-label')}</span>
      </div>
      <dl>
        <div><dt>{t('csi300.total-aum')}</dt><dd>{format.compact(data.totalAum)}</dd></div>
        <div><dt>{t('csi300.float-cap')}</dt><dd>{format.compact(data.indexFloatCap)}</dd></div>
        <div><dt>{t('csi300.fund-count')}</dt><dd>{format.count(data.fundCount)}</dd></div>
      </dl>
    </div>
    <p className="dxs-csi300-caption">{t('csi300.composition')}</p>
    <div className="dxs-csi300-composition" role="img" aria-label={t('csi300.composition-aria', { count: segments.length })}>
      {segments.map((segment, index) => <span key={segment.key}
        className="dxs-csi300-segment"
        style={{ width: `${segmentTotal > 0 ? (segment.aum / segmentTotal) * 100 : 0}%`, opacity: 1 - index * 0.08 }}
        title={`${segment.label} · ${format.compact(segment.aum)}`} />)}
    </div>
    <ul className="dxs-csi300-legend">
      {segments.map((segment, index) => <li key={segment.key}>
        <i style={{ opacity: 1 - index * 0.08 }} />
        <span>{segment.label}</span>
        <small>{format.ratio(segmentTotal > 0 ? (segment.aum / segmentTotal) * 100 : 0)}%</small>
      </li>)}
    </ul>
    <div className="dxs-csi300-trend">
      <div className="dxs-csi300-trend-head">
        <h5>{t('csi300.trend')}</h5>
        <span>{t('csi300.estimated')}</span>
      </div>
      {data.history.length >= 2
        ? <TrendChart points={data.history} t={t} format={format} />
        : <p className="dxs-mkt-muted">{t('csi300.trend-empty')}</p>}
      {data.historyCoverage < 1
        ? <p className="dxs-mkt-muted">{t('csi300.coverage', { percent: format.ratio(data.historyCoverage * 100) })}</p>
        : null}
      {data.history.length ? <details className="dxs-csi300-data">
        <summary>{t('csi300.trend-table')}</summary>
        <table>
          <thead><tr><th scope="col">{t('csi300.quarter-heading')}</th><th scope="col">{t('csi300.total-aum')}</th><th scope="col">{t('csi300.float-cap')}</th><th scope="col">{t('csi300.ratio-label')}</th></tr></thead>
          <tbody>{data.history.map(point => <tr key={point.date}>
            <td>{point.date}</td>
            <td>{format.compact(point.fundAum)}</td>
            <td>{format.compact(point.floatCap)}</td>
            <td>{format.ratio(point.ratio * 100)}%</td>
          </tr>)}</tbody>
        </table>
      </details> : null}
    </div>
    <FundRows funds={data.funds} totalAum={data.totalAum} floatCap={data.indexFloatCap} t={t} format={format} />
    <p className="dxs-mkt-muted">{t('csi300.notice')}</p>
  </section>
}
