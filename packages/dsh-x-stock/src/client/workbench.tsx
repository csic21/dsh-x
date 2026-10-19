import React, { useEffect, useMemo, useRef, useState } from 'react'
import { parseChartImport, createDemoDataset, createImportExample, MAX_IMPORT_BYTES } from '../chart-data.ts'
import { toChartDataset } from '../history-dataset.ts'
import type { HistoryDataset } from '../history-dataset.ts'
import type { MarketAdjustment } from '../market.ts'
import { StockChart } from './chart/StockChart.tsx'
import { normalizeChartConfig } from './chart/config.ts'
import { computeIndicators } from '../indicators.ts'
import { formatLocale } from './format.ts'
import { validateScope } from '../watchlist.ts'
import { useMarketHistory } from './market/history.ts'

export const chartSettingsKey = (scope: any) => `dsh-x-stock:chart:v1:${validateScope(scope)}`
export const historySettingsKey = (scope: any) => `dsh-x-stock:history:v1:${validateScope(scope)}`
const ADJUSTMENTS: MarketAdjustment[] = ['forward', 'none', 'backward']

/** A stored preference is untrusted: unknown values fall back to forward-adjusted. */
export function normalizeAdjustment(raw: any): MarketAdjustment {
  return ADJUSTMENTS.includes(raw) ? raw : 'forward'
}

/**
 * Daily chart for one stock. The opt-in free source is the default dataset; a
 * synthetic DEMO and a local JSON import stay explicit, in-memory alternatives.
 * Only display preferences (and the chosen adjustment) are persisted — never
 * bars, quotes or the imported file.
 */
