/** One untrusted JSON payload admitted to an authenticated route; handlers validate every field they read. */
export type BrowserRoutePayload = Record<string, unknown>
/** Responder envelope for one authenticated route call. */
export type BrowserRouteResult =
  | { ok: true, value: unknown }
  | { ok: false, error: { code: unknown, message: string, details: Record<string, never> } }
/** One route registered with the official authenticated connection service. */
export interface BrowserRoute {
  path: string
  methods: string[]
  requestBody: 'buffered'
  fetch(request: Request): Promise<Response>
}
/** Client-request envelope the authenticated connection service transports. */
interface BrowserRouteMessage {
  type: string
  method: string
  rpcId: string
  payload: BrowserRoutePayload
}
/** Routes are admitted by the official authenticated connection service, then capability-bound here. */
export function createBrowserRoute(method: string, handler: (payload: BrowserRoutePayload) => unknown | Promise<unknown>, fields: readonly string[]): BrowserRoute {
  const endpoint = `browser/${method}`
  return { path: `/api/${endpoint}`, methods: ['POST'], requestBody: 'buffered', async fetch(request) {
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return new Response(null, { status: 415 })
    if (Number(request.headers.get('content-length')) > 80 * 1024) return new Response(null, { status: 413 })
    let message: BrowserRouteMessage
    try {
      const raw = await request.text()
      if (Buffer.byteLength(raw) > 80 * 1024) return new Response(null, { status: 413 })
      message = JSON.parse(raw)
      if (!message || Object.keys(message).sort().join(',') !== 'method,payload,rpcId,type' || message.type !== 'client-request' || message.method !== endpoint || typeof message.rpcId !== 'string' || message.rpcId.length > 128 || !message.payload || Object.getPrototypeOf(message.payload) !== Object.prototype || Object.keys(message.payload).some(key => !fields.includes(key))) throw new Error()
    } catch { return new Response(null, { status: 400 }) }
    let result: BrowserRouteResult
    try { result = { ok: true, value: await handler(message.payload) } }
    catch (error) { const failure = error as { code?: unknown, message?: unknown }; result = { ok: false, error: { code: failure.code ?? 'BROWSER_UNAVAILABLE', message: String(failure.message ?? 'Browser unavailable.').slice(0, 500), details: {} } } }
    return Response.json({ type: 'server-response', rpcId: message.rpcId, result })
  } }
}
