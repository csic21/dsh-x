// Browser view for the global index board. Every number here comes from the
// Host's validated projection; this file only groups, formats and lays out.
// A region or index the source did not answer for is omitted or shown empty,
// never filled from another market.
import React, { useMemo } from 'react'
import type { GlobalMarketOverview, GlobalQuote, GlobalRegionKey } from '../../global.ts'
import { useGlobalMarket, useMarketPreference } from './data.ts'
import { MarketErrorCard, MarketUnconfigured, SourceSwitch } from './gate.tsx'

const REGIONS: GlobalRegionKey[] = ['americas', 'asiaPacific', 'europe']

const toneOf = (value: number | null | undefined) =>
  typeof value === 'number' && value > 0 ? 'dxs-up' : typeof value === 'number' && value < 0 ? 'dxs-down' : ''

interface RegionSummary {
  count: number
  up: number
  down: number
  average: number | null
}

function summarize(quotes: GlobalQuote[], region: GlobalRegionKey): RegionSummary {
  const rows = quotes.filter(quote => quote.region === region)
  const changes = rows.map(quote => quote.changePercent).filter((value): value is number => typeof value === 'number')
  return {
    count: rows.length,
    up: changes.filter(value => value > 0).length,
    down: changes.filter(value => value < 0).length,
    average: changes.length ? changes.reduce((sum, value) => sum + value, 0) / changes.length : null,
  }
}

function displayName(quote: GlobalQuote, locale: string | undefined): string {
  return String(locale ?? '').toLowerCase().startsWith('zh') ? quote.name : quote.nameEn
}

function Kpi({ label, value, note, tone }: any) {
  return <div className="dxs-mkt-kpi">
    <div className="dxs-mkt-kpi-label">{label}</div>
    <div className={`dxs-mkt-kpi-value ${tone ?? ''}`}>{value}</div>
    {note ? <div className="dxs-mkt-kpi-note">{note}</div> : null}
  </div>
}

function GlobalCard({ quote, locale, t, format }: any) {
  const name = displayName(quote, locale)
  const tone = toneOf(quote.changePercent)
  const hasRange = quote.high !== null && quote.low !== null && quote.high > quote.low
  const marker = hasRange
    ? Math.max(0, Math.min(100, ((quote.price - quote.low) / (quote.high - quote.low)) * 100))
    : null
  return <article className="dxs-mkt-index dxs-glb-card">
    <header>
      <div className="dxs-glb-identity"><h4 title={name}>{name}</h4><span>{quote.code}</span></div>
      <span className={`dxs-mkt-change ${tone}`}>{format.change(quote.changePercent)}</span>
    </header>
    <div className={`dxs-mkt-index-price ${tone}`}>{format.price(quote.price)}</div>
    <div className="dxs-mkt-index-sub dxs-glb-sub">
      <span className={tone}>{format.signed(quote.change)}</span>
      <span className="dxs-glb-time">{t('global.quote-time', { time: format.zoneTime(quote.quotedAt, quote.timeZone, t) })}</span>
    </div>
    {marker !== null ? <div className="dxs-mkt-range" role="img" aria-label={`${t('global.range')} · ${t('global.low', { value: format.price(quote.low) })} · ${t('global.high', { value: format.price(quote.high) })}`}>
      <div className="dxs-mkt-range-track"><span style={{ left: `${marker}%` }} /></div>
      <div className="dxs-mkt-range-labels">
        <span>{t('global.low', { value: format.price(quote.low) })}</span>
        <span>{t('global.high', { value: format.price(quote.high) })}</span>
      </div>
    </div> : null}
    <dl className="dxs-mkt-ohlc">
      <div><dt>{t('global.open')}</dt><dd>{format.price(quote.open)}</dd></div>
      <div><dt>{t('global.previous')}</dt><dd>{format.price(quote.previousClose)}</dd></div>
    </dl>
  </article>
}

