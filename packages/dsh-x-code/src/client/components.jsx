import React, { useEffect, useMemo, useRef, useState } from 'react'
import { CodeViewer, Tabs } from './CodeViewer.jsx'
import { activeReview, basename, canPrepare, fileGroups, insertRequest, isChanged, isComplete, prepareModels, repairRequest, reviewCanFix, reviewRequest, SEVERITIES, shortHash } from './model.js'
import { en, messageKey } from './locales.js'

export function CodeIcon() { return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18" strokeLinecap="round" strokeLinejoin="round" /></svg> }
export function CodeEntry({ open, t }) { return <button type="button" className="dxc-entry" onClick={open} title={t('open')}><CodeIcon /><span>{t('title')}</span></button> }
export function CodePanel({ renderSlot }) { return renderSlot('dsh-x-code.workspace', {}) }

function FileNavigator({ files, path, selected, select, open, t, limit, snapshot, reviewed }) {
  const [filter, setFilter] = useState('changed'), [query, setQuery] = useState('')
  const groups = useMemo(() => fileGroups(files, query, reviewed ? 'all' : filter), [files, query, filter, reviewed])
  return <aside className="dxc-files" aria-label={t('files')}>
    <div className="dxc-section-title"><strong>{t('files')}</strong><span>{t('fileCount', { count: files.length })}</span></div>
    {!reviewed && <Tabs label={t('files')} value={filter} onChange={setFilter} items={[{ value: 'changed', label: t('changed') }, { value: 'all', label: t('all') }]} />}
    <div className="dxc-file-search"><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('searchFiles')} aria-label={t('fileSearchLabel')} /></div>
    <div className="dxc-file-list">{groups.length ? groups.map(group => <details className="dxc-directory" key={group.directory} open><summary title={group.directory}>{group.directory || t('rootFiles')}</summary><ul>{group.files.map(file => <li key={file.path} data-selected={path === file.path || undefined}>
      {!reviewed && <input type="checkbox" aria-label={t('selectFile', { path: file.path })} checked={selected.includes(file.path)} disabled={!file.selectable || !selected.includes(file.path) && selected.length >= limit} onChange={() => select(file.path)} />}
      <button type="button" className="dxc-file" aria-current={path === file.path ? 'true' : undefined} aria-label={t('openFile', { path: file.path })} title={file.path} onClick={() => open(file.path)}><span className="dxc-file-name">{basename(file.path)}</span><span className={`dxc-file-status dxc-status-${file.status}`} title={t(Object.hasOwn(en, `file.${file.status}`) ? `file.${file.status}` : 'file.modified')}>{isChanged(file) ? ({ added: 'A', deleted: 'D', renamed: 'R', untracked: 'U', conflicted: '!' }[file.status] ?? 'M') : ''}</span></button>
    </li>)}</ul></details>) : <p className="dxc-state">{t(filter === 'changed' && !query && !reviewed ? 'noChanges' : 'noFiles')}</p>}</div>
    <footer className="dxc-file-footer">{reviewed ? <span>{t('reviewedOnly')}</span> : <><span>{t('selection', { count: selected.length })}</span><button type="button" onClick={() => select(selected.length ? null : 'all')}>{t(selected.length ? 'clearSelection' : 'selectChanged')}</button></>}{snapshot.truncated && <p className="dxc-inline-warning">{t('partialFiles')}</p>}</footer>
  </aside>
}

