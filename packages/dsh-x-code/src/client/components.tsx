import type { CodeFile, CodeSnapshot, CodeReview, FileTreeDirectory } from './model.ts'
import type { CodeState, FileTarget } from './controller.ts'
import type { Finding } from '../review.ts'
import type { Translate, CodeFocus } from './CodeViewer.tsx'
export interface EntryProps { open: () => void, t: Translate }
export interface PanelProps { renderSlot(name: string, props: Record<string, unknown>): React.ReactNode }
interface NavigatorProps { files: CodeFile[], path: string | null, selected: string[], select: (path: string | null) => void, open: (path: string) => void, t: Translate, limit: number, snapshot: CodeSnapshot, reviewed: boolean }
interface FileRowProps { file: CodeFile, path: string | null, selected: string[], select: (path: string | null) => void, open: (path: string) => void, t: Translate, limit: number, reviewed: boolean, depth: number }
interface BranchProps extends Omit<FileRowProps, 'file'> { node: FileTreeDirectory }
interface FindingProps { finding: Finding, jump: () => void, t: Translate }
interface FindingsProps { review: CodeReview | null | undefined, history: CodeSnapshot['history'], historyId: string | null, inspectHistory: (id: string) => void, historyStatus: string, jump: (finding: Finding) => void, rereview: () => void, enabled: boolean, canRereview: boolean, t: Translate, formatTime: (value: string) => string }
export interface WorkspaceProps { sessionId: string | null, useCode: <T>(selector: (state: CodeState) => T) => T, inputActions: Parameters<typeof insertRequest>[0], refresh: () => void, selectTarget: (mode: string, base?: string) => void, loadFile: (target: FileTarget) => void, clearFile: () => void, loadReview: (id: string | null) => void, cancel: () => Promise<{ ok: boolean }>, back: () => void, t: Translate, formatTime: (value: string) => string }
export interface ToolRowProps extends EntryProps { phase: string, block?: { isError?: boolean, meta?: { kind?: string, version?: number, review?: CodeReview } } }
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { CodeViewer, Tabs } from './CodeViewer.tsx'
import { activeReview, basename, fileTree, insertRequest, isChanged, isComplete, reviewRequest, SEVERITIES, shortHash } from './model.ts'
import { en, messageKey } from './locales.ts'

