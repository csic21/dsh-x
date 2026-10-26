import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { BoardDetail, MarketBreadth, MarketIndex, MarketOverview, MarketSector, MarketStock, TailScanWindow } from '../../market.ts'
import type { TailScanCandidate, TailScanResult } from '../../tail-scan.ts'
import { TAIL_SCAN_DEFAULT_WINDOW, TAIL_SCAN_WINDOWS, computeSentiment, marketClock } from '../../market.ts'
import type { ChangeTone, NestedGroup, TreemapRect } from './treemap.ts'
import { changeTone, layoutNested, squarify, tileSize } from './treemap.ts'
import { useBoardDetail, useMarketBreadth, useMarketOverview, useMarketPreference, useTailScan } from './data.ts'
import { MarketErrorCard, MarketUnconfigured, SourceSwitch } from './gate.tsx'
import { StockWorkbench } from '../workbench.tsx'

interface MarketViewProps {
  rpc: any
  t: (key: string, params?: Record<string, any>) => string
  format: any
  locale?: string
  now?: () => Date
  /** Drill down from the panorama into one stock's details and daily chart. */
  onOpenStock?: (symbol: string, name: string) => void
  /** Profile scope, used to remember chart display preferences only. */
  scope?: string
}

interface Selection {
  code: string
  name: string
}

interface GroupModel {
  key: string
  code: string
  name: string
  changePercent: number
  value: number
  children: {
    key: string
    code: string
    name: string
    changePercent: number
    value: number
    amount: number | null
    marketCap: number | null
    topStock: MarketSector['topStock']
  }[]
}

const GEO_WIDTH = 1000
const GEO_HEIGHT = 420
const STOCK_HEIGHT = 280

function useElementSize(fallbackWidth: number, fallbackHeight: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: fallbackWidth, height: fallbackHeight })
  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect
      if (rect && rect.width > 0 && rect.height > 0) setSize({ width: rect.width, height: rect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return { ref, size }
}

function position(rect: TreemapRect, width: number, height: number): React.CSSProperties {
  return {
    left: `${(rect.x / width) * 100}%`,
    top: `${(rect.y / height) * 100}%`,
    width: `${(rect.width / width) * 100}%`,
    height: `${(rect.height / height) * 100}%`,
  }
}

const changeClass = (value: number) => changeTone(value)
const TILE_COLORS: Record<ChangeTone, string> = {
  flat: '#5b636b',
  'up-1': '#6e3941', 'up-2': '#843a45', 'up-3': '#9c3b48', 'up-4': '#b63a49', 'up-5': '#cf3445',
  'down-1': '#2c5a4a', 'down-2': '#296b55', 'down-3': '#247c60', 'down-4': '#1d8b69', 'down-5': '#159b73',
}
const tileColor = (value: number) => TILE_COLORS[changeClass(value)]
const textTone = (value: number | null | undefined) => typeof value === 'number' && value > 0 ? 'dxs-up' : typeof value === 'number' && value < 0 ? 'dxs-down' : ''

function Kpi({ label, value, note, tone, children }: any) {
  return <div className="dxs-mkt-kpi">
    <div className="dxs-mkt-kpi-label">{label}</div>
    <div className={`dxs-mkt-kpi-value ${tone ?? ''}`}>{value}</div>
    {note ? <div className="dxs-mkt-kpi-note">{note}</div> : null}
    {children}
  </div>
}

function statusKey(clock: ReturnType<typeof marketClock> | null): string {
  if (!clock) return 'market.status.no-quote'
  if (clock.phase === 'weekend') return 'market.status.weekend'
  if (clock.phase === 'preopen') return 'market.status.preopen'
  if (!clock.quoteToday) return 'market.status.no-quote'
  return `market.status.${clock.phase}`
}

function MarketStatus({ quotedAt, now, t, format, showTime = true }: any) {
  const clock = marketClock(now(), quotedAt)
  const live = clock.quoteToday && clock.phase === 'open' && !clock.stale
  return <div className={`dxs-mkt-status ${live ? 'is-live' : 'is-closed'}`} title={t('market.status.hint')}>
    <span className="dxs-mkt-dot" aria-hidden="true" />
    <strong>{t(statusKey(clock))}</strong>
    {showTime && quotedAt ? <span>{t('market.quote-time', { time: format.time(quotedAt, t) })}</span> : null}
    {clock.quoteToday && clock.stale && (clock.phase === 'open' || clock.phase === 'auction') ? <span className="dxs-mkt-warn">{t('market.stale')}</span> : null}
  </div>
}

function SentimentPanel({ data, breadth, t, format }: any) {
  const sentiment = useMemo(() => data ? computeSentiment({
    indexChanges: data.indices.filter((index: MarketIndex) => !index.code.startsWith('HK.')).map((index: MarketIndex) => index.changePercent),
    breadth: breadth ? { up: breadth.up, down: breadth.down, flat: breadth.flat } : null,
    sectorChanges: data.sectors.filter((sector: MarketSector) => sector.level === 1).map((sector: MarketSector) => sector.changePercent),
  }) : null, [data, breadth])
  if (!sentiment) return <section className="dxs-mkt-card"><h3>{t('market.sentiment.title')}</h3><p className="dxs-mkt-muted">{t('market.breadth.empty')}</p></section>
  return <section className="dxs-mkt-card dxs-mkt-sentiment">
    <header className="dxs-mkt-card-head">
      <div><h3>{t('market.sentiment.title')}</h3><p>{t('market.sentiment.subtitle')}</p></div>
      <div className={`dxs-mkt-sentiment-score ${sentiment.score >= 56 ? 'dxs-up' : sentiment.score <= 44 ? 'dxs-down' : ''}`}>
        <strong>{format.count(sentiment.score)}</strong>
        <span>{t(`market.sentiment.label.${sentiment.label}`)}</span>
      </div>
    </header>
    <div className="dxs-mkt-gauge" role="img" aria-label={`${format.count(sentiment.score)} · ${t(`market.sentiment.label.${sentiment.label}`)}`}>
      <div className="dxs-mkt-gauge-track"><span style={{ left: `${Math.max(0, Math.min(100, sentiment.score))}%` }} /></div>
      <div className="dxs-mkt-gauge-labels"><span>{t('market.sentiment.fear')}</span><span>{t('market.sentiment.label.neutral')}</span><span>{t('market.sentiment.greed')}</span></div>
    </div>
    <div className="dxs-mkt-factors">
      {sentiment.factors.map(factor => <div className="dxs-mkt-factor" key={factor.key}>
        <span>{t(`market.sentiment.factor.${factor.key}`)}</span>
        <strong>{format.count(factor.score)}</strong>
        <span className="dxs-mkt-factor-weight">{format.count(Math.round(factor.weight * 100))}%</span>
        <div className="dxs-mkt-factor-bar" aria-hidden="true"><i className={factor.score >= 50 ? 'is-up' : 'is-down'} style={{ width: `${factor.score}%` }} /></div>
      </div>)}
    </div>
    <p className="dxs-mkt-muted">{t('market.sentiment.weights')}</p>
    <p className="dxs-mkt-muted">{t('market.sentiment.method')}</p>
    {sentiment.partial ? <p className="dxs-mkt-note">{t('market.sentiment.waiting')}</p> : null}
  </section>
}

function IndexCard({ index, t, format, onOpen }: any) {
  const high = Number.isFinite(index.high) ? index.high : null
  const low = Number.isFinite(index.low) ? index.low : null
  const marker = high !== null && low !== null && high > low ? Math.max(0, Math.min(100, ((index.price - low) / (high - low)) * 100)) : null
  const tone = textTone(index.changePercent)
  // The whole card is the target, not only the small name/code link: a reader
  // naturally clicks the big number. There is no nested button, so the card can
  // carry the button role without invalid interactive nesting.
  const open = typeof onOpen === 'function' ? () => onOpen(index.code, index.name) : undefined
  return <article
    className={`dxs-mkt-index ${open ? 'is-clickable' : ''}`}
    role={open ? 'button' : undefined}
    tabIndex={open ? 0 : undefined}
    aria-label={open ? t('market.drill.index-title', { name: index.name }) : undefined}
    onClick={open}
    onKeyDown={open ? (event: any) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open() }
    } : undefined}
  >
    <header><div><h4>{index.name}</h4><span>{index.code}</span></div><span className={`dxs-mkt-change ${tone}`}>{format.change(index.changePercent)}</span></header>
    <div className={`dxs-mkt-index-price ${tone}`}>{format.price(index.price)}</div>
    <div className="dxs-mkt-index-sub"><span className={tone}>{format.signed(index.change)}</span><span>{index.amount !== null ? t('market.indices.amount', { amount: format.compact(index.amount) }) : '—'}</span></div>
    {marker !== null ? <div className="dxs-mkt-range" role="img" aria-label={t('market.indices.range')}>
      <div className="dxs-mkt-range-track"><span style={{ left: `${marker}%` }} /></div>
      <div className="dxs-mkt-range-labels"><span>{t('market.indices.low', { value: format.price(low) })}</span><span>{t('market.indices.high', { value: format.price(high) })}</span></div>
    </div> : null}
    <dl className="dxs-mkt-ohlc">
      <div><dt>{t('market.indices.open-label')}</dt><dd>{format.price(index.open)}</dd></div>
      <div><dt>{t('market.indices.previous-label')}</dt><dd>{format.price(index.previousClose)}</dd></div>
    </dl>
    <footer>
      <span>{t('market.quote-time', { time: index.code.startsWith('HK.') ? format.zoneTime(index.quotedAt, 'Asia/Hong_Kong', t) : format.time(index.quotedAt, t) })}</span>
      {open ? <span className="dxs-mkt-index-open">{t('market.drill.open-chart')} →</span> : null}
    </footer>
  </article>
}

