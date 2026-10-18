import React, { useEffect, useRef, useState } from 'react'
import { StockWorkbench } from './workbench.tsx'
import { MarketView } from './market/MarketView.tsx'
import { normalizeAShare, MAX_PINS, quoteStatus } from '../watchlist.ts'
import { addressFor } from './resource.ts'
import { errorKey } from './locales.ts'
const tone = (value: any) => value > 0 ? 'dxs-up' : value < 0 ? 'dxs-down' : ''
function Status({ snapshot, t, format }: any) {
  if (snapshot.status === 'loading') return <span className="dxs-muted">{t('status.loading')}</span>
  if (snapshot.status === 'failed') return <span className="dxs-muted">{snapshot.failure?.code ? t(errorKey(snapshot.failure.code), { max: format.count(MAX_PINS) }) : t('status.failed')}</span>
  return <span className="dxs-muted">{t(`status.${quoteStatus(snapshot.value)}`)}</span>
}
function StockChip({ pin, useResource, open, t, format }: any) {
  const snapshot = useResource(addressFor(pin.symbol)), quote = snapshot.value
  const status = quoteStatus(quote)
  return <button className="dxs-chip" onClick={() => open(pin.symbol)} title={t('chip.title', { symbol: pin.symbol, status: t(`status.${status}`) })}>
    <strong>{pin.alias || quote?.name || pin.symbol}</strong><span>{format.price(quote?.price)}</span>
    {quote?.price != null ? <span className={tone(quote.changePercent)}>{format.change(quote.changePercent)}</span> : <Status snapshot={snapshot} t={t} format={format} />}
    {quote?.price != null && (snapshot.status === 'failed' || status === 'stale') ? <span className="dxs-muted">{t('stale')}</span> : null}
  </button>
}
export function StockBar({ useWatchlist, useResource, collapse, open, t, format }: any) {
  const state = useWatchlist((value: any) => value)
  if (!state.pins.length) return null
  return <section className="dxs dxs-bar" aria-label={t('watchlist.aria')}>
    <button onClick={() => collapse(!state.collapsed)} aria-expanded={!state.collapsed} aria-label={t(state.collapsed ? 'watchlist.expand' : 'watchlist.collapse')}>{state.collapsed ? '▸' : '▾'} {t('watchlist', { count: format.count(state.pins.length) })}</button>
    {!state.collapsed && <div className="dxs-strip" aria-label={t('watchlist.order')}>
      {state.pins.map((pin: any) => <StockChip key={pin.symbol} pin={pin} useResource={useResource} open={open} t={t} format={format} />)}
    </div>}
    <button onClick={() => open(state.selectedSymbol)}>{t('title')}</button>
  </section>
}
export function StockIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 4v16h16M7 15l4-5 4 3 5-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
function AddStock({ add, count, ready, t, format }: any) {
  const [exchange, setExchange] = useState('SH'), [code, setCode] = useState(''), [alias, setAlias] = useState(''), [error, setError] = useState('')
  const submit = (event: any) => {
    event.preventDefault()
    try { add({ symbol: normalizeAShare(exchange, code), alias }); setCode(''); setAlias(''); setError('') }
    catch (failure: any) { setError(errorKey(failure.code)) }
  }
  return <form className="dxs-form" onSubmit={submit} noValidate>
    <h2>{t('add.title')}</h2>
    <label>{t('add.exchange')}<select value={exchange} onChange={event => setExchange(event.target.value)}>{['SH', 'SZ', 'BJ'].map(value => <option key={value} value={value}>{t(`exchange.${value}`)}</option>)}</select></label>
    <label>{t('add.code')}<input value={code} onChange={event => setCode(event.target.value)} inputMode="numeric" maxLength={6} placeholder="600519" required pattern="[0-9]{6}" /></label>
    <label>{t('add.alias')}<input value={alias} onChange={event => setAlias(event.target.value)} maxLength={24} placeholder={t('add.alias.placeholder')} /></label>
    <button type="submit" disabled={!ready || count >= MAX_PINS}>{t('add.submit', { count: format.count(count), max: format.count(MAX_PINS) })}</button>
    {error && <p role="alert" className="dxs-error">{t(error, { max: format.count(MAX_PINS) })}</p>}
    <p className="dxs-muted">{t('add.notice')}</p>
  </form>
}
function Detail({ pin, useResource, t, format, scope, locale }: any) {
  const snapshot = useResource(addressFor(pin.symbol)), quote = snapshot.value
  return <article aria-label={t('detail.aria', { symbol: pin.symbol })}>
    <section className="dxs-section dxs-instrument-summary"><h2>{pin.alias || quote?.name || pin.symbol}</h2><p className="dxs-muted">{pin.symbol}{pin.alias ? t('detail.alias') : ''}</p>
      <div className="dxs-price">{format.price(quote?.price)} <span className={tone(quote?.changePercent)} style={{ fontSize: 18 }}>{format.change(quote?.changePercent)}</span></div>
      <p><Status snapshot={snapshot} t={t} format={format} /></p>
      <details className="dxs-quote-metadata"><summary>{t('detail.source')}</summary><dl><dt>{t('detail.source')}</dt><dd>{quote?.source || t('detail.no-source')}</dd><dt>{t('detail.quoted-at')}</dt><dd>{format.time(quote?.quotedAt, t)}</dd><dt>{t('detail.fetched-at')}</dt><dd>{format.time(quote?.fetchedAt, t)}</dd></dl>
      <p className="dxs-muted">{t('detail.time-notice')}</p></details>
    </section>
    <StockWorkbench key={`${scope}:${pin.symbol}`} symbol={pin.symbol} scope={scope} t={t} format={format} locale={locale} />
    <details className="dxs-section"><summary>{t('detail.fundamentals')}</summary><p>{t('detail.no-fundamentals')}</p><p className="dxs-muted">{t('detail.fundamentals-notice')}</p></details>
    <details className="dxs-section"><summary>{t('detail.analysis')}</summary><p>{t('detail.no-analysis')}</p><p className="dxs-muted">{t('detail.analysis-notice')}</p></details>
  </article>
}
export function StockPage({ useWatchlist, useResource, add, remove, move, select, back, retryScope, t, format, getLocale = () => 'en', rpc }: any) {
  const state = useWatchlist((value: any) => value)
  const pin = state.pins.find((item: any) => item.symbol === state.selectedSymbol) ?? state.pins[0]
  const [view, setView] = useState<'watchlist' | 'market'>('watchlist')
  const previousSelection = useRef(state.selectedSymbol)
  useEffect(() => {
    if (state.selectedSymbol && state.selectedSymbol !== previousSelection.current) setView('watchlist')
    previousSelection.current = state.selectedSymbol
  }, [state.selectedSymbol])
  return <main className="dxs dxs-page">
    <header className="dxs-heading">
      <div><h1>{t('title')}</h1><p className="dxs-muted">{view === 'market' ? t('market.subtitle') : t('page.subtitle')}</p></div>
      <nav className="dxs-view-tabs" aria-label={t('page.view.aria')}>
        <button type="button" aria-pressed={view === 'watchlist'} onClick={() => setView('watchlist')}>{t('page.view.watchlist')}</button>
        <button type="button" aria-pressed={view === 'market'} onClick={() => setView('market')}>{t('page.view.market')}</button>
      </nav>
      <button onClick={back}>{t('page.back')}</button>
    </header>
    {view === 'market' ? <MarketView rpc={rpc} t={t} format={format} locale={getLocale()} /> : <>
      <div className="dxs-notice">{t('page.notice')}</div>
      {state.placement === 'occupied' && <p role="status" className="dxs-notice">{t('page.occupied')}</p>}
      {state.scopeStatus === 'loading' && <p role="status">{t('page.scope-loading')}</p>}
      {state.scopeStatus === 'failed' && <button onClick={retryScope}>{t('page.scope-retry')}</button>}
      {state.storageError && <p role="alert" className="dxs-error">{t(errorKey(state.storageError), { max: format.count(MAX_PINS) })}</p>}
      <div className="dxs-layout"><aside aria-label={t('page.manage')}><h2>{t('page.my-watchlist')}</h2>
        {!state.pins.length && <p className="dxs-muted">{t('page.empty')}</p>}
        {!state.pins.length && <button type="button" onClick={() => setView('market')}>{t('page.view.market-hint')}</button>}
        <ol className="dxs-list">{state.pins.map((item: any, index: any) => <li key={item.symbol}>
          <button className="dxs-select" aria-pressed={pin?.symbol === item.symbol} onClick={() => select(item.symbol)}><strong>{item.alias || item.symbol}</strong>{item.alias && <span className="dxs-muted"> · {item.symbol}</span>}</button>
          <div className="dxs-controls"><button disabled={index === 0} aria-label={t('page.move-up', { symbol: item.symbol })} onClick={() => move(item.symbol, -1)}>↑</button><button disabled={index === state.pins.length - 1} aria-label={t('page.move-down', { symbol: item.symbol })} onClick={() => move(item.symbol, 1)}>↓</button><button aria-label={t('page.remove-aria', { symbol: item.symbol })} onClick={() => remove(item.symbol)}>{t('page.remove')}</button></div>
        </li>)}</ol><AddStock add={add} count={state.pins.length} ready={state.scopeStatus === 'ready'} t={t} format={format} /></aside>
        {state.scopeStatus === 'ready' && (pin ? <Detail key={`${state.scopeId}:${pin.symbol}`} pin={pin} useResource={useResource} t={t} format={format} scope={state.scopeId} locale={getLocale()} /> : <StockWorkbench key={state.scopeId} scope={state.scopeId} t={t} format={format} locale={getLocale()} />)}
      </div>
    </>}
  </main>
}
