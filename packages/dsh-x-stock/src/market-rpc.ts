import { MARKET_ENDPOINT, MARKET_PREFERENCE_ENDPOINT, parseMarketPreferenceRequest, parseMarketRequest } from './market.ts'
import type { MarketPreference, MarketProvider, MarketQuote } from './market.ts'
import type { MarketController } from './market-preference.ts'
import { createRpcRoute, failure } from './rpc.ts'

// A provider can be replaced or switched at runtime; a function is resolved on
// every request, while a plain provider keeps the existing test/headless seam.
export type MarketProviderSource = MarketProvider | (() => Promise<MarketProvider | undefined>)

/**
 * Re-validates every quote before it reaches the browser and reports a symbol
 * the source did not answer for as `unavailable`. Raw payloads, extra fields
 * and upstream errors never leave the Host.
 */
export function projectQuotes(raw: unknown, symbols: string[], now: number): MarketQuote[] {
  const bySymbol = new Map<string, any>()
  for (const quote of Array.isArray(raw) ? raw : []) {
    if (!quote || typeof quote !== 'object') continue
    if (!symbols.includes(quote.symbol) || bySymbol.has(quote.symbol)) continue
    bySymbol.set(quote.symbol, quote)
  }
  const fetchedAt = new Date(now).toISOString()
  return symbols.map(symbol => {
    const quote = bySymbol.get(symbol)
    const usable = quote
      && quote.status === 'available'
      && Number.isFinite(quote.price) && quote.price > 0
      && Number.isFinite(quote.changePercent) && Math.abs(quote.changePercent) <= 1000
      && typeof quote.quotedAt === 'string' && Number.isFinite(Date.parse(quote.quotedAt))
      && Date.parse(quote.quotedAt) <= now + 300_000
    if (!usable) return { symbol, status: 'unavailable' as const, name: '', price: null, changePercent: null, quotedAt: null, fetchedAt: null, marketStatus: 'unknown' as const }
    return {
      symbol,
      status: 'available' as const,
      name: typeof quote.name === 'string' ? quote.name.slice(0, 64) : '',
      price: quote.price,
      changePercent: quote.changePercent,
      quotedAt: quote.quotedAt,
      fetchedAt,
      marketStatus: quote.marketStatus === 'closed' ? 'closed' as const : 'unknown' as const,
    }
  })
}

// Exact-route handler behind the official shared Connection admission bridge.
// The bridge rejects non-owner peers before this code runs; the explicit check
// keeps the handler safe when it is called directly in tests or another Host.
export function createMarketHandler({ provider, now = Date.now }: { provider?: MarketProviderSource; now?: () => number } = {}) {
  return async (endpoint: any, payload: any, signal: any, peer: any) => {
    if (peer?.principal?.kind !== 'owner') return failure('stock/forbidden', '只允许宿主所有者读取市场数据。')
    if (endpoint !== MARKET_ENDPOINT) return failure('stock/not-found', '未知市场接口。')
    let request
    try { request = parseMarketRequest(payload) }
    catch { return failure('stock/invalid-input', '市场数据请求参数无效。') }
    if (signal?.aborted) return failure('stock/cancelled', '市场数据请求已取消。')
    try {
      const resolved = typeof provider === 'function' ? await provider() : provider
      if (!resolved) return { ok: true, value: { status: 'unconfigured', source: null } }
      if (request.kind === 'overview') return { ok: true, value: { status: 'ready', overview: await resolved.overview() } }
      if (request.kind === 'breadth') return { ok: true, value: { status: 'ready', breadth: await resolved.breadth() } }
      if (request.kind === 'quotes') {
        const source = String(resolved.name).slice(0, 64)
        return { ok: true, value: { status: 'ready', source, quotes: projectQuotes(await resolved.quotes(request.symbols), request.symbols, now()) } }
      }
      return { ok: true, value: { status: 'ready', board: await resolved.board(request.board) } }
    } catch {
      return failure('stock/market-unavailable', '市场数据暂不可用，请稍后重试。')
    }
  }
}

export function createMarketRoute(options: { provider?: MarketProviderSource; now?: () => number } = {}) {
  return createRpcRoute(MARKET_ENDPOINT, createMarketHandler(options))
}

export function createMarketPreferenceHandler({ controller }: { controller?: MarketController } = {}) {
  return async (endpoint: any, payload: any, signal: any, peer: any) => {
    if (peer?.principal?.kind !== 'owner') return failure('stock/forbidden', '只允许宿主所有者修改市场源。')
    if (endpoint !== MARKET_PREFERENCE_ENDPOINT) return failure('stock/not-found', '未知市场源接口。')
    let request
    try { request = parseMarketPreferenceRequest(payload) }
    catch { return failure('stock/invalid-input', '市场源请求参数无效。') }
    if (!controller) return failure('stock/market-preference-unavailable', '当前宿主未提供市场源开关。')
    if (signal?.aborted) return failure('stock/cancelled', '市场源请求已取消。')
    try {
      const value: MarketPreference = request.action === 'get'
        ? await controller.state()
        : await controller.setEnabled(request.enabled)
      return { ok: true, value }
    } catch {
      return failure('stock/market-preference-unavailable', '无法保存市场源开关，请检查 profile 目录权限。')
    }
  }
}

export function createMarketPreferenceRoute(options: { controller?: MarketController } = {}) {
  return createRpcRoute(MARKET_PREFERENCE_ENDPOINT, createMarketPreferenceHandler(options))
}
