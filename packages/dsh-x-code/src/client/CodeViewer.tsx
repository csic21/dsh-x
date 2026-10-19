import type { CodeSource, DiffHunk, DiffRow } from './model.ts'
export type Translate = (key: string, params?: Record<string, unknown>) => string
export interface CodeFocus { side: string, startLine: number, endLine: number, findingId?: string }
export type ScrollPositions = React.MutableRefObject<Map<string, { top: number, left: number }>>
type Highlights = ReturnType<ReturnType<typeof useCodeHighlighter>>
interface SourceProps { text: string, highlights: Highlights, query: string, activeLine: string | null, focus: CodeFocus | null, side: string }
interface DiffProps { hunks: DiffHunk[], split: boolean, wrap: boolean, oldHighlights: Highlights, newHighlights: Highlights, query: string, activeLine: string | null, focus: CodeFocus | null, t: Translate }
export interface CodeViewerProps { file: CodeSource | null, status: string, error: { code?: string } | null, path: string | null, identity: string, mode: string, context: string, focus: CodeFocus | null, retry: () => void, scrollPositions: ScrollPositions, t: Translate }
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { languageForPath, MarkdownText, useCodeHighlighter } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import { basename, defaultViewerTab, diffHunks, hunkRows, pairedRows, previewKind, searchMatches, shortHash, showsSource, sourceLines, viewerTabs } from './model.ts'
import { mediaOf } from '../formats.ts'
import { ChevronIcon, CloseIcon, WrapIcon } from './icons.tsx'
import { MediaView } from './MediaPreview.tsx'

