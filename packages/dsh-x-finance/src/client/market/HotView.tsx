import React, { useMemo, useState } from 'react'
import type { HotHit } from '../../hot.ts'
import { HOT_HISTORY_DEPTH, hotStrategy } from '../../hot.ts'
import type { MarketSector } from '../../market.ts'
import { useHotScan, useMarketOverview } from './data.ts'

interface HotViewProps {
  rpc: any
  t: (key: string, params?: Record<string, any>) => string
  format: any
  /** Opens the stock detail page without editing the watchlist. */
  onOpenStock?: (symbol: string, name: string) => void
  /** Adds a batch without changing the selected stock; returns how many were added. */
  onAddMany?: (entries: { symbol: string; name: string }[]) => number
}

const tone = (value: number) => value > 0 ? 'dxs-up' : value < 0 ? 'dxs-down' : ''
const scoreLevel = (score: number) => score >= 90 ? 'hot' : score >= 75 ? 'warm' : 'plain'
const CATEGORY_LABEL: Record<string, string> = {
  heat: 'hot.category.heat',
  volume: 'hot.category.volume',
  trend: 'hot.category.trend',
  capital: 'hot.category.capital',
  structure: 'hot.category.structure',
}

function ScoreBadge({ score, t, format }: any) {
  return <div className="dxs-hot-score" data-level={scoreLevel(score)}>
    <span>{t('hot.score')}</span>
    <strong>{format.ratio(score)}</strong>
  </div>
}

function Tags({ hit, t }: { hit: HotHit; t: (key: string) => string }) {
  const shown = hit.hits.slice(0, 6)
  const hidden = hit.hits.length - shown.length
  return <div className="dxs-hot-tags">
    {shown.map(id => {
      const category = hotStrategy(id)?.category ?? 'structure'
      return <span key={id} className="dxs-hot-tag" data-category={category} title={t(CATEGORY_LABEL[category] ?? 'hot.category.structure')}>{t(`hot.strategy.${id}`)}</span>
    })}
    {hidden > 0 ? <span className="dxs-hot-tag is-more" title={hit.hits.slice(6).map(id => t(`hot.strategy.${id}`)).join(' · ')}>+{hidden}</span> : null}
  </div>
}

/**
 * The hot screen: one explicit run scores the whole market against the strategy
 * registry, then ranks the hits. The panel is read-only — it opens details and
 * adds watchlist entries on purpose, and never writes anything on its own.
 */
