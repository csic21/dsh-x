import type { NativeDiscovery } from '../types.ts'
import { randomUUID } from 'node:crypto'
import { abortable, aborted, consumeSse, createHttp, createRedactor, delay, failure, loopbackEndpoint } from './opencode-http.ts'

// OpenCode 2.x ("v2") exposes a different server surface than the 1.19.x
// protocol this workbench supported first. Everything below is taken from the
// live /openapi.json of a 2.0.32 server (openapi 3.1.0) plus observed SSE
// frames, never from prose examples:
//
//   GET  /api/info                     -> { version, pid, urls }
//   GET  /api/model?directory=...      -> { data: Model.Info[] }
//   POST /api/session                  -> { data: Session.Info }
//   GET  /api/session/{id}             -> { data: Session.Info }
//   POST /api/session/{id}/prompt      -> { data: Session.Inbox.User }
//   GET  /api/session/{id}/message     -> { data: Session.Message.Info[], cursor }
//   POST /api/session/{id}/interrupt   -> { interrupted: boolean }
//   GET  /api/session/{id}/permission  -> { data: Permission.Request[] }
//   POST /api/session/{id}/permission/{requestID}/reply { decision }
//   GET  /api/event?directory=...      -> SSE frames "data: {id,type,data}"
//
// The event vocabulary is session.execution.*, session.step.*, session.text.*,
// session.tool.*, permission.* and session.form.*. Reasoning events are
// intentionally dropped: this workbench never manufactures visible reasoning.
const CAPABILITIES = Object.freeze({
  nativeSessions: true, resume: true, streaming: true, tools: true, plans: false,
  permissions: true, input: false, usage: true, cancel: true, models: true,
  authDiscovery: true, sandbox: false, automaticReplay: false,
  childPermissions: false, childInput: false,
  permissionScopes: ['allow_once', 'reject_once'],
  permissionPolicy: 'native-server',
  limitations: [
    'An external OpenCode v2 server does not inherit the host sandbox. Explicit trust and an unrestricted host are required.',
    'Native server and session rules determine which operations request approval. Existing allow rules are not changed.',
    'Only one-time permission replies are supported; persistent "always" grants are never sent.',
    'Native form/question requests are blocked because this adapter does not implement the v2 form reply protocol yet.',
    'Provider credentials are not validated by a paid model request during discovery.',
  ],
})

const DECISIONS = new Set(['once', 'reject'])
const TERMINAL_EXECUTION = new Set(['succeeded', 'failed', 'interrupted'])

function settings(config: any) {
  const result: Record<string, any> = { requestTimeoutMs: 10000, cleanupTimeoutMs: 10000, statusPollMs: 250, turnTimeoutMs: 0, ...config }
  if (typeof result.endpoint !== 'string') throw failure('OPENCODE_UNCONFIGURED', 'Configure an existing OpenCode HTTP server endpoint on 127.0.0.1 or [::1].')
  result.endpoint = loopbackEndpoint(result.endpoint)
  return result
}

function text(value: any) {
  return typeof value === 'string' ? value : ''
}

