import { MARKET_ENDPOINT, parseMarketRequest } from './market.ts'
import type { MarketProvider } from './market.ts'
import { createRpcRoute } from './watchlist-rpc.ts'

const failure = (code: string, message: string) => ({ ok: false, error: { code, message, details: {} } })

// Exact-route handler behind the official shared Connection admission bridge.
// The bridge rejects non-owner peers before this code runs; the explicit check
// keeps the handler safe when it is called directly in tests or another Host.
export function createMarketHandler({ provider }: { provider?: MarketProvider } = {}) {
  return async (endpoint: any, payload: any, signal: any, peer: any) => {
    if (peer?.principal?.kind !== 'owner') return failure('stock/forbidden', '只允许宿主所有者读取市场数据。')
    if (endpoint !== MARKET_ENDPOINT) return failure('stock/not-found', '未知市场接口。')
    let request
    try { request = parseMarketRequest(payload) }
    catch { return failure('stock/invalid-input', '市场数据请求参数无效。') }
    if (!provider) return { ok: true, value: { status: 'unconfigured', source: null } }
    if (signal?.aborted) return failure('stock/cancelled', '市场数据请求已取消。')
    try {
      if (request.kind === 'overview') return { ok: true, value: { status: 'ready', overview: await provider.overview() } }
      if (request.kind === 'breadth') return { ok: true, value: { status: 'ready', breadth: await provider.breadth() } }
      return { ok: true, value: { status: 'ready', board: await provider.board(request.board) } }
    } catch {
      return failure('stock/market-unavailable', '市场数据暂不可用，请稍后重试。')
    }
  }
}

export function createMarketRoute(options: { provider?: MarketProvider } = {}) {
  return createRpcRoute(MARKET_ENDPOINT, createMarketHandler(options))
}
