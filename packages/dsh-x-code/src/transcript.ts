export const TRANSCRIPT_LIMIT = 40
export const TRANSCRIPT_TEXT = 4_000

export interface TranscriptMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  tools?: string[]
}

const textOf = (block: unknown) => block && typeof block === 'object' && (block as { type?: unknown }).type === 'text' && typeof (block as { text?: unknown }).text === 'string' ? (block as { text: string }).text : ''
const toolOf = (block: unknown) => block && typeof block === 'object' && (block as { type?: unknown }).type === 'tool-call' && typeof (block as { name?: unknown }).name === 'string' ? (block as { name: string }).name.slice(0, 80) : ''

/** User and assistant turns from a derived session history. Tool arguments and other roles stay out. */
export function projectTranscript(messages: unknown, limit = TRANSCRIPT_LIMIT): TranscriptMessage[] {
  if (!Array.isArray(messages)) return []
  const rows: TranscriptMessage[] = []
  for (const message of messages) {
    if (!message || typeof message !== 'object') continue
    const role = (message as { role?: unknown }).role
    if (role !== 'user' && role !== 'assistant') continue
    const sourceKind = (message as { source?: { kind?: unknown } }).source?.kind
    if (role === 'user' && sourceKind !== 'user') continue
    if (role === 'assistant' && sourceKind !== 'model') continue
    const content = (message as { content?: unknown }).content
    const blocks = Array.isArray(content) ? content : []
    const text = blocks.map(textOf).filter(Boolean).join('\n').trim().slice(0, TRANSCRIPT_TEXT)
    const tools = role === 'assistant' ? [...new Set(blocks.map(toolOf).filter(Boolean))].slice(0, 8) : []
    if (!text && tools.length === 0) continue
    const rawId = (message as { id?: unknown }).id
    const id = typeof rawId === 'string' && rawId.length > 0 && rawId.length <= 200 ? rawId : `${role}:${rows.length}`
    rows.push({ id, role, text, ...(tools.length ? { tools } : {}) })
  }
  return rows.slice(-limit)
}

export type ChatRow = { kind: 'message', id: string, role: 'user' | 'assistant', text: string } | { kind: 'tools', id: string, names: string[] }

export interface ChatSession { id: string, title: string, blank: boolean, running: boolean, updatedAt: number }

/** Sessions that belong to the current workspace, newest first. The open session stays even if the list has not caught up. */
export function chatSessionView(sessions: unknown, workspaces: unknown, currentId: string | null, cwd?: string): { sessions: ChatSession[], workspaceId?: string } {
  const byId = sessions && typeof sessions === 'object' && (sessions as { byId?: unknown }).byId && typeof (sessions as { byId?: unknown }).byId === 'object' ? (sessions as { byId: Record<string, any> }).byId : {}
  const record = workspaces && typeof workspaces === 'object' ? workspaces as { workspaces?: unknown, items?: unknown, archivedSessionIds?: unknown } : undefined
  const groups = Array.isArray(workspaces) ? workspaces : Array.isArray(record?.workspaces) ? record.workspaces : Array.isArray(record?.items) ? record.items : []
  const archived = new Set(Array.isArray(record?.archivedSessionIds) ? record.archivedSessionIds.filter((id): id is string => typeof id === 'string') : [])
  const samePath = (value: unknown) => typeof value === 'string' && !!cwd && (value === cwd || value.replace(/\/+$/, '') === cwd.replace(/\/+$/, ''))
  const match = groups.find(group => Array.isArray(group?.sessionIds) && !!currentId && group.sessionIds.includes(currentId))
    ?? groups.find(group => samePath(group?.cwd) || samePath(group?.path) || samePath(group?.repoRoot))
  const listed: unknown[] = Array.isArray(match?.sessionIds) ? match.sessionIds : currentId ? [currentId] : Object.keys(byId)
  const ids = [...new Set(listed.filter((id): id is string => typeof id === 'string'))]
  if (currentId && byId[currentId] && !ids.includes(currentId)) ids.unshift(currentId)
  const rows: ChatSession[] = ids.flatMap(id => {
    const row = byId[id]
    if (!row || row.archived === true || archived.has(id) || row.origin === 'subagent') return []
    if (row.blank === true && id !== currentId) return []
    const title = typeof row.title === 'string' ? row.title.trim() : ''
    return [{ id, title, blank: row.blank === true, running: row.running === true, updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0 }]
  }).sort((left, right) => right.updatedAt - left.updatedAt || (left.id < right.id ? -1 : 1))
  return { sessions: rows, ...(typeof match?.workspaceId === 'string' ? { workspaceId: match.workspaceId } : {}) }
}

/** Fold a run of tool-only turns into one chip row so the log is not a stack of empty messages. */
export function chatRows(messages: TranscriptMessage[]): ChatRow[] {
  const rows: ChatRow[] = []
  let tools: string[] = []
  let toolId = ''
  const flush = () => {
    if (!tools.length) return
    rows.push({ kind: 'tools', id: `tools:${toolId}`, names: [...new Set(tools)].slice(0, 12) })
    tools = []
    toolId = ''
  }
  for (const message of messages) {
    if (message.role === 'assistant' && !message.text && message.tools?.length) {
      if (!toolId) toolId = message.id
      tools.push(...message.tools)
      continue
    }
    flush()
    if (message.text) rows.push({ kind: 'message', id: message.id, role: message.role, text: message.text })
    if (message.tools?.length) rows.push({ kind: 'tools', id: `tools:${message.id}`, names: [...new Set(message.tools)].slice(0, 12) })
  }
  flush()
  return rows
}

/** Accept the projected wire payload. Raw session messages are not a transcript. */
export function readTranscript(value: unknown): TranscriptMessage[] | null {
  const messages = value && typeof value === 'object' ? (value as { messages?: unknown }).messages : null
  if (!Array.isArray(messages)) return null
  const rows: TranscriptMessage[] = []
  for (const message of messages) {
    if (!message || typeof message !== 'object') return null
    const role = (message as { role?: unknown }).role
    const text = (message as { text?: unknown }).text
    const id = (message as { id?: unknown }).id
    const tools = (message as { tools?: unknown }).tools
    if ((role !== 'user' && role !== 'assistant') || typeof text !== 'string' || typeof id !== 'string' || !id || id.length > 200 || text.length > TRANSCRIPT_TEXT) return null
    if (tools != null && (!Array.isArray(tools) || tools.length > 8 || tools.some(name => typeof name !== 'string' || name.length > 80))) return null
    rows.push({ id, role, text, ...(Array.isArray(tools) && tools.length ? { tools: tools as string[] } : {}) })
  }
  return rows.length > TRANSCRIPT_LIMIT ? null : rows
}

/** Send one message through the session composer. Replaces the draft, then submits it. */
export function sendConversation(inputActions: { setDraft?: (text: string) => void, persistDraft?: () => void, submit?: () => void, send?: (text: string) => unknown } | null | undefined, text: string): boolean {
  const body = text.trim()
  if (!body || body.length > 8_000 || !inputActions) return false
  if (typeof inputActions.setDraft === 'function' && typeof inputActions.submit === 'function') {
    inputActions.setDraft(body)
    try { inputActions.persistDraft?.() } catch { /* The editor already holds the message. */ }
    inputActions.submit()
    return true
  }
  if (typeof inputActions.send === 'function') { inputActions.send(body); return true }
  return false
}