function buildGroups(sectors: MarketSector[], t: any): GroupModel[] {
  const level1 = sectors.filter(sector => sector.level === 1)
  const level2 = sectors.filter(sector => sector.level === 2)
  const groups = new Map<string, GroupModel>()
  for (const sector of level1) {
    groups.set(sector.code, {
      key: sector.code, code: sector.code, name: sector.name, changePercent: sector.changePercent,
      value: sector.marketCap ?? sector.amount ?? 1, children: [],
    })
  }
  const other: GroupModel = {
    key: 'other', code: '', name: t('market.heatmap.other'), changePercent: 0, value: 0, children: [],
  }
  for (const sector of level2) {
    const parent = sector.parent && groups.get(sector.parent) ? groups.get(sector.parent)! : other
    parent.children.push({
      key: sector.code, code: sector.code, name: sector.name, changePercent: sector.changePercent,
      value: sector.marketCap ?? sector.amount ?? 1, amount: sector.amount, marketCap: sector.marketCap, topStock: sector.topStock,
    })
  }
  if (other.children.length) {
    other.value = other.children.reduce((sum, child) => sum + child.value, 0) || 1
    other.changePercent = other.children.reduce((sum, child) => sum + child.changePercent, 0) / other.children.length
    groups.set(other.key, other)
  }
  for (const group of groups.values()) {
    if (!group.children.length) group.value = group.value || 1
    else if (group.value <= 1) {
      const childTotal = group.children.reduce((sum, child) => sum + child.value, 0)
      if (childTotal > 0) group.value = childTotal
    }
  }
  return [...groups.values()]
}

