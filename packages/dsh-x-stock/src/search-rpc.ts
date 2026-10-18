import { SEARCH_MAX_RESULTS, SEARCH_RPC_ENDPOINT, SEARCH_SOURCE_NAME, normalizeMatch, parseSearchRequest } from './instrument-search.ts'
import type { InstrumentMatch } from './instrument-search.ts'
import type { InstrumentSearchProvider } from './instrument-search-provider.ts'
import { createRpcRoute } from './watchlist-rpc.ts'

const failure = (code: string, message: string) => ({ ok: false, error: { code, message, details: {} } })

export interface InstrumentSearchGate {
  enabled: () => boolean | Promise<boolean>
  provider?: InstrumentSearchProvider
}

/**
 * Exact-route handler behind the official shared Connection admission bridge.
 * The bridge rejects non-owner peers before this code runs; the explicit check
 * keeps the handler safe when it is called directly in tests or another Host.
 *
 * The directory is part of the plugin's explicitly opt-in local free source:
 * a disabled gate returns `status: 'disabled'` without any network request.
 */
export function createSearchHandler({ enabled, provider }: InstrumentSearchGate) {
  return async (endpoint: any, payload: any, signal: any, peer: any) => {
    if (peer?.principal?.kind !== 'owner') return failure('stock/forbidden', '只允许宿主所有者使用名称搜索。')
    if (endpoint !== SEARCH_RPC_ENDPOINT) return failure('stock/not-found', '未知搜索接口。')
    let request
    try { request = parseSearchRequest(payload) }
    catch { return failure('stock/invalid-query', '请输入 1–24 个字符的名称、拼音或代码。') }
    if (signal?.aborted) return failure('stock/cancelled', '搜索请求已取消。')
    let on = false
    try { on = Boolean(await enabled()) } catch { on = false }
    if (!on) return { ok: true, value: { status: 'disabled', enabled: false, available: false, source: null, results: [] } }
    // `available` stays false when this host has no fetch implementation, so
    // the client can say "unavailable" instead of asking to turn the source on.
    if (request.action === 'status') return { ok: true, value: { status: 'ready', enabled: true, available: Boolean(provider), source: SEARCH_SOURCE_NAME, results: [] } }
    if (!provider) return failure('stock/search-unavailable', '名称搜索暂不可用，请稍后重试。')
    try {
      const matches = await provider.search(request.query, { signal })
      // Re-validate the adapter's output so a replacement provider cannot leak
      // extra fields or a malformed identity through the RPC envelope.
      const results: InstrumentMatch[] = matches.slice(0, SEARCH_MAX_RESULTS).map(normalizeMatch)
      return { ok: true, value: { status: 'ready', enabled: true, available: true, source: String(provider.name).slice(0, 64), results } }
    } catch {
      return failure('stock/search-unavailable', '名称搜索暂不可用，请稍后重试。')
    }
  }
}

export function createSearchRoute(options: InstrumentSearchGate) {
  return createRpcRoute(SEARCH_RPC_ENDPOINT, createSearchHandler(options))
}
