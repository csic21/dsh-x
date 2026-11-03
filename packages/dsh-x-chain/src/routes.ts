/**
 * The authenticated JSON route the settings page reads.
 *
 * It mirrors the official connection envelope: one buffered POST carrying
 * `{ type: 'client-request', method, rpcId, payload }`, answered with
 * `{ type: 'server-response', rpcId, result }`. No other method or shape is
 * accepted, and the payload must be empty.
 *
 * @module dsh-x-chain/routes
 */

/** One route registered with the official authenticated connection service. */
export interface ChainRoute {
  path: string
  methods: string[]
  requestBody: 'buffered'
  fetch(request: Request): Promise<Response>
}

const BODY_LIMIT = 4 * 1024

interface RouteMessage {
  type: string
  method: string
  rpcId: string
  payload: Record<string, unknown>
}

/** Parse the one accepted client-request envelope. */
function parseMessage(raw: string, endpoint: string): RouteMessage | null {
  let message: RouteMessage
  try { message = JSON.parse(raw) as RouteMessage }
  catch { return null }
  if (!message || Object.keys(message).sort().join(',') !== 'method,payload,rpcId,type') return null
  if (message.type !== 'client-request' || message.method !== endpoint) return null
  if (typeof message.rpcId !== 'string' || message.rpcId.length === 0 || message.rpcId.length > 128) return null
  if (!message.payload || Object.getPrototypeOf(message.payload) !== Object.prototype) return null
  if (Object.keys(message.payload).length > 0) return null
  return message
}

/**
 * Build the stats route.
 * @param endpoint - the endpoint name under `/api/`.
 * @param handler - produces the snapshot.
 * @returns a route for `connection.fetch.register`.
 */
export function createStatsRoute(endpoint: string, handler: () => unknown): ChainRoute {
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
      if (message === null) return new Response(null, { status: 400 })
      let result: unknown
      try { result = { ok: true, value: handler() } }
      catch (error) {
        const code = error instanceof Error ? error.message : 'CHAIN_STATS_UNAVAILABLE'
        result = { ok: false, error: { code, message: 'The chain statistics are unavailable.' } }
      }
      return Response.json({ type: 'server-response', rpcId: message.rpcId, result })
    },
  }
}
