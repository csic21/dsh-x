import React, { useMemo, useState } from 'react'
import { useNewsFeed } from './data.ts'
import { useMarketIntraday } from '../market/intraday.ts'
import { alignNews, newsAroundMove, sessionMoves, shanghaiClock, shanghaiDay } from './align.ts'
import { marketOf } from '../../watchlist.ts'

const tone = (value: any) => typeof value === 'number' && value > 0 ? 'dxs-up' : typeof value === 'number' && value < 0 ? 'dxs-down' : ''
const MAX_TAGS = 6

function marketOfSymbol(symbol: any): string {
  try { return marketOf(symbol) } catch { return 'cn' }
}

/**
 * One headline row. The clock column is the anchor: everything else (the price
 * at publish time, the move afterwards, the tagged symbols) is a fact tied to
 * that instant, and the row never claims more than that.
 */
function NewsRow({ entry, precision, today, t, format, onOpenStock, compact = false }: any) {
  const { item, clock, inSession, price, afterPrice, afterChangePercent } = entry
  const day = shanghaiDay(item.at)
  const past = day && day !== today
  return <li className={`dxs-news-item${compact ? ' is-compact' : ''}`}>
    <div className="dxs-news-clock">
      {past ? <span className="dxs-news-day">{day.slice(5)}</span> : null}
      <span>{clock ?? '—'}</span>
    </div>
    <div className="dxs-news-main">
      <p className="dxs-news-title">
        {item.url
          ? <a href={item.url} target="_blank" rel="noreferrer" title={t('news.item.open')}>{item.title}</a>
          : item.title}
      </p>
      {item.summary && !compact ? <p className="dxs-news-summary">{item.summary}</p> : null}
      <p className="dxs-news-meta">
        <span className="dxs-news-media">{item.media}</span>
        {inSession && typeof price === 'number' ? <span className="dxs-news-fact">{t('news.item.publish', { price: format.priceAt(price, precision) })}</span> : null}
        {inSession && typeof afterChangePercent === 'number' ? <span className={`dxs-news-fact ${tone(afterChangePercent)}`}>{t('news.item.after', { minutes: 30, price: format.priceAt(afterPrice, precision), change: format.change(afterChangePercent) })}</span> : null}
        {item.symbols.length && onOpenStock ? <span className="dxs-news-symbols">{item.symbols.slice(0, 3).map((ref: any) => <button key={ref.symbol} type="button" className="dxs-news-symbol" title={t('news.symbol.hint', { symbol: ref.symbol })} onClick={() => onOpenStock(ref.symbol, ref.name)}>{ref.name}</button>)}</span> : null}
      </p>
    </div>
  </li>
}

/** The session swings, each paired with the headlines published around it. */
function MoveBoard({ rows, precision, today, t, format, onOpenStock }: any) {
  return <section className="dxs-news-moves" aria-label={t('news.moves.title')}>
    <div className="dxs-news-moves-head">
      <h3>{t('news.moves.title')}</h3>
      <p className="dxs-muted">{t('news.moves.note')}</p>
    </div>
    {rows.length ? <ul className="dxs-news-moves-list">{rows.map(({ move, news }: any) => <li key={`${move.from}-${move.to}`}>
      <div className="dxs-news-move-head">
        <strong>{move.from}–{move.to}</strong>
        <span className={tone(move.changePercent)}>{t(move.changePercent < 0 ? 'news.moves.down' : 'news.moves.up')} {format.change(move.changePercent)}</span>
        <span className="dxs-muted">{news.length ? t('news.moves.count', { count: news.length }) : t('news.moves.none')}</span>
      </div>
      {news.length ? <ul className="dxs-news-move-news">{news.slice(0, 3).map((entry: any) => <NewsRow key={entry.item.id} entry={entry} precision={precision} today={today} t={t} format={format} onOpenStock={onOpenStock} compact />)}</ul> : null}
    </li>)}</ul> : <p className="dxs-muted">{t('news.moves.empty')}</p>}
  </section>
}

/**
 * News for one listing, with the option to read the market wire instead. The
 * panel is deliberately explicit about what it does not know: a headline's time
 * is not proof of cause, and an unofficial feed is not an exchange disclosure.
 */
