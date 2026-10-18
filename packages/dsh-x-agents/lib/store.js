import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, openSync, closeSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
export const ACTIVE = new Set(['running', 'waiting_permission', 'waiting_input']);
export const STATES = new Set([...ACTIVE, 'completed', 'cancelled', 'blocked', 'failed', 'interrupted']);
export const fail = (code, message) => Object.assign(new Error(message), { code });
export function validSession(value) {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(value))
        throw fail('AGENTS_SESSION', 'Invalid session identity.');
    return value;
}
export function safeText(value, max = 4000) {
    const text = String(value ?? '');
    if (/(?:sk-[a-zA-Z0-9_-]{16,}|xai-[a-zA-Z0-9_-]{20,}|AIza[a-zA-Z0-9_-]{30,}|Bearer\s+[a-zA-Z0-9._-]{12,}|(?:api[_-]?key|password|access[_-]?token)["']?\s*[:=]\s*["']?[^\s"']{8,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i.test(text))
        return '[Potential credential content withheld]';
    return text.length > max ? text.slice(0, max) + '\n[truncated]' : text;
}
export function safeData(value, depth = 0) {
    if (depth > 8)
        return '[Nested data omitted]';
    if (typeof value === 'string')
        return safeText(value, 4000);
    if (Array.isArray(value))
        return value.slice(0, 100).map(item => safeData(item, depth + 1));
    if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) => [key, /password|secret|authorization|cookie|credential|api.?key|^(?:env|token|access[_-]?token|refresh[_-]?token|id[_-]?token|auth[_-]?token)$/i.test(key) ? '[redacted]' : safeData(item, depth + 1)]));
    return value == null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function atomic(file, data) {
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
        writeFileSync(temp, JSON.stringify(data), { flag: 'wx', mode: 0o600 });
        renameSync(temp, file);
    }
    finally {
        try {
            unlinkSync(temp);
        }
        catch { }
    }
}
function json(file, limit = 2_000_000) {
    if (statSync(file).size > limit * 4)
        throw fail('AGENTS_STORE', 'Stored task exceeds the supported byte size.');
    const raw = readFileSync(file, 'utf8');
    if (raw.length > limit)
        throw fail('AGENTS_STORE', 'Stored task exceeds the supported size.');
    return JSON.parse(raw);
}
export function createTaskStore(profileDirectory) {
    if (!path.isAbsolute(profileDirectory ?? ''))
        throw fail('AGENTS_PROFILE', 'An absolute launcher profile directory is required.');
    const root = path.join(profileDirectory, '.dsh-x-agents');
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const scopeFile = path.join(root, 'scope.json');
    try {
        writeFileSync(scopeFile, JSON.stringify({ version: 1, scope: randomUUID() }), { flag: 'wx', mode: 0o600 });
    }
    catch (error) {
        if (error.code !== 'EEXIST')
            throw error;
    }
    const scope = json(scopeFile, 1024).scope;
    if (typeof scope !== 'string' || !/^[a-f0-9-]{36}$/.test(scope))
        throw fail('AGENTS_STORE', 'Invalid profile identity.');
    const hostId = randomUUID();
    const filename = (sessionId) => path.join(root, createHash('sha256').update(validSession(sessionId)).digest('hex') + '.json');
    const lockname = (sessionId) => filename(sessionId) + '.run-lock';
    function read(sessionId) {
        const file = filename(sessionId);
        if (!existsSync(file))
            return { version: 1, scope, sessionId, revision: 0, task: null, history: [] };
        const value = json(file);
        if (!value || Array.isArray(value) || value.version !== 1 || value.scope !== scope || value.sessionId !== sessionId || !Number.isSafeInteger(value.revision) || !Array.isArray(value.history))
            throw fail('AGENTS_STORE', 'Invalid task record.');
        if (value.task && !STATES.has(value.task.state))
            throw fail('AGENTS_STORE', 'Unknown persisted task state.');
        return value;
    }
    function mutate(sessionId, fn) {
        const file = filename(sessionId), lock = file + '.write-lock';
        let fd;
        try {
            fd = openSync(lock, 'wx', 0o600);
        }
        catch (error) {
            if (error.code === 'EEXIST')
                throw fail('AGENTS_STORE_BUSY', 'Task storage is busy; retry after refreshing.');
            throw error;
        }
        try {
            const value = read(sessionId);
            fn(value);
            value.revision++;
            if (value.task) {
                value.task.revision = value.revision;
                value.task.updatedAt = new Date().toISOString();
            }
            while (Buffer.byteLength(JSON.stringify(value)) > 1_500_000 && value.task?.events.length > 1)
                value.task.events.shift();
            if (Buffer.byteLength(JSON.stringify(value)) > 1_500_000)
                throw fail('AGENTS_STORE', 'Task exceeds storage budget.');
            atomic(file, value);
            return value;
        }
        finally {
            closeSync(fd);
            unlinkSync(lock);
        }
    }
    function snapshot(sessionId) {
        const value = read(sessionId);
        if (value.task && ACTIVE.has(value.task.state) && value.task.hostId !== hostId) {
            value.task.state = 'interrupted';
            value.task.reason = 'A previous host may still own this run. Verify it has stopped; automatic replay is disabled.';
        }
        return value;
    }
    function claim(sessionId, { taskId, expectedRevision, expectedScope, runtime, model, prompt, cwd, backendIdentity = runtime }) {
        if (expectedScope !== undefined && expectedScope !== scope)
            throw fail('AGENTS_STALE', 'Profile changed. Refresh before submitting.');
        const lock = lockname(sessionId);
        let fd;
        try {
            fd = openSync(lock, 'wx', 0o600);
            writeFileSync(fd, JSON.stringify({ hostId, pid: process.pid, at: new Date().toISOString() }));
        }
        catch (error) {
            if (fd !== undefined)
                closeSync(fd);
            if (error.code === 'EEXIST')
                throw fail('AGENTS_BUSY', 'A run or uncertain process still owns this task. No automatic replay is allowed.');
            throw error;
        }
        closeSync(fd);
        try {
            const claimed = mutate(sessionId, (value) => {
                const old = value.task;
                if (old && ACTIVE.has(old.state))
                    throw fail('AGENTS_BUSY', 'The prior run is still active.');
                if (taskId !== undefined) {
                    if (!old || old.id !== taskId || value.revision !== expectedRevision || expectedScope !== scope)
                        throw fail('AGENTS_STALE', 'Task changed. Refresh before continuing.');
                    if (old.state === 'interrupted' || !old.nativeSessionId)
                        throw fail('AGENTS_RESUME', 'This task has no safely resumable native session.');
                    if (old.runtime !== runtime || old.cwd !== cwd || old.model !== (model ?? null) || old.backendIdentity !== backendIdentity)
                        throw fail('AGENTS_BINDING', 'Continue must preserve runtime, model and working directory. Start a new task for a different route.');
                    old.state = 'running';
                    old.reason = null;
                    old.summary = '';
                    old.hostId = hostId;
                    old.runId = randomUUID();
                    old.events = [];
                }
                else {
                    if (old)
                        value.history = [...value.history, { id: old.id, title: old.title, runtime: old.runtime, state: old.state, updatedAt: old.updatedAt }].slice(-30);
                    value.task = { id: randomUUID(), runId: randomUUID(), hostId, title: safeText(prompt, 120), runtime, model: model ?? null, cwd, backendIdentity, nativeSessionId: null, state: 'running', events: [], summary: '', reason: null, createdAt: new Date().toISOString() };
                }
            });
            atomic(lock, { hostId, pid: process.pid, taskId: claimed.task.id, runId: claimed.task.runId });
            return claimed;
        }
        catch (error) {
            unlinkSync(lock);
            throw error;
        }
    }
    function event(sessionId, taskId, runId, event) {
        return mutate(sessionId, (value) => {
            if (value.task?.id !== taskId || value.task.runId !== runId || value.task.hostId !== hostId || !ACTIVE.has(value.task.state))
                throw fail('AGENTS_STALE', 'Run no longer owns this task.');
            const task = value.task;
            if (event.type === 'session') {
                const id = event.data?.nativeSessionId;
                if (typeof id !== 'string' || id.length > 256 || !id.trim())
                    throw fail('AGENTS_NATIVE_ID', 'Invalid native session identity.');
                if (task.nativeSessionId && task.nativeSessionId !== id)
                    throw fail('AGENTS_NATIVE_ID', 'Native session identity changed during a run.');
                task.nativeSessionId = id;
            }
            const seq = (task.events.at(-1)?.seq ?? 0) + 1;
            const sanitized = event.data === undefined ? undefined : safeData(event.data);
            const data = sanitized === undefined ? undefined : JSON.stringify(sanitized).length > 8000 ? { truncated: true, reason: 'event-data-budget' } : sanitized;
            task.events.push({ seq, type: String(event.type).slice(0, 40), text: safeText(event.text), ...(data === undefined ? {} : { data }), at: new Date().toISOString() });
            if (task.events.length > 256)
                task.events.shift();
        });
    }
    function state(sessionId, taskId, runId, state, fields = {}) {
        if (!STATES.has(state))
            throw fail('AGENTS_STATE', 'Invalid task state.');
        return mutate(sessionId, (value) => {
            if (value.task?.id !== taskId || value.task.runId !== runId || value.task.hostId !== hostId || !ACTIVE.has(value.task.state))
                throw fail('AGENTS_STALE', 'Run no longer owns this task.');
            Object.assign(value.task, fields, { state });
        });
    }
    function release(sessionId, taskId, runId) {
        const lock = lockname(sessionId);
        const owner = json(lock, 2048);
        if (owner.hostId !== hostId || owner.taskId !== taskId || owner.runId !== runId)
            throw fail('AGENTS_BUSY', 'Run lock belongs to another host.');
        unlinkSync(lock);
    }
    function claimOperation(sessionId, runtime) {
        const operationId = randomUUID();
        try {
            writeFileSync(lockname(sessionId), JSON.stringify({ hostId, operationId, runtime, kind: 'models' }), { flag: 'wx', mode: 0o600 });
        }
        catch (error) {
            if (error.code === 'EEXIST')
                throw fail('AGENTS_BUSY', 'A previous runtime operation still owns this session.');
            throw error;
        }
        return operationId;
    }
    function releaseOperation(sessionId, operationId) {
        const owner = json(lockname(sessionId), 2048);
        if (owner.hostId !== hostId || owner.operationId !== operationId)
            throw fail('AGENTS_BUSY', 'Runtime operation lock belongs to another owner.');
        unlinkSync(lockname(sessionId));
    }
    function operationLock(sessionId) {
        if (!existsSync(lockname(sessionId)))
            return null;
        const owner = json(lockname(sessionId), 2048);
        if (owner.kind !== 'models')
            return null;
        return { kind: 'models', runtime: owner.runtime, state: 'blocked', reason: 'A previous model-directory operation may still own a native process. Verify it has stopped before recovering; automatic replay is disabled.' };
    }
    function quarantine(sessionId, reason, runtime = 'unknown') {
        const lock = lockname(sessionId);
        try {
            writeFileSync(lock, JSON.stringify({ hostId, reason: 'discovery-cleanup-unconfirmed' }), { flag: 'wx', mode: 0o600 });
        }
        catch (error) {
            if (error.code !== 'EEXIST')
                throw error;
        }
        mutate(sessionId, (value) => {
            if (!value.task)
                value.task = { id: randomUUID(), runId: randomUUID(), hostId, title: 'Runtime discovery interrupted', runtime, model: null, cwd: null, nativeSessionId: null, events: [], summary: '', createdAt: new Date().toISOString() };
            value.task.state = 'interrupted';
            value.task.reason = safeText(reason, 2000);
        });
    }
    return { scope, root, hostId, read, snapshot, claim, event, state, release, quarantine, claimOperation, releaseOperation, operationLock, hasLock: (sessionId) => existsSync(lockname(sessionId)) };
}