function RegionSection({ region, quotes, locale, t, format }: any) {
  const summary = summarize(quotes, region)
  return <section className="dxs-mkt-card dxs-glb-section">
    <header className="dxs-mkt-card-head">
      <div>
        <h3>{t(`global.region.${region}`)}</h3>
        <p>{t('global.section.count', { count: format.count(summary.count) })} · {t('global.section.average', { value: format.change(summary.average) })}</p>
      </div>
      <div className="dxs-glb-updown">
        <span className="dxs-up">{t('market.breadth.up')} {format.count(summary.up)}</span>
        <span className="dxs-down">{t('market.breadth.down')} {format.count(summary.down)}</span>
      </div>
    </header>
    {quotes.length
      ? <div className="dxs-mkt-index-grid dxs-glb-grid">
        {quotes.map((quote: GlobalQuote) => <GlobalCard key={quote.code} quote={quote} locale={locale} t={t} format={format} />)}
      </div>
      : <p className="dxs-mkt-muted">{t('global.empty')}</p>}
  </section>
}

function AllIndicesTable({ quotes, locale, t, format }: any) {
  if (!quotes.length) return null
  return <details className="dxs-mkt-table-details">
    <summary>{t('global.table')}</summary>
    <div className="dxs-mkt-table-wrap">
      <table>
        <caption>{t('global.table.caption')}</caption>
        <thead><tr>
          <th>{t('global.table.name')}</th>
          <th>{t('global.table.region')}</th>
          <th>{t('global.table.price')}</th>
          <th>{t('global.table.change')}</th>
          <th>{t('global.table.percent')}</th>
          <th>{t('global.table.open')}</th>
          <th>{t('global.table.high')}</th>
          <th>{t('global.table.low')}</th>
          <th>{t('global.table.previous')}</th>
          <th>{t('global.table.time')}</th>
        </tr></thead>
        <tbody>{quotes.map((quote: GlobalQuote) => <tr key={quote.code}>
          <td><span>{displayName(quote, locale)}</span><small>{quote.code}</small></td>
          <td>{t(`global.region.${quote.region}`)}</td>
          <td>{format.price(quote.price)}</td>
          <td className={toneOf(quote.changePercent)}>{format.signed(quote.change)}</td>
          <td className={toneOf(quote.changePercent)}>{format.change(quote.changePercent)}</td>
          <td>{format.price(quote.open)}</td>
          <td>{format.price(quote.high)}</td>
          <td>{format.price(quote.low)}</td>
          <td>{format.price(quote.previousClose)}</td>
          <td>{format.zoneTime(quote.quotedAt, quote.timeZone, t)}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </details>
}

export function GlobalView({ rpc, t, format, locale, preference: suppliedPreference, onChangeSource }: any) {
  const global = useGlobalMarket(rpc)
  const ownPreference = useMarketPreference(rpc)
  const preference = suppliedPreference ?? ownPreference
  const data: GlobalMarketOverview | null = global.value
  const changeSource = async (enabled: boolean) => {
    if (onChangeSource) { try { await onChangeSource(enabled) } catch { /* page owns the error */ } ; return }
    try {
      await preference.setEnabled(enabled)
      global.refresh()
    } catch { /* the preference hook owns the visible error */ }
  }
  const ordered = useMemo(() => {
    if (!data) return []
    return [...data.quotes].sort((left, right) => REGIONS.indexOf(left.region) - REGIONS.indexOf(right.region))
  }, [data])
  const summary = useMemo(() => {
    const quotes = data?.quotes ?? []
    const changes = quotes.map(quote => quote.changePercent).filter((value): value is number => typeof value === 'number')
    const ranked = quotes.filter(quote => typeof quote.changePercent === 'number')
      .sort((left, right) => (right.changePercent ?? 0) - (left.changePercent ?? 0))
    return {
      up: changes.filter(value => value > 0).length,
      down: changes.filter(value => value < 0).length,
      total: quotes.length,
      strongest: ranked[0] ?? null,
      weakest: ranked.at(-1) ?? null,
    }
  }, [data])

  if (global.status === 'unconfigured') {
    return <div className="dxs-mkt dxs-glb">
      <MarketUnconfigured t={t} preference={preference} onChange={changeSource} onRetry={global.refresh}
        title={t('global.unconfigured-title')} body={t('global.unconfigured-body')} />
    </div>
  }
  if ((global.status === 'error' || global.error) && !data) {
    return <div className="dxs-mkt dxs-glb"><MarketErrorCard t={t} onRetry={global.refresh} preference={preference} onChange={changeSource} title={t('global.error')} /></div>
  }
  if (!data) {
    return <div className="dxs-mkt dxs-glb">
      <section className="dxs-mkt-card dxs-mkt-setup" role="status">
        <h3>{global.error ? t('global.error') : t('global.loading')}</h3>
        {global.error ? <><p>{t('market.error-hint')}</p><button type="button" onClick={global.refresh}>{t('market.retry')}</button></> : null}
      </section>
    </div>
  }

  const regionsWithQuotes = REGIONS.filter(region => data.quotes.some(quote => quote.region === region)).length
  return <div className="dxs-mkt dxs-glb">
    <header className="dxs-mkt-head">
      <div>
        <h2>{t('global.title')}</h2>
        <p>{t('global.subtitle')}</p>
      </div>
      <div className="dxs-mkt-head-actions">
        <span className="dxs-mkt-updated">{t('market.updated', { time: format.time(data.fetchedAt, t) })}</span>
        <SourceSwitch preference={preference} onChange={changeSource} t={t} />
        <button type="button" onClick={global.refresh} disabled={global.refreshing}>
          {global.refreshing ? t('market.refreshing') : t('market.refresh')}
        </button>
      </div>
    </header>
    {global.error ? <p role="status" className="dxs-mkt-note">{t('market.error')} · {t('market.error-hint')}</p> : null}
    <p className="dxs-mkt-muted dxs-glb-coverage">
      {t('global.coverage', { count: format.count(summary.total), regions: format.count(regionsWithQuotes) })}
      {' · '}{t('global.source.active', { source: data.source })}
    </p>
    <section className="dxs-mkt-kpis dxs-glb-kpis">
      <Kpi label={t('global.kpi.updown')}
        value={<><span className="dxs-up">{format.count(summary.up)}</span><span className="dxs-mkt-slash">/</span><span className="dxs-down">{format.count(summary.down)}</span></>}
        note={t('global.kpi.coverage', { count: format.count(summary.total) })} />
      <Kpi label={t('global.kpi.strongest')} value={summary.strongest ? displayName(summary.strongest, locale) : '—'}
        note={summary.strongest ? format.change(summary.strongest.changePercent) : undefined}
        tone={summary.strongest ? toneOf(summary.strongest.changePercent) : ''} />
      <Kpi label={t('global.kpi.weakest')} value={summary.weakest ? displayName(summary.weakest, locale) : '—'}
        note={summary.weakest ? format.change(summary.weakest.changePercent) : undefined}
        tone={summary.weakest ? toneOf(summary.weakest.changePercent) : ''} />
      <Kpi label={t('global.kpi.regions')} value={`${format.count(regionsWithQuotes)}/${format.count(REGIONS.length)}`}
        note={t('global.kpi.regions-note')} />
    </section>
    {REGIONS.map(region => <RegionSection key={region} region={region} locale={locale}
      quotes={data.quotes.filter(quote => quote.region === region)} t={t} format={format} />)}
    <AllIndicesTable quotes={ordered} locale={locale} t={t} format={format} />
    <footer className="dxs-mkt-footer">
      <p>{t('global.timezone-note')}</p>
      <p>{t('global.source.note')}</p>
      <p>{t('market.not-advice')}</p>
    </footer>
  </div>
}
