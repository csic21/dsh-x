// Browser side of the HK quote/history route. Same rules as the A-share and US
// resources: nothing is fetched while the source is off, a hidden tab or an
// offline browser pauses the poll, and the last successful answer stays on
// screen, marked, instead of being replaced by an error.
import { useEffect, useRef, useState } from 'react'
import { HK_ENDPOINT, HK_MAX_HISTORY } from '../../hk-market.ts'
import type { HkQuote } from '../../hk-market.ts'
import type { MarketHistory } from '../../market.ts'
import { errorKey } from '../locales.ts'

export interface HkQuoteState {
  status: 'loading' | 'ready' | 'disabled' | 'error'
  value: HkQuote | null
  error: string
  refreshing: boolean
}

const INITIAL: HkQuoteState = { status: 'loading', value: null, error: '', refreshing: false }

function paused() {
  if (typeof document !== 'undefined' && document.hidden) return true
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/** One listing's quote, refreshed at the same pace as the A-share detail page. */
export function useHkQuote(rpc: any, symbol: string | null, { pollMs = 60_000 }: { pollMs?: number } = {}) {
  const [state, setState] = useState<HkQuoteState>(INITIAL)
  const [tick, setTick] = useState(0)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  useEffect(() => {
    if (!symbol) {
      setState({ status: 'error', value: null, error: 'finance/hk-quote-unavailable', refreshing: false })
      return
    }
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined
    let delay = pollMs

    const schedule = () => {
      if (disposed || delay <= 0) return
      timer = setTimeout(run, delay)
    }

    async function run() {
      if (disposed) return
      clearTimeout(timer)
      if (paused()) { schedule(); return }
      controller?.abort()
      const local = new AbortController()
      controller = local
      setState(previous => previous.value
        ? { ...previous, refreshing: true, error: '' }
        : { ...previous, status: 'loading', refreshing: false })
      try {
        if (!rpc?.call) throw new Error('finance/connection')
        const result = await rpc.call('/api', HK_ENDPOINT, { kind: 'quote', symbol }, local.signal)
        if (disposed || local.signal.aborted) return
        if (!result?.ok) {
          setState(previous => ({
            ...previous,
            status: previous.value ? 'ready' : 'error',
            error: errorKey(result?.error?.code),
            refreshing: false,
          }))
          return
        }
        if (result.value?.status === 'disabled') {
          // A deliberately disabled source must not be polled; the source
          // switch remounts this view when it is turned back on.
          delay = 0
          setState({ status: 'disabled', value: null, error: '', refreshing: false })
          return
        }
        const quote = result.value?.quote as HkQuote | undefined
        if (!quote || quote.symbol !== symbol || !Number.isFinite(quote.price)) throw new Error('finance/hk-quote-invalid')
        setState({ status: 'ready', value: quote, error: '', refreshing: false })
      } catch {
        if (disposed || local.signal.aborted) return
        setState(previous => ({
          ...previous,
          status: previous.value ? 'ready' : 'error',
          error: 'finance/hk-quote-unavailable',
          refreshing: false,
        }))
      } finally {
        if (!disposed) schedule()
      }
    }

    const resume = () => {
      if (paused()) return
      clearTimeout(timer)
      void run()
    }
    void run()
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', resume)
    globalThis.addEventListener?.('online', resume)
    return () => {
      disposed = true
      clearTimeout(timer)
      controller?.abort()
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', resume)
      globalThis.removeEventListener?.('online', resume)
    }
  }, [rpc, symbol, pollMs, tick])

  return { ...state, refresh: () => { if (alive.current) setTick(value => value + 1) } }
}

export interface HkHistoryState {
  status: 'loading' | 'ready' | 'disabled' | 'error'
  value: MarketHistory | null
  error: string
  refreshing: boolean
}

/**
 * Daily bars for one listing. Not polled: the Host caches nothing but the bars
 * change once per session. The HK daily endpoint takes the same identity as the
 * quote endpoint, so no venue code has to be carried alongside it.
 */
export function useHkHistory(rpc: any, symbol: string | null, limit = HK_MAX_HISTORY) {
  const [state, setState] = useState<HkHistoryState>({ status: 'loading', value: null, error: '', refreshing: false })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!symbol) {
      setState({ status: 'error', value: null, error: 'finance/hk-history-unavailable', refreshing: false })
      return
    }
    let disposed = false
    const controller = new AbortController()
    const run = async () => {
      setState(previous => previous.value?.symbol === symbol
        ? { ...previous, refreshing: true, error: '' }
        : { status: 'loading', value: null, error: '', refreshing: false })
      try {
        if (!rpc?.call) throw new Error('finance/connection')
        const result = await rpc.call('/api', HK_ENDPOINT, { kind: 'history', symbol, limit }, controller.signal)
        if (disposed || controller.signal.aborted) return
        if (!result?.ok) throw new Error('finance/hk-history-unavailable')
        if (result.value?.status === 'disabled') {
          setState({ status: 'disabled', value: null, error: '', refreshing: false })
          return
        }
        const history = result.value?.history as MarketHistory | undefined
        if (!history || history.symbol !== symbol || !Array.isArray(history.bars) || !history.bars.length) {
          throw new Error('finance/hk-history-unavailable')
        }
        setState({ status: 'ready', value: history, error: '', refreshing: false })
      } catch (failure: any) {
        if (disposed || controller.signal.aborted) return
        setState({ status: 'error', value: null, error: errorKey(failure?.code ?? 'finance/hk-history-unavailable'), refreshing: false })
      }
    }
    void run()
    return () => { disposed = true; controller.abort() }
  }, [rpc, symbol, limit, tick])
  return { ...state, refresh: () => setTick(value => value + 1) }
}
