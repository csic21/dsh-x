import { readSnapshot, parseAddress, PROTOCOL } from './model.js'

const empty = () => ({ status: 'loading', snapshot: null, error: null, pending: false })
const errorOf = (code, message = '') => ({ code: typeof code === 'string' && /^[A-Za-z0-9/_-]{1,160}$/.test(code) ? code : 'agents/unavailable', message: typeof message === 'string' ? message.slice(0, 2000) : '' })
function abortable(call, signal) {
  return new Promise((resolve, reject) => {
    const aborted = () => { signal.removeEventListener('abort', aborted); reject(errorOf('agents/connection')) }
    if (signal.aborted) { aborted(); return }
    signal.addEventListener('abort', aborted, { once: true })
    try {
      Promise.resolve(call()).then(value => { signal.removeEventListener('abort', aborted); resolve(value) }, error => { signal.removeEventListener('abort', aborted); reject(error) })
    } catch (error) { signal.removeEventListener('abort', aborted); reject(error) }
  })
}

export function createAgentsController(rpc, { documentObject = globalThis.document, pollMs = 1000, hiddenMs = 10000, timeoutMs = 12000 } = {}) {
  const entries = new Map()
  let disposed = false, generation = 0, scope = null
  const publish = (entry, patch) => { entry.state = { ...entry.state, ...patch }; for (const listener of [...entry.listeners]) listener() }
  const cancelRead = entry => { clearTimeout(entry.timer); entry.timer = null; entry.request?.abort(); entry.request = null }
  const schedule = (entry, delay = documentObject?.hidden ? hiddenMs : pollMs) => {
    if (!disposed && entry.listeners.size) { clearTimeout(entry.timer); entry.timer = setTimeout(() => { void read(entry) }, delay) }
  }
  const reset = () => {
    generation++; scope = null
    for (const entry of entries.values()) {
      cancelRead(entry); entry.action?.abort(); entry.action = null
      publish(entry, empty()); schedule(entry, 0)
    }
  }
  const adopt = (entry, raw) => {
    const snapshot = readSnapshot(raw, entry.sessionId)
    if (!snapshot) throw errorOf('agents/invalid-snapshot')
    if (scope !== null && snapshot.scope !== scope) { reset(); return false }
    scope = snapshot.scope
    if (entry.state.snapshot && snapshot.revision < entry.state.snapshot.revision) return false
    publish(entry, { status: 'live', snapshot, error: null })
    return true
  }
  async function read(entry) {
    if (disposed || !entry.listeners.size || entry.request) return
    const request = new AbortController(), epoch = generation
    entry.request = request
    const timeout = setTimeout(() => {
      if (!disposed && epoch === generation && entry.request === request) publish(entry, { status: 'failed', error: errorOf('agents/connection') })
      request.abort()
    }, timeoutMs)
    try {
      const result = await abortable(() => rpc.call('/api', 'agents/snapshot', { sessionId: entry.sessionId }, request.signal), request.signal)
      if (disposed || request.signal.aborted || epoch !== generation || entry.request !== request) return
      if (!result?.ok) throw result?.error ?? errorOf('agents/unavailable')
      adopt(entry, result.value)
    } catch (error) {
      if (!disposed && epoch === generation && entry.request === request) publish(entry, { status: 'failed', error: errorOf(error?.code ?? 'agents/connection', error?.message ?? '') })
    } finally {
      clearTimeout(timeout)
      if (entry.request === request) { entry.request = null; schedule(entry) }
    }
  }
  const entryFor = sessionId => {
    if (!entries.has(sessionId)) {
      const entry = { sessionId, state: empty(), listeners: new Set(), request: null, timer: null, action: null }
      entry.source = {
        getSnapshot: () => entry.state,
        subscribe(listener) {
          entry.listeners.add(listener)
          if (entry.listeners.size === 1) { publish(entry, empty()); void read(entry) }
          return () => { entry.listeners.delete(listener); if (!entry.listeners.size) { cancelRead(entry); entry.state = empty() } }
        },
      }
      entries.set(sessionId, entry)
    }
    return entries.get(sessionId)
  }
  const refresh = sessionId => { const entry = entryFor(sessionId); cancelRead(entry); void read(entry) }
  async function cancel(sessionId, target) {
    const entry = entryFor(sessionId), current = entry.state.snapshot
    if (disposed || entry.action || entry.state.status !== 'live' || !current || current.scope !== target.scope || current.task?.id !== target.taskId || !target.runId || current.task?.runId !== target.runId || !current.task.allowedActions.includes('cancel')) return { ok: false, error: errorOf('agents/stale-action') }
    const action = new AbortController(), epoch = generation
    entry.action = action
    publish(entry, { pending: true, error: null })
    const timeout = setTimeout(() => action.abort(), timeoutMs)
    try {
      const result = await abortable(() => rpc.call('/api', 'agents/cancel', { ...target, sessionId }, action.signal), action.signal)
      if (disposed || epoch !== generation || action.signal.aborted) return { ok: false, error: errorOf('agents/cancel-unconfirmed') }
      if (!result?.ok) throw result?.error ?? errorOf('agents/cancel-unconfirmed')
      adopt(entry, result.value)
      return { ok: true }
    } catch (error) {
      const failure = errorOf(action.signal.aborted ? 'agents/cancel-unconfirmed' : error?.code ?? 'agents/cancel-unconfirmed', error?.message ?? '')
      if (!disposed && epoch === generation) publish(entry, { error: failure })
      return { ok: false, error: failure }
    } finally {
      clearTimeout(timeout)
      if (entry.action === action) { entry.action = null; publish(entry, { pending: false }); refresh(sessionId) }
    }
  }
  function visibilityChanged() { for (const entry of entries.values()) if (entry.listeners.size) { clearTimeout(entry.timer); if (!entry.request) schedule(entry, 0) } }
  documentObject?.addEventListener('visibilitychange', visibilityChanged)
  return {
    source: sessionId => entryFor(sessionId).source, refresh, reset, cancel,
    resource: {
      protocol: PROTOCOL,
      async *open(address, { signal }) {
        const target = parseAddress(address)
        if (!target) { yield { ok: true, value: { status: 'invalid-address', snapshot: null, error: null, pending: false } }; return }
        const source = entryFor(target.sessionId).source
        let wake, changed = true
        const notify = () => { changed = true; wake?.(); wake = null }
        const unsubscribe = source.subscribe(notify)
        signal.addEventListener('abort', notify, { once: true })
        try {
          while (!signal.aborted && !disposed) {
            if (!changed) await new Promise(resolve => { wake = resolve; if (changed || signal.aborted) resolve() })
            if (signal.aborted || disposed) return
            changed = false
            const state = source.getSnapshot()
            yield { ok: true, value: state.snapshot && state.snapshot.scope !== target.scope ? { ...empty(), status: 'scope-changed' } : state }
          }
        } finally { unsubscribe(); signal.removeEventListener('abort', notify) }
      },
    },
    dispose() {
      disposed = true; generation++
      documentObject?.removeEventListener('visibilitychange', visibilityChanged)
      for (const entry of entries.values()) { cancelRead(entry); entry.action?.abort(); publish(entry, empty()); entry.listeners.clear() }
      entries.clear()
    },
  }
}
