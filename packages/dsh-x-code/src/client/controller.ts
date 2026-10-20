import type { CodeSnapshot, CodeReview, CodeSource } from './model.ts'
export interface CodeProblem { code: string, message: string }
export interface CodeState {
  status: string, snapshot: CodeSnapshot | null, error: CodeProblem | null
  file: CodeSource | null, fileStatus: string, fileKey: string | null, fileError: CodeProblem | null
  inspectedReview: CodeReview | null, historyStatus: string, historyError: CodeProblem | null, historyId: string | null, pending: boolean
}
export interface CodeSourceStore { getSnapshot(): CodeState, subscribe(listener: () => void): () => void }
export interface FileTarget { path: string, scope?: string, workspaceId?: string, mode?: string, base?: string, reviewId?: string }
interface Entry {
  sessionId: string, target: { mode: string, base?: string }, state: CodeState, listeners: Set<() => void>
  request: AbortController | null, timer: ReturnType<typeof setTimeout> | null, fileRequest: AbortController | null
  fileTarget: FileTarget | null, historyRequest: AbortController | null, action: AbortController | null, source: CodeSourceStore
  files: Map<string, CodeSource>
}
export interface CodeRpc { call(base: string, endpoint: string, args: Record<string, unknown>, signal: AbortSignal): Promise<{ ok: boolean, value?: unknown, error?: CodeProblem }> }
const errorInfo = (error: unknown): Partial<CodeProblem> => error && typeof error === 'object' ? error : {}
import { readSnapshot, readFile, sameSnapshot } from './model.ts'

export const empty = (): CodeState => ({ status: 'loading', snapshot: null, error: null, file: null, fileStatus: 'idle', fileKey: null, fileError: null, inspectedReview: null, historyStatus: 'idle', historyError: null, historyId: null, pending: false })
/**
 * One workspace generation is one request key: a target carries its scope and
 * workspace/snapshot id, so an entry read again under the same key is the exact
 * content that would be read again. Media that would dominate memory is not kept.
 */
const FILE_CACHE_LIMIT = 12
const fileCacheWeight = (file: CodeSource) => (file.data?.length ?? 0) + (file.beforeData?.length ?? 0)
const cacheFile = (entry: Entry, key: string, file: CodeSource) => {
  entry.files.delete(key)
  if (fileCacheWeight(file) > 2_000_000) return
  entry.files.set(key, file)
  while (entry.files.size > FILE_CACHE_LIMIT) { const oldest = entry.files.keys().next().value; if (oldest === undefined) break; entry.files.delete(oldest) }
}
const problem = (code: unknown, message: unknown = '') => ({ code: typeof code === 'string' ? code : 'code/unavailable', message: typeof message === 'string' ? message : '' })

