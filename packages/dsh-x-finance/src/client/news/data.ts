import { useEffect, useMemo, useRef, useState } from 'react'
import { NEWS_ENDPOINT } from '../../news.ts'
import type { NewsFeed, NewsRequest } from '../../news.ts'

export interface NewsFeedState {
  status: 'idle' | 'loading' | 'ready' | 'unconfigured' | 'error'
  feed: NewsFeed | null
  error: string
  refreshing: boolean
}

const INITIAL: NewsFeedState = { status: 'idle', feed: null, error: '', refreshing: false }

export interface NewsFeedOptions {
  enabled?: boolean
  /** The flash feed is a 7x24 stream; a stock's article list moves far slower. */
  pollMs?: number
}

/**
 * Polls one news route while it is mounted. The source switch stops polling
 * instead of retrying, and a failed refresh keeps the last good list visible as
 * stale data with the failure named, matching the quote panels' behaviour.
 */
export function useNewsFeed(rpc: any, request: NewsRequest | null, options: NewsFeedOptions = {}): NewsFeedState & { refresh: () => void } {
  const { enabled = true, pollMs } = options
  const [tick, setTick] = useState(0)
  const [state, setState] = useState<NewsFeedState>(INITIAL)
  const alive = useRef(true)
  const key = useMemo(() => (request ? JSON.stringify(request) : ''), [request])
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  useEffect(() => {
    if (!enabled || !key) { setState(INITIAL); return }
    const payload = JSON.parse(key) as NewsRequest
    const delayMs = pollMs ?? (payload.kind === 'flash' ? 60_000 : 120_000)
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined
    let delay = delayMs

    const schedule = () => { if (!disposed && delay > 0) timer = setTimeout(run, delay) }

    async function run() {
      if (disposed) return
      if (typeof document !== 'undefined' && document.hidden) { schedule(); return }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { schedule(); return }
      clearTimeout(timer)
      delay = delayMs
      controller?.abort()
      const local = new AbortController()
      controller = local
      setState(previous => previous.feed
        ? { ...previous, refreshing: true, error: '' }
        : { status: 'loading', feed: null, error: '', refreshing: false })
      try {
        if (!rpc?.call) throw new Error('finance/connection')
        const result = await rpc.call('/api', NEWS_ENDPOINT, payload, local.signal)
        if (disposed || local.signal.aborted) return
        if (!result?.ok) {
          setState(previous => ({
            ...previous,
            status: previous.feed ? 'ready' : 'error',
            error: typeof result?.error?.code === 'string' ? result.error.code : 'finance/news-unavailable',
            refreshing: false,
          }))
          return
        }
        const value = result.value
        if (value?.status === 'unconfigured') {
          // The switch is the only thing that can turn this back on; polling a
          // deliberately disabled source would be a silent request anyway.
          delay = 0
          setState({ status: 'unconfigured', feed: null, error: '', refreshing: false })
          return
        }
        const feed: NewsFeed | undefined = value?.news
        if (!feed || !Array.isArray(feed.items)) throw new Error('finance/invalid')
        setState({ status: 'ready', feed, error: '', refreshing: false })
      } catch {
        if (disposed || local.signal.aborted) return
        setState(previous => ({
          ...previous,
          status: previous.feed ? 'ready' : 'error',
          error: 'finance/news-unavailable',
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
  }, [rpc, enabled, key, pollMs, tick])

  const refresh = () => { if (alive.current) setTick(value => value + 1) }
  return { ...state, refresh }
}
