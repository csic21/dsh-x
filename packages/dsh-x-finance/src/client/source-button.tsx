import React, { useState } from 'react'

/**
 * The one control that turns the shared local source on. The bottom bar, the
 * watchlist detail, the market board and the gold panel all read the same
 * preference, so there is a single opt-in for every quote in this plugin.
 */
export function SourceButton({ preference, t, large = false }: any) {
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false)
  if (preference.status !== 'ready' || preference.enabled) return null
  const enable = async () => {
    setBusy(true); setFailed(false)
    try { await preference.setEnabled(true) } catch { setFailed(true) } finally { setBusy(false) }
  }
  return <button type="button" className={large ? 'dxs-source-enable dxs-primary is-large' : 'dxs-source-enable'} disabled={busy || preference.forced} onClick={enable} title={failed ? t('source.enable-error') : t('source.enable-hint')}>{busy ? t('source.enabling') : t('source.enable')}</button>
}
