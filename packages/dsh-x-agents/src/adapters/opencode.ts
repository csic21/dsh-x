import type { NativeDiscovery } from '../types.ts'
import { randomBytes, randomUUID } from 'node:crypto'
import { abortable, aborted, consumeSse, createHttp, createRedactor, delay, failure, findRoute, loopbackEndpoint, resolveSchema } from './opencode-http.ts'

// Stable native server API, verified against the official OpenAPI-generated
// SDK at anomalyco/opencode v1.19.3. The connected server's /doc is checked
// rather than assuming an installed version implements these endpoints.
// https://opencode.ai/docs/server/
// https://github.com/anomalyco/opencode/blob/v1.19.3/packages/sdk/js/src/v2/gen/types.gen.ts
const CAPABILITIES = Object.freeze({
  nativeSessions: true, resume: true, streaming: true, tools: true, plans: true,
  permissions: true, input: true, usage: true, cancel: true, models: true,
  authDiscovery: true, sandbox: false, automaticReplay: false,
  childPermissions: false, childInput: false,
  permissionScopes: ['allow_once', 'reject_once'],
  permissionPolicy: 'native-server',
  limitations: [
    'An external OpenCode server does not inherit the host sandbox. Explicit trust and an unrestricted host are required.',
    'Native server and session rules determine which operations request approval. Existing allow rules are not changed.',
    'Provider credentials are not validated by a paid model request during discovery.',
    'Only one-time permission replies are supported; rejection can also reject other pending requests in the native session.',
    'Native child sessions are observed and explicitly delegated sessions are cancelled with the parent. Child approval/input requests are blocked because the native task metadata does not identify the exact child user turn.',
    'The separate experimental v2 session/permission/question protocol is not implemented.',
  ],
})

const REQUIRED_ROUTES = [
  ['/session', 'post'], ['/session/{id}', 'get'], ['/session/status', 'get'],
  ['/session/{id}/message', 'post'], ['/session/{id}/abort', 'post'], ['/event', 'get'],
  ['/session/{id}/message/{messageID}', 'get'],
]

let lastMessageTime = 0, messageCounter = 0
function ascendingMessageId() {
  // Match official id/id.ts: low 48 bits of milliseconds * 0x1000 +
  // a same-millisecond counter, followed by 14 Base62 characters. Native
  // history ordering depends on this prefix, not merely the /^msg/ schema.
  const now = Math.max(Date.now(), lastMessageTime)
  messageCounter = now === lastMessageTime ? messageCounter + 1 : 0
  lastMessageTime = now
  const time = ((BigInt(now) * 0x1000n + BigInt(messageCounter)) & 0xffffffffffffn).toString(16).padStart(12, '0')
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
  const random = [...randomBytes(14)].map(value => alphabet[value % alphabet.length]).join('')
  return `msg_${time}${random}`
}

function protocol(spec: any) {
  if (!spec?.openapi?.startsWith('3.') || !spec.paths) throw failure('OPENCODE_SCHEMA', 'OpenCode /doc did not expose a supported OpenAPI 3 schema.')
  for (const [path, method] of REQUIRED_ROUTES) {
    if (!findRoute(spec, path, method)) throw failure('OPENCODE_SCHEMA', `OpenCode schema is missing ${method.toUpperCase()} ${path}.`)
  }
  const reply = findRoute(spec, '/permission/{id}/reply', 'post')
  const body = resolveSchema(spec, resolveSchema(spec, reply?.requestBody)?.content?.['application/json']?.schema)
  const values = resolveSchema(spec, body?.properties?.reply)?.enum
  const permissions = Boolean(findRoute(spec, '/permission', 'get') && values?.includes('once') && values?.includes('reject'))
  const input = Boolean(findRoute(spec, '/question', 'get') && findRoute(spec, '/question/{id}/reply', 'post') && findRoute(spec, '/question/{id}/reject', 'post'))
  return { spec, children: Boolean(findRoute(spec, '/session/{id}/children', 'get')), capabilities: { ...CAPABILITIES, permissions, input } }
}

function isObject(value: any) { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function requireId(id: any, name = 'session') {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(id)) throw failure('OPENCODE_PROTOCOL', `OpenCode returned an invalid ${name} identifier.`)
  return id
}
function sessionPath(id: any, tail = '') { return `/session/${encodeURIComponent(requireId(id))}${tail}` }
function nativeReason(error: any, fallback: any) { return typeof error?.data?.message === 'string' ? error.data.message : fallback }
function summarize(parts: any) { return (parts || []).filter((part: any) => part.type === 'text' && !part.ignored).map((part: any) => part.text || '').join('\n') }
function usageOf(info: any) { return info?.tokens ? { tokens: info.tokens, ...(typeof info.cost === 'number' ? { cost: info.cost } : {}) } : undefined }

