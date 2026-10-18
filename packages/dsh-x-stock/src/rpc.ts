// Exact Fetch routes run behind the official shared Connection admission
// bridge, which rejects every non-owner Peer BEFORE the handler runs. Do not
// expose any of these handlers as an unauthenticated WebServer route.
const BODY_LIMIT = 8192
export const failure = (code: string, message: string) => ({ ok: false, error: { code, message, details: {} } })

export function createRpcRoute(endpoint: any, handle: any) {
  return {
    path: `/api/${endpoint}`, methods: ['POST'], requestBody: 'buffered',
    async fetch(request: any) {
      if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') return new Response(null, { status: 415 })
      if (Number(request.headers.get('content-length')) > BODY_LIMIT) return new Response(null, { status: 413 })
      let message
      try {
        const text = await request.text()
        if (text.length > BODY_LIMIT) return new Response(null, { status: 413 })
        message = JSON.parse(text)
        if (!message || Object.keys(message).sort().join(',') !== 'method,payload,rpcId,type' || message.type !== 'client-request' || typeof message.rpcId !== 'string' || message.rpcId.length > 128 || message.method !== endpoint) throw new Error()
      } catch { return new Response(null, { status: 400 }) }
      const result = await handle(endpoint, message.payload, request.signal, { principal: { kind: 'owner' } })
      return Response.json({ type: 'server-response', rpcId: message.rpcId, result })
    },
  }
}
