import React from 'react'
import { planErrorKey } from './locales.js'
import { checkSummary, readPresentation, taskStatus } from './presentation.js'

export function PlanToolRow({ toolName, phase, block, t, formatCount, openFile, inspect }) {
  const settled = phase === 'result'
  const meta = settled && !block.isError ? readPresentation(block.meta) : null
  if (meta?.version === 2 && meta.workflowState === 'none') return <section className="dxp-tool dxp-empty" aria-label={t(`tool.${toolName}`)}>
    <div className="dxp-heading"><strong>{t(`tool.${toolName}`)}</strong><span className="dxp-status" role="status">{t('task.none')}</span></div>
    <p className="dxp-snapshot">{t('snapshot')}</p>
    <p>{t(meta.operation === 'recover' ? 'next.recovered-empty' : 'next.none')}</p>
    {inspect && <button type="button" className="dxp-inspect" onClick={inspect}>{t('inspect')}</button>}
  </section>
  if (meta?.version === 2) return <TaskCard meta={meta} t={t} formatCount={formatCount} openFile={openFile} inspect={inspect} />
  const state = !settled ? (phase === 'preparing' ? 'preparing' : 'running') : block.isError ? 'failed' : 'done'
  const resultKey = meta?.operation === 'review' ? meta.verdict : meta?.operation
  return <section className="dxp-tool" aria-label={t(`tool.${toolName}`)}>
    <div className="dxp-heading"><strong>{t(`tool.${toolName}`)}</strong><span className="dxp-status" role="status">{t(`state.${state}`)}</span></div>
    {settled && block.isError && <p role="alert" className="dxp-error">{t(planErrorKey(block.error))}</p>}
    {meta && <>
      <p className="dxp-snapshot">{t('snapshot')}</p>
      <p>{t(`result.${resultKey}`, { round: formatCount(meta.round), count: formatCount(meta.attempt) })}</p>
      {meta.operation === 'plan' && <p>{t('plan.notice')}</p>}
      {meta.operation === 'approve' && <p>{t('approve.notice')}</p>}
      {meta.operation === 'discard' && <p>{t('discard.notice')}</p>}
      {meta.verdict === 'stopped' && <p>{t('review.stopped')}</p>}
      {meta.missingVerdict && <p role="alert">{t('review.missing-verdict')}</p>}
      {meta.path && <p className="dxp-path"><span>{t('file.path')}: </span><span>{meta.path}</span>{openFile && <button type="button" onClick={() => openFile(meta.path)}>{t('file.open')}</button>}</p>}
      {meta.body && <pre className="dxp-body">{meta.body}</pre>}
    </>}
    {settled && !block.isError && !meta && <><p>{t('legacy')}</p><pre className="dxp-body">{(block.content ?? []).filter(item => item.type === 'text').map(item => item.text).join('\n')}</pre></>}
    {inspect && <button type="button" className="dxp-inspect" onClick={inspect}>{t('inspect')}</button>}
  </section>
}

