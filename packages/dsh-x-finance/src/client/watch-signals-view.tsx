import React, { useEffect, useRef, useState } from 'react'
import { shanghaiToday } from '../market.ts'
import { scanWatchSignals } from './watch-signals-data.ts'
import type { SignalWatchItem, WatchSignalRow } from './watch-signals-data.ts'
import type { WatchScheduleState } from '../watch-signal-scheduler.ts'

const WATCH_SCHEDULE_ENDPOINT = 'dsh-x-finance.watch-schedule'

interface WatchSignalsProps {
  rpc: any
  items: SignalWatchItem[]
  scope?: string | null
  sourceEnabled: boolean
  t: (key: string, params?: Record<string, any>) => string
  format: any
  onOpen?: (symbol: string) => void
}

function SignalRow({ row, t, format, onOpen }: { row: WatchSignalRow; t: WatchSignalsProps['t']; format: any; onOpen?: (symbol: string) => void }) {
  const signal = row.signal
  const good = row.status === 'ready' && signal && signal.status !== 'insufficient'
  const blockedBuy = Boolean(good && row.stWarning && signal!.status === 'buy')
  const statusKey = row.status !== 'ready' ? `signal.${row.status}`
    : !signal || signal.status === 'insufficient' ? 'signal.insufficient'
      : blockedBuy ? 'signal.st-blocked' : `signal.${signal.status}`
  const price = (value: number | null, extra = 0) => {
    if (value === null || !Number.isFinite(value)) return '—'
    const precision = Math.min(6, (row.pricePrecision ?? 2) + extra)
    return typeof format?.priceAt === 'function' ? format.priceAt(value, precision) : String(value)
  }
  const facts = good ? {
    close: price(signal!.close), high: price(signal!.prior20High), ma20: price(signal!.ma20, 2),
    ma60: price(signal!.ma60, 2), previous: price(signal!.previousClose), previousMa20: price(signal!.previousMa20, 2),
  } : null
  const reason = good && facts ? t(`signal.${signal!.status}-reason`, facts) : null
  const historical = Boolean(signal?.sessionDate && signal.sessionDate !== shanghaiToday(Date.now()))
  const replay = row.replay?.status === 'ready' ? row.replay : null
  const percent = (value: number | null) => value === null || !Number.isFinite(value) ? '—'
    : typeof format?.change === 'function' ? format.change(value * 100) : `${(value * 100).toFixed(2)}%`
  return <li className="dxs-signal-row">
    <div className="dxs-signal-row-head">
      {onOpen ? <button type="button" className="dxs-signal-name" onClick={() => onOpen(row.symbol)}>
        <strong>{row.alias || row.name || row.symbol}</strong><small>{row.symbol}</small>
      </button> : <span><strong>{row.alias || row.name || row.symbol}</strong> <small>{row.symbol}</small></span>}
      <span className="dxs-signal-status" data-status={good && !blockedBuy ? signal!.status : 'unknown'}>{t(statusKey)}</span>
    </div>
    {good && !signal!.isFinal ? <p className="dxs-signal-warning">{t('signal.provisional')}</p> : null}
    {good && historical ? <p className="dxs-signal-warning">{t('signal.historical')}</p> : null}
    {reason ? <p className="dxs-signal-reason">{reason}</p> : null}
    {replay ? <p className="dxs-signal-meta">{t('signal.replay', {
      from: replay.from, to: replay.to, strategy: percent(replay.totalReturn), benchmark: percent(replay.buyHoldReturn),
      drawdown: percent(replay.maxDrawdown), trades: replay.tradeCount, open: replay.open ? t('signal.replay-open') : '',
    })}</p> : null}
    {row.stWarning ? <p className="dxs-signal-warning">{t('signal.st-note')}</p> : null}
    {signal?.sessionDate ? <p className="dxs-signal-meta">{t('signal.sample', {
      date: signal.sessionDate, count: typeof format?.count === 'function' ? format.count(signal.samples) : signal.samples,
      adjustment: row.adjustment ? t(`workbench.adjustment.${row.adjustment}`) : '—',
    })}</p> : null}
    {row.source ? <p className="dxs-signal-meta">{t('signal.source', {
      source: row.source, time: row.fetchedAt && typeof format?.time === 'function' ? format.time(row.fetchedAt, t) : row.fetchedAt ?? '—',
    })}</p> : null}
  </li>
}

