// OpenCode's server API is local and user-owned. This transport deliberately
// does not start a server, discover credentials, follow redirects, or retry.
export function loopbackEndpoint(value: any) {
  if (!value) throw failure('OPENCODE_UNCONFIGURED', 'Configure an existing OpenCode HTTP server endpoint on 127.0.0.1 or [::1].')
  let url
  try { url = new URL(value) } catch { throw failure('OPENCODE_ENDPOINT', 'The OpenCode endpoint must be an explicit HTTP loopback URL.') }
  if (url.protocol !== 'http:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      !(url.hostname === '[::1]' || /^127(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(url.hostname))) {
    throw failure('OPENCODE_ENDPOINT', 'Use an HTTP loopback origin such as http://127.0.0.1:4096, without credentials, a path, query, or fragment.')
  }
  // URL canonicalization accepts unusual numeric IP forms. Do not accept them
  // in configuration: the endpoint should be recognizable to its owner.
  const authority = String(value).match(/^http:\/\/([^/]+)/)?.[1]
  if (!authority || !/^(?:127(?:\.(?:0|[1-9]\d{0,2})){3}|\[::1\])(?::\d+)?$/.test(authority)) {
    throw failure('OPENCODE_ENDPOINT', 'The OpenCode endpoint must use a literal loopback IP address.')
  }
  return url.origin
}

export function failure(code: any, message: any) {
  return Object.assign(new Error(message), { code })
}

export function aborted() {
  return Object.assign(new Error('OpenCode operation cancelled.'), { name: 'AbortError', code: 'ABORT_ERR' })
}

export function abortable(promise: any, signal: any) {
  if (!signal) return Promise.resolve(promise)
  if (signal.aborted) {
    // The operation may already have started synchronously (including a fetch
    // that triggered cancellation). Still consume its eventual rejection.
    Promise.resolve(promise).catch(() => {})
    return Promise.reject(aborted())
  }
  return new Promise<any>((resolve, reject) => {
    const stop = () => { cleanup(); reject(aborted()) }
    const cleanup = () => signal.removeEventListener('abort', stop)
    signal.addEventListener('abort', stop, { once: true })
    Promise.resolve(promise).then(value => { cleanup(); resolve(value) }, error => { cleanup(); reject(error) })
  })
}

export function delay(ms: any, signal: any) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(aborted())
    const timer = setTimeout(() => { cleanup(); resolve() }, ms)
    const cleanup = () => signal?.removeEventListener('abort', stop)
    const stop = () => { clearTimeout(timer); cleanup(); reject(aborted()) }
    signal?.addEventListener('abort', stop, { once: true })
  })
}

export function createRedactor(config: any) {
  const password = typeof config.password === 'string' ? config.password : ''
  const credentials = password ? Buffer.from(`${config.username || 'opencode'}:${password}`).toString('base64') : ''
  const secrets = [password, credentials].filter(Boolean)
  const text = (value: any) => {
    let output = String(value)
    for (const secret of secrets) output = output.split(secret).join('[redacted]')
    return output
      .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/=_\-.]+/gi, '$1 [redacted]')
      .replace(/((?:[a-z_]*(?:api[_-]?key|token|password|secret|authorization))\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[redacted]')
  }
  const clean: any = (value: any, depth = 0) => {
    if (depth > 12) return '[truncated]'
    if (typeof value === 'string') return text(value)
    if (Array.isArray(value)) return value.slice(0, 2000).map(item => clean(item, depth + 1))
    if (value && typeof value === 'object') {
      const result: Record<string, any> = {}
      for (const [key, item] of Object.entries(value).slice(0, 2000)) {
        if (/^(?:authorization|proxy-authorization|cookie|set-cookie|password|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|token|access|refresh|env|environment|headers)$/i.test(key)) result[text(key) as keyof typeof result] = '[redacted]'
        else result[text(key) as keyof typeof result] = clean(item, depth + 1)
      }
      return result
    }
    return value
  }
  return { clean, text }
}

