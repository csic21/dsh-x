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

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0 B'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function fileName(value: string): string {
  return value.split(/[\\/]/).pop() || value
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

  async function action(endpoint: string): Promise<void> {
    setBusy(true)
    setFailure(null)
    try {
      const result = await rpc.call('/api', endpoint, {})
      if (!result?.ok) throw new Error(result?.error?.message ?? 'Update request failed')
      if (result.value) setStatus(result.value)
    } catch (error) {
      if (alive.current) setFailure(error instanceof Error ? error.message : String(error))
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  const total = view.progress?.total ?? null
  const received = view.progress?.received ?? 0
  const progressText = total
    ? t('progress.bytes', { received: formatBytes(received), total: formatBytes(total) })
    : t('progress.total-unknown', { received: formatBytes(received) })

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

    {view.pendingKey && <p className="dxu-callout">{t(view.pendingKey, view.pendingParams)}</p>}

    {view.progress && <div className="dxu-progress" aria-live="polite">
      <p>{t('progress.file', { file: fileName(view.progress.file) })} <span className="dxu-muted">{progressText}</span></p>
      <progress value={received} max={total ?? undefined} />
    </div>}

    <dl className="dxu-versions">
      <dt>{t('current.app')}</dt>
      <dd>{view.appVersion ?? t('current.unknown')} <span className="dxu-arrow" aria-hidden="true">→</span> {view.availableAppVersion ?? t('latest.none')}</dd>
      <dt>{t('current.kernel')}</dt>
      <dd>{view.kernelVersion ?? t('current.unknown')} <span className="dxu-arrow" aria-hidden="true">→</span> {view.availableKernelVersion ?? t('latest.none')}</dd>
      <dt>{t('current.plugins')}</dt>
      <dd>{view.pluginVersion ?? t('current.unknown')} <span className="dxu-muted">({view.pluginCount})</span> <span className="dxu-arrow" aria-hidden="true">→</span> {view.availablePluginVersion ?? t('latest.none')}</dd>
    </dl>

    <div className="dxu-actions">
      <button type="button" onClick={() => void action('dsh-x-update/check')} disabled={!view.canCheck || busy}>
        {t('action.check')}
      </button>
      {view.canDownload && <button type="button" className="dxu-primary" onClick={() => void action('dsh-x-update/stage')} disabled={busy}>
        {t('action.download')}
      </button>}
      {view.state === 'error' && <button type="button" onClick={() => void action('dsh-x-update/check')} disabled={busy}>
        {t('action.retry')}
      </button>}
      <a className="dxu-link" href={view.releaseUrl} target="_blank" rel="noreferrer">{t('action.release')}</a>
    </div>

    <p className="dxu-note">{t('note')}</p>
    <p className="dxu-muted">{t('source', { repository: view.repository })}</p>
  </section>
}
