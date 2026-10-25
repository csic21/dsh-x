import { useEffect, useRef, useState } from 'react'
import { MARKET_ENDPOINT, MARKET_PREFERENCE_ENDPOINT } from '../../market.ts'
import type { BoardDetail, MarketBreadth, MarketOverview } from '../../market.ts'
import type { TailScanResult } from '../../tail-scan.ts'
import type { HotScanResult } from '../../hot.ts'
import type { GlobalMarketOverview } from '../../global.ts'

export interface MarketDataState<T> {
  status: 'loading' | 'ready' | 'unconfigured' | 'error'
  value: T | null
  error: string
  refreshing: boolean
}

const INITIAL = { status: 'loading' as const, value: null, error: '', refreshing: false }

function useMarketResource<T>(
  rpc: any,
  kind: 'overview' | 'breadth' | 'board' | 'global',
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
    let delay = pollMs

    const schedule = () => {
      if (disposed || delay <= 0) return
      timer = setTimeout(run, delay)
    }

    async function run() {
      if (disposed) return
      if (typeof document !== 'undefined' && document.hidden) { schedule(); return }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { schedule(); return }
      clearTimeout(timer)
      delay = pollMs
      controller?.abort()
      const local = new AbortController()
      controller = local
      setState(previous => previous.value
        ? { ...previous, refreshing: true, error: '' }
        : { ...previous, status: 'loading', refreshing: false })
      try {
        if (!rpc?.call) throw new Error('finance/connection')
        const request = kind === 'board' ? { kind, board } : { kind }
        const result = await rpc.call('/api', MARKET_ENDPOINT, request, local.signal)
        if (disposed || local.signal.aborted) return
        if (!result?.ok) {
          setState(previous => ({
            ...previous,
            status: previous.value ? 'ready' : 'error',
            error: typeof result?.error?.code === 'string' ? result.error.code : 'finance/market-unavailable',
            refreshing: false,
          }))
          return
        }
        const payload = result.value
        if (payload?.status === 'unconfigured') {
          // A deliberately disabled source must not be polled. The switch
          // triggers refresh() when it is turned on again.
          delay = 0
          setState({ status: 'unconfigured', value: null, error: '', refreshing: false })
          return
        }
        const value = kind === 'overview' ? payload?.overview : kind === 'breadth' ? payload?.breadth : kind === 'global' ? payload?.global : payload?.board
        if (!value) throw new Error('finance/invalid')
        setState({ status: 'ready', value: value as T, error: '', refreshing: false })
      } catch {
        if (disposed || local.signal.aborted) return
        setState(previous => ({
          ...previous,
          status: previous.value ? 'ready' : 'error',
          error: 'finance/market-unavailable',
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

/** The global board refreshes at the same pace as the A-share index snapshot. */
export function useGlobalMarket(rpc: any, options: { pollMs?: number } = {}) {
  return useMarketResource<GlobalMarketOverview>(rpc, 'global', undefined, { pollMs: 60_000, ...options })
}

export function useMarketBreadth(rpc: any, options: { pollMs?: number } = {}) {
  return useMarketResource<MarketBreadth>(rpc, 'breadth', undefined, { pollMs: 300_000, ...options })
}

export function useBoardDetail(rpc: any, code: string, options: { pollMs?: number } = {}) {
  return useMarketResource<BoardDetail>(rpc, 'board', code, { pollMs: 120_000, ...options })
}


export interface TailScanState {
  status: 'idle' | 'loading' | 'ready' | 'error' | 'unconfigured'
  value: TailScanResult | null
  error: string
  running: boolean
}

/**
 * The scan is heavy (a full-market pre-screen plus bounded minute and daily
 * requests), so it is manual: mounting the market page never starts it. A
 * previous successful result stays visible while a new scan is running, and
 * unmounting aborts the in-flight request.
 */
export function useTailScan(rpc: any) {
  const [state, setState] = useState<TailScanState>({ status: 'idle', value: null, error: '', running: false })
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => { controller.current?.abort() }, [])
  const run = async () => {
    controller.current?.abort()
    const local = new AbortController()
    controller.current = local
    setState(previous => previous.value
      ? { ...previous, running: true, error: '' }
      : { ...previous, status: 'loading', running: true, error: '' })
    try {
      if (!rpc?.call) throw new Error('finance/connection')
      const result = await rpc.call('/api', MARKET_ENDPOINT, { kind: 'tail-scan' }, local.signal)
      if (local.signal.aborted) return
      if (!result?.ok) throw new Error(typeof result?.error?.code === 'string' ? result.error.code : 'finance/tail-scan-unavailable')
      const payload = result.value
      if (payload?.status === 'unconfigured') {
        setState({ status: 'unconfigured', value: null, error: '', running: false })
        return
      }
      if (!payload?.tailScan || typeof payload.tailScan !== 'object') throw new Error('finance/invalid')
      setState({ status: 'ready', value: payload.tailScan as TailScanResult, error: '', running: false })
    } catch {
      if (local.signal.aborted) return
      setState(previous => ({
        ...previous,
        status: previous.value ? 'ready' : 'error',
        error: 'finance/tail-scan-unavailable',
        running: false,
      }))
    }
  }
  return { ...state, run }
}

export interface MarketPreferenceState {
  status: 'loading' | 'ready' | 'error'
  enabled: boolean
  forced: boolean
  busy: boolean
  error: string
}

export function useMarketPreference(rpc: any) {
  const [state, setState] = useState<MarketPreferenceState>({ status: 'loading', enabled: false, forced: false, busy: false, error: '' })
  useEffect(() => {
    let disposed = false
    const controller = new AbortController()
    const read = async () => {
      try {
        const result = await rpc?.call('/api', MARKET_PREFERENCE_ENDPOINT, { action: 'get' }, controller.signal)
        if (disposed || controller.signal.aborted) return
        if (!result?.ok) throw new Error()
        setState({ status: 'ready', enabled: result.value?.enabled === true, forced: result.value?.forced === true, busy: false, error: '' })
      } catch {
        if (disposed || controller.signal.aborted) return
        setState({ status: 'error', enabled: false, forced: false, busy: false, error: 'finance/market-preference' })
      }
    }
    void read()
    return () => { disposed = true; controller.abort() }
  }, [rpc])

  const setEnabled = async (enabled: boolean) => {
    setState(previous => ({ ...previous, busy: true, error: '' }))
    try {
      const result = await rpc?.call('/api', MARKET_PREFERENCE_ENDPOINT, { action: 'set', enabled })
      if (!result?.ok) throw new Error()
      const value = result.value
      const next = { status: 'ready' as const, enabled: value?.enabled === true, forced: value?.forced === true, busy: false, error: '' }
      setState(next)
      return next
    } catch {
      setState(previous => ({ ...previous, busy: false, error: 'finance/market-preference' }))
      throw new Error('market-preference')
    }
  }
  return { ...state, setEnabled }
}

export interface HotScanState {
  status: 'idle' | 'loading' | 'ready' | 'error' | 'unconfigured'
  value: HotScanResult | null
  error: string
  running: boolean
  /** Board code the displayed run was limited to, null for the whole market. */
  board: string | null
  /** Seconds the current run has been waiting, for the progress line. */
  elapsed: number
}

/**
 * The hot screen is explicit-run like the tail scan: nothing is fetched until
 * the reader asks, and a previous result stays visible while a new run is in
 * flight. `elapsed` only measures this browser's wait, not the Host's compute.
 */
export function useHotScan(rpc: any) {
  const [state, setState] = useState<HotScanState>({ status: 'idle', value: null, error: '', running: false, board: null, elapsed: 0 })
  const controller = useRef<AbortController | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const stopTimer = () => { if (timer.current) { clearInterval(timer.current); timer.current = null } }
  useEffect(() => () => { controller.current?.abort(); stopTimer() }, [])
  const run = async (board?: string) => {
    controller.current?.abort()
    stopTimer()
    const local = new AbortController()
    controller.current = local
    const started = Date.now()
    setState(previous => ({
      status: previous.value ? previous.status : 'loading',
      value: previous.value,
      error: '',
      running: true,
      board: board ?? null,
      elapsed: 0,
    }))
    timer.current = setInterval(() => {
      setState(previous => previous.running ? { ...previous, elapsed: Math.round((Date.now() - started) / 1000) } : previous)
    }, 1000)
    try {
      if (!rpc?.call) throw new Error('finance/connection')
      const request = board ? { kind: 'hot-scan', board } : { kind: 'hot-scan' }
      const result = await rpc.call('/api', MARKET_ENDPOINT, request, local.signal)
      if (local.signal.aborted) return
      if (!result?.ok) throw new Error(typeof result?.error?.code === 'string' ? result.error.code : 'finance/hot-scan-unavailable')
      const payload = result.value
      if (payload?.status === 'unconfigured') {
        stopTimer()
        setState({ status: 'unconfigured', value: null, error: '', running: false, board: board ?? null, elapsed: 0 })
        return
      }
      if (!payload?.hotScan || typeof payload.hotScan !== 'object') throw new Error('finance/invalid')
      stopTimer()
      setState({ status: 'ready', value: payload.hotScan as HotScanResult, error: '', running: false, board: board ?? null, elapsed: 0 })
    } catch {
      if (local.signal.aborted) return
      stopTimer()
      setState(previous => ({
        status: previous.value ? 'ready' : 'error',
        value: previous.value,
        error: 'finance/hot-scan-unavailable',
        running: false,
        board: board ?? null,
        elapsed: 0,
      }))
    }
  }
  return { ...state, run }
}
