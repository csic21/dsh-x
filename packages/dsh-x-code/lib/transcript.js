export const TRANSCRIPT_LIMIT = 40;
export const TRANSCRIPT_TEXT = 4_000;
const textOf = (block) => block && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string' ? block.text : '';
const toolOf = (block) => block && typeof block === 'object' && block.type === 'tool-call' && typeof block.name === 'string' ? block.name.slice(0, 80) : '';
/** User and assistant turns from a derived session history. Tool arguments and other roles stay out. */
export function projectTranscript(messages, limit = TRANSCRIPT_LIMIT) {
    if (!Array.isArray(messages))
        return [];
    const rows = [];
    for (const message of messages) {
        if (!message || typeof message !== 'object')
            continue;
        const role = message.role;
        if (role !== 'user' && role !== 'assistant')
            continue;
        const sourceKind = message.source?.kind;
        if (role === 'user' && sourceKind !== 'user')
            continue;
        if (role === 'assistant' && sourceKind !== 'model')
            continue;
        const content = message.content;
        const blocks = Array.isArray(content) ? content : [];
        const text = blocks.map(textOf).filter(Boolean).join('\n').trim().slice(0, TRANSCRIPT_TEXT);
        const tools = role === 'assistant' ? [...new Set(blocks.map(toolOf).filter(Boolean))].slice(0, 8) : [];
        if (!text && tools.length === 0)
            continue;
        const rawId = message.id;
        const id = typeof rawId === 'string' && rawId.length > 0 && rawId.length <= 200 ? rawId : `${role}:${rows.length}`;
        rows.push({ id, role, text, ...(tools.length ? { tools } : {}) });
    }
    return rows.slice(-limit);
}
/** Sessions that belong to the current workspace, newest first. The open session stays even if the list has not caught up. */
export function chatSessionView(sessions, workspaces, currentId, cwd) {
    const byId = sessions && typeof sessions === 'object' && sessions.byId && typeof sessions.byId === 'object' ? sessions.byId : {};
    const record = workspaces && typeof workspaces === 'object' ? workspaces : undefined;
    const groups = Array.isArray(workspaces) ? workspaces : Array.isArray(record?.workspaces) ? record.workspaces : Array.isArray(record?.items) ? record.items : [];
    const archived = new Set(Array.isArray(record?.archivedSessionIds) ? record.archivedSessionIds.filter((id) => typeof id === 'string') : []);
    const samePath = (value) => typeof value === 'string' && !!cwd && (value === cwd || value.replace(/\/+$/, '') === cwd.replace(/\/+$/, ''));
    const match = groups.find(group => Array.isArray(group?.sessionIds) && !!currentId && group.sessionIds.includes(currentId))
        ?? groups.find(group => samePath(group?.cwd) || samePath(group?.path) || samePath(group?.repoRoot));
    const listed = Array.isArray(match?.sessionIds) ? match.sessionIds : currentId ? [currentId] : Object.keys(byId);
    const ids = [...new Set(listed.filter((id) => typeof id === 'string'))];
    if (currentId && byId[currentId] && !ids.includes(currentId))
        ids.unshift(currentId);
    const rows = ids.flatMap(id => {
        const row = byId[id];
        if (!row || row.archived === true || archived.has(id) || row.origin === 'subagent')
            return [];
        if (row.blank === true && id !== currentId)
            return [];
        const title = typeof row.title === 'string' ? row.title.trim() : '';
        return [{ id, title, blank: row.blank === true, running: row.running === true, updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0 }];
    }).sort((left, right) => right.updatedAt - left.updatedAt || (left.id < right.id ? -1 : 1));
    return { sessions: rows, ...(typeof match?.workspaceId === 'string' ? { workspaceId: match.workspaceId } : {}) };
}
/** Fold a run of tool-only turns into one chip row so the log is not a stack of empty messages. */
export function chatRows(messages) {
    const rows = [];
    let tools = [];
    let toolId = '';
    const flush = () => {
        if (!tools.length)
            return;
        rows.push({ kind: 'tools', id: `tools:${toolId}`, names: [...new Set(tools)].slice(0, 12) });
        tools = [];
        toolId = '';
    };
    for (const message of messages) {
        if (message.role === 'assistant' && !message.text && message.tools?.length) {
            if (!toolId)
                toolId = message.id;
            tools.push(...message.tools);
            continue;
        }
        flush();
        if (message.text)
            rows.push({ kind: 'message', id: message.id, role: message.role, text: message.text });
        if (message.tools?.length)
            rows.push({ kind: 'tools', id: `tools:${message.id}`, names: [...new Set(message.tools)].slice(0, 12) });
    }
    flush();
    return rows;
}
/** Accept the projected wire payload. Raw session messages are not a transcript. */
export function readTranscript(value) {
    const messages = value && typeof value === 'object' ? value.messages : null;
    if (!Array.isArray(messages))
        return null;
    const rows = [];
    for (const message of messages) {
        if (!message || typeof message !== 'object')
            return null;
        const role = message.role;
        const text = message.text;
        const id = message.id;
        const tools = message.tools;
        if ((role !== 'user' && role !== 'assistant') || typeof text !== 'string' || typeof id !== 'string' || !id || id.length > 200 || text.length > TRANSCRIPT_TEXT)
            return null;
        if (tools != null && (!Array.isArray(tools) || tools.length > 8 || tools.some(name => typeof name !== 'string' || name.length > 80)))
            return null;
        rows.push({ id, role, text, ...(Array.isArray(tools) && tools.length ? { tools: tools } : {}) });
    }
    return rows.length > TRANSCRIPT_LIMIT ? null : rows;
}
/** Send one message through the session composer. Replaces the draft, then submits it. */
export function sendConversation(inputActions, text) {
    const body = text.trim();
    if (!body || body.length > 8_000 || !inputActions)
        return false;
    if (typeof inputActions.setDraft === 'function' && typeof inputActions.submit === 'function') {
        inputActions.setDraft(body);
        try {
            inputActions.persistDraft?.();
        }
        catch { /* The editor already holds the message. */ }
        inputActions.submit();
        return true;
    }
    if (typeof inputActions.send === 'function') {
        inputActions.send(body);
        return true;
    }
    return false;
}
