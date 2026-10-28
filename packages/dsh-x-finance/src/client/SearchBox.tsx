import React, { useEffect, useId, useRef, useState } from 'react'
import { SEARCH_MAX_QUERY, SEARCH_RPC_ENDPOINT } from '../instrument-search.ts'
import type { InstrumentKind, InstrumentMatch } from '../instrument-search.ts'
import { MARKET_PREFERENCE_ENDPOINT } from '../market.ts'
import { errorKey } from './locales.ts'

const KINDS: InstrumentKind[] = ['stock', 'etf', 'fund', 'reit']
const valid = (match: any): match is InstrumentMatch => match && typeof match.symbol === 'string' &&
  typeof match.name === 'string' && KINDS.includes(match.kind)

type Availability = 'checking' | 'enabled' | 'disabled' | 'unavailable'

/**
 * One directory lookup shared by both entry points: the add form (which only
 * fills the form) and the page lookup (which opens a preview). The list is the
 * same; what happens on a pick is the caller's business.
 */
function useInstrumentSearch({ rpc, onPick, delay = 250, refreshToken = 0 }: any) {
  const [query, setQuery] = useState('')
  const [availability, setAvailability] = useState<Availability>('checking')
  const [checkTick, setCheckTick] = useState(0)
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState('')
  const [results, setResults] = useState<InstrumentMatch[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [enabling, setEnabling] = useState(false)
  const [enableError, setEnableError] = useState('')
  const request = useRef(0)
  const listId = useId()
  const inputId = useId()
  const optionId = (index: number) => `${listId}-option-${index}`

  useEffect(() => {
    let disposed = false
    const controller = new AbortController()
    const read = async () => {
      setAvailability('checking')
      try {
        if (!rpc?.call) throw new Error()
        const result = await rpc.call('/api', SEARCH_RPC_ENDPOINT, { action: 'status' }, controller.signal)
        if (disposed || controller.signal.aborted) return
        if (!result?.ok) throw new Error()
        setAvailability(result.value?.enabled !== true ? 'disabled' : result.value?.available === false ? 'unavailable' : 'enabled')
      } catch {
        if (!disposed && !controller.signal.aborted) setAvailability('unavailable')
      }
    }
    void read()
    return () => { disposed = true; controller.abort() }
  }, [rpc, checkTick, refreshToken])

  useEffect(() => {
    const text = query.trim()
    if (availability !== 'enabled' || !text) {
      request.current++
      setResults([])
      setOpen(false)
      setActive(-1)
      setState('idle')
      return
    }
    const id = ++request.current
    const local = new AbortController()
    const timer = setTimeout(async () => {
      if (id !== request.current) return
      setState('loading')
      setError('')
      try {
        const result = await rpc.call('/api', SEARCH_RPC_ENDPOINT, { action: 'search', query: text }, local.signal)
        if (id !== request.current || local.signal.aborted) return
        if (!result?.ok) {
          setState('error')
          setError(errorKey(result?.error?.code))
          return
        }
        if (result.value?.status === 'disabled') {
          setAvailability('disabled')
          setState('idle')
          return
        }
        const list: InstrumentMatch[] = (Array.isArray(result.value?.results) ? result.value.results : []).filter(valid)
        setResults(list)
        setState('ready')
        setOpen(true)
        setActive(list.length ? 0 : -1)
      } catch {
        if (id !== request.current || local.signal.aborted) return
        setState('error')
        setError('error.search-unavailable')
      }
    }, delay)
    return () => { clearTimeout(timer); local.abort() }
  }, [query, availability, delay, rpc])

  const reset = () => {
    setQuery('')
    setResults([])
    setOpen(false)
    setActive(-1)
    setState('idle')
  }

  const choose = (match: InstrumentMatch) => {
    onPick?.(match)
    reset()
  }

  const keyDown = (event: any) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!results.length) return
      event.preventDefault()
      if (!open) {
        setOpen(true)
        setActive(event.key === 'ArrowDown' ? 0 : results.length - 1)
        return
      }
      setActive(previous => {
        const current = previous < 0 ? 0 : previous
        return event.key === 'ArrowDown' ? (current + 1) % results.length : (current - 1 + results.length) % results.length
      })
      return
    }
    if (event.key === 'Enter' && open && active >= 0 && results[active]) {
      event.preventDefault()
      choose(results[active]!)
      return
    }
    if (event.key === 'Escape') setOpen(false)
  }

  const enable = async () => {
    setEnabling(true)
    setEnableError('')
    try {
      if (!rpc?.call) throw new Error()
      const result = await rpc.call('/api', MARKET_PREFERENCE_ENDPOINT, { action: 'set', enabled: true })
      if (!result?.ok) throw new Error()
      setCheckTick(value => value + 1)
    } catch { setEnableError('add.search.enable-error') }
    finally { setEnabling(false) }
  }

  const change = (value: string) => { setQuery(value); setEnableError('') }

  return {
    query, change, availability, state, error, results, open, setOpen, active, setActive,
    keyDown, choose, enable, enabling, enableError, listId, inputId, optionId,
  }
}

