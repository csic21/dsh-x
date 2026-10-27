import React, { useMemo, useState } from 'react'
import type { PredictBaseBucket, PredictGroup, PredictRow, PredictScanResult } from '../../predict.ts'
import { usePredictScan } from './data.ts'

interface PredictViewProps {
  rpc: any
  t: (key: string, params?: Record<string, any>) => string
  format: any
  /** Opens the stock detail page without touching the watchlist. */
  onOpenStock?: (symbol: string, name: string) => void
}

const tone = (value: number) => value > 0 ? 'dxs-up' : value < 0 ? 'dxs-down' : ''
const band = (probability: number) => probability >= 0.5 ? 'high' : probability >= 0.25 ? 'mid' : 'low'
const TABLE_KEYS = { streak: 'streak', sentiment: 'sentiment', position: 'position' } as const

function BucketTable({ title, table, rows, t, format }: {
  title: string
  table: keyof typeof TABLE_KEYS
  rows: PredictBaseBucket[]
  t: PredictViewProps['t']
  format: any
}) {
  if (!rows.length) return null
  return <div className="dxs-predict-table">
    <h4>{title}</h4>
    <table>
      <caption className="dxs-sr-only">{title}</caption>
      <thead><tr>
        <th scope="col">{t('predict.table.group')}</th>
        <th scope="col">{t('predict.table.n')}</th>
        <th scope="col">{t('predict.table.promote')}</th>
        <th scope="col">{t('predict.table.gap')}</th>
        <th scope="col">{t('predict.table.trade')}</th>
        <th scope="col">{t('predict.table.win')}</th>
      </tr></thead>
      <tbody>
        {rows.map(bucket => <tr key={bucket.key}>
          <th scope="row">{t(`predict.bucket.${table}.${bucket.key}`)}</th>
          <td>{format.count(bucket.n)}</td>
          <td>{format.percent(bucket.pLimitUp)}</td>
          <td className={tone(bucket.gapNext)}>{format.change(bucket.gapNext)}</td>
          <td className={tone(bucket.tradeReturn)}>{format.change(bucket.tradeReturn)}</td>
          <td>{format.percent(bucket.winRate)}</td>
        </tr>)}
      </tbody>
    </table>
  </div>
}

function GroupTable({ title, rows, t, format }: { title: string; rows: PredictGroup[]; t: PredictViewProps['t']; format: any }) {
  if (!rows.length) return null
  return <div className="dxs-predict-table">
    <h4>{title}</h4>
    <table>
      <caption className="dxs-sr-only">{title}</caption>
      <thead><tr>
        <th scope="col">{t('predict.table.group')}</th>
        <th scope="col">{t('predict.table.n')}</th>
        <th scope="col">{t('predict.table.promote')}</th>
        <th scope="col">{t('predict.table.trade')}</th>
        <th scope="col">{t('predict.table.win')}</th>
      </tr></thead>
      <tbody>
        {rows.map(group => <tr key={group.key}>
          <th scope="row">{t(`predict.group.${group.key}`)}</th>
          <td>{format.count(group.n)}</td>
          <td>{format.percent(group.pLimitUp)}</td>
          <td className={tone(group.tradeReturn)}>{format.change(group.tradeReturn)}</td>
          <td>{format.percent(group.winRate)}</td>
        </tr>)}
      </tbody>
    </table>
  </div>
}