function WatchSchedulePanel({ rpc, scope, items, sourceEnabled, t, format, onOpen }: WatchSignalsProps) {
  const [state, setState] = useState<WatchScheduleState | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState<'general' | 'disable' | ''>(''), [confirm, setConfirm] = useState(false)
  const actionRequest = useRef<AbortController | null>(null), busyRef = useRef(false), revision = useRef(0)
  useEffect(() => {
    if (!scope) return
    setState(null); setBusy(false); setError(''); setConfirm(false); busyRef.current = false
    let disposed = false, timer: ReturnType<typeof setTimeout> | undefined, poll: AbortController | undefined
    const read = async () => {
      if (disposed) return
      if (busyRef.current || (typeof document !== 'undefined' && document.hidden)) {
        timer = setTimeout(read, 30_000); return
      }
      const local = new AbortController(), token = ++revision.current; poll = local
      try {
        const result = await rpc?.call?.('/api', WATCH_SCHEDULE_ENDPOINT, { action: 'get', scope }, local.signal)
        if (!disposed && !local.signal.aborted && token === revision.current) {
          if (!result?.ok || !result.value || typeof result.value.enabled !== 'boolean') throw new Error('invalid schedule')
          setState(result.value as WatchScheduleState); setError(previous => previous === 'disable' ? previous : '')
        }
      } catch { if (!disposed && !local.signal.aborted && token === revision.current) setError('general') }
      finally { if (!disposed) timer = setTimeout(read, 30_000) }
    }
    void read()
    return () => { disposed = true; revision.current++; clearTimeout(timer); poll?.abort(); actionRequest.current?.abort(); actionRequest.current = null; busyRef.current = false }
  }, [rpc, scope])
  const change = async (action: 'enable' | 'sync' | 'disable' | 'run') => {
    if (!scope || busyRef.current) return
    busyRef.current = true; setBusy(true); setError('')
    const local = new AbortController(), token = ++revision.current; actionRequest.current = local
    const symbols = items.map(item => item.symbol)
    const payload = action === 'enable' ? { action, scope, symbols, consent: true }
      : action === 'sync' ? { action, scope, symbols } : { action, scope }
    try {
      const result = await rpc?.call?.('/api', WATCH_SCHEDULE_ENDPOINT, payload, local.signal)
      if (local.signal.aborted || token !== revision.current) return
      if (!result?.ok || !result.value || typeof result.value.enabled !== 'boolean') throw new Error('invalid schedule')
      setState(result.value as WatchScheduleState); setConfirm(false)
    } catch { if (!local.signal.aborted && token === revision.current) setError(action === 'disable' ? 'disable' : 'general') }
    finally { if (actionRequest.current === local) { actionRequest.current = null; busyRef.current = false; setBusy(false) } }
  }
  const scheduleSourceEnabled = sourceEnabled && state?.sourceEnabled === true
  const shown = state?.enabled && scheduleSourceEnabled ? state.rows : []
  return <div className="dxs-schedule" aria-label={t('schedule.title')}>
    <h3>{t('schedule.title')}</h3><p>{t('schedule.disclosure')}</p>
    {!state && !error ? <p role="status">{t('schedule.loading')}</p> : null}
    {error ? <p className="dxs-signal-warning" role="alert">{t(error === 'disable' ? 'schedule.disable-error' : 'schedule.error')}</p> : null}
    {state && !state.enabled ? <p>{t('schedule.disabled')}</p> : null}
    {state?.enabled ? <>
      <p>{t('schedule.enabled', { count: state.syncedCount })}</p><p>{t('schedule.sync-note')}</p>
      {state.running ? <p role="status">{t('schedule.running')}</p> : null}
      <p>{t('schedule.last', { date: state.lastAttemptDate ?? '—', time: state.updatedAt && typeof format?.time === 'function' ? format.time(state.updatedAt, t) : state.updatedAt ?? '—' })}</p>
      {state.error ? <p className="dxs-signal-warning">{t('schedule.issue', { reason: t(`schedule.issue.${state.error}`) })}</p> : null}
      {state.blockedReason && !['disabled', 'running'].includes(state.blockedReason) ? <p>{t(`schedule.block.${state.blockedReason}`)}</p> : null}
      {state.partial ? <p className="dxs-signal-warning">{t('schedule.partial')}</p> : null}
    </> : null}
    <div className="dxs-schedule-actions">
      {error === 'disable' ? <button type="button" onClick={() => { void change('disable') }} disabled={busy}>{t('schedule.retry-disable')}</button> : null}
      {state && !state.enabled && error !== 'disable' ? <button type="button" onClick={() => { void change('enable') }} disabled={busy || !scope || !sourceEnabled || !items.length}>{t('schedule.enable')}</button> : null}
      {state?.enabled && !confirm && error !== 'disable' ? <>
        <button type="button" onClick={() => { void change('sync') }} disabled={busy}>{t('schedule.sync')}</button>
        <button type="button" onClick={() => { void change('run') }} disabled={busy || !!state.blockedReason}>{t('schedule.check')}</button>
        <button type="button" onClick={() => setConfirm(true)} disabled={busy}>{t('schedule.disable')}</button>
      </> : null}
      {state?.enabled && confirm && error !== 'disable' ? <>
        <button type="button" onClick={() => { void change('disable') }} disabled={busy}>{t('schedule.confirm')}</button>
        <button type="button" onClick={() => setConfirm(false)} disabled={busy}>{t('schedule.cancel')}</button>
      </> : null}
    </div>
    {state?.enabled ? shown.length ? <details className="dxs-schedule-results"><summary>{t('schedule.results')}</summary>
      <ol className="dxs-signal-list">{shown.map(row => {
        const item = items.find(entry => entry.symbol === row.symbol)
        const status = row.status === 'ready' && (row.freshness === 'stale' || row.freshness === 'unavailable') ? 'stale' : row.status
        return <SignalRow key={row.symbol} row={{ ...row, status, alias: item?.alias ?? '', replay: null }} t={t} format={format} onOpen={onOpen} />
      })}</ol></details> : <p>{t(scheduleSourceEnabled ? 'schedule.none' : 'schedule.source-off')}</p> : null}
  </div>
}

