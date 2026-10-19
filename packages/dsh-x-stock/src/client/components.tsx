import React, { useEffect, useRef, useState } from 'react'
import { StockWorkbench } from './workbench.tsx'
import { MarketView } from './market/MarketView.tsx'
import { InstrumentSearch } from './SearchBox.tsx'
import { normalizeAShare, MAX_FIXED, MAX_WATCHLIST, fixedItems, quoteStatus } from '../watchlist.ts'
import { addressFor, fixedAddressFor } from './resource.ts'
import { errorKey } from './locales.ts'
import { useMarketPreference } from './market/data.ts'
const tone = (value: any) => value > 0 ? 'dxs-up' : value < 0 ? 'dxs-down' : ''
/** Every quote view reads the same batched-resource shape. */
const quoteFor = (snapshot: any, symbol: any) => snapshot?.value?.quotes?.find((quote: any) => quote?.symbol === symbol)
const sourceOf = (snapshot: any) => snapshot?.value?.source ?? null
function Status({ snapshot, quote, t, format }: any) {
  if (snapshot.status === 'loading') return <span className="dxs-muted">{t('status.loading')}</span>
  if (snapshot.status === 'failed') return <span className="dxs-muted">{snapshot.failure?.code ? t(errorKey(snapshot.failure.code), { max: format.count(MAX_WATCHLIST) }) : t('status.failed')}</span>
  return <span className="dxs-muted">{t(`status.${quoteStatus(quote)}`)}</span>
}
/**
 * The one control that turns the shared A-share source on. Both the bottom bar
 * and the stock page use it, and the market page switch writes the same
 * preference, so there is a single opt-in for every quote in this plugin.
 */
function SourceButton({ preference, t, large = false }: any) {
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false)
  if (preference.status !== 'ready' || preference.enabled) return null
  const enable = async () => {
    setBusy(true); setFailed(false)
    try { await preference.setEnabled(true) } catch { setFailed(true) } finally { setBusy(false) }
  }
  return <button type="button" className={large ? 'dxs-source-enable dxs-primary is-large' : 'dxs-source-enable'} disabled={busy || preference.forced} onClick={enable} title={failed ? t('source.enable-error') : t('source.enable-hint')}>{busy ? t('source.enabling') : t('source.enable')}</button>
}
function StockChip({ item, quote, snapshot, open, t, format }: any) {
  const status = quoteStatus(quote)
  return <button className="dxs-chip" onClick={() => open(item.symbol)} title={t('chip.title', { symbol: item.symbol, status: t(`status.${status}`) })}>
    <strong>{item.alias || quote?.name || item.symbol}</strong><span>{format.price(quote?.price)}</span>
    {quote?.price != null ? <span className={tone(quote.changePercent)}>{format.change(quote.changePercent)}</span> : <Status snapshot={snapshot} quote={quote} t={t} format={format} />}
    {quote?.price != null && (snapshot.status === 'failed' || status === 'stale') ? <span className="dxs-muted">{t('stale')}</span> : null}
  </button>
}
/**
 * Only fixed items reach the bottom bar, and they are read through one batched
 * resource so eight stocks cost one request per tick. The key remounts the
 * subscription when the shared source is switched on, so a bar that idled
 * while the source was off starts polling without a page reload.
 */
