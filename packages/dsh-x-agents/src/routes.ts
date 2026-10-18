import { safeText } from './store.ts'
export function createAgentsRoute(endpoint: any, handler: any) {
  // Only register behind the official owner-admitted shared Connection fetch bridge.
  return { path: `/api/${endpoint}`, methods: ['POST'], requestBody: 'buffered', async fetch(request: any) {
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return new Response(null, { status: 415 })
    if (Number(request.headers.get('content-length')) > 4096) return new Response(null, { status: 413 })
    let message
    try {
      const body = await request.text()
      if (body.length > 4096) return new Response(null, { status: 413 })
      message = JSON.parse(body)
      if (!message || Object.keys(message).sort().join(',') !== 'method,payload,rpcId,type' || message.type !== 'client-request' || message.method !== endpoint || typeof message.rpcId !== 'string' || message.rpcId.length > 128 || !message.payload || Object.getPrototypeOf(message.payload) !== Object.prototype) throw new Error()
    } catch { return new Response(null, { status: 400 }) }
    let result
    try { result = { ok: true, value: await handler(message.payload, request.signal) } }
    catch (error: any) { result = { ok: false, error: { code: error.code ?? 'AGENTS_UNAVAILABLE', message: safeText(error.message, 1000), details: {} } } }
    return Response.json({ type: 'server-response', rpcId: message.rpcId, result })
  } }
}
