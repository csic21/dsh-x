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
 * Today's minute line for one symbol. It polls slowly while the page is
 * visible; a hidden page waits. A disabled source is never requested.
 */
export function useMarketIntraday(rpc: any, symbol: string | null) {
  const [state, setState] = useState<IntradayState>(INITIAL)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!symbol) {
      setState({ status: 'unavailable', value: null, error: 'stock/intraday-unavailable', refreshing: false })
      return
    }
    let disposed = false
    let timer = 0
    const controller = new AbortController()
    const run = async () => {
      setState(previous => previous.value?.symbol === symbol
        ? { ...previous, refreshing: true, error: '' }
        : { status: 'loading', value: null, error: '', refreshing: false })
      const fail = (code: string) => setState({
        status: code === 'stock/intraday-unavailable' ? 'unavailable' : 'error',
        value: null, error: code, refreshing: false,
      })
      try {
        if (!rpc?.call) return fail('stock/connection')
        const result = await rpc.call('/api', MARKET_ENDPOINT, { kind: 'intraday', symbol }, controller.signal)
        if (disposed || controller.signal.aborted) return
        if (!result?.ok) return fail(typeof result?.error?.code === 'string' ? result.error.code : 'stock/market-unavailable')
        if (result.value?.status === 'unconfigured') {
          setState({ status: 'unconfigured', value: null, error: '', refreshing: false })
          return
        }
        const intraday = result.value?.intraday as MarketIntraday | undefined
        if (!intraday || intraday.symbol !== symbol || !Array.isArray(intraday.points) || !intraday.points.length) return fail('stock/invalid')
        setState({ status: 'ready', value: intraday, error: '', refreshing: false })
      } catch (failure: any) {
        if (disposed || controller.signal.aborted) return
        fail(typeof failure?.code === 'string' ? failure.code : 'stock/market-unavailable')
      }
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
