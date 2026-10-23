import React from 'react'
import type { GoldInstrument, GoldSeries } from '../../gold.ts'
import { formatLocale, quoteDigits } from '../format.ts'
import { useGoldPanel } from './data.ts'
import { SourceButton } from '../source-button.tsx'

const tone = (value: any) => typeof value === 'number' && Number.isFinite(value) ? (value > 0 ? 'dxs-up' : value < 0 ? 'dxs-down' : '') : ''

/** The feed's quoted width wins; the unit only supplies a fallback. */
const priceDigits = (instrument: GoldInstrument) =>
  quoteDigits(instrument.precision ?? (instrument.unit === 'cny-usd' ? 4 : 2))

function priceText(instrument: GoldInstrument, locale: any) {
  const digits = priceDigits(instrument)
  return new Intl.NumberFormat(formatLocale(locale), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(instrument.price)
}

function InstrumentCard({ instrument, t, format, locale }: any) {
  const changeTone = tone(instrument.changePercent)
  const change = instrument.change
  const digits = priceDigits(instrument)
  return <article className="dxs-gold-card" aria-label={t(`gold.key.${instrument.key}`)}>
    <header>
      <h3 title={instrument.name}>{t(`gold.key.${instrument.key}`)}</h3>
      <span className="dxs-gold-badge">{t(`gold.unit.${instrument.unit}`)}</span>
    </header>
    <div className={`dxs-gold-price ${changeTone}`}>{priceText(instrument, locale)}</div>
    <p className={`dxs-gold-change ${changeTone}`}>
      {format.change(instrument.changePercent)}
      {change == null ? '' : ` · ${format.signedAt(change, digits)}`}
    </p>
    <dl className="dxs-gold-metrics">
      <dt>{t('gold.metric.open')}</dt><dd>{format.priceAt(instrument.open, digits)}</dd>
      <dt>{t('gold.metric.high')}</dt><dd>{format.priceAt(instrument.high, digits)}</dd>
      <dt>{t('gold.metric.low')}</dt><dd>{format.priceAt(instrument.low, digits)}</dd>
      <dt>{t('gold.metric.previous')}</dt><dd>{format.priceAt(instrument.previousClose, digits)}</dd>
      <dt>{t('gold.metric.amplitude')}</dt><dd>{format.percent(instrument.amplitudePercent)}</dd>
    </dl>
    <p className="dxs-muted dxs-gold-time">{t('gold.quoting', { time: format.time(instrument.quotedAt, t) })}</p>
  </article>
}

function DerivedSummary({ derived, t, format }: any) {
  const premiumTone = tone(derived.shanghaiPremium)
  return <section className="dxs-gold-summary" aria-label={t('gold.derived.title')}>
    <h2>{t('gold.derived.title')}</h2>
    <div className="dxs-gold-derived">
      <div><span>{t('gold.derived.london')}</span><strong>{format.price(derived.londonCnyPerGram)} <small>{t('gold.unit.cny-gram')}</small></strong></div>
      <div><span>{t('gold.derived.premium')}</span><strong className={premiumTone}>{format.signed(derived.shanghaiPremium)} <small>{t('gold.unit.cny-gram')}</small></strong><em className={premiumTone}>{format.change(derived.shanghaiPremiumPercent)}</em></div>
      <div><span>{t('gold.derived.ratio')}</span><strong>{derived.goldSilverRatio == null ? '—' : format.price(derived.goldSilverRatio)}</strong></div>
    </div>
    <p className="dxs-muted">{t('gold.derived.formula')}</p>
  </section>
}

function Ranges({ series, t, format }: { series: GoldSeries[], t: any, format: any }) {
  const rows: { key: 'XAU' | 'GC', data?: GoldSeries }[] = [
    { key: 'XAU', data: series.find(entry => entry.key === 'XAU') },
    { key: 'GC', data: series.find(entry => entry.key === 'GC') },
  ]
  const cell = (value: number | null | undefined) => value == null ? '—' : format.price(value)
  return <section className="dxs-gold-ranges" aria-label={t('gold.ranges.title')}>
    <h2>{t('gold.ranges.title')}</h2>
    <div className="dxs-gold-table-wrap">
      <table className="dxs-gold-table">
        <thead>
          <tr>
            <th scope="col">{t('gold.title')}</th>
            <th scope="col">{t('gold.range.5d')}</th>
            <th scope="col">{t('gold.range.20d')}</th>
            <th scope="col">{t('gold.range.60d')}</th>
            <th scope="col">{t('gold.range.ytd')}</th>
            <th scope="col">{t('gold.range.high52w')}</th>
            <th scope="col">{t('gold.range.low52w')}</th>
            <th scope="col">{t('gold.range.drawdown')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const range = (label: string) => row.data?.ranges.find(entry => entry.label === label)?.changePercent ?? null
            return <tr key={row.key}>
              <th scope="row">{t(`gold.key.${row.key}`)}</th>
              <td className={tone(range('5d'))}>{format.change(range('5d'))}</td>
              <td className={tone(range('20d'))}>{format.change(range('20d'))}</td>
              <td className={tone(range('60d'))}>{format.change(range('60d'))}</td>
              <td className={tone(range('ytd'))}>{format.change(range('ytd'))}</td>
              <td>{cell(row.data?.high52w)}</td>
              <td>{cell(row.data?.low52w)}</td>
              <td className={tone(row.data?.drawdownPercent)}>{format.change(row.data?.drawdownPercent)}</td>
            </tr>
          })}
        </tbody>
      </table>
    </div>
    <p className="dxs-muted">{t('gold.series.note')}</p>
  </section>
}