export function createOpenCodeV2Adapter({ fetch = globalThis.fetch, config = {}, managedScope }: any = {}) {
  // Same containment rule as the v1 adapter: only a trusted same-process owner
  // may supply a managed scope. Tool arguments cannot create one.
  const owns = (cwd: any, signal: any) => managedScope && managedScope.cwd === cwd && managedScope.signal && !managedScope.signal.aborted && signal && !signal.aborted
  const redactor = createRedactor(config)
  const options = { ...settings(config) }
  let identityEndpoint = 'unconfigured'
  try { identityEndpoint = loopbackEndpoint(options.endpoint || config.endpoint) } catch {}
  const backendIdentity = `opencode-v2:${JSON.stringify({ endpoint: identityEndpoint, username: redactor.text(options.username || 'opencode'), agent: redactor.text(options.agent || 'native-default') })}`
  const active = new Set<any>()

  const setup = () => {
    if (typeof options.password !== 'string' || !options.password) throw failure('OPENCODE_AUTH', 'Configure the existing OpenCode server password through the host environment. Unauthenticated external servers are disabled.')
    if (typeof fetch !== 'function') throw failure('OPENCODE_TRANSPORT', 'This host does not provide an HTTP fetch implementation.')
    return createHttp({ fetch, config: { ...options }, endpoint: options.endpoint })
  }

  const modelList = (payload: any) => {
    if (!payload || !Array.isArray(payload.data)) throw failure('OPENCODE_PROTOCOL', 'OpenCode returned an unsupported model catalog.')
    const models: any[] = []
    for (const item of payload.data) {
      if (!item || typeof item.id !== 'string' || typeof item.providerID !== 'string') continue
      const modelID = typeof item.modelID === 'string' && item.modelID ? item.modelID : item.id
      const id = `${item.providerID}/${modelID}`
      const label = typeof item.name === 'string' && item.name ? item.name : modelID
      if (!models.some((model: any) => model.id === id)) models.push({ id, label: `${item.providerID} / ${label}`, providerID: item.providerID, modelID })
    }
    return models
  }

  async function inspect({ cwd, signal, sandboxPolicy = options.sandboxPolicy, trustedExternalRuntime = options.trustedExternalRuntime }: any = {}) {
    const http = setup()
    let enforced = false
    try { await http('/api/info', { signal, authenticate: false, timeout: options.requestTimeoutMs }) } catch (error: any) {
      // An unauthenticated request must be refused. Do not depend on the
      // WWW-Authenticate header: Node's fetch does not surface it even when the
      // server sends one, so a 401/403 alone is the portable evidence.
      if (error.status === 401 || error.status === 403) enforced = true
      else throw error
    }
    if (!enforced) throw failure('OPENCODE_AUTH', 'The OpenCode server did not require its server-password challenge. Enable the existing server-password protection before connecting.')
    const info = await http('/api/info', { signal, timeout: options.requestTimeoutMs })
    if (!info || typeof info.version !== 'string' || !info.version) throw failure('OPENCODE_PROTOCOL', 'OpenCode did not report a server version.')
    if (/^1\./.test(info.version)) throw failure('OPENCODE_PROTOCOL', `This endpoint speaks OpenCode ${info.version}; the v2 adapter requires the 2.x protocol.`)
    if (!owns(cwd, signal) && (sandboxPolicy?.mode !== 'danger-full-access' || trustedExternalRuntime !== true)) {
      return { http, version: info.version, available: false, authenticated: true, providerAuthentication: 'unverified', models: [], capabilities: { ...CAPABILITIES },
        reason: 'Project/provider discovery can initialize OpenCode’s native project instance. It requires an unrestricted host and explicit trust in this external runtime.' }
    }
    const listing = await http('/api/model', { cwd, signal, timeout: options.requestTimeoutMs })
    const models = modelList(listing)
    return {
      http, version: info.version,
      available: models.length > 0, authenticated: true, providerAuthentication: 'unverified',
      models: redactor.clean(models), capabilities: { ...CAPABILITIES },
      reason: models.length ? undefined : 'The OpenCode server has no connected provider with an available model. Configure one in OpenCode first.',
    }
  }

  async function discover(opts: any = {}): Promise<NativeDiscovery> {
    try {
      const { http, ...result } = await inspect(opts)
      return result as NativeDiscovery
    } catch (error: any) {
      return { available: false, version: null, authenticated: error.code === 'OPENCODE_AUTH' ? false : null, models: [], reason: redactor.text(error.message), capabilities: { ...CAPABILITIES } }
    }
  }

  async function run({ prompt, model, cwd, nativeSessionId, signal, onEvent = async () => {}, requestPermission, sandboxPolicy, trustedExternalRuntime }: any = {}) {
    let id: any = nativeSessionId || null
    const result = (status: any, summary = '', reason?: any, usage?: any) => ({ nativeSessionId: id, status, summary, ...(reason ? { reason } : {}), ...(usage ? { usage } : {}) })
    if (signal?.aborted) return result('cancelled')
    if (typeof prompt !== 'string' || !prompt.trim()) return result('blocked', '', 'A non-empty prompt is required.')
    if (!owns(cwd, signal) && (sandboxPolicy?.mode !== 'danger-full-access' || trustedExternalRuntime !== true)) {
      return result('blocked', '', 'OpenCode runs in a separate server and cannot inherit the host sandbox. An unrestricted host and explicit trust in this external runtime are required.')
    }
    if (id && active.has(id)) return result('blocked', '', 'This native OpenCode session already has an active turn.')

    const runController = new AbortController()
    const runSignal = signal ? AbortSignal.any([signal, runController.signal]) : runController.signal
    const streamController = new AbortController()
    const connectionEpoch = randomUUID()
    let http: any, started = false, completed = false, disposed = false, locked = false
    let finalText = '', finalUsage: any, failureFromEvent: any
    let streamReadyResolve: any, terminalResolve: any
    const streamReady = new Promise<void>(resolve => { streamReadyResolve = resolve })
    const terminal = new Promise<any>(resolve => { terminalResolve = resolve })
    const pendingHandlers = new Set<any>()
    const requests = new Map<any, any>()
    let eventQueue: any = Promise.resolve()
    const emit = (event: any) => {
      const next = eventQueue.then(() => abortable(Promise.resolve().then(() => onEvent(redactor.clean(event))), runSignal))
      eventQueue = next.catch(() => {})
      return next
    }
    const fail = (error: any) => { if (!failureFromEvent) failureFromEvent = error; runController.abort() }
    const track = (promise: any) => {
      const handled = promise.catch((error: any) => { if (!(runSignal.aborted && error.name === 'AbortError')) fail(error) }).finally(() => pendingHandlers.delete(handled))
      pendingHandlers.add(handled)
    }
    const dataOf = (event: any) => (event && typeof event.data === 'object' && event.data) || {}

    async function replyPermission(request: any, p: any) {
      if (typeof p.action !== 'string' || !p.action) throw failure('OPENCODE_BLOCKED', 'OpenCode requested permission without a native operation. The turn was stopped.')
      if (p.save != null && (!Array.isArray(p.save) || p.save.length)) throw failure('OPENCODE_BLOCKED', 'OpenCode proposed a persistent permission rule. The turn was stopped without changing native rules.')
      const sessionID = request.sessionID
      const identity = { nativeSessionId: sessionID, requestId: p.id, connectionEpoch }
      const details = redactor.clean({ action: p.action, resources: p.resources, metadata: p.metadata, source: p.source })
      const scopeComplete = JSON.stringify(details) === JSON.stringify({ action: p.action, resources: p.resources, metadata: p.metadata, source: p.source })
      const exposed = { id: p.id, nativeSessionId: sessionID, kind: 'permission', title: `OpenCode: ${p.action}`, identity, scopeComplete,
        scope: { action: p.action, resources: p.resources, nativeSessionId: sessionID, rejectScope: 'pending-native-session-requests' },
        details, options: [
          { id: 'once', label: 'Allow this request once', kind: 'allow_once' },
          { id: 'reject', label: 'Reject this request', kind: 'reject_once' },
        ], defaultRejectOptionId: 'reject' }
      await emit({ type: 'permission', data: exposed })
      if (!scopeComplete) throw failure('OPENCODE_BLOCKED', 'The native permission scope contains sensitive or oversized details that cannot be safely displayed. Inspect this request directly in OpenCode.')
      if (typeof requestPermission !== 'function') throw failure('OPENCODE_BLOCKED', 'OpenCode requested permission, but this host cannot collect a decision. The turn was stopped.')
      const answer = await requestPermission({ ...exposed, signal: AbortSignal.any([runSignal, request.controller.signal]) })
      if (request.settled) return
      if (runSignal.aborted) throw aborted()
      if (!DECISIONS.has(answer?.optionId)) throw failure('OPENCODE_BLOCKED', 'No valid one-time permission decision was provided. The turn was stopped without granting permission.')
      request.sent = true
      const accepted = await http(`/api/session/${encodeURIComponent(sessionID)}/permission/${encodeURIComponent(p.id)}/reply`, { method: 'POST', body: { decision: answer.optionId }, cwd, signal: runSignal, timeout: options.requestTimeoutMs })
      if (accepted !== undefined && accepted !== null && accepted !== '') throw failure('OPENCODE_PROTOCOL', 'OpenCode returned an unexpected permission acknowledgement.')
      request.settled = true
    }

    async function handleEvent(raw: any) {
      if (disposed) return
      if (!raw || typeof raw.type !== 'string') throw failure('OPENCODE_PROTOCOL', 'OpenCode sent an unsupported event envelope.')
      const p = dataOf(raw)
      if (raw.type === 'server.connected') { streamReadyResolve(); return }
      if (raw.type === 'server.heartbeat') return
      if (!started) return
      if (raw.type === 'session.execution.started') {
        await emit({ type: 'status', data: { status: 'running', nativeSessionId: id, connectionEpoch, sandbox: false } })
        return
      }
      if (raw.type === 'session.text.delta') {
        if (typeof p.delta !== 'string' || !p.delta) return
        await emit({ type: 'assistant', text: p.delta, data: { nativeSessionId: id, messageId: p.assistantMessageID, ordinal: p.ordinal, delta: true, mode: 'append' } })
        return
      }
      if (raw.type === 'session.text.ended') {
        const value = text(p.text)
        finalText = value
        await emit({ type: 'assistant', text: value, data: { nativeSessionId: id, messageId: p.assistantMessageID, ordinal: p.ordinal, delta: false, mode: 'replace' } })
        return
      }
      if (raw.type === 'session.reasoning.started' || raw.type === 'session.reasoning.delta' || raw.type === 'session.reasoning.ended') return
      if (raw.type === 'session.tool.called') {
        await emit({ type: 'tool', text: p.name || 'tool', data: { nativeSessionId: id, messageId: p.assistantMessageID, callId: p.id, name: p.name, state: { status: 'running', input: p.input, metadata: p.metadata } } })
        return
      }
      if (raw.type === 'session.tool.success') {
        await emit({ type: 'tool', text: 'tool completed', data: { nativeSessionId: id, messageId: p.assistantMessageID, callId: p.id, state: { status: 'completed', input: p.input, content: p.content } } })
        return
      }
      if (raw.type === 'session.tool.error' || raw.type === 'session.tool.failed') {
        await emit({ type: 'tool', text: 'tool failed', data: { nativeSessionId: id, messageId: p.assistantMessageID, callId: p.id, state: { status: 'error', input: p.input, error: p.error } } })
        return
      }
      if (raw.type === 'session.step.ended') {
        const usage = p.tokens ? { tokens: p.tokens, ...(typeof p.cost === 'number' ? { cost: p.cost } : {}) } : undefined
        if (usage) await emit({ type: 'usage', data: { nativeSessionId: id, ...usage, scope: 'step', finish: p.finish } })
        return
      }
      if (raw.type === 'session.usage.updated') {
        if (p.tokens) await emit({ type: 'usage', data: { nativeSessionId: id, tokens: p.tokens, ...(typeof p.cost === 'number' ? { cost: p.cost } : {}), scope: 'session' } })
        return
      }
      if (raw.type === 'permission.asked') {
        const key = String(p.id)
        if (!key || p.sessionID !== id) throw failure('OPENCODE_BLOCKED', 'OpenCode requested permission outside this turn. The turn was stopped.')
        if (requests.has(key)) {
          if (JSON.stringify(requests.get(key).properties) !== JSON.stringify(p)) throw failure('OPENCODE_PERMISSION_CHANGED', 'OpenCode reused a request ID with different details.')
          return
        }
        if (pendingHandlers.size >= 32) throw failure('OPENCODE_BLOCKED', 'OpenCode sent too many simultaneous decision requests. The turn was stopped.')
        const record = { properties: p, sent: false, settled: false, controller: new AbortController() }
        requests.set(key, record)
        track(replyPermission(record, p))
        return
      }
      if (raw.type === 'permission.replied' || raw.type === 'permission.rejected') {
        const request = requests.get(String(p.requestID))
        if (request) { request.settled = true; request.controller.abort() }
        await emit({ type: 'status', data: { vendorType: raw.type, nativeSessionId: id, requestId: p.requestID } })
        return
      }
      if (/^session\.form\./.test(raw.type)) {
        throw failure('OPENCODE_BLOCKED', 'OpenCode requested structured input, which this v2 adapter does not implement yet. Answer it directly in OpenCode; the turn was stopped.')
      }
      if (raw.type === 'session.error') throw failure('OPENCODE_NATIVE_ERROR', typeof p.message === 'string' ? p.message : 'OpenCode reported a native session error.')
      if (raw.type === 'session.execution.succeeded') { terminalResolve({ status: 'completed' }); return }
      if (raw.type === 'session.execution.failed') { terminalResolve({ status: 'failed', reason: typeof p.message === 'string' ? p.message : 'OpenCode reported a failed native execution.' }); return }
      if (raw.type === 'session.execution.interrupted') { terminalResolve({ status: 'cancelled' }); return }
      if (raw.type === 'session.idle') { terminalResolve({ status: 'completed' }); return }
      if (raw.type === 'session.step.started') return
      await emit({ type: 'diagnostic', data: { vendorType: raw.type, nativeSessionId: id } })
    }

    async function waitQuiescent(sessionID: any, controller: any) {
      const deadline = Date.now() + (options.cleanupTimeoutMs ?? 10000)
      while (Date.now() < deadline) {
        try {
          const current = await http(`/api/session/${encodeURIComponent(sessionID)}`, { cwd, signal: controller.signal, timeout: Math.max(1000, deadline - Date.now()) })
          const outcome = current?.data?.outcome
          if (TERMINAL_EXECUTION.has(outcome)) return true
        } catch (error: any) {
          if (error?.name === 'AbortError') return false
        }
        try { await delay(Math.min(options.statusPollMs ?? 250, Math.max(1, deadline - Date.now())), controller.signal) } catch { return false }
      }
      return false
    }

    async function stopAndVerify() {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), options.cleanupTimeoutMs ?? 10000)
      try {
        await http(`/api/session/${encodeURIComponent(id)}/interrupt`, { method: 'POST', cwd, signal: controller.signal, timeout: options.cleanupTimeoutMs })
        const ok = await waitQuiescent(id, controller)
        if (!ok) throw failure('AGENTS_CLEANUP_UNCONFIRMED', 'OpenCode cancellation could not be confirmed. The native session may still be running; inspect it before starting another turn.')
      } catch (error: any) {
        if (error.code === 'AGENTS_CLEANUP_UNCONFIRMED') throw error
        throw failure('AGENTS_CLEANUP_UNCONFIRMED', 'OpenCode cancellation could not be confirmed. The native session may still be running; inspect it before starting another turn.')
      } finally { clearTimeout(timer) }
    }

    try {
      const discovered = await inspect({ cwd, signal: runSignal, sandboxPolicy, trustedExternalRuntime })
      if (!discovered.available) return result('blocked', '', discovered.reason)
      http = discovered.http
      let chosen: any
      if (model) {
        const wanted = typeof model === 'string' ? model : `${model.providerID}/${model.modelID}`
        chosen = discovered.models.find((item: any) => item.id === wanted)
        if (!chosen) return result('blocked', '', 'The selected model is not available from a connected OpenCode provider.')
      }
      if (id) {
        if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(id)) return result('blocked', '', 'The native OpenCode session identifier is invalid.')
        const current = await http(`/api/session/${encodeURIComponent(id)}`, { cwd, signal: runSignal, timeout: options.requestTimeoutMs })
        const info = current?.data
        if (!info || info.id !== id) throw failure('OPENCODE_PROTOCOL', 'OpenCode returned a different native session during resume.')
        if (typeof cwd !== 'string' || info.location?.directory !== cwd) return result('blocked', '', 'The native OpenCode session did not confirm the requested working directory.')
      } else {
        const created = await http('/api/session', { method: 'POST', cwd, signal: runSignal, timeout: options.requestTimeoutMs,
          body: { title: 'DSH-X', location: { directory: cwd }, ...(chosen ? { model: { id: chosen.modelID, providerID: chosen.providerID } } : {}) } })
        const info = created?.data
        if (!info || typeof info.id !== 'string') throw failure('OPENCODE_PROTOCOL', 'OpenCode did not return a native session identifier.')
        id = info.id
        if (info.location?.directory !== cwd) return result('blocked', '', 'The native OpenCode session did not confirm the requested working directory.')
      }
      if (active.has(id)) return result('blocked', '', 'This native OpenCode session already has an active turn.')
      active.add(id); locked = true
      await emit({ type: 'session', data: { nativeSessionId: id } })

      const pending = await http(`/api/session/${encodeURIComponent(id)}/permission`, { cwd, signal: runSignal, timeout: options.requestTimeoutMs })
      if (Array.isArray(pending?.data) && pending.data.length) return result('blocked', '', 'This native session already has a pending decision. Resolve it directly in OpenCode before starting a new turn.', undefined)

      const eventSignal = AbortSignal.any([runSignal, streamController.signal])
      const stream = await http('/api/event', { cwd, signal: eventSignal, stream: true })
      consumeSse(stream.body, handleEvent, eventSignal).catch((error: any) => {
        if (!disposed && !completed && !runSignal.aborted) fail(error)
      })
      const handshake = AbortSignal.timeout(options.requestTimeoutMs ?? 10000)
      try { await abortable(streamReady, AbortSignal.any([runSignal, handshake])) } catch (error: any) {
        if (handshake.aborted && !runSignal.aborted) throw failure('OPENCODE_TIMEOUT', 'OpenCode did not confirm the event subscription. No prompt was sent.')
        throw error
      }
      if (runSignal.aborted) throw aborted()
      await emit({ type: 'status', text: 'OpenCode uses its existing native tool and permission policy.', data: { status: 'running', nativeSessionId: id, connectionEpoch, sandbox: false } })

      started = true
      const promptResult = await http(`/api/session/${encodeURIComponent(id)}/prompt`, { method: 'POST', cwd, signal: runSignal, timeout: options.requestTimeoutMs,
        body: { text: prompt, ...(options.agent ? { agent: options.agent } : {}) } })
      if (promptResult === undefined || promptResult === null) throw failure('OPENCODE_PROTOCOL', 'OpenCode did not accept the prompt.')

      const timeout = options.turnTimeoutMs > 0
        ? AbortSignal.timeout(options.turnTimeoutMs)
        : null
      let state: any
      try {
        state = await abortable(terminal, timeout ? AbortSignal.any([runSignal, timeout]) : runSignal)
      } catch (error: any) {
        if (timeout?.aborted && !signal?.aborted) throw failure('OPENCODE_TIMEOUT', 'The native OpenCode turn did not finish within the configured timeout.')
        throw error
      }
      if (state.status !== 'completed') {
        if (state.status === 'cancelled') return result('cancelled')
        throw failure('OPENCODE_NATIVE_ERROR', state.reason || 'OpenCode could not complete the native turn.')
      }
      await emit({ type: 'assistant', text: finalText, data: { nativeSessionId: id, delta: false, mode: 'replace', final: true } })
      completed = true
      const nativeUsage = finalUsage ? redactor.clean({ ...finalUsage, scope: 'final', nativeSessionId: id }) : undefined
      return result('completed', redactor.text(finalText), undefined, nativeUsage)
    } catch (error: any) {
      const actual = failureFromEvent || error
      runController.abort()
      if (started && id && !completed) {
        try { await stopAndVerify() } catch (cleanup: any) {
          if (cleanup.code === 'AGENTS_CLEANUP_UNCONFIRMED') throw cleanup
        }
      }
      if (signal?.aborted && !failureFromEvent) return result('cancelled')
      const status = ['OPENCODE_BLOCKED', 'OPENCODE_AUTH', 'OPENCODE_PROTOCOL', 'OPENCODE_SCHEMA'].includes(actual.code) ? 'blocked' : 'failed'
      return result(status, '', redactor.text(actual.message || 'OpenCode could not complete this turn. No request was replayed.'))
    } finally {
      disposed = true
      runController.abort()
      streamController.abort()
      await Promise.allSettled([...pendingHandlers].filter(Boolean))
      await eventQueue
      if (locked && id) active.delete(id)
    }
  }

  return { id: 'opencode', transport: 'http-sse', backendIdentity, capabilities: CAPABILITIES, discover, run }
}
