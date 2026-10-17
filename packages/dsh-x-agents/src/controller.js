import { realpathSync } from 'node:fs'
import path from 'node:path'
import { ACTIVE, fail, safeText, safeData, validSession } from './store.js'

const capabilities = Object.fromEntries(['nativeSessions','resume','streaming','tools','plans','permissions','input','usage','cancel','models','authDiscovery'].map(key => [key, false]))
export const RUNTIMES = Object.freeze(['codex','opencode','claude','grok'])
const transports = { codex: 'app-server', opencode: 'http-sse', claude: 'agent-sdk', grok: 'acp' }
export const defaultCatalog = () => RUNTIMES.map(id => ({ id, label: { codex: 'Codex', opencode: 'OpenCode', claude: 'Claude', grok: 'Grok' }[id], transport: transports[id], available: null, authenticated: null, version: null, reason: 'not-inspected', models: [], capabilities: { ...capabilities } }))
export function validateRun(args) {
  if (!args || !RUNTIMES.includes(args.runtime)) throw fail('AGENTS_RUNTIME', 'Choose a supported native runtime: Codex, OpenCode, Claude or Grok.')
  if (args.readOnly !== undefined && typeof args.readOnly !== 'boolean') throw fail('AGENTS_POLICY', 'readOnly must be a boolean; a review can only tighten host policy.')
  const maxPromptChars = args.readOnly === true ? 64_000 : 12_000
  if (typeof args.prompt !== 'string' || !args.prompt.trim() || args.prompt.length > maxPromptChars) throw fail('AGENTS_PROMPT', `A task prompt of 1–${maxPromptChars} characters is required.`)
  if (safeText(args.prompt, maxPromptChars) !== args.prompt) throw fail('AGENTS_SECRET', 'Potential credentials must not be sent in task prompts. Use the vendor setup flow.')
  if (args.model !== undefined && (typeof args.model !== 'string' || !args.model.trim() || args.model.length > 160)) throw fail('AGENTS_MODEL', 'Invalid model identifier.')
  if (args.taskId !== undefined && (typeof args.taskId !== 'string' || !Number.isSafeInteger(args.expectedRevision) || typeof args.scope !== 'string')) throw fail('AGENTS_STALE', 'Continuing requires the exact task, revision and profile scope.')
}
export function createAgentsController({ store, adapter, cwdOf, policyOf, approve, askInput, beforeDispatch, trustedExternalRuntime = false, now = () => Date.now(), modelTtlMs = 5 * 60_000 }) {
  const running = new Map(), catalogs = new Map(), inspecting = new Map(), starting = new Map(), preparing = new Map(), nativeModels = new Map()
  const modelsOf = models => {
    const seen = new Set()
    return (Array.isArray(models) ? models : []).slice(0,2000).flatMap(model => {
      const id = safeText(model?.id,160), label = safeText(model?.label ?? model?.id,160)
      if (!id || id !== model?.id || seen.has(id)) return []
      seen.add(id); return [{id,label}]
    })
  }
  const binding = async exec => {
    const cwd = realpathSync(await cwdOf(exec))
    const policy = policyOf(exec)
    if (!policy || !['read-only','workspace-write','danger-full-access'].includes(policy.mode) || !path.isAbsolute(policy.workspaceRoot ?? '')) throw fail('AGENTS_POLICY', 'The host file-effect policy is unavailable.')
    const root = realpathSync(policy.workspaceRoot)
    const hostPolicy = { ...policy, workspaceRoot: root }
    const effectivePolicy = { ...hostPolicy, ...(exec.readOnly === true ? { mode: 'read-only' } : {}) }
    const relative = path.relative(root, cwd)
    if (effectivePolicy.mode !== 'danger-full-access' && (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative))) throw fail('AGENTS_POLICY', 'Task directory is outside the host workspace boundary.')
    return { cwd, hostPolicy, policy: effectivePolicy }
  }
  function snapshot(sessionId) {
    validSession(sessionId)
    const value = store.snapshot(sessionId), task = value.task
    const catalog = structuredClone(catalogs.get(sessionId) ?? defaultCatalog())
    for (const item of catalog) if (item.modelCatalog?.status === 'fresh' && Date.parse(item.modelCatalog.expiresAt) <= now()) item.modelCatalog.status = 'stale'
    if (task) {
      delete task.hostId
      task.cancellationRequested = running.get(sessionId)?.controller.signal.aborted === true
      task.allowedActions = ACTIVE.has(task.state) && running.has(sessionId) ? (task.cancellationRequested ? [] : ['cancel'])
        : task.state === 'interrupted' || store.hasLock(sessionId) ? ['inspect']
        : task.nativeSessionId ? ['request-start','request-continue','inspect'] : ['request-start','inspect']
    }
    return { scope: store.scope, sessionId, revision: value.revision, catalog, operation: preparing.has(sessionId) ? {kind:'models',runtime:preparing.get(sessionId).runtime,state:preparing.get(sessionId).state} : store.operationLock(sessionId), task, history: value.history }
  }
  async function discover(exec, selectedRuntime = null) {
    const sessionId = validSession(exec.agent?.session?.id)
    const discoveredBinding = await binding(exec)
    const { cwd } = discoveredBinding
    const previous = catalogs.get(sessionId) ?? []
    const catalog = defaultCatalog().map(item => selectedRuntime && item.id !== selectedRuntime ? previous.find(old => old.id === item.id) ?? item : item)
    for (const item of catalog.filter(item => !selectedRuntime || item.id === selectedRuntime)) {
      try {
        if (item.id === 'opencode' && (discoveredBinding.policy.mode !== 'danger-full-access' || !trustedExternalRuntime)) { item.available = false; item.reason = 'This host mode is unsupported: external OpenCode discovery requires an explicitly trusted runtime mode; no project bootstrap was requested.'; continue }
        const driver = await adapter(item.id, { discover: true, exec, binding: discoveredBinding })
        const found = await driver.discover({ cwd, signal: exec.signal, sandboxPolicy: discoveredBinding.policy, trustedExternalRuntime })
        const savedModels = nativeModels.get(`${sessionId}:${item.id}`)
        const models = modelsOf(found.models)
        const cachedNative = ['claude','grok'].includes(item.id) && found.authentication?.source === 'version-only' && savedModels?.backendIdentity === (driver.backendIdentity ?? item.id) && savedModels.cwd === cwd && savedModels.version === safeText(found.version,100) ? savedModels : null
        if (!models.length && cachedNative) models.push(...cachedNative.models)
        Object.assign(item, { available: found.available === true, authenticated: found.authenticated === true ? true : found.authenticated === false ? false : null,
          version: safeText(found.version, 100), reason: safeText(found.reason, 500),
          models,
          capabilities: { ...safeData(driver.capabilities ?? {}), ...safeData(found.capabilities ?? {}), ...Object.fromEntries(Object.keys(capabilities).map(key => [key, typeof found.capabilities?.[key] === 'boolean' ? found.capabilities[key] : driver.capabilities?.[key] === true])) },
          authentication: safeData(found.authentication ?? null), providerAuthentication: safeText(found.providerAuthentication ?? 'unverified', 100), limitations: safeData(found.limitations ?? driver.capabilities?.limitations ?? []), sandbox: safeData(found.sandbox ?? driver.capabilities?.sandbox ?? null) })
        if (cachedNative) { Object.assign(item.capabilities, cachedNative.capabilities, { models: models.length > 0 }); item.modelCatalog = cachedNative.modelCatalog }
        else item.modelCatalog = found.modelCatalog?.status === 'failed' ? {status:'failed',fetchedAt:null,expiresAt:null,source:'native-discovery',truncated:false,error:safeText(found.modelCatalog.error,1000)} : found.authentication?.source === 'version-only' ? {status:'not-loaded',fetchedAt:null,expiresAt:null,source:'version-only',truncated:false} : catalogInfo(found.models, 'native-discovery')
      } catch (error) { if (error.code === 'AGENTS_CLEANUP_UNCONFIRMED') { if (!running.has(sessionId)) store.quarantine(sessionId, error.message, item.id); throw error }; item.available = false; item.reason = safeText(error.message, 500) }
    }
    catalogs.set(sessionId, catalog)
    return snapshot(sessionId)
  }
  function catalogInfo(models, source) {
    return {status:'fresh', fetchedAt:new Date(now()).toISOString(), expiresAt:new Date(now()+modelTtlMs).toISOString(), source, truncated:Array.isArray(models) && models.length > 2000, accessVerified:false}
  }
  async function models(args, exec) {
    if (!args || !RUNTIMES.includes(args.runtime) || args.scope !== store.scope) throw fail('AGENTS_STALE', 'Model discovery requires the current profile scope and runtime.')
    const runtime = args.runtime, sessionId = validSession(exec.agent?.session?.id)
    if (preparing.has(sessionId) || starting.has(sessionId) || running.has(sessionId) || inspecting.has(sessionId) || store.hasLock(sessionId)) throw fail('AGENTS_BUSY', 'A runtime operation already owns this session.')
    const controller = new AbortController()
    let settle; const settlement = new Promise(resolve => { settle = resolve })
    const signal = exec.signal ? AbortSignal.any([exec.signal, controller.signal]) : controller.signal
    const handle = {runtime, controller, settlement, state:'waiting_permission'}
    preparing.set(sessionId, handle)
    let operationId, retained = false
    try {
      operationId = store.claimOperation(sessionId, runtime)
      const boundExec = {...exec, signal}, initial = await binding(boundExec)
      const driver = await adapter(runtime, {discover:false, exec:boundExec, binding:initial})
      const identity = driver.backendIdentity ?? runtime
      const assertLive = async () => {
        signal.throwIfAborted()
        const current = await binding(boundExec)
        const currentDriver = await adapter(runtime, {discover:false, exec:boundExec, binding:current})
        signal.throwIfAborted()
        if (preparing.get(sessionId) !== handle || current.cwd !== initial.cwd || JSON.stringify(current.policy) !== JSON.stringify(initial.policy) || (currentDriver.backendIdentity ?? runtime) !== identity) throw fail('AGENTS_BINDING', 'Runtime configuration or host policy changed during model discovery.')
      }
      if (runtime === 'opencode' && (initial.policy.mode !== 'danger-full-access' || !trustedExternalRuntime)) throw fail('AGENTS_SANDBOX', 'OpenCode model discovery requires explicitly trusted external runtime mode; no settings were changed.')
      signal.throwIfAborted()
      const outcome = await approve(boundExec, {title:`Read ${runtime} model catalog`, details:`Runtime: ${runtime}\nDirectory: ${initial.cwd}\nStart the native runtime only to read its advertised model catalog. No task prompt, login or credential creation is requested. Initialization may read native configuration, run managed hooks, maintain native state or contact services. The same host file-effect policy applies. Listed models do not prove account access, quota or billing eligibility.\n读取模型目录；原生初始化可能加载配置、运行托管 hooks 或维护原生状态。不发送任务，不登录；列表不代表账户可调用。`}, signal)
      if (outcome !== true && outcome !== 'allowed-once') throw fail('AGENTS_APPROVAL', 'Model catalog initialization was not approved.')
      await assertLive(); handle.state = 'discovering'
      const found = await (driver.discoverModels ?? driver.discover).call(driver, {cwd:initial.cwd, signal, sandboxPolicy:initial.policy, trustedExternalRuntime})
      await assertLive()
      if (!found || found.available !== true || !Array.isArray(found.models) || found.modelCatalog?.status === 'failed') throw fail('AGENTS_SETUP', found?.reason || 'The native model catalog is unavailable.')
      const catalog = catalogs.get(sessionId) ?? defaultCatalog(), item = catalog.find(item => item.id === runtime)
      const advertised = modelsOf(found.models), modelCatalog = catalogInfo(found.models, found.modelCatalog?.source ?? 'native-initialization')
      Object.assign(item, {available:true, version:safeText(found.version,100), authenticated:found.authenticated === true ? true : found.authenticated === false ? false : null,
        models:advertised, modelCatalog, reason:safeText(found.reason,500), authentication:safeData(found.authentication ?? null),
        capabilities:{...safeData(driver.capabilities ?? {}), ...safeData(found.capabilities ?? {}), models:advertised.length>0},
        providerAuthentication:safeText(found.providerAuthentication ?? 'unverified',100), limitations:safeData(found.limitations ?? driver.capabilities?.limitations ?? [])})
      catalogs.set(sessionId,catalog)
      if (['claude','grok'].includes(runtime)) nativeModels.set(`${sessionId}:${runtime}`, {backendIdentity:identity,cwd:initial.cwd,version:safeText(found.version,100),models:advertised,capabilities:item.capabilities,modelCatalog})
    } catch (error) {
      retained = error.code === 'AGENTS_CLEANUP_UNCONFIRMED'
      const catalog = catalogs.get(sessionId) ?? defaultCatalog(), item = catalog.find(item => item.id === runtime)
      item.modelCatalog = {...(item.modelCatalog ?? {fetchedAt:null,expiresAt:null,source:'native-initialization',truncated:false}),status:'failed',error:safeText(error.message,1000)}
      catalogs.set(sessionId,catalog)
      const cached = nativeModels.get(`${sessionId}:${runtime}`)
      if (cached) cached.modelCatalog = item.modelCatalog
      throw error
    } finally {
      try { if (operationId && !retained) store.releaseOperation(sessionId,operationId) }
      finally { preparing.delete(sessionId); settle() }
    }
    return {...snapshot(sessionId), modelRuntime:runtime}
  }
  async function inspect(exec) {
    const sessionId = validSession(exec.agent?.session?.id)
    if (preparing.has(sessionId) || starting.has(sessionId) || running.has(sessionId) || inspecting.has(sessionId) || store.hasLock(sessionId)) return snapshot(sessionId)
    const controller = new AbortController()
    let settle; const settlement = new Promise(resolve => { settle = resolve })
    const signal = exec.signal ? AbortSignal.any([exec.signal, controller.signal]) : controller.signal
    inspecting.set(sessionId, { controller, settlement })
    try { return await discover({ ...exec, signal }) } finally { inspecting.delete(sessionId); settle() }
  }
  async function run(args, exec) {
    const sessionId = validSession(exec.agent?.session?.id)
    if (preparing.has(sessionId) || starting.has(sessionId) || running.has(sessionId) || inspecting.has(sessionId)) throw fail('AGENTS_BUSY', 'A runtime operation already owns this session.')
    const controller = new AbortController()
    let settle; const settlement = new Promise(resolve => { settle = resolve })
    starting.set(sessionId, { controller, settlement })
    try { return await runOwned(args, { ...exec, signal: exec.signal ? AbortSignal.any([exec.signal, controller.signal]) : controller.signal }) }
    finally { starting.delete(sessionId); settle() }
  }
  async function runOwned(args, exec) {
    validateRun(args)
    args = Object.freeze(Object.fromEntries(['runtime','prompt','model','taskId','expectedRevision','scope','readOnly'].filter(key => args[key] !== undefined).map(key => [key, args[key]])))
    // This is a per-run restriction, not a mutation of the host's standing
    // policy. Every adapter creation and discovery inherits the bound value.
    exec = { ...exec, readOnly: args.readOnly === true }
    const sessionId = validSession(exec.agent?.session?.id)
    if (running.has(sessionId) || inspecting.has(sessionId)) throw fail('AGENTS_BUSY', 'This session already has an external run.')
    const initial = await binding(exec)
    const initialDriver = await adapter(args.runtime, { discover: false, exec, binding: initial })
    const backendIdentity = initialDriver.backendIdentity ?? args.runtime
    const claimed = store.claim(sessionId, { taskId: args.taskId, expectedRevision: args.expectedRevision, expectedScope: args.scope, runtime: args.runtime, model: args.model, prompt: args.prompt, cwd: initial.cwd, backendIdentity })
    const { id: taskId, runId, nativeSessionId } = claimed.task
    const controller = new AbortController()
    const abort = () => controller.abort(exec.signal?.reason ?? new Error('Cancelled'))
    exec.signal?.addEventListener('abort', abort, { once: true }); if (exec.signal?.aborted) abort()
    let settled; const settlement = new Promise(resolve => { settled = resolve })
    const handle = { controller, taskId, runId, requests: new Set(), settlement };  running.set(sessionId, handle)
    let retained = false
    const record = event => store.event(sessionId, taskId, runId, event)
    const state = (next, fields) => store.state(sessionId, taskId, runId, next, fields)
    async function assertLive() {
      controller.signal.throwIfAborted()
      const current = await binding(exec)
      if (running.get(sessionId) !== handle || current.cwd !== initial.cwd || JSON.stringify(current.hostPolicy) !== JSON.stringify(initial.hostPolicy) || JSON.stringify(current.policy) !== JSON.stringify(initial.policy)) throw fail('AGENTS_BINDING', 'Working directory or host policy changed; no further action is permitted.')
      const stored = store.read(sessionId).task
      if (stored?.id !== taskId || stored.runId !== runId || !ACTIVE.has(stored.state)) throw fail('AGENTS_STALE', 'This native request no longer owns the current task.')
    }
    function takeRequest(request, kind) {
      if (!request || typeof request.id !== 'string' || !request.id || request.id.length > 256) throw fail('AGENTS_REQUEST', 'Invalid native request identity.')
      const key = `${kind}:${request.id}`
      if (handle.requests.has(key)) throw fail('AGENTS_REPLAY', 'Repeated native request was rejected.')
      handle.requests.add(key)
      const current = store.read(sessionId).task
      if (request.nativeSessionId !== current.nativeSessionId) throw fail('AGENTS_BINDING', 'Native request belongs to another session.')
      return key
    }
    try {
      if (args.readOnly && args.runtime === 'opencode') throw fail('AGENTS_EXTERNAL_POLICY', 'Read-only review cannot confine an external OpenCode service. Choose a supported local runtime; no host settings were changed.')
      const discovery = await discover({ ...exec, signal: controller.signal }, args.runtime)
      const available = discovery.catalog.find(item => item.id === args.runtime)
      const deferredNative = ['claude','grok'].includes(args.runtime) && available?.authenticated === null && available?.authentication?.state === 'requires-native-initialization' && available.authentication.source === 'version-only'
      if (!available?.available || (!available.authenticated && !deferredNative)) throw fail('AGENTS_SETUP', available?.reason || 'Runtime authentication or setup has not been verified.')
      if (args.model && !available.models.some(model => model.id === args.model)) throw fail('AGENTS_MODEL', 'The selected model is not advertised by this runtime.')
      if (args.runtime === 'opencode' && (initial.policy.mode !== 'danger-full-access' || !trustedExternalRuntime)) throw fail('AGENTS_EXTERNAL_POLICY', 'This host mode cannot confine an external OpenCode HTTP service. This execution mode is unsupported here; no host settings were changed.')
      state('waiting_permission', { readOnly: args.readOnly === true })
      record({ type: 'permission', text: `Start ${args.runtime} in ${initial.cwd}. DSH coordinates; the external native agent executes.`, data: { phase: 'launch', runtime: args.runtime, model: args.model ?? null, cwd: initial.cwd, nativeSessionId, policy: initial.policy.mode } })
      const launchAllowed = await approve(exec, { title: `Run ${args.runtime}`, details: `Runtime: ${args.runtime}\nDirectory: ${initial.cwd}\nModel: ${args.model ?? 'native default'}\nAuthentication: ${deferredNative ? `Not checked. Approved startup initializes ${args.runtime} native configuration. Native managed hooks or startup maintenance may run; Grok may refresh credentials, sync plugins or maintain native worktrees. No login or credential creation is performed by this plugin.` : available.providerAuthentication}\nTask: ${safeText(args.prompt, 1200)}\n${args.readOnly ? 'This turn requires read-only file confinement. All native permission escalation requests are denied. Host settings remain unchanged. This does not claim network or secret-read isolation.' : args.runtime === 'opencode' ? 'This explicitly configured external service applies its own permissions. DSH does not sandbox its process. This is not a blanket grant for future native permission requests.' : 'Native requests remain subject to individual approval. The host file-effect policy applies; it does not claim network or secret-read isolation.'}` }, controller.signal)
      await assertLive()
      if (launchAllowed !== true && launchAllowed !== 'allowed-once') { state('blocked', { reason: 'Launch approval was declined.' }); return snapshot(sessionId) }
      state('running')
      const driver = await adapter(args.runtime, { discover: false, exec, binding: initial })
      if ((driver.backendIdentity ?? args.runtime) !== backendIdentity) throw fail('AGENTS_BINDING', 'Runtime backend configuration changed during approval.')
      await assertLive()
      await beforeDispatch?.(exec)
      await assertLive()
      const result = await driver.run({ prompt: args.prompt.trim(), model: args.model, cwd: initial.cwd, nativeSessionId, signal: controller.signal,
        sandboxPolicy: initial.policy, trustedExternalRuntime,
        onEvent: async event => {
          await assertLive(); record(event)
          if (['claude','grok'].includes(args.runtime) && event.type === 'session' && event.data?.nativeSessionId && Array.isArray(event.data.models)) {
            const models = modelsOf(event.data.models)
            const observed = Object.fromEntries(Object.keys(capabilities).filter(key => typeof event.data.capabilities?.[key] === 'boolean').map(key => [key, event.data.capabilities[key]]))
            const modelCatalog = catalogInfo(event.data.models, 'native-session')
            nativeModels.set(`${sessionId}:${args.runtime}`, { backendIdentity, cwd: initial.cwd, version: available.version, models, capabilities: observed, modelCatalog })
            const catalog = catalogs.get(sessionId)?.find(item => item.id === args.runtime)
            if (catalog) { catalog.modelCatalog = modelCatalog; catalog.models = models; Object.assign(catalog.capabilities, observed, { models: models.length > 0 }) }
          }
        },
        requestPermission: async request => {
          await assertLive(); takeRequest(request, 'permission')
          if (args.readOnly) { record({ type: 'permission', text: 'Read-only review cannot grant native permission escalation; denied.', data: { id: request.id, phase: 'denied' } }); return { optionId: null } }
          const once = request.options?.filter(option => option.kind === 'allow_once')
          record({ type: 'permission', text: safeText(request.title), data: { ...request, phase: 'requested' } })
          if (!Array.isArray(once) || once.length !== 1) { record({ type: 'permission', text: 'No unambiguous one-time grant is available; denied.', data: { id: request.id, phase: 'denied' } }); return { optionId: null } }
          if (handle.awaiting) throw fail('AGENTS_REQUEST_BUSY', 'Another native request is awaiting an answer.')
          const detail = typeof request.details === 'string' ? request.details : JSON.stringify(request.details ?? {})
          const presented = typeof request.details === 'string' ? safeText(detail, 6000) : JSON.stringify(safeData(request.details ?? {}))
          if (request.scopeComplete === false || detail.length > 6000 || presented !== detail) { record({ type: 'permission', text: 'Permission scope is incomplete or sensitive; denied.' }); return { optionId: null } }
          const requestSignal = request.signal ? AbortSignal.any([controller.signal, request.signal]) : controller.signal
          requestSignal.throwIfAborted()
          handle.awaiting = request.id
          state('waiting_permission')
          let outcome = false
          try { outcome = await approve(exec, { title: request.title, details: `${typeof request.details === 'object' ? JSON.stringify(request.details, null, 2) : presented}\nNative request: ${request.id}\nOne-time choice: ${safeText(once[0].label, 300)}` }, requestSignal); requestSignal.throwIfAborted(); await assertLive() }
          finally { handle.awaiting = null; if (!controller.signal.aborted && ACTIVE.has(store.read(sessionId).task?.state)) state('running') }
          const allowed = outcome === true || outcome === 'allowed-once'
          const rejects = request.options.filter(option => option.kind === 'reject_once')
          const rejection = rejects.find(option => option.id === request.defaultRejectOptionId) ?? (rejects.length === 1 ? rejects[0] : undefined)
          const optionId = allowed ? once[0].id : (outcome === false || outcome === 'rejected') ? rejection?.id ?? null : null
          record({ type: 'permission', text: allowed ? 'Allowed once' : 'Declined', data: { id: request.id, nativeSessionId: request.nativeSessionId ?? nativeSessionId, phase: 'answered', optionId } })
          return { optionId }
        },
        requestInput: async request => {
          await assertLive(); takeRequest(request, 'input')
          if (!askInput || !Array.isArray(request.questions) || request.questions.length > 6 || /password|secret|api.?key|token|credential|密码|密钥/i.test(JSON.stringify(request.questions))) {
            record({ type: 'input', text: 'This input request requires unsupported or secure input; it was not answered.' }); return null
          }
          if (handle.awaiting) throw fail('AGENTS_REQUEST_BUSY', 'Another native request is awaiting an answer.')
          const requestSignal = request.signal ? AbortSignal.any([controller.signal, request.signal]) : controller.signal
          requestSignal.throwIfAborted(); handle.awaiting = request.id
          record({ type: 'input', text: safeText(request.title), data: { id: request.id, phase: 'requested', questions: request.questions } }); state('waiting_input')
          try { const answer = await askInput(exec, request.questions, requestSignal); requestSignal.throwIfAborted(); await assertLive(); if (JSON.stringify(safeData(answer)) !== JSON.stringify(answer)) throw fail('AGENTS_SECRET', 'Sensitive answers require the vendor secure input flow.'); record({ type: 'input', text: 'Input answered', data: { id: request.id, phase: 'answered' } }); return answer }
          finally { handle.awaiting = null; if (!controller.signal.aborted && ACTIVE.has(store.read(sessionId).task?.state)) state('running') }
        },
      })
      if (!['completed','cancelled','blocked','failed'].includes(result?.status)) throw fail('AGENTS_RESULT', 'Runtime returned an unsupported terminal state.')
      if (args.readOnly && result.status === 'completed' && (typeof result.summary !== 'string' || result.summary.length > 12_000 || safeText(result.summary, 12_000) !== result.summary)) throw fail('AGENTS_RESULT', 'Read-only review output was incomplete, oversized, or sensitive; no successful review was recorded.')
      if (result.nativeSessionId && store.read(sessionId).task.nativeSessionId !== result.nativeSessionId) record({ type: 'session', data: { nativeSessionId: result.nativeSessionId } })
      state(result.status, { summary: safeText(result.summary, 12000), reason: safeText(result.reason, 2000) || null })
    } catch (error) {
      retained = error.code === 'AGENTS_CLEANUP_UNCONFIRMED'
      state(retained ? 'interrupted' : controller.signal.aborted ? 'cancelled' : 'blocked', { reason: safeText(error.message, 2000), summary: '' })
    } finally {
      exec.signal?.removeEventListener('abort', abort)
      if (running.get(sessionId) === handle) running.delete(sessionId)
      try { if (!retained) store.release(sessionId, taskId, runId) } finally { settled() }
    }
    return snapshot(sessionId)
  }
  function cancel(args) {
    const snap = snapshot(args.sessionId), handle = running.get(args.sessionId)
    if (args.scope !== store.scope || args.taskId !== snap.task?.id || (args.runId !== undefined ? args.runId !== snap.task?.runId : args.expectedRevision !== snap.revision) || !handle || handle.taskId !== args.taskId) throw fail('AGENTS_STALE', 'The run changed. Refresh before cancelling.')
    store.event(args.sessionId, handle.taskId, handle.runId, { type: 'status', text: 'Cancellation requested; waiting for native process quiescence.' })
    handle.controller.abort(new Error('Cancelled by the user'))
    return snapshot(args.sessionId)
  }
  return { snapshot, inspect, models, run, cancel, isRunning: sessionId => preparing.has(sessionId) || starting.has(sessionId) || running.has(sessionId) || inspecting.has(sessionId), dispose: async () => { const handles = [...preparing.values(), ...running.values(), ...inspecting.values(), ...starting.values()]; for (const run of handles) run.controller.abort(new Error('Plugin unloaded')); await Promise.all(handles.map(run => run.settlement)) } }
}
