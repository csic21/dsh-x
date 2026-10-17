import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'

export function BrowserIcon() { return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 7h14M5 17h14"/></svg> }
export function BrowserEntry({ open, t }) { return <button type="button" className="dxb-entry" data-testid="dxb-entry" title={t('open')} onClick={open}><BrowserIcon/><span>{t('title')}</span></button> }
export function BrowserTitle({ useTabInfo }) { const { tab } = useTabInfo(); return <><BrowserIcon/>{tab.title}</> }
export function BrowserBody({ sessionId, useTabInfo, createController, t }) {
  const { tab } = useTabInfo(), host = useRef(null), controller = useRef(null)
  const [state, setState] = useState({ status: 'loading', ready: false, granted: false, url: '', title: '', error: null }), [address, setAddress] = useState(''), [consent, setConsent] = useState(false)
  useEffect(() => {
    const owner = createController({ sessionId, clientTabId: tab.id, host: host.current, onOpen: url => tab.actions.openTab('dsh-x-browser', { params: { url }, revealIfOpened: false }) })
    controller.current = owner
    const unsubscribe = owner.subscribe(() => setState(owner.getSnapshot()))
    owner.setVisible(tab.visible)
    const close = () => { void owner.dispose() }
    tab.signal.addEventListener('abort', close, { once: true })
    void owner.start().then(() => { if (tab.navigation.params?.url && owner.getSnapshot().ready) void owner.navigate(tab.navigation.params.url) })
    const unbind = tab.actions.bindCommands({ refresh: () => { void owner.manual('reload') } })
    return () => { unsubscribe(); unbind(); tab.signal.removeEventListener('abort', close); void owner.dispose(); if (controller.current === owner) controller.current = null }
  }, [sessionId, tab.id, tab.signal, createController])
  useLayoutEffect(() => { controller.current?.setVisible(tab.visible); if (!tab.visible) setConsent(false) }, [tab.visible])
  useEffect(() => { setAddress(state.url) }, [state.url])
  const status = ['loading', 'unavailable', 'running', 'ready', 'disconnected', 'hidden', 'stopped'].includes(state.status) ? state.status : 'manual'
  return <section className="dxb-pane" data-testid="dxb-pane" aria-label={t('title')}>
    <form className="dxb-toolbar" onSubmit={event => { event.preventDefault(); void controller.current?.navigate(address) }}>
      <button type="button" title={t('back')} aria-label={t('back')} disabled={!state.ready || !state.canGoBack} onClick={() => controller.current?.manual('back')}>‹</button>
      <button type="button" title={t('forward')} aria-label={t('forward')} disabled={!state.ready || !state.canGoForward} onClick={() => controller.current?.manual('forward')}>›</button>
      <button type="button" title={t(state.loading ? 'stop' : 'reload')} aria-label={t(state.loading ? 'stop' : 'reload')} disabled={!state.ready} onClick={() => controller.current?.manual(state.loading ? 'stop' : 'reload')}>{state.loading ? '×' : '↻'}</button>
      <input data-testid="dxb-address" aria-label={t('address')} placeholder="https://" value={address} onChange={event => setAddress(event.target.value)} spellCheck={false}/>
      <button data-testid="dxb-go" type="submit" disabled={!state.ready || !address.trim()}>{t('go')}</button>
      <button type="button" title={t('newTab')} aria-label={t('newTab')} onClick={() => tab.actions.openTab('dsh-x-browser', { revealIfOpened: false })}>＋</button>
    </form>
    <div className="dxb-control" data-active={state.granted || undefined}>
      <span role="status" data-testid="dxb-status" className="dxb-status"><span className="dxb-dot"/>{t(status)}</span>
      {state.granted ? <button type="button" className="dxb-takeover" data-testid="dxb-takeover" onClick={() => { setConsent(false); void controller.current?.takeover() }}>{t('takeover')}</button> : <button type="button" data-testid="dxb-enable-ai" disabled={!state.ready || !tab.visible} onClick={() => setConsent(true)}>{t('enable')}</button>}
    </div>
    {consent && <section className="dxb-consent" role="dialog" aria-label={t('enable')}><p>{t('consent')}</p><div><button type="button" onClick={() => setConsent(false)}>{t('cancel')}</button><button type="button" className="dxb-primary" data-testid="dxb-confirm-ai" onClick={() => { setConsent(false); void controller.current?.grant() }}>{t('grant')}</button></div></section>}
    {state.error && <div className="dxb-error" role="alert"><p>{t(state.status === 'unavailable' ? 'desktopOnly' : 'error')}</p><details><summary>{t('details')}</summary><p>{state.error}</p></details></div>}
    <div className="dxb-viewport"><div className="dxb-guest-host" ref={host}/>{!state.url && !state.error && <div className="dxb-placeholder"><BrowserIcon/><p>{t(state.ready ? 'start' : 'loading')}</p></div>}</div>
    <footer className="dxb-footer"><span>{t('experimental')}</span><details><summary>{t('details')}</summary><p>{t('privacy')}</p><p>{t('limitations')}</p></details></footer>
  </section>
}