function ModelDetails({ result, t, format }: { result: PredictScanResult; t: PredictViewProps['t']; format: any }) {
  const { model } = result
  const metrics = model.metrics
  const calibration = metrics.calibration.filter(bin => bin.n > 0)
  return <details className="dxs-predict-method">
    <summary>{t('predict.model.title')}</summary>
    <dl className="dxs-predict-facts">
      <div><dt>{t('predict.model.trained')}</dt><dd>{model.trainedThrough}</dd></div>
      <div><dt>{t('predict.model.sample')}</dt><dd>{t('predict.model.sample-value', {
        stocks: format.count(model.sample.stocks),
        rows: format.count(model.sample.rows),
        from: model.sample.from,
        to: model.sample.to,
      })}</dd></div>
      <div><dt>{t('predict.model.holdout')}</dt><dd>{t('predict.model.holdout-value', {
        days: format.count(metrics.holdout.days),
        rows: format.count(metrics.holdout.rows),
        from: metrics.holdout.from,
        to: metrics.holdout.to,
      })}</dd></div>
      <div><dt>{t('predict.model.auc')}</dt><dd>{format.ratio(metrics.auc)}</dd></div>
      <div><dt>{t('predict.model.brier')}</dt><dd>{format.ratio(metrics.brier)}</dd></div>
      <div><dt>{t('predict.model.base')}</dt><dd>{format.percent(metrics.baseRate)}</dd></div>
      <div><dt>{t('predict.model.ic')}</dt><dd>{format.ratio(metrics.ic)}</dd></div>
    </dl>
    {model.staleDays > 90 ? <p className="dxs-mkt-note">{t('predict.model.stale', { days: format.count(model.staleDays) })}</p> : null}

    {metrics.top.length ? <div className="dxs-predict-table">
      <h4>{t('predict.model.top', { cost: format.ratio(model.costPercent) })}</h4>
      <table>
        <caption className="dxs-sr-only">{t('predict.model.top', { cost: format.ratio(model.costPercent) })}</caption>
        <thead><tr>
          <th scope="col">{t('predict.table.group')}</th>
          <th scope="col">{t('predict.model.trades')}</th>
          <th scope="col">{t('predict.table.win')}</th>
          <th scope="col">{t('predict.model.avg')}</th>
          <th scope="col">{t('predict.model.total')}</th>
          <th scope="col">{t('predict.model.dd')}</th>
        </tr></thead>
        <tbody>
          {metrics.top.map(backtest => <tr key={backtest.k}>
            <th scope="row">{t('predict.model.top-k', { k: format.count(backtest.k) })}</th>
            <td>{format.count(backtest.trades)}</td>
            <td>{format.percent(backtest.winRate)}</td>
            <td className={tone(backtest.avgNet)}>{format.change(backtest.avgNet)}</td>
            <td className={tone(backtest.total)}>{format.change(backtest.total)}</td>
            <td className="dxs-down">{format.change(backtest.maxDrawdown)}</td>
          </tr>)}
        </tbody>
      </table>
    </div> : null}

    <GroupTable title={t('predict.model.byregime')} rows={metrics.byRegime} t={t} format={format} />
    <GroupTable title={t('predict.model.byprob')} rows={metrics.byProbability} t={t} format={format} />

    {calibration.length ? <div className="dxs-predict-table">
      <h4>{t('predict.model.calibration')}</h4>
      <table>
        <caption className="dxs-sr-only">{t('predict.model.calibration')}</caption>
        <thead><tr>
          <th scope="col">{t('predict.table.group')}</th>
          <th scope="col">{t('predict.table.n')}</th>
          <th scope="col">{t('predict.model.predicted')}</th>
          <th scope="col">{t('predict.model.actual')}</th>
        </tr></thead>
        <tbody>
          {calibration.map(bin => <tr key={bin.bin}>
            <th scope="row">{t('predict.model.bin', {
              from: format.count(bin.bin * 10),
              to: format.count((bin.bin + 1) * 10),
            })}</th>
            <td>{format.count(bin.n)}</td>
            <td>{format.percent(bin.predicted)}</td>
            <td>{format.percent(bin.actual)}</td>
          </tr>)}
        </tbody>
      </table>
    </div> : null}
  </details>
}

