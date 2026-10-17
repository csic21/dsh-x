export const STATES = ['idle', 'running', 'waiting_permission', 'waiting_input', 'completed', 'cancelled', 'blocked', 'failed', 'interrupted']
export const CAPABILITIES = ['nativeSessions', 'resume', 'streaming', 'tools', 'plans', 'permissions', 'input', 'usage', 'cancel', 'models', 'authDiscovery']
export const EVENT_TYPES = ['session', 'assistant', 'tool', 'plan', 'permission', 'input', 'usage', 'status', 'diagnostic']
export const ACTIONS = ['request-start', 'request-continue', 'cancel', 'inspect']
export const PROTOCOL = 'dsh-x-agents'
export const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const string = (value, max = 12000) => typeof value === 'string' && value.length <= max
const id = value => string(value, 512) && value.length > 0
const revision = value => Number.isSafeInteger(value) && value >= 0

// Treat an unknown server contract as unavailable, never as a successful run.
export function readSnapshot(value, sessionId) {
  if (!isRecord(value) || !id(value.scope) || value.sessionId !== sessionId || !revision(value.revision) || !Array.isArray(value.catalog)) return null
  const ids = new Set()
  for (const agent of value.catalog) {
    if (!isRecord(agent) || !id(agent.id) || ids.has(agent.id) || !string(agent.label, 200) || !string(agent.transport, 200) || ![true, false, null].includes(agent.available) || ![true, false, null].includes(agent.authenticated) || !Array.isArray(agent.models) || !isRecord(agent.capabilities)) return null
    if (agent.version != null && !string(agent.version, 200)) return null
    if (agent.reason != null && !string(agent.reason, 2000)) return null
    if (CAPABILITIES.some(key => agent.capabilities[key] !== undefined && typeof agent.capabilities[key] !== 'boolean')) return null
    const models = new Set()
    for (const model of agent.models) {
      if (!isRecord(model) || !id(model.id) || !string(model.label, 200) || models.has(model.id)) return null
      models.add(model.id)
    }
    ids.add(agent.id)
  }
  const task = value.task
  if (task !== null) {
    if (!isRecord(task) || !id(task.id) || !revision(task.revision) || !string(task.title) || !id(task.runtime) || !STATES.includes(task.state) || !Array.isArray(task.events) || !Array.isArray(task.allowedActions) || task.allowedActions.some(action => !ACTIONS.includes(action))) return null
    if (task.cancellationRequested !== undefined && typeof task.cancellationRequested !== 'boolean') return null
    for (const key of ['runId', 'model', 'cwd', 'nativeSessionId', 'summary', 'reason', 'updatedAt']) if (task[key] != null && !string(task[key], key === 'summary' ? 100000 : 12000)) return null
    let previous = -1
    for (const event of task.events) {
      if (!isRecord(event) || !revision(event.seq) || event.seq <= previous || !EVENT_TYPES.includes(event.type) || (event.text != null && !string(event.text, 100000)) || (event.data != null && !isRecord(event.data) && !string(event.data, 12000))) return null
      previous = event.seq
    }
  }
  return value
}

export const addressFor = (scope, sessionId) => `dsh-resource://${PROTOCOL}/${encodeURIComponent(scope)}/${encodeURIComponent(sessionId)}`
export function parseAddress(address) {
  try {
    const url = new URL(address)
    if (url.protocol !== 'dsh-resource:' || url.hostname !== PROTOCOL || url.search || url.hash || url.username || url.password) return null
    const parts = url.pathname.slice(1).split('/').map(decodeURIComponent)
    if (parts.length !== 2 || !parts.every(id)) return null
    return { scope: parts[0], sessionId: parts[1] }
  } catch { return null }
}

export function canPrepare(agent) {
  return Boolean(agent && ['codex', 'opencode', 'claude', 'grok'].includes(agent.id)
    && agent.reason !== 'not-integrated' && agent.available !== false && agent.capabilities?.nativeSessions === true)
}

export function presentationEvents(events) {
  const rows = [], messages = new Map()
  for (const event of events) {
    const messageId = event.type === 'assistant' && typeof event.data?.messageId === 'string' && typeof event.data?.delta === 'boolean' ? event.data.messageId : null
    if (!messageId) { rows.push({ ...event, key: `event:${event.seq}` }); continue }
    const identity = JSON.stringify([typeof event.data.nativeSessionId === 'string' ? event.data.nativeSessionId : '', messageId, typeof event.data.partId === 'string' ? event.data.partId : ''])
    let row = messages.get(identity)
    if (!row) { row = { ...event, key: `message:${identity}`, text: '' }; rows.push(row); messages.set(identity, row) }
    if (typeof event.text === 'string') row.text = event.data.delta ? row.text + event.text : event.text
  }
  return rows
}

// The host owns sanitization. This display guard avoids duplicating permission
// scopes or question answers and limits the preview; it is not a secret scanner.
export function eventDataPreview(event) {
  if (!['tool', 'plan', 'usage', 'session', 'status', 'diagnostic'].includes(event.type) || event.data == null) return null
  if (event.data?.name === 'AskUserQuestion' || event.data?.toolName === 'AskUserQuestion') return null
  try {
    const body = JSON.stringify(event.data, (key, value) => {
      if (/password|secret|authorization|cookie|credential|api.?key|^(?:env|answers?|selected|custom|annotations|access[_-]?token|refresh[_-]?token|id[_-]?token|auth[_-]?token)$/i.test(key)) return '[redacted]'
      if (typeof value === 'string' && /(?:\b(?:sk-|xai-)[a-zA-Z0-9_-]{16,}|Bearer\s+[a-zA-Z0-9._-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i.test(value)) return '[Potential credential content withheld]'
      return value
    }, 2)
    return typeof body === 'string' ? { body: body.slice(0, 12000), truncated: body.length > 12000 } : null
  } catch { return null }
}

export function prepareRun(snapshot, { runtime, model = '', prompt, continueTask = false }) {
  const agent = snapshot?.catalog.find(item => item.id === runtime)
  if (!canPrepare(agent)) throw new Error('runtime-unavailable')
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.trim().length > 12000) throw new Error('goal-required')
  const task = snapshot.task
  if (task && !task.allowedActions.includes(continueTask ? 'request-continue' : 'request-start')) throw new Error('action-unavailable')
  if (continueTask && task && model !== (task.model ?? '')) throw new Error('action-unavailable')
  if (model && (agent.capabilities.models !== true || !agent.models.some(item => item.id === model))) throw new Error('model-unavailable')
  const args = { runtime, ...(model ? { model } : {}), prompt: prompt.trim(), scope: snapshot.scope }
  if (continueTask) {
    if (!task || task.runtime !== runtime || agent.capabilities.resume !== true) throw new Error('action-unavailable')
    Object.assign(args, { taskId: task.id, expectedRevision: task.revision })
  }
  return args
}

// Insert at the selection's end instead of replacing selected user text/chips.
// The host's draft revision guard remains intact. Never setDraft or auto-submit.
export function insertRequest(inputActions, text) {
  if (!inputActions?.captureInsertion || !inputActions?.insertText) return false
  const span = inputActions.captureInsertion()
  const safeSpan = { ...span, start: span.end }
  const inserted = inputActions.insertText(`\n\n${text}\n`, safeSpan)
  // A persistence failure cannot undo a successful insertion. Do not report
  // "nothing inserted" or retry it and risk duplicating the user's request.
  if (inserted) { try { inputActions.persistDraft?.() } catch { /* The current editor still contains the inserted request. */ } }
  return inserted
}
