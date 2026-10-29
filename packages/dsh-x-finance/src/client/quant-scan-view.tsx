import React, { useEffect, useRef, useState } from 'react'
import { MARKET_ENDPOINT } from '../market.ts'
import type { QuantScanResult } from '../quant-scan.ts'
import type { QuantScheduleState, QuantScheduleReport } from '../quant-scan-scheduler.ts'

const QUANT_SCHEDULE_ENDPOINT = 'dsh-x-finance.quant-schedule'

type ScanAction = 'start' | 'continue' | 'status'
interface QuantScanViewProps {
  rpc: any
  scope?: string | null
  sourceEnabled: boolean
  t: (key: string, params?: Record<string, any>) => string
  format: any
  onOpenStock?: (symbol: string, name: string) => void
}

function QuantSchedulePanel({ rpc, scope, sourceEnabled, t, format, manualBusy, onShow }: QuantScanViewProps & {
  manualBusy: boolean; onShow: (report: QuantScheduleReport) => void
}) {
  const [state, setState] = useState<QuantScheduleState | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState<'general' | 'disable' | ''>('')
  const actionRequest = useRef<AbortController | null>(null), busyRef = useRef(false), revision = useRef(0)
  useEffect(() => {
    if (!scope) return
    setState(null); setBusy(false); setError(''); busyRef.current = false
    let disposed = false, timer: ReturnType<typeof setTimeout> | undefined, poll: AbortController | undefined
    const read = async () => {
      if (disposed) return
      if (busyRef.current || (typeof document !== 'undefined' && document.hidden)) { timer = setTimeout(read, 30_000); return }
      const local = new AbortController(), token = ++revision.current; poll = local
      try {
        const result = await rpc?.call?.('/api', QUANT_SCHEDULE_ENDPOINT, { action: 'get', scope }, local.signal)
        if (!disposed && !local.signal.aborted && token === revision.current) {
          if (!result?.ok || !result.value || typeof result.value.enabled !== 'boolean' || !Array.isArray(result.value.reports)) throw new Error('invalid schedule')
          setState(result.value as QuantScheduleState); setError(previous => previous === 'disable' ? previous : '')
        }
      } catch { if (!disposed && !local.signal.aborted && token === revision.current) setError('general') }
      finally { if (!disposed) timer = setTimeout(read, 30_000) }
    }
    void read()
    return () => { disposed = true; revision.current++; clearTimeout(timer); poll?.abort(); actionRequest.current?.abort(); actionRequest.current = null; busyRef.current = false }
  }, [rpc, scope])
  const change = async (action: 'enable' | 'disable') => {
    if (!scope || busyRef.current) return
    busyRef.current = true; setBusy(true); setError('')
    const local = new AbortController(), token = ++revision.current; actionRequest.current = local
    const payload = action === 'enable' ? { action, scope, consent: true } : { action, scope }
    try {
      const result = await rpc?.call?.('/api', QUANT_SCHEDULE_ENDPOINT, payload, local.signal)
      if (local.signal.aborted || token !== revision.current) return
      if (!result?.ok || !result.value || typeof result.value.enabled !== 'boolean' || !Array.isArray(result.value.reports)) throw new Error('invalid schedule')
      setState(result.value as QuantScheduleState)
    } catch { if (!local.signal.aborted && token === revision.current) setError(action === 'disable' ? 'disable' : 'general') }
    finally { if (actionRequest.current === local) { actionRequest.current = null; busyRef.current = false; setBusy(false) } }
  }
  const time = (stamp: string | null) => stamp && typeof format?.time === 'function' ? format.time(stamp, t) : stamp ?? '—'
  return <section className="dxs-quant-auto" aria-label={t('quantAuto.title')}>
    <h3>{t('quantAuto.title')}</h3><p>{t('quantAuto.disclosure')}</p>
    {!state && !error ? <p role="status">{t('quantAuto.loading')}</p> : null}
    {error ? <p className="dxs-mkt-note" role="alert">{t(error === 'disable' ? 'quantAuto.disable-error' : 'quantAuto.error')}</p> : null}
    {state ? <>
      <p>{t(state.enabled ? 'quantAuto.enabled' : 'quantAuto.disabled')}</p>
      {state.running ? <p role="status">{t('quantAuto.running')}</p> : null}
      {state.lastAttemptDate ? <p>{t('quantAuto.last', { date: state.lastAttemptDate, time: time(state.updatedAt) })}</p> : null}
      {state.error ? <p className="dxs-mkt-note">{t('quantAuto.issue', { reason: t(`quantAuto.issue.${state.error}`) })}</p> : null}
      {state.blockedReason && !['disabled', 'running'].includes(state.blockedReason) ? <p>{t(`quantAuto.block.${state.blockedReason}`)}</p> : null}
      <div className="dxs-quant-auto-actions">
        {error === 'disable' ? <button type="button" disabled={busy} onClick={() => { void change('disable') }}>{t('quantAuto.retry-disable')}</button>
          : state.enabled ? <button type="button" disabled={busy} onClick={() => { void change('disable') }}>{t('quantAuto.disable')}</button>
            : <button type="button" disabled={busy || !scope || !sourceEnabled} onClick={() => { void change('enable') }}>{t('quantAuto.enable')}</button>}
      </div>
      {state.reports.length ? <details className="dxs-quant-auto-reports"><summary>{t('quantAuto.reports')}</summary>
        <ol>{state.reports.map(report => <li key={report.date}>
          <span>{report.date} · {t(`quantAuto.report.${report.status}`)}</span>
          {report.result ? <button type="button" disabled={manualBusy} onClick={() => onShow(report)}>{t('quantAuto.show', { date: report.date })}</button> : null}
          {report.error ? <small>{t('quantAuto.issue', { reason: t(`quantAuto.issue.${report.error}`) })}</small> : null}
        </li>)}</ol></details> : <p>{t('quantAuto.no-reports')}</p>}
    </> : null}
  </section>
}