export function createOpenCodeAdapter({ fetch = globalThis.fetch, config = {}, managedScope }: any = {}) {
  // Trusted same-process injection only. A managed owner supplies its live
  // lifetime and empty working directory; derived request signals are allowed.
  // Tool arguments cannot create this scope.
  const owns = (cwd: any, signal: any) => managedScope && managedScope.cwd === cwd && managedScope.signal && !managedScope.signal.aborted && signal && !signal.aborted
  const redactor = createRedactor(config)
  let identityEndpoint = 'unconfigured'
  try { identityEndpoint = loopbackEndpoint(config.endpoint || config.baseUrl) } catch {}
  const backendIdentity = `opencode:${JSON.stringify({ endpoint: identityEndpoint, username: redactor.text(config.username || 'opencode'), agent: redactor.text(config.agent || 'native-default') })}`
  const active = new Set<any>()
  let cachedProtocol: any
  const blocked = (reason: any, nativeSessionId = null) => ({ nativeSessionId, status: 'blocked', summary: '', reason })
  const setup = () => {
    const endpoint = loopbackEndpoint(config.endpoint || config.baseUrl)
    if (typeof config.password !== 'string' || !config.password) throw failure('OPENCODE_AUTH', 'Configure the existing OpenCode server password through the host environment. Unauthenticated external servers are disabled.')
    if (typeof fetch !== 'function') throw failure('OPENCODE_TRANSPORT', 'This host does not provide an HTTP fetch implementation.')
    return createHttp({ fetch, config, endpoint })
  }

  async function inspect({ cwd, signal, sandboxPolicy = config.sandboxPolicy, trustedExternalRuntime = config.trustedExternalRuntime }: any = {}) {
    const http = setup()
    let challenged = false
    try { await http('/global/health', { signal, authenticate: false }) } catch (error: any) {
      if (error.status === 401 && error.basicChallenge) challenged = true
      else throw error
    }
    if (!challenged) throw failure('OPENCODE_AUTH', 'The OpenCode server did not enforce HTTP Basic authentication. Enable its existing server-password protection before connecting.')
    const health = await http('/global/health', { signal })
    if (health?.healthy !== true || typeof health.version !== 'string') throw failure('OPENCODE_PROTOCOL', 'OpenCode did not report a healthy server and version.')
    const spec = await http('/doc', { signal })
    const api = protocol(spec)
    cachedProtocol = api
    // /provider is an instance-scoped route. Native instance initialization
    // can load project plugins; a GET is not proof of side-effect freedom.
    if (!owns(cwd, signal) && (sandboxPolicy?.mode !== 'danger-full-access' || trustedExternalRuntime !== true)) {
      return { http, api, available: false, version: health.version, authenticated: true, providerAuthentication: 'unverified', models: [], capabilities: api.capabilities,
        reason: 'Project/provider discovery can initialize OpenCode’s native project instance. It requires an unrestricted host and explicit trust in this external runtime.' }
    }
    const providers = await http('/provider', { cwd, signal })
    if (!Array.isArray(providers?.all) || !Array.isArray(providers?.connected)) throw failure('OPENCODE_PROTOCOL', 'OpenCode provider discovery returned an unsupported response.')
    const connected = new Set(providers.connected)
    const models = providers.all.filter((provider: any) => connected.has(provider.id)).flatMap((provider: any) =>
      Object.entries<any>(provider.models || {}).map(([id, model]) => ({
        id: `${provider.id}/${id}`, label: `${provider.name || provider.id} / ${model.name || id}`,
        providerID: provider.id, modelID: id,
      })))
    return {
      http, api, available: models.length > 0, version: health.version,
      authenticated: true, providerAuthentication: 'unverified',
      models: redactor.clean(models), capabilities: api.capabilities,
      reason: models.length ? undefined : 'The OpenCode server has no connected provider with an available model. Configure one in OpenCode first.',
    }
  }

  async function discover(options: any = {}) {
    try {
      const { http, api, ...result } = await inspect(options)
      return result
    } catch (error: any) {
      return { available: false, version: null, authenticated: error.code === 'OPENCODE_AUTH' ? false : null, models: [], reason: redactor.text(error.message), capabilities: { ...CAPABILITIES, permissions: cachedProtocol?.capabilities.permissions ?? false, input: cachedProtocol?.capabilities.input ?? false } }
    }
  }

  async function run({ prompt, model, cwd, nativeSessionId, signal, onEvent = async () => {}, requestPermission, requestInput, sandboxPolicy, trustedExternalRuntime }: any = {}) {
    if (!owns(cwd, signal) && (sandboxPolicy?.mode !== 'danger-full-access' || trustedExternalRuntime !== true)) {
      return blocked('OpenCode runs in a separate server and cannot inherit the host sandbox. An unrestricted host and explicit trust in this external runtime are required.', nativeSessionId)
    }
    if (typeof prompt !== 'string' || !prompt.trim()) return blocked('A non-empty prompt is required.', nativeSessionId)
    if (signal?.aborted) return { nativeSessionId: nativeSessionId || null, status: 'cancelled', summary: '' }
    if (nativeSessionId && active.has(nativeSessionId)) return blocked('This native OpenCode session already has an active turn.', nativeSessionId)
    const runController = new AbortController()
    const runSignal = signal ? AbortSignal.any([signal, runController.signal]) : runController.signal
    const streamController = new AbortController()
    const connectionEpoch = randomUUID()
    const userMessageID = ascendingMessageId()
    const ownedSessions = new Set<any>()
    // Session ancestry is useful for observation, but it does not prove that
    // this turn owns a historical child's work. Only explicit current-turn
    // native task-tool delegation may grant that ownership.
    const turnSessions = new Set<any>()
    const parents = new Map<any, any>()
    const requests = new Map<any, any>()
    const parts = new Map<any, any>()
    const messages = new Map<any, any>()
    const nativeEventIDs = new Set<any>()
    const pendingHandlers = new Set<any>()
    const retainedSizes = new Map<any, any>()
    let retainedBytes = 0, eventCount = 0
    const retain = (collection: any, key: any, value: any) => {
      const slot = `${collection}:${key}`
      const size = Buffer.byteLength(JSON.stringify(value))
      const next = retainedBytes - (retainedSizes.get(slot) || 0) + size
      if (next > 32 * 1024 * 1024 || (!retainedSizes.has(slot) && retainedSizes.size >= 10000)) throw failure('OPENCODE_PROTOCOL', 'The native turn exceeded the workbench event-state budget. Inspect the session directly in OpenCode.')
      retainedSizes.set(slot, size); retainedBytes = next
    }
    let id = nativeSessionId || null, http: any, api: any, streamTask, promptTask, started = false, completed = false, disposed = false, locked = false, streamReadyResolve: any
    let failureFromEvent: any, finalUsage, eventQueue = Promise.resolve()
    const streamReady = new Promise<any>(resolve => { streamReadyResolve = resolve })
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
    const requestOptions = (options?: any) => ({ cwd, signal: runSignal, ...options })

    async function collectChildren(parent: any, options: any, seen = new Set<any>()) {
      if (!api.children || seen.has(parent)) return
      if (seen.size > 1000) throw failure('OPENCODE_PROTOCOL', 'The native session tree exceeded the supported size.')
      seen.add(parent)
      const children = await http(sessionPath(parent, '/children'), options)
      if (!Array.isArray(children)) throw failure('OPENCODE_PROTOCOL', 'OpenCode returned an invalid child-session list.')
      for (const child of children) {
        if (child.parentID !== parent) throw failure('OPENCODE_PROTOCOL', 'OpenCode returned a child with a mismatched parent session.')
        ownedSessions.add(requireId(child.id))
        parents.set(child.id, parent)
        await collectChildren(child.id, options, seen)
      }
    }

    async function readStatuses(options: any) {
      const statuses = await http('/session/status', options)
      if (!isObject(statuses) || Object.values<any>(statuses).some(status => !['idle', 'busy', 'retry'].includes(status?.type))) throw failure('OPENCODE_PROTOCOL', 'OpenCode returned an invalid session-status map.')
      return statuses
    }

    async function waitIdle(options: any, verifyRequests = false) {
      while (true) {
        const statuses = await readStatuses(options)
        // The native status service removes idle sessions from this map.
        let idle = [...ownedSessions].every(sessionID => !statuses[sessionID] || statuses[sessionID].type === 'idle')
        if (idle && verifyRequests) {
          for (const [kind, supported] of [['permission', api.capabilities.permissions], ['question', api.capabilities.input]]) {
            if (!supported) continue
            const pending = await http(`/${kind}`, options)
            if (!Array.isArray(pending)) throw failure('OPENCODE_PROTOCOL', 'OpenCode returned an invalid pending-request list during cleanup.')
            if (pending.some(request => ownedSessions.has(request.sessionID))) idle = false
          }
        }
        if (idle) return
        await delay(config.statusPollMs ?? 500, options.signal)
      }
    }

    async function stopAndVerify() {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), config.cleanupTimeoutMs ?? 10000)
      const options = { cwd, signal: controller.signal }
      try {
        // Discover native children as well: root abort alone is not assumed to
        // prove quiescence of a delegated session tree.
        await collectChildren(id, options)
        for (const sessionID of [...turnSessions].reverse()) {
          const result = await http(sessionPath(sessionID, '/abort'), { ...options, method: 'POST' })
          if (result !== true) throw failure('OPENCODE_PROTOCOL', 'OpenCode did not acknowledge cancellation.')
        }
        await waitIdle(options, true)
        // Re-read descendants after abort so a child created during cancellation
        // cannot be missed by the initial snapshot.
        const count = ownedSessions.size
        await collectChildren(id, options)
        if (ownedSessions.size !== count) {
          for (const sessionID of turnSessions) await http(sessionPath(sessionID, '/abort'), { ...options, method: 'POST' })
          await waitIdle(options, true)
        }
      } catch {
        throw failure('AGENTS_CLEANUP_UNCONFIRMED', 'OpenCode cancellation could not be confirmed. The native session may still be running; inspect it before starting another turn.')
      } finally { clearTimeout(timer) }
    }

    function requestKey(kind: any, properties: any) { return `${kind}:${properties.sessionID}:${properties.id}` }

    async function liveRequest(kind: any, properties: any) {
      const list = await http(`/${kind}`, requestOptions())
      if (!Array.isArray(list)) throw failure('OPENCODE_PROTOCOL', `OpenCode returned an invalid ${kind} request list.`)
      const current = list.find(item => item.id === properties.id && item.sessionID === properties.sessionID)
      if (current && JSON.stringify(current) !== JSON.stringify(properties)) {
        // Property order and nonessential additions can differ. Compare the
        // actual consequential request rather than approval UI presentation.
        const keys = kind === 'permission' ? ['permission', 'patterns', 'always', 'metadata', 'tool'] : ['questions', 'tool']
        if (keys.some(key => JSON.stringify(current[key]) !== JSON.stringify(properties[key]))) throw failure('OPENCODE_PERMISSION_CHANGED', 'The native approval request changed while it was awaiting a decision.')
      }
      return current
    }

    async function handleRequest(kind: any, properties: any) {
      const key = requestKey(kind, properties)
      const record = requests.get(key)
      const requestSignal = AbortSignal.any([runSignal, record.controller.signal])
      const ask = async (callback: any) => {
        try { return await abortable(Promise.resolve().then(callback), requestSignal) } catch (error: any) {
          if (record.settled && !runSignal.aborted) return undefined
          throw error
        }
      }
      if (!started) throw failure('OPENCODE_BLOCKED', 'OpenCode requested a decision before this turn started. Inspect the existing native session first.')
      const supported = kind === 'permission' ? api.capabilities.permissions : api.capabilities.input
      if (!supported) throw failure('OPENCODE_BLOCKED', `This OpenCode server does not expose the verified ${kind} reply protocol. The turn was stopped.`)
      if (!await liveRequest(kind, properties)) return
      if (!turnSessions.has(properties.sessionID)) throw failure('OPENCODE_BLOCKED', 'A child session requested a decision without verified delegation from this turn. Inspect that native child directly in OpenCode.')
      if (properties.sessionID !== id) throw failure('OPENCODE_BLOCKED', 'OpenCode child-session decisions cannot be bound to the exact child user turn through this native protocol. The turn was stopped without answering the child request.')
      const messageID = properties.tool?.messageID
      if (!messageID || typeof properties.tool.callID !== 'string') throw failure('OPENCODE_BLOCKED', 'The native decision request did not identify its originating turn and tool call. The turn was stopped without granting permission.')
      let origin = messages.get(messageID)
      if (!origin) {
        const result = await http(sessionPath(properties.sessionID, `/message/${encodeURIComponent(requireId(messageID, 'message'))}`), requestOptions())
        origin = result?.info
      }
      if (origin?.id !== messageID || origin?.role !== 'assistant' || origin?.sessionID !== properties.sessionID ||
          (properties.sessionID === id && origin.parentID !== userMessageID)) throw failure('OPENCODE_BLOCKED', 'The native decision request did not match this turn. The turn was stopped without granting permission.')
      const identity = { nativeSessionId: properties.sessionID, itemId: properties.tool?.callID, turnId: origin.parentID, rootTurnId: userMessageID, nativeMessageId: messageID, connectionEpoch }
      let body, path, rejectedInput = false
      if (kind === 'permission') {
        if (typeof properties.permission !== 'string' || !properties.permission || !Array.isArray(properties.patterns) || !properties.patterns.every((pattern: any) => typeof pattern === 'string')) throw failure('OPENCODE_BLOCKED', 'OpenCode requested permission without a complete native operation and scope. The turn was stopped.')
        const options = [
          { id: 'once', label: 'Allow this request once', kind: 'allow_once' },
          { id: 'reject', label: 'Reject (also rejects other pending requests in this native session)', kind: 'reject_once' },
        ]
        const details = redactor.clean(properties)
        const scopeComplete = JSON.stringify(details) === JSON.stringify(properties)
        const request = { id: properties.id, nativeSessionId: id, kind: properties.permission, title: `OpenCode: ${properties.permission}`, identity, scopeComplete,
          scope: { patterns: properties.patterns, nativeSessionId: properties.sessionID, rejectScope: 'pending-native-session-requests' },
          details, options, defaultRejectOptionId: 'reject' }
        await emit({ type: 'permission', data: request })
        if (!scopeComplete) throw failure('OPENCODE_BLOCKED', 'The native permission scope contains sensitive or oversized details that cannot be safely displayed. Inspect this request directly in OpenCode.')
        if (typeof requestPermission !== 'function') throw failure('OPENCODE_BLOCKED', 'OpenCode requested permission, but this host cannot collect a decision. The turn was stopped.')
        const answer = await ask(() => requestPermission({ ...redactor.clean(request), signal: requestSignal }))
        if (record.settled) return
        if (runSignal.aborted) throw aborted()
        if (answer?.optionId !== 'once' && answer?.optionId !== 'reject') throw failure('OPENCODE_BLOCKED', 'No valid one-time permission decision was provided. The turn was stopped without granting permission.')
        body = { reply: answer.optionId }
        path = `/permission/${encodeURIComponent(properties.id)}/reply`
      } else {
        if (!Array.isArray(properties.questions) || !properties.questions.length || !properties.questions.every((question: any) => typeof question.question === 'string' && Array.isArray(question.options) && question.options.every((option: any) => typeof option.label === 'string'))) throw failure('OPENCODE_PROTOCOL', 'OpenCode requested input without a valid question list.')
        const secretQuestion = properties.questions.some((question: any) => /password|api[ _-]?key|secret|access[ _-]?token|refresh[ _-]?token|credentials?|verification[ _-]?code|one[ _-]?time[ _-]?(?:code|password)|2fa|密码|密钥|验证码/i.test(JSON.stringify(question)))
        if (secretQuestion) throw failure('OPENCODE_BLOCKED', 'OpenCode requested authentication or secret input. This workbench has no secure input flow; complete authentication directly in OpenCode.')
        const questions = properties.questions.map((question: any, index: any) => ({ id: `question_${index}`, question: question.question, header: question.header, options: question.options, multiSelect: question.multiple === true }))
        const request = { id: properties.id, nativeSessionId: id, title: 'OpenCode needs input', questions: redactor.clean(questions), identity }
        await emit({ type: 'input', data: request })
        if (typeof requestInput !== 'function') throw failure('OPENCODE_BLOCKED', 'OpenCode requested input, but this host cannot collect answers. The turn was stopped.')
        const answer = await ask(() => requestInput({ ...request, signal: requestSignal }))
        if (record.settled) return
        if (runSignal.aborted) throw aborted()
        if (answer === null) { path = `/question/${encodeURIComponent(properties.id)}/reject`; rejectedInput = true }
        else {
          const selected = answer?.answers
          if (!Array.isArray(selected) || selected.length !== questions.length || new Set(selected.map(item => item.id)).size !== questions.length) throw failure('OPENCODE_BLOCKED', 'The input response did not match OpenCode’s question schema. The turn was stopped.')
          const answers = questions.map((question: any, index: any) => {
            const item = selected.find(item => item.id === question.id)
            if (!Array.isArray(item?.selected) || !item.selected.every((value: any) => typeof value === 'string' && question.options?.some((option: any) => option.label === value)) || (item.custom != null && typeof item.custom !== 'string')) throw failure('OPENCODE_BLOCKED', 'The input response contained an unknown question or option. The turn was stopped.')
            const values = [...new Set([...item.selected, ...(item.custom?.trim() ? [item.custom] : [])])]
            if (!values.length || (!question.multiSelect && values.length > 1) || (properties.questions[index].custom === false && item.custom?.trim())) throw failure('OPENCODE_BLOCKED', 'The input response did not match the native question selection rules. The turn was stopped.')
            return values
          })
          path = `/question/${encodeURIComponent(properties.id)}/reply`
          body = { answers }
        }
      }
      if (requests.get(key)?.settled || !await liveRequest(kind, properties)) return
      if (runSignal.aborted) throw aborted()
      // Mark before dispatch: an ambiguous transport failure must not replay a
      // consequential response, even when duplicate events arrive.
      requests.get(key).sent = true
      const accepted = await http(path, requestOptions({ method: 'POST', body }))
      if (accepted !== true) throw failure('OPENCODE_PROTOCOL', 'OpenCode did not acknowledge the decision.')
      if (await liveRequest(kind, properties)) throw failure('OPENCODE_PROTOCOL', 'OpenCode acknowledged a decision but the exact request is still pending.')
      requests.get(key).settled = true
      if (rejectedInput) throw failure('OPENCODE_BLOCKED', 'Native input was cancelled or unavailable. The turn was stopped.')
    }

    async function recordPart(part: any, force = false) {
      if (!part || !ownedSessions.has(part.sessionID)) return
      if (typeof part.id !== 'string' || typeof part.messageID !== 'string') throw failure('OPENCODE_PROTOCOL', 'OpenCode returned an invalid message part.')
      const previous = parts.get(part.id)
      if (previous && (previous.sessionID !== part.sessionID || previous.messageID !== part.messageID)) throw failure('OPENCODE_PROTOCOL', 'OpenCode changed the owner of a native message part.')
      retain('part', part.id, part)
      parts.set(part.id, part)
      if (!force && JSON.stringify(previous) === JSON.stringify(part)) return
      const origin = messages.get(part.messageID)
      if (origin?.role !== 'assistant' || !turnSessions.has(part.sessionID) || (part.sessionID === id && origin.parentID !== userMessageID)) return
      const data = { nativeSessionId: part.sessionID, messageId: part.messageID, partId: part.id, vendorType: `message.part.${part.type}` }
      if (part.type === 'text') {
        if (!part.ignored) {
          const text = summarize([...parts.values()].filter(value => value.sessionID === part.sessionID && value.messageID === part.messageID))
          await emit({ type: 'assistant', text, data: { ...data, mode: 'replace', delta: false } })
        }
      } else if (part.type === 'tool') {
        // Official task.ts v1.19.3 publishes sessionId (lowercase d) before
        // prompting its child. Ancestry alone is not current-turn delegation.
        const delegated = part.tool === 'task' && part.state?.metadata?.sessionId
        if (delegated) {
          requireId(delegated)
          if (!parents.has(delegated)) {
            const child = await http(sessionPath(delegated), requestOptions())
            if (child?.id !== delegated || child.parentID !== part.sessionID) throw failure('OPENCODE_PROTOCOL', 'The native task tool did not reference its own child session.')
            parents.set(delegated, child.parentID)
          }
          if (parents.get(delegated) !== part.sessionID || (part.state.metadata.parentSessionId && part.state.metadata.parentSessionId !== part.sessionID)) throw failure('OPENCODE_PROTOCOL', 'The native task tool changed its child-session ownership.')
          if (ownedSessions.size >= 1000 && !ownedSessions.has(delegated)) throw failure('OPENCODE_PROTOCOL', 'OpenCode session tree exceeded the supported turn limit.')
          ownedSessions.add(delegated)
          turnSessions.add(delegated)
        }
        await emit({ type: 'tool', text: part.state?.title || part.tool, data: { ...data, callId: part.callID, name: part.tool, state: part.state } })
      } else if (part.type === 'step-finish') {
        const usage = usageOf(part)
        if (usage) await emit({ type: 'usage', data: { ...data, ...usage, scope: 'step' } })
      } else if (part.type !== 'reasoning') {
        // Do not manufacture textual reasoning. Retain safe native metadata for
        // other session parts (patches, retries, compaction and subtasks).
        await emit({ type: 'diagnostic', data: { ...data, part } })
      }
    }

    async function handleEvent(raw: any) {
      if (disposed) return
      const event = raw?.payload || raw
      if (!isObject(event) || typeof event.type !== 'string') throw failure('OPENCODE_PROTOCOL', 'OpenCode sent an unsupported event envelope.')
      if (++eventCount > 100000) throw failure('OPENCODE_PROTOCOL', 'OpenCode event count exceeded the supported turn limit.')
      if (event.type === 'server.connected') { streamReadyResolve(); return }
      if (event.id) {
        if (nativeEventIDs.has(event.id)) return
        nativeEventIDs.add(event.id)
        if (nativeEventIDs.size > 100000) throw failure('OPENCODE_PROTOCOL', 'OpenCode event count exceeded the supported turn limit.')
      }
      const p = event.properties || event.data || {}
      if (event.type === 'session.created' && ownedSessions.has(p.info?.parentID)) {
        if (ownedSessions.size >= 1000) throw failure('OPENCODE_PROTOCOL', 'OpenCode session tree exceeded the supported turn limit.')
        ownedSessions.add(requireId(p.info.id))
        parents.set(p.info.id, p.info.parentID)
        await emit({ type: 'diagnostic', data: { vendorType: event.type, nativeSessionId: p.info.id, parentId: p.info.parentID } })
        return
      }
      const sessionID = p.sessionID || p.part?.sessionID || p.info?.sessionID
      if (!ownedSessions.has(sessionID)) return
      if (!started) return
      if (event.type === 'permission.asked' || event.type === 'question.asked') {
        const kind = event.type.split('.')[0]
        requireId(p.id, 'request')
        const key = requestKey(kind, p)
        if (requests.has(key)) {
          if (JSON.stringify(requests.get(key).properties) !== JSON.stringify(p)) throw failure('OPENCODE_PERMISSION_CHANGED', 'OpenCode reused a request ID with different details.')
          return
        }
        if (pendingHandlers.size >= 32) throw failure('OPENCODE_BLOCKED', 'OpenCode sent too many simultaneous decision requests. The turn was stopped.')
        retain('request', key, p)
        requests.set(key, { properties: p, sent: false, settled: false, controller: new AbortController() })
        track(handleRequest(kind, p))
      } else if (/^(permission|question)\.(replied|rejected)$/.test(event.type)) {
        const key = requestKey(event.type.split('.')[0], { ...p, id: p.requestID })
        const request = requests.get(key)
        if (request) { request.settled = true; request.controller.abort() }
        await emit({ type: 'status', data: { vendorType: event.type, nativeSessionId: sessionID, requestId: p.requestID } })
      } else if (event.type.endsWith('.asked') || /^(permission|question)\./.test(event.type)) {
        throw failure('OPENCODE_BLOCKED', `Unsupported native approval/input event ${event.type}. The turn was stopped without granting permission.`)
      } else if (event.type === 'message.updated') {
        const info = p.info
        requireId(info?.id, 'message')
        const previous = messages.get(info.id)
        if (previous && (previous.sessionID !== info.sessionID || previous.role !== info.role || previous.parentID !== info.parentID)) throw failure('OPENCODE_PROTOCOL', 'OpenCode changed the owner of a native message.')
        retain('message', info.id, info)
        messages.set(info.id, info)
        if (info.role === 'assistant' && turnSessions.has(sessionID) && (sessionID !== id || info.parentID === userMessageID)) {
          const usage = usageOf(info)
          if (usage) await emit({ type: 'usage', data: { nativeSessionId: sessionID, messageId: info.id, ...usage, scope: 'message' } })
          // A text part can precede its message metadata on the event bus.
          if (!previous) for (const part of parts.values()) if (part.messageID === info.id) await recordPart(part, true)
        }
      } else if (event.type === 'message.part.updated') await recordPart(p.part)
      else if (event.type === 'message.part.delta') {
        const part = parts.get(p.partID)
        if (part && part.sessionID === sessionID && part.messageID === p.messageID && p.field === 'text' && typeof p.delta === 'string') await recordPart({ ...part, text: (part.text || '') + p.delta })
      } else if (event.type === 'todo.updated') await emit({ type: 'plan', data: { nativeSessionId: sessionID, todos: p.todos, vendorType: event.type } })
      else if (event.type === 'session.error') throw failure('OPENCODE_NATIVE_ERROR', nativeReason(p.error, 'OpenCode reported a native session error.'))
      else if (event.type === 'session.status' || event.type === 'session.idle') await emit({ type: 'status', data: { nativeSessionId: sessionID, status: p.status || { type: 'idle' }, vendorType: event.type } })
      else await emit({ type: 'diagnostic', data: { vendorType: event.type, nativeSessionId: sessionID, properties: p } })
    }

    try {
      const discovered = await inspect({ cwd, signal: runSignal, sandboxPolicy, trustedExternalRuntime })
      if (!discovered.available) return blocked(discovered.reason, id)
      http = discovered.http; api = discovered.api
      let chosen
      if (model) {
        chosen = discovered.models.find((item: any) => item.id === (typeof model === 'string' ? model : `${model.providerID}/${model.modelID}`))
        if (!chosen) return blocked('The selected model is not available from a connected OpenCode provider.', id)
      }
      if (id) {
        requireId(id)
        if (active.has(id)) return blocked('This native OpenCode session already has an active turn.', id)
        active.add(id)
        locked = true
        const session = await http(sessionPath(id), requestOptions())
        if (session?.id !== id) throw failure('OPENCODE_PROTOCOL', 'OpenCode returned a different native session during resume.')
        if (typeof cwd !== 'string' || session.directory !== cwd) return blocked('The native OpenCode session did not confirm the requested working directory.', id)
      } else {
        const session = await http('/session', requestOptions({ method: 'POST', body: {} }))
        id = requireId(session?.id)
        if (active.has(id)) throw failure('OPENCODE_PROTOCOL', 'OpenCode reused an active native session identifier.')
        active.add(id)
        locked = true
        // Checkpoint the newly created identity even if the server ignored the
        // directory, so the host can inspect it without creating another one.
        if (typeof cwd !== 'string' || session.directory !== cwd) {
          await emit({ type: 'session', data: { nativeSessionId: id } })
          return blocked('The native OpenCode session did not confirm the requested working directory.', id)
        }
      }
      ownedSessions.add(id)
      turnSessions.add(id)
      // Durable checkpoint precedes streaming, approvals and any model request.
      await emit({ type: 'session', data: { nativeSessionId: id } })
      await collectChildren(id, requestOptions())
      const statuses = await readStatuses(requestOptions())
      if ([...ownedSessions].some(sessionID => statuses[sessionID] && statuses[sessionID].type !== 'idle')) return blocked('This native OpenCode session or one of its children is busy. Wait for it to become idle before sending another prompt.', id)
      for (const [kind, supported] of [['permission', api.capabilities.permissions], ['question', api.capabilities.input]]) {
        if (!supported) continue
        const pending = await http(`/${kind}`, requestOptions())
        if (!Array.isArray(pending)) throw failure('OPENCODE_PROTOCOL', `OpenCode returned an invalid ${kind} request list.`)
        if (pending.some(request => ownedSessions.has(request.sessionID))) return blocked('This native session already has a pending decision. Resolve it directly in OpenCode before starting a new turn.', id)
      }
      const eventSignal = AbortSignal.any([runSignal, streamController.signal])
      const stream = await http('/event', { cwd, signal: eventSignal, stream: true })
      streamTask = consumeSse(stream.body, handleEvent, eventSignal).catch(error => {
        if (!disposed && !completed && !runSignal.aborted) fail(error)
      })
      const handshake = AbortSignal.timeout(config.requestTimeoutMs ?? 10000)
      try { await abortable(streamReady, AbortSignal.any([runSignal, handshake])) } catch (error: any) {
        if (handshake.aborted && !runSignal.aborted) throw failure('OPENCODE_TIMEOUT', 'OpenCode did not confirm the event subscription. No prompt was sent.')
        throw error
      }
      if (runSignal.aborted) throw aborted()
      await emit({ type: 'status', text: 'OpenCode uses its existing native tool and permission policy.', data: { status: 'running', nativeSessionId: id, connectionEpoch, sandbox: false } })
      started = true
      promptTask = http(sessionPath(id, '/message'), requestOptions({ method: 'POST', timeout: config.turnTimeoutMs ?? 0,
        body: { messageID: userMessageID, parts: [{ type: 'text', text: prompt }], ...(chosen ? { model: { providerID: chosen.providerID, modelID: chosen.modelID } } : {}), ...(config.agent ? { agent: config.agent } : {}) } }))
      // POST /message runs the full native agent turn. SSE handles native tool,
      // todo, usage and interactive approval events while this request awaits.
      const response = await abortable(promptTask, runSignal)
      if (response?.info?.sessionID !== id || response.info.role !== 'assistant' || response.info.parentID !== userMessageID || !Array.isArray(response.parts)) throw failure('OPENCODE_PROTOCOL', 'OpenCode returned a result that did not match the submitted native turn.')
      requireId(response.info.id, 'message')
      if (response.parts.some((part: any) => part.sessionID !== id || part.messageID !== response.info.id)) throw failure('OPENCODE_PROTOCOL', 'OpenCode returned message parts from a different native session or message.')
      if (response.info.error) throw failure('OPENCODE_NATIVE_ERROR', nativeReason(response.info.error, 'OpenCode could not complete the native turn.'))
      messages.set(response.info.id, response.info)
      for (const part of response.parts) await recordPart(part)
      await emit({ type: 'assistant', text: summarize(response.parts), data: { nativeSessionId: id, messageId: response.info.id, delta: false, mode: 'replace', final: true } })
      const nativeUsage = usageOf(response.info)
      finalUsage = nativeUsage ? redactor.clean({ ...nativeUsage, scope: 'final-assistant-message', messageId: response.info.id, nativeSessionId: id }) : undefined
      if (finalUsage) await emit({ type: 'usage', data: { nativeSessionId: id, messageId: response.info.id, ...finalUsage, scope: 'message' } })
      // Native background task tools can outlive the root HTTP response. Take
      // a fresh tree snapshot even if SSE is still draining, and keep the run
      // cancellable until native descendants finish. The short cleanup budget
      // applies to stopping, never to legitimate background work.
      await collectChildren(id, requestOptions())
      await waitIdle({ cwd, signal: runSignal }, true)
      if (runSignal.aborted) throw aborted()
      completed = true
      return { nativeSessionId: id, status: 'completed', summary: redactor.text(summarize(response.parts)), ...(finalUsage ? { usage: finalUsage } : {}) }
    } catch (error: any) {
      const actual = failureFromEvent || error
      runController.abort()
      if (started && id && !completed) await stopAndVerify()
      if (signal?.aborted && !failureFromEvent) return { nativeSessionId: id, status: 'cancelled', summary: '' }
      const status = actual.code === 'OPENCODE_BLOCKED' || actual.code === 'OPENCODE_AUTH' || actual.code === 'OPENCODE_SCHEMA' ? 'blocked' : 'failed'
      return { nativeSessionId: id, status, summary: '', reason: redactor.text(actual.message || 'OpenCode could not complete this turn. No request was replayed.') }
    } finally {
      disposed = true
      runController.abort()
      streamController.abort()
      await Promise.allSettled([streamTask, promptTask, ...pendingHandlers].filter(Boolean))
      await eventQueue
      if (locked) active.delete(id)
    }
  }

  return { id: 'opencode', transport: 'http-sse', backendIdentity, capabilities: CAPABILITIES, discover, run }
}