function Heatmap({ data, selected, onSelect, t, format }: any) {
  const groups = useMemo(() => buildGroups(data.sectors, t), [data.sectors, t])
  const { ref, size } = useElementSize(GEO_WIDTH, GEO_HEIGHT)
  const layout = useMemo(() => layoutNested(groups.map(group => ({
    key: group.key, value: group.value, children: group.children.map(child => ({ key: child.key, value: child.value })),
  })), size.width, size.height), [groups, size])
  const byGroup = new Map(groups.map(group => [group.key, group]))
  const byChild = new Map(groups.flatMap(group => group.children.map(child => [child.key, child])))
  const level2Count = groups.reduce((sum, group) => sum + group.children.length, 0)
  return <section className="dxs-mkt-card dxs-mkt-heatmap">
    <header className="dxs-mkt-card-head">
      <div>
        <h3>{t('market.heatmap.title')}</h3>
        <p>{t('market.heatmap.subtitle', { level1: format.count(groups.filter(group => group.code).length), level2: format.count(level2Count) })}</p>
      </div>
      <div className="dxs-mkt-legend" aria-label={t('market.heatmap.legend')}>
        <span>{t('market.heatmap.legend')}</span>
        <i style={{ background: TILE_COLORS['down-5'] }} /><i style={{ background: TILE_COLORS['down-3'] }} /><i style={{ background: TILE_COLORS.flat }} /><i style={{ background: TILE_COLORS['up-3'] }} /><i style={{ background: TILE_COLORS['up-5'] }} />
      </div>
    </header>
    <div className="dxs-mkt-map" ref={ref} role="group" aria-label={t('market.heatmap.aria')}>
      {layout.map((group: NestedGroup) => {
        const model = byGroup.get(group.key)
        if (!model) return null
        const selectedGroup = Boolean(selected && selected.code === model.code)
        return <React.Fragment key={group.key}>
          <div className={`dxs-mkt-group-box ${selectedGroup ? 'is-selected' : ''}`} style={position(group, size.width, size.height)} aria-hidden="true" />
          {group.headerHeight > 0 ? <button
            type="button"
            className={`dxs-mkt-group-label ${changeClass(model.changePercent)} ${selectedGroup ? 'is-selected' : ''}`}
            style={{ ...position({ ...group, height: group.headerHeight }, size.width, size.height), width: `${(group.width / size.width) * 100}%`, background: tileColor(model.changePercent) }}
            onClick={() => model.code && onSelect({ code: model.code, name: model.name })}
            disabled={!model.code}
            aria-label={t('market.heatmap.group', { name: model.name, change: format.change(model.changePercent) })}
            title={t('market.heatmap.group', { name: model.name, change: format.change(model.changePercent) })}
          ><span>{model.name}</span><span>{format.change(model.changePercent)}</span></button> : null}
          {group.children.map(child => {
            const item = byChild.get(child.key)
            if (!item) return null
            const sizeClass = tileSize(child)
            const showName = child.width >= 38 && child.height >= 15
            const showPct = child.width >= 48 && child.height >= 28
            const active = Boolean(selected && selected.code === item.code)
            return <button
              type="button"
              key={child.key}
              className={`dxs-mkt-tile ${changeClass(item.changePercent)} size-${sizeClass} ${active ? 'is-selected' : ''}`}
              style={{ ...position(child, size.width, size.height), background: tileColor(item.changePercent) }}
              aria-pressed={active}
              aria-label={t('market.heatmap.tile', { name: item.name, change: format.change(item.changePercent), amount: item.amount !== null ? format.compact(item.amount) : '—' })}
              title={t('market.heatmap.tile', { name: item.name, change: format.change(item.changePercent), amount: item.amount !== null ? format.compact(item.amount) : '—' })}
              onClick={() => onSelect({ code: item.code, name: item.name })}
            >
              {showName ? <span className="dxs-mkt-tile-name">{item.name}</span> : null}
              {showPct ? <span className="dxs-mkt-tile-pct">{format.change(item.changePercent)}</span> : null}
              {sizeClass === 'xl' && item.topStock ? <span className="dxs-mkt-tile-leader">{item.topStock.name} {format.change(item.topStock.changePercent)}</span> : null}
              {sizeClass === 'xl' && item.amount !== null ? <span className="dxs-mkt-tile-amount">{t('market.movers.turnover')} {format.compact(item.amount)}</span> : null}
            </button>
          })}
        </React.Fragment>
      })}
    </div>
    <p className="dxs-mkt-muted">{t('market.heatmap.hint')}</p>
    <details className="dxs-mkt-table-details">
      <summary>{t('market.heatmap.table')}</summary>
      <div className="dxs-mkt-table-wrap">
        <table>
          <caption>{t('market.heatmap.table-caption')}</caption>
          <thead><tr><th>{t('market.heatmap.table.name')}</th><th>{t('market.heatmap.table.change')}</th><th>{t('market.heatmap.table.amount')}</th><th>{t('market.heatmap.table.cap')}</th><th>{t('market.heatmap.table.leader')}</th></tr></thead>
          <tbody>{groups.flatMap(group => group.children.length ? group.children.map(child => <tr key={child.code}>
            <td>{child.name}<small>{group.name}</small></td>
            <td className={textTone(child.changePercent)}>{format.change(child.changePercent)}</td>
            <td>{child.amount !== null ? format.compact(child.amount) : '—'}</td>
            <td>{child.marketCap !== null ? format.compact(child.marketCap) : '—'}</td>
            <td>{child.topStock ? `${child.topStock.name} ${format.change(child.topStock.changePercent)}` : '—'}</td>
          </tr>) : [])}</tbody>
        </table>
      </div>
    </details>
  </section>
}

function bucketLabel(bucket: MarketBreadth['distribution'][number], t: any) {
  if (bucket.from === null && bucket.to !== null) return t('market.breadth.bucket.lt', { to: bucket.to })
  if (bucket.to === null && bucket.from !== null) return t('market.breadth.bucket.gt', { from: bucket.from })
  if (bucket.from === 0 && bucket.to === 0) return t('market.breadth.bucket.zero')
  return t('market.breadth.bucket', { from: bucket.from, to: bucket.to })
}