/** Own all reads per session; late responses cannot cross target or connection generations. */
export function createCodeController(rpc: CodeRpc, { timeoutMs = 12000, pollMs = 4000, documentObject = globalThis.document } = {}) {
  const entries = new Map<string, Entry>()
  let disposed = false, epoch = 0
  const publish = (entry: Entry, patch: Partial<CodeState>) => { entry.state = { ...entry.state, ...patch }; for (const listener of [...entry.listeners]) listener() }
  const stopRead = (entry: Entry) => { clearTimeout(entry.timer ?? undefined); entry.timer = null; entry.request?.abort(); entry.request = null }
  const stopFile = (entry: Entry) => { entry.fileRequest?.abort(); entry.fileRequest = null }
  const schedule = (entry: Entry) => {
    if (!disposed && entry.listeners.size) { clearTimeout(entry.timer ?? undefined); entry.timer = setTimeout(() => { void refreshEntry(entry) }, documentObject?.hidden ? 20000 : pollMs) }
  }
  async function call(endpoint: string, args: Record<string, unknown>, signal: AbortController) {
    let timedOut = false
    const timeout = setTimeout(() => { timedOut = true; signal.abort() }, timeoutMs)
    try {
      const result = await Promise.race([
        rpc.call('/api', endpoint, args, signal.signal),
        new Promise<never>((_, reject) => signal.signal.addEventListener('abort', () => reject(problem(timedOut ? 'code/timeout' : 'code/aborted')), { once: true })),
      ])
      if (!result?.ok) throw result?.error ?? problem('code/unavailable')
      return result.value
    } finally { clearTimeout(timeout) }
  }
  async function refreshEntry(entry: Entry) {
    if (disposed || entry.request || !entry.listeners.size) return
    const request = new AbortController(), generation = epoch, target = entry.target
    entry.request = request
    try {
      const raw = await call('code/snapshot', { sessionId: entry.sessionId, ...target }, request)
      if (disposed || request.signal.aborted || generation !== epoch || entry.request !== request || target !== entry.target) return
      const snapshot = readSnapshot(raw, entry.sessionId)
      if (!snapshot) throw problem('code/invalid-snapshot')
      const previous = entry.state.snapshot
      if (previous?.scope === snapshot.scope && snapshot.revision < previous.revision) return
      // Reuse the object already on screen so an unchanged poll does not rebuild
      // the tree or re-render the workbench.
      if (previous && entry.state.status === 'live' && sameSnapshot(previous, snapshot)) return
      const bindingChanged = previous && (previous.scope !== snapshot.scope || previous.workspace.cwd !== snapshot.workspace.cwd || previous.workspace.repoRoot !== snapshot.workspace.repoRoot || previous.workspace.gitDir !== snapshot.workspace.gitDir || previous.workspace.repositoryId !== snapshot.workspace.repositoryId || previous.workspace.policyRoot !== snapshot.workspace.policyRoot)
      const identityChanged = previous && (bindingChanged || previous.workspace.id !== snapshot.workspace.id)
      if (identityChanged && (bindingChanged || entry.fileTarget?.reviewId == null)) { stopFile(entry); entry.fileTarget = null }
      if (bindingChanged) { entry.historyRequest?.abort(); entry.historyRequest = null; entry.files.clear() }
      publish(entry, { status: 'live', snapshot, error: null,
        ...(identityChanged && entry.fileTarget?.reviewId == null ? { file: null, fileStatus: 'idle', fileKey: null } : {}),
        ...(bindingChanged ? { inspectedReview: null, historyId: null, historyStatus: 'idle', historyError: null } : {}),
      })
    } catch (error) {
      if (!disposed && generation === epoch && entry.request === request && !request.signal.aborted) publish(entry, { status: 'failed', error: problem(errorInfo(error).code, errorInfo(error).message) })
      else if (!disposed && entry.request === request && generation === epoch && errorInfo(error).code === 'code/timeout') publish(entry, { status: 'failed', error: problem('code/timeout') })
    } finally { if (entry.request === request) { entry.request = null; schedule(entry) } }
  }
  const entryFor = (sessionId: string): Entry => {
    if (!entries.has(sessionId)) {
      const entry: Entry = { source: undefined!, sessionId, target: { mode: 'worktree' }, state: empty(), listeners: new Set(), request: null, timer: null, fileRequest: null, fileTarget: null, historyRequest: null, action: null, files: new Map() }
      entry.source = {
        getSnapshot: () => entry.state,
        subscribe(listener) {
          entry.listeners.add(listener)
          if (entry.listeners.size === 1) { publish(entry, { status: 'loading' }); void refreshEntry(entry) }
          return () => { entry.listeners.delete(listener); if (!entry.listeners.size) { stopRead(entry); stopFile(entry); entry.historyRequest?.abort(); entry.historyRequest = null } }
        },
      }
      entries.set(sessionId, entry)
    }
    return entries.get(sessionId)!
  }
  const refresh = (sessionId: string) => { const entry = entryFor(sessionId); stopRead(entry); void refreshEntry(entry) }
  const selectTarget = (sessionId: string, mode: string, base?: string) => {
    const entry = entryFor(sessionId)
    if (entry.target.mode === mode && entry.target.base === base) return
    stopRead(entry); stopFile(entry); entry.fileTarget = null; entry.files.clear()
    entry.target = { mode, ...(mode === 'range' ? { base } : {}) }
    publish(entry, empty())
    void refreshEntry(entry)
  }
  async function loadFile(sessionId: string, target: FileTarget) {
    const entry = entryFor(sessionId), generation = epoch, key = JSON.stringify(target)
    if (entry.state.fileKey === key && ['loading', 'ready'].includes(entry.state.fileStatus)) return
    stopFile(entry)
    const cached = entry.files.get(key)
    if (cached) { cacheFile(entry, key, cached); entry.fileTarget = target; publish(entry, { file: cached, fileKey: key, fileStatus: 'ready', fileError: null }); return }
    const request = new AbortController()
    entry.fileRequest = request; entry.fileTarget = target
    publish(entry, { file: null, fileKey: key, fileStatus: 'loading', fileError: null })
    try {
      const raw = await call('code/file', { sessionId, ...target }, request)
      if (disposed || request.signal.aborted || epoch !== generation || entry.fileRequest !== request) return
      const file = readFile(raw, target.path)
      if (!file) throw problem('code/invalid-file')
      cacheFile(entry, key, file)
      publish(entry, { file, fileStatus: 'ready' })
    } catch (error) {
      if (!disposed && epoch === generation && entry.fileRequest === request) publish(entry, { file: null, fileStatus: 'failed', fileError: problem(errorInfo(error).code, errorInfo(error).message) })
    } finally { if (entry.fileRequest === request) entry.fileRequest = null }
  }
  const clearFile = (sessionId: string) => { const entry = entryFor(sessionId); stopFile(entry); entry.fileTarget = null; publish(entry, { file: null, fileStatus: 'idle', fileKey: null, fileError: null }) }
  async function loadReview(sessionId: string, reviewId: string | null) {
    const entry = entryFor(sessionId), snapshot = entry.state.snapshot, generation = epoch
    entry.historyRequest?.abort(); entry.historyRequest = null
    if (!reviewId) { publish(entry, { inspectedReview: null, historyId: null, historyStatus: 'idle', historyError: null }); return }
    if (!snapshot) return
    const request = new AbortController(); entry.historyRequest = request
    publish(entry, { inspectedReview: null, historyId: reviewId, historyStatus: 'loading', historyError: null })
    try {
      const raw = await call('code/review', { sessionId, scope: snapshot.scope, reviewId }, request)
      if (disposed || epoch !== generation || request.signal.aborted || entry.historyRequest !== request) return
      const value = readSnapshot({ ...snapshot, review: raw }, sessionId)
      if (!value || value.review?.id !== reviewId) throw problem('code/invalid-review')
      publish(entry, { inspectedReview: value.review, historyStatus: 'ready' })
    } catch (error) {
      if (!disposed && epoch === generation && entry.historyRequest === request) publish(entry, { historyStatus: 'failed', historyError: problem(errorInfo(error).code, errorInfo(error).message) })
    } finally { if (entry.historyRequest === request) entry.historyRequest = null }
  }
  async function cancel(sessionId: string) {
    const entry = entryFor(sessionId), snapshot = entry.state.snapshot, operation = snapshot?.operation, generation = epoch
    if (!snapshot || entry.action || entry.state.status !== 'live' || !operation?.id || operation.state === 'cancelling') return { ok: false, error: problem('code/stale-action') }
    const request = new AbortController(); entry.action = request
    publish(entry, { pending: true })
    try {
      const raw = await call('code/cancel', { sessionId, scope: snapshot.scope, operationId: operation.id }, request)
      if (disposed || generation !== epoch || request.signal.aborted) throw problem('code/cancel-unconfirmed')
      const value = readSnapshot(raw, sessionId)
      if (!value || value.scope !== snapshot.scope) throw problem('code/cancel-unconfirmed')
      // The operation owns cancellation; retain this panel's browse target while its fresh read arrives.
      publish(entry, { snapshot: { ...entry.state.snapshot!, operation: value.operation } })
      return { ok: true }
    } catch (error) { return { ok: false, error: problem('code/cancel-unconfirmed', errorInfo(error).message) } }
    finally { if (entry.action === request) { entry.action = null; publish(entry, { pending: false }); refresh(sessionId) } }
  }
  function reset() {
    epoch++
    for (const entry of entries.values()) { stopRead(entry); stopFile(entry); entry.action?.abort(); entry.historyRequest?.abort(); entry.historyRequest = null; entry.action = null; entry.fileTarget = null; entry.files.clear(); publish(entry, empty()); if (entry.listeners.size) void refreshEntry(entry) }
  }
  return {
    source: (sessionId: string) => entryFor(sessionId).source, refresh, selectTarget, loadFile, clearFile, loadReview, cancel, reset,
    dispose() { disposed = true; epoch++; for (const entry of entries.values()) { stopRead(entry); stopFile(entry); entry.action?.abort(); entry.historyRequest?.abort(); entry.listeners.clear() }; entries.clear() },
  }
}
