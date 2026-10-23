import { useEffect, useRef, useState } from 'react'
import { GOLD_ENDPOINT } from '../../gold.ts'
import type { GoldSnapshot } from '../../gold.ts'

export interface GoldPanelState {
  status: 'idle' | 'loading' | 'ready' | 'unconfigured' | 'error'
  value: GoldSnapshot | null
  error: string
  refreshing: boolean
}

const INITIAL: GoldPanelState = { status: 'idle', value: null, error: '', refreshing: false }

/**
 * Polls the gold route while it is visible. A disabled source stops polling
 * instead of retrying, and a failed refresh keeps the last good snapshot
 * visible as stale data rather than blanking the panel.
 */
export function useGoldPanel(rpc: any, options: { enabled?: boolean, pollMs?: number } = {}) {
  const { enabled = true, pollMs = 30_000 } = options
  const [tick, setTick] = useState(0)
  const [state, setState] = useState<GoldPanelState>(INITIAL)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  useEffect(() => {
    if (!enabled) { setState(INITIAL); return }
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined
    let delay = pollMs

    const schedule = () => { if (!disposed && delay > 0) timer = setTimeout(run, delay) }

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
        : { status: 'loading', value: null, error: '', refreshing: false })
      try {
        if (!rpc?.call) throw new Error('finance/connection')
        const result = await rpc.call('/api', GOLD_ENDPOINT, {}, local.signal)
        if (disposed || local.signal.aborted) return
        if (!result?.ok) {
          setState(previous => ({
            ...previous,
            status: previous.value ? 'ready' : 'error',
            error: typeof result?.error?.code === 'string' ? result.error.code : 'finance/gold-unavailable',
            refreshing: false,
          }))
          return
        }
        const payload = result.value
        if (payload?.status === 'unconfigured') {
          // The switch is the only thing that can turn this back on; polling a
          // deliberately disabled source would be a silent request anyway.
          delay = 0
          setState({ status: 'unconfigured', value: null, error: '', refreshing: false })
          return
        }
        const snapshot: GoldSnapshot | undefined = payload?.snapshot
        if (!snapshot || !Array.isArray(snapshot.instruments)) throw new Error('finance/invalid')
        setState({ status: 'ready', value: snapshot, error: '', refreshing: false })
      } catch {
        if (disposed || local.signal.aborted) return
        setState(previous => ({
          ...previous,
          status: previous.value ? 'ready' : 'error',
          error: 'finance/gold-unavailable',
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
  }, [rpc, enabled, pollMs, tick])

  const refresh = () => { if (alive.current) setTick(value => value + 1) }
  return { ...state, refresh }
}
