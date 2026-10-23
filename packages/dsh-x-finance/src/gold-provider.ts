// Optional, opt-in gold panel adapter backed by Sina's public quote and daily
// series endpoints. Same posture as the A-share adapter: NOT a licensed feed,
// no SLA, no redistribution right, may delay or break at any time, and only
// reachable after the single explicit free-source opt-in.
//
// The feed is GBK text and the daily series is a JSONP body. Both are decoded
// and validated here; raw payloads, upstream errors and request details never
// leave this module.
import {
  GOLD_HISTORY_PATH, GOLD_HISTORY_TTL_MS, GOLD_MAX_BYTES, GOLD_QUOTE_ENDPOINT, GOLD_QUOTE_KEYS,
  GOLD_SNAPSHOT_TTL_MS, GOLD_SOURCE_NAME, GOLD_TIMEOUT_MS, computeGoldSeries, deriveGold,
  parseGoldHistory, parseGoldQuotes,
} from './gold.ts'
import type { GoldSeries, GoldSnapshot } from './gold.ts'

export interface GoldProvider {
  readonly name: string
  snapshot(signal?: AbortSignal): Promise<GoldSnapshot>
}

export interface GoldProviderOptions {
  fetchImpl?: typeof fetch
  now?: () => number
  timeoutMs?: number
  snapshotTtlMs?: number
  historyTtlMs?: number
}

interface CacheEntry<T> { expires: number; value: T }

export function createSinaGoldProvider(options: GoldProviderOptions = {}): GoldProvider {
  const {
    fetchImpl = fetch,
    now = Date.now,
    timeoutMs = GOLD_TIMEOUT_MS,
    snapshotTtlMs = GOLD_SNAPSHOT_TTL_MS,
    historyTtlMs = GOLD_HISTORY_TTL_MS,
  } = options
  if (typeof fetchImpl !== 'function') throw new Error('gold fetch unavailable')
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new Error('invalid gold timeout')

  const seriesCache = new Map<'XAU' | 'GC', CacheEntry<GoldSeries>>()
  const inflightSeries = new Map<'XAU' | 'GC', Promise<GoldSeries>>()
  let cached: CacheEntry<GoldSnapshot> | undefined

  async function request(url: string, encoding: 'utf-8' | 'gbk', maxBytes: number, signal?: AbortSignal): Promise<string> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        redirect: 'error',
        signal: controller.signal,
        headers: {
          accept: 'text/plain, text/html, application/javascript',
          // The public page sends its own origin; without it the host answers 403.
          referer: 'https://finance.sina.com.cn/',
          'user-agent': 'dsh-x-finance/0.3 (local-only)',
        },
      })
      if (!response.ok) throw new Error('gold upstream status')
      const type = (response.headers.get('content-type') ?? '').toLowerCase()
      if (type.includes('text/html')) throw new Error('gold upstream not data')
      const length = Number(response.headers.get('content-length'))
      if (Number.isFinite(length) && length > maxBytes) throw new Error('gold upstream too large')
      const chunks: Uint8Array[] = []
      let total = 0
      const reader = (response.body as ReadableStream<Uint8Array> | null)?.getReader()
      if (!reader) {
        const buffer = new Uint8Array(await response.arrayBuffer())
        if (buffer.byteLength > maxBytes) throw new Error('gold upstream too large')
        return new TextDecoder(encoding).decode(buffer)
      }
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > maxBytes) { await reader.cancel().catch(() => {}); throw new Error('gold upstream too large') }
        chunks.push(value)
      }
      const merged = new Uint8Array(total)
      let offset = 0
      for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength }
      return new TextDecoder(encoding).decode(merged)
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      controller.abort()
    }
  }

  async function dailySeries(key: 'XAU' | 'GC', signal?: AbortSignal): Promise<GoldSeries> {
    const hit = seriesCache.get(key)
    if (hit && hit.expires > now()) return hit.value
    const pending = inflightSeries.get(key)
    if (pending) return pending
    const task = (async () => {
      const url = `${GOLD_HISTORY_PATH}var%20_${key}=/GlobalFuturesService.getGlobalFuturesDailyKLine?symbol=${key}`
      const text = await request(url, 'utf-8', GOLD_MAX_BYTES, signal)
      const value = computeGoldSeries(key, parseGoldHistory(text))
      seriesCache.set(key, { expires: now() + historyTtlMs, value })
      return value
    })()
    inflightSeries.set(key, task)
    try { return await task } finally { inflightSeries.delete(key) }
  }

  return {
    name: GOLD_SOURCE_NAME,
    async snapshot(signal?: AbortSignal) {
      const timestamp = now()
      if (cached && cached.expires > timestamp) return cached.value
      const text = await request(`${GOLD_QUOTE_ENDPOINT}${GOLD_QUOTE_KEYS.join(',')}`, 'gbk', 64 * 1024, signal)
      if (!text.trim()) throw new Error('empty gold quote response')
      const instruments = parseGoldQuotes(text, timestamp)
      if (!instruments.length) throw new Error('empty gold quote response')
      // A missing daily series must not hide the quotes: the panel reports the
      // ranges it actually has and says the rest is unavailable.
      const settled = await Promise.allSettled([dailySeries('XAU', signal), dailySeries('GC', signal)])
      const series = settled.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
      const value: GoldSnapshot = {
        source: GOLD_SOURCE_NAME,
        fetchedAt: new Date(timestamp).toISOString(),
        instruments,
        derived: deriveGold(instruments),
        series,
        seriesIncomplete: series.length < 2,
      }
      cached = { expires: timestamp + snapshotTtlMs, value }
      return value
    },
  }
}
