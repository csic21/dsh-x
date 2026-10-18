import React, { memo, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { computeIndicators } from '../../indicators.ts'
import { formatLocale } from '../format.ts'
import { createStockChartAdapter } from './adapter.ts'
import { DEFAULT_CHART_CONFIG, normalizeChartConfig } from './config.ts'
import { createSelectionStore, MA_COLORS } from './model.ts'
import { observeChartTheme } from './theme.ts'

function chartFormatters(locale: any, precision: any, format: any) {
  const tag = formatLocale(locale || 'en')
  const price = new Intl.NumberFormat(tag, { minimumFractionDigits: precision, maximumFractionDigits: precision })
  const indicator = new Intl.NumberFormat(tag, { minimumFractionDigits: 3, maximumFractionDigits: Math.max(3, precision) })
  const quantity = new Intl.NumberFormat(tag, { maximumFractionDigits: 2 })
  return {
    price: (value: any) => Number.isFinite(value) ? price.format(value) : '—',
    indicator: (value: any) => Number.isFinite(value) ? indicator.format(value) : '—',
    quantity: (value: any) => Number.isFinite(value) ? quantity.format(value) : '—',
    count: (value: any) => format?.count ? format.count(value) : quantity.format(value),
  }
}
function Readout({ selection, dataset, indicators, config, t, format }: any) {
  const selected = useSyncExternalStore<any>(selection.subscribe, selection.getSnapshot, selection.getSnapshot)
  const bars = useMemo(() => new Map<string, any>(dataset.bars.map((bar: any) => [bar.sessionDate, bar])), [dataset.bars])
  const rows = useMemo(() => new Map<string, any>(indicators.rows.map((row: any) => [row.sessionDate, row])), [indicators])
  const bar = bars.get(selected.sessionDate) ?? dataset.bars.at(-1), row = rows.get(bar?.sessionDate)
  const values = [
    ...['open', 'high', 'low', 'close'].map(key => [t(`chart.${key}`), format.price(bar?.[key])]),
    [t('chart.volume'), format.quantity(bar?.volume)], [t('chart.amount', { currency: dataset.currency }), format.quantity(bar?.amount)],
    ...[5, 10, 20].filter(period => config.maVisible[period]).map(period => [`MA${period}`, format.price(row?.ma[period])]),
    ['DIF', format.indicator(row?.dif)], ['DEA', format.indicator(row?.dea)], [t('chart.hist', { scale: config.macd.histScale }), format.indicator(row?.hist)],
  ]
  return <section className="dxs-chart-readout" aria-label={t('chart.readout')}>
    <header><strong data-selected-date={bar?.sessionDate}>{bar?.sessionDate ?? '—'}</strong>
      <span className="dxs-chart-status" data-locked={selected.locked}>{t(selected.locked ? 'chart.locked' : 'chart.unlocked')}</span>
      {bar && <span className="dxs-chart-status">{t(bar.isFinal ? 'chart.final' : 'chart.provisional')}</span>}
      {selected.locked && <button onClick={() => selection.unlock()}>{t('chart.unlock')}</button>}
    </header>
    <dl>{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  </section>
}
const DataTable = memo(function DataTable({ dataset, indicators, config, selection, t, format, onSelect }: any) {
  const [page, setPage] = useState(() => Math.max(0, Math.ceil(dataset.bars.length / 100) - 1))
  const selected = useSyncExternalStore<any>(selection.subscribe, selection.getSnapshot, selection.getSnapshot)
  const rowsByTime = useMemo(() => new Map<string, any>(indicators.rows.map((row: any) => [row.sessionDate, row])), [indicators])
  const pages = Math.max(1, Math.ceil(dataset.bars.length / 100)), actualPage = Math.min(page, pages - 1), start = actualPage * 100
  return <>
    <div className="dxs-chart-table-controls">
      <button disabled={actualPage === 0} onClick={() => setPage(actualPage - 1)}>{t('chart.table-older')}</button>
      <button disabled={actualPage >= pages - 1} onClick={() => setPage(actualPage + 1)}>{t('chart.table-newer')}</button>
      <span>{t('chart.table-page', { from: format.count(start + 1), to: format.count(Math.min(start + 100, dataset.bars.length)), total: format.count(dataset.bars.length) })}</span>
    </div>
    <div className="dxs-chart-table-scroll" tabIndex={0} aria-label={t('chart.table-caption', { symbol: dataset.symbol })}>
      <table className="dxs-chart-table">
        <caption>{t('chart.table-caption', { symbol: dataset.symbol })}</caption>
        <thead><tr><th scope="col">{t('chart.date')}</th>{['open', 'high', 'low', 'close', 'volume'].map(key => <th key={key} scope="col">{t(`chart.${key}`)}</th>)}<th scope="col">{t('chart.amount', { currency: dataset.currency })}</th>{[5, 10, 20].map(period => <th key={period} scope="col">MA{period}</th>)}<th scope="col">DIF</th><th scope="col">DEA</th><th scope="col">{t('chart.hist', { scale: config.macd.histScale })}</th><th scope="col">{t('chart.final')}</th></tr></thead>
        <tbody>{dataset.bars.slice(start, start + 100).map((bar: any) => {
          const row = rowsByTime.get(bar.sessionDate)
          return <tr key={bar.sessionDate} aria-selected={bar.sessionDate === selected.sessionDate}><th scope="row"><button aria-label={t('chart.select-row', { date: bar.sessionDate })} onClick={() => onSelect(bar.sessionDate)}>{bar.sessionDate}</button></th>
            {['open', 'high', 'low', 'close'].map(key => <td key={key}>{format.price(bar[key])}</td>)}<td>{format.quantity(bar.volume)}</td><td>{format.quantity(bar.amount)}</td>
            {[5, 10, 20].map(period => <td key={period}>{format.price(row?.ma[period])}</td>)}{['dif', 'dea', 'hist'].map(key => <td key={key}>{format.indicator(row?.[key as keyof typeof row])}</td>)}<td>{t(bar.isFinal ? 'chart.final' : 'chart.provisional')}</td></tr>
        })}</tbody>
      </table>
    </div>
  </>
})
function MacdSettings({ current, t, onApply, onClose }: any) {
  const [draft, setDraft] = useState({ ...current }), [error, setError] = useState(false)
  const submit = (event: any) => {
    event.preventDefault()
    try { const { macd } = normalizeChartConfig({ macd: Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, Number(value)])) }); onApply(macd); onClose() }
    catch { setError(true) }
  }
  return <form className="dxs-chart-settings" onSubmit={submit} noValidate>
    <h4>{t('chart.settings-title')}</h4><div className="dxs-chart-settings-grid">
      {['fast', 'slow', 'signal'].map(key => <label key={key}>{t(`chart.${key}`)}<input aria-label={t(`chart.${key}`)} type="number" min="1" max="250" step="1" value={draft[key]} onChange={event => { setError(false); setDraft({ ...draft, [key]: event.target.value }) }} /></label>)}
      <label>{t('chart.hist-scale')}<select value={draft.histScale} onChange={event => setDraft({ ...draft, histScale: event.target.value })}><option value="1">×1</option><option value="2">×2</option></select></label>
    </div>
    {error && <p className="dxs-error" role="alert">{t('chart.parameters-invalid')}</p>}
    <footer><button type="button" onClick={() => { setDraft({ ...DEFAULT_CHART_CONFIG.macd }); setError(false) }}>{t('chart.defaults')}</button><button type="button" onClick={onClose}>{t('chart.cancel')}</button><button type="submit">{t('chart.apply')}</button></footer>
  </form>
}

