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
 * Name/code lookup for the watchlist form. It is an enhancement, never a
 * requirement: the manual exchange + code fields below stay available, and a
 * disabled directory explains how to turn the local free source on.
 */
export function InstrumentSearch({ rpc, onPick, t, delay = 250, refreshToken = 0 }: any) {
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

  const choose = (match: InstrumentMatch) => {
    onPick?.(match)
    setQuery('')
    setResults([])
    setOpen(false)
    setActive(-1)
    setState('idle')
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

  return <div className="dxs-search">
    <label htmlFor={`${listId}-input`}>{t('add.search')}</label>
    <input
      id={`${listId}-input`} type="search" name="instrument-search" autoComplete="off" spellCheck={false}
      role="combobox" aria-expanded={open && results.length > 0} aria-controls={listId} aria-autocomplete="list"
      aria-activedescendant={open && active >= 0 && results[active] ? optionId(active) : undefined}
      placeholder={t('add.search.placeholder')} maxLength={SEARCH_MAX_QUERY}
      value={query} disabled={availability === 'unavailable'}
      onChange={event => { setQuery(event.target.value); setEnableError('') }}
      onKeyDown={keyDown}
    />
    {availability === 'checking' && <p className="dxs-muted" role="status">{t('add.search.checking')}</p>}
    {availability === 'enabled' && <p className="dxs-muted dxs-search-note">{t('add.search.notice')}</p>}
    {availability === 'unavailable' && <p className="dxs-muted">{t('add.search.unavailable')}</p>}
    {availability === 'disabled' && <p className="dxs-muted">
      {t('add.search.disabled')}{' '}
      <button type="button" disabled={enabling} onClick={enable}>{t(enabling ? 'add.search.enabling' : 'add.search.enable')}</button>
    </p>}
    {enableError && <p role="alert" className="dxs-error">{t(enableError)}</p>}
    {state === 'loading' && <p className="dxs-muted" role="status">{t('add.search.loading')}</p>}
    {state === 'error' && <p role="alert" className="dxs-error">{t(error)}</p>}
    {open && results.length > 0 && <ul id={listId} className="dxs-search-results" role="listbox" aria-label={t('add.search.results')}>
      {results.map((match, index) => <li
        key={match.symbol} id={optionId(index)} role="option" aria-selected={index === active}
        onMouseDown={event => event.preventDefault()} onClick={() => choose(match)} onMouseEnter={() => setActive(index)}
      >
        <strong>{match.name}</strong>
        <span className="dxs-search-symbol">{match.symbol}</span>
        <span className="dxs-search-kind">{t(`add.kind.${match.kind}`)}</span>
      </li>)}
    </ul>}
    {state === 'ready' && results.length === 0 && <p className="dxs-muted" role="status">{t('add.search.empty')}</p>}
  </div>
}
