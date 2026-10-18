import { useEffect, useRef, useState } from 'react'
import { MARKET_ENDPOINT } from '../../market.ts'
import type { BoardDetail, MarketBreadth, MarketOverview } from '../../market.ts'

export interface MarketDataState<T> {
  status: 'loading' | 'ready' | 'unconfigured' | 'error'
  value: T | null
  error: string
  refreshing: boolean
}

const INITIAL = { status: 'loading' as const, value: null, error: '', refreshing: false }

function useMarketResource<T>(
  rpc: any,
  kind: 'overview' | 'breadth' | 'board',
  board: string | undefined,
  options: { pollMs?: number; enabled?: boolean } = {},
): MarketDataState<T> & { refresh: () => void } {
  const { pollMs = 60_000, enabled = true } = options
  const [tick, setTick] = useState(0)
  const [state, setState] = useState<MarketDataState<T>>(INITIAL)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  useEffect(() => {
    if (!enabled) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined

    const schedule = () => {
      if (disposed || pollMs <= 0) return
      timer = setTimeout(run, pollMs)
    }

    async function run() {
      if (disposed) return
      if (typeof document !== 'undefined' && document.hidden) { schedule(); return }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { schedule(); return }
      clearTimeout(timer)
      controller?.abort()
      const local = new AbortController()
      controller = local
      setState(previous => previous.value
        ? { ...previous, refreshing: true, error: '' }
        : { ...previous, status: 'loading', refreshing: false })
      try {
        if (!rpc?.call) throw new Error('stock/connection')
        const request = kind === 'board' ? { kind, board } : { kind }
        const result = await rpc.call('/api', MARKET_ENDPOINT, request, local.signal)
        if (disposed || local.signal.aborted) return
        if (!result?.ok) {
          setState(previous => ({
            ...previous,
            status: previous.value ? 'ready' : 'error',
            error: typeof result?.error?.code === 'string' ? result.error.code : 'stock/market-unavailable',
            refreshing: false,
          }))
          return
        }
        const payload = result.value
        if (payload?.status === 'unconfigured') {
          setState({ status: 'unconfigured', value: null, error: '', refreshing: false })
          return
        }
        const value = kind === 'overview' ? payload?.overview : kind === 'breadth' ? payload?.breadth : payload?.board
        if (!value) throw new Error('stock/invalid')
        setState({ status: 'ready', value: value as T, error: '', refreshing: false })
      } catch {
        if (disposed || local.signal.aborted) return
        setState(previous => ({
          ...previous,
          status: previous.value ? 'ready' : 'error',
          error: 'stock/market-unavailable',
          refreshing: false,
        }))
      } finally {
        if (!disposed) schedule()
      }
    }

    const resume = () => {
      if (typeof document !== 'undefined' && document.hidden) return
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
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
  }, [rpc, kind, board, enabled, pollMs, tick])

  const refresh = () => { if (alive.current) setTick(value => value + 1) }
  return { ...state, refresh }
}

export function useMarketOverview(rpc: any, options: { pollMs?: number } = {}) {
  return useMarketResource<MarketOverview>(rpc, 'overview', undefined, { pollMs: 60_000, ...options })
}

export function useMarketBreadth(rpc: any, options: { pollMs?: number } = {}) {
  return useMarketResource<MarketBreadth>(rpc, 'breadth', undefined, { pollMs: 300_000, ...options })
}

export function useBoardDetail(rpc: any, code: string, options: { pollMs?: number } = {}) {
  return useMarketResource<BoardDetail>(rpc, 'board', code, { pollMs: 120_000, ...options })
}
