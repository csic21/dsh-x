/** One route registered with the official authenticated connection service. */
export interface UiRoute {
  path: string
  methods: string[]
  requestBody: 'buffered'
  fetch(request: Request): Promise<Response>
}

interface RouteMessage {
  type: string
  method: string
  rpcId: string
  payload: Record<string, unknown>
}

const BODY_LIMIT = 4 * 1024

/** Client-request envelope carried by the authenticated connection service. */
function parseMessage(raw: string, endpoint: string): RouteMessage | null {
  let message: RouteMessage
  try { message = JSON.parse(raw) as RouteMessage }
  catch { return null }
  if (!message || Object.keys(message).sort().join(',') !== 'method,payload,rpcId,type') return null
  if (message.type !== 'client-request' || message.method !== endpoint) return null
  if (typeof message.rpcId !== 'string' || message.rpcId.length > 128) return null
  if (!message.payload || Object.getPrototypeOf(message.payload) !== Object.prototype) return null
  return message
}

/**
 * The appearance route: one buffered JSON request, one JSON response. The route
 * checks only the envelope; the handler validates every value it stores.
 */
export function createUiRoute(
  endpoint: string,
  handler: (payload: Record<string, unknown>) => unknown | Promise<unknown>,
  allowed: readonly string[],
): UiRoute {
  return {
    path: `/api/${endpoint}`,
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
        return new Response(null, { status: 415 })
      }
      if (Number(request.headers.get('content-length')) > BODY_LIMIT) return new Response(null, { status: 413 })
      const raw = await request.text()
      if (Buffer.byteLength(raw, 'utf8') > BODY_LIMIT) return new Response(null, { status: 413 })
      const message = parseMessage(raw, endpoint)
      if (!message || Object.keys(message.payload).some(key => !allowed.includes(key))) {
        return new Response(null, { status: 400 })
      }
      let result: unknown
      try { result = { ok: true, value: await handler(message.payload) } }
      catch (error) {
        const code = (error as { message?: unknown }).message
        result = { ok: false, error: { code: typeof code === 'string' ? code : 'UI_UNAVAILABLE', message: 'The appearance choice could not be saved.', details: {} } }
      }
      return Response.json({ type: 'server-response', rpcId: message.rpcId, result })
    },
  }
}
