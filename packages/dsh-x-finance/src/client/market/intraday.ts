import { useEffect, useState } from 'react'
import { MARKET_ENDPOINT } from '../../market.ts'
import type { MarketIntraday } from '../../market.ts'

export interface IntradayState {
  status: 'loading' | 'ready' | 'unconfigured' | 'error' | 'unavailable'
  value: MarketIntraday | null
  error: string
  refreshing: boolean
}

const INITIAL: IntradayState = { status: 'loading', value: null, error: '', refreshing: false }
const POLL_MS = 30_000
/**
 * The Host already retries each upstream once and falls back to a second one.
 * A short retry here covers the last hop (the local request itself) so one bad
 * poll does not paint the error card over a chart the user is watching. The
 * budget stops a hung bridge from stacking three long attempts on every poll.
 */
const ATTEMPTS = 3
const RETRY_MS = 700
const RUN_BUDGET_MS = 20_000

/**
 * Today's minute line for one symbol. It polls slowly while the page is
 * visible; a hidden page waits. A disabled source is never requested. A failed
 * poll keeps the line it already drew — the panel says when that line was
 * fetched — instead of blanking the chart on one bad request.
 */
export function useMarketIntraday(rpc: any, symbol: string | null) {
  const [state, setState] = useState<IntradayState>(INITIAL)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!symbol) {
      setState({ status: 'unavailable', value: null, error: 'finance/intraday-unavailable', refreshing: false })
      return
    }
    let disposed = false
    let timer = 0
    const controller = new AbortController()
    const stopped = () => disposed || controller.signal.aborted
    const wait = (ms: number) => new Promise<void>(resolve => {
      const handle = window.setTimeout(resolve, ms)
      controller.signal.addEventListener('abort', () => { window.clearTimeout(handle); resolve() }, { once: true })
    })
    const settle = (code: string) => setState(previous => ({
      status: code === 'finance/intraday-unavailable' ? 'unavailable' : 'error',
      value: previous.value?.symbol === symbol ? previous.value : null,
      error: code,
      refreshing: false,
    }))
    const run = async () => {
      setState(previous => previous.value?.symbol === symbol
        ? { ...previous, refreshing: true, error: '' }
        : { status: 'loading', value: null, error: '', refreshing: false })
      const startedAt = Date.now()
      let code = 'finance/market-unavailable'
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        if (stopped()) return
        try {
          if (!rpc?.call) { code = 'finance/connection'; break }
          const result = await rpc.call('/api', MARKET_ENDPOINT, { kind: 'intraday', symbol }, controller.signal)
          if (stopped()) return
          if (!result?.ok) { code = typeof result?.error?.code === 'string' ? result.error.code : 'finance/market-unavailable'; }
          else if (result.value?.status === 'unconfigured') {
            setState({ status: 'unconfigured', value: null, error: '', refreshing: false })
            return
          } else {
            const intraday = result.value?.intraday as MarketIntraday | undefined
            if (!intraday || intraday.symbol !== symbol || !Array.isArray(intraday.points) || !intraday.points.length) code = 'finance/invalid'
            else {
              setState({ status: 'ready', value: intraday, error: '', refreshing: false })
              return
            }
          }
        } catch (failure: any) {
          if (stopped()) return
          code = typeof failure?.code === 'string' ? failure.code : 'finance/market-unavailable'
        }
        // A symbol the Host answered "no line for" will not change on a retry;
        // only a transport failure or a thrown request is worth another try.
        if (code === 'finance/intraday-unavailable' || code === 'finance/invalid') break
        if (attempt + 1 < ATTEMPTS && Date.now() - startedAt < RUN_BUDGET_MS) await wait(RETRY_MS * (attempt + 1))
      }
      if (!stopped()) settle(code)
    }
    const arm = () => {
      timer = window.setTimeout(() => {
        if (disposed) return
        if (typeof document !== 'undefined' && document.hidden) { arm(); return }
        void run()
        arm()
      }, POLL_MS)
    }
    void run()
    arm()
    return () => { disposed = true; controller.abort(); window.clearTimeout(timer) }
  }, [rpc, symbol, tick])

  return { ...state, refresh: () => setTick(value => value + 1) }
}
