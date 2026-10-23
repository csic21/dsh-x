// Local quantitative panel. It renders only metrics computed from the loaded
// daily bars; every number is descriptive or a declared cost-aware replay, and
// nothing is fetched, persisted, forecast or recommended.
import React, { useMemo, useState } from 'react'
import type { HistoryDataset } from '../../history-dataset.ts'
import type { QuantRuleKey } from '../../analytics.ts'
import { computeQuantStats, correlationWith, runBacktest } from '../../analytics.ts'

const RULES: QuantRuleKey[] = ['ma5-20', 'ma10-60', 'macd', 'kdj']
const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1)

// The page always passes the full formatter. Tests and other hosts may pass a
// partial one, so every access falls back to a plain string instead of throwing.
const count = (format: any, value: number) => typeof format?.count === 'function' ? format.count(value) : String(value)
const price = (format: any, value: number | null) => value === null || !Number.isFinite(value) ? '—' : typeof format?.price === 'function' ? format.price(value) : String(value)
const pct = (format: any, ratio: number | null) => ratio === null || !Number.isFinite(ratio) ? '—' : typeof format?.change === 'function' ? format.change(ratio * 100) : `${(ratio * 100).toFixed(2)}%`
const plainPct = (format: any, ratio: number | null) => ratio === null || !Number.isFinite(ratio) ? '—' : typeof format?.percent === 'function' ? format.percent(ratio * 100) : `${(ratio * 100).toFixed(2)}%`
const decimal = (format: any, value: number | null) => price(format, value)
const signed = (format: any, value: number | null) => value === null || !Number.isFinite(value) ? '—' : typeof format?.signed === 'function' ? format.signed(value) : String(value)
const toneOf = (value: number | null) => value === null || !Number.isFinite(value) ? '' : value > 0 ? 'dxs-up' : value < 0 ? 'dxs-down' : ''

function Stat({ label, value, note, tone }: any) {
  return <div className="dxs-quant-stat">
    <div className="dxs-quant-stat-label">{label}</div>
    <div className={`dxs-quant-stat-value ${tone ?? ''}`}>{value}</div>
    {note ? <div className="dxs-quant-stat-note">{note}</div> : null}
  </div>
}

function EquityChart({ points, t, format }: any) {
  if (!Array.isArray(points) || points.length < 2) return <p className="dxs-quant-muted">{t('quant.empty')}</p>
  const width = 720, height = 200, padding = 10
  const values = points.flatMap((point: any) => [point.strategy, point.buyHold]).filter((value: any) => Number.isFinite(value))
  const min = Math.min(...values), max = Math.max(...values)
  const span = max - min || 1
  const x = (index: number) => padding + (index / (points.length - 1)) * (width - 2 * padding)
  const y = (value: number) => height - padding - ((value - min) / span) * (height - 2 * padding)
  const path = (key: 'strategy' | 'buyHold') => points
    .map((point: any, index: number) => `${index ? 'L' : 'M'}${x(index).toFixed(2)} ${y(point[key]).toFixed(2)}`)
    .join(' ')
  const last = points.at(-1)
  return <div className="dxs-quant-chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${t('quant.equity')} · ${t('quant.equity-strategy')} ${pct(format, last.strategy - 1)} · ${t('quant.equity-buyhold')} ${pct(format, last.buyHold - 1)}`}>
      {min < 1 && max > 1 ? <line className="is-baseline" x1={padding} x2={width - padding} y1={y(1)} y2={y(1)} /> : null}
      <text className="is-axis" x={padding + 2} y={padding + 10}>{format.price(max)}</text>
      <text className="is-axis" x={padding + 2} y={height - padding - 2}>{format.price(min)}</text>
      <path className="is-buyhold" d={path('buyHold')} />
      <path className="is-strategy" d={path('strategy')} />
    </svg>
    <div className="dxs-quant-legend">
      <span><i className="is-strategy" />{t('quant.equity-strategy')}</span>
      <span><i className="is-buyhold" />{t('quant.equity-buyhold')}</span>
    </div>
  </div>
}