function FindingCard({ finding, selected, toggle, jump, disabled, t }) {
  return <article className="dxc-finding" data-severity={finding.severity}>
    <div className="dxc-finding-top"><label><input type="checkbox" checked={selected} disabled={disabled} onChange={toggle} aria-label={t('selectFinding', { title: finding.title })} /><span className={`dxc-severity dxc-severity-${finding.severity}`}>{t(`severity.${finding.severity}`)}</span></label><span className="dxc-finding-id">{finding.id.slice(0, 7)}</span></div>
    <button type="button" className="dxc-finding-title" onClick={jump}>{finding.title}</button>
    <button type="button" className="dxc-location" title={finding.path} aria-label={t('findingLocation', { path: finding.path, line: finding.startLine })} onClick={jump}>{basename(finding.path)}<span>:{finding.startLine}{finding.endLine !== finding.startLine ? `–${finding.endLine}` : ''}</span></button>
    <p className="dxc-finding-body">{finding.body}</p>
    {(finding.evidence || finding.trigger) && <details><summary>{t('details')}</summary>{finding.evidence && <div><span className="dxc-detail-label">{t('evidence')}</span><pre>{finding.evidence}</pre></div>}{finding.trigger && <div><span className="dxc-detail-label">{t('trigger')}</span><p>{finding.trigger}</p></div>}</details>}
  </article>
}

function Findings({ review, history, historyId, inspectHistory, historyStatus, selected, toggle, jump, fix, rereview, enabled, repairAvailable, t, formatTime }) {
  const [severity, setSeverity] = useState('all')
  const filtered = review?.findings.filter(finding => severity === 'all' || finding.severity === severity) ?? []
  const complete = isComplete(review), repairComplete = review?.repair?.state === 'completed'
  return <aside className="dxc-findings" aria-label={t('findings')}>
    <div className="dxc-section-title"><strong>{t('findings')}</strong>{review && <span>{review.findings.length}</span>}</div>
    {!review && historyId ? <div className="dxc-state" role={historyStatus === 'failed' ? 'alert' : 'status'}><p>{t(historyStatus === 'failed' ? 'historyFailed' : 'historyLoading')}</p>{historyStatus === 'failed' && <button type="button" onClick={() => inspectHistory(historyId)}>{t('retry')}</button>}</div> : !review ? <div className="dxc-empty dxc-findings-empty"><span aria-hidden="true">◎</span><strong>{t('noReview')}</strong><p>{t('noReviewHint')}</p></div> : <>
      <div className="dxc-review-summary"><div className="dxc-review-state" role="status"><span className={`dxc-state-dot dxc-review-${review.state}`} /><strong>{t(Object.hasOwn(en, `state.${review.state}`) ? `state.${review.state}` : 'incomplete')}</strong></div><div className="dxc-muted">{t('coverage', { count: review.paths?.length ?? 0 })} · {shortHash(review.snapshotId)}</div>{review.createdAt && <time className="dxc-muted">{formatTime(review.createdAt)}</time>}
        {review.summary && <details><summary>{t('summary')}</summary><p>{review.summary}</p></details>}
      </div>
      {review.mode !== 'worktree' && complete && <div className="dxc-notice"><p>{t('worktreeFirst')}</p></div>}
      {review.stale && <div className="dxc-notice dxc-warning"><strong>{t('stale')}</strong><p>{t('staleHint')}</p></div>}
      {review.repair && !['running', 'completed'].includes(review.repair.state) && <div className="dxc-notice dxc-warning" role="status"><strong>{t('repairAttempt')} · {t(Object.hasOwn(en, `state.${review.repair.state}`) ? `state.${review.repair.state}` : 'incomplete')}</strong>{review.repair.reason && <details><summary>{t('details')}</summary><p>{review.repair.reason}</p></details>}</div>}
      {repairComplete && <div className="dxc-notice"><strong>{t('needsReview')}</strong><p>{t('repairComplete')}</p></div>}
      {!complete && !activeReview(review) && <div className="dxc-notice dxc-warning"><strong>{t('incomplete')}</strong><p>{t('incompleteHint')}</p>{review.reason && <details><summary>{t('details')}</summary><p>{review.reason}</p></details>}</div>}
      {review.findings.length > 0 && <select className="dxc-severity-filter" value={severity} aria-label={t('allFindings')} onChange={event => setSeverity(event.target.value)}><option value="all">{t('allFindings')}</option>{SEVERITIES.map(item => <option key={item} value={item}>{t(`severity.${item}`)} ({review.findings.filter(finding => finding.severity === item).length})</option>)}</select>}
      <div className="dxc-findings-list">{filtered.map(finding => <FindingCard key={finding.id} finding={finding} selected={selected.includes(finding.id)} toggle={() => toggle(finding.id)} jump={() => jump(finding)} disabled={!enabled || !reviewCanFix(review)} t={t} />)}{complete && review.findings.length === 0 && <p className="dxc-no-findings">{t('noFindings')}</p>}</div>
      <section className="dxc-checks"><div className="dxc-section-title"><strong>{t('checks')}</strong></div>{review.checks?.length ? <ul>{review.checks.map((check, at) => <li key={at}><span>{check.name ?? check.command ?? t('checks')}</span><span className={check.status === 'failed' ? 'dxc-warning' : 'dxc-muted'}>{t(check.status === 'passed' && check.verified !== true ? 'check.unknown' : Object.hasOwn(en, `check.${check.status}`) ? `check.${check.status}` : 'check.unknown')}</span>{check.evidence && <details><summary>{t('evidence')}</summary><pre>{check.evidence}</pre></details>}</li>)}</ul> : <p className="dxc-muted">{t('noChecks')}</p>}</section>
      <div className="dxc-findings-actions">{review.findings.length > 0 && !repairAvailable && !historyId && <p className="dxc-muted">{t('agentsMissing')}</p>}{review.findings.length > 0 && !repairComplete && <button type="button" className="dxc-primary" disabled={!enabled || !repairAvailable || !reviewCanFix(review) || !selected.length} onClick={fix}>{t('fix', { count: selected.length })}</button>}{complete && <button type="button" disabled={!enabled} onClick={rereview}>{t('rereview')}</button>}</div>
    </>}
    {history?.length > 0 && <details className="dxc-history"><summary>{t('history')} ({history.length})</summary><ol>{[...history].reverse().map(item => <li key={item.id}><button type="button" className="dxc-history-item" aria-pressed={historyId === item.id} onClick={() => inspectHistory(item.id)}><time>{formatTime(item.createdAt)}</time><span>{t('openFindings', { count: item.findings })} · {shortHash(item.snapshotId)}</span></button></li>)}</ol></details>}
  </aside>
}