function Row({ row, rank, t, format, onOpenStock }: { row: PredictRow; rank: number; t: PredictViewProps['t']; format: any; onOpenStock?: PredictViewProps['onOpenStock'] }) {
  const reasons = row.reasons.slice(0, 3)
  const risks = row.risks.slice(0, 2)
  return <li className="dxs-predict-row">
    <div className="dxs-predict-prob" data-band={band(row.pLimitUp)}>
      <small>#{format.count(rank)}</small>
      <strong>{format.percent(row.pLimitUp * 100)}</strong>
      <span>{t('predict.promote')}</span>
      <i aria-hidden="true"><b style={{ width: `${Math.max(2, Math.round(row.pLimitUp * 100))}%` }} /></i>
    </div>
    <div className="dxs-predict-body">
      <div className="dxs-predict-headline">
        {onOpenStock
          ? <button type="button" className="dxs-mkt-link" onClick={() => onOpenStock(row.symbol, row.name)} title={t('market.drill.title', { name: row.name })}>
            <span>{row.name}</span><small>{row.symbol}</small>
          </button>
          : <span className="dxs-predict-name"><strong>{row.name}</strong><small>{row.symbol}</small></span>}
        <span className="dxs-predict-chip">{row.streak > 0 ? t('predict.board', { count: format.count(row.streak) }) : t('predict.near-limit')}</span>
        <span className="dxs-predict-quote">
          <strong>{format.price(row.price)}</strong>
          <em className={tone(row.changePercent)}>{format.change(row.changePercent)}</em>
        </span>
      </div>
      <p className="dxs-predict-meta">
        <span>{t('predict.base', { value: format.percent(row.basePLimitUp) })}</span>
        <span className={row.edge >= 0 ? 'dxs-up' : 'dxs-down'}>{t('predict.edge', { value: format.signed(row.edge) })}</span>
        <span>{t('predict.expect', {
          value: format.change(row.baseTradeReturn),
          win: format.percent(row.baseWinRate),
          n: format.count(row.baseN),
        })}</span>
      </p>
      <div className="dxs-predict-tags">
        {reasons.map(id => <span key={id} className="dxs-predict-tag">{t(`predict.feature.${id}`)}</span>)}
        {risks.map(id => <span key={id} className="dxs-predict-tag is-risk">{t(`predict.risk.${id}`)}</span>)}
      </div>
    </div>
  </li>
}

/**
 * The relay screen. It reports a probability that the next session closes
 * limit-up, the historical rate of the same streak bucket, and that bucket's
 * measured payoff. It does not print a target price or an "expected return":
 * the out-of-sample rank correlation for returns came out negative, so a point
 * estimate would be false precision. The verdict line and the backtest block
 * exist to keep that visible.
 */