export function StockChart({ dataset, t, format, locale = 'en', theme = 'auto', config: suppliedConfig, onConfigChange, createAdapter = createStockChartAdapter }: any) {
  const [localConfig, setLocalConfig] = useState(() => normalizeChartConfig()), [settings, setSettings] = useState(false), [showTable, setShowTable] = useState(false)
  const [viewport, setViewport] = useState({ following: true, newBars: false }), [activeTheme, setActiveTheme] = useState('light'), [maximized, setMaximized] = useState(false), [renderError, setRenderError] = useState(false)
  const config = useMemo(() => normalizeChartConfig(suppliedConfig ?? localConfig), [suppliedConfig, localConfig])
  const { fast, slow, signal, histScale } = config.macd
  const indicators = useMemo<any>(() => {
    try { return computeIndicators(dataset.bars, { maPeriods: [5, 10, 20], macd: { fast, slow, signal, histScale }, historyAnchor: dataset.historyAnchor }) }
    catch {
      // Finite imported prices can still overflow recursive arithmetic. Keep
      // original OHLCV inspectable, with no invented indicator values.
      return { failed: true, rows: dataset.bars.map((bar: any) => ({ sessionDate: bar.sessionDate, ma: { 5: null, 10: null, 20: null }, dif: null, dea: null, hist: null })), warmup: { macdBars: slow + signal - 1 } }
    }
  }, [dataset.bars, dataset.historyAnchor, fast, slow, signal, histScale])
  const numbers = useMemo(() => chartFormatters(locale, dataset.pricePrecision ?? 2, format), [locale, dataset.pricePrecision, format])
  const selection = useMemo(createSelectionStore, []), element = useRef<any>(null), section = useRef<any>(null), adapter = useRef<any>(null)
  const helpId = useId(), tableId = useId(), settingsId = useId()
  const applyConfig = (next: any) => { const normalized = normalizeChartConfig(next); setLocalConfig(normalized); onConfigChange?.(normalized) }
  useEffect(() => {
    try { adapter.current = createAdapter(element.current, { selection, onViewport: (next: any) => setViewport(previous => previous.following === next.following && previous.newBars === next.newBars ? previous : next), locale: formatLocale(locale), theme: activeTheme }); setRenderError(false); setMaximized(false) }
    catch { setRenderError(true) }
    return () => { adapter.current?.dispose(); adapter.current = null }
  }, [createAdapter, selection, dataset.id])
  useEffect(() => {
    try { adapter.current?.setData(dataset, indicators) }
    catch { adapter.current?.dispose(); adapter.current = null; setRenderError(true) }
  }, [dataset, indicators])
  useEffect(() => { adapter.current?.setConfig(config) }, [config, dataset.id])
  useEffect(() => { adapter.current?.setLocale(formatLocale(locale)) }, [locale, dataset.id])
  useEffect(() => observeChartTheme(section.current, theme, (value: any) => { setActiveTheme(value); adapter.current?.setTheme(value) }), [theme])
  useEffect(() => () => selection.dispose(), [selection])
  const selectDate = (date: any) => { selection.select(date); adapter.current?.selectDate(date) }
  const keyboard = (event: any) => {
    if (event.currentTarget !== event.currentTarget.ownerDocument.activeElement || event.ctrlKey || event.metaKey || event.altKey) return
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const bar = selection.move(event.key); if (bar) adapter.current?.selectDate(bar.sessionDate) }
    else if (event.key === 'Escape') { event.preventDefault(); selection.unlock() }
    else if (event.key === '+' || event.key === '=') { event.preventDefault(); adapter.current?.zoom(.8) }
    else if (event.key === '-') { event.preventDefault(); adapter.current?.zoom(1.25) }
  }
  const toggleMacd = () => setMaximized(adapter.current?.maximizeMacd() ?? false)
  return <section className="dxs-chart" ref={section} data-chart-theme={activeTheme} aria-label={t('chart.title')}>
    <div className="dxs-chart-toolbar"><h3>{t('chart.price-pane')}</h3>
      <div className="dxs-chart-group">{[5, 10, 20].map(period => <label key={period}><input type="checkbox" checked={config.maVisible[period]} onChange={event => applyConfig({ ...config, maVisible: { ...config.maVisible, [period]: event.target.checked } })} /><span><i className="dxs-chart-swatch" style={{ background: MA_COLORS[period as keyof typeof MA_COLORS] }} />MA{period}</span></label>)}</div>
      <div className="dxs-chart-actions"><button aria-label={t('chart.zoom-in')} onClick={() => adapter.current?.zoom(.8)}>+</button><button aria-label={t('chart.zoom-out')} onClick={() => adapter.current?.zoom(1.25)}>−</button><button onClick={() => adapter.current?.latest()}>{t(viewport.newBars ? 'chart.new-bars' : 'chart.latest')}</button><button onClick={() => adapter.current?.reset()}>{t('chart.reset-view')}</button></div>
    </div>
    <div className="dxs-chart-pane-labels"><span>{t('chart.volume-pane')}</span><strong onDoubleClick={toggleMacd}>{t('chart.macd-pane', { fast, slow, signal, scale: histScale })}</strong>
      {(['dif', 'dea'] as const).map(key => <button className="dxs-chart-line" key={key} aria-pressed={config[`${key}Visible`]} aria-label={t('chart.hide-line', { line: key.toUpperCase() })} onClick={() => applyConfig({ ...config, [`${key}Visible`]: !config[`${key}Visible`] })}>{key.toUpperCase()}</button>)}
      <button aria-expanded={settings} aria-controls={settingsId} onClick={() => setSettings(!settings)}>{t('chart.settings')}</button><button aria-pressed={maximized} onClick={toggleMacd}>{t(maximized ? 'chart.restore-panes' : 'chart.expand-macd')}</button>
    </div>
    {settings && <div id={settingsId}><MacdSettings current={config.macd} t={t} onApply={(macd: any) => applyConfig({ ...config, macd })} onClose={() => setSettings(false)} /></div>}
    <Readout selection={selection} dataset={dataset} indicators={indicators} config={config} t={t} format={numbers} />
    <div className="dxs-chart-plot" hidden={renderError}>
      <div ref={element} className="dxs-chart-canvas" tabIndex={0} role="group" aria-label={t('chart.canvas')} aria-describedby={helpId} onKeyDown={keyboard} onFocus={event => adapter.current?.setFocused(event.target === event.currentTarget)} onBlur={() => adapter.current?.setFocused(false)} onPointerDown={event => { if (!(event.target as Element).closest('a')) event.currentTarget.focus({ preventScroll: true }) }} />
      <div className="dxs-chart-watermark" data-kind={dataset.kind}>{t(dataset.kind === 'demo' ? 'chart.demo-watermark' : 'chart.local-watermark')}</div>
    </div>
    {renderError && <p className="dxs-chart-error" role="alert">{t('chart.render-error')}</p>}
    {indicators.failed && <p className="dxs-chart-error" role="alert">{t('chart.indicator-error')}</p>}
    <p className="dxs-chart-help" id={helpId}>{t('chart.help')}</p>
    <p className="dxs-chart-warning">{t('chart.warmup', { required: numbers.count(indicators.warmup.macdBars), available: numbers.count(dataset.bars.length) })}</p>
    <p className="dxs-chart-method">{t('chart.method', { scale: histScale })}</p>
    <div className="dxs-chart-table-controls"><button aria-expanded={showTable || renderError} aria-controls={tableId} onClick={() => setShowTable(!showTable)}>{t(showTable || renderError ? 'chart.table-hide' : 'chart.table-show')}</button></div>
    {(showTable || renderError) && <div id={tableId}><DataTable dataset={dataset} indicators={indicators} config={config} selection={selection} t={t} format={numbers} onSelect={selectDate} /></div>}
    <div className="dxs-chart-credit"><a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">{t('chart.attribution')}</a></div>
  </section>
}