function DistributionBar({ breadth, t, format }: any) {
  const max = Math.max(1, ...breadth.distribution.map((bucket: any) => bucket.count))
  const total = Math.max(1, breadth.up + breadth.down + breadth.flat)
  const tone = (bucket: any) => bucket.from !== null && bucket.from < 0 ? 'is-down' : bucket.from === 0 && bucket.to === 0 ? 'is-flat' : 'is-up'
  return <section className="dxs-mkt-card dxs-mkt-breadth">
    <header className="dxs-mkt-card-head">
      <div><h3>{t('market.breadth.title')}</h3><p>{t('market.breadth.subtitle', { covered: format.count(breadth.covered), expected: format.count(breadth.expected) })}</p></div>
      <div className={`dxs-mkt-change ${breadth.up >= breadth.down ? 'dxs-up' : 'dxs-down'}`}>{t('market.breadth.up-share', { value: format.percent((breadth.up / total) * 100) })}</div>
    </header>
    <div className="dxs-mkt-breadth-totals">
      <div><strong className="dxs-up">{format.count(breadth.up)}</strong><span>{t('market.breadth.up')}</span></div>
      <div><strong className="dxs-down">{format.count(breadth.down)}</strong><span>{t('market.breadth.down')}</span></div>
      <div><strong>{format.count(breadth.flat)}</strong><span>{t('market.breadth.flat')}</span></div>
      <div><strong>{format.compact(breadth.amount)}</strong><span>{t('market.kpi.amount')}</span></div>
    </div>
    <div className="dxs-mkt-stack" role="img" aria-label={`${t('market.breadth.up')} ${breadth.up} · ${t('market.breadth.down')} ${breadth.down} · ${t('market.breadth.flat')} ${breadth.flat}`}>
      <span className="is-up" style={{ width: `${(breadth.up / total) * 100}%` }} />
      <span className="is-flat" style={{ width: `${(breadth.flat / total) * 100}%` }} />
      <span className="is-down" style={{ width: `${(breadth.down / total) * 100}%` }} />
    </div>
    <div className="dxs-mkt-distribution" aria-hidden="true">
      {breadth.distribution.map((bucket: any) => <div className={`dxs-mkt-bucket ${tone(bucket)}`} key={`${bucket.from}-${bucket.to}`}>
        <span className="dxs-mkt-bucket-count">{bucket.count ? format.count(bucket.count) : ''}</span>
        <i style={{ height: `${Math.max(2, (bucket.count / max) * 100)}%` }} />
      </div>)}
    </div>
    <div className="dxs-mkt-muted dxs-mkt-bucket-labels" aria-hidden="true">{breadth.distribution.map((bucket: any) => <span key={`${bucket.from}-${bucket.to}`}>{bucketLabel(bucket, t)}</span>)}</div>
    <details className="dxs-mkt-table-details">
      <summary>{t('market.breadth.table')}</summary>
      <div className="dxs-mkt-table-wrap"><table>
        <caption>{t('market.breadth.title')}</caption>
        <thead><tr><th>{t('market.breadth.range')}</th><th>{t('market.breadth.count')}</th></tr></thead>
        <tbody>{breadth.distribution.map((bucket: any) => <tr key={`${bucket.from}-${bucket.to}`}><td>{bucketLabel(bucket, t)}</td><td>{format.count(bucket.count)}</td></tr>)}</tbody>
      </table></div>
    </details>
    {breadth.partial ? <p className="dxs-mkt-note">{t('market.partial', { covered: format.count(breadth.covered), expected: format.count(breadth.expected) })}</p> : null}
    <p className="dxs-mkt-muted">{t('market.breadth.suspended', { count: format.count(breadth.suspended) })}</p>
  </section>
}

function StockTable({ stocks, t, format, caption, onOpen }: any) {
  if (!stocks.length) return <p className="dxs-mkt-muted">{t('market.movers.empty')}</p>
  return <div className="dxs-mkt-table-wrap"><table>
    <caption>{caption}</caption>
    <thead><tr><th>{t('market.movers.name')}</th><th>{t('market.movers.price')}</th><th>{t('market.movers.change')}</th><th>{t('market.movers.turnover')}</th></tr></thead>
    <tbody>{stocks.map((stock: MarketStock) => <tr key={stock.code} className={onOpen ? 'is-drillable' : undefined}>
      <td>{onOpen
        ? <button type="button" className="dxs-mkt-link" onClick={() => onOpen(stock.code, stock.name)} title={t('market.drill.title', { name: stock.name })}><span>{stock.name}</span><small>{stock.code}</small></button>
        : <><span>{stock.name}</span><small>{stock.code}</small></>}
      </td>
      <td>{format.price(stock.price)}</td>
      <td className={textTone(stock.changePercent)}>{format.change(stock.changePercent)}</td>
      <td>{format.compact(stock.amount)}</td>
    </tr>)}</tbody>
  </table></div>
}

function Movers({ breadth, t, format, onOpen }: any) {
  return <section className="dxs-mkt-movers-grid">
    <div className="dxs-mkt-card"><header className="dxs-mkt-card-head"><div><h3>{t('market.movers.title')}</h3><p>{t('market.movers.subtitle')}</p></div></header><StockTable stocks={breadth.topGainers} t={t} format={format} caption={t('market.movers.title')} onOpen={onOpen} /></div>
    <div className="dxs-mkt-card"><header className="dxs-mkt-card-head"><div><h3>{t('market.movers.losers')}</h3><p>{t('market.movers.subtitle')}</p></div></header><StockTable stocks={breadth.topLosers} t={t} format={format} caption={t('market.movers.losers')} onOpen={onOpen} /></div>
    <div className="dxs-mkt-card"><header className="dxs-mkt-card-head"><div><h3>{t('market.movers.amount')}</h3><p>{t('market.movers.subtitle')}</p></div></header><StockTable stocks={breadth.topAmount} t={t} format={format} caption={t('market.movers.amount')} onOpen={onOpen} /></div>
  </section>
}