export function NewsPanel({ symbol, name, rpc, t, format, onOpenStock }: any) {
  const [scope, setScope] = useState<'stock' | 'flash'>('stock')
  const market = marketOfSymbol(symbol)
  const stockRequest = useMemo(() => symbol && name ? { kind: 'stock' as const, symbol, name } : null, [symbol, name])
  const stock = useNewsFeed(rpc, scope === 'stock' ? stockRequest : null, { enabled: scope === 'stock' })
  const flash = useNewsFeed(rpc, scope === 'flash' ? { kind: 'flash' as const } : null, { enabled: scope === 'flash' })
  // Only the local A-share route has a minute line; asking for an overseas
  // symbol here would paint an error card over a perfectly good news list.
  const intraday = useMarketIntraday(rpc, scope === 'stock' && market === 'cn' ? symbol : null)
  const [tag, setTag] = useState('')
  const active = scope === 'stock' ? stock : flash
  const items = active.feed?.items ?? []
  const session = scope === 'stock' ? intraday.value : null
  const precision = session?.pricePrecision ?? 2
  const today = shanghaiDay(new Date().toISOString())
  const aligned = useMemo(() => alignNews(items, session), [items, session])
  const moveRows = useMemo(() => newsAroundMove(sessionMoves(session), aligned), [aligned, session])
  const showMoves = Boolean(session) && aligned.some((entry: any) => entry.inSession)
  // Filter chips come from the wire itself: no fixed taxonomy is imposed on the
  // upstream topic names, and a topic with no rows is never offered.
  const tags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of items) for (const value of item.tags) counts.set(value, (counts.get(value) ?? 0) + 1)
    return [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, MAX_TAGS).map(([value]) => value)
  }, [items])
  const visible = scope === 'flash' && tag ? items.filter((item: any) => item.tags.includes(tag)) : items
  const alignedById = useMemo(() => new Map<string, any>(aligned.map((entry: any) => [entry.item.id, entry])), [aligned])
  const updated = active.feed?.fetchedAt ? format.time(active.feed.fetchedAt, t) : ''
  return <section className="dxs-news" aria-label={t('news.title')}>
    <div className="dxs-news-head">
      <div className="dxs-view-tabs" role="group" aria-label={t('news.scope.aria')}>
        <button type="button" aria-pressed={scope === 'stock'} onClick={() => setScope('stock')}>{t('news.scope.stock')}</button>
        <button type="button" aria-pressed={scope === 'flash'} onClick={() => setScope('flash')}>{t('news.scope.flash')}</button>
      </div>
      <p className="dxs-news-source">
        {active.feed?.source ? t('news.source-value', { source: active.feed.source }) : null}
        {updated ? <span className="dxs-muted"> · {t('news.updated', { time: updated })}</span> : null}
      </p>
      <button type="button" className="dxs-news-refresh" onClick={active.refresh} disabled={active.refreshing}>{active.refreshing ? t('news.refreshing') : t('news.refresh')}</button>
    </div>
    {active.status === 'unconfigured'
      ? <div className="dxs-news-empty"><strong>{t('news.unconfigured-title')}</strong><p>{t('news.unconfigured')}</p></div>
      : active.status === 'error' && !active.feed
        ? <div className="dxs-news-empty" role="alert"><strong>{t('news.error')}</strong><button type="button" onClick={active.refresh}>{t('news.retry')}</button></div>
        : <>
          {active.status === 'loading' && !active.feed ? <p className="dxs-muted" role="status">{t('news.loading')}</p> : null}
          {active.feed?.partial ? <p className="dxs-news-partial" role="status">{t('news.partial')}</p> : null}
          {active.error && active.feed ? <p className="dxs-muted" role="status">{t('news.stale')}</p> : null}
          {showMoves ? <MoveBoard rows={moveRows} precision={precision} today={today} t={t} format={format} onOpenStock={onOpenStock} /> : null}
          {scope === 'flash' && tags.length ? <div className="dxs-news-filters" role="group" aria-label={t('news.filter.aria')}>
            <button type="button" aria-pressed={!tag} onClick={() => setTag('')}>{t('news.filter.all')}</button>
            {tags.map(value => <button key={value} type="button" aria-pressed={tag === value} onClick={() => setTag(tag === value ? '' : value)}>{value}</button>)}
          </div> : null}
          <div className="dxs-news-list-head">
            <h3>{t(scope === 'stock' ? 'news.list.title' : 'news.flash.title')}</h3>
            <span className="dxs-muted">{t('news.list.count', { count: format.count(visible.length) })}</span>
          </div>
          {visible.length
            ? <ol className="dxs-news-list">{visible.map((item: any) => <NewsRow key={item.id} entry={alignedById.get(item.id) ?? { item, clock: shanghaiClock(item.at), inSession: false, price: null, afterPrice: null, afterChangePercent: null }} precision={precision} today={today} t={t} format={format} onOpenStock={onOpenStock} />)}</ol>
            : active.status === 'loading' ? null : <div className="dxs-news-empty"><p>{t(scope === 'stock' ? 'news.empty.stock' : tag ? 'news.filter.empty' : 'news.empty.flash')}</p><p className="dxs-muted">{t('news.empty.hint')}</p></div>}
          {scope === 'flash' && visible.length ? <p className="dxs-muted dxs-news-note">{t('news.flash.note')}</p> : null}
        </>}
    <p className="dxs-news-boundary">{t('news.boundary')}</p>
  </section>
}