/**
 * Read-only gold panel. It shares the plugin's single free-source switch and
 * shows only what the source states: no generated narrative, no news and no
 * advice. Missing values stay empty instead of being filled in.
 */
export function GoldView({ rpc, t, format, locale, preference }: any) {
  const sourceEnabled = preference.status === 'ready' && preference.enabled
  const { status, value, error, refreshing, refresh } = useGoldPanel(rpc, { enabled: sourceEnabled })
  const stale = status === 'ready' && Boolean(error)
  return <div className="dxs-stage dxs-gold">
    <section className="dxs-gold-head">
      <div>
        <h2>{t('gold.title')}</h2>
        <p className="dxs-muted">{t('gold.subtitle')}</p>
      </div>
      <div className="dxs-gold-head-actions">
        {stale ? <span className="dxs-gold-stale">{t('gold.stale')}</span> : null}
        <button type="button" onClick={refresh} disabled={!sourceEnabled || refreshing}>{refreshing ? t('gold.refreshing') : t('gold.refresh')}</button>
      </div>
    </section>

    {preference.status === 'error' ? <p role="alert" className="dxs-banner dxs-error">{t('source.unavailable')}</p> : null}

    {!sourceEnabled && preference.status === 'ready'
      ? <div className="dxs-banner is-warn dxs-source-card">
        <div><strong>{t('gold.off-title')}</strong><p className="dxs-muted">{t('gold.off-notice')}</p></div>
        <SourceButton preference={preference} t={t} large />
      </div>
      : null}

    {preference.status === 'loading' ? <p className="dxs-muted">{t('gold.loading')}</p> : null}
    {sourceEnabled && status === 'loading' && !value ? <p className="dxs-muted">{t('gold.loading')}</p> : null}
    {sourceEnabled && status === 'error' ? <p role="alert" className="dxs-banner dxs-error">{t('gold.unavailable')}</p> : null}
    {stale ? <p role="status" className="dxs-banner is-warn">{t('gold.unavailable')} <span className="dxs-muted">{t('gold.unavailable-hint')}</span></p> : null}

    {value ? <>
      <p className="dxs-muted dxs-gold-meta">
        {value.source} · {t('gold.updated', { time: format.time(value.fetchedAt, t) })}
      </p>
      <div className="dxs-gold-grid">
        {value.instruments.map(instrument => <InstrumentCard key={instrument.key} instrument={instrument} t={t} format={format} locale={locale} />)}
      </div>
      <DerivedSummary derived={value.derived} t={t} format={format} />
      <Ranges series={value.series} t={t} format={format} />
      {value.seriesIncomplete ? <p className="dxs-muted">{t('gold.range.incomplete')}</p> : null}
      <details className="dxs-gold-notes">
        <summary>{t('gold.notes.summary')}</summary>
        <p>{t('gold.notes.unit')}</p>
        <p>{t('gold.notes.hours')}</p>
        <p>{t('gold.notes.delay')}</p>
        <p>{t('gold.notes.advice')}</p>
        <p>{t('gold.notes.events')}</p>
      </details>
    </> : null}
  </div>
}
