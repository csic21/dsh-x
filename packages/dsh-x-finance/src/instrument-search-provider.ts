// Optional, opt-in instrument-directory adapter backed by Tencent's public
// smartbox suggestion endpoint. It resolves a name fragment, pinyin initials or
// a code to exchange-qualified A-share / ETF / LOF / REIT identities. It is
// NOT a licensed directory and returns no prices: no SLA, no redistribution
// right, and it can break, delay or rate-limit at any time. It is only used
// behind the plugin's existing local-free-source opt-in, and only in response
// to an explicit user query.
//
// Only projected matches leave this module. Raw payloads, upstream errors and
// request details are never returned to the browser or written to disk.
import {
  SEARCH_MAX_RESULTS, SEARCH_RELAX_BELOW, SEARCH_SOURCE_NAME,
  normalizeMatch, normalizeSearchQuery, parseHkInstrumentHints, parseInstrumentHints, parseUsInstrumentHints,
  planSearch, rankCandidates,
} from './instrument-search.ts'
import type { InstrumentMarket, InstrumentMatch, SearchCandidate } from './instrument-search.ts'

export const SEARCH_URL = 'https://smartbox.gtimg.cn/s3/'
export const SEARCH_TIMEOUT_MS = 8_000
export const SEARCH_MAX_BYTES = 64 * 1024

export interface InstrumentSearchOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export interface InstrumentSearchProvider {
  name: string
  search(query: string, options?: { signal?: AbortSignal, market?: InstrumentMarket }): Promise<InstrumentMatch[]>
}

function fail(message: string): never {
  throw new Error(message)
}

async function readText(response: Response, signal: AbortSignal): Promise<string> {
  const length = Number(response.headers.get('content-length'))
  if (Number.isFinite(length) && length > SEARCH_MAX_BYTES) fail('response too large')
  const type = (response.headers.get('content-type') ?? '').toLowerCase()
  if (type && !type.startsWith('text/')) fail('unexpected content type')
  if (!response.body) fail('empty response')
  const reader = response.body.getReader()
  const cancel = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', cancel, { once: true })
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > SEARCH_MAX_BYTES) fail('response too large')
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
  return new TextDecoder('utf-8').decode(bytes)
}

/**
 * Creates the opt-in directory adapter. Every probe in the plan is
 * re-validated, each response body is bounded, and only allowlisted fields are
 * projected.
 *
 * The directory resolves one contiguous substring per request, so a compound
 * query is probed in a short ladder instead of being sent verbatim: the typed
 * query first, then its token concatenation, then the content tokens, then —
 * only while the merged pool is still thin — one shortened CJK token. Probes
 * stop as soon as a full page is in hand, and the whole ladder shares one
 * timeout, so the worst case is still a bounded number of requests inside the
 * existing 8 second budget.
 */
export function createInstrumentSearchProvider(options: InstrumentSearchOptions = {}): InstrumentSearchProvider {
  const { fetchImpl = globalThis.fetch, timeoutMs = SEARCH_TIMEOUT_MS } = options
  if (typeof fetchImpl !== 'function') throw new Error('search fetch unavailable')
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new Error('invalid search timeout')
  return {
    name: SEARCH_SOURCE_NAME,
    async search(input: unknown, { signal, market = 'cn' }: { signal?: AbortSignal, market?: InstrumentMarket } = {}) {
      const plan = planSearch(normalizeSearchQuery(input))
      if (signal?.aborted) fail('cancelled')
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      const cancel = () => controller.abort()
      signal?.addEventListener('abort', cancel, { once: true })
      // One upstream host serves all three directories; the market only changes
      // which rows are projected and how their identity is spelled.
      const parse = market === 'us' ? parseUsInstrumentHints
        : market === 'hk' ? parseHkInstrumentHints
          : parseInstrumentHints
      const candidates: SearchCandidate[] = []
      const seen = new Set<string>()
      const probe = async (query: string) => {
        const response = await fetchImpl(`${SEARCH_URL}?q=${encodeURIComponent(query)}&t=all`, {
          method: 'GET',
          redirect: 'error',
          signal: controller.signal,
          headers: { accept: 'text/plain', 'user-agent': 'dsh-x-finance/0.4 (local-only)' },
        })
        if (!response.ok) {
          void response.body?.cancel().catch(() => {})
          fail(`http ${response.status}`)
        }
        const text = await readText(response, controller.signal)
        for (const match of parse(text).map(normalizeMatch)) {
          if (seen.has(match.symbol)) continue
          seen.add(match.symbol)
          candidates.push({ match, via: query, order: candidates.length })
        }
      }
      try {
        // A name that equals the query's own words answers the whole query, so
        // it ends the ladder even when the pool is not full yet.
        const joined = plan.tokens.join('').toUpperCase()
        for (const [index, query] of plan.probes.entries()) {
          if (candidates.length >= SEARCH_MAX_RESULTS) break
          try {
            await probe(query)
          } catch (error) {
            // The typed query failing is the answer, and a cancelled request
            // stays cancelled. A later probe only exists for extra recall, so
            // it stops the ladder instead of discarding what already matched.
            if (index === 0 || signal?.aborted) throw error
            break
          }
          if (candidates.some(candidate => candidate.match.name.toUpperCase() === joined)) break
        }
        if (plan.relax && candidates.length < SEARCH_RELAX_BELOW && !signal?.aborted) {
          try { await probe(plan.relax) } catch { /* Keep the strict results. */ }
        }
        return rankCandidates(candidates, plan).slice(0, SEARCH_MAX_RESULTS)
      } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', cancel)
        controller.abort()
      }
    },
  }
}