export function PredictView({ rpc, t, format, onOpenStock }: PredictViewProps) {
  const scan = usePredictScan(rpc)
  const [query, setQuery] = useState('')
  const [buyableOnly, setBuyableOnly] = useState(false)
  const result = scan.value
  const rows = useMemo(() => {
    if (!result) return []
    const keyword = query.trim().toLowerCase()
    return result.rows.filter(row => {
      if (buyableOnly && row.oneWord) return false
      if (!keyword) return true
      return row.name.toLowerCase().includes(keyword)
        || row.symbol.toLowerCase().includes(keyword)
        || row.symbol.slice(3).includes(keyword)
    })
  }, [result, query, buyableOnly])

  const worst = result?.model.metrics.top.find(entry => entry.k === 5) ?? result?.model.metrics.top[0]
  const base = result?.regime.base ?? null

  return <section className="dxs-mkt dxs-predict" aria-labelledby="dxs-predict-title">
    <header className="dxs-mkt-head">
      <div>
        <h2 id="dxs-predict-title">{t('predict.title')}</h2>
        <p>{t('predict.subtitle')}</p>
      </div>
      <div className="dxs-mkt-head-actions">
        {scan.running ? <span className="dxs-mkt-updated">{t('predict.elapsed', { seconds: format.count(scan.elapsed) })}</span> : null}
        <button type="button" className="dxs-hot-run" disabled={scan.running} onClick={() => { void scan.run() }}>
          {scan.running ? t('predict.running') : result ? t('predict.rerun') : t('predict.run')}
        </button>
      </div>
    </header>

    {scan.status === 'idle' ? <p className="dxs-mkt-muted">{t('predict.idle')}</p> : null}
    {scan.status === 'loading' ? <p role="status" className="dxs-hot-loading">
      <span className="dxs-mkt-dot is-live" />
      {t('predict.loading')}
      {scan.elapsed > 0 ? <span className="dxs-mkt-muted">{t('predict.elapsed', { seconds: format.count(scan.elapsed) })}</span> : null}
    </p> : null}
    {scan.status === 'error' ? <p role="alert" className="dxs-mkt-error">{t('predict.error')} <button type="button" onClick={() => { void scan.run() }}>{t('market.retry')}</button></p> : null}
    {scan.status === 'unconfigured' ? <p className="dxs-mkt-muted">{t('predict.unconfigured')}</p> : null}

    {result ? <>
      <div className="dxs-predict-regime" data-level={result.regime.level}>
        <div className="dxs-predict-level">
          <span>{t('predict.regime.title')}</span>
          <strong>{t(`predict.level.${result.regime.level}`)}</strong>
          <small>{t('predict.regime.rank', { value: format.count(result.regime.rank) })}</small>
        </div>
        <dl>
          <div><dt>{t('predict.regime.hot')}</dt><dd>{format.percent(result.regime.hotShare)}</dd></div>
          <div><dt>{t('predict.regime.up')}</dt><dd>{format.percent(result.regime.upShare)}</dd></div>
          <div><dt>{t('predict.regime.median')}</dt><dd className={tone(result.regime.medianChange)}>{format.change(result.regime.medianChange)}</dd></div>
          {base ? <div className="is-wide"><dt>{t('predict.regime.base-label')}</dt><dd>{t('predict.regime.base', {
            promote: format.percent(base.pLimitUp),
            trade: format.change(base.tradeReturn),
            win: format.percent(base.winRate),
            n: format.count(base.n),
          })}</dd></div> : null}
        </dl>
      </div>

      <p className="dxs-predict-verdict" data-tone={worst && worst.avgNet < 0 ? 'warn' : 'info'}>
        {worst
          ? t('predict.verdict', {
            avg: format.change(worst.avgNet),
            trades: format.count(worst.trades),
            auc: format.ratio(result.model.metrics.auc),
          })
          : t('predict.verdict-nobt', { auc: format.ratio(result.model.metrics.auc) })}
      </p>

      <div className="dxs-hot-summary">
        <span>{t(result.barFinal ? 'predict.asof.final' : 'predict.asof.live', { date: result.sessionDate })}</span>
        <span>{t('predict.summary', {
          rows: format.count(result.rows.length),
          candidates: format.count(result.universe.candidates),
        })}</span>
        <span>{t('predict.coverage', {
          covered: format.count(result.universe.covered),
          expected: format.count(result.universe.expected),
        })}</span>
        <span>{t('predict.duration', { ms: result.durationMs })}</span>
        <span>{t('predict.source', { source: result.source })}</span>
      </div>
      {result.universe.partial ? <p className="dxs-mkt-note">{t('predict.partial', { failed: format.count(result.universe.failed) })}</p> : null}
      {result.model.staleDays > 90 ? <p className="dxs-mkt-note">{t('predict.model.stale', { days: format.count(result.model.staleDays) })}</p> : null}

      <div className="dxs-hot-controls">
        <label className="dxs-hot-filter">
          <span className="dxs-sr-only">{t('predict.filter-aria')}</span>
          <input type="search" value={query} placeholder={t('predict.filter-placeholder')} onChange={event => setQuery(event.target.value)} />
        </label>
        <label className="dxs-predict-toggle">
          <input type="checkbox" checked={buyableOnly} onChange={event => setBuyableOnly(event.target.checked)} />
          {t('predict.filter.buyable')}
        </label>
        <span className="dxs-mkt-muted">{t('predict.sort-hint')}</span>
      </div>

      {rows.length ? <ol className="dxs-predict-list">
        {rows.map((row, index) => <Row key={row.symbol} row={row} rank={index + 1} t={t} format={format} onOpenStock={onOpenStock} />)}
      </ol> : <p className="dxs-mkt-muted">{query ? t('predict.empty-filter') : t('predict.empty')}</p>}

      <h3 className="dxs-predict-section">{t('predict.patterns')}</h3>
      <p className="dxs-mkt-muted">{t('predict.patterns-hint')}</p>
      <div className="dxs-predict-tables">
        <BucketTable title={t('predict.table.streak')} table="streak" rows={result.baseRates.streak} t={t} format={format} />
        <BucketTable title={t('predict.table.sentiment')} table="sentiment" rows={result.baseRates.sentiment} t={t} format={format} />
        <BucketTable title={t('predict.table.position')} table="position" rows={result.baseRates.position} t={t} format={format} />
      </div>

      <ModelDetails result={result} t={t} format={format} />

      <details className="dxs-predict-method">
        <summary>{t('predict.limits.title')}</summary>
        <p>{t('predict.limits.population')}</p>
        <p>{t('predict.limits.trade')}</p>
        <p>{t('predict.limits.sample')}</p>
        <p>{t('predict.limits.source')}</p>
        <p>{t('predict.not-advice')}</p>
      </details>
    </> : null}
  </section>
}
