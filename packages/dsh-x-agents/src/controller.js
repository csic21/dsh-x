import { realpathSync } from 'node:fs'
import path from 'node:path'
import { ACTIVE, fail, safeText, safeData, validSession } from './store.js'

const capabilities = Object.fromEntries(['nativeSessions','resume','streaming','tools','plans','permissions','input','usage','cancel','models','authDiscovery'].map(key => [key, false]))
export const defaultCatalog = () => ['codex','opencode','claude','grok'].map(id => ({ id, label: { codex: 'Codex', opencode: 'OpenCode', claude: 'Claude', grok: 'Grok' }[id], transport: id === 'codex' ? 'app-server' : id === 'opencode' ? 'http-sse' : 'not-integrated', available: ['codex','opencode'].includes(id) ? null : false, authenticated: null, version: null, reason: ['codex','opencode'].includes(id) ? 'not-inspected' : 'not-integrated', models: [], capabilities: { ...capabilities } }))
export function validateRun(args) {
  if (!args || !['codex', 'opencode'].includes(args.runtime)) throw fail('AGENTS_RUNTIME', 'Choose Codex or OpenCode; other runtimes are not integrated yet.')
  if (typeof args.prompt !== 'string' || !args.prompt.trim() || args.prompt.length > 12000) throw fail('AGENTS_PROMPT', 'A task prompt of 1–12000 characters is required.')
  if (safeText(args.prompt, 12000) !== args.prompt) throw fail('AGENTS_SECRET', 'Potential credentials must not be sent in task prompts. Use the vendor setup flow.')
  if (args.model !== undefined && (typeof args.model !== 'string' || !args.model.trim() || args.model.length > 160)) throw fail('AGENTS_MODEL', 'Invalid model identifier.')
  if (args.taskId !== undefined && (typeof args.taskId !== 'string' || !Number.isSafeInteger(args.expectedRevision) || typeof args.scope !== 'string')) throw fail('AGENTS_STALE', 'Continuing requires the exact task, revision and profile scope.')
}
export function createAgentsController({ store, adapter, cwdOf, policyOf, approve, askInput, trustedExternalRuntime = false }) {
  const running = new Map(), catalogs = new Map(), inspecting = new Map(), starting = new Map()
  const binding = async exec => {
    const cwd = realpathSync(await cwdOf(exec))
    const policy = policyOf(exec)
    if (!policy || !['read-only','workspace-write','danger-full-access'].includes(policy.mode) || !path.isAbsolute(policy.workspaceRoot ?? '')) throw fail('AGENTS_POLICY', 'The host file-effect policy is unavailable.')
    const root = realpathSync(policy.workspaceRoot)
    const relative = path.relative(root, cwd)
    if (policy.mode !== 'danger-full-access' && (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative))) throw fail('AGENTS_POLICY', 'Task directory is outside the host workspace boundary.')
    return { cwd, policy: { ...policy, workspaceRoot: root } }
  }
  function snapshot(sessionId) {
    validSession(sessionId)
    const value = store.snapshot(sessionId), task = value.task
    if (task) {
      delete task.hostId
      task.cancellationRequested = running.get(sessionId)?.controller.signal.aborted === true
      task.allowedActions = ACTIVE.has(task.state) && running.has(sessionId) ? (task.cancellationRequested ? [] : ['cancel'])
        : task.state === 'interrupted' || store.hasLock(sessionId) ? ['inspect']
        : task.nativeSessionId ? ['request-start','request-continue','inspect'] : ['request-start','inspect']
    }
    return { scope: store.scope, sessionId, revision: value.revision, catalog: catalogs.get(sessionId) ?? defaultCatalog(), task, history: value.history }
  }
  async function discover(exec) {
    const sessionId = validSession(exec.agent?.session?.id)
    const discoveredBinding = await binding(exec)
    const { cwd } = discoveredBinding
    const catalog = defaultCatalog()
    for (const item of catalog.filter(item => ['codex','opencode'].includes(item.id))) {
      try {
        if (item.id === 'opencode' && (discoveredBinding.policy.mode !== 'danger-full-access' || !trustedExternalRuntime)) { item.available = false; item.reason = 'This host mode is unsupported: external OpenCode discovery requires an explicitly trusted runtime mode; no project bootstrap was requested.'; continue }
        const driver = await adapter(item.id, { discover: true, exec, binding: discoveredBinding })
        const found = await driver.discover({ cwd, signal: exec.signal, sandboxPolicy: discoveredBinding.policy, trustedExternalRuntime })
        Object.assign(item, { available: found.available === true, authenticated: found.authenticated === true ? true : found.authenticated === false ? false : null,
          version: safeText(found.version, 100), reason: safeText(found.reason, 500),
          models: Array.isArray(found.models) ? found.models.slice(0, 100).map(model => ({ id: safeText(model.id, 160), label: safeText(model.label ?? model.id, 160) })) : [],
          capabilities: { ...safeData(driver.capabilities ?? {}), ...safeData(found.capabilities ?? {}), ...Object.fromEntries(Object.keys(capabilities).map(key => [key, typeof found.capabilities?.[key] === 'boolean' ? found.capabilities[key] : driver.capabilities?.[key] === true])) },
          providerAuthentication: safeText(found.providerAuthentication ?? 'unverified', 100), limitations: safeData(found.limitations ?? driver.capabilities?.limitations ?? []), sandbox: safeData(found.sandbox ?? driver.capabilities?.sandbox ?? null) })
      } catch (error) { if (error.code === 'AGENTS_CLEANUP_UNCONFIRMED') { if (!running.has(sessionId)) store.quarantine(sessionId, error.message); throw error }; item.available = false; item.reason = safeText(error.message, 500) }
    }
    catalogs.set(sessionId, catalog)
    return snapshot(sessionId)
  }
  async function inspect(exec) {
    const sessionId = validSession(exec.agent?.session?.id)
    if (starting.has(sessionId) || running.has(sessionId) || inspecting.has(sessionId) || store.hasLock(sessionId)) return snapshot(sessionId)
    const controller = new AbortController()
    let settle; const settlement = new Promise(resolve => { settle = resolve })
    const signal = exec.signal ? AbortSignal.any([exec.signal, controller.signal]) : controller.signal
    inspecting.set(sessionId, { controller, settlement })
    try { return await discover({ ...exec, signal }) } finally { inspecting.delete(sessionId); settle() }
  }
  async function run(args, exec) {
    const sessionId = validSession(exec.agent?.session?.id)
    if (starting.has(sessionId) || running.has(sessionId) || inspecting.has(sessionId)) throw fail('AGENTS_BUSY', 'A runtime operation already owns this session.')
    const controller = new AbortController()
    let settle; const settlement = new Promise(resolve => { settle = resolve })
    starting.set(sessionId, { controller, settlement })
    try { return await runOwned(args, { ...exec, signal: exec.signal ? AbortSignal.any([exec.signal, controller.signal]) : controller.signal }) }
    finally { starting.delete(sessionId); settle() }
  }
  async function runOwned(args, exec) {
    validateRun(args)
    args = Object.freeze(Object.fromEntries(['runtime','prompt','model','taskId','expectedRevision','scope'].filter(key => args[key] !== undefined).map(key => [key, args[key]])))
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
      if (running.get(sessionId) !== handle || current.cwd !== initial.cwd || JSON.stringify(current.policy) !== JSON.stringify(initial.policy)) throw fail('AGENTS_BINDING', 'Working directory or host policy changed; no further action is permitted.')
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
      const discovery = await discover({ ...exec, signal: controller.signal })
      const available = discovery.catalog.find(item => item.id === args.runtime)
      if (!available?.available || !available.authenticated) throw fail('AGENTS_SETUP', available?.reason || 'Runtime authentication or setup has not been verified.')
      if (args.model && !available.models.some(model => model.id === args.model)) throw fail('AGENTS_MODEL', 'The selected model is not advertised by this runtime.')
      if (args.runtime === 'opencode' && (initial.policy.mode !== 'danger-full-access' || !trustedExternalRuntime)) throw fail('AGENTS_EXTERNAL_POLICY', 'This host mode cannot confine an external OpenCode HTTP service. This execution mode is unsupported here; no host settings were changed.')
      state('waiting_permission')
      record({ type: 'permission', text: `Start ${args.runtime} in ${initial.cwd}. DSH coordinates; the external native agent executes.`, data: { phase: 'launch', runtime: args.runtime, model: args.model ?? null, cwd: initial.cwd, nativeSessionId, policy: initial.policy.mode } })
      const launchAllowed = await approve(exec, { title: `Run ${args.runtime}`, details: `Runtime: ${args.runtime}\nDirectory: ${initial.cwd}\nModel: ${args.model ?? 'native default'}\nTask: ${safeText(args.prompt, 1200)}\n${args.runtime === 'opencode' ? 'This explicitly configured external service applies its own permissions. DSH does not sandbox its process. This is not a blanket grant for future native permission requests.' : 'Native requests remain subject to individual approval. The host file-effect policy applies; it does not claim network or secret-read isolation.'}` }, controller.signal)
      await assertLive()
      if (launchAllowed !== true && launchAllowed !== 'allowed-once') { state('blocked', { reason: 'Launch approval was declined.' }); return snapshot(sessionId) }
      state('running')
      const driver = await adapter(args.runtime, { discover: false, exec, binding: initial })
      if ((driver.backendIdentity ?? args.runtime) !== backendIdentity) throw fail('AGENTS_BINDING', 'Runtime backend configuration changed during approval.')
      await assertLive()
      const result = await driver.run({ prompt: args.prompt.trim(), model: args.model, cwd: initial.cwd, nativeSessionId, signal: controller.signal,
        sandboxPolicy: initial.policy, trustedExternalRuntime,
        onEvent: async event => { await assertLive(); record(event) },
        requestPermission: async request => {
          await assertLive(); takeRequest(request, 'permission')
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
  return { snapshot, inspect, run, cancel, isRunning: sessionId => starting.has(sessionId) || running.has(sessionId) || inspecting.has(sessionId), dispose: async () => { const handles = [...running.values(), ...inspecting.values(), ...starting.values()]; for (const run of handles) run.controller.abort(new Error('Plugin unloaded')); await Promise.all(handles.map(run => run.settlement)) } }
}
