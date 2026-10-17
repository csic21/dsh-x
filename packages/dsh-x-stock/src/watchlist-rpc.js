import { MAX_PINS, QUOTE_ENDPOINT, SCOPE_ENDPOINT, validateSymbol } from './watchlist.js'
const failure = (code, message) => ({ ok: false, error: { code, message, details: {} } })
// Deliberately no default market-data provider: a public web endpoint is not
// evidence of a licence to redistribute A-share prices. An approved adapter
// may implement quote(symbol, { signal }) later, without changing the UI.
export function createWatchlistHandler({ provider, now = Date.now } = {}) {
  return async (endpoint, payload, signal, peer) => {
    if (peer?.principal?.kind !== 'owner') return failure('stock/forbidden', '只允许宿主所有者读取自选行情。')
    if (endpoint !== QUOTE_ENDPOINT) return failure('stock/not-found', '未知股票接口。')
    try {
      if (!payload || Object.getPrototypeOf(payload) !== Object.prototype || Object.keys(payload).length !== 1 || !Array.isArray(payload.symbols) || payload.symbols.length > MAX_PINS) throw new Error()
      payload.symbols.forEach(validateSymbol)
      if (new Set(payload.symbols).size !== payload.symbols.length) throw new Error()
    } catch { return failure('stock/invalid-input', '请输入最多八个不重复的 A 股代码。') }
    if (signal?.aborted) return failure('stock/cancelled', '行情请求已取消。')
    if (!provider) return { ok: true, value: { source: null, quotes: payload.symbols.map(symbol => ({ symbol, status: 'unconfigured', price: null, changePercent: null, quotedAt: null, fetchedAt: null })) } }
    try {
      const quotes = []
      for (const symbol of payload.symbols) {
        signal?.throwIfAborted()
        const raw = await provider.quote(symbol, { signal })
        // Only expose the explicit public quote contract, never raw data/errors.
        if (!raw || raw.symbol !== symbol || !Number.isFinite(raw.price) || raw.price <= 0 || !Number.isFinite(raw.changePercent) || typeof raw.quotedAt !== 'string' || !Number.isFinite(Date.parse(raw.quotedAt)) || Date.parse(raw.quotedAt) > now() + 300_000) throw new Error()
        quotes.push({ symbol, status: 'available', name: typeof raw.name === 'string' ? raw.name.slice(0, 64) : '', price: raw.price, changePercent: raw.changePercent, quotedAt: raw.quotedAt, fetchedAt: new Date(now()).toISOString(), marketStatus: raw.marketStatus === 'closed' ? 'closed' : 'unknown' })
      }
      return { ok: true, value: { source: String(provider.name).slice(0, 64), quotes } }
    } catch { return failure('stock/unavailable', '行情暂不可用，请稍后重试。') }
  }
}

// Exact Fetch routes run behind the official shared Connection admission
// bridge. That bridge rejects every non-owner Peer BEFORE calling fetch.
// Do not expose this handler as an unauthenticated WebServer route.
export function createWatchlistRoute(options) {
  return createRpcRoute(QUOTE_ENDPOINT, createWatchlistHandler(options))
}
export function createScopeRoute(readScope) {
  return createRpcRoute(SCOPE_ENDPOINT, async (_endpoint, payload) => {
    if (!payload || Object.getPrototypeOf(payload) !== Object.prototype || Object.keys(payload).length) return failure('stock/invalid-input', '存储标识请求参数无效。')
    try { return { ok: true, value: { scope: await readScope() } } }
    catch { return failure('stock/scope-unavailable', '无法打开此 profile 的自选存储，请检查宿主目录权限后重试。') }
  })
}
function createRpcRoute(endpoint, handle) {
  return {
    path: `/api/${endpoint}`, methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') return new Response(null, { status: 415 })
      if (Number(request.headers.get('content-length')) > 8192) return new Response(null, { status: 413 })
      let message
      try {
        const text = await request.text()
        if (text.length > 8192) return new Response(null, { status: 413 })
        message = JSON.parse(text)
        if (!message || Object.keys(message).sort().join(',') !== 'method,payload,rpcId,type' || message.type !== 'client-request' || typeof message.rpcId !== 'string' || message.rpcId.length > 128 || message.method !== endpoint) throw new Error()
      } catch { return new Response(null, { status: 400 }) }
      const result = await handle(endpoint, message.payload, request.signal, { principal: { kind: 'owner' } })
      return Response.json({ type: 'server-response', rpcId: message.rpcId, result })
    },
  }
}
