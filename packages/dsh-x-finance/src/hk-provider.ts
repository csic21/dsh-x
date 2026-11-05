// Optional, opt-in Hong Kong adapter backed by Tencent's public HK quote and
// daily-bar endpoints. It is part of the same explicitly enabled local free
// source as the A-share board: no key, no SLA, no redistribution right, and it
// can delay, break or rate-limit at any time. It is only used behind the
// plugin's existing source switch and only in response to an explicit lookup.
//
// Only projected fields leave this module. Raw payloads, upstream errors and
// request details are never returned to the browser or written to disk.
import {
  HK_HISTORY_MAX_BYTES, HK_QUOTE_MAX_BYTES, HK_SOURCE_NAME, HK_TIMEOUT_MS,
  hkError, hkHistoryUrl, hkQuoteUrl, normalizeHkSymbol, parseHkHistory, parseHkQuote, validateHkHistoryLimit,
} from './hk-market.ts'
import type { HkQuote } from './hk-market.ts'
import type { MarketHistory } from './market.ts'

export interface HkProvider {
  name: string
  quote(symbol: string, options?: { signal?: AbortSignal }): Promise<HkQuote>
  history(
    request: { symbol: string, limit: number },
    options?: { signal?: AbortSignal },
  ): Promise<MarketHistory>
}

export interface HkProviderOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
  now?: () => number
}

function assertTextResponse(response: Response): void {
  if (!response.ok) {
    void response.body?.cancel().catch(() => {})
    // A 4xx/5xx is a transport-level failure, not "this listing has no data".
    throw hkError('finance/hk-unavailable', '港股行情暂不可用，请稍后重试。')
  }
  const type = (response.headers.get('content-type') ?? '').toLowerCase()
  if (type && !/^(?:text\/|application\/(?:[\w.-]+\+)?json\b)/.test(type)) {
    void response.body?.cancel().catch(() => {})
    throw hkError('finance/hk-unavailable', '港股行情暂不可用，请稍后重试。')
  }
}

async function readBody(response: Response, maxBytes: number, signal: AbortSignal): Promise<Uint8Array> {
  const length = Number(response.headers.get('content-length'))
  if (Number.isFinite(length) && length > maxBytes) {
    void response.body?.cancel().catch(() => {})
    throw hkError('finance/hk-unavailable', '港股行情响应过大。')
  }
  if (!response.body) throw hkError('finance/hk-unavailable', '港股行情响应为空。')
  const reader = response.body.getReader()
  const cancel = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', cancel, { once: true })
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      if (signal.aborted) throw hkError('finance/cancelled', '港股行情请求已取消。')
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) throw hkError('finance/hk-unavailable', '港股行情响应过大。')
      chunks.push(value)
    }
  } finally {
    signal.removeEventListener('abort', cancel)
    void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return bytes
}

/**
 * The adapter re-validates every identity it is handed and reuses the same
 * parser the tests exercise. It never retries a throttled request, and it
 * reports a missing listing as unavailable rather than as a network error.
 */
export function createTencentHkProvider(options: HkProviderOptions = {}): HkProvider {
  const { fetchImpl = globalThis.fetch, timeoutMs = HK_TIMEOUT_MS, now = Date.now } = options
  if (typeof fetchImpl !== 'function') throw new Error('hk fetch unavailable')
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new Error('invalid hk timeout')

  async function request(url: string, encoding: 'utf-8' | 'gbk', maxBytes: number, signal?: AbortSignal): Promise<string> {
    const controller = new AbortController()
    const cancel = () => controller.abort()
    if (signal?.aborted) cancel()
    signal?.addEventListener('abort', cancel, { once: true })
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        redirect: 'error',
        signal: controller.signal,
        headers: { accept: 'text/plain, application/json', 'user-agent': 'dsh-x-finance/0.4 (local-only)' },
      })
      assertTextResponse(response)
      const bytes = await readBody(response, maxBytes, controller.signal)
      return new TextDecoder(encoding).decode(bytes)
    } catch (error: any) {
      // Never expose upstream bodies, hosts or raw network errors.
      if (error?.code) throw error
      if (signal?.aborted || controller.signal.aborted) throw hkError('finance/cancelled', '港股行情请求已取消。')
      throw hkError('finance/hk-unavailable', '港股行情暂不可用，请稍后重试。')
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', cancel)
      controller.abort()
    }
  }

  async function quote(input: unknown, { signal }: { signal?: AbortSignal } = {}): Promise<HkQuote> {
    const symbol = normalizeHkSymbol(input)
    const text = await request(hkQuoteUrl(symbol), 'gbk', HK_QUOTE_MAX_BYTES, signal)
    return parseHkQuote(text, symbol, now())
  }

  async function history(
    request_: { symbol: string, limit: number },
    { signal }: { signal?: AbortSignal } = {},
  ): Promise<MarketHistory> {
    const symbol = normalizeHkSymbol(request_?.symbol)
    const limit = validateHkHistoryLimit(request_?.limit)
    const text = await request(hkHistoryUrl(symbol, limit), 'utf-8', HK_HISTORY_MAX_BYTES, signal)
    let payload: unknown
    try { payload = JSON.parse(text) }
    catch { throw hkError('finance/hk-history-unavailable', '这只港股没有可用的日 K 数据。') }
    return parseHkHistory(payload, { symbol, limit, now: now() })
  }

  return { name: HK_SOURCE_NAME, quote, history }
}