export function StockWorkbench({ symbol, scope, t, format, locale, rpc }: any) {
  const [local, setLocal] = useState<any>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'market' | 'demo' | 'local'>('market')
  const [saveError, setSaveError] = useState(false)
  const [adjustment, setAdjustment] = useState<MarketAdjustment>(() => {
    try { return normalizeAdjustment(JSON.parse(globalThis.localStorage?.getItem(historySettingsKey(scope)) ?? 'null')?.adjustment) }
    catch { return 'forward' }
  })
  const generation = useRef(0)
  const [config, setConfig] = useState(() => {
    try { return normalizeChartConfig(JSON.parse(globalThis.localStorage?.getItem(chartSettingsKey(scope)) ?? 'null')) }
    catch { return normalizeChartConfig() }
  })
  useEffect(() => () => { generation.current++ }, [])
  const changeConfig = (next: any) => {
    const valid = normalizeChartConfig(next); setConfig(valid)
    try { if (!globalThis.localStorage) throw new Error(); globalThis.localStorage.setItem(chartSettingsKey(scope), JSON.stringify(valid)); setSaveError(false) }
    catch { setSaveError(true) }
  }
  const changeAdjustment = (next: MarketAdjustment) => {
    setAdjustment(next)
    try {
      if (!globalThis.localStorage) throw new Error()
      globalThis.localStorage.setItem(historySettingsKey(scope), JSON.stringify({ version: 1, adjustment: next }))
      setSaveError(false)
    } catch { setSaveError(true) }
  }
  const history = useMarketHistory(rpc, symbol ?? null, adjustment, 250)
  const marketDataset: HistoryDataset | null = (() => {
    if (history.status !== 'ready' || !history.value) return null
    try { return toChartDataset(history.value) } catch { return null }
  })()
  const clear = () => { generation.current++; setBusy(false); setError(''); setLocal(null) }
  const showDemo = () => { clear(); setMode('demo') }
  const showMarket = () => { clear(); setMode('market') }
  const read = async (event: any) => {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file) return
    const request = ++generation.current; setBusy(true); setError('')
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error()
      const value = parseChartImport(await file.text())
      if (request !== generation.current) return
      if (symbol && value.symbol !== symbol) { setError('workbench.mismatch'); return }
      computeIndicators(value.bars, { macd: config.macd })
      setLocal(value); setMode('local')
    } catch { if (request === generation.current) setError('workbench.error') }
    finally { if (request === generation.current) setBusy(false) }
  }
  const example = () => {
    const url = URL.createObjectURL(new Blob([createImportExample()], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = 'dsh-stock-daily-example.synthetic.json'
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const demoDataset = useMemo(() => mode === 'demo' ? createDemoDataset() : null, [mode])
  const dataset = mode === 'local' ? local : mode === 'demo' ? demoDataset : marketDataset
  const last = dataset?.bars.at(-1)
  const notice = dataset?.kind === 'market' ? 'workbench.market-notice'
    : dataset?.kind === 'demo' ? 'workbench.demo-notice' : 'workbench.local-notice'
  return <section className="dxs-workbench" aria-label={t('workbench.title')}>
    <header><h2>{t('workbench.title')}</h2><p className="dxs-muted">{t('workbench.daily')}</p></header>
    <div className="dxs-data-actions">
      <div className="dxs-view-tabs" role="group" aria-label={t('workbench.source.aria')}>
        <button type="button" aria-pressed={mode === 'market'} onClick={showMarket}>{t('workbench.source.market')}</button>
        <button type="button" aria-pressed={mode === 'demo'} onClick={showDemo}>{t('workbench.source.demo')}</button>
        <button type="button" aria-pressed={mode === 'local'} onClick={() => setMode('local')} disabled={!local}>{t('workbench.source.local')}</button>
      </div>
      {mode === 'market' ? <label className="dxs-adjustment">{t('workbench.adjustment')}
        <select value={adjustment} onChange={event => changeAdjustment(normalizeAdjustment(event.target.value))}>
          {ADJUSTMENTS.map(value => <option key={value} value={value}>{t(`workbench.adjustment.${value}`)}</option>)}
        </select>
      </label> : null}
      {mode === 'market' ? <button type="button" onClick={history.refresh} disabled={history.refreshing}>{history.refreshing ? t('workbench.refreshing') : t('workbench.refresh')}</button> : null}
      <label className="dxs-file-label">{t('workbench.import')}<input type="file" accept=".json,application/json" onChange={read} /></label>
      <button type="button" onClick={example}>{t('workbench.example')}</button>
      {mode !== 'market' && dataset ? <button type="button" onClick={() => { clear(); setMode('market') }}>{t('workbench.clear')}</button> : null}
    </div>
    {mode === 'market' ? <p className="dxs-muted">{t('workbench.market-hint')}</p> : null}
    {mode !== 'market' ? <p className="dxs-muted">{t('workbench.private')}</p> : null}
    <details><summary>{t('workbench.format')}</summary><p>{t('workbench.format-help')}</p></details>
    {busy && <p role="status">{t('workbench.loading')}</p>}
    {error && <p role="alert" className="dxs-error">{t(error)}</p>}
    {saveError && <p role="status">{t('workbench.save-error')}</p>}
    {mode === 'market' && (history.status === 'loading' || (history.status === 'ready' && history.refreshing)) && !dataset ? <p role="status" className="dxs-muted">{t('workbench.market-loading')}</p> : null}
    {mode === 'market' && !dataset && history.status === 'unconfigured' ? <div className="dxs-chart-empty"><h3>{t('workbench.market-off-title')}</h3><p>{t('workbench.market-off')}</p></div> : null}
    {mode === 'market' && !dataset && history.status === 'unavailable' ? <div className="dxs-chart-empty"><h3>{t('workbench.market-unavailable-title')}</h3><p>{t('workbench.market-unavailable')}</p></div> : null}
    {mode === 'market' && !dataset && history.status === 'error' ? <div className="dxs-chart-empty" role="alert"><h3>{t('workbench.market-error-title')}</h3><p>{t('workbench.market-error')}</p><button type="button" onClick={history.refresh}>{t('workbench.retry')}</button></div> : null}
    {mode === 'local' && !local ? <div className="dxs-chart-empty"><h3>{t('workbench.empty')}</h3><p>{t('workbench.hint')}</p><p className="dxs-muted">{t('workbench.no-realtime')}</p></div> : null}
    {dataset ? <>
      <div className={`dxs-data-banner ${dataset.kind === 'market' ? 'is-market' : ''}`} role="status">{t(notice)}</div>
      <div className="dxs-dataset-heading"><strong>{dataset.name || dataset.symbol} · {dataset.symbol}</strong><span>{t(dataset.bars.at(-1)?.isFinal ? 'workbench.historical-close' : 'workbench.provisional-close')}: {new Intl.NumberFormat(formatLocale(locale), { minimumFractionDigits: dataset.pricePrecision, maximumFractionDigits: dataset.pricePrecision }).format(last.close)} {dataset.currency} · {last.sessionDate}</span></div>
      <p className="dxs-muted">{t('workbench.source')}: {dataset.source.label} · {t('workbench.adjustment')}: {t(`workbench.adjustment.${dataset.adjustment}`)}
        {dataset.kind === 'market' ? ` · ${t('workbench.bars', { count: format?.count ? format.count(dataset.bars.length) : dataset.bars.length, from: dataset.bars[0].sessionDate, to: last.sessionDate })}` : ''}
        {dataset.kind === 'market' ? ` · ${t(`workbench.volume.${dataset.volumeBasis}`)}` : ''}
      </p>
      <StockChart dataset={dataset} t={t} format={format} locale={locale} config={config} onConfigChange={changeConfig} />
    </> : null}
    <p className="dxs-attribution"><a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView</a> · {t('workbench.attribution')}</p>
  </section>
}
