import React, { useEffect, useRef, useState } from 'react'
import { parseChartImport, createDemoDataset, createImportExample, MAX_IMPORT_BYTES } from '../chart-data.ts'
import { StockChart } from './chart/StockChart.tsx'
import { normalizeChartConfig } from './chart/config.ts'
import { computeIndicators } from '../indicators.ts'
import { formatLocale } from './format.ts'
import { validateScope } from '../watchlist.ts'

export const chartSettingsKey = (scope: any) => `dsh-x-stock:chart:v1:${validateScope(scope)}`
export function StockWorkbench({ symbol, scope, t, format, locale }: any) {
  const [dataset, setDataset] = useState<any>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState(false)
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
  const clear = () => { generation.current++; setBusy(false); setError(''); setDataset(null) }
  const demo = () => { clear(); setDataset(createDemoDataset()) }
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
      setDataset(value)
    } catch { if (request === generation.current) setError('workbench.error') }
    finally { if (request === generation.current) setBusy(false) }
  }
  const example = () => {
    const url = URL.createObjectURL(new Blob([createImportExample()], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = 'dsh-stock-daily-example.synthetic.json'
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const last = dataset?.bars.at(-1)
  return <section className="dxs-workbench" aria-label={t('workbench.title')}>
    <header><h2>{t('workbench.title')}</h2><p className="dxs-muted">{t('workbench.daily')}</p></header>
    <div className="dxs-data-actions">
      <button type="button" onClick={demo}>{t('workbench.demo')}</button>
      <label className="dxs-file-label">{t('workbench.import')}<input type="file" accept=".json,application/json" onChange={read} /></label>
      <button type="button" onClick={example}>{t('workbench.example')}</button>
      {dataset && <button type="button" onClick={clear}>{t('workbench.clear')}</button>}
    </div>
    <p className="dxs-muted">{t('workbench.private')}</p>
    <details><summary>{t('workbench.format')}</summary><p>{t('workbench.format-help')}</p></details>
    {busy && <p role="status">{t('workbench.loading')}</p>}
    {error && <p role="alert" className="dxs-error">{t(error)}</p>}
    {saveError && <p role="status">{t('workbench.save-error')}</p>}
    {!dataset ? <div className="dxs-chart-empty"><h3>{t('workbench.empty')}</h3><p>{t('workbench.hint')}</p><p className="dxs-muted">{t('workbench.no-realtime')}</p></div> : <>
      <div className="dxs-data-banner" role="status">{t(dataset.kind === 'demo' ? 'workbench.demo-notice' : 'workbench.local-notice')}</div>
      <div className="dxs-dataset-heading"><strong>{dataset.name || dataset.symbol} · {dataset.symbol}</strong><span>{t('workbench.historical-close')}: {new Intl.NumberFormat(formatLocale(locale), { minimumFractionDigits: dataset.pricePrecision, maximumFractionDigits: dataset.pricePrecision }).format(last.close)} {dataset.currency} · {last.sessionDate}</span></div>
      <p className="dxs-muted">{t('workbench.source')}: {dataset.source.label} · {t('workbench.adjustment')}: {t(`workbench.adjustment.${dataset.adjustment}`)}</p>
      <StockChart dataset={dataset} t={t} format={format} locale={locale} config={config} onConfigChange={changeConfig} />
    </>}
    <p className="dxs-attribution"><a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView</a> · {t('workbench.attribution')}</p>
  </section>
}