/** Native-button tabs support arrows without creating a second selection source. */
export function Tabs({ items, value, onChange, label, className = '' }: { items: { value: string, label: string }[], value: string, onChange: (value: string) => void, label: string, className?: string }) {
  const onKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const at = items.findIndex(item => item.value === value)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (at + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length
    onChange(items[next].value)
    ;(event.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus()
  }
  return <div className={`dxc-tabs ${className}`} role="tablist" aria-label={label}>{items.map(item => <button key={item.value} type="button" role="tab" aria-selected={value === item.value} tabIndex={value === item.value ? 0 : -1} onKeyDown={onKey} onClick={() => onChange(item.value)}>{item.label}</button>)}</div>
}

function MarkedText({ text, query, spans }: { text: string, query: string, spans: NonNullable<Highlights>[number] | undefined }) {
  const chunks = spans?.length ? spans : [{ text, style: undefined }]
  let offset = 0
  const matches = query ? searchMatches([text], query) : []
  return <span className="dxc-line-text">{chunks.map((span, token) => {
    const start = offset, end = offset + span.text.length; offset = end
    const boundaries = [start, end, ...matches.flatMap(match => [Math.max(start, match.start), Math.min(end, match.end)]).filter(point => point > start && point < end)].sort((a, b) => a - b)
    return <span key={token} style={span.style}>{boundaries.slice(0, -1).map((point, index) => {
      const part = span.text.slice(point - start, boundaries[index + 1] - start)
      return matches.some(match => point >= match.start && point < match.end) ? <mark key={index}>{part}</mark> : <React.Fragment key={index}>{part}</React.Fragment>
    })}</span>
  })}</span>
}

function Source({ text, highlights, query, activeLine, focus, side }: SourceProps) {
  const lines = sourceLines(text)
  return <div className="dxc-source-lines">{lines.map((line, at) => <div className="dxc-source-line" key={at} data-line-target={`${side}:${at + 1}`} data-focused={focus?.side === side && at + 1 >= focus.startLine && at + 1 <= focus.endLine || undefined} data-find-active={activeLine === `${side}:${at + 1}` || undefined}>
    <span className="dxc-line-number" aria-hidden="true">{at + 1}</span><MarkedText text={line} spans={highlights?.[at]} query={query} />
  </div>)}</div>
}

function Diff({ hunks, split, wrap, oldHighlights, newHighlights, query, activeLine, focus, t }: DiffProps) {
  const columns = useRef<Record<string, HTMLDivElement | null>>({ left: null, right: null })
  const follow = (side: string) => (event: React.UIEvent<HTMLDivElement>) => { const peer = columns.current[side === 'left' ? 'right' : 'left']; if (peer && peer.scrollLeft !== event.currentTarget.scrollLeft) peer.scrollLeft = event.currentTarget.scrollLeft }
  const focused = (side: string, line: number | null | undefined) => focus?.side === side && line != null && line >= focus.startLine && line <= focus.endLine || undefined
  const cell = (row: DiffRow | undefined, side: 'old' | 'new', key: React.Key) => {
    const no = row?.[side], spans = (side === 'old' ? oldHighlights : newHighlights)?.[(no ?? 0) - 1]
    return <div key={key} className={`dxc-diff-cell dxc-line-${row?.kind ?? 'empty'}`} data-line-target={no ? `${side}:${no}` : undefined} data-focused={focused(side, no)} data-find-active={activeLine === `${side}:${no}` || undefined}>
      <span className="dxc-line-number" aria-hidden="true">{no ?? ''}</span><span className="dxc-line-sign" aria-hidden="true">{row?.kind === 'add' ? '+' : row?.kind === 'del' ? '−' : ''}</span><MarkedText text={row?.text ?? ''} spans={spans} query={query} />
    </div>
  }
  if (split && !wrap) return <div className="dxc-split-columns">{(['left', 'right'] as const).map(side => <div className="dxc-split-column" key={side} ref={node => { columns.current[side] = node }} onScroll={follow(side)}>{hunks.map((hunk, index) => <section className="dxc-hunk" key={index}><div className="dxc-hunk-header">{`@@ −${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`}</div>{pairedRows(hunkRows(hunk)).map((row, at) => cell(row[side], side === 'left' ? 'old' : 'new', at))}</section>)}</div>)}</div>
  return <div className={`dxc-diff-lines ${split ? 'dxc-split' : 'dxc-unified'}`}>{hunks.map((hunk, index) => {
    const rows = hunkRows(hunk)
    return <section className="dxc-hunk" key={index}><div className="dxc-hunk-header">{`@@ −${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`}{hunk.heading && ` ${hunk.heading}`}</div>
      {split ? pairedRows(rows).map((row, at) => <div className="dxc-split-row" key={at}>{cell(row.left, 'old', 'left')}{cell(row.right, 'new', 'right')}</div>) : rows.map((row, at) => <div className={`dxc-unified-row dxc-line-${row.kind}`} key={at} data-line-target={`${row.new == null ? 'old' : 'new'}:${row.new ?? row.old}`} data-focused={focused('old', row.old) || focused('new', row.new)} data-find-active={activeLine === `${row.new == null ? 'old' : 'new'}:${row.new ?? row.old}` || undefined}>
        <span className="dxc-line-number" aria-label={t('oldSide')}>{row.old ?? ''}</span><span className="dxc-line-number" aria-label={t('newSide')}>{row.new ?? ''}</span><span className="dxc-line-sign" aria-hidden="true">{row.kind === 'add' ? '+' : row.kind === 'del' ? '−' : ''}</span><MarkedText text={row.text} spans={(row.new == null ? oldHighlights : newHighlights)?.[(row.new ?? row.old ?? 0) - 1]} query={query} />
      </div>)}
    </section>
  })}</div>
}

function MarkdownPreview({ text, labels }: { text: string, labels: MarkdownLabels }) {
  return <div className="dxc-markdown"><MarkdownText text={text} labels={labels} variant="body" /></div>
}

function Breadcrumbs({ path }: { path: string | null }) {
  const segments = path?.split('/').filter(Boolean) ?? []
  if (!segments.length) return null
  return <nav className="dxc-breadcrumbs" aria-label="breadcrumbs">{segments.map((segment, at) => <React.Fragment key={at}>
    {at > 0 && <span className="dxc-crumb-sep" aria-hidden="true"><ChevronIcon size={11} /></span>}
    <span className="dxc-crumb" data-last={at === segments.length - 1 || undefined}>{segment}</span>
  </React.Fragment>)}</nav>
}

/** Read-only source/diff built from captured server text and the shared DSH highlighter. */
export function CodeViewer({ file, status, error, path, identity, mode, context, focus, retry, scrollPositions, t }: CodeViewerProps) {
  const [tab, setTab] = useState<string>(() => defaultViewerTab(path, Boolean(focus))), [side, setSide] = useState('new'), [split, setSplit] = useState(false), [wrap, setWrap] = useState(false)
  const [narrow, setNarrow] = useState(false)
  const [findOpen, setFindOpen] = useState(false), [query, setQuery] = useState(''), [matchIndex, setMatchIndex] = useState(0)
  const scroll = useRef<HTMLDivElement>(null), findInput = useRef<HTMLInputElement>(null), root = useRef<HTMLElement>(null)
  const rendered = previewKind(path)
  const panes = viewerTabs(path)
  const seenPath = useRef(path)
  let active = tab
  if (seenPath.current !== path) {
    seenPath.current = path
    const next = defaultViewerTab(path, Boolean(focus))
    active = next
    if (next !== tab) setTab(next)
  }
  const view = (panes as string[]).includes(active) ? active : panes[0]
  const copyLabel = t('copyCode'), copiedLabel = t('copiedCode'), footnotes = t('footnotes')
  const labels = useMemo<MarkdownLabels>(() => ({ code: { copyLabel, copiedLabel }, footnotes }), [copyLabel, copiedLabel, footnotes])
  const highlighter = useCodeHighlighter(languageForPath(path ?? ''))
  const oldHighlights = useMemo(() => highlighter(file?.beforeText ?? ''), [highlighter, file?.beforeText])
  const newHighlights = useMemo(() => highlighter(file?.text ?? ''), [highlighter, file?.text])
  const hunks = useMemo(() => diffHunks(file?.hunks ?? file?.diff), [file?.hunks, file?.diff])
  const rows = useMemo(() => view === 'diff' ? hunks.flatMap(hunkRows).map(row => ({ text: row.text, key: `${row.new == null ? 'old' : 'new'}:${row.new ?? row.old}` })) : sourceLines(side === 'old' ? file?.beforeText : file?.text).map((text, at) => ({ text, key: `${side}:${at + 1}` })), [file, view, side, hunks])
  const matches = useMemo(() => searchMatches(rows.map(row => row.text), query), [rows, query])
  const normalizedIndex = matches.length ? matchIndex % matches.length : 0
  const activeLine = matches.length ? rows[matches[normalizedIndex].line - 1].key : null
  const scrollKey = `${identity}:${view}:${side}`
  useEffect(() => {
    if (!globalThis.ResizeObserver || !root.current) return
    const observer = new ResizeObserver(entries => setNarrow(entries[0].contentRect.width < 560))
    observer.observe(root.current)
    return () => observer.disconnect()
  }, [])
  useLayoutEffect(() => {
    const node = scroll.current
    if (!node) return
    const position = scrollPositions.current.get(scrollKey)
    node.scrollTop = position?.top ?? 0; node.scrollLeft = position?.left ?? 0
    return () => { scrollPositions.current.set(scrollKey, { top: node.scrollTop, left: node.scrollLeft }) }
  }, [scrollKey, status, scrollPositions])
  useEffect(() => { setMatchIndex(0) }, [query, view, side, identity])
  useEffect(() => { if (findOpen) findInput.current?.focus() }, [findOpen])
  useEffect(() => {
    if (!focus) return
    if (showsSource(path)) setTab('source')
    setSide(focus.side ?? 'new')
  }, [focus, path])
  useEffect(() => {
    const target = focus && status === 'ready' ? root.current?.querySelector(`[data-line-target="${focus.side ?? 'new'}:${focus.startLine}"]`) : null
    target?.scrollIntoView?.({ block: 'center' })
  }, [focus, status, tab, side])
  useEffect(() => { if (findOpen && activeLine) root.current?.querySelector(`[data-line-target="${activeLine}"]`)?.scrollIntoView?.({ block: 'center' }) }, [findOpen, activeLine, normalizedIndex])
  const nextMatch = (delta: number) => setMatchIndex(value => matches.length ? (value + delta + matches.length) % matches.length : 0)
  const closeFind = () => { setFindOpen(false); setQuery(''); root.current?.focus() }
  const kind = file?.kind ?? file?.status
  const nonText = ['binary', 'oversized', 'symlink', 'excluded', 'unavailable'].includes(kind ?? '')
  const source = side === 'old' ? file?.beforeText : file?.text
  const loadedPath = file?.path === path
  const totalLines = sourceLines(file?.text).length
  const textual = view === 'source' || view === 'diff'
  const media = rendered === 'image' || rendered === 'audio' || rendered === 'video' ? rendered : null
  const mediaPayload = side === 'old' ? file?.beforeData : file?.data
  const mediaSide = side === 'old' ? file?.beforeKind : file?.afterKind ?? kind
  const mime = mediaOf(path)?.mime
  const name = basename(path ?? '')
  return <section className="dxc-viewer" aria-label={t('codeView')} ref={root} tabIndex={0} onKeyDown={event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && textual) { event.preventDefault(); setFindOpen(true) }
    if (event.key === 'Escape' && findOpen) { event.preventDefault(); closeFind() }
  }}>
    <header className="dxc-viewer-heading"><Breadcrumbs path={path} /><span className="dxc-readonly">{t('readOnly')}</span></header>
    <div className="dxc-viewer-controls"><Tabs value={view} onChange={setTab} label={t('code')} items={panes.map(value => ({ value, label: t(value) }))} />
      <div className="dxc-viewer-options">{view === 'diff' ? <button className="dxc-split-control" type="button" disabled={narrow} title={narrow ? t('splitNarrow') : undefined} aria-pressed={split && !narrow} onClick={() => setSplit(value => !value)}>{t(split && !narrow ? 'split' : 'unified')}</button> : <select aria-label={t('context')} value={side} onChange={event => setSide(event.target.value)}><option value="new">{context === 'review' ? t('reviewed') : t(`origin.${mode}`)}</option><option value="old">{t('before')}</option></select>}
        {textual && <button type="button" className="dxc-icon-button" aria-pressed={wrap} aria-label={t('wrap')} title={t('wrap')} onClick={() => setWrap(value => !value)}><WrapIcon /></button>}{textual && <button type="button" className="dxc-icon-button" aria-label={t('find')} title={t('find')} onClick={() => setFindOpen(value => !value)}><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="7" cy="7" r="4" /><path d="m10 10 3.5 3.5" strokeLinecap="round" /></svg></button>}
      </div>
    </div>
    {textual && findOpen && <div className="dxc-find" role="search"><input ref={findInput} value={query} placeholder={t('findPlaceholder')} aria-label={t('find')} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); nextMatch(event.shiftKey ? -1 : 1) } }} /><span role="status">{matches.length ? t('matches', { current: normalizedIndex + 1, count: matches.length }) : t('noMatches')}</span><button type="button" aria-label={t('previousMatch')} disabled={!matches.length} onClick={() => nextMatch(-1)}>↑</button><button type="button" aria-label={t('nextMatch')} disabled={!matches.length} onClick={() => nextMatch(1)}>↓</button><button type="button" aria-label={t('closeFind')} onClick={closeFind}><CloseIcon size={12} /></button></div>}
    <div className="dxc-code-scroll" ref={scroll} data-wrap={wrap || undefined} onScroll={event => scrollPositions.current.set(scrollKey, { top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft })}>
      {!path ? <div className="dxc-empty dxc-code-empty"><span aria-hidden="true">{'{ }'}</span><p>{t('chooseFile')}</p></div> : status === 'loading' || status === 'ready' && !loadedPath ? <p className="dxc-state" role="status">{t('fileLoading')}</p> : status === 'failed' ? <div className="dxc-state" role="alert"><p>{t(/stale/i.test(error?.code ?? '') ? 'fileChanged' : 'fileFailed')}</p><button type="button" onClick={retry}>{t('retry')}</button></div> : loadedPath ? <>
        {(file.truncated || file.diffTruncated) && <p className="dxc-inline-warning">{t('truncated')}</p>}
        {nonText ? <p className="dxc-state">{t(kind === 'unavailable' ? 'fileFailed' : kind ?? 'unavailable')}</p> : view === 'diff' ? hunks.length ? <Diff hunks={hunks} split={split && !narrow} wrap={wrap} oldHighlights={oldHighlights} newHighlights={newHighlights} query={query} activeLine={activeLine} focus={focus} t={t} /> : <p className="dxc-state">{t('noDiff')}</p> : media && view === 'preview' ? mediaSide === 'missing' || side === 'new' && kind === 'missing' ? <p className="dxc-state">{t('missing')}</p> : mediaSide === 'oversized' ? <p className="dxc-state">{t('oversized')}</p> : mediaSide === 'symlink' ? <p className="dxc-state">{t('symlink')}</p> : !mediaPayload || !mime ? <p className="dxc-state">{t(mediaPayload === '' ? 'emptyFile' : 'mediaFailed')}</p> : <MediaView kind={media} payload={mediaPayload} encoding="base64" mime={mime} name={name} t={t} /> : source == null || side === 'old' && file.beforeKind === 'missing' || side === 'new' && (file.afterKind === 'missing' || kind === 'missing') ? <p className="dxc-state">{t('missing')}</p> : source === '' ? <p className="dxc-state">{t('emptyFile')}</p> : view === 'preview' && rendered === 'svg' ? <MediaView kind="svg" payload={source} encoding="text" mime="image/svg+xml" name={name} t={t} /> : view === 'preview' ? <MarkdownPreview text={source} labels={labels} /> : <Source text={source} highlights={side === 'old' ? oldHighlights : newHighlights} query={query} activeLine={activeLine} focus={focus} side={side} />}
      </> : null}
    </div>
    <footer className="dxc-statusbar">
      <span className="dxc-status-item">{view === 'diff' ? t('diff') : side === 'old' ? t('beforeVersion', { version: shortHash(file?.baseVersion) }) : t('afterVersion', { origin: context === 'review' ? t('reviewed') : t(`origin.${mode}`), version: shortHash(['Worktree', 'Index'].includes(file?.version ?? '') ? file?.hash : file?.version ?? file?.hash) })}</span>
      {loadedPath && totalLines > 0 && <span className="dxc-status-item">{t('lineCount', { count: totalLines })}</span>}
      <span className="dxc-status-spacer" />
      <span className="dxc-status-item">{t('readOnly')}</span>
    </footer>
  </section>
}