export function CodeIcon() { return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18" strokeLinecap="round" strokeLinejoin="round" /></svg> }
export function CodeEntry({ open, t }: EntryProps) {
  return <div className="dxc-dock"><button type="button" className="dxc-entry" onClick={open} title={t('open')}>
    <span className="dxc-entry-icon" aria-hidden="true"><CodeIcon /></span>
    <span className="dxc-entry-label">{t('title')}</span>
    <span className="dxc-entry-go" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
  </button></div>
}
export function CodePanel({ renderSlot }: PanelProps) { return renderSlot('dsh-x-code.workspace', {}) }

const STATUS_MARKS: Record<string, string> = { added: 'A', deleted: 'D', renamed: 'R', untracked: 'U', conflicted: '!' }
const indent = (depth: number) => ({ paddingInlineStart: 8 + depth * 12 })

function FileRow({ file, path, selected, select, open, t, limit, reviewed, depth }: FileRowProps) {
  return <li className="dxc-file-row" style={indent(depth)} data-selected={path === file.path || undefined}>
    {!reviewed && <input type="checkbox" aria-label={t('selectFile', { path: file.path })} checked={selected.includes(file.path)} disabled={!file.selectable || !selected.includes(file.path) && selected.length >= limit} onChange={() => select(file.path)} />}
    <button type="button" className="dxc-file" aria-current={path === file.path ? 'true' : undefined} aria-label={t('openFile', { path: file.path })} title={file.path} onClick={() => open(file.path)}><span className="dxc-file-name">{basename(file.path)}</span><span className={`dxc-file-status dxc-status-${file.status}`} title={t(Object.hasOwn(en, `file.${file.status}`) ? `file.${file.status}` : 'file.modified')}>{isChanged(file) ? STATUS_MARKS[file.status] ?? 'M' : ''}</span></button>
  </li>
}

function TreeBranch({ node, depth, ...rest }: BranchProps) {
  if (!node.directories.length && !node.files.length) return null
  return <li className="dxc-branch"><details className="dxc-directory" open>
    <summary title={node.path} aria-label={node.path} style={indent(depth)}><span className="dxc-disclosure" aria-hidden="true">▸</span><span className="dxc-dir-name">{node.name}</span></summary>
    <ul className="dxc-children">
      {node.directories.map(child => <TreeBranch key={child.path} node={child} depth={depth + 1} {...rest} />)}
      {node.files.map(file => <FileRow key={file.path} file={file} depth={depth + 1} {...rest} />)}
    </ul>
  </details></li>
}

function FileNavigator({ files, path, selected, select, open, t, limit, snapshot, reviewed }: NavigatorProps) {
  const [filter, setFilter] = useState('changed'), [query, setQuery] = useState('')
  const tree = useMemo(() => fileTree(files, query, reviewed ? 'all' : filter), [files, query, filter, reviewed])
  const rows = { path, selected, select, open, t, limit, reviewed }
  return <aside className="dxc-files" aria-label={t('files')}>
    <div className="dxc-section-title"><strong>{t('files')}</strong><span>{t('fileCount', { count: files.length })}</span></div>
    {!reviewed && <Tabs label={t('files')} value={filter} onChange={setFilter} items={[{ value: 'changed', label: t('changed') }, { value: 'all', label: t('all') }]} />}
    <div className="dxc-file-search"><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('searchFiles')} aria-label={t('fileSearchLabel')} /></div>
    <div className="dxc-file-list">{tree.directories.length || tree.files.length ? <ul className="dxc-tree">
      {tree.directories.map(node => <TreeBranch key={node.path} node={node} depth={0} {...rows} />)}
      {tree.files.map(file => <FileRow key={file.path} file={file} depth={0} {...rows} />)}
    </ul> : <p className="dxc-state">{t(filter === 'changed' && !query && !reviewed ? 'noChanges' : 'noFiles')}</p>}</div>
    <footer className="dxc-file-footer">{reviewed ? <span>{t('reviewedOnly')}</span> : <><span>{t('selection', { count: selected.length })}</span><button type="button" onClick={() => select(selected.length ? null : 'all')}>{t(selected.length ? 'clearSelection' : 'selectChanged')}</button></>}{snapshot.truncated && <p className="dxc-inline-warning">{t('partialFiles')}</p>}</footer>
  </aside>
}

function FindingCard({ finding, jump, t }: FindingProps) {
  return <article className="dxc-finding" data-severity={finding.severity}>
    <div className="dxc-finding-top"><span className={`dxc-severity dxc-severity-${finding.severity}`}>{t(`severity.${finding.severity}`)}</span><span className="dxc-finding-id">{finding.id.slice(0, 7)}</span></div>
    <button type="button" className="dxc-finding-title" onClick={jump}>{finding.title}</button>
    <button type="button" className="dxc-location" title={finding.path} aria-label={t('findingLocation', { path: finding.path, line: finding.startLine })} onClick={jump}>{basename(finding.path)}<span>:{finding.startLine}{finding.endLine !== finding.startLine ? `–${finding.endLine}` : ''}</span></button>
    <p className="dxc-finding-body">{finding.body}</p>
    {(finding.evidence || finding.trigger) && <details><summary>{t('details')}</summary>{finding.evidence && <div><span className="dxc-detail-label">{t('evidence')}</span><pre>{finding.evidence}</pre></div>}{finding.trigger && <div><span className="dxc-detail-label">{t('trigger')}</span><p>{finding.trigger}</p></div>}</details>}
  </article>
}

