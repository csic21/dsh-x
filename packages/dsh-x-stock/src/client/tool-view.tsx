import React from 'react'
import { quoteErrorKey } from '../quote-messages.ts'
import { readQuotePresentation } from './quote-presentation.ts'

// A feature-owned official toolview keeps translated chrome separate from the
// durable model-visible result and from provider security names/symbols.
export function StockToolView({ phase, block, t, format, inspect }: any) {
  const settled = phase === 'result'
  const quote = settled ? readQuotePresentation(block.meta) : null
  const state = !settled ? (phase === 'preparing' ? 'preparing' : 'running') : block.isError ? 'failed' : 'done'
  const symbol = quote?.symbol ?? block.args?.text('symbol')
  return <section className="dxs dxs-section" aria-label={t('quote.title')}>
    <strong>{t('quote.title')}{symbol ? ` · ${symbol}` : ''}</strong>
    <p role="status">{t(`quote.${state}`)}</p>
    {settled && block.isError && <p role="alert">{t(quoteErrorKey(block.error))}</p>}
    {quote && !block.isError && <>
      <dl>
        {['price', 'open', 'high', 'low', 'previousClose', 'change', 'changePercent'].map(key => <React.Fragment key={key}><dt>{t(`quote.${key}`)}</dt><dd>{key === 'changePercent' ? format.change(quote[key]) : format.price(quote[key])}</dd></React.Fragment>)}
        <dt>{t('detail.source')}</dt><dd>{quote.provider}</dd>
        <dt>{t('detail.quoted-at')}</dt><dd>{format.time(quote.quotedAt, t)}</dd>
        <dt>{t('detail.fetched-at')}</dt><dd>{format.time(quote.fetchedAt, t)}</dd>
      </dl>
      <p>{t('quote.notice')}</p>
    </>}
    {settled && !block.isError && !quote && <><p>{t('quote.legacy')}</p><pre style={{ whiteSpace: 'pre-wrap' }}>{(block.content ?? []).filter((item: any) => item.type === 'text').map((item: any) => item.text).join('\n')}</pre></>}
    {inspect && <button onClick={inspect}>{t('quote.inspect')}</button>}
  </section>
}