function MatchList({ search, t }: any) {
  if (!search.open || !search.results.length) return null
  return <ul id={search.listId} className="dxs-search-results" role="listbox" aria-label={t('add.search.results')}>
    {search.results.map((match: InstrumentMatch, index: number) => <li
      key={match.symbol} id={search.optionId(index)} role="option" aria-selected={index === search.active}
      onMouseDown={(event: any) => event.preventDefault()} onClick={() => search.choose(match)} onMouseEnter={() => search.setActive(index)}
    >
      <strong>{match.name}</strong>
      <span className="dxs-search-symbol">{match.symbol}</span>
      <span className="dxs-search-kind">{t(`add.kind.${match.kind}`)}</span>
    </li>)}
  </ul>
}

/**
 * Name/code lookup for the watchlist form. It is an enhancement, never a
 * requirement: the manual exchange + code fields below stay available, and a
 * disabled directory explains how to turn the local free source on.
 */
export function InstrumentSearch({ rpc, onPick, t, delay = 250, refreshToken = 0 }: any) {
  const search = useInstrumentSearch({ rpc, onPick, delay, refreshToken })
  const { availability } = search
  return <div className="dxs-search">
    <label htmlFor={search.inputId}>{t('add.search')}</label>
    <input
      id={search.inputId} type="search" name="instrument-search" autoComplete="off" spellCheck={false}
      role="combobox" aria-expanded={search.open && search.results.length > 0} aria-controls={search.listId} aria-autocomplete="list"
      aria-activedescendant={search.open && search.active >= 0 && search.results[search.active] ? search.optionId(search.active) : undefined}
      placeholder={t('add.search.placeholder')} maxLength={SEARCH_MAX_QUERY}
      value={search.query} disabled={availability === 'unavailable'}
      onChange={event => search.change(event.target.value)}
      onKeyDown={search.keyDown}
    />
    {availability === 'checking' && <p className="dxs-muted" role="status">{t('add.search.checking')}</p>}
    {availability === 'enabled' && <p className="dxs-muted dxs-search-note">{t('add.search.notice')}</p>}
    {availability === 'unavailable' && <p className="dxs-muted">{t('add.search.unavailable')}</p>}
    {availability === 'disabled' && <p className="dxs-muted">
      {t('add.search.disabled')}{' '}
      <button type="button" disabled={search.enabling} onClick={search.enable}>{t(search.enabling ? 'add.search.enabling' : 'add.search.enable')}</button>
    </p>}
    {search.enableError && <p role="alert" className="dxs-error">{t(search.enableError)}</p>}
    {search.state === 'loading' && <p className="dxs-muted" role="status">{t('add.search.loading')}</p>}
    {search.state === 'error' && <p role="alert" className="dxs-error">{t(search.error)}</p>}
    <MatchList search={search} t={t} />
    {search.state === 'ready' && search.results.length === 0 && <p className="dxs-muted" role="status">{t('add.search.empty')}</p>}
  </div>
}