function TailScanPanel({ rpc, t, format, onOpenStock }: any) {
  const scan = useTailScan(rpc)
  // The window is a local choice: one scan describes one session tail, so a
  // result from the other window is never relabelled or reused.
  const [tailWindow, setTailWindow] = useState<TailScanWindow>(TAIL_SCAN_DEFAULT_WINDOW)
  const [consecutiveOnly, setConsecutiveOnly] = useState(false)
  const result: TailScanResult | null = scan.value
  const shown = result && result.window === tailWindow ? result : null
  const streakOf = (candidate: TailScanCandidate) => Math.max(
    candidate.daily?.volumeExpansionDownStreak ?? 0,
    candidate.daily?.volumeDeclineStreak ?? 0,
  )
  const consecutiveCount = shown?.candidates.filter(candidate => candidate.flags.consecutive).length ?? 0
  const rows = shown ? shown.candidates.filter(candidate => !consecutiveOnly || candidate.flags.consecutive) : []
  const sessionLabel = shown?.sessionDate
    ? t(shown.sessionIsToday ? 'tail.session' : 'tail.session-last', { date: shown.sessionDate })
    : ''
  const pick = (next: TailScanWindow) => {
    if (next === tailWindow) return
    setTailWindow(next)
    setConsecutiveOnly(false)
  }
  return <section className="dxs-mkt-card dxs-tail" aria-labelledby="dxs-tail-title">
    <header className="dxs-mkt-card-head">
      <div>
        <h3 id="dxs-tail-title">{t('tail.title')}</h3>
        <p>{t(`tail.subtitle.${tailWindow}`)}</p>
        <div className="dxs-tail-windows" role="group" aria-label={t('tail.window-group')}>
          {TAIL_SCAN_WINDOWS.map(option => <button
            key={option}
            type="button"
            aria-pressed={tailWindow === option}
            onClick={() => pick(option)}
          >{t(`tail.window.${option}`)}</button>)}
        </div>
      </div>
      <div className="dxs-tail-actions">
        {shown ? <span className="dxs-mkt-updated">{t('tail.scanned-at', { time: format.time(shown.fetchedAt, t) })}</span> : null}
        <button type="button" className="dxs-tail-run" onClick={() => { void scan.run(tailWindow) }} disabled={scan.running}>
          {scan.running ? t('tail.running') : shown ? t('tail.rerun') : t('tail.run')}
        </button>
      </div>
    </header>
    {/* A result for the other window is never displayed here, including one
        that lands after the user switched sessions mid-scan: the panel falls
        back to the idle hint instead of going blank. */}
    {!shown && scan.status === 'unconfigured' ? <p className="dxs-mkt-muted">{t('tail.unconfigured')}</p> : null}
    {!shown && (scan.status === 'loading' || scan.running) ? <p role="status" className="dxs-tail-loading"><span className="dxs-mkt-dot is-live" />{t('tail.loading')}</p> : null}
    {!shown && scan.status === 'error' ? <p role="alert" className="dxs-mkt-error">{t('tail.error')} <button type="button" onClick={() => { void scan.run(tailWindow) }}>{t('market.retry')}</button></p> : null}
    {!shown && !scan.running && scan.status !== 'loading' && scan.status !== 'unconfigured' && scan.status !== 'error'
      ? <p className="dxs-mkt-muted">{t('tail.idle')}</p> : null}
    {shown ? <>
      <div className="dxs-tail-summary">
        <span>{sessionLabel}</span>
        <span>{t('tail.summary', {
          screened: format.count(shown.universe.screened),
          confirmed: format.count(shown.universe.tailConfirmed),
          consecutive: format.count(consecutiveCount),
        })}</span>
        <span>{t('tail.coverage', { covered: format.count(shown.universe.covered), expected: format.count(shown.universe.expected) })}</span>
        <span>{t('tail.source')}: {shown.source}</span>
      </div>
      {!shown.complete ? <p className="dxs-mkt-note">{t('tail.incomplete', { start: shown.windowStart, end: shown.windowEnd })}</p> : null}
      {shown.universe.partial ? <p className="dxs-mkt-note">{t('tail.partial', {
        intraday: format.count(shown.universe.failedIntraday),
        history: format.count(shown.universe.failedHistory),
      })}</p> : null}
      <div className="dxs-tail-controls">
        <label><input type="checkbox" checked={consecutiveOnly} onChange={event => setConsecutiveOnly(event.target.checked)} />{t('tail.filter-consecutive')}</label>
        <span className="dxs-mkt-muted">{t('tail.score-note')}</span>
      </div>
      {rows.length ? <div className="dxs-mkt-table-wrap dxs-tail-table"><table>
        <caption>{sessionLabel}</caption>
        <thead><tr>
          <th>{t('tail.col.rank')}</th>
          <th>{t('tail.col.stock')}</th>
          <th>{t('tail.col.change')}</th>
          <th>{t('tail.col.amount')}</th>
          <th>{t('tail.col.tail')}</th>
          <th>{t('tail.col.tail-ratio')}</th>
          <th>{t('tail.col.volume-ratio')}</th>
          <th>{t('tail.col.streak')}</th>
          <th>{t('tail.col.rsi')}</th>
          <th>{t('tail.col.ma20')}</th>
          <th>{t('tail.col.score')}</th>
          <th>{t('tail.col.quant')}</th>
        </tr></thead>
        <tbody>{rows.map((candidate, index) => {
          const daily = candidate.daily
          const quant = candidate.quant
          const streak = streakOf(candidate)
          const tailTone = candidate.tail.tailReturn === null ? '' : candidate.tail.tailReturn > 0 ? 'dxs-up' : candidate.tail.tailReturn < 0 ? 'dxs-down' : ''
          return <tr key={candidate.symbol} className={candidate.flags.consecutive ? 'is-consecutive' : undefined}>
            <td>{format.count(index + 1)}</td>
            <td>
              {onOpenStock
                ? <button type="button" className="dxs-mkt-link" onClick={() => onOpenStock(candidate.symbol, candidate.name)} title={t('market.drill.title', { name: candidate.name })}><span>{candidate.name}</span><small>{candidate.symbol}</small></button>
                : <><span>{candidate.name}</span><small>{candidate.symbol}</small></>}
              <div className="dxs-tail-badges">
                {candidate.flags.consecutive ? <span className="dxs-tail-badge is-consecutive">{t('tail.badge-consecutive')}</span> : null}
                {candidate.flags.tailDump ? <span className="dxs-tail-badge">{t('tail.badge-tail')}</span> : null}
              </div>
            </td>
            <td className={textTone(candidate.changePercent)}>{format.change(candidate.changePercent)}</td>
            <td>{format.compact(candidate.amount)}<small>{candidate.turnoverPercent == null ? '—' : `${format.ratio(candidate.turnoverPercent)}%`}</small></td>
            <td className={tailTone}>{candidate.tail.tailReturn === null ? '—' : format.change(candidate.tail.tailReturn * 100)}</td>
            <td>{format.ratio(candidate.tail.tailVolumeRatio)}</td>
            <td>{format.ratio(daily?.volumeRatio5 ?? null)}</td>
            <td>{streak ? t('tail.streak-value', { count: format.count(streak) }) : '—'}</td>
            <td>{format.ratio(quant?.rsi14 ?? null)}</td>
            <td className={textTone(quant?.priceVsMa20 ?? null)}>{quant?.priceVsMa20 == null ? '—' : format.change(quant.priceVsMa20 * 100)}</td>
            <td><strong>{format.count(candidate.score)}</strong></td>
            <td>{onOpenStock ? <button type="button" className="dxs-mkt-drill" onClick={() => onOpenStock(candidate.symbol, candidate.name)}>{t('tail.open-quant')}</button> : '—'}</td>
          </tr>
        })}</tbody>
      </table></div> : <p className="dxs-mkt-muted">{consecutiveOnly ? t('tail.empty-filter') : t('tail.empty')}</p>}
      <details className="dxs-tail-method">
        <summary>{t('tail.definition')}</summary>
        <p>{t('tail.definition-body', {
          start: shown.windowStart,
          end: shown.windowEnd,
          baseline: t(`tail.baseline.${shown.window}`),
        })}</p>
        <p>{t('tail.score-body')}</p>
      </details>
      <p className="dxs-mkt-muted">{t('tail.quant-hint')}</p>
      <p className="dxs-mkt-muted">{t('tail.limit')}</p>
    </> : null}
  </section>
}

