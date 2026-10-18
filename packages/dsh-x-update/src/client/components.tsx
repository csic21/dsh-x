import React, { useEffect, useRef, useState } from 'react'
import { updateViewModel } from './model.ts'
import type { UpdateStatus } from '../types.ts'

export interface UpdateSectionProps {
  close?: () => void
  rpc: {
    call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<any>
  }
  t?: (key: string, params?: Record<string, unknown>) => string
}

export function UpdateSection({ rpc, t = key => key, close: _close }: UpdateSectionProps) {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  const view = updateViewModel(status)

  useEffect(() => {
    alive.current = true
    const controller = new AbortController()
    const tick = async () => {
      try {
        const result = await rpc.call('/api', 'dsh-x-update/status', {}, controller.signal)
        if (!alive.current) return
        if (result?.ok) setStatus(result.value)
      } catch { /* Status polling is best-effort. */ }
    }
    void tick()
    const timer = setInterval(tick, 2500)
    return () => { alive.current = false; controller.abort(); clearInterval(timer) }
  }, [rpc])

  async function check(): Promise<void> {
    setBusy(true)
    setFailure(null)
    try {
      const result = await rpc.call('/api', 'dsh-x-update/check', {})
      if (!result?.ok) throw new Error(result?.error?.message ?? 'Update check failed')
      if (result.value) setStatus(result.value)
    } catch (error) {
      if (alive.current) setFailure(error instanceof Error ? error.message : String(error))
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  return <section className="dxu" aria-labelledby="dxu-title" data-state={view.state} data-tone={view.tone}>
    <header className="dxu-head">
      <h1 id="dxu-title">{t('title')}</h1>
      <p className="dxu-muted">{t('description')}</p>
    </header>

    <div className={`dxu-status dxu-tone-${view.tone}`} role="status" aria-live="polite">
      <strong>{t(view.statusKey)}</strong>
      <span>{t(view.reasonKey)}</span>
    </div>

    {failure && <p className="dxu-error" role="alert">{failure}</p>}
    {view.error && <p className="dxu-error" role="alert">{t('error.prefix')}{view.error}</p>}

    <dl className="dxu-versions">
      <dt>{t('current.plugins')}</dt>
      <dd>{view.pluginVersion ?? t('current.unknown')} <span className="dxu-muted">({view.pluginCount})</span> <span className="dxu-arrow" aria-hidden="true">→</span> {view.availablePluginVersion ?? t('latest.none')}</dd>
      <dt>{t('current.runtime')}</dt>
      <dd>{view.runtimeVersion ?? t('current.unknown')} <span className="dxu-arrow" aria-hidden="true">→</span> {view.availableRuntime ?? t('latest.none')}</dd>
    </dl>

    <div className="dxu-actions">
      <button type="button" onClick={() => void check()} disabled={!view.canCheck || busy}>
        {t('action.check')}
      </button>
      <a className="dxu-link" href={view.releaseUrl} target="_blank" rel="noreferrer">{t('action.release')}</a>
    </div>

    <p className="dxu-note">{t('note')}</p>
    <p className="dxu-muted">{t('source', { repository: view.repository })}</p>
  </section>
}
