import React from 'react'
import { StockWorkbench } from '../workbench.tsx'
import { useUsQuote } from './data.ts'

const tone = (value: any) => typeof value === 'number' && value > 0 ? 'dxs-up' : typeof value === 'number' && value < 0 ? 'dxs-down' : ''

/**
 * A US listing's page. It is reachable only from the page lookup, and it is
 * deliberately view-only: no watchlist entry, no bottom bar, no fundamentals,
 * no minute chart. The quote and the forward-adjusted daily bars come from the
 * same opt-in local free source as the A-share board.
 */
export function UsDetail({ item, scope, rpc, t, format, locale }: any) {
  const quote = useUsQuote(rpc, item?.symbol ?? null)
  const value = quote.value
  const status = quote.status === 'loading'
    ? t('us.loading')
    : quote.status === 'disabled'
      ? t('us.source-off')
      : quote.status === 'error'
        ? t(quote.error || 'us.error')
        : value?.quotedAt
          ? `${t('us.quote.quoted-at')} ${format.zoneTime(value.quotedAt, 'America/New_York', t)}`
          : t('time.missing')
  return <article className="dxs-us" aria-label={t('detail.aria', { symbol: item?.symbol ?? '' })}>
    <section className="dxs-section dxs-instrument-summary">
      <div className="dxs-quote-identity">
        <h2>{item?.alias || value?.name || item?.symbol}</h2>
        <p className="dxs-symbol-line">
          <span className="dxs-symbol">{item?.symbol}</span>
          <span className="dxs-market-tag">{t('us.market')}</span>
          {t('detail.preview')}
        </p>
      </div>
      <div className="dxs-quote-figures">
        <div className={`dxs-price ${tone(value?.change)}`}>{format.priceAt(value?.price, value?.pricePrecision)}</div>
        <div className={`dxs-change ${tone(value?.change)}`}>{format.change(value?.changePercent)}</div>
        <p className="dxs-status-line"><span className="dxs-muted">{status}</span></p>
      </div>
      <details className="dxs-quote-metadata" open>
        <summary>{t('detail.source')}</summary>
        <dl>
          <dt>{t('detail.source')}</dt><dd>{value?.source || t('detail.no-source')}</dd>
          <dt>{t('us.quote.change')}</dt><dd>{format.signedAt(value?.change, value?.pricePrecision)}</dd>
          <dt>{t('us.quote.open')}</dt><dd>{format.priceAt(value?.open, value?.pricePrecision)}</dd>
          <dt>{t('us.quote.high')}</dt><dd>{format.priceAt(value?.high, value?.pricePrecision)}</dd>
          <dt>{t('us.quote.low')}</dt><dd>{format.priceAt(value?.low, value?.pricePrecision)}</dd>
          <dt>{t('us.quote.previous-close')}</dt><dd>{format.priceAt(value?.previousClose, value?.pricePrecision)}</dd>
          <dt>{t('us.quote.volume')}</dt><dd>{value?.volume == null ? '—' : format.count(value.volume)}</dd>
          <dt>{t('detail.quoted-at')}</dt><dd>{value?.quotedAt ? format.zoneTime(value.quotedAt, 'America/New_York', t) : t('time.missing')}</dd>
          <dt>{t('detail.fetched-at')}</dt><dd>{format.time(value?.fetchedAt, t)}</dd>
        </dl>
        <p className="dxs-muted">{t('us.quote.time-notice')}</p>
      </details>
    </section>
    <p className="dxs-data-banner is-market" role="status">{t('us.notice')}</p>
    <StockWorkbench
      key={`us:${item?.symbol ?? ''}:${scope ?? ''}`}
      us symbol={item?.symbol} code={item?.code} scope={scope}
      t={t} format={format} locale={locale} rpc={rpc}
    />
    <p className="dxs-muted">{t('us.boundary')}</p>
  </article>
}
