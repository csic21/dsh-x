import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { languageForPath, useCodeHighlighter } from '@deepseek-ai/dsh-client-ui-primitives'
import { diffHunks, hunkRows, pairedRows, searchMatches, shortHash, sourceLines } from './model.js'

/** Native-button tabs support arrows without creating a second selection source. */
export function Tabs({ items, value, onChange, label, className = '' }) {
  const onKey = event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const at = items.findIndex(item => item.value === value)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (at + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length
    onChange(items[next].value)
    event.currentTarget.parentElement.children[next]?.focus()
  }
  return <div className={`dxc-tabs ${className}`} role="tablist" aria-label={label}>{items.map(item => <button key={item.value} type="button" role="tab" aria-selected={value === item.value} tabIndex={value === item.value ? 0 : -1} onKeyDown={onKey} onClick={() => onChange(item.value)}>{item.label}</button>)}</div>
}

function MarkedText({ text, query, spans }) {
  const chunks = spans?.length ? spans : [{ text }]
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

function Source({ text, highlights, query, activeLine, focus, side }) {
  const lines = sourceLines(text)
  return <div className="dxc-source-lines">{lines.map((line, at) => <div className="dxc-source-line" key={at} data-line-target={`${side}:${at + 1}`} data-focused={focus?.side === side && at + 1 >= focus.startLine && at + 1 <= focus.endLine || undefined} data-find-active={activeLine === `${side}:${at + 1}` || undefined}>
    <span className="dxc-line-number" aria-hidden="true">{at + 1}</span><MarkedText text={line} spans={highlights?.[at]} query={query} />
  </div>)}</div>
}

function Diff({ hunks, split, wrap, oldHighlights, newHighlights, query, activeLine, focus, t }) {
  const columns = useRef({ left: null, right: null })
  const follow = side => event => { const peer = columns.current[side === 'left' ? 'right' : 'left']; if (peer && peer.scrollLeft !== event.currentTarget.scrollLeft) peer.scrollLeft = event.currentTarget.scrollLeft }
  const focused = (side, line) => focus?.side === side && line >= focus.startLine && line <= focus.endLine || undefined
  const cell = (row, side, key) => {
    const no = row?.[side], spans = (side === 'old' ? oldHighlights : newHighlights)?.[no - 1]
    return <div key={key} className={`dxc-diff-cell dxc-line-${row?.kind ?? 'empty'}`} data-line-target={no ? `${side}:${no}` : undefined} data-focused={focused(side, no)} data-find-active={activeLine === `${side}:${no}` || undefined}>
      <span className="dxc-line-number" aria-hidden="true">{no ?? ''}</span><span className="dxc-line-sign" aria-hidden="true">{row?.kind === 'add' ? '+' : row?.kind === 'del' ? '−' : ''}</span><MarkedText text={row?.text ?? ''} spans={spans} query={query} />
    </div>
  }
  if (split && !wrap) return <div className="dxc-split-columns">{['left', 'right'].map(side => <div className="dxc-split-column" key={side} ref={node => { columns.current[side] = node }} onScroll={follow(side)}>{hunks.map((hunk, index) => <section className="dxc-hunk" key={index}><div className="dxc-hunk-header">{`@@ −${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`}</div>{pairedRows(hunkRows(hunk)).map((row, at) => cell(row[side], side === 'left' ? 'old' : 'new', at))}</section>)}</div>)}</div>
  return <div className={`dxc-diff-lines ${split ? 'dxc-split' : 'dxc-unified'}`}>{hunks.map((hunk, index) => {
    const rows = hunkRows(hunk)
    return <section className="dxc-hunk" key={index}><div className="dxc-hunk-header">{`@@ −${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`}{hunk.heading && ` ${hunk.heading}`}</div>
      {split ? pairedRows(rows).map((row, at) => <div className="dxc-split-row" key={at}>{cell(row.left, 'old', 'left')}{cell(row.right, 'new', 'right')}</div>) : rows.map((row, at) => <div className={`dxc-unified-row dxc-line-${row.kind}`} key={at} data-line-target={`${row.new == null ? 'old' : 'new'}:${row.new ?? row.old}`} data-focused={focused('old', row.old) || focused('new', row.new)} data-find-active={activeLine === `${row.new == null ? 'old' : 'new'}:${row.new ?? row.old}` || undefined}>
        <span className="dxc-line-number" aria-label={t('oldSide')}>{row.old ?? ''}</span><span className="dxc-line-number" aria-label={t('newSide')}>{row.new ?? ''}</span><span className="dxc-line-sign" aria-hidden="true">{row.kind === 'add' ? '+' : row.kind === 'del' ? '−' : ''}</span><MarkedText text={row.text} spans={(row.new == null ? oldHighlights : newHighlights)?.[(row.new ?? row.old) - 1]} query={query} />
      </div>)}
    </section>
  })}</div>
}

/** Read-only source/diff built from captured server text and the shared DSH highlighter. */
export function CodeViewer({ file, status, error, path, identity, mode, context, focus, retry, scrollPositions, t }) {
  const [tab, setTab] = useState('source'), [side, setSide] = useState('new'), [split, setSplit] = useState(false), [wrap, setWrap] = useState(false)
  const [narrow, setNarrow] = useState(false)
  const [findOpen, setFindOpen] = useState(false), [query, setQuery] = useState(''), [matchIndex, setMatchIndex] = useState(0)
  const scroll = useRef(null), findInput = useRef(null), root = useRef(null)
  const highlighter = useCodeHighlighter(languageForPath(path ?? ''))
  const oldHighlights = useMemo(() => highlighter(file?.beforeText ?? ''), [highlighter, file?.beforeText])
  const newHighlights = useMemo(() => highlighter(file?.text ?? ''), [highlighter, file?.text])
  const hunks = useMemo(() => diffHunks(file?.hunks ?? file?.diff), [file?.hunks, file?.diff])
  const rows = useMemo(() => tab === 'source' ? sourceLines(side === 'old' ? file?.beforeText : file?.text).map((text, at) => ({ text, key: `${side}:${at + 1}` })) : hunks.flatMap(hunkRows).map(row => ({ text: row.text, key: `${row.new == null ? 'old' : 'new'}:${row.new ?? row.old}` })), [file, tab, side, hunks])
  const matches = useMemo(() => searchMatches(rows.map(row => row.text), query), [rows, query])
  const normalizedIndex = matches.length ? matchIndex % matches.length : 0
  const activeLine = matches.length ? rows[matches[normalizedIndex].line - 1].key : null
  const scrollKey = `${identity}:${tab}:${side}`
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
  useEffect(() => { setMatchIndex(0) }, [query, tab, side, identity])
  useEffect(() => { if (findOpen) findInput.current?.focus() }, [findOpen])
  useEffect(() => {
    if (!focus) return
    setTab('source'); setSide(focus.side ?? 'new')
  }, [focus])
  useEffect(() => {
    const target = focus && status === 'ready' ? root.current?.querySelector(`[data-line-target="${focus.side ?? 'new'}:${focus.startLine}"]`) : null
    target?.scrollIntoView?.({ block: 'center' })
  }, [focus, status, tab, side])
  useEffect(() => { if (findOpen && activeLine) root.current?.querySelector(`[data-line-target="${activeLine}"]`)?.scrollIntoView?.({ block: 'center' }) }, [findOpen, activeLine, normalizedIndex])
  const nextMatch = delta => setMatchIndex(value => matches.length ? (value + delta + matches.length) % matches.length : 0)
  const closeFind = () => { setFindOpen(false); setQuery(''); root.current?.focus() }
  const kind = file?.kind ?? file?.status
  const nonText = ['binary', 'oversized', 'symlink', 'excluded', 'unavailable'].includes(kind)
  const source = side === 'old' ? file?.beforeText : file?.text
  const loadedPath = file?.path === path
  return <section className="dxc-viewer" aria-label={t('codeView')} ref={root} tabIndex={0} onKeyDown={event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); setFindOpen(true) }
    if (event.key === 'Escape' && findOpen) { event.preventDefault(); closeFind() }
  }}>
    <header className="dxc-viewer-heading"><div className="dxc-path" title={path}>{path || t('chooseFile')}</div><span className="dxc-readonly">{t('readOnly')}</span></header>
    <div className="dxc-viewer-controls"><Tabs value={tab} onChange={setTab} label={t('code')} items={[{ value: 'source', label: t('source') }, { value: 'diff', label: t('diff') }]} />
      <div className="dxc-viewer-options">{tab === 'source' ? <select aria-label={t('context')} value={side} onChange={event => setSide(event.target.value)}><option value="new">{context === 'review' ? t('reviewed') : t(`origin.${mode}`)}</option><option value="old">{t('before')}</option></select> : <button className="dxc-split-control" type="button" disabled={narrow} title={narrow ? t('splitNarrow') : undefined} aria-pressed={split && !narrow} onClick={() => setSplit(value => !value)}>{t(split && !narrow ? 'split' : 'unified')}</button>}
        <button type="button" className="dxc-icon-button" aria-pressed={wrap} aria-label={t('wrap')} title={t('wrap')} onClick={() => setWrap(value => !value)}>↵</button><button type="button" className="dxc-icon-button" aria-label={t('find')} title={t('find')} onClick={() => setFindOpen(value => !value)}>⌕</button>
      </div>
    </div>
    {findOpen && <div className="dxc-find" role="search"><input ref={findInput} value={query} placeholder={t('findPlaceholder')} aria-label={t('find')} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); nextMatch(event.shiftKey ? -1 : 1) } }} /><span role="status">{matches.length ? t('matches', { current: normalizedIndex + 1, count: matches.length }) : t('noMatches')}</span><button type="button" aria-label={t('previousMatch')} disabled={!matches.length} onClick={() => nextMatch(-1)}>↑</button><button type="button" aria-label={t('nextMatch')} disabled={!matches.length} onClick={() => nextMatch(1)}>↓</button><button type="button" aria-label={t('closeFind')} onClick={closeFind}>×</button></div>}
    {loadedPath && <div className="dxc-version"><span>{tab === 'source' && side === 'old' ? t('beforeVersion', { version: shortHash(file.baseVersion) }) : t('afterVersion', { origin: context === 'review' ? t('reviewed') : t(`origin.${mode}`), version: shortHash(['Worktree', 'Index'].includes(file.version) ? file.hash : file.version ?? file.hash) })}</span>{tab === 'diff' && <span>{t('beforeVersion', { version: shortHash(file.baseVersion) })}</span>}</div>}
    <div className="dxc-code-scroll" ref={scroll} data-wrap={wrap || undefined} onScroll={event => scrollPositions.current.set(scrollKey, { top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft })}>
      {!path ? <div className="dxc-empty dxc-code-empty"><span aria-hidden="true">{'{ }'}</span><p>{t('chooseFile')}</p></div> : status === 'loading' || status === 'ready' && !loadedPath ? <p className="dxc-state" role="status">{t('fileLoading')}</p> : status === 'failed' ? <div className="dxc-state" role="alert"><p>{t(/stale/i.test(error?.code) ? 'fileChanged' : 'fileFailed')}</p><button type="button" onClick={retry}>{t('retry')}</button></div> : loadedPath ? <>
        {(file.truncated || file.diffTruncated) && <p className="dxc-inline-warning">{t('truncated')}</p>}
        {nonText ? <p className="dxc-state">{t(kind === 'unavailable' ? 'fileFailed' : kind)}</p> : tab === 'source' ? source == null || side === 'old' && file.beforeKind === 'missing' || side === 'new' && (file.afterKind === 'missing' || kind === 'missing') ? <p className="dxc-state">{t('missing')}</p> : source === '' ? <p className="dxc-state">{t('emptyFile')}</p> : <Source text={source} highlights={side === 'old' ? oldHighlights : newHighlights} query={query} activeLine={activeLine} focus={focus} side={side} /> : hunks.length ? <Diff hunks={hunks} split={split && !narrow} wrap={wrap} oldHighlights={oldHighlights} newHighlights={newHighlights} query={query} activeLine={activeLine} focus={focus} t={t} /> : <p className="dxc-state">{t('noDiff')}</p>}
      </> : null}
    </div>
  </section>
}
