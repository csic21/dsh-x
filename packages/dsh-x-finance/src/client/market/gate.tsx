// Shared opt-in gate for the market and global tabs. Both tabs read the same
// per-profile switch, so a host without the switch (or with an unreadable
// profile) must show the same honest setup card instead of sample numbers.
import React from 'react'

export function SourceSwitch({ preference, onChange, t, large = false }: any) {
  const ready = preference.status === 'ready'
  const disabled = !ready || preference.busy || preference.forced
  const title = preference.status === 'error'
    ? t('market.source.unavailable')
    : preference.forced
      ? t('market.source.forced')
      : t('market.source.switch-aria')
  return <label className={`dxs-mkt-source-switch ${large ? 'is-large' : ''}`} title={title}>
    <input type="checkbox" role="switch" checked={preference.enabled} disabled={disabled} onChange={event => onChange(event.target.checked)} aria-label={t('market.source.switch-aria')} />
    <span className="dxs-mkt-switch-track" aria-hidden="true"><span /></span>
    <span className="dxs-mkt-switch-label">{t('market.source.switch')}</span>
  </label>
}

export function MarketUnconfigured({ t, preference, onChange, onRetry, title, body }: any) {
  return <section className="dxs-mkt-card dxs-mkt-setup">
    <h3>{title ?? t('market.unconfigured-title')}</h3>
    <p>{body ?? t('market.unconfigured-body')}</p>
    <div className="dxs-mkt-setup-switch">
      <SourceSwitch preference={preference} onChange={onChange} t={t} large />
      <span>{preference.enabled ? t('market.source.enabled') : t('market.source.disabled')}</span>
    </div>
    <p className="dxs-mkt-muted">{t('market.source.persist')}</p>
    {preference.status === 'error' ? <p role="alert" className="dxs-mkt-error">{t('market.source.unavailable')}</p> : null}
    {preference.error && preference.status === 'ready' ? <p role="alert" className="dxs-mkt-error">{t('market.source.preference-error')}</p> : null}
    <details className="dxs-mkt-manual-config">
      <summary>{t('market.unconfigured-manual')}</summary>
      <p className="dxs-mkt-muted">{t('market.unconfigured-config')}</p>
      <pre>{`- id: dsh-x-finance\n  name: dsh-x-finance\n  config:\n    marketSource: true`}</pre>
    </details>
    <button type="button" onClick={onRetry}>{t('market.unconfigured-retry')}</button>
  </section>
}

export function MarketErrorCard({ t, onRetry, preference, onChange, title }: any) {
  return <section className="dxs-mkt-card dxs-mkt-setup" role="alert">
    <h3>{title ?? t('market.error')}</h3>
    <p>{t('market.error-hint')}</p>
    <div className="dxs-mkt-setup-switch">
      <SourceSwitch preference={preference} onChange={onChange} t={t} large />
      <span>{preference.enabled ? t('market.source.enabled') : t('market.source.disabled')}</span>
    </div>
    <button type="button" onClick={onRetry}>{t('market.retry')}</button>
  </section>
}