export function HotView({ rpc, t, format, onOpenStock, onAddMany }: HotViewProps) {
  const scan = useHotScan(rpc)
  const overview = useMarketOverview(rpc, { pollMs: 180_000 })
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')

  const result = scan.value
  const rows = useMemo(() => {
    if (!result) return []
    const keyword = query.trim().toLowerCase()
    if (!keyword) return result.hits
    return result.hits.filter(hit =>
      hit.name.toLowerCase().includes(keyword)
      || hit.symbol.toLowerCase().includes(keyword)
      || hit.symbol.slice(3).includes(keyword)
      || hit.hits.some(id => t(`hot.strategy.${id}`).toLowerCase().includes(keyword)))
  }, [result, query, t])

  // Only level-2 industries are offered: they are the closest honest analogue
  // to a "theme" the free source actually publishes. Concept boards are not in
  // this feed, so the UI does not pretend they are.
  const industries = useMemo(() => {
    const sectors: MarketSector[] = overview.value?.sectors ?? []
    return sectors
      .filter(sector => sector.level === 2 && Number.isFinite(sector.changePercent))
      .sort((left, right) => right.changePercent - left.changePercent)
      .slice(0, 6)
  }, [overview.value])

  const run = (board?: string) => {
    setNotice('')
    void scan.run(board)
  }

  const addOne = (row: HotHit) => {
    if (!onAddMany) return
    const added = onAddMany([{ symbol: row.symbol, name: row.name }])
    setNotice(added > 0
      ? t('hot.add-one', { name: row.name })
      : t('hot.add-failed', { name: row.name }))
  }

  const addAll = () => {
    if (!onAddMany || !rows.length) return
    const added = onAddMany(rows.map(row => ({ symbol: row.symbol, name: row.name })))
    setNotice(t('hot.add-result', { added: format.count(added), total: format.count(rows.length) }))
  }

  const historyChecked = result?.universe.historyChecked ?? 0
  const activeBoard = scan.board ?? (result?.board?.code ?? null)

  return <section className="dxs-mkt dxs-hot" aria-labelledby="dxs-hot-title">
    <header className="dxs-mkt-head">
      <div>
        <h2 id="dxs-hot-title">{t('hot.title')}</h2>
        <p>{t('hot.subtitle')}</p>
      </div>
      <div className="dxs-mkt-head-actions">
        {scan.running ? <span className="dxs-mkt-updated">{t('hot.elapsed', { seconds: format.count(scan.elapsed) })}</span> : null}
        <button type="button" className="dxs-hot-run" disabled={scan.running} onClick={() => run()}>
          {scan.running ? t('hot.running') : result ? t('hot.rerun') : t('hot.run')}
        </button>
      </div>
    </header>

    <div className="dxs-hot-industries" role="group" aria-label={t('hot.industry-aria')}>
      <button type="button" aria-pressed={activeBoard === null} onClick={() => run()}>{t('hot.universe-all')}</button>
      {industries.map(sector => <button
        key={sector.code}
        type="button"
        aria-pressed={activeBoard === sector.code}
        onClick={() => run(sector.code)}
        title={t('hot.industry-title', { name: sector.name, change: format.change(sector.changePercent) })}
      >
        {sector.name}<small className={tone(sector.changePercent)}>{format.change(sector.changePercent)}</small>
      </button>)}
    </div>
    <p className="dxs-mkt-muted dxs-hot-hint">{t('hot.industry-hint')}</p>

    {scan.status === 'idle' ? <p className="dxs-mkt-muted">{t('hot.idle')}</p> : null}
    {scan.status === 'loading' ? <p role="status" className="dxs-hot-loading">
      <span className="dxs-mkt-dot is-live" />
      {t('hot.loading')}
      {scan.elapsed > 0 ? <span className="dxs-mkt-muted">{t('hot.loading-elapsed', { seconds: format.count(scan.elapsed) })}</span> : null}
    </p> : null}
    {scan.status === 'error' ? <p role="alert" className="dxs-mkt-error">{t('hot.error')} <button type="button" onClick={() => run(scan.board ?? undefined)}>{t('market.retry')}</button></p> : null}
    {scan.status === 'unconfigured' ? <p className="dxs-mkt-muted">{t('hot.unconfigured')}</p> : null}

    {result ? <>
      <div className="dxs-hot-summary">
        <span>{result.board ? <>{t('hot.scope', { name: result.board.name })}<b> · </b></> : null}{t('hot.summary', {
          hits: format.count(result.hitCount),
          strategies: format.count(result.strategyCount),
          universe: format.count(result.universe.scanned),
        })}</span>
        <span>{t('hot.history', { checked: format.count(historyChecked), depth: format.count(Math.min(HOT_HISTORY_DEPTH, result.universe.scanned)) })}</span>
        <span>{t('hot.coverage', { covered: format.count(result.universe.covered), expected: format.count(result.universe.expected) })}</span>
        <span>{t('hot.duration', { ms: result.durationMs })}</span>
        <span>{t('hot.source', { source: result.source })}</span>
      </div>
      {result.hitCount > result.hits.length ? <p className="dxs-mkt-note">{t('hot.truncated', { shown: format.count(result.hits.length), total: format.count(result.hitCount) })}</p> : null}
      {result.universe.partial ? <p className="dxs-mkt-note">{t('hot.partial', { failed: format.count(result.universe.historyFailed) })}</p> : null}
      {!result.strategyCount || result.strategyCount < 1 ? <p className="dxs-mkt-note">{t('hot.empty-strategies')}</p> : null}

      <div className="dxs-hot-controls">
        <label className="dxs-hot-filter">
          <span className="dxs-sr-only">{t('hot.filter-aria')}</span>
          <input
            type="search"
            value={query}
            placeholder={t('hot.filter-placeholder')}
            onChange={event => setQuery(event.target.value)}
          />
        </label>
        <button type="button" className="dxs-hot-add-all" onClick={addAll} disabled={!rows.length}>
          {t('hot.add-all', { count: format.count(rows.length) })}
        </button>
        {notice ? <p role="status" className="dxs-mkt-muted">{notice}</p> : null}
      </div>

      {rows.length ? <ol className="dxs-hot-list">
        {rows.map(row => <li key={row.symbol} className="dxs-hot-row">
          <ScoreBadge score={row.score} t={t} format={format} />
          <div className="dxs-hot-body">
            <div className="dxs-hot-headline">
              {onOpenStock
                ? <button type="button" className="dxs-mkt-link" onClick={() => onOpenStock(row.symbol, row.name)} title={t('market.drill.title', { name: row.name })}>
                  <span>{row.name}</span><small>{row.symbol}</small>
                </button>
                : <span className="dxs-hot-name"><strong>{row.name}</strong><small>{row.symbol}</small></span>}
              <span className="dxs-hot-quote">
                <strong>{format.price(row.price)}</strong>
                <em className={tone(row.changePercent)}>{format.change(row.changePercent)}</em>
              </span>
            </div>
            <Tags hit={row} t={t} />
            <p className="dxs-hot-meta">
              <span>{t('hot.amount')} {format.compact(row.amount)}</span>
              <span>{t('hot.turnover')} {row.turnoverRate == null ? '—' : `${format.ratio(row.turnoverRate)}%`}</span>
              <span>{t('hot.volume-ratio')} {format.ratio(row.volumeRatio)}</span>
            </p>
          </div>
          <button
            type="button"
            className="dxs-hot-add"
            aria-label={t('hot.add-aria', { name: row.name })}
            title={t('hot.add')}
            onClick={() => addOne(row)}
          >+</button>
        </li>)}
      </ol> : <p className="dxs-mkt-muted">{query ? t('hot.empty-filter') : t('hot.empty')}</p>}

      <details className="dxs-hot-method">
        <summary>{t('hot.method')}</summary>
        <p>{t('hot.method-body')}</p>
        <p>{t('hot.method-score')}</p>
        <p>{t('hot.method-limits')}</p>
        <p>{t('hot.not-advice')}</p>
      </details>
    </> : null}
  </section>
}
