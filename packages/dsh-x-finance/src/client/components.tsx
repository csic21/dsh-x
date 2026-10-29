import React, { useEffect, useRef, useState } from 'react'
import { StockWorkbench } from './workbench.tsx'
import { MarketView } from './market/MarketView.tsx'
import { HotView } from './market/HotView.tsx'
import { PredictView } from './market/PredictView.tsx'
import { GlobalView } from './market/GlobalView.tsx'
import { InstrumentLookup, InstrumentSearch } from './SearchBox.tsx'
import { normalizeAShare, MAX_FIXED, MAX_WATCHLIST, fixedItems, quoteStatus } from '../watchlist.ts'
import { fixedBarShortcutKeys, fixedBarShortcutLabel } from './shortcut.ts'
import { addressFor, fixedAddressFor } from './resource.ts'
import { errorKey } from './locales.ts'
import { useMarketPreference } from './market/data.ts'
import { SourceButton } from './source-button.tsx'
import { GoldView } from './gold/GoldView.tsx'
import { SettingsPanel } from './settings/SettingsPanel.tsx'
import { useFinanceSettings } from './settings/store.ts'
import { WatchSignals } from './watch-signals-view.tsx'
import { QuantScanView } from './quant-scan-view.tsx'
const tone = (value: any) => value > 0 ? 'dxs-up' : value < 0 ? 'dxs-down' : ''
function ShortcutHint({ t }: any) {
  const keys = fixedBarShortcutKeys()
  const label = fixedBarShortcutLabel()
  return <span className="dxs-shortcut">
    <span className="dxs-sr-only">{t('page.bar-shortcut', { shortcut: label })}</span>
    <span aria-hidden="true">{keys.map(key => <kbd key={key}>{key}</kbd>)}</span>
  </span>
}
/** Every quote view reads the same batched-resource shape. */
const quoteFor = (snapshot: any, symbol: any) => snapshot?.value?.quotes?.find((quote: any) => quote?.symbol === symbol)
const sourceOf = (snapshot: any) => snapshot?.value?.source ?? null
function Status({ snapshot, quote, t, format }: any) {
  if (snapshot.status === 'loading') return <span className="dxs-muted">{t('status.loading')}</span>
  if (snapshot.status === 'failed') return <span className="dxs-muted">{snapshot.failure?.code ? t(errorKey(snapshot.failure.code), { max: format.count(MAX_WATCHLIST) }) : t('status.failed')}</span>
  return <span className="dxs-muted">{t(`status.${quoteStatus(quote)}`)}</span>
}
/**
 * The shared opt-in now lives in its own module because the gold panel uses
 * the same control without importing the page.
 */
