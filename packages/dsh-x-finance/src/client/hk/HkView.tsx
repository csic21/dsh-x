import React from 'react'
import { StockWorkbench } from '../workbench.tsx'
import { useHkQuote } from './data.ts'
import { NewsPanel } from '../news/NewsPanel.tsx'

const tone = (value: any) => typeof value === 'number' && value > 0 ? 'dxs-up' : typeof value === 'number' && value < 0 ? 'dxs-down' : ''

/**
 * A Hong Kong listing's page. It is reachable only from the page lookup, and it
 * is deliberately view-only: no watchlist entry, no bottom bar, no fundamentals,
 * no minute chart. The quote and the forward-adjusted daily bars come from the
 * same opt-in local free source as the A-share board.
 */
export function HkDetail({ item, scope, rpc, t, format, locale, previewing = true, onAdd, fixed = false, onToggleFixed, onOpenStock }: any) {
  const quote = useHkQuote(rpc, item?.symbol ?? null)
  const value = quote.value
  const status = quote.status === 'loading'
    ? t('hk.loading')
    : quote.status === 'disabled'
      ? t('hk.source-off')
      : quote.status === 'error'
        ? t(quote.error || 'hk.error')
        : value?.quotedAt
          ? `${t('hk.quote.quoted-at')} ${format.zoneTime(value.quotedAt, 'Asia/Hong_Kong', t)}`
          : t('time.missing')
  return <article className="dxs-hk" aria-label={t('detail.aria', { symbol: item?.symbol ?? '' })}>
    <section className="dxs-section dxs-instrument-summary">
      <div className="dxs-quote-identity">
        <h2>{item?.alias || value?.name || item?.symbol}</h2>
        <p className="dxs-symbol-line">
          <span className="dxs-symbol">{item?.symbol}</span>
          <span className="dxs-market-tag">{t('hk.market')}</span>
          {item?.alias ? t('detail.alias') : ''}{previewing ? t('detail.preview') : ''}
          {/* A preview is not on the list yet; saving it is one explicit click.
              A saved row gets the same fixed/unfixed decision as the rail. */}
          {previewing && onAdd ? <button type="button" className="dxs-preview-add" onClick={onAdd} title={t('detail.preview.add-hint')}>{t('detail.preview.add-short')}</button> : null}
          {!previewing && onToggleFixed ? <button type="button" className="dxs-detail-fix" aria-pressed={Boolean(fixed)} onClick={onToggleFixed} title={t(fixed ? 'page.unfix-aria' : 'page.fix-aria', { symbol: item?.symbol ?? '' })}>{fixed ? t('detail.unfix') : t('detail.fix')}</button> : null}
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
          <dt>{t('hk.quote.change')}</dt><dd>{format.signedAt(value?.change, value?.pricePrecision)}</dd>
          <dt>{t('hk.quote.open')}</dt><dd>{format.priceAt(value?.open, value?.pricePrecision)}</dd>
          <dt>{t('hk.quote.high')}</dt><dd>{format.priceAt(value?.high, value?.pricePrecision)}</dd>
          <dt>{t('hk.quote.low')}</dt><dd>{format.priceAt(value?.low, value?.pricePrecision)}</dd>
          <dt>{t('hk.quote.previous-close')}</dt><dd>{format.priceAt(value?.previousClose, value?.pricePrecision)}</dd>
          <dt>{t('hk.quote.volume')}</dt><dd>{value?.volume == null ? '—' : format.count(value.volume)}</dd>
          <dt>{t('detail.quoted-at')}</dt><dd>{value?.quotedAt ? format.zoneTime(value.quotedAt, 'Asia/Hong_Kong', t) : t('time.missing')}</dd>
          <dt>{t('detail.fetched-at')}</dt><dd>{format.time(value?.fetchedAt, t)}</dd>
        </dl>
        <p className="dxs-muted">{t('hk.quote.time-notice')}</p>
      </details>
    </section>
    <p className="dxs-data-banner is-market" role="status">{t('hk.notice')}</p>
    <StockWorkbench
      key={`hk:${item?.symbol ?? ''}:${scope ?? ''}`}
      hk symbol={item?.symbol} scope={scope}
      t={t} format={format} locale={locale} rpc={rpc}
    />
    <NewsPanel
      key={`news:${item?.symbol ?? ''}`}
      symbol={item?.symbol}
      name={value?.name || item?.alias || item?.symbol}
      rpc={rpc} t={t} format={format} onOpenStock={onOpenStock}
    />
    <p className="dxs-muted">{t('hk.boundary')}</p>
  </article>
}