/** Manual, paged research; never starts a scan just because the page mounted. */
export function QuantScanView({ rpc, scope, sourceEnabled, t, format, onOpenStock }: QuantScanViewProps) {
  const [value, setValue] = useState<QuantScanResult | null>(null)
  const [reportDate, setReportDate] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [checking, setChecking] = useState(false)
  const [auto, setAuto] = useState(false)
  const [notice, setNotice] = useState('')
  const active = useRef(false), alive = useRef(false), busy = useRef(false)
  const request = useRef<AbortController | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const performRef = useRef<(action: ScanAction, scanId?: string) => Promise<void>>(async () => {})
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null }
  const perform = async (action: ScanAction, scanId?: string) => {
    if (!sourceEnabled || busy.current) return
    busy.current = true
    setReportDate(null)
    const local = new AbortController(); request.current = local
    if (action !== 'status') setRunning(true)
    else setChecking(true)
    setNotice('')
    try {
      if (!rpc?.call) throw new Error('connection unavailable')
      const payload = action === 'continue' ? { kind: 'quant-scan', action, scanId } : { kind: 'quant-scan', action }
      const response = await rpc.call('/api', MARKET_ENDPOINT, payload, local.signal)
      if (!alive.current || local.signal.aborted) return
      if (!response?.ok) throw new Error('scan unavailable')
      if (response.value?.status === 'unconfigured') { setValue(null); active.current = false; setAuto(false); return }
      if (response.value?.status !== 'ready') throw new Error('invalid scan status')
      const result = response.value.quantScan as QuantScanResult | null
      if (result !== null && (!result || typeof result !== 'object' || !result.counts || !Array.isArray(result.rows))) throw new Error('invalid scan result')
      setValue(result)
      if (active.current && action !== 'status' && result?.canContinue) {
        const next = Date.parse(result.nextAllowedAt)
        const delay = Number.isFinite(next) ? Math.max(250, next - Date.now()) : 60_000
        clear()
        timer.current = setTimeout(() => {
          timer.current = null
          if (!alive.current || !active.current) return
          // Do not continue free-source bulk work while the page is hidden.
          if (typeof document !== 'undefined' && document.hidden) {
            active.current = false; setAuto(false); setNotice('quantScan.stopped'); return
          }
          void performRef.current('continue', result.scanId)
        }, Math.min(delay, 2_147_000_000))
      } else if (action !== 'status') { active.current = false; setAuto(false) }
    } catch {
      if (alive.current && !local.signal.aborted) { active.current = false; setAuto(false); setNotice('quantScan.error') }
    } finally {
      if (request.current === local) { request.current = null; busy.current = false; if (alive.current) { setRunning(false); setChecking(false) } }
    }
  }
  performRef.current = perform
  useEffect(() => {
    alive.current = true
    if (sourceEnabled) void performRef.current('status')
    else { setValue(null); setAuto(false); setRunning(false); setChecking(false); setNotice('') }
    return () => {
      alive.current = false; active.current = false; clear(); request.current?.abort(); request.current = null; busy.current = false
    }
  }, [rpc, sourceEnabled])
  const start = () => {
    if (!sourceEnabled || running || busy.current) return
    active.current = true; setAuto(true)
    void perform(value?.canContinue ? 'continue' : 'start', value?.scanId)
  }
  const stop = () => {
    active.current = false; setAuto(false); clear(); request.current?.abort(); request.current = null; busy.current = false
    setRunning(false); setNotice('quantScan.stopped')
  }
  const count = (number: number | null | undefined) => number == null ? '—' : typeof format?.count === 'function' ? format.count(number) : String(number)
  const ratio = (number: number) => typeof format?.ratio === 'function' ? format.ratio(number) : number.toFixed(2)
  const pct = (number: number) => typeof format?.change === 'function' ? format.change(number * 100) : `${(number * 100).toFixed(2)}%`
  const plainPct = (number: number) => typeof format?.percent === 'function' ? format.percent(number * 100) : `${(number * 100).toFixed(2)}%`
  const price = (number: number) => typeof format?.priceAt === 'function' ? format.priceAt(number, 4) : String(number)
  const time = (stamp: string) => typeof format?.time === 'function' ? format.time(stamp, t) : stamp
  const c = value?.counts
  return <section className="dxs-mkt dxs-quant-scan" aria-labelledby="dxs-quant-scan-title">
    <header className="dxs-mkt-head">
      <div><h2 id="dxs-quant-scan-title">{t('quantScan.title')}</h2><p>{t('quantScan.subtitle')}</p></div>
      <div className="dxs-mkt-head-actions">
        {auto || running ? <button type="button" onClick={stop}>{t('quantScan.stop')}</button>
          : <button type="button" className="dxs-primary" disabled={!sourceEnabled || checking} onClick={start}>{t(value?.canContinue ? 'quantScan.continue' : 'quantScan.run')}</button>}
        <button type="button" disabled={!sourceEnabled || running || checking} onClick={() => { void perform('status') }}>{t('quantScan.check')}</button>
      </div>
    </header>
    {scope ? <QuantSchedulePanel rpc={rpc} scope={scope} sourceEnabled={sourceEnabled} t={t} format={format} manualBusy={running || auto} onShow={report => {
      if (report.result) { setValue(report.result); setReportDate(report.date); setNotice('') }
    }} /> : null}
    {reportDate ? <p className="dxs-mkt-note">{t('quantAuto.selected', { date: reportDate })}</p> : null}
    {!sourceEnabled ? <p className="dxs-mkt-muted">{t('quantScan.disabled')}</p> : !value && !running ? <p className="dxs-mkt-muted">{t('quantScan.idle')}</p> : null}
    {running ? <p role="status" className="dxs-mkt-muted">{t('quantScan.running')}</p> : null}
    {auto && !running && value?.canContinue ? <p role="status" className="dxs-mkt-muted">{t('quantScan.waiting', { time: time(value.nextAllowedAt) })}</p> : null}
    {notice ? <p role="status" className="dxs-mkt-note">{t(notice)}</p> : null}
    {value && c ? <>
      <p className="dxs-mkt-note">{t(value.partial ? 'quantScan.partial' : 'quantScan.complete')}</p>
      {value.provisional ? <p className="dxs-mkt-note">{t('quantScan.provisional')}</p> : null}
      <div className="dxs-quant-scan-summary">
        <p>{t('quantScan.coverage', { expected: count(c.expected), discovered: count(c.discovered), attempted: count(c.attempted), succeeded: count(c.dailySucceeded), insufficient: count(c.dailyInsufficient), failed: count(c.dailyFailed), remaining: count(c.notAttempted) })}</p>
        <p>{t('quantScan.filtered', { ranked: count(c.ranked), suspended: count(c.excludedSuspended), st: count(c.excludedST), unknown: count(c.excludedStatusUnknown), missing: count(c.missingFactors), dateMismatch: count(c.excludedDateMismatch) })}</p>
        <p>{t('quantScan.source', { source: value.source, date: value.sessionDate ?? '—', time: time(value.updatedAt) })} · {t(`quantScan.state.${value.stopReason}`)}</p>
      </div>
      <h3>{t('quantScan.rank')}</h3>
      {value.rows.length ? <ol className="dxs-quant-scan-list">{value.rows.map(row => <li key={row.symbol} className="dxs-quant-scan-row">
        <div className="dxs-quant-scan-row-head">
          {onOpenStock ? <button type="button" className="dxs-mkt-link" onClick={() => onOpenStock(row.symbol, row.name)}><span>{row.name}</span><small>{row.symbol}</small></button>
            : <span><strong>{row.name}</strong> {row.symbol}</span>}
          <strong>{t('quantScan.score')} {ratio(row.score)}</strong>
        </div>
        <p>{t('quantScan.factors', { trend: ratio(row.scores.trend), momentum: ratio(row.scores.momentum), liquidity: ratio(row.scores.liquidity), risk: ratio(row.scores.risk) })}</p>
        <p>{t('quantScan.trendDetail', { close: price(row.factors.close), ma20: price(row.factors.ma20), ma60: price(row.factors.ma60) })}</p>
        <p>{t('quantScan.returns', { r20: pct(row.factors.return20), r60: pct(row.factors.return60), volatility: plainPct(row.factors.volatility20) })}</p>
        <p>{t('quantScan.amount', { amount: row.factors.amountMedian20 === null ? '—' : typeof format?.compact === 'function' ? format.compact(row.factors.amountMedian20) : String(row.factors.amountMedian20), samples: count(row.factors.amountSamples20) })}</p>
        <p>{t('quantScan.bar', { date: row.sessionDate, adjustment: t(`workbench.adjustment.${row.adjustment}`), count: count(row.validBars) })}{row.provisional ? ` · ${t('quantScan.provisional-row')}` : ''}</p>
      </li>)}</ol> : <p className="dxs-mkt-muted">{t('quantScan.empty')}</p>}
    </> : null}
    <details className="dxs-quant-scan-method"><summary>{t('quantScan.method')}</summary><p>{t('quantScan.method-body')}</p><p>{t('quantScan.limits')}</p><p>{t('quantScan.no-advice')}</p></details>
  </section>
}
