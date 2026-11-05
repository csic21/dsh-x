import React, { useEffect, useRef, useState } from 'react'
import { StockWorkbench } from './workbench.tsx'
import { MarketView } from './market/MarketView.tsx'
import { HotView } from './market/HotView.tsx'
import { PredictView } from './market/PredictView.tsx'
import { GlobalView } from './market/GlobalView.tsx'
import { InstrumentLookup } from './SearchBox.tsx'
import { MAX_FIXED, MAX_WATCHLIST, fixedItems, marketOf, quoteStatus } from '../watchlist.ts'
import { fixedBarShortcutKeys, fixedBarShortcutLabel } from './shortcut.ts'
import { addressFor, fixedAddressFor, watchlistAddressFor } from './resource.ts'
import { errorKey } from './locales.ts'
import { useMarketPreference } from './market/data.ts'
import { SourceButton } from './source-button.tsx'
import { GoldView } from './gold/GoldView.tsx'
import { SettingsPanel } from './settings/SettingsPanel.tsx'
import { useFinanceSettings } from './settings/store.ts'
import { WatchSignals } from './watch-signals-view.tsx'
import { QuantScanView } from './quant-scan-view.tsx'
import { EtfHoldingsPanel } from './HoldingsPanel.tsx'
import { UsDetail } from './us/UsView.tsx'
import { HkDetail } from './hk/HkView.tsx'
import { isUsSymbol, normalizeUsCode, normalizeUsSymbol } from '../us-market.ts'
import { isHkSymbol, normalizeHkSymbol } from '../hk-market.ts'
import { FundamentalsPanel } from './FundamentalsPanel.tsx'
import { NewsPanel } from './news/NewsPanel.tsx'
import { isExchangeFund } from '../holdings.ts'
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
/**
 * The bottom bar and the rail mix boards now, so an overseas row has to say
 * which currency its number is in. A-share rows stay unstyled: CNY is the
 * default and a tag on every row would be noise.
 */