function Findings({ review, history, historyId, inspectHistory, historyStatus, jump, rereview, enabled, canRereview, t, formatTime }: FindingsProps) {
  const [severity, setSeverity] = useState('all')
  const filtered = review?.findings.filter(finding => severity === 'all' || finding.severity === severity) ?? []
  const complete = isComplete(review)
  return <aside className="dxc-findings" aria-label={t('findings')}>
    <div className="dxc-section-title"><strong>{t('findings')}</strong>{review && <span>{review.findings.length}</span>}</div>
    {!review && historyId ? <div className="dxc-state" role={historyStatus === 'failed' ? 'alert' : 'status'}><p>{t(historyStatus === 'failed' ? 'historyFailed' : 'historyLoading')}</p>{historyStatus === 'failed' && <button type="button" onClick={() => inspectHistory(historyId)}>{t('retry')}</button>}</div> : !review ? <div className="dxc-empty dxc-findings-empty"><span aria-hidden="true">◎</span><strong>{t('noReview')}</strong><p>{t('noReviewHint')}</p></div> : <>
      <div className="dxc-review-summary"><div className="dxc-review-state" role="status"><span className={`dxc-state-dot dxc-review-${review.state}`} /><strong>{t(Object.hasOwn(en, `state.${review.state}`) ? `state.${review.state}` : 'incomplete')}</strong></div><div className="dxc-muted">{t('coverage', { count: review.paths?.length ?? 0 })} · {shortHash(review.snapshotId)}</div>{review.createdAt && <time className="dxc-muted">{formatTime(review.createdAt)}</time>}
        {review.summary && <details><summary>{t('summary')}</summary><p>{review.summary}</p></details>}
      </div>
      {review.stale && <div className="dxc-notice dxc-warning"><strong>{t('stale')}</strong><p>{t('staleHint')}</p></div>}
      {!complete && !activeReview(review) && <div className="dxc-notice dxc-warning"><strong>{t('incomplete')}</strong><p>{t('incompleteHint')}</p>{review.reason && <details><summary>{t('details')}</summary><p>{review.reason}</p></details>}</div>}
      {review.findings.length > 0 && <select className="dxc-severity-filter" value={severity} aria-label={t('allFindings')} onChange={event => setSeverity(event.target.value)}><option value="all">{t('allFindings')}</option>{SEVERITIES.map(item => <option key={item} value={item}>{t(`severity.${item}`)} ({review.findings.filter(finding => finding.severity === item).length})</option>)}</select>}
      <div className="dxc-findings-list">{filtered.map(finding => <FindingCard key={finding.id} finding={finding} jump={() => jump(finding)} t={t} />)}{complete && review.findings.length === 0 && <p className="dxc-no-findings">{t('noFindings')}</p>}</div>
      <section className="dxc-checks"><div className="dxc-section-title"><strong>{t('checks')}</strong></div>{review.checks?.length ? <ul>{review.checks.map((check, at) => <li key={at}><span>{check.name ?? check.command ?? t('checks')}</span><span className={check.status === 'failed' ? 'dxc-warning' : 'dxc-muted'}>{t(check.status === 'passed' && check.verified !== true ? 'check.unknown' : Object.hasOwn(en, `check.${check.status}`) ? `check.${check.status}` : 'check.unknown')}</span>{check.evidence && <details><summary>{t('evidence')}</summary><pre>{check.evidence}</pre></details>}</li>)}</ul> : <p className="dxc-muted">{t('noChecks')}</p>}</section>
      <div className="dxc-findings-actions">{complete && <button type="button" disabled={!enabled || !canRereview} onClick={rereview}>{t('rereview')}</button>}</div>
      {!canRereview && complete && <p className="dxc-muted">{t('worktreeFirst')}</p>}
    </>}
    {history?.length > 0 && <details className="dxc-history"><summary>{t('history')} ({history.length})</summary><ol>{[...history].reverse().map(item => <li key={item.id}><button type="button" className="dxc-history-item" aria-pressed={historyId === item.id} onClick={() => inspectHistory(item.id)}><time>{formatTime(item.createdAt)}</time><span>{t('openFindings', { count: item.findings })} · {shortHash(item.snapshotId)}</span></button></li>)}</ol></details>}
  </aside>
}