export function createHttp({ fetch, config, endpoint }: any) {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (config.password) headers.Authorization = `Basic ${Buffer.from(`${config.username || 'opencode'}:${config.password}`).toString('base64')}`
  const timeoutMs = config.requestTimeoutMs ?? 10000
  return async function request(path: any, { method = 'GET', body, cwd, signal, stream = false, timeout = timeoutMs, authenticate = true }: any = {}) {
    const url = new URL(path, `${endpoint}/`)
    if (url.origin !== endpoint) throw failure('OPENCODE_ENDPOINT', 'OpenCode request escaped the configured endpoint.')
    if (cwd) url.searchParams.set('directory', cwd)
    const timeoutController = new AbortController()
    const timer = timeout > 0 ? setTimeout(() => timeoutController.abort(), timeout) : undefined
    const combined = signal ? AbortSignal.any([signal, timeoutController.signal]) : timeoutController.signal
    try {
      const requestHeaders: Record<string, string> = { ...headers, ...(stream ? { Accept: 'text/event-stream' } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }
      if (!authenticate) delete requestHeaders.Authorization
      const response = await abortable(fetch(url.href, {
        method, headers: requestHeaders,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error', signal: combined,
      }), combined)
      if (response.redirected || (response.status >= 300 && response.status < 400)) throw failure('OPENCODE_REDIRECT', 'OpenCode redirects are not permitted.')
      if (!response.ok) {
        void response.body?.cancel?.().catch(() => {})
        throw Object.assign(failure(response.status === 401 || response.status === 403 ? 'OPENCODE_AUTH' : 'OPENCODE_HTTP', `OpenCode server returned HTTP ${response.status}.`), { status: response.status, basicChallenge: /^Basic\b/i.test(response.headers?.get('www-authenticate') || '') })
      }
      if (stream) {
        if (!response.headers?.get('content-type')?.toLowerCase().includes('text/event-stream') || !response.body) {
          void response.body?.cancel?.().catch(() => {})
          throw failure('OPENCODE_PROTOCOL', 'OpenCode did not return an SSE event stream.')
        }
        return response
      }
      if (response.status === 204) return undefined
      try { return await readJson(response, combined, config.maxResponseBytes ?? 8 * 1024 * 1024) } catch (error: any) {
        if (combined.aborted) throw error
        throw failure('OPENCODE_PROTOCOL', 'OpenCode returned invalid JSON.')
      }
    } catch (error: any) {
      if (signal?.aborted) throw aborted()
      if (timeoutController.signal.aborted) throw failure('OPENCODE_TIMEOUT', 'The OpenCode server request timed out.')
      if (error?.code?.startsWith('OPENCODE_')) throw error
      throw failure('OPENCODE_TRANSPORT', 'Could not communicate with the configured OpenCode server. No request was replayed.')
    } finally { clearTimeout(timer) }
  }
}

async function readJson(response: any, signal: any, limit: any) {
  const announced = Number(response.headers?.get('content-length'))
  if (announced > limit) {
    void response.body?.cancel?.().catch(() => {})
    throw failure('OPENCODE_PROTOCOL', 'OpenCode response exceeded the size limit.')
  }
  if (!response.body?.getReader) throw failure('OPENCODE_PROTOCOL', 'OpenCode returned an unreadable response body.')
  const reader = response.body.getReader()
  let bytes = 0
  const chunks: any[] = []
  try {
    while (true) {
      const { done, value } = await abortable(reader.read(), signal)
      if (done) break
      bytes += value.byteLength
      if (bytes > limit) throw failure('OPENCODE_PROTOCOL', 'OpenCode response exceeded the size limit.')
      chunks.push(value)
    }
    const merged = new Uint8Array(bytes)
    let offset = 0
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength }
    return JSON.parse(new TextDecoder().decode(merged))
  } finally {
    void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

// SSE is parsed incrementally. It is never reconnected/replayed automatically:
// an unobserved permission or tool execution requires explicit recovery.
export async function consumeSse(body: any, onEvent: any, signal: any, maxBytes = 2 * 1024 * 1024) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let pending = '', data: any = [], eventBytes = 0
  const emit = async () => {
    if (!data.length) return
    let event
    try { event = JSON.parse(data.join('\n')) } catch { throw failure('OPENCODE_PROTOCOL', 'OpenCode sent an invalid SSE JSON event.') }
    data = []; eventBytes = 0
    await onEvent(event)
  }
  try {
    while (true) {
      const { value, done } = await abortable(reader.read(), signal)
      if (done) break
      pending += decoder.decode(value, { stream: true })
      if (pending.length > maxBytes) throw failure('OPENCODE_PROTOCOL', 'OpenCode SSE frame exceeded the size limit.')
      let end
      while ((end = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, end).replace(/\r$/, '')
        pending = pending.slice(end + 1)
        if (!line) await emit()
        else if (line.startsWith('data:')) {
          const chunk = line.slice(5).replace(/^ /, '')
          eventBytes += chunk.length
          if (eventBytes > maxBytes) throw failure('OPENCODE_PROTOCOL', 'OpenCode SSE frame exceeded the size limit.')
          data.push(chunk)
        }
      }
    }
    if (!signal?.aborted) throw failure('OPENCODE_STREAM_CLOSED', 'OpenCode event stream closed. The turn was not replayed.')
  } finally {
    void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export function resolveSchema(spec: any, schema: any) {
  const seen = new Set<any>()
  while (schema?.$ref?.startsWith('#/')) {
    if (seen.has(schema.$ref)) return undefined
    seen.add(schema.$ref)
    schema = schema.$ref.slice(2).split('/').reduce((value: any, key: any) => value?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], spec)
  }
  return schema
}

export function findRoute(spec: any, pattern: string, method: string): any {
  const wanted = pattern.replace(/\{[^}]+\}/g, '{}')
  return Object.entries(spec?.paths || {}).find(([path, methods]) => path.replace(/\{[^}]+\}/g, '{}') === wanted && methods?.[method as keyof typeof methods])?.[1]?.[method as never]
}