function SectorDetail({ rpc, selection, onClose, t, format, onOpen }: any) {
  const detail = useBoardDetail(rpc, selection.code)
  const [active, setActive] = useState<string | null>(null)
  const { ref, size } = useElementSize(GEO_WIDTH, STOCK_HEIGHT)
  const board: BoardDetail | null = detail.value
  const tiles = useMemo(() => {
    if (!board) return []
    return squarify(board.stocks.map(stock => ({ key: stock.code, value: stock.marketCap ?? stock.amount ?? 1 })), 0, 0, size.width, size.height)
  }, [board, size])
  const stocks = new Map((board?.stocks ?? []).map(stock => [stock.code, stock]))
  return <section className="dxs-mkt-card dxs-mkt-detail" aria-live="polite">
    <header className="dxs-mkt-card-head">
      <div><h3>{t('market.detail.title')}</h3><p>{t('market.detail.subtitle', { name: board?.name ?? selection.name, code: selection.code })}</p></div>
      <button type="button" onClick={onClose}>{t('market.detail.close')}</button>
    </header>
    {detail.status === 'loading' && !board ? <p role="status" className="dxs-mkt-muted">{t('market.detail.loading')}</p> : null}
    {detail.status === 'error' && !board ? <p role="alert" className="dxs-mkt-error">{t('market.detail.error')} <button type="button" onClick={detail.refresh}>{t('market.detail.retry')}</button></p> : null}
    {board ? <>
      {detail.error ? <p role="status" className="dxs-mkt-note">{t('market.error')} · {t('market.error-hint')}</p> : null}
      <p className="dxs-mkt-detail-stats">{t('market.detail.stats', { change: format.change(board.changePercent), amount: board.amount !== null ? format.compact(board.amount) : '—', cap: board.marketCap !== null ? format.compact(board.marketCap) : '—' })}</p>
      <p className="dxs-mkt-muted">{t('market.detail.total', { count: format.count(board.total), shown: format.count(board.stocks.length) })}</p>
      {tiles.length ? <div className="dxs-mkt-stock-map" ref={ref} role="group" aria-label={t('market.detail.chart-aria', { name: board.name })}>
        {tiles.map((tile: TreemapRect) => {
          const stock = stocks.get(tile.key)
          if (!stock) return null
          const sizeClass = tileSize(tile)
          const showName = tile.width >= 38 && tile.height >= 15
          const showPct = tile.width >= 48 && tile.height >= 28
          return <button type="button" key={tile.key} className={`dxs-mkt-tile ${changeClass(stock.changePercent)} size-${sizeClass} ${active === stock.code ? 'is-selected' : ''}`} style={{ ...position(tile, size.width, size.height), background: tileColor(stock.changePercent) }}
            aria-pressed={active === stock.code}
            aria-label={t('market.heatmap.tile', { name: stock.name, change: format.change(stock.changePercent), amount: format.compact(stock.amount) })}
            title={`${stock.name} ${stock.code} ${format.price(stock.price)} ${format.change(stock.changePercent)}`}
            onClick={() => setActive(stock.code)}>
            {showName ? <span className="dxs-mkt-tile-name">{stock.name}</span> : null}
            {showPct ? <span className="dxs-mkt-tile-pct">{format.change(stock.changePercent)}</span> : null}
          </button>
        })}
      </div> : <p className="dxs-mkt-muted">{t('market.detail.empty')}</p>}
      {active && stocks.get(active) ? <p className="dxs-mkt-selected-stock">{stocks.get(active)!.name} · {active} · {format.price(stocks.get(active)!.price)} · <span className={textTone(stocks.get(active)!.changePercent)}>{format.change(stocks.get(active)!.changePercent)}</span>
        {onOpen ? <button type="button" className="dxs-mkt-open-stock" onClick={() => onOpen(stocks.get(active)!.code, stocks.get(active)!.name)}>{t('market.drill.open')}</button> : null}
      </p> : null}
      <div className="dxs-mkt-table-wrap dxs-mkt-detail-table">
        <table>
          <caption>{t('market.detail.title')}</caption>
          <thead><tr><th>{t('market.detail.stock')}</th><th>{t('market.detail.price')}</th><th>{t('market.detail.change')}</th><th>{t('market.detail.amount')}</th><th>{t('market.detail.cap')}</th>{onOpen ? <th><span className="dxs-sr-only">{t('market.drill.column')}</span></th> : null}</tr></thead>
          <tbody>{board.stocks.map(stock => <tr key={stock.code} className={`${active === stock.code ? 'is-selected' : ''} ${onOpen ? 'is-drillable' : ''}`} tabIndex={0} onClick={() => setActive(stock.code)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setActive(stock.code) } }}>
            <td><span>{stock.name}</span><small>{stock.code}</small></td>
            <td>{format.price(stock.price)}</td>
            <td className={textTone(stock.changePercent)}>{format.change(stock.changePercent)}</td>
            <td>{format.compact(stock.amount)}</td>
            <td>{stock.marketCap !== null ? format.compact(stock.marketCap) : '—'}</td>
            {onOpen ? <td><button type="button" className="dxs-mkt-drill" onClick={event => { event.stopPropagation(); onOpen(stock.code, stock.name) }} aria-label={t('market.drill.aria', { name: stock.name })}>{t('market.drill.open')}</button></td> : null}
          </tr>)}</tbody>
        </table>
      </div>
      <p className="dxs-mkt-muted">{t('market.detail.notice')}</p>
    </> : null}
  </section>
}