function TaskCard({ meta, t, formatCount, openFile, inspect }) {
  const status = taskStatus(meta)
  const summary = checkSummary(meta)
  const blockedQuestions = meta.questions.filter(question => question.blocking).length
  const hasObservedChecks = meta.checks.some(check => check.status !== 'not-run')
  const nextKey = meta.operation === 'recover' ? 'next.recover'
    : status.key === 'task.stopped' ? 'next.stopped'
    : meta.workflowState === 'draft' && blockedQuestions > 0 ? 'next.questions'
    : status.key === 'result.incomplete' ? 'next.unverified'
      : meta.operation === 'review' && meta.verdict === 'fail' ? 'next.fail'
        : status.key === 'task.inconclusive' ? 'next.inconclusive'
          : `next.${meta.workflowState}`
  const knownReasons = ['draft_ready', 'operation_locked', 'repository_changed', 'review_limit', 'review_inconclusive', 'interrupted_runtime', 'task_interrupted', 'recovered_interrupted_task', 'legacy_requires_approval', 'discarded', 'replaced_by_draft', 'multiple_active_rounds']
  const reason = knownReasons.includes(meta.reason) ? t(`reason.${meta.reason}`) : meta.reason
  return <section className="dxp-tool dxp-task" data-plan-state={meta.workflowState} aria-label={t('task.label', { goal: meta.goal })}>
    <div className="dxp-heading">
      <div className="dxp-title"><span className="dxp-eyebrow">{t('task.title')}</span><strong>{meta.goal || t('task.untitled')}</strong></div>
      <span className={`dxp-status dxp-${status.tone}`} role="status">{t(status.key)}</span>
    </div>
    <div className="dxp-meta"><span>{t('task.version', { round: formatCount(meta.round), revision: formatCount(meta.revision) })}</span><span>{t('snapshot')}</span></div>
    <dl className="dxp-roles">
      <div><dt>{t('role.planner')}</dt><dd>{meta.planner || t('value.unavailable')}</dd></div>
      <div><dt>{t('role.executor')}</dt><dd>{t('role.current-session')}</dd></div>
      <div><dt>{t('role.reviewer')}</dt><dd>{meta.reviewer || t('value.unavailable')}</dd></div>
    </dl>
    <p className="dxp-counts">{t('task.counts', { files: formatCount(meta.files.length), steps: formatCount(meta.steps.length), checks: formatCount(meta.checks.length) })}</p>
    {blockedQuestions > 0 && <p className="dxp-warning">{t('task.blocking', { count: formatCount(blockedQuestions) })}</p>}
    {(hasObservedChecks || ['review', 'status'].includes(meta.operation)) && <div className="dxp-evidence" aria-label={t('checks.title')}>
      <strong>{t('checks.title')}</strong>
      {meta.checks.length ? <p>{t('checks.summary', { passed: formatCount(summary.counts.passed), failed: formatCount(summary.counts.failed), inconclusive: formatCount(summary.counts.inconclusive), pending: formatCount(summary.counts['not-run']) })}</p> : <p>{t('checks.empty')}</p>}
    </div>}
    {status.key === 'result.incomplete' && <p role="alert" className="dxp-warning">{t('checks.incomplete')}</p>}
    {reason && <div className="dxp-reason"><strong>{t('reason.title')}</strong><p>{reason}</p></div>}
    <p className="dxp-next">{t(nextKey)}</p>
    {meta.workflowState === 'cancelled' && <p className="dxp-warning">{t('discard.notice')}</p>}
    <details className="dxp-details">
      <summary>{t('details.plan')}</summary>
      <div className="dxp-detail-content">
        <section><h4>{t('files.title')}</h4>{meta.files.length ? <ul className="dxp-file-list">{meta.files.map((file, index) => <li key={`${index}:${file}`}>{file}</li>)}</ul> : <p>{t('files.empty')}</p>}</section>
        <section><h4>{t('steps.title')}</h4><ol>{meta.steps.map((step, index) => <li key={`${index}:${step.id}`}><span className="dxp-item-id">{step.id}</span>{step.title}</li>)}</ol></section>
        <section><h4>{t('questions.title')}</h4>{meta.questions.length ? <ul>{meta.questions.map((question, index) => <li key={index}><span className={`dxp-tag ${question.blocking ? 'dxp-warning' : ''}`}>{t(question.blocking ? 'question.blocking' : 'question.assumption')}</span>{question.text}</li>)}</ul> : <p>{t('questions.empty')}</p>}</section>
        <section><h4>{t('checks.title')}</h4><p className="dxp-muted">{t('checks.notice')}</p>{meta.checks.length ? <ol className="dxp-checks">{meta.checks.map((check, index) => <li key={`${index}:${check.id}`}>
          <div className="dxp-check-heading"><span className="dxp-item-id">{check.id}</span><span className={`dxp-check-state dxp-check-${check.status}`}>{t(`check.${check.status}`)}</span>{Number.isSafeInteger(check.exitCode) && <span className="dxp-muted">{t('check.exit', { code: formatCount(check.exitCode) })}</span>}</div>
          <pre className="dxp-command">{check.command}</pre>
        </li>)}</ol> : <p>{t('checks.empty')}</p>}</section>
      </div>
    </details>
    <details className="dxp-details dxp-technical">
      <summary>{t('details.record')}</summary>
      <div className="dxp-detail-content">
        <dl className="dxp-record"><dt>{t('file.path')}</dt><dd>{meta.path || t('value.unavailable')}</dd><dt>{t('task.hash')}</dt><dd>{meta.hash}</dd></dl>
        <p className="dxp-muted">{t('raw.notice')}</p>
        <pre className="dxp-body">{meta.body || t('raw.empty')}</pre>
      </div>
    </details>
    <div className="dxp-actions">
      {meta.path && openFile && <button type="button" onClick={() => openFile(meta.path)}>{t('file.open')}</button>}
      {inspect && <button type="button" className="dxp-inspect" onClick={inspect}>{t('inspect')}</button>}
    </div>
  </section>
}
