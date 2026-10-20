/** One route registered with the official authenticated connection service. */
export interface PetRoute {
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

const BODY_LIMIT = 8 * 1024

const failure = (code: string, message: string) => ({ ok: false, error: { code, message, details: {} } })

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
 * The pet list/selection route: one buffered JSON request, one JSON response.
 * Every field is validated by the handler; the route only checks the envelope.
 */
export function createPetRoute(
  endpoint: string,
  handler: (payload: Record<string, unknown>) => unknown | Promise<unknown>,
  allowed: readonly string[],
): PetRoute {
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
      if (!message || Object.keys(message.payload).some(key => !allowed.includes(key))) return new Response(null, { status: 400 })
      let result: unknown
      try { result = { ok: true, value: await handler(message.payload) } }
      catch (error) {
        const failureCode = (error as { message?: unknown }).message
        result = failure(typeof failureCode === 'string' ? failureCode : 'PET_UNAVAILABLE', 'The pet is unavailable.')
      }
      return Response.json({ type: 'server-response', rpcId: message.rpcId, result })
    },
  }
}

/**
 * The detached pet document: no JSON envelope, no Client runtime. The page is
 * opened in its own window and reads `/api/dsh-x-pet/state` from the Host.
 */
export function createPetPageRoute(endpoint: string, render: () => string): PetRoute {
  return {
    path: `/api/${endpoint}`,
    methods: ['GET'],
    requestBody: 'buffered',
    async fetch() {
      return new Response(render(), {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
      })
    },
  }
}

/**
 * The atlas route returns the sheet itself as image bytes, so the browser can
 * hand it straight to `Image`/CSS without base64 expansion. It accepts the
 * same authenticated envelope, but answers with `image/*` rather than JSON.
 */
export function createAtlasRoute(
  endpoint: string,
  load: (id: string) => Promise<{ bytes: Uint8Array, mime: string }>,
): PetRoute {
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
      if (!message) return new Response(null, { status: 400 })
      const id = message.payload.id
      if (typeof id !== 'string' || id.length === 0 || id.length > 128) return new Response(null, { status: 400 })
      let sheet: { bytes: Uint8Array, mime: string }
      try { sheet = await load(id) }
      catch { return new Response(null, { status: 404 }) }
      return new Response(sheet.bytes.buffer.slice(sheet.bytes.byteOffset, sheet.bytes.byteOffset + sheet.bytes.byteLength) as ArrayBuffer, {
        headers: {
          'content-type': sheet.mime,
          'content-length': String(sheet.bytes.byteLength),
          'cache-control': 'no-store',
        },
      })
    },
  }
}