/** The magnifier that makes the pill read as a search field, not a stray input. */
function LookupIcon() {
  return <svg className="dxs-lookup-icon" width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="7" cy="7" r="4.2" stroke="currentColor" strokeWidth="1.5" />
    <path d="m10.3 10.3 2.7 2.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
}

/**
 * Page-level lookup, sized as a title-bar control rather than a form row: one
 * pill, and everything that needs words (results, the disabled source, an
 * error) opens in a popover under it. It reuses the same directory call as the
 * add form, but a pick only ever opens a preview — saving stays an explicit
 * second click on that page — so looking a stock up never edits the list.
 */
export function InstrumentLookup({ rpc, onPick, t, delay = 250, refreshToken = 0 }: any) {
  const search = useInstrumentSearch({ rpc, onPick, delay, refreshToken })
  const { availability } = search

  // A directory that cannot answer is a state, not a text field: the pill says
  // what is missing and, when the switch is simply off, turns it on in place.
  if (availability === 'disabled') return <div className="dxs-lookup-bar" role="search" aria-label={t('lookup.label')}>
    <button type="button" className="dxs-lookup-pill" onClick={search.enable} disabled={search.enabling} title={t('lookup.hint')}>
      <LookupIcon />{t(search.enabling ? 'add.search.enabling' : 'lookup.disabled')}
    </button>
    {search.enableError ? <span role="alert" className="dxs-error dxs-lookup-error" title={t(search.enableError)}>{t('lookup.enable-error')}</span> : null}
  </div>
  if (availability === 'unavailable') return <div className="dxs-lookup-bar" role="search" aria-label={t('lookup.label')}>
    <span className="dxs-lookup-pill is-idle" title={t('lookup.unavailable')}><LookupIcon />{t('lookup.unavailable-short')}</span>
  </div>

  // The popover only exists for an active query: an open, typed field is the one
  // state that has something to say (results, "no match", loading or an error).
  const popover = search.open && search.query.trim().length > 0
    && (search.state === 'ready' || search.state === 'loading' || search.state === 'error')
  return <div className="dxs-lookup-bar" role="search" aria-label={t('lookup.label')}>
    <div className="dxs-lookup">
      <LookupIcon />
      <label className="dxs-sr-only" htmlFor={search.inputId}>{t('lookup.label')}</label>
      <input
        id={search.inputId} className="dxs-lookup-input" type="search" name="instrument-lookup" autoComplete="off" spellCheck={false}
        role="combobox" aria-expanded={search.open && search.results.length > 0}
        aria-controls={search.open && search.results.length > 0 ? search.listId : undefined} aria-autocomplete="list"
        aria-activedescendant={search.open && search.active >= 0 && search.results[search.active] ? search.optionId(search.active) : undefined}
        placeholder={t('lookup.placeholder')} title={t('lookup.hint')} maxLength={SEARCH_MAX_QUERY}
        value={search.query}
        onChange={event => search.change(event.target.value)}
        onKeyDown={search.keyDown}
        // The field sits in the title bar, so the list closes on blur instead of
        // hovering over the next tab. Options keep focus on mousedown, so a
        // click still lands on the picked row.
        onBlur={() => search.setOpen(false)}
        onFocus={() => { if (search.results.length) search.setOpen(true) }}
      />
    </div>
    {popover ? <div className="dxs-lookup-pop">
      {search.state === 'loading' ? <p className="dxs-lookup-note" role="status">{t('add.search.loading')}</p>
        : search.state === 'error' ? <p className="dxs-lookup-note dxs-error" role="alert">{t(search.error)}</p>
          : search.results.length ? <MatchList search={search} t={t} />
            : <p className="dxs-lookup-note" role="status">{t('add.search.empty')}</p>}
    </div> : null}
  </div>
}