export function CodeWorkspace({ sessionId, useCode, inputActions, refresh, selectTarget, loadFile, clearFile, loadReview, cancel, back, t, formatTime }: WorkspaceProps) {
  const state = useCode(value => value), snapshot = state.snapshot
  const page = useRef<HTMLElement>(null), [layout, setLayout] = useState('wide')
  useEffect(() => {
    if (!globalThis.ResizeObserver || !page.current) return
    const observer = new ResizeObserver(entries => { const width = entries[0].contentRect.width; setLayout(width < 650 ? 'narrow' : width <= 1100 ? 'medium' : 'wide') })
    observer.observe(page.current)
    return () => observer.disconnect()
  }, [])
  const [path, setPath] = useState<string | null>(null), [selected, setSelected] = useState<string[]>([])
  const [context, setContext] = useState('current'), [pane, setPane] = useState('files'), [notice, setNotice] = useState<string | null>(null), [focus, setFocus] = useState<CodeFocus | null>(null)
  const [base, setBase] = useState(snapshot?.workspace.baseRef ?? 'main'), [mode, setMode] = useState<string>(snapshot?.workspace.mode ?? 'worktree')
  const scrollPositions = useRef(new Map<string, { top: number, left: number }>()), previousWorkspace = useRef<string | null>(null), previousReview = useRef<string | undefined>(undefined), rereviewId = useRef<string | null>(null)
  const live = state.status === 'live', historyId = state.historyId, review = historyId ? state.inspectedReview : snapshot?.review
  const maxFiles = snapshot?.limits.maxSelectedFiles ?? 20
  const files = context === 'review' && review && snapshot ? snapshot.files.filter(file => review.paths.includes(file.path)).concat(review.paths.filter(item => !snapshot.files.some(file => file.path === item)).map(path => ({ path, status: 'modified', changed: true, selectable: false }))) : snapshot?.files ?? []
  const currentFile = files.find(file => file.path === path)
  const effectivePath = currentFile?.path ?? null
  const request = useMemo(() => snapshot && effectivePath ? { scope: snapshot.scope, workspaceId: snapshot.workspace.id, path: effectivePath, mode: snapshot.workspace.mode, ...(snapshot.workspace.mode === 'range' ? { base: snapshot.workspace.baseRef ?? snapshot.workspace.base } : {}), ...(context === 'review' && review ? { reviewId: review.id } : {}) } : null, [snapshot?.scope, snapshot?.workspace.id, snapshot?.workspace.mode, snapshot?.workspace.baseRef, effectivePath, context, review?.id])
  const fileKey = request ? JSON.stringify(request) : null
  const fileMatches = fileKey && state.fileKey === fileKey
  const identity = `${snapshot?.scope}:${context === 'review' ? review?.snapshotId : snapshot?.workspace.id}:${effectivePath}`
  const reviewAvailable = Boolean(snapshot?.dshAvailable)
  const operation = snapshot?.operation
  const canStop = Boolean(operation?.id)
  const running = Boolean(operation) || activeReview(snapshot?.review)
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
    if (previousReview.current !== review?.id) { setFocus(null); previousReview.current = review?.id }
  }, [snapshot?.workspace.id, review?.id])
  const changeScope = (value: string, baseValue = base) => {
    setMode(value); setPath(null); setSelected([]); setFocus(null); setContext('current'); setNotice(null); clearFile()
    loadReview(null); selectTarget(value, value === 'range' ? baseValue : undefined)
  }
  const inspectHistory = (id: string) => { setContext('review'); setPath(null); setFocus(null); setPane('findings'); clearFile(); loadReview(id) }
  const latest = () => { setPath(null); setFocus(null); loadReview(null) }
  const openFile = (next: string) => { setPath(next); setPane('code'); setFocus(null) }
  const put = (text: string) => {
    try {
      if (!insertRequest(inputActions, text)) { setNotice('draftChanged'); return }
      setNotice(null); back()
    } catch { setNotice('insertionUnconfirmed') }
  }
  const prepare = (kind: 'review' | 'rereview') => {
    try {
      if (!snapshot) throw new Error('unavailable')
      if (kind === 'rereview' && (review?.mode !== 'worktree' || snapshot.workspace.mode !== 'worktree')) throw new Error('worktreeFirst')
      const paths = kind === 'rereview' ? review!.paths : selected
      const args = reviewRequest(snapshot, { paths, ...(kind === 'rereview' ? { previousReviewId: rereviewId.current ?? review!.id } : {}) })
      put(`${t('reviewRequest')}\n${JSON.stringify(args, null, 2)}`)
    } catch (error) { setNotice(error instanceof Error && Object.hasOwn(en, error.message) ? error.message : 'unavailable') }
  }
  const beginReview = (kind: 'review' | 'rereview') => {
    if (kind === 'rereview') { rereviewId.current = review!.id; setContext('current'); setSelected([...review!.paths]); setFocus(null) }
    prepare(kind)
  }
  const toggleFile = (next: string | null) => {
    if (next === null) { setSelected([]); return }
    if (next === 'all') {
      const changed = snapshot!.files.filter(file => isChanged(file) && file.selectable).map(file => file.path)
      if (changed.length > maxFiles) { setNotice('selectionLimit'); return }
      setSelected(changed); return
    }
    setSelected(value => value.includes(next) ? value.filter(path => path !== next) : value.length < maxFiles ? [...value, next] : value)
  }
  const jump = (finding: Finding) => { setContext('review'); setPath(finding.path); setPane(layout === 'narrow' ? 'code' : 'findings'); setFocus({ side: finding.side === 'before' ? 'old' : 'new', startLine: finding.startLine, endLine: finding.endLine ?? finding.startLine, findingId: finding.id }) }
  if (!sessionId) return <main className="dxc dxc-page"><div className="dxc-empty"><CodeIcon /><h1>{t('title')}</h1><p>{t('noSession')}</p><button type="button" onClick={back}>{t('openConversation')}</button></div></main>
  return <main className="dxc dxc-page" ref={page} data-code-session={sessionId} data-pane={pane}>
    <header className="dxc-header"><div className="dxc-brand"><CodeIcon /><h1>{t('title')}</h1>{snapshot && <span className="dxc-repo" title={snapshot.workspace.repoRoot}>{basename(snapshot.workspace.repoRoot)}</span>}</div><div className="dxc-header-actions"><button type="button" onClick={back}>{t('back')}</button><button type="button" onClick={() => { clearFile(); refresh() }}>{t('refresh')}</button><button type="button" className="dxc-primary" disabled={!live || !selected.length || !reviewAvailable || running || snapshot?.truncated || snapshot?.complete === false} onClick={() => beginReview('review')}>{t('review')}<span className="dxc-count">{selected.length}</span></button></div></header>
    <div className="dxc-toolbar"><div className="dxc-scope"><label htmlFor={`code-scope-${sessionId}`}>{t('scope')}</label><select id={`code-scope-${sessionId}`} value={mode} onChange={event => changeScope(event.target.value)}><option value="worktree">{t('mode.worktree')}</option><option value="staged">{t('mode.staged')}</option><option value="range">{t('mode.range')}</option></select>{mode === 'range' && <form onSubmit={event => { event.preventDefault(); changeScope('range', base) }}><input aria-label={t('base')} value={base} placeholder={t('basePlaceholder')} onChange={event => setBase(event.target.value)} maxLength={160} /><button type="submit" disabled={!base.trim()}>{t('applyBase')}</button></form>}</div>{review && <select aria-label={t('context')} value={context} onChange={event => { setContext(event.target.value); setFocus(null); clearFile() }}><option value="current">{t('current')}</option><option value="review">{t('reviewed')} · {shortHash(review.snapshotId)}</option></select>}</div>
    {historyId && <div className="dxc-banner dxc-history-banner"><span>{t('viewingHistory')} · {shortHash(review?.snapshotId)}</span><button type="button" onClick={latest}>{t('latestReview')}</button></div>}
    {!live && snapshot && <p className="dxc-banner dxc-warning" role="alert">{t('disconnected')}</p>}
    {notice && <p className="dxc-banner dxc-warning" role="alert">{t(notice, { count: maxFiles })}<button type="button" aria-label={t('close')} onClick={() => setNotice(null)}>×</button></p>}
    {running && <div className="dxc-banner dxc-running" role="status"><span className="dxc-state-dot" /><span>{t(operation && Object.hasOwn(en, `stage.${operation.state}`) ? `stage.${operation.state}` : 'state.running')}</span><button type="button" onClick={back}>{t('openConversation')}</button>{canStop && <button type="button" disabled={!live || state.pending || operation?.state === 'cancelling'} onClick={async () => { const result = await cancel(); if (!result.ok) setNotice('cancelUnconfirmed') }}>{t(state.pending || operation?.state === 'cancelling' ? 'stopping' : 'stop')}</button>}</div>}
    {snapshot && !reviewAvailable && <p className="dxc-banner">{t('reviewerMissing')}</p>}
    {!snapshot ? <div className="dxc-empty" role={state.status === 'failed' ? 'alert' : 'status'}><CodeIcon /><p>{t(state.status === 'failed' ? messageKey(state.error?.code) : 'loading')}</p>{state.status === 'failed' && <button type="button" onClick={refresh}>{t('retry')}</button>}</div> : <>
      <Tabs className="dxc-mobile-tabs" label={t('title')} value={layout === 'medium' && pane === 'code' ? 'files' : pane} onChange={setPane} items={[{ value: 'files', label: t('files') }, ...(layout === 'medium' ? [] : [{ value: 'code', label: t('code') }]), { value: 'findings', label: `${t('findings')}${review?.findings.length ? ` · ${review.findings.length}` : ''}` }]} />
      <div className="dxc-workbench"><FileNavigator files={files} path={effectivePath} selected={selected} select={toggleFile} open={openFile} t={t} limit={maxFiles} snapshot={snapshot} reviewed={context === 'review'} />
        <CodeViewer file={fileMatches ? state.file : null} status={fileMatches ? state.fileStatus : effectivePath ? 'loading' : 'idle'} error={fileMatches ? state.fileError : null} path={effectivePath} identity={identity} mode={snapshot.workspace.mode} context={context} focus={focus} retry={() => { clearFile(); if (request) loadFile(request) }} scrollPositions={scrollPositions} t={t} />
        <Findings review={review} history={snapshot.history} historyId={historyId} inspectHistory={inspectHistory} historyStatus={state.historyStatus} jump={jump} rereview={() => beginReview('rereview')} enabled={live && !running && !historyId} canRereview={review?.mode === 'worktree' && snapshot.workspace.mode === 'worktree'} t={t} formatTime={formatTime} />
      </div>
    </>}
  </main>
}

export function CodeToolRow({ phase, block, open, t }: ToolRowProps) {
  const meta = block?.meta, valid = meta?.kind === 'dsh-x-code.result' && meta.version === 1
  const review = valid ? meta.review : null
  return <section className="dxc dxc-tool"><header><CodeIcon /><strong>{t('title')}</strong><span>{t(phase !== 'result' ? 'toolRunning' : block?.isError ? 'toolFailed' : 'historical')}</span></header>{phase === 'result' && <>{review ? <p>{t(isComplete(review) ? 'openFindings' : 'incomplete', { count: review.findings?.length ?? 0 })}{review.stale ? ` · ${t('stale')}` : ''}</p> : <p>{t(valid ? 'historical' : 'toolUnknown')}</p>}<button type="button" onClick={open}>{t('viewWorkbench')}</button></>}</section>
}
