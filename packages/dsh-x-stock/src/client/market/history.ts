import { useEffect, useState } from 'react'
import { MARKET_ENDPOINT } from '../../market.ts'
import type { MarketAdjustment, MarketHistory } from '../../market.ts'

export interface HistoryState {
  status: 'loading' | 'ready' | 'unconfigured' | 'error' | 'unavailable'
  value: MarketHistory | null
  error: string
  refreshing: boolean
}

const INITIAL: HistoryState = { status: 'loading', value: null, error: '', refreshing: false }

/**
 * One symbol's daily history. Unlike the quote hooks this is not polled: daily
 * bars change once per session, and the Host marks the newest bar provisional
 * while a session is still running. A disabled source is never requested, and
 * an in-flight request is aborted when the selected stock or adjustment changes.
 */
export function useMarketHistory(rpc: any, symbol: string | null, adjustment: MarketAdjustment, limit = 250) {
  const [state, setState] = useState<HistoryState>(INITIAL)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!symbol) {
      setState({ status: 'unavailable', value: null, error: 'stock/history-unavailable', refreshing: false })
      return
    }
    let disposed = false
    const controller = new AbortController()
    const run = async () => {
      setState(previous => previous.value?.symbol === symbol && previous.value.adjustment === adjustment
        ? { ...previous, refreshing: true, error: '' }
        : { status: 'loading', value: null, error: '', refreshing: false })
      const fail = (code: string) => setState({
        status: code === 'stock/history-unavailable' ? 'unavailable' : 'error',
        value: null,
        error: code,
        refreshing: false,
      })
      try {
        if (!rpc?.call) return fail('stock/connection')
        const result = await rpc.call('/api', MARKET_ENDPOINT, { kind: 'history', symbol, adjustment, limit }, controller.signal)
        if (disposed || controller.signal.aborted) return
        if (!result?.ok) return fail(typeof result?.error?.code === 'string' ? result.error.code : 'stock/market-unavailable')
        if (result.value?.status === 'unconfigured') {
          setState({ status: 'unconfigured', value: null, error: '', refreshing: false })
          return
        }
        const history = result.value?.history as MarketHistory | undefined
        if (!history || history.symbol !== symbol || !Array.isArray(history.bars) || !history.bars.length) return fail('stock/invalid')
        setState({ status: 'ready', value: history, error: '', refreshing: false })
      } catch (failure: any) {
        if (disposed || controller.signal.aborted) return
        fail(typeof failure?.code === 'string' ? failure.code : 'stock/market-unavailable')
      }
    }
    void run()
    return () => { disposed = true; controller.abort() }
  }, [rpc, symbol, adjustment, limit, tick])

  return { ...state, refresh: () => { setTick(value => value + 1) } }
}