/** Only mainland indices with a supported history route can open the chart. */
const canDrillIndex = (code: string) => /^(SH|SZ|BJ)\.\d{6}$/.test(code) && code !== 'SH.932000'

export function MarketView({ rpc, t, format, locale, now = () => new Date(), onOpenStock, scope }: MarketViewProps) {
  const overview = useMarketOverview(rpc)
  const breadth = useMarketBreadth(rpc)
  const preference = useMarketPreference(rpc)
  const [selected, setSelected] = useState<Selection | null>(null)
  const [indexChart, setIndexChart] = useState<{ code: string, name: string } | null>(null)
  const chartRef = useRef<HTMLElement>(null)
  useEffect(() => { if (indexChart) chartRef.current?.scrollIntoView?.({ block: 'nearest' }) }, [indexChart])
  const changeSource = async (enabled: boolean) => {
    try {
      await preference.setEnabled(enabled)
      overview.refresh()
      breadth.refresh()
    } catch { /* the preference hook owns the visible error */ }
  }
  const data: MarketOverview | null = overview.value
  const breadthValue: MarketBreadth | null = breadth.value
  const sectorChanges = data?.sectors.filter(sector => sector.level === 1).map(sector => sector.changePercent) ?? []
  const strongest = data ? [...data.sectors].filter(sector => sector.level === 1).sort((left, right) => right.changePercent - left.changePercent)[0] ?? null : null
  const sentiment = data ? computeSentiment({
    indexChanges: data.indices.filter(index => !index.code.startsWith('HK.')).map(index => index.changePercent),
    breadth: breadthValue ? { up: breadthValue.up, down: breadthValue.down, flat: breadthValue.flat } : null,
    sectorChanges,
  }) : null
  const positiveSectors = sectorChanges.filter(value => value > 0).length
  const sectorAverage = sectorChanges.length ? sectorChanges.reduce((sum, value) => sum + value, 0) / sectorChanges.length : null

  if (overview.status === 'unconfigured') return <div className="dxs-mkt"><MarketUnconfigured t={t} preference={preference} onChange={changeSource} onRetry={overview.refresh} /></div>
  if (overview.status === 'error' && !data) return <div className="dxs-mkt"><MarketErrorCard t={t} onRetry={overview.refresh} preference={preference} onChange={changeSource} /></div>
  if (overview.status === 'loading' && !data) return <div className="dxs-mkt"><div className="dxs-mkt-card dxs-mkt-loading" role="status"><span className="dxs-mkt-dot is-live" />{t('market.loading')}</div></div>
  if (!data) return <div className="dxs-mkt"><MarketErrorCard t={t} onRetry={overview.refresh} preference={preference} onChange={changeSource} /></div>

  return <div className="dxs-mkt">
    <header className="dxs-mkt-head">
      <div>
        <div className="dxs-mkt-eyebrow">{t('market.source')}</div>
        <h2>{t('market.title')}</h2>
        <p>{t('market.subtitle')}</p>
      </div>
      <div className="dxs-mkt-head-actions">
        <MarketStatus quotedAt={data.quotedAt} now={now} t={t} format={format} />
        <SourceSwitch preference={preference} onChange={changeSource} t={t} />
        <div className="dxs-mkt-updated">{t('market.updated', { time: format.time(data.fetchedAt, t) })}</div>
        <button type="button" onClick={() => { overview.refresh(); breadth.refresh() }} disabled={overview.refreshing}>{overview.refreshing ? t('market.refreshing') : t('market.refresh')}</button>
      </div>
    </header>
    {overview.error ? <p role="status" className="dxs-mkt-note">{t('market.error')} · {t('market.error-hint')}</p> : null}
    {breadth.error ? <p role="status" className="dxs-mkt-note">{t('market.error')} · {t('market.error-hint')}</p> : null}
    <section className="dxs-mkt-kpis">
      <Kpi label={t('market.kpi.sentiment')} value={sentiment ? `${format.count(sentiment.score)} · ${t(`market.sentiment.label.${sentiment.label}`)}` : '—'} note={t('market.sentiment.subtitle')} tone={sentiment ? (sentiment.score >= 56 ? 'dxs-up' : sentiment.score <= 44 ? 'dxs-down' : '') : ''} />
      <Kpi label={t('market.kpi.breadth')} value={breadthValue ? <><span className="dxs-up">{format.count(breadthValue.up)}</span><span className="dxs-mkt-slash">/</span><span className="dxs-down">{format.count(breadthValue.down)}</span></> : '—'} note={breadthValue ? t('market.kpi.flat-suspended', { flat: format.count(breadthValue.flat), suspended: format.count(breadthValue.suspended) }) : t('market.kpi.waiting')} />
      <Kpi label={t('market.kpi.amount')} value={breadthValue ? format.compact(breadthValue.amount) : '—'} note={breadthValue ? t('market.breadth.subtitle', { covered: format.count(breadthValue.covered), expected: format.count(breadthValue.expected) }) : t('market.kpi.waiting')} />
      <Kpi label={t('market.kpi.sectors')} value={sectorChanges.length ? `${format.count(positiveSectors)}/${format.count(sectorChanges.length)}` : '—'} note={sectorChanges.length ? t('market.kpi.sector-note', { avg: sectorAverage !== null ? format.change(sectorAverage) : '—' }) : t('market.kpi.waiting')} />
      <Kpi label={t('market.kpi.strongest')} value={strongest ? strongest.name : t('market.kpi.strongest-empty')} note={strongest ? format.change(strongest.changePercent) : undefined} tone={strongest ? textTone(strongest.changePercent) : ''} />
      <div className="dxs-mkt-kpi dxs-mkt-kpi-status">
        <div className="dxs-mkt-kpi-label">{t('market.kpi.status')}</div>
        <MarketStatus quotedAt={data.quotedAt} now={now} t={t} format={format} showTime={false} />
        <div className="dxs-mkt-kpi-note">{t('market.status.hint')}</div>
      </div>
    </section>
    <SentimentPanel data={data} breadth={breadthValue} t={t} format={format} />
    <section className="dxs-mkt-card">
      <header className="dxs-mkt-card-head"><div><h3>{t('market.indices.title')}</h3><p>{t('market.indices.subtitle')}</p></div></header>
      {data.indices.length ? <div className="dxs-mkt-index-grid">{data.indices.map(index => <IndexCard key={index.code} index={index} t={t} format={format} onOpen={canDrillIndex(index.code) ? (code: string, name: string) => setIndexChart({ code, name }) : undefined} />)}</div> : <p className="dxs-mkt-muted">{t('market.indices.empty')}</p>}
      <p className="dxs-mkt-muted">{t('market.drill.index-hint')}</p>
      {data.indices.some(index => index.code.startsWith('HK.')) ? <p className="dxs-mkt-muted">{t('market.indices.hk-note')}</p> : null}
      {data.indices.some(index => index.code === 'SH.932000')
        ? <p className="dxs-mkt-muted">{t('market.indices.csi2000-note')}</p>
        : <p className="dxs-mkt-muted">{t('market.indices.csi2000-missing')}</p>}
    </section>
    {indexChart ? <section ref={chartRef} className="dxs-mkt-card dxs-mkt-index-chart" aria-label={t('market.drill.index-chart', { name: indexChart.name })}>
      <header className="dxs-mkt-card-head">
        <div><h3>{indexChart.name} · {indexChart.code}</h3><p>{t('market.drill.index-chart-note')}</p></div>
        <div className="dxs-mkt-index-chart-actions">
          <button type="button" onClick={() => chartRef.current?.querySelector('.dxs-quant')?.scrollIntoView?.({ block: 'start' })}>{t('market.drill.quant-jump')}</button>
          <button type="button" onClick={() => setIndexChart(null)}>{t('market.detail.close')}</button>
        </div>
      </header>
      <StockWorkbench key={`index:${indexChart.code}`} symbol={indexChart.code} scope={scope} rpc={rpc} t={t} format={format} locale={locale} />
    </section> : null}
    <TailScanPanel rpc={rpc} t={t} format={format} onOpenStock={onOpenStock} />
    <Heatmap data={data} selected={selected} onSelect={setSelected} t={t} format={format} />
    {selected ? <SectorDetail key={selected.code} rpc={rpc} selection={selected} onClose={() => setSelected(null)} t={t} format={format} onOpen={onOpenStock} /> : null}
    {breadthValue ? <DistributionBar breadth={breadthValue} t={t} format={format} /> : <section className="dxs-mkt-card dxs-mkt-loading" role="status"><span className="dxs-mkt-dot is-live" />{breadth.status === 'error' ? t('market.error') : t('market.breadth.waiting')}{breadth.status === 'error' ? <button type="button" onClick={breadth.refresh}>{t('market.retry')}</button> : null}</section>}
    {breadthValue ? <Movers breadth={breadthValue} t={t} format={format} onOpen={onOpenStock} /> : null}
    <footer className="dxs-mkt-footer">
      <details><summary>{t('market.source.details')}</summary><p>{t('market.source.limits')}</p><p>{t('market.source.model')}</p><p>{t('market.source.no-persist')}</p><p>{t('market.source.persist')}</p></details>
      <p>{t('market.not-advice')}</p>
    </footer>
  </div>
}
