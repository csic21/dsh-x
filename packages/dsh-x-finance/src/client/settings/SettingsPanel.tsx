import React, { useEffect, useRef } from 'react'
import { bossKeyShortcutKeys, bossKeyShortcutLabel, fixedBarShortcutKeys, fixedBarShortcutLabel } from '../shortcut.ts'
import { SourceSwitch } from '../market/gate.tsx'
import { useFinanceSettings } from './store.ts'

function Keys({ keys, label }: any) {
  return <span className="dxs-set-keys" role="img" aria-label={label}>
    {keys.map((key: string) => <kbd key={key}>{key}</kbd>)}
  </span>
}

function Switch({ id, label, checked, disabled = false, onChange }: any) {
  return <label className="dxs-set-switch">
    <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} aria-label={label} onChange={event => onChange(event.target.checked)} />
    <span className="dxs-set-switch-track" aria-hidden="true"><span /></span>
  </label>
}

function Row({ id, label, hint, children }: any) {
  return <div className="dxs-set-row">
    <div className="dxs-set-copy">
      {id ? <label htmlFor={id}>{label}</label> : <span className="dxs-set-name">{label}</span>}
      {hint ? <p>{hint}</p> : null}
    </div>
    <div className="dxs-set-control">{children}</div>
  </div>
}

/**
 * The one place that collects the display switches. Everything here is local to
 * this browser: the quiet mode never changes which requests are made, and the
 * market switch still writes through the profile preference it always used.
 */
export function SettingsPanel({ settings, t, preference, onSourceChange, barHidden, onSetBarVisible, scopeReady, onClose }: any) {
  const appearance = useFinanceSettings(settings)
  const closeRef = useRef<any>(null)
  // Keep the latest close handler without re-running the mount effect: a
  // passing render (for example the quiet switch) must not steal focus.
  const closeHandler = useRef(onClose)
  closeHandler.current = onClose
  const bossLabel = bossKeyShortcutLabel()
  useEffect(() => {
    closeRef.current?.focus?.()
    const escape = (event: any) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation?.()
      closeHandler.current()
    }
    globalThis.addEventListener?.('keydown', escape, true)
    return () => globalThis.removeEventListener?.('keydown', escape, true)
  }, [])
  const sourceReady = preference.status === 'ready'
  return <div className="dxs-set-layer" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="dxs-set-panel" role="dialog" aria-modal="true" aria-labelledby="dxs-set-title">
      <header className="dxs-set-head">
        <div>
          <h2 id="dxs-set-title">{t(appearance.discreet ? 'settings.title.quiet' : 'settings.title')}</h2>
          <p>{t('settings.local-only')}</p>
        </div>
        <button ref={closeRef} type="button" className="dxs-set-close" aria-label={t('settings.close')} title={t('settings.close')} onClick={onClose}>✕</button>
      </header>
      <div className="dxs-set-body">
        {appearance.storageError ? <p role="alert" className="dxs-set-error">{t('settings.storage-error')}</p> : null}

        <section className="dxs-set-section" aria-labelledby="dxs-set-appearance-title">
          <h3 id="dxs-set-appearance-title">{t('settings.section.appearance')}</h3>
          <Row id="dxs-set-discreet" label={t('settings.discreet.label')} hint={t('settings.discreet.hint')}>
            <Switch id="dxs-set-discreet" label={t('settings.discreet.label')} checked={appearance.discreet} onChange={(value: boolean) => settings?.setDiscreet?.(value)} />
          </Row>
          <div className="dxs-set-meta">
            <span className="dxs-set-badge">{t('settings.discreet.badge', { shortcut: bossLabel })}</span>
            <Keys keys={bossKeyShortcutKeys()} label={bossLabel} />
          </div>
          {appearance.discreet ? <p role="status" className="dxs-set-status">{t('settings.discreet.on', { shortcut: bossLabel })}</p> : null}
        </section>

        <section className="dxs-set-section" aria-labelledby="dxs-set-bar-title">
          <h3 id="dxs-set-bar-title">{t('settings.section.bar')}</h3>
          <Row id="dxs-set-bar-toggle" label={t('settings.bar.label')} hint={scopeReady ? t('settings.bar.hint') : t('settings.bar.unavailable')}>
            <Switch id="dxs-set-bar-toggle" label={t('settings.bar.label')} checked={!barHidden} disabled={!scopeReady} onChange={(visible: boolean) => onSetBarVisible?.(visible)} />
          </Row>
          <Row id="dxs-set-bar-keep" label={t('settings.bar.keep.label')} hint={t('settings.bar.keep.hint')}>
            <Switch id="dxs-set-bar-keep" label={t('settings.bar.keep.label')} checked={appearance.barInDiscreet} onChange={(keep: boolean) => settings?.setBarInDiscreet?.(keep)} />
          </Row>
          {appearance.discreet && !appearance.barInDiscreet ? <p role="status" className="dxs-set-status">{t('settings.bar.keep.status')}</p> : null}
          <p className="dxs-set-meta"><Keys keys={fixedBarShortcutKeys()} label={fixedBarShortcutLabel()} /><span>{t('settings.shortcut.bar')}</span></p>
        </section>

        <section className="dxs-set-section" aria-labelledby="dxs-set-source">
          <h3 id="dxs-set-source">{t('settings.section.source')}</h3>
          <div className="dxs-set-source">
            <span className="dxs-set-name">{t('settings.source.label')}</span>
            <p>{t('settings.source.hint')}</p>
            <div className="dxs-set-source-control">
              <SourceSwitch preference={preference} onChange={onSourceChange} t={t} large />
              <span className="dxs-set-state">{sourceReady ? t(preference.enabled ? 'market.source.enabled' : 'market.source.disabled') : preference.status === 'error' ? t('market.source.unavailable') : t('settings.source.loading')}</span>
            </div>
            {preference.forced ? <p className="dxs-set-note">{t('settings.source.forced')}</p> : null}
            {preference.status === 'error' || (preference.error && sourceReady) ? <p role="alert" className="dxs-set-error">{t('settings.source.error')}</p> : null}
          </div>
        </section>

        <section className="dxs-set-section" aria-labelledby="dxs-set-shortcuts">
          <h3 id="dxs-set-shortcuts">{t('settings.section.shortcuts')}</h3>
          <div className="dxs-set-shortcuts">
            <div className="dxs-set-shortcut"><span>{t('settings.shortcut.bar')}</span><Keys keys={fixedBarShortcutKeys()} label={fixedBarShortcutLabel()} /></div>
            <div className="dxs-set-shortcut"><span>{t('settings.shortcut.discreet')}</span><Keys keys={bossKeyShortcutKeys()} label={bossLabel} /></div>
          </div>
          <p className="dxs-set-note">{t('settings.shortcut.typing')}</p>
        </section>
      </div>
      <footer className="dxs-set-foot">
        <button type="button" className="dxs-primary" onClick={onClose}>{t('settings.done')}</button>
      </footer>
    </section>
  </div>
}