function currencyMark(symbol: any): string {
  try {
    const market = marketOf(symbol)
    return market === 'hk' ? 'HK$' : market === 'us' ? 'US$' : ''
  } catch { return '' }
}
function StockChip({ item, quote, snapshot, open, t, format }: any) {
  const status = quoteStatus(quote)
  return <button className="dxs-chip" onClick={() => open(item.symbol)} title={t('chip.title', { symbol: item.symbol, status: t(`status.${status}`) })}>
    <strong>{item.alias || quote?.name || item.symbol}</strong><span>{currencyMark(item.symbol)}{format.priceAt(quote?.price, quote?.pricePrecision)}</span>
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
function Detail({ item, previewing, onAdd, onToggleFixed, useResource, t, format, scope, locale, rpc, onOpenStock }: any) {
  const snapshot = useResource(addressFor(item.symbol)), quote = quoteFor(snapshot, item.symbol)
  const changeTone = tone(quote?.changePercent)
  // An ETF's periodic disclosure is a holdings book; a stock's is financials.
  // The two never share a tab, so the first screen is always the chart. News is
  // the third view on both: it is the only tab that can say why the price moved.
  const fund = isExchangeFund(item.symbol)
  const [tab, setTab] = useState<'chart' | 'holdings' | 'fundamentals' | 'news'>('chart')
  const article = useRef<HTMLElement>(null)
  const tabs: [typeof tab, string][] = fund
    ? [['chart', t('detail.tab.chart')], ['holdings', t('detail.tab.holdings')], ['news', t('news.tab')]]
    : [['chart', t('detail.tab.chart')], ['fundamentals', t('detail.tab.fundamentals')], ['news', t('news.tab')]]
  // The same detail instance follows the rail selection, so a reader comparing
  // filings keeps the Financials tab across stocks. A tab that the new
  // instrument does not have (an ETF has no financials) falls back to the chart.
  const activeTab = tabs.some(([key]) => key === tab) ? tab : 'chart'
  useEffect(() => { if (activeTab !== tab) setTab(activeTab) }, [item.symbol])
  const pick = (next: typeof tab) => {
    if (next === tab) return
    setTab(next)
    // The tab bar is sticky, so a switch can happen far down the previous
    // panel; bring the stock header back to the top instead of leaving the
    // reader in the middle of a chart or a table.
    article.current?.scrollIntoView?.({ block: 'start' })
  }
  return <article ref={article} aria-label={t('detail.aria', { symbol: item.symbol })}>
    <div className="dxs-detail-top">
      <section className="dxs-section dxs-instrument-summary">
        <div className="dxs-quote-identity">
          <h2>{item.alias || quote?.name || item.symbol}</h2>
          <p className="dxs-symbol-line"><span className="dxs-symbol">{item.symbol}</span>{item.alias ? t('detail.alias') : ''}{previewing ? t('detail.preview') : ''}
            {/* A preview is opened from the market and is not on the list yet;
                saving it is this one explicit, compact action. A saved row gets
                the same fixed/unfixed decision it has in the rail. */}
            {previewing && onAdd ? <button type="button" className="dxs-preview-add" onClick={onAdd} title={t('detail.preview.add-hint')}>{t('detail.preview.add-short')}</button> : null}
            {!previewing && onToggleFixed ? <button type="button" className="dxs-detail-fix" aria-pressed={Boolean(item.fixed)} onClick={onToggleFixed} title={t(item.fixed ? 'page.unfix-aria' : 'page.fix-aria', { symbol: item.symbol })}>{item.fixed ? t('detail.unfix') : t('detail.fix')}</button> : null}
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
      <nav className="dxs-detail-tabs" aria-label={t('detail.tabs.aria')}>
        {tabs.map(([key, label]) => <button key={key} type="button" aria-pressed={activeTab === key} onClick={() => pick(key)}>{label}</button>)}
      </nav>
    </div>
    {activeTab === 'chart' ? <StockWorkbench key={`${scope}:${item.symbol}`} symbol={item.symbol} scope={scope} t={t} format={format} locale={locale} rpc={rpc} />
      : activeTab === 'holdings' ? <EtfHoldingsPanel key={`holdings:${item.symbol}`} symbol={item.symbol} rpc={rpc} t={t} format={format} />
        : activeTab === 'fundamentals' ? <FundamentalsPanel key={`fundamentals:${item.symbol}`} symbol={item.symbol} rpc={rpc} t={t} format={format} />
          : <NewsPanel key={`news:${item.symbol}`} symbol={item.symbol} name={quote?.name || item.alias || item.symbol} rpc={rpc} t={t} format={format} onOpenStock={onOpenStock} />}
  </article>
}
/**
 * The watchlist rail is also the page's quote board: every saved row carries
 * the latest price and change, read through one batched resource so a ten-stock
 * list costs two requests, not ten. Adding is not duplicated here — the header
 * lookup is the single entry, and a picked stock is saved from its own page.
 */
function WatchRail({ items, selected, fixError, selectStock, move, toggleFix, remove, useResource, t, format, barHidden, toggleBar, showBarInDiscreet, discreet, appearance, quotesOff, setView }: any) {
  const snapshot = useResource(watchlistAddressFor(items.map((entry: any) => entry.symbol)))
  const quotes = new Map<string, any>((snapshot?.value?.quotes ?? []).map((quote: any) => [quote?.symbol, quote]))
  const newestQuote = [...quotes.values()].filter((quote: any) => Number.isFinite(Date.parse(quote?.quotedAt))).sort((left: any, right: any) => Date.parse(right.quotedAt) - Date.parse(left.quotedAt))[0]
  const newest = newestQuote ? Date.parse(newestQuote.quotedAt) : undefined
  const source = typeof snapshot?.value?.source === 'string' && snapshot.value.source ? snapshot.value.source : t('page.quote.no-source')
  const off = quotesOff || snapshot?.value?.status === 'unconfigured'
  const live = Boolean(newest && quoteStatus(newestQuote) === 'recent')
  const status = off
    ? t('page.quote.off')
    : snapshot?.status === 'loading'
      ? t('page.quote.loading')
      : snapshot?.status === 'failed'
        ? t('page.quote.failed')
        : `${t(live ? 'page.quote.live' : 'page.quote.recent', { source })}${newest ? ` · ${t('page.quote.updated', { time: format.clock(newest) })}` : ''}`
  return <aside className="dxs-rail" aria-label={t('page.manage')}>
    <header className="dxs-rail-head">
      <div className="dxs-rail-heading">
        <h2>{t('page.my-watchlist')}</h2>
        <p className="dxs-counts">{t('page.counts', { count: format.count(items.length), fixed: format.count(fixedItems(items).length), max: format.count(MAX_FIXED) })}</p>
      </div>
      {items.length ? <p className={`dxs-rail-quote${off ? ' is-off' : live ? '' : ' is-idle'}`} title={t('page.quote.hint')}>
        <span className="dxs-rail-dot" aria-hidden="true" />
        <span>{status}</span>
      </p> : null}
    </header>
    <div className="dxs-rail-list">
      {!items.length && <div className="dxs-empty"><p className="dxs-muted">{t('page.empty')}</p><p className="dxs-muted">{t('page.empty.lookup')}</p><button type="button" onClick={() => setView('market')}>{t('page.view.market-hint')}</button></div>}
      <ol className="dxs-list">{items.map((entry: any, index: any) => {
        const quote = quotes.get(entry.symbol)
        const changeTone = tone(quote?.changePercent)
        const price = quote?.price == null ? '—' : format.priceAt(quote.price, quote.pricePrecision)
        const change = quote?.price == null ? '—' : format.change(quote.changePercent)
        return <li key={entry.symbol} className={selected === entry.symbol ? 'is-selected' : undefined}>
          <button type="button" className="dxs-select" aria-pressed={selected === entry.symbol} title={t('chip.title', { symbol: entry.symbol, status: t(`status.${quoteStatus(quote)}`) })} onClick={() => selectStock(entry.symbol)}>
            <span className="dxs-row-name"><strong>{entry.alias || entry.symbol}</strong></span>
            <span className="dxs-row-meta">{entry.alias ? <span className="dxs-muted">{entry.symbol}</span> : null}</span>
            <span className={`dxs-row-quote ${changeTone}${quote?.price == null ? ' is-empty' : ''}`}>
              <span className="dxs-row-price">{price}</span>
              <span className="dxs-row-change">{change}</span>
            </span>
          </button>
          <div className="dxs-controls">
            <button type="button" className="dxs-icon-button" disabled={index === 0} aria-label={t('page.move-up', { symbol: entry.symbol })} onClick={() => move(entry.symbol, -1)}>↑</button>
            <button type="button" className="dxs-icon-button" disabled={index === items.length - 1} aria-label={t('page.move-down', { symbol: entry.symbol })} onClick={() => move(entry.symbol, 1)}>↓</button>
            <button type="button" className="dxs-icon-button" aria-pressed={entry.fixed} aria-label={t(entry.fixed ? 'page.unfix-aria' : 'page.fix-aria', { symbol: entry.symbol })} title={entry.fixed ? t('page.unfix') : t('page.fix')} onClick={() => toggleFix(entry)}>{entry.fixed ? '★' : '☆'}</button>
            <button type="button" className="dxs-icon-button dxs-remove" aria-label={t('page.remove-aria', { symbol: entry.symbol })} title={t('page.remove')} onClick={() => remove(entry.symbol)}>✕</button>
          </div>
        </li>
      })}</ol>
      {fixError && <p role="alert" className="dxs-error">{t(fixError, { max: format.count(MAX_FIXED) })}</p>}
    </div>
    <div className="dxs-rail-foot">
      <p className="dxs-bar-toggle">
        {discreet && !appearance.barInDiscreet
          ? <button type="button" onClick={showBarInDiscreet} title={t('page.bar-quiet-hint')}>{t('page.bar-quiet-show')}</button>
          : barHidden ? <button type="button" onClick={() => toggleBar()}>{t('page.bar-show')}</button> : <button type="button" onClick={() => toggleBar()}>{t('page.bar-hide')}</button>}
        <ShortcutHint t={t} />
      </p>
      <details className="dxs-fineprint">
        <summary>{t('page.notes')}</summary>
        {!quotesOff ? <p>{t('page.notice')}</p> : null}
        <p>{t('page.fixed-hint', { max: format.count(MAX_FIXED) })}</p>
      </details>
    </div>
  </aside>
}
export function StockPage({ useWatchlist, useResource, rpc, add, addMany, remove, move, select, preview, closePreview, setFixed, toggleBar, back, retryScope, settings, t, format, getLocale = () => 'en' }: any) {
  const state = useWatchlist((value: any) => value)
  const preference = useMarketPreference(rpc)
  const appearance = useFinanceSettings(settings)
  const discreet = appearance.discreet
  // A preview is what the reader is looking at right now, so it outranks the
  // saved row that happened to be selected before the drill-down. An overseas
  // lookup keeps its board and (for the US) its venue-qualified code here: the
  // watchlist store is A-share only and must not be asked to hold a `US.` or
  // `HK.` identity.
  const [overseasPreview, setOverseasPreview] = useState<any>(null)
  const previewItem = overseasPreview
    ? { symbol: overseasPreview.symbol, alias: overseasPreview.name, fixed: false, code: overseasPreview.code }
    : state.preview ? { symbol: state.preview.symbol, alias: state.preview.name, fixed: false } : null
  // A preview is a standalone detail page, not a watchlist row: it only opens
  // once storage is ready, because the detail reads saved chart preferences.
  const previewOpen = Boolean(previewItem) && state.scopeStatus === 'ready'
  const leavePreview = () => { setOverseasPreview(null); closePreview(); setDrillNotice('') }
  const selected = previewItem ? undefined : state.items.find((entry: any) => entry.symbol === state.selectedSymbol)
  const item = previewItem ?? selected ?? state.items[0]
  // Which detail belongs on screen. The rail, the bar and the lookup all feed
  // this one decision, so a saved overseas row opens the same view-only page a
  // lookup preview does instead of the A-share panels.
  const board = (() => {
    try { return item ? marketOf(item.symbol) : 'cn' } catch { return 'cn' }
  })()
  const [view, setView] = useState<'watchlist' | 'market' | 'quant-scan' | 'hot' | 'predict' | 'global' | 'gold'>('watchlist')
  // Switching a stock keeps the left rail in place but starts the detail at
  // its header, never halfway down the previous chart.
  const watchStage = useRef<HTMLDivElement>(null)
  useEffect(() => { watchStage.current?.scrollTo?.({ top: 0 }) }, [item?.symbol])
  const [fixError, setFixError] = useState('')
  const [drillNotice, setDrillNotice] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  // The source switch can be flipped from the drawer, so the market board is
  // remounted when it changes instead of waiting for its next poll.
  const [sourceRevision, setSourceRevision] = useState(0)
  const previousSelection = useRef(state.selectedSymbol)
  useEffect(() => {
    if (state.selectedSymbol && state.selectedSymbol !== previousSelection.current) { setView('watchlist'); setOverseasPreview(null) }
    previousSelection.current = state.selectedSymbol
  }, [state.selectedSymbol])
  // A rail row or a signal is always an A-share selection: it closes a US
  // preview even when the selected symbol itself does not change.
  const selectStock = (symbol: any) => { setOverseasPreview(null); select(symbol) }
  /**
   * Drill-down from the panorama: an exchange-qualified symbol opens the stock
   * detail and its daily chart. A stock that is not on the watchlist is opened
   * as a preview — nothing is written to the saved list until the reader adds
   * it on purpose, so clicking around the market never edits the watchlist.
   */
  const openStock = (symbol: any, name: any, code?: any) => {
    // A US listing is view-only: it never enters the A-share watchlist or the
    // bottom bar, so it lives in local preview state rather than the store.
    if (isUsSymbol(symbol)) {
      try {
        const canonical = normalizeUsSymbol(symbol)
        // A listing already on the list is selected, not previewed: opening a
        // saved row must never create a second, temporary copy of it.
        if (state.items.some((entry: any) => entry.symbol === canonical)) {
          setOverseasPreview(null)
          selectStock(canonical)
          setView('watchlist')
          setDrillNotice(t('market.drill.opened', { name: name || canonical }))
          return
        }
        setOverseasPreview({
          market: 'us',
          symbol: canonical,
          name: typeof name === 'string' ? name.slice(0, 64) : '',
          code: typeof code === 'string' ? normalizeUsCode(code, canonical) : undefined,
        })
        closePreview()
        setDrillNotice(t('us.drill.preview', { name: name || canonical }))
      } catch (failure: any) {
        setDrillNotice(errorKey(failure?.code))
      }
      return
    }
    // A Hong Kong listing is view-only for the same reason as a US one, and it
    // keeps its own board identity instead of entering the A-share store.
    if (isHkSymbol(symbol)) {
      try {
        const canonical = normalizeHkSymbol(symbol)
        if (state.items.some((entry: any) => entry.symbol === canonical)) {
          setOverseasPreview(null)
          selectStock(canonical)
          setView('watchlist')
          setDrillNotice(t('market.drill.opened', { name: name || canonical }))
          return
        }
        setOverseasPreview({
          market: 'hk',
          symbol: canonical,
          name: typeof name === 'string' ? name.slice(0, 64) : '',
        })
        closePreview()
        setDrillNotice(t('hk.drill.preview', { name: name || canonical }))
      } catch (failure: any) {
        setDrillNotice(errorKey(failure?.code))
      }
      return
    }
    if (typeof symbol !== 'string' || !/^(SH|SZ|BJ)\.\d{6}$/.test(symbol)) { setDrillNotice(t('market.drill.no-symbol')); return }
    setOverseasPreview(null)
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
      // The US venue code is saved with the row: without it the chart could
      // never be loaded again after a reload.
      add({ symbol: entry.symbol, alias: entry.alias, fixed: false, ...(entry.code ? { code: entry.code } : {}) })
      selectStock(entry.symbol)
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
      <InstrumentLookup rpc={rpc} t={t} refreshToken={sourceRevision} onPick={(match: any) => openStock(match.symbol, match.name, match.code)} />
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
      {board === 'us'
        ? <UsDetail key={`us-preview:${previewItem?.symbol}:${preference.enabled}:${sourceRevision}`} item={previewItem} previewing onAdd={state.items.length < MAX_WATCHLIST ? () => addPreview(previewItem) : undefined} t={t} format={format} locale={getLocale()} scope={state.scopeId} rpc={rpc} onOpenStock={openStock} />
        : board === 'hk'
          ? <HkDetail key={`hk-preview:${previewItem?.symbol}:${preference.enabled}:${sourceRevision}`} item={previewItem} previewing onAdd={state.items.length < MAX_WATCHLIST ? () => addPreview(previewItem) : undefined} t={t} format={format} locale={getLocale()} scope={state.scopeId} rpc={rpc} onOpenStock={openStock} />
          : <Detail key={`preview:${previewItem?.symbol}:${preference.enabled}`} item={previewItem} previewing onAdd={state.items.length < MAX_WATCHLIST ? () => addPreview(previewItem) : undefined} useResource={useResource} t={t} format={format} scope={state.scopeId} locale={getLocale()} rpc={rpc} onOpenStock={openStock} />}
    </div> : view === 'gold' ? <GoldView rpc={rpc} t={t} format={format} locale={getLocale()} preference={preference} /> : view === 'global' ? <div className="dxs-stage dxs-stage-market"><GlobalView key={`global:${sourceRevision}`} rpc={rpc} t={t} format={format} locale={getLocale()} preference={preference} onChangeSource={changeSource} /></div> : view === 'quant-scan' ? <div className="dxs-stage dxs-stage-market"><SourceButton preference={preference} t={t} /><QuantScanView rpc={rpc} scope={state.scopeStatus === 'ready' ? state.scopeId : null} sourceEnabled={preference.status === 'ready' && preference.enabled} t={t} format={format} onOpenStock={openStock} /></div> : view === 'hot' ? <div className="dxs-stage dxs-stage-market"><HotView rpc={rpc} t={t} format={format} onOpenStock={openStock} onAddMany={addMany} /><p className="dxs-muted dxs-stage-hint">{t('hot.drill.hint')}</p></div> : view === 'predict' ? <div className="dxs-stage dxs-stage-market"><PredictView rpc={rpc} t={t} format={format} onOpenStock={openStock} /><p className="dxs-muted dxs-stage-hint">{t('predict.drill.hint')}</p></div> : view === 'market' ? <div className="dxs-stage dxs-stage-market"><MarketView key={`market:${sourceRevision}`} rpc={rpc} t={t} format={format} locale={getLocale()} scope={state.scopeId} discreet={discreet} preference={preference} onChangeSource={changeSource} onOpenStock={openStock} /><p className="dxs-muted dxs-stage-hint">{t('market.drill.hint')}</p></div> : <>
      {sourceOff ? <div className="dxs-banner is-warn dxs-source-card"><div><strong>{t('source.off-title', { max: format.count(MAX_FIXED) })}</strong><p className="dxs-muted">{t('source.off-notice')}</p>{preference.status === 'error' ? <p role="alert" className="dxs-error">{t('source.unavailable')}</p> : null}</div><SourceButton preference={preference} t={t} large /></div> : preference.status === 'error' ? <p role="alert" className="dxs-banner dxs-error">{t('source.unavailable')}</p> : null}
      {state.placement === 'occupied' && <p role="status" className="dxs-banner">{t('page.occupied')}</p>}
      {state.barHidden && <p role="status" className="dxs-banner">{t('page.bar-hidden')} <button type="button" onClick={() => toggleBar()}>{t('page.bar-show')}</button></p>}
      {state.scopeStatus === 'loading' && <p role="status" className="dxs-banner">{t('page.scope-loading')}</p>}
      {state.scopeStatus === 'failed' && <p className="dxs-banner"><button onClick={retryScope}>{t('page.scope-retry')}</button></p>}
      {state.storageError && <p role="alert" className="dxs-banner dxs-error">{t(errorKey(state.storageError), { max: format.count(MAX_WATCHLIST) })}</p>}
      <div className="dxs-layout">
        <WatchRail
          key={`rail:${preference.enabled ? 'on' : 'off'}`}
          items={state.items}
          selected={item?.symbol}
          fixError={fixError}
          selectStock={selectStock}
          move={move}
          toggleFix={toggleFix}
          remove={remove}
          useResource={useResource}
          t={t}
          format={format}
          barHidden={state.barHidden}
          toggleBar={toggleBar}
          showBarInDiscreet={showBarInDiscreet}
          discreet={discreet}
          appearance={appearance}
          quotesOff={sourceOff}
          setView={setView}
        />
        <div className="dxs-stage" ref={watchStage}>
          {state.scopeStatus === 'ready' && state.items.length ? <WatchSignals key={state.scopeId} rpc={rpc} scope={state.scopeId} items={state.items.filter((entry: any) => { try { return marketOf(entry.symbol) === 'cn' } catch { return false } })} sourceEnabled={preference.status === 'ready' && preference.enabled} t={t} format={format} onOpen={selectStock} /> : null}
          {state.scopeStatus === 'ready' && (item
            ? board === 'us'
              ? <UsDetail key={`${state.scopeId}:us:${item.symbol}:${preference.enabled}`} item={item} fixed={item.fixed} onToggleFixed={() => toggleFix(item)} t={t} format={format} locale={getLocale()} scope={state.scopeId} rpc={rpc} onOpenStock={openStock} />
              : board === 'hk'
                ? <HkDetail key={`${state.scopeId}:hk:${item.symbol}:${preference.enabled}`} item={item} fixed={item.fixed} onToggleFixed={() => toggleFix(item)} t={t} format={format} locale={getLocale()} scope={state.scopeId} rpc={rpc} onOpenStock={openStock} />
                : <Detail key={`${state.scopeId}:${preference.enabled}`} item={item} onToggleFixed={() => toggleFix(item)} useResource={useResource} t={t} format={format} scope={state.scopeId} locale={getLocale()} rpc={rpc} onOpenStock={openStock} />
            : <div className="dxs-stage-empty dxs-start">
              <div className="dxs-start-card">
                <h2>{t('page.start.title')}</h2>
                <p>{t('page.start.body')}</p>
                <div className="dxs-start-actions">
                  <button type="button" className="dxs-primary" onClick={() => setView('market')}>{t(discreet ? 'settings.tab.market' : 'page.view.market-hint')}</button>
                  <button type="button" onClick={() => setView('hot')}>{t(discreet ? 'settings.tab.hot' : 'page.view.hot')}</button>
                </div>
              </div>
              <details className="dxs-start-local"><summary>{t('page.start.local')}</summary><StockWorkbench key={state.scopeId} scope={state.scopeId} t={t} format={format} locale={getLocale()} rpc={rpc} /></details>
            </div>)}
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