export function QuantPanel({ dataset, benchmark, t, format }: {
  dataset: HistoryDataset
  benchmark?: HistoryDataset | null
  t: (key: string, params?: Record<string, any>) => string
  format: any
}) {
  const stats = useMemo(() => computeQuantStats(dataset.bars), [dataset])
  const correlation = useMemo(
    () => benchmark ? correlationWith(dataset.bars, benchmark.bars) : null,
    [dataset, benchmark],
  )
  const [rule, setRule] = useState<QuantRuleKey>('ma5-20')
  const [commission, setCommission] = useState(5)
  const [slippage, setSlippage] = useState(5)
  const backtest = useMemo(
    () => runBacktest(dataset.bars, { rule, commissionBps: commission, slippageBps: slippage }),
    [dataset, rule, commission, slippage],
  )
  const years = useMemo(() => {
    const unique = [...new Set(stats.monthly.map(item => item.year))].sort((left, right) => right - left)
    return unique
  }, [stats.monthly])
  const byMonth = useMemo(() => new Map(stats.monthly.map(item => [`${item.year}-${item.month}`, item])), [stats.monthly])
  const trades = useMemo(() => [...backtest.trades].reverse().slice(0, 100), [backtest.trades])
  const lastClose = dataset.bars.at(-1)?.close ?? null
  const cost = (raw: string) => {
    const value = Number(raw)
    return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0
  }

  if (stats.samples < 2) {
    return <section className="dxs-quant" aria-label={t('quant.title')}>
      <header className="dxs-quant-head">
        <div><h3>{t('quant.title')}</h3><p>{t('quant.subtitle')}</p></div>
      </header>
      <p className="dxs-quant-muted">{t('quant.empty')}</p>
    </section>
  }

  return <section className="dxs-quant" aria-label={t('quant.title')}>
    <header className="dxs-quant-head">
      <div>
        <h3>{t('quant.title')}</h3>
        <p>{t('quant.subtitle')}</p>
        <p className="dxs-quant-muted">{t('quant.sample', { count: count(format, stats.samples), from: stats.from, to: stats.to })}</p>
        {stats.samples < 120 ? <p className="dxs-quant-muted">{t('quant.insufficient')}</p> : null}
      </div>
      <span className="dxs-quant-badge">{t('quant.stats')}</span>
    </header>

    <div className="dxs-quant-stats">
      <Stat label={t('quant.total-return')} value={pct(format, stats.totalReturn)} tone={toneOf(stats.totalReturn)} />
      <Stat label={t('quant.cagr')} value={pct(format, stats.cagr)} note={t('quant.cagr-note')} />
      <Stat label={t('quant.volatility')} value={plainPct(format, stats.annualVolatility)} />
      <Stat label={t('quant.drawdown')} value={pct(format, stats.maxDrawdown)}
        note={stats.drawdownPeakDate && stats.drawdownTroughDate ? `${stats.drawdownPeakDate} → ${stats.drawdownTroughDate}` : undefined} />
      <Stat label={t('quant.sharpe')} value={signed(format, stats.sharpe)} note={t('quant.sharpe-note')} />
      <Stat label={t('quant.winrate')} value={plainPct(format, stats.dailyWinRate)} />
      <Stat label={t('quant.best-day')} value={pct(format, stats.bestDay)} tone={toneOf(stats.bestDay)} />
      <Stat label={t('quant.worst-day')} value={pct(format, stats.worstDay)} tone={toneOf(stats.worstDay)} />
      <Stat label={t('quant.atr')} value={decimal(format, stats.atr14)}
        note={stats.atr14 !== null && lastClose ? t('quant.atr-note', { value: plainPct(format, stats.atr14 / lastClose) }) : undefined} />
      <Stat label={t('quant.rsi')} value={decimal(format, stats.rsi14)} />
      <Stat label={t('quant.boll')} value={decimal(format, stats.bollingerPercentB)} />
      <Stat label={t('quant.ma20')} value={pct(format, stats.priceVsMa20)} note={stats.ma20 !== null ? t('quant.ma-note', { value: price(format, stats.ma20) }) : undefined} />
      <Stat label={t('quant.ma60')} value={pct(format, stats.priceVsMa60)} note={stats.ma60 !== null ? t('quant.ma-note', { value: price(format, stats.ma60) }) : undefined} />
      <Stat label={t('quant.momentum')} value={`${pct(format, stats.momentum20)} / ${pct(format, stats.momentum60)} / ${pct(format, stats.momentum120)}`} />
      <Stat label={t('quant.range52')} value={stats.high52w !== null && stats.low52w !== null ? `${price(format, stats.low52w)} – ${price(format, stats.high52w)}` : '—'}
        note={stats.drawdownFromHigh !== null ? t('quant.range52-note', { value: pct(format, stats.drawdownFromHigh) }) : undefined} />
      <Stat label={benchmark ? t('quant.correlation', { name: benchmark.name || benchmark.symbol }) : t('quant.correlation-none')}
        value={correlation ? signed(format, correlation.value) : '—'}
        note={correlation ? t('quant.correlation-note', { count: count(format, correlation.samples) }) : t('quant.correlation-none')} />
    </div>

    <div className="dxs-quant-card">
      <header className="dxs-quant-card-head">
        <div><h4>{t('quant.monthly')}</h4><p>{t('quant.monthly-note')}</p></div>
      </header>
      <div className="dxs-quant-table-wrap">
        <table className="dxs-quant-monthly">
          <caption>{t('quant.monthly')}</caption>
          <thead><tr><th scope="col">{t('quant.monthly-year')}</th>{MONTHS.map(month => <th key={month} scope="col">{month}</th>)}</tr></thead>
          <tbody>{years.map(year => <tr key={year}>
            <th scope="row">{year}</th>
            {MONTHS.map(month => {
              const item = byMonth.get(`${year}-${month}`)
              if (!item) return <td key={month} className="is-empty">—</td>
              return <td key={month}
                className={item.returnRatio > 0 ? 'dxs-up' : item.returnRatio < 0 ? 'dxs-down' : ''}
                title={item.partial ? t('quant.monthly-partial') : undefined}>
                {pct(format, item.returnRatio)}{item.partial ? <span className="dxs-quant-partial" aria-label={t('quant.monthly-partial')}>*</span> : null}
              </td>
            })}
          </tr>)}</tbody>
        </table>
      </div>
    </div>

    <div className="dxs-quant-card">
      <header className="dxs-quant-card-head">
        <div><h4>{t('quant.backtest')}</h4><p>{t('quant.backtest-note')}</p></div>
      </header>
      <div className="dxs-quant-controls">
        <label className="dxs-quant-field">{t('quant.rule')}
          <select value={rule} onChange={event => setRule(event.target.value as QuantRuleKey)}>
            {RULES.map(value => <option key={value} value={value}>{t(`quant.rule.${value}`)}</option>)}
          </select>
        </label>
        <label className="dxs-quant-field">{t('quant.commission')}
          <input type="number" min={0} max={100} step={1} value={commission} onChange={event => setCommission(cost(event.target.value))} />
        </label>
        <label className="dxs-quant-field">{t('quant.slippage')}
          <input type="number" min={0} max={100} step={1} value={slippage} onChange={event => setSlippage(cost(event.target.value))} />
        </label>
      </div>
      <div className="dxs-quant-metrics">
        <Stat label={t('quant.strategy-return')} value={pct(format, backtest.totalReturn)} tone={toneOf(backtest.totalReturn)} />
        <Stat label={t('quant.buyhold-return')} value={pct(format, backtest.buyHoldReturn)} />
        <Stat label={t('quant.drawdown')} value={pct(format, backtest.maxDrawdown)} />
        <Stat label={t('quant.sharpe')} value={signed(format, backtest.sharpe)} note={t('quant.sharpe-note')} />
        <Stat label={t('quant.trade-count')} value={count(format, backtest.tradeCount)} />
        <Stat label={t('quant.trade-winrate')} value={plainPct(format, backtest.winRate)} />
        <Stat label={t('quant.profit-factor')} value={decimal(format, backtest.profitFactor)} note={backtest.profitFactor === null && backtest.tradeCount > 0 ? t('quant.profit-factor-note') : undefined} />
        <Stat label={t('quant.exposure')} value={plainPct(format, backtest.exposure)} />
        <Stat label={t('quant.average-trade')} value={pct(format, backtest.averageTrade)} />
      </div>
      <h5 className="dxs-quant-subtitle">{t('quant.equity')}</h5>
      <EquityChart points={backtest.points} t={t} format={format} />
      <details className="dxs-quant-details">
        <summary>{t('quant.trades')} · {count(format, backtest.tradeCount)}</summary>
        {trades.length ? <div className="dxs-quant-table-wrap dxs-quant-trades">
          <table>
            <caption>{t('quant.trades')}</caption>
            <thead><tr>
              <th scope="col">{t('quant.trade-entry')}</th>
              <th scope="col">{t('quant.trade-exit')}</th>
              <th scope="col">{t('quant.trade-return')}</th>
              <th scope="col">{t('quant.trade-bars')}</th>
            </tr></thead>
            <tbody>{trades.map(trade => <tr key={`${trade.entryDate}:${trade.exitDate}`}>
              <td>{trade.entryDate}<small>{price(format, trade.entryPrice)}</small></td>
              <td>{trade.exitDate}<small>{price(format, trade.exitPrice)}</small>{trade.open ? <em className="dxs-quant-open">{t('quant.trade-open')}</em> : null}</td>
              <td className={trade.returnRatio > 0 ? 'dxs-up' : trade.returnRatio < 0 ? 'dxs-down' : ''}>{pct(format, trade.returnRatio)}</td>
              <td>{count(format, trade.bars)}</td>
            </tr>)}</tbody>
          </table>
        </div> : <p className="dxs-quant-muted">{t('quant.no-trades')}</p>}
      </details>
      <details className="dxs-quant-details">
        <summary>{t('quant.assumptions')}</summary>
        <ul>
          <li>{t('quant.assumption-1')}</li>
          <li>{t('quant.assumption-2')}</li>
          <li>{t('quant.assumption-3')}</li>
          <li>{t('quant.assumption-4')}</li>
        </ul>
      </details>
      <details className="dxs-quant-details">
        <summary>{t('quant.formula')}</summary>
        <ul>
          <li>{t('quant.formula-1')}</li>
          <li>{t('quant.formula-2')}</li>
          <li>{t('quant.formula-3')}</li>
          <li>{t('quant.formula-4')}</li>
        </ul>
      </details>
      <p className="dxs-quant-muted">{t('quant.not-advice')}</p>
    </div>
  </section>
}