function StockChip({ item, quote, snapshot, open, t, format }: any) {
  const status = quoteStatus(quote)
  return <button className="dxs-chip" onClick={() => open(item.symbol)} title={t('chip.title', { symbol: item.symbol, status: t(`status.${status}`) })}>
    <strong>{item.alias || quote?.name || item.symbol}</strong><span>{format.priceAt(quote?.price, quote?.pricePrecision)}</span>
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
export function StockBar({ useWatchlist, useResource, rpc, collapse, open, hideBar, settings, t, format }: any) {
  const state = useWatchlist((value: any) => value)
  const appearance = useFinanceSettings(settings)
  const preference = useMarketPreference(rpc)
  const fixed = fixedItems(state.items)
  const discreet = appearance.discreet
  // Nothing is fixed: the bar is not the watchlist, so it is not shown at all.
  // Discreet mode releases the slot too unless the reader asked to keep it; in
  // that case the bar stays and takes the same neutral palette as the page.
  if (!fixed.length || (discreet && !appearance.barInDiscreet)) return null
  const sourceOff = preference.status === 'ready' && !preference.enabled
  return <section className={`dxs dxs-bar${discreet ? ' dxs-discreet' : ''}`} aria-label={t(discreet ? 'bar.aria.quiet' : 'bar.aria')}>
    <button onClick={() => collapse(!state.collapsed)} aria-expanded={!state.collapsed} aria-label={t(state.collapsed ? 'bar.expand' : 'bar.collapse')}>{state.collapsed ? '▸' : '▾'} {t('bar.title', { count: format.count(fixed.length) })}</button>
    {!state.collapsed && (sourceOff
      ? <p className="dxs-strip dxs-bar-hint"><span className="dxs-muted">{t('bar.source-off')}</span><SourceButton preference={preference} t={t} /></p>
      : <FixedStrip key={`${preference.enabled ? 'on' : 'off'}:${fixed.map((item: any) => item.symbol).join(',')}`} items={fixed} symbols={fixed.map((item: any) => item.symbol)} useResource={useResource} open={open} t={t} format={format} />)}
    <div className="dxs-bar-actions">
      {sourceOff ? null : <SourceButton preference={preference} t={t} />}
      <button type="button" className="dxs-icon-button" onClick={() => hideBar()} title={t('bar.hide-hint', { shortcut: fixedBarShortcutLabel() })} aria-label={t('bar.hide')}>✕</button>
      <button onClick={() => open(state.selectedSymbol)}>{t(discreet ? 'settings.discreet.title' : 'title')}</button>
    </div>
  </section>
}
export function StockIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 4v16h16M7 15l4-5 4 3 5-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
function SettingsIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.7" /><path d="M12 3.5v2.1M12 18.4v2.1M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M3.5 12h2.1M18.4 12h2.1M4.9 19.1l1.5-1.5M17.6 6.4l1.5-1.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
}
function AddStock({ add, count, fixedCount, ready, rpc, t, format, sourceRevision }: any) {
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
    <InstrumentSearch rpc={rpc} onPick={pick} t={t} refreshToken={sourceRevision} />
    {picked && <p className="dxs-picked" role="status">{t('add.selected', { name: picked.name, symbol: picked.symbol, kind: t(`add.kind.${picked.kind}`) })}</p>}
    <div className="dxs-form-grid">
      <label className="dxs-field">{t('add.exchange')}<select name="exchange" value={exchange} onChange={event => { setExchange(event.target.value); setPicked(null) }}>{['SH', 'SZ', 'BJ'].map(value => <option key={value} value={value}>{t(`exchange.${value}`)}</option>)}</select></label>
      <label className="dxs-field">{t('add.code')}<input name="code" value={code} onChange={event => { setCode(event.target.value); setPicked(null) }} inputMode="numeric" maxLength={6} placeholder="600519" required pattern="[0-9]{6}" /></label>
    </div>
    <label className="dxs-field">{t('add.alias')}<input name="alias" value={alias} onChange={event => setAlias(event.target.value)} maxLength={24} placeholder={t('add.alias.placeholder')} /></label>
    <div className="dxs-form-submit">
      <label className="dxs-check"><input type="checkbox" name="fixed" checked={fix} disabled={fixedCount >= MAX_FIXED} onChange={event => setFix(event.target.checked)} /> {t('add.fix', { max: format.count(MAX_FIXED) })}</label>
      <button type="submit" className="dxs-primary" disabled={!ready || count >= MAX_WATCHLIST}>{t('add.submit', { count: format.count(count) })}</button>
    </div>
    {error && <p role="alert" className="dxs-error">{t(error, { max: format.count(error === 'error.fixed-limit' ? MAX_FIXED : MAX_WATCHLIST) })}</p>}
  </form>
}
function Detail({ item, previewing, onAdd, useResource, t, format, scope, locale, rpc }: any) {
  const snapshot = useResource(addressFor(item.symbol)), quote = quoteFor(snapshot, item.symbol)
  const changeTone = tone(quote?.changePercent)
  return <article aria-label={t('detail.aria', { symbol: item.symbol })}>
    <section className="dxs-section dxs-instrument-summary">
      <div className="dxs-quote-identity">
        <h2>{item.alias || quote?.name || item.symbol}</h2>
        <p className="dxs-symbol-line"><span className="dxs-symbol">{item.symbol}</span>{item.alias ? t('detail.alias') : ''}{item.fixed ? t('detail.fixed') : ''}{previewing ? t('detail.preview') : ''}
          {/* A preview is opened from the market and is not on the list yet;
              saving it is this one explicit, compact action. */}
          {previewing && onAdd ? <button type="button" className="dxs-preview-add" onClick={onAdd} title={t('detail.preview.add-hint')}>{t('detail.preview.add-short')}</button> : null}
        </p>
      </div>
      <div className="dxs-quote-figures">
        <div className={`dxs-price ${changeTone}`}>{format.priceAt(quote?.price, quote?.pricePrecision)}</div>
        <div className={`dxs-change ${changeTone}`}>{format.change(quote?.changePercent)}</div>
        <p className="dxs-status-line"><Status snapshot={snapshot} quote={quote} t={t} format={format} /></p>
      </div>
      <details className="dxs-quote-metadata"><summary>{t('detail.source')}</summary><dl><dt>{t('detail.source')}</dt><dd>{sourceOf(snapshot) || t('detail.no-source')}</dd><dt>{t('detail.quoted-at')}</dt><dd>{format.time(quote?.quotedAt, t)}</dd><dt>{t('detail.fetched-at')}</dt><dd>{format.time(quote?.fetchedAt, t)}</dd></dl>
      <p className="dxs-muted">{t('detail.time-notice')}</p></details>
    </section>
    <StockWorkbench key={`${scope}:${item.symbol}`} symbol={item.symbol} scope={scope} t={t} format={format} locale={locale} rpc={rpc} />
    <div className="dxs-secondary">
      <details className="dxs-section"><summary>{t('detail.fundamentals')}</summary><p>{t('detail.no-fundamentals')}</p><p className="dxs-muted">{t('detail.fundamentals-notice')}</p></details>
      <details className="dxs-section"><summary>{t('detail.analysis')}</summary><p>{t('detail.no-analysis')}</p><p className="dxs-muted">{t('detail.analysis-notice')}</p></details>
    </div>
  </article>
}
export function StockPage({ useWatchlist, useResource, rpc, add, addMany, remove, move, select, preview, closePreview, setFixed, toggleBar, back, retryScope, settings, t, format, getLocale = () => 'en' }: any) {
  const state = useWatchlist((value: any) => value)
  const preference = useMarketPreference(rpc)
  const appearance = useFinanceSettings(settings)
  const discreet = appearance.discreet
  // A preview is what the reader is looking at right now, so it outranks the
  // saved row that happened to be selected before the drill-down.
  const previewItem = state.preview ? { symbol: state.preview.symbol, alias: state.preview.name, fixed: false } : null
  // A preview is a standalone detail page, not a watchlist row: it only opens
  // once storage is ready, because the detail reads saved chart preferences.
  const previewOpen = Boolean(previewItem) && state.scopeStatus === 'ready'
  const leavePreview = () => { closePreview(); setDrillNotice('') }
  const selected = previewItem ? undefined : state.items.find((entry: any) => entry.symbol === state.selectedSymbol)
  const item = previewItem ?? selected ?? state.items[0]
  const fixedCount = fixedItems(state.items).length
  const [view, setView] = useState<'watchlist' | 'market' | 'quant-scan' | 'hot' | 'predict' | 'global' | 'gold'>('watchlist')
  const [fixError, setFixError] = useState('')
  const [drillNotice, setDrillNotice] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  // The source switch can be flipped from the drawer, so the market board is
  // remounted when it changes instead of waiting for its next poll.
  const [sourceRevision, setSourceRevision] = useState(0)
  const previousSelection = useRef(state.selectedSymbol)
  useEffect(() => {
    if (state.selectedSymbol && state.selectedSymbol !== previousSelection.current) setView('watchlist')
    previousSelection.current = state.selectedSymbol
  }, [state.selectedSymbol])
  /**
   * Drill-down from the panorama: an exchange-qualified symbol opens the stock
   * detail and its daily chart. A stock that is not on the watchlist is opened
   * as a preview — nothing is written to the saved list until the reader adds
   * it on purpose, so clicking around the market never edits the watchlist.
   */
  const openStock = (symbol: any, name: any) => {
    if (typeof symbol !== 'string' || !/^(SH|SZ|BJ)\.\d{6}$/.test(symbol)) { setDrillNotice(t('market.drill.no-symbol')); return }
    const known = state.items.some((entry: any) => entry.symbol === symbol)
    try {
      if (known) {
        select(symbol)
        setView('watchlist')
        setDrillNotice(t('market.drill.opened', { name: name || symbol }))
      } else {
        // A stock that is not on the list gets its own full-width page: no
        // watchlist rail and no tab switch, so the reader keeps their place.
        preview(symbol, name)
        setDrillNotice(t('market.drill.preview', { name: name || symbol }))
      }
    } catch (failure: any) {
      setDrillNotice(errorKey(failure?.code))
    }
  }
  const addPreview = (entry: any) => {
    try {
      add({ symbol: entry.symbol, alias: entry.alias, fixed: false })
      select(entry.symbol)
      setDrillNotice(t('market.drill.added', { name: entry.alias || entry.symbol }))
    } catch (failure: any) {
      setDrillNotice(errorKey(failure?.code))
    }
  }
  const toggleFix = (entry: any) => {
    try { setFixed(entry.symbol, !entry.fixed); setFixError('') }
    catch (failure: any) { setFixError(errorKey(failure.code)) }
  }
  const sourceOff = preference.status === 'ready' && !preference.enabled
  const changeSource = async (enabled: boolean) => {
    try { await preference.setEnabled(enabled); setSourceRevision(value => value + 1) }
    catch { /* the preference hook owns the visible error */ }
  }
  const setBarVisible = (visible: boolean) => {
    if (Boolean(state.barHidden) === visible) toggleBar()
  }
  // In discreet mode the bar is hidden by policy, not by the bar switch, so
  // this one action clears both: keep the bar in this mode and unhide it.
  const showBarInDiscreet = () => {
    settings?.setBarInDiscreet?.(true)
    if (state.barHidden) toggleBar()
  }
  const tabLabel = (normal: string, neutral: string) => t(discreet ? neutral : normal)
  return <main className={`dxs dxs-page${discreet ? ' dxs-discreet' : ''}`}>
    {/* This page owns the keyed `main` slot, so the Conversation header that
        normally carries `data-window-drag` is not mounted. Claim the same drag
        region here; the shell's global rule keeps every button `no-drag`, so
        only the text and gaps move the window. */}
    <header className="dxs-titlebar" data-window-drag>
      <div className="dxs-brand"><StockIcon size={16} /><h1>{discreet ? t('settings.discreet.title') : t('title')}</h1><span className="dxs-context">{discreet ? t('settings.discreet.subtitle') : view === 'market' ? t('market.subtitle') : view === 'quant-scan' ? t('quantScan.subtitle') : view === 'hot' ? t('hot.subtitle') : view === 'predict' ? t('predict.subtitle') : view === 'global' ? t('global.subtitle') : view === 'gold' ? t('gold.subtitle') : t('page.subtitle')}</span></div>
      {/* Looking a stock up belongs to the page chrome, not to a tab: one
          compact pill for every view, and a pick opens the preview page. */}
      <InstrumentLookup rpc={rpc} t={t} refreshToken={sourceRevision} onPick={(match: any) => openStock(match.symbol, match.name)} />
      <nav className="dxs-view-tabs" aria-label={t('page.view.aria')}>
        <button type="button" aria-pressed={view === 'watchlist' && !previewOpen} onClick={() => { leavePreview(); setView('watchlist') }}>{tabLabel('page.view.watchlist', 'settings.tab.watchlist')}</button>
        <button type="button" aria-pressed={view === 'market' && !previewOpen} onClick={() => { leavePreview(); setView('market') }}>{tabLabel('page.view.market', 'settings.tab.market')}</button>
        <button type="button" aria-pressed={view === 'hot' && !previewOpen} onClick={() => { leavePreview(); setView('hot') }}>{tabLabel('page.view.hot', 'settings.tab.hot')}</button>
        <button type="button" aria-pressed={view === 'predict' && !previewOpen} onClick={() => { leavePreview(); setView('predict') }}>{tabLabel('page.view.predict', 'settings.tab.predict')}</button>
        <button type="button" aria-pressed={view === 'global' && !previewOpen} onClick={() => { leavePreview(); setView('global') }}>{tabLabel('global.view.tab', 'settings.tab.global')}</button>
        <button type="button" aria-pressed={view === 'gold' && !previewOpen} onClick={() => { leavePreview(); setView('gold') }}>{tabLabel('gold.view.tab', 'settings.tab.gold')}</button>
        <button type="button" aria-pressed={view === 'quant-scan' && !previewOpen} onClick={() => { leavePreview(); setView('quant-scan') }}>{tabLabel('quantScan.tab', 'quantScan.tab.quiet')}</button>
      </nav>
      <div className="dxs-header-actions">
        <button type="button" className="dxs-settings-button" aria-label={t('settings.open')} title={t('settings.open')} aria-haspopup="dialog" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(true)}><SettingsIcon /><span className="dxs-settings-button-label">{t('settings.open')}</span></button>
        <button type="button" onClick={back}>{t('page.back')}</button>
      </div>
    </header>
    <div className="dxs-body">
    {drillNotice ? <p role="status" className="dxs-banner">{drillNotice}</p> : null}
    {previewOpen ? <div className="dxs-stage dxs-stage-detail dxs-preview-page">
      <div className="dxs-preview-bar">
        <button type="button" className="dxs-preview-back" onClick={leavePreview}>← {t('preview.back')}</button>
        <p className="dxs-muted">{t('preview.bar', { name: previewItem?.alias || previewItem?.symbol || '' })}</p>
      </div>
      <Detail key={`preview:${previewItem?.symbol}`} item={previewItem} previewing onAdd={state.items.length < MAX_WATCHLIST ? () => addPreview(previewItem) : undefined} useResource={useResource} t={t} format={format} scope={state.scopeId} locale={getLocale()} rpc={rpc} />
    </div> : view === 'gold' ? <GoldView rpc={rpc} t={t} format={format} locale={getLocale()} preference={preference} /> : view === 'global' ? <div className="dxs-stage dxs-stage-market"><GlobalView key={`global:${sourceRevision}`} rpc={rpc} t={t} format={format} locale={getLocale()} preference={preference} onChangeSource={changeSource} /></div> : view === 'quant-scan' ? <div className="dxs-stage dxs-stage-market"><SourceButton preference={preference} t={t} /><QuantScanView rpc={rpc} scope={state.scopeStatus === 'ready' ? state.scopeId : null} sourceEnabled={preference.status === 'ready' && preference.enabled} t={t} format={format} onOpenStock={openStock} /></div> : view === 'hot' ? <div className="dxs-stage dxs-stage-market"><HotView rpc={rpc} t={t} format={format} onOpenStock={openStock} onAddMany={addMany} /><p className="dxs-muted dxs-stage-hint">{t('hot.drill.hint')}</p></div> : view === 'predict' ? <div className="dxs-stage dxs-stage-market"><PredictView rpc={rpc} t={t} format={format} onOpenStock={openStock} /><p className="dxs-muted dxs-stage-hint">{t('predict.drill.hint')}</p></div> : view === 'market' ? <div className="dxs-stage dxs-stage-market"><MarketView key={`market:${sourceRevision}`} rpc={rpc} t={t} format={format} locale={getLocale()} scope={state.scopeId} discreet={discreet} preference={preference} onChangeSource={changeSource} onOpenStock={openStock} /><p className="dxs-muted dxs-stage-hint">{t('market.drill.hint')}</p></div> : <>
      {sourceOff ? <div className="dxs-banner is-warn dxs-source-card"><div><strong>{t('source.off-title', { max: format.count(MAX_FIXED) })}</strong><p className="dxs-muted">{t('source.off-notice')}</p>{preference.status === 'error' ? <p role="alert" className="dxs-error">{t('source.unavailable')}</p> : null}</div><SourceButton preference={preference} t={t} large /></div> : preference.status === 'error' ? <p role="alert" className="dxs-banner dxs-error">{t('source.unavailable')}</p> : null}
      {state.placement === 'occupied' && <p role="status" className="dxs-banner">{t('page.occupied')}</p>}
      {state.barHidden && <p role="status" className="dxs-banner">{t('page.bar-hidden')} <button type="button" onClick={() => toggleBar()}>{t('page.bar-show')}</button></p>}
      {state.scopeStatus === 'loading' && <p role="status" className="dxs-banner">{t('page.scope-loading')}</p>}
      {state.scopeStatus === 'failed' && <p className="dxs-banner"><button onClick={retryScope}>{t('page.scope-retry')}</button></p>}
      {state.storageError && <p role="alert" className="dxs-banner dxs-error">{t(errorKey(state.storageError), { max: format.count(MAX_WATCHLIST) })}</p>}
      <div className="dxs-layout">
        <aside className="dxs-rail" aria-label={t('page.manage')}>
          <header className="dxs-rail-head">
            <h2>{t('page.my-watchlist')}</h2>
            <p className="dxs-counts">{t('page.counts', { count: format.count(state.items.length), fixed: format.count(fixedCount), max: format.count(MAX_FIXED) })}</p>
          </header>
          <div className="dxs-rail-list">
            {!state.items.length && <div className="dxs-empty"><p className="dxs-muted">{t('page.empty')}</p><p className="dxs-muted">{t('page.empty.lookup')}</p><button type="button" onClick={() => setView('market')}>{t('page.view.market-hint')}</button></div>}
            <ol className="dxs-list">{state.items.map((entry: any, index: any) => <li key={entry.symbol} className={item?.symbol === entry.symbol ? 'is-selected' : undefined}>
              <button type="button" className="dxs-select" aria-pressed={item?.symbol === entry.symbol} onClick={() => select(entry.symbol)}>
                <span className="dxs-row-name"><strong>{entry.alias || entry.symbol}</strong>{entry.fixed ? <span className="dxs-fixed-mark">{t('page.fixed')}</span> : null}</span>
                <span className="dxs-row-meta">{entry.alias ? <span className="dxs-muted">{entry.symbol}</span> : null}</span>
              </button>
              <div className="dxs-controls">
                <button type="button" className="dxs-icon-button" disabled={index === 0} aria-label={t('page.move-up', { symbol: entry.symbol })} onClick={() => move(entry.symbol, -1)}>↑</button>
                <button type="button" className="dxs-icon-button" disabled={index === state.items.length - 1} aria-label={t('page.move-down', { symbol: entry.symbol })} onClick={() => move(entry.symbol, 1)}>↓</button>
                <button type="button" className="dxs-icon-button" aria-pressed={entry.fixed} aria-label={t(entry.fixed ? 'page.unfix-aria' : 'page.fix-aria', { symbol: entry.symbol })} title={entry.fixed ? t('page.unfix') : t('page.fix')} onClick={() => toggleFix(entry)}>{entry.fixed ? '★' : '☆'}</button>
                <button type="button" className="dxs-icon-button dxs-remove" aria-label={t('page.remove-aria', { symbol: entry.symbol })} title={t('page.remove')} onClick={() => remove(entry.symbol)}>✕</button>
              </div>
            </li>)}</ol>
            {fixError && <p role="alert" className="dxs-error">{t(fixError, { max: format.count(MAX_FIXED) })}</p>}
          </div>
          <div className="dxs-rail-foot">
            <p className="dxs-bar-toggle">
              {discreet && !appearance.barInDiscreet
                ? <button type="button" onClick={showBarInDiscreet} title={t('page.bar-quiet-hint')}>{t('page.bar-quiet-show')}</button>
                : state.barHidden ? <button type="button" onClick={() => toggleBar()}>{t('page.bar-show')}</button> : <button type="button" onClick={() => toggleBar()}>{t('page.bar-hide')}</button>}
              <ShortcutHint t={t} />
            </p>
            <AddStock add={add} count={state.items.length} fixedCount={fixedCount} ready={state.scopeStatus === 'ready'} rpc={rpc} t={t} format={format} sourceRevision={sourceRevision} />
            <details className="dxs-fineprint">
              <summary>{t('page.notes')}</summary>
              {!sourceOff ? <p>{t('page.notice')}</p> : null}
              <p>{t('page.fixed-hint', { max: format.count(MAX_FIXED) })}</p>
              <p>{t('add.notice')}</p>
            </details>
          </div>
        </aside>
        <div className="dxs-stage">
          {state.scopeStatus === 'ready' ? <WatchSignals key={state.scopeId} rpc={rpc} scope={state.scopeId} items={state.items} sourceEnabled={preference.status === 'ready' && preference.enabled} t={t} format={format} onOpen={select} /> : null}
          {state.scopeStatus === 'ready' && (item
            ? <Detail key={`${state.scopeId}:${preference.enabled}:${item.symbol}`} item={item} useResource={useResource} t={t} format={format} scope={state.scopeId} locale={getLocale()} rpc={rpc} />
            : <div className="dxs-stage-empty"><h2>{t('page.select')}</h2><p className="dxs-muted">{t('page.select-hint')}</p><StockWorkbench key={state.scopeId} scope={state.scopeId} t={t} format={format} locale={getLocale()} rpc={rpc} /></div>)}
        </div>
      </div>
    </>}
    </div>
    {settingsOpen ? <SettingsPanel
      settings={settings}
      t={t}
      preference={preference}
      onSourceChange={changeSource}
      barHidden={state.barHidden}
      onSetBarVisible={setBarVisible}
      scopeReady={state.scopeStatus === 'ready'}
      onClose={() => setSettingsOpen(false)}
    /> : null}
  </main>
}