/** Explicit user-run analysis. It never modifies or syncs the watchlist. */
export function WatchSignals({ rpc, scope, items, sourceEnabled, t, format, onOpen }: WatchSignalsProps) {
  const [rows, setRows] = useState<WatchSignalRow[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  const itemsKey = JSON.stringify(items.map(item => [item.symbol, item.alias]))
  useEffect(() => {
    controller.current?.abort()
    controller.current = null
    setRows([]); setRunning(false); setError('')
    return () => { controller.current?.abort(); controller.current = null }
  }, [itemsKey, sourceEnabled])
  const run = async () => {
    if (!sourceEnabled || !items.length || running) return
    controller.current?.abort()
    const local = new AbortController()
    controller.current = local
    setRunning(true); setError(''); setRows([])
    try {
      const result = await scanWatchSignals(rpc, items, { signal: local.signal, onProgress: setRows })
      if (!local.signal.aborted) setRows(result)
    } catch {
      if (!local.signal.aborted) setError('signal.error')
    } finally {
      if (controller.current === local) { controller.current = null; setRunning(false) }
    }
  }
  const stop = () => {
    controller.current?.abort()
    controller.current = null
    setRunning(false); setError('signal.cancelled')
  }
  const completed = rows.filter(row => row.status !== 'pending' && row.status !== 'skipped').length
  return <section className="dxs-signal" aria-labelledby="dxs-signal-title">
    <header className="dxs-signal-head">
      <div><h2 id="dxs-signal-title">{t('signal.title')}</h2><p>{t('signal.subtitle')}</p></div>
      {running ? <button type="button" onClick={stop}>{t('signal.cancel')}</button>
        : <button type="button" className="dxs-primary" onClick={() => { void run() }} disabled={!sourceEnabled || !items.length}>{t(rows.length ? 'signal.rerun' : 'signal.run')}</button>}
    </header>
    {!items.length ? <p className="dxs-muted">{t('signal.empty')}</p>
      : !sourceEnabled ? <p className="dxs-muted">{t('signal.disabled')}</p>
        : !rows.length ? <p className="dxs-muted">{t('signal.idle')}</p> : null}
    {rows.length ? <p className="dxs-signal-progress" role="status">{running ? `${t('signal.running')} · ` : ''}{t('signal.progress', { completed, total: rows.length })}</p> : null}
    {error ? <p className="dxs-signal-warning" role="status">{t(error)}</p> : null}
    {rows.some(row => row.replay?.status === 'ready') ? <p className="dxs-signal-warning">{t('signal.replay-warning')}</p> : null}
    {rows.length ? <ol className="dxs-signal-list">{rows.map(row => <SignalRow key={row.symbol} row={row} t={t} format={format} onOpen={onOpen} />)}</ol> : null}
    {scope ? <WatchSchedulePanel rpc={rpc} scope={scope} items={items} sourceEnabled={sourceEnabled} t={t} format={format} onOpen={onOpen} /> : null}
    <details className="dxs-signal-method"><summary>{t('signal.method')}</summary><p>{t('signal.method-body')}</p><p>{t('signal.notice')}</p><p>{t('signal.time-note')}</p><p>{t('signal.storage-note')}</p></details>
  </section>
}
