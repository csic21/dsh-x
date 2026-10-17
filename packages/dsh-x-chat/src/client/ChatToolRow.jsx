import React from 'react'
import { chatViewModel } from './model.js'

export function ChatToolRow({ phase, block, inspect, useDisclosure, t }) {
  const { expanded, toggle } = useDisclosure()
  const view = chatViewModel(phase, block)
  const busy = phase !== 'result'
  return <section className="dxc-card" aria-label={t('title')} data-state={view.state} aria-busy={busy}>
    <div className="dxc-heading">
      <button type="button" className="dxc-disclosure" onClick={toggle} aria-expanded={expanded}
        aria-label={t(expanded ? 'details.hide' : 'details.show')}>
        <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
        <strong>{t('title')}</strong>
        <span role="status">{t(`status.${view.state}`)}</span>
      </button>
      {inspect && <button type="button" className="dxc-inspect" onClick={inspect} title={t('inspect')}>{t('inspect')}</button>}
    </div>
    {view.errorKey && <p className="dxc-error" role="alert">{t(view.errorKey)}</p>}
    {view.truncated && <p className="dxc-warning" role="status">{t('truncated')}</p>}
    {expanded && <div className="dxc-details">
      <dl>
        {['provider', 'model', 'prompt', 'context'].filter(key => view[key] !== '').map(key => <React.Fragment key={key}>
          <dt>{t(key)}</dt><dd data-chat-field={key}>{view[key]}</dd>
        </React.Fragment>)}
      </dl>
      {phase === 'result' && !view.errorKey && <div>
        <strong>{t('answer')}</strong>
        {view.text !== '' ? <pre className="dxc-answer">{view.text}</pre> : <p>{t('empty')}</p>}
      </div>}
    </div>}
  </section>
}