function FixedStrip({ items, symbols, useResource, open, t, format }: any) {
  const snapshot = useResource(fixedAddressFor(symbols))
  return <div className="dxs-strip" aria-label={t('bar.order')}>
    {items.map((item: any) => <StockChip key={item.symbol} item={item} quote={quoteFor(snapshot, item.symbol)} snapshot={snapshot} open={open} t={t} format={format} />)}
  </div>
}
export function StockBar({ useWatchlist, useResource, rpc, collapse, open, hideBar, t, format }: any) {
  const state = useWatchlist((value: any) => value)
  const preference = useMarketPreference(rpc)
  const fixed = fixedItems(state.items)
  // Nothing is fixed: the bar is not the watchlist, so it is not shown at all.
  if (!fixed.length) return null
  const sourceOff = preference.status === 'ready' && !preference.enabled
  return <section className="dxs dxs-bar" aria-label={t('bar.aria')}>
    <button onClick={() => collapse(!state.collapsed)} aria-expanded={!state.collapsed} aria-label={t(state.collapsed ? 'bar.expand' : 'bar.collapse')}>{state.collapsed ? '▸' : '▾'} {t('bar.title', { count: format.count(fixed.length) })}</button>
    {!state.collapsed && (sourceOff
      ? <p className="dxs-strip dxs-bar-hint"><span className="dxs-muted">{t('bar.source-off')}</span><SourceButton preference={preference} t={t} /></p>
      : <FixedStrip key={`${preference.enabled ? 'on' : 'off'}:${fixed.map((item: any) => item.symbol).join(',')}`} items={fixed} symbols={fixed.map((item: any) => item.symbol)} useResource={useResource} open={open} t={t} format={format} />)}
    <div className="dxs-bar-actions">
      {sourceOff ? null : <SourceButton preference={preference} t={t} />}
      <button type="button" className="dxs-icon-button" onClick={() => hideBar()} title={t('bar.hide-hint')} aria-label={t('bar.hide')}>✕</button>
      <button onClick={() => open(state.selectedSymbol)}>{t('title')}</button>
    </div>
  </section>
}
export function StockIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 4v16h16M7 15l4-5 4 3 5-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
function AddStock({ add, count, fixedCount, ready, rpc, t, format }: any) {
  const [exchange, setExchange] = useState('SH'), [code, setCode] = useState(''), [alias, setAlias] = useState(''), [fix, setFix] = useState(false), [error, setError] = useState('')
  const [picked, setPicked] = useState<any>(null)
  const submit = (event: any) => {
    event.preventDefault()
    try { add({ symbol: normalizeAShare(exchange, code), alias, fixed: fix }); setCode(''); setAlias(''); setFix(false); setError(''); setPicked(null) }
    catch (failure: any) { setError(errorKey(failure.code)) }
  }
  const pick = (match: any) => {
    const [market, digits] = String(match.symbol).split('.')
    setExchange(market); setCode(digits)
    setAlias(current => current.trim() ? current : match.name)
    setPicked(match); setError('')
  }
  return <form className="dxs-form" onSubmit={submit} noValidate>
    <h2>{t('add.title')}</h2>
    <InstrumentSearch rpc={rpc} onPick={pick} t={t} />
    {picked && <p className="dxs-muted" role="status">{t('add.selected', { name: picked.name, symbol: picked.symbol, kind: t(`add.kind.${picked.kind}`) })}</p>}
    <label>{t('add.exchange')}<select name="exchange" value={exchange} onChange={event => { setExchange(event.target.value); setPicked(null) }}>{['SH', 'SZ', 'BJ'].map(value => <option key={value} value={value}>{t(`exchange.${value}`)}</option>)}</select></label>
    <label>{t('add.code')}<input name="code" value={code} onChange={event => { setCode(event.target.value); setPicked(null) }} inputMode="numeric" maxLength={6} placeholder="600519" required pattern="[0-9]{6}" /></label>
    <label>{t('add.alias')}<input name="alias" value={alias} onChange={event => setAlias(event.target.value)} maxLength={24} placeholder={t('add.alias.placeholder')} /></label>
    <label className="dxs-check"><input type="checkbox" name="fixed" checked={fix} disabled={fixedCount >= MAX_FIXED} onChange={event => setFix(event.target.checked)} /> {t('add.fix', { max: format.count(MAX_FIXED) })}</label>
    <button type="submit" disabled={!ready || count >= MAX_WATCHLIST}>{t('add.submit', { count: format.count(count) })}</button>
    {error && <p role="alert" className="dxs-error">{t(error, { max: format.count(error === 'error.fixed-limit' ? MAX_FIXED : MAX_WATCHLIST) })}</p>}
    <p className="dxs-muted">{t('add.notice')}</p>
  </form>
}
function Detail({ item, useResource, t, format, scope, locale, rpc }: any) {
  const snapshot = useResource(addressFor(item.symbol)), quote = quoteFor(snapshot, item.symbol)
  return <article aria-label={t('detail.aria', { symbol: item.symbol })}>
    <section className="dxs-section dxs-instrument-summary"><h2>{item.alias || quote?.name || item.symbol}</h2><p className="dxs-muted">{item.symbol}{item.alias ? t('detail.alias') : ''}{item.fixed ? t('detail.fixed') : ''}</p>
      <div className="dxs-price">{format.price(quote?.price)} <span className={tone(quote?.changePercent)} style={{ fontSize: 18 }}>{format.change(quote?.changePercent)}</span></div>
      <p><Status snapshot={snapshot} quote={quote} t={t} format={format} /></p>
      <details className="dxs-quote-metadata"><summary>{t('detail.source')}</summary><dl><dt>{t('detail.source')}</dt><dd>{sourceOf(snapshot) || t('detail.no-source')}</dd><dt>{t('detail.quoted-at')}</dt><dd>{format.time(quote?.quotedAt, t)}</dd><dt>{t('detail.fetched-at')}</dt><dd>{format.time(quote?.fetchedAt, t)}</dd></dl>
      <p className="dxs-muted">{t('detail.time-notice')}</p></details>
    </section>
    <StockWorkbench key={`${scope}:${item.symbol}`} symbol={item.symbol} scope={scope} t={t} format={format} locale={locale} rpc={rpc} />
    <details className="dxs-section"><summary>{t('detail.fundamentals')}</summary><p>{t('detail.no-fundamentals')}</p><p className="dxs-muted">{t('detail.fundamentals-notice')}</p></details>
    <details className="dxs-section"><summary>{t('detail.analysis')}</summary><p>{t('detail.no-analysis')}</p><p className="dxs-muted">{t('detail.analysis-notice')}</p></details>
  </article>
}
export function StockPage({ useWatchlist, useResource, rpc, add, remove, move, select, setFixed, toggleBar, back, retryScope, t, format, getLocale = () => 'en' }: any) {
  const state = useWatchlist((value: any) => value)
  const preference = useMarketPreference(rpc)
  const item = state.items.find((entry: any) => entry.symbol === state.selectedSymbol) ?? state.items[0]
  const fixedCount = fixedItems(state.items).length
  const [view, setView] = useState<'watchlist' | 'market'>('watchlist')
  const [fixError, setFixError] = useState('')
  const [drillNotice, setDrillNotice] = useState('')
  const previousSelection = useRef(state.selectedSymbol)
  useEffect(() => {
    if (state.selectedSymbol && state.selectedSymbol !== previousSelection.current) setView('watchlist')
    previousSelection.current = state.selectedSymbol
  }, [state.selectedSymbol])
  /**
   * Drill-down from the panorama: an exchange-qualified symbol opens the stock
   * detail and its daily chart. A stock that is not on the watchlist is opened
   * without being added to it; only the selection changes.
   */
  const openStock = (symbol: any, name: any) => {
    if (typeof symbol !== 'string' || !/^(SH|SZ|BJ)\.\d{6}$/.test(symbol)) { setDrillNotice(t('market.drill.no-symbol')); return }
    const known = state.items.some((entry: any) => entry.symbol === symbol)
    try {
      if (!known) {
        // The controller's select() only publishes a selection, so an unknown
        // symbol has to be added to the list first; keep it unfixed.
        add({ symbol, alias: name, fixed: false })
      } else {
        select(symbol)
      }
      setDrillNotice(t(known ? 'market.drill.opened' : 'market.drill.added', { name: name || symbol }))
      setView('watchlist')
    } catch (failure: any) {
      setDrillNotice(errorKey(failure?.code))
    }
  }
  const toggleFix = (entry: any) => {
    try { setFixed(entry.symbol, !entry.fixed); setFixError('') }
    catch (failure: any) { setFixError(errorKey(failure.code)) }
  }
  const sourceOff = preference.status === 'ready' && !preference.enabled
  return <main className="dxs dxs-page">
    <header className="dxs-titlebar">
      <div className="dxs-brand"><StockIcon size={16} /><h1>{t('title')}</h1><span className="dxs-context">{view === 'market' ? t('market.subtitle') : t('page.subtitle')}</span></div>
      <nav className="dxs-view-tabs" aria-label={t('page.view.aria')}>
        <button type="button" aria-pressed={view === 'watchlist'} onClick={() => setView('watchlist')}>{t('page.view.watchlist')}</button>
        <button type="button" aria-pressed={view === 'market'} onClick={() => setView('market')}>{t('page.view.market')}</button>
      </nav>
      <div className="dxs-header-actions"><button type="button" onClick={back}>{t('page.back')}</button></div>
    </header>
    <div className="dxs-body">
    {drillNotice ? <p role="status" className="dxs-notice">{drillNotice}</p> : null}
    {view === 'market' ? <><MarketView rpc={rpc} t={t} format={format} locale={getLocale()} scope={state.scopeId} onOpenStock={openStock} /><p className="dxs-muted">{t('market.drill.hint')}</p></> : <>
      <div className={sourceOff ? 'dxs-notice dxs-source-card' : 'dxs-notice'}>
        {sourceOff
          ? <><strong>{t('source.off-title', { max: format.count(MAX_FIXED) })}</strong><p className="dxs-muted">{t('source.off-notice')}</p><SourceButton preference={preference} t={t} large />{preference.status === 'error' ? <p role="alert" className="dxs-error">{t('source.unavailable')}</p> : null}</>
          : <>{t('page.notice')}{preference.status === 'error' ? <p role="alert" className="dxs-error">{t('source.unavailable')}</p> : null}</>}
      </div>
      {state.placement === 'occupied' && <p role="status" className="dxs-notice">{t('page.occupied')}</p>}
      {state.barHidden && <p role="status" className="dxs-notice">{t('page.bar-hidden')} <button type="button" onClick={() => toggleBar()}>{t('page.bar-show')}</button></p>}
      {state.scopeStatus === 'loading' && <p role="status">{t('page.scope-loading')}</p>}
      {state.scopeStatus === 'failed' && <button onClick={retryScope}>{t('page.scope-retry')}</button>}
      {state.storageError && <p role="alert" className="dxs-error">{t(errorKey(state.storageError), { max: format.count(MAX_WATCHLIST) })}</p>}
      <div className="dxs-layout"><aside aria-label={t('page.manage')}><h2>{t('page.my-watchlist')}</h2>
        <p className="dxs-muted">{t('page.counts', { count: format.count(state.items.length), fixed: format.count(fixedCount), max: format.count(MAX_FIXED) })}</p>
        <p className="dxs-muted">{t('page.fixed-hint', { max: format.count(MAX_FIXED) })}</p>
        {!state.items.length && <p className="dxs-muted">{t('page.empty')}</p>}
        {!state.items.length && <button type="button" onClick={() => setView('market')}>{t('page.view.market-hint')}</button>}
        <ol className="dxs-list">{state.items.map((entry: any, index: any) => <li key={entry.symbol}>
          <button className="dxs-select" aria-pressed={item?.symbol === entry.symbol} onClick={() => select(entry.symbol)}><strong>{entry.alias || entry.symbol}</strong>{entry.alias && <span className="dxs-muted"> · {entry.symbol}</span>}{entry.fixed && <span className="dxs-fixed-mark"> · {t('page.fixed')}</span>}</button>
          <div className="dxs-controls">
            <button type="button" className="dxs-icon-button" disabled={index === 0} aria-label={t('page.move-up', { symbol: entry.symbol })} onClick={() => move(entry.symbol, -1)}>↑</button>
            <button type="button" className="dxs-icon-button" disabled={index === state.items.length - 1} aria-label={t('page.move-down', { symbol: entry.symbol })} onClick={() => move(entry.symbol, 1)}>↓</button>
            <button aria-pressed={entry.fixed} aria-label={t(entry.fixed ? 'page.unfix-aria' : 'page.fix-aria', { symbol: entry.symbol })} onClick={() => toggleFix(entry)}>{entry.fixed ? t('page.unfix') : t('page.fix')}</button>
            <button aria-label={t('page.remove-aria', { symbol: entry.symbol })} onClick={() => remove(entry.symbol)}>{t('page.remove')}</button>
          </div>
        </li>)}</ol>
        {fixError && <p role="alert" className="dxs-error">{t(fixError, { max: format.count(MAX_FIXED) })}</p>}
        <p className="dxs-muted">{state.barHidden ? <>{t('page.bar-hidden')} <button type="button" onClick={() => toggleBar()}>{t('page.bar-show')}</button></> : <button type="button" onClick={() => toggleBar()}>{t('page.bar-hide')}</button>} <span className="dxs-muted">{t('page.bar-shortcut')}</span></p>
        <AddStock add={add} count={state.items.length} fixedCount={fixedCount} ready={state.scopeStatus === 'ready'} rpc={rpc} t={t} format={format} /></aside>
        {state.scopeStatus === 'ready' && (item ? <Detail key={`${state.scopeId}:${preference.enabled}:${item.symbol}`} item={item} useResource={useResource} t={t} format={format} scope={state.scopeId} locale={getLocale()} rpc={rpc} /> : <StockWorkbench key={state.scopeId} scope={state.scopeId} t={t} format={format} locale={getLocale()} rpc={rpc} />)}
      </div>
    </>}
    </div>
  </main>
}