function Setup({ kind, agents, snapshot, count, limits, prepare, inspect, models, close, t, enabled }) {
  const native = agents?.catalog.filter(agent => canPrepare(agent) && (kind === 'repair' || agent.id !== 'opencode' && snapshot.nativeReviewAvailable !== false)) ?? []
  const candidates = kind !== 'repair' && snapshot.dshAvailable ? [{ id: 'dsh', label: t('dshReviewer'), models: [] }, ...native] : native
  const [runtime, setRuntime] = useState(candidates[0]?.id ?? ''), [model, setModel] = useState('')
  const selected = candidates.find(agent => agent.id === runtime)
  const first = useRef(null)
  useEffect(() => first.current?.focus(), [])
  useEffect(() => { if (!runtime && candidates.length) setRuntime(candidates[0].id) }, [runtime, candidates.map(item => item.id).join(',')])
  const validModel = !model || selected?.models.some(item => item.id === model)
  const canSubmit = enabled && (runtime === 'dsh' || !agents?.task || agents.task.allowedActions.includes('request-start'))
  return <section className="dxc-setup" aria-label={t(kind === 'repair' ? 'repairSetup' : kind === 'rereview' ? 'rereviewSetup' : 'reviewSetup')}>
    <header><strong>{t(kind === 'repair' ? 'repairSetup' : kind === 'rereview' ? 'rereviewSetup' : 'reviewSetup')}</strong><button type="button" aria-label={t('close')} onClick={close}>×</button></header>
    {candidates.length ? <><div className="dxc-setup-fields"><label>{t(kind === 'repair' ? 'agent' : 'reviewer')}<select ref={first} value={runtime} onChange={event => { setRuntime(event.target.value); setModel('') }}><option value="" disabled>{t('chooseAgent')}</option>{candidates.map(agent => <option key={agent.id} value={agent.id}>{agent.label}</option>)}</select></label><label>{t('model')}{runtime === 'dsh' ? <span className="dxc-session-model">{snapshot.dshModel?.model ?? t('sessionModel')}</span> : <select value={model} onChange={event => setModel(event.target.value)}><option value="">{t('nativeDefault')}</option>{selected?.models.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>}</label></div>{runtime !== 'dsh' && <div className="dxc-setup-meta"><span>{t(Object.hasOwn(en, `catalog.${selected?.modelCatalog?.status}`) ? `catalog.${selected.modelCatalog.status}` : 'catalog.not-loaded')}</span><button type="button" onClick={() => models(runtime)} disabled={!enabled}>{t('models')}</button></div>}</> : <p>{t(kind === 'repair' ? !snapshot.agentsAvailable ? 'agentsMissing' : 'noAgent' : 'reviewerMissing')}</p>}
    <div className="dxc-setup-footer"><span className="dxc-muted">{kind === 'repair' ? t('openFindings', { count }) : t('selection', { count })}</span>{candidates.length ? <button type="button" className="dxc-primary" disabled={!canSubmit || !selected || !validModel || !count} onClick={() => prepare({ runtime, model })}>{t('prepare')}</button> : snapshot.agentsAvailable && (kind === 'repair' || snapshot.nativeReviewAvailable !== false) ? <button type="button" ref={first} onClick={inspect}>{t('agentSetup')}</button> : null}</div>
    {kind !== 'repair' && selected && <p className={runtime === 'dsh' ? 'dxc-muted' : 'dxc-warning'}>{t(runtime === 'dsh' ? 'snapshotBoundary' : 'nativeBoundary')}</p>}
    <p className="dxc-muted">{t('prepareHint')}</p>{kind !== 'repair' && <p className="dxc-muted">{t('reviewBudget', { count: limits.maxSelectedFiles ?? 20, bytes: limits.maxReviewBytes ?? 8000 })}</p>}
  </section>
}

export function CodeWorkspace({ sessionId, useCode, inputActions, refresh, selectTarget, loadFile, clearFile, loadReview, cancel, back, t, formatTime }) {
  const state = useCode(value => value), snapshot = state.snapshot
  const page = useRef(null), [layout, setLayout] = useState('wide')
  useEffect(() => {
    if (!globalThis.ResizeObserver || !page.current) return
    const observer = new ResizeObserver(entries => { const width = entries[0].contentRect.width; setLayout(width < 650 ? 'narrow' : width <= 1100 ? 'medium' : 'wide') })
    observer.observe(page.current)
    return () => observer.disconnect()
  }, [])
  const [path, setPath] = useState(null), [selected, setSelected] = useState([]), [issues, setIssues] = useState([])
  const [context, setContext] = useState('current'), [pane, setPane] = useState('files'), [setup, setSetup] = useState(null), [notice, setNotice] = useState(null), [focus, setFocus] = useState(null)
  const [base, setBase] = useState(snapshot?.workspace.baseRef ?? 'main'), [mode, setMode] = useState(snapshot?.workspace.mode ?? 'worktree')
  const scrollPositions = useRef(new Map()), previousWorkspace = useRef(null), previousReview = useRef(null), rereviewId = useRef(null), setupReviewId = useRef(null)
  const live = state.status === 'live', historyId = state.historyId, review = historyId ? state.inspectedReview : snapshot?.review, agents = state.agents
  const maxFiles = snapshot?.limits.maxSelectedFiles ?? 20
  const files = context === 'review' && review ? snapshot.files.filter(file => review.paths.includes(file.path)).concat(review.paths.filter(item => !snapshot.files.some(file => file.path === item)).map(path => ({ path, status: 'modified', changed: true, selectable: false }))) : snapshot?.files ?? []
  const currentFile = files.find(file => file.path === path)
  const effectivePath = currentFile?.path ?? null
  const request = useMemo(() => snapshot && effectivePath ? { scope: snapshot.scope, workspaceId: snapshot.workspace.id, path: effectivePath, mode: snapshot.workspace.mode, ...(snapshot.workspace.mode === 'range' ? { base: snapshot.workspace.baseRef ?? snapshot.workspace.base } : {}), ...(context === 'review' && review ? { reviewId: review.id } : {}) } : null, [snapshot?.scope, snapshot?.workspace.id, snapshot?.workspace.mode, snapshot?.workspace.baseRef, effectivePath, context, review?.id])
  const fileKey = request ? JSON.stringify(request) : null
  const fileMatches = fileKey && state.fileKey === fileKey
  const identity = `${snapshot?.scope}:${context === 'review' ? review?.snapshotId : snapshot?.workspace.id}:${effectivePath}`
  const reviewAvailable = Boolean(snapshot?.dshAvailable || snapshot?.agentsAvailable && snapshot?.nativeReviewAvailable !== false)
  const operation = snapshot?.operation
  const canStop = Boolean(operation?.id)
  const running = Boolean(operation) || activeReview(snapshot?.review) || snapshot?.review?.repair?.state === 'running'
  useEffect(() => {
    if (!request) { clearFile(); return }
    loadFile(request)
  }, [fileKey, state.fileStatus === 'idle'])
  useEffect(() => {
    if (!snapshot) return
    setMode(snapshot.workspace.mode)
    if (snapshot.workspace.mode === 'range') setBase(snapshot.workspace.baseRef ?? 'main')
    if (previousWorkspace.current && previousWorkspace.current !== snapshot.workspace.id) {
      setSelected(value => value.filter(path => snapshot.files.some(file => file.path === path && file.selectable)))
      setNotice(null)
    }
    previousWorkspace.current = snapshot.workspace.id
    if (previousReview.current !== review?.id) { setIssues([]); setFocus(null); previousReview.current = review?.id }
    if (setup && setup !== 'review' && setupReviewId.current && snapshot.review?.id !== setupReviewId.current) { setSetup(null); setNotice('selectionChanged') }
  }, [snapshot?.workspace.id, review?.id])
  const changeScope = (value, baseValue = base) => {
    setMode(value); setPath(null); setSelected([]); setFocus(null); setContext('current'); setSetup(null); setNotice(null); clearFile()
    loadReview(null); selectTarget(value, value === 'range' ? baseValue : undefined)
  }
  const inspectHistory = id => { setContext('review'); setPath(null); setFocus(null); setIssues([]); setSetup(null); setPane('findings'); clearFile(); loadReview(id) }
  const latest = () => { setPath(null); setFocus(null); setIssues([]); loadReview(null) }
  const openFile = next => { setPath(next); setPane('code'); setFocus(null) }
  const put = text => {
    try {
      if (!insertRequest(inputActions, text)) { setNotice('draftChanged'); return }
      setSetup(null); setNotice(null); back()
    } catch { setNotice('insertionUnconfirmed') }
  }
  const prepare = ({ runtime, model }) => {
    try {
      if (runtime === 'dsh') model = ''
      const args = setup === 'repair' ? repairRequest(snapshot, { findingIds: issues, runtime, model }) : reviewRequest(snapshot, { paths: setup === 'rereview' ? review.paths : selected, runtime, model, ...(setup === 'rereview' ? { previousReviewId: rereviewId.current ?? review.id } : {}) })
      put(`${t(setup === 'repair' ? 'repairRequest' : 'reviewRequest')}\n${JSON.stringify(args, null, 2)}`)
    } catch (error) { setNotice(Object.hasOwn(en, error.message) ? error.message : 'unavailable') }
  }
  const beginReview = kind => {
    setupReviewId.current = kind === 'review' ? null : review.id
    if (kind === 'rereview') {
      rereviewId.current = review.id; setContext('current'); setMode('worktree'); setSelected([...review.paths]); setSetup('rereview'); setFocus(null)
      selectTarget('worktree')
    } else setSetup(kind)
  }
  const toggleFile = next => {
    if (next === null) { setSelected([]); return }
    if (next === 'all') {
      const changed = snapshot.files.filter(file => isChanged(file) && file.selectable).map(file => file.path)
      if (changed.length > maxFiles) { setNotice('selectionLimit'); return }
      setSelected(changed); return
    }
    setSelected(value => value.includes(next) ? value.filter(path => path !== next) : value.length < maxFiles ? [...value, next] : value)
  }
  const jump = finding => { setContext('review'); setPath(finding.path); setPane(layout === 'narrow' ? 'code' : 'findings'); setFocus({ side: finding.side === 'before' ? 'old' : 'new', startLine: finding.startLine, endLine: finding.endLine ?? finding.startLine, findingId: finding.id }) }
  if (!sessionId) return <main className="dxc dxc-page"><div className="dxc-empty"><CodeIcon /><h1>{t('title')}</h1><p>{t('noSession')}</p><button type="button" onClick={back}>{t('openConversation')}</button></div></main>
  return <main className="dxc dxc-page" ref={page} data-code-session={sessionId} data-pane={pane}>
    <header className="dxc-header"><div className="dxc-brand"><CodeIcon /><h1>{t('title')}</h1>{snapshot && <span className="dxc-repo" title={snapshot.workspace.repoRoot}>{basename(snapshot.workspace.repoRoot)}</span>}</div><div className="dxc-header-actions"><button type="button" onClick={back}>{t('back')}</button><button type="button" onClick={() => { clearFile(); refresh() }}>{t('refresh')}</button><button type="button" className="dxc-primary" disabled={!live || !selected.length || !reviewAvailable || running || snapshot?.truncated || snapshot?.complete === false} onClick={() => beginReview('review')}>{t('review')}<span className="dxc-count">{selected.length}</span></button></div></header>
    <div className="dxc-toolbar"><div className="dxc-scope"><label htmlFor={`code-scope-${sessionId}`}>{t('scope')}</label><select id={`code-scope-${sessionId}`} value={mode} onChange={event => changeScope(event.target.value)}><option value="worktree">{t('mode.worktree')}</option><option value="staged">{t('mode.staged')}</option><option value="range">{t('mode.range')}</option></select>{mode === 'range' && <form onSubmit={event => { event.preventDefault(); changeScope('range', base) }}><input aria-label={t('base')} value={base} placeholder={t('basePlaceholder')} onChange={event => setBase(event.target.value)} maxLength={160} /><button type="submit" disabled={!base.trim()}>{t('applyBase')}</button></form>}</div>{review && <select aria-label={t('context')} value={context} onChange={event => { setContext(event.target.value); setFocus(null); clearFile() }}><option value="current">{t('current')}</option><option value="review">{t('reviewed')} · {shortHash(review.snapshotId)}</option></select>}</div>
    {historyId && <div className="dxc-banner dxc-history-banner"><span>{t('viewingHistory')} · {shortHash(review?.snapshotId)}</span><button type="button" onClick={latest}>{t('latestReview')}</button></div>}
    {!live && snapshot && <p className="dxc-banner dxc-warning" role="alert">{t('disconnected')}</p>}
    {notice && <p className="dxc-banner dxc-warning" role="alert">{t(notice, { count: maxFiles })}<button type="button" aria-label={t('close')} onClick={() => setNotice(null)}>×</button></p>}
    {running && <div className="dxc-banner dxc-running" role="status"><span className="dxc-state-dot" /><span>{t(operation && Object.hasOwn(en, `stage.${operation.state}`) ? `stage.${operation.state}` : review?.repair?.state === 'running' ? 'state.repairing' : 'state.running')}</span><button type="button" onClick={back}>{t('openConversation')}</button>{canStop && <button type="button" disabled={!live || state.pending || operation?.state === 'cancelling'} onClick={async () => { const result = await cancel(); if (!result.ok) setNotice('cancelUnconfirmed') }}>{t(state.pending || operation?.state === 'cancelling' ? 'stopping' : 'stop')}</button>}</div>}
    {snapshot && !reviewAvailable && <p className="dxc-banner">{t('reviewerMissing')}</p>}
    {setup && snapshot && <Setup key={setup} kind={setup} agents={agents} snapshot={snapshot} count={setup === 'repair' ? issues.length : selected.length} limits={snapshot.limits} prepare={prepare} close={() => setSetup(null)} inspect={() => put(t('inspectRequest'))} models={runtime => { try { put(`${t('modelsRequest')}\n${JSON.stringify(prepareModels(agents, runtime), null, 2)}`) } catch { setNotice('unavailable') } }} t={t} enabled={live && !running && !agents?.operation} />}
    {!snapshot ? <div className="dxc-empty" role={state.status === 'failed' ? 'alert' : 'status'}><CodeIcon /><p>{t(state.status === 'failed' ? messageKey(state.error?.code) : 'loading')}</p>{state.status === 'failed' && <button type="button" onClick={refresh}>{t('retry')}</button>}</div> : <>
      <Tabs className="dxc-mobile-tabs" label={t('title')} value={layout === 'medium' && pane === 'code' ? 'files' : pane} onChange={setPane} items={[{ value: 'files', label: t('files') }, ...(layout === 'medium' ? [] : [{ value: 'code', label: t('code') }]), { value: 'findings', label: `${t('findings')}${review?.findings.length ? ` · ${review.findings.length}` : ''}` }]} />
      <div className="dxc-workbench"><FileNavigator files={files} path={effectivePath} selected={selected} select={toggleFile} open={openFile} t={t} limit={maxFiles} snapshot={snapshot} reviewed={context === 'review'} />
        <CodeViewer file={fileMatches ? state.file : null} status={fileMatches ? state.fileStatus : effectivePath ? 'loading' : 'idle'} error={fileMatches ? state.fileError : null} path={effectivePath} identity={identity} mode={snapshot.workspace.mode} context={context} focus={focus} retry={() => { clearFile(); if (request) loadFile(request) }} scrollPositions={scrollPositions} t={t} />
        <Findings review={review} history={snapshot.history} historyId={historyId} inspectHistory={inspectHistory} historyStatus={state.historyStatus} selected={issues} toggle={id => setIssues(value => value.includes(id) ? value.filter(item => item !== id) : [...value, id])} jump={jump} fix={() => beginReview('repair')} rereview={() => beginReview('rereview')} enabled={live && !running && !historyId} repairAvailable={snapshot.agentsAvailable} t={t} formatTime={formatTime} />
      </div>
    </>}
  </main>
}

export function CodeToolRow({ phase, block, open, t }) {
  const meta = block?.meta, valid = meta?.kind === 'dsh-x-code.result' && meta.version === 1
  const review = valid ? meta.review : null
  return <section className="dxc dxc-tool"><header><CodeIcon /><strong>{t('title')}</strong><span>{t(phase !== 'result' ? 'toolRunning' : block?.isError ? 'toolFailed' : 'historical')}</span></header>{phase === 'result' && <>{review ? <p>{t(isComplete(review) ? 'openFindings' : 'incomplete', { count: review.findings?.length ?? 0 })}{review.stale ? ` · ${t('stale')}` : ''}</p> : <p>{t(valid ? 'historical' : 'toolUnknown')}</p>}<button type="button" onClick={open}>{t('viewWorkbench')}</button></>}</section>
}
