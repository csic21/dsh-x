import React from 'react'
import { planErrorKey } from './locales.js'
import { readPresentation } from './presentation.js'

export function PlanToolRow({ toolName, phase, block, t, formatCount, openFile, inspect }) {
  const settled = phase === 'result'
  const meta = settled ? readPresentation(block.meta) : null
  const state = !settled ? (phase === 'preparing' ? 'preparing' : 'running') : block.isError ? 'failed' : 'done'
  const resultKey = meta?.operation === 'review' ? meta.verdict : meta?.operation
  return <section className="dxp-tool" aria-label={t(`tool.${toolName}`)}>
    <strong>{t(`tool.${toolName}`)}</strong>
    <p role="status">{t(`state.${state}`)}</p>
    {settled && block.isError && <p role="alert">{t(planErrorKey(block.error))}</p>}
    {meta && !block.isError && <>
      <p>{t(`result.${resultKey}`, { round: formatCount(meta.round), count: formatCount(meta.attempt) })}</p>
      {meta.operation === 'plan' && <p>{t('plan.notice')}</p>}
      {meta.operation === 'approve' && <p>{t('approve.notice')}</p>}
      {meta.verdict === 'stopped' && <p>{t('review.stopped')}</p>}
      {meta.missingVerdict && <p role="alert">{t('review.missing-verdict')}</p>}
      {meta.path && <p><span>{t('file.path')}: </span><span>{meta.path}</span>{openFile && <button onClick={() => openFile(meta.path)}>{t('file.open')}</button>}</p>}
      {meta.body && <pre className="dxp-body">{meta.body}</pre>}
    </>}
    {settled && !block.isError && !meta && <><p>{t('legacy')}</p><pre className="dxp-body">{(block.content ?? []).filter(item => item.type === 'text').map(item => item.text).join('\n')}</pre></>}
    {inspect && <button onClick={inspect}>{t('inspect')}</button>}
  </section>
}
