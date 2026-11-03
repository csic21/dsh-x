import React, { useCallback, useEffect, useState } from 'react'
import { NS, en, zh } from './locales.ts'

/** The snapshot the host route returns. */
interface StatsSnapshot {
  totals: { chains: number, steps: number, saved: number, stopped: number }
  sessions: { sessionId: string, chains: number, steps: number, saved: number, stopped: number, lastAt: number }[]
  updatedAt: number
}

type Translate = (key: string, params?: Record<string, unknown>) => string

/** The client services this plugin consumes. */
export interface ChainClientContext {
  effect(fn: () => unknown, label?: string): unknown
  connection: { rpc: { call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<unknown> } }
  locale: {
    register(namespace: string, dictionaries: { zh: typeof zh, en: typeof en }): unknown
    bind(namespace: string): Translate
  }
  slots: {
    inject(name: string, fn: () => () => void): unknown
    register<P>(options: {
      name: string
      id?: string
      order?: number
      label?: () => string
      locale?: string
      inject?: () => Record<string, unknown>
    }, component: React.ComponentType<P>): () => void
  }
}

export const inject = ['slots', 'connection', 'locale']

const ENDPOINT = 'dsh-x-chain/stats'

const CSS = `
.dxc-page { display: flex; flex-direction: column; gap: 18px; padding: 4px 2px 24px; }
.dxc-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.dxc-head h2 { margin: 0 0 6px; font-size: 17px; font-weight: 600; }
.dxc-head p { margin: 0; max-width: 62ch; font-size: 12.5px; line-height: 1.6; opacity: .68; }
.dxc-refresh { flex: none; border: 1px solid color-mix(in srgb, currentColor 18%, transparent); background: transparent; color: inherit; border-radius: 8px; padding: 6px 12px; font-size: 12px; cursor: pointer; }
.dxc-refresh:hover { background: color-mix(in srgb, currentColor 8%, transparent); }
.dxc-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap: 10px; }
.dxc-stat { border: 1px solid color-mix(in srgb, currentColor 12%, transparent); border-radius: 10px; padding: 12px 14px; }
.dxc-stat span { display: block; font-size: 11.5px; opacity: .62; margin-bottom: 6px; }
.dxc-stat strong { font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; }
.dxc-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.dxc-table th, .dxc-table td { text-align: left; padding: 8px 10px; border-bottom: 1px solid color-mix(in srgb, currentColor 9%, transparent); }
.dxc-table th { font-weight: 500; opacity: .6; font-size: 11.5px; }
.dxc-table td.num { font-variant-numeric: tabular-nums; }
.dxc-muted { opacity: .55; font-size: 12.5px; line-height: 1.6; }
.dxc-error { color: #d9534f; font-size: 12.5px; }
`

/** Unwrap the official connection result envelope. */
function unwrap(value: unknown): StatsSnapshot {
  const result = value as { ok?: boolean, value?: StatsSnapshot, error?: { code?: string } } | undefined
  if (!result?.ok || result.value === undefined) throw new Error(String(result?.error?.code ?? 'CHAIN_STATS_UNAVAILABLE'))
  return result.value
}

/** The settings page: totals plus the newest sessions. */
export function ChainSettings(props: { t: Translate, load: () => Promise<StatsSnapshot> }) {
  const { t, load } = props
  const [data, setData] = useState<StatsSnapshot | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setBusy(true)
    try {
      setData(await load())
      setFailed(false)
    } catch { setFailed(true) }
    finally { setBusy(false) }
  }, [load])

  useEffect(() => { void refresh() }, [refresh])

  const totals = data?.totals
  const sessions = data?.sessions ?? []
  return <section className="dxc-page">
    <header className="dxc-head">
      <div>
        <h2>{t('title')}</h2>
        <p>{t('lead')}</p>
      </div>
      <button type="button" className="dxc-refresh" onClick={() => void refresh()} disabled={busy}>
        {t('refresh')}
      </button>
    </header>
    {failed ? <p className="dxc-error">{t('failed')}</p> : null}
    {data === null && !failed ? <p className="dxc-muted">{t('loading')}</p> : null}
    {totals !== undefined ? <div className="dxc-grid">
      <div className="dxc-stat"><span>{t('chains')}</span><strong>{totals.chains}</strong></div>
      <div className="dxc-stat"><span>{t('steps')}</span><strong>{totals.steps}</strong></div>
      <div className="dxc-stat"><span>{t('saved')}</span><strong>{totals.saved}</strong></div>
      <div className="dxc-stat"><span>{t('stopped')}</span><strong>{totals.stopped}</strong></div>
    </div> : null}
    {totals !== undefined && totals.chains === 0 ? <p className="dxc-muted">{t('empty')}</p> : null}
    {sessions.length > 0 ? <table className="dxc-table">
      <thead>
        <tr>
          <th>{t('session')}</th>
          <th>{t('chains')}</th>
          <th>{t('steps')}</th>
          <th>{t('saved')}</th>
          <th>{t('stopped')}</th>
          <th>{t('last')}</th>
        </tr>
      </thead>
      <tbody>
        {sessions.slice(0, 20).map(session => <tr key={session.sessionId}>
          <td title={session.sessionId}>{session.sessionId.length > 18 ? `${session.sessionId.slice(0, 8)}…${session.sessionId.slice(-6)}` : session.sessionId}</td>
          <td className="num">{session.chains}</td>
          <td className="num">{session.steps}</td>
          <td className="num">{session.saved}</td>
          <td className="num">{session.stopped}</td>
          <td>{session.lastAt > 0 ? new Date(session.lastAt).toLocaleString() : t('na')}</td>
        </tr>)}
      </tbody>
    </table> : null}
  </section>
}

export function apply(ctx: ChainClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'chain: dictionaries')
  const t = ctx.locale.bind(NS)

  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = NS
    style.textContent = CSS
    document.head.appendChild(style)
    return () => style.remove()
  }, 'chain: styles')

  const load = async (): Promise<StatsSnapshot> => unwrap(await ctx.connection.rpc.call('/api', ENDPOINT, {}))

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: NS,
    order: 13,
    locale: NS,
    label: () => t('nav'),
    inject: () => ({ t, load }),
  }, ChainSettings as React.ComponentType<any>))
}
