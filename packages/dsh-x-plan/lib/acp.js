import { planError } from './errors.js';
import { MAX_PLAN_CHARS, SUBPROCESS_GRACE_MS } from './limits.js';
const PROTOCOL_VERSION = 1;
const CLEANUP_TIMEOUT_MS = SUBPROCESS_GRACE_MS * 2 + 1_000;
export const MAX_ACP_LINE_CHARS = 256_000;
/**
 * Check an already-installed adapter without sending a model prompt. A session
 * must open using existing CLI credentials, advertise the requested safe mode,
 * and accept it. This verifies adapter behavior, not an OS sandbox or provenance.
 * The returned identity must be supplied as expectedAdapter on the real call.
 *
 * @param {Omit<AcpOptions, 'prompt'>} options
 */
export async function preflightAcp(options) {
    return withAcpSession(options, false);
}
/**
 * One-shot ACP client. Every call repeats the safe-mode handshake and cancels
 * all permission requests. Empty client capabilities expose neither a client
 * filesystem nor client terminals; the adapter still runs as a local process.
 *
 * @typedef {{
 *   spawn: (spec: object) => { stdin: import('node:stream').Writable, stdout: import('node:stream').Readable, terminate?: () => void | Promise<void>, waitForExit?: (signal?: AbortSignal) => Promise<boolean>, done?: Promise<object> },
 *   argv: string[],
 *   cwd: string,
 *   env?: Record<string, string>,
 *   prompt?: string,
 *   signal?: AbortSignal,
 *   modeId: 'read-only' | 'plan',
 *   timeoutMs?: number,
 *   expectedAdapter?: { executable: string, name: string, version: string },
 * }} AcpOptions
 * @param {AcpOptions} options
 */
export async function runAcpPrompt(options) {
    const result = await withAcpSession(options, true);
    if (!('text' in result))
        throw planError('ACP_PROTOCOL', 'ACP prompt produced no result.');
    return result;
}
async function withAcpSession(options, shouldPrompt) {
    const signal = options.timeoutMs === undefined
        ? options.signal
        : AbortSignal.any([
            ...(options.signal === undefined ? [] : [options.signal]),
            AbortSignal.timeout(options.timeoutMs),
        ]);
    throwIfAborted(signal);
    if (!['read-only', 'plan'].includes(options.modeId)) {
        throw planError('READONLY_UNAVAILABLE', 'ACP 调用必须指定已验证的 read-only 或 plan 模式；没有只读模式时不能启动。');
    }
    const child = options.spawn({
        argv: options.argv,
        cwd: options.cwd,
        stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'inherit' },
        graceMs: SUBPROCESS_GRACE_MS,
        signal,
        env: options.env ?? {},
    });
    // Observe process failures immediately, even while an RPC is still pending.
    // Keep the original failure available without an unhandled rejection.
    const completion = child.done === undefined ? undefined : Promise.resolve(child.done).then(outcome => ({ outcome }), error => ({ error }));
    if (child.stdin === undefined || child.stdout === undefined) {
        await teardown(child, completion);
        throw planError('ACP_STREAM', 'ACP 子进程没有提供 stdin/stdout。');
    }
    const rpc = new NdjsonRpc(child.stdin, child.stdout);
    let sessionId;
    let modeRequested = false;
    let promptStarted = false;
    let permissionDenials = 0;
    rpc.onRequest('session/request_permission', () => {
        permissionDenials += 1;
        return { outcome: { outcome: 'cancelled' } };
    });
    const text = { value: '' };
    rpc.onNotify('session/update', (params) => {
        if (typeof sessionId !== 'string' || params?.sessionId !== sessionId)
            return;
        const update = params && params.update;
        if (update === undefined || update === null)
            return;
        if (update.sessionUpdate === 'current_mode_update' && modeRequested
            && update.currentModeId !== options.modeId) {
            throw planError('ACP_MODE', `ACP 代理离开了要求的只读模式 ${options.modeId}，已停止。`);
        }
        if (!promptStarted || update.sessionUpdate !== 'agent_message_chunk')
            return;
        const chunk = contentText(update.content);
        if (text.value.length + chunk.length > MAX_PLAN_CHARS) {
            throw planError('ACP_SIZE', `ACP 正文超过 ${MAX_PLAN_CHARS} 个字符。`);
        }
        text.value += chunk;
    });
    const cancel = () => {
        if (typeof sessionId === 'string') {
            try {
                rpc.notify('session/cancel', { sessionId });
            }
            catch {
                // The child is already gone.
            }
        }
    };
    if (signal !== undefined)
        signal.addEventListener('abort', cancel, { once: true });
    try {
        const initialized = await request(rpc, signal, 'initialize', {
            protocolVersion: PROTOCOL_VERSION,
            clientCapabilities: {},
        });
        if (initialized?.protocolVersion !== PROTOCOL_VERSION) {
            throw planError('ACP_PROTOCOL', `ACP 协议版本不兼容：要求 ${PROTOCOL_VERSION}，代理返回 ${String(initialized?.protocolVersion)}。`);
        }
        const adapter = adapterIdentity(initialized, options.argv, options.expectedAdapter);
        // authMethods advertises available methods, not whether login is required.
        // Never guess a method by its label or initiate browser/interactive login.
        // session/new checks whether the adapter can use its existing CLI login.
        let session;
        try {
            session = await request(rpc, signal, 'session/new', { cwd: options.cwd, mcpServers: [] });
        }
        catch (error) {
            if (error?.rpcCode === -32000) {
                throw planError('ACP_AUTH', 'ACP 代理要求登录。请先在对应 CLI 中完成登录，再重试；插件不会发起交互式登录或保存 API key。');
            }
            throw error;
        }
        if (typeof session?.sessionId !== 'string' || session.sessionId === '') {
            throw planError('ACP_SESSION', 'ACP 子进程没有返回 sessionId。');
        }
        sessionId = session.sessionId;
        const modes = session.modes?.availableModes;
        if (!Array.isArray(modes) || !modes.some(mode => mode?.id === options.modeId)) {
            throw planError('READONLY_UNAVAILABLE', `ACP 代理没有声明要求的只读模式 ${options.modeId}，不会发送任务。请检查已安装适配器的版本和模式支持。`);
        }
        modeRequested = true;
        try {
            await request(rpc, signal, 'session/set_mode', { sessionId, modeId: options.modeId });
        }
        catch (error) {
            if (signal?.aborted || error?.name === 'AbortError')
                throw error;
            throw planError('ACP_MODE', `无法启用要求的只读模式 ${options.modeId}，不会发送任务。${error instanceof Error ? error.message : String(error)}`);
        }
        throwIfAborted(signal);
        rpc.assertOpen();
        const ready = { ok: true, adapter, modeId: options.modeId, authentication: 'existing-session', permissionDenials };
        if (!shouldPrompt)
            return ready;
        promptStarted = true;
        const prompted = await request(rpc, signal, 'session/prompt', {
            sessionId,
            prompt: [{ type: 'text', text: options.prompt }],
        });
        throwIfAborted(signal);
        rpc.assertOpen();
        const stopReason = typeof prompted?.stopReason === 'string' ? prompted.stopReason : 'unknown';
        const ok = stopReason === 'end_turn' && text.value.trim() !== '';
        return { ...ready, ok, stopReason, text: text.value, permissionDenials };
    }
    finally {
        if (signal !== undefined)
            signal.removeEventListener('abort', cancel);
        rpc.failAll(planError('ACP_CLOSED', 'ACP 调用已结束。'));
        await teardown(child, completion);
    }
}
function adapterIdentity(initialized, argv, expected) {
    const info = initialized.agentInfo;
    if (typeof info?.name !== 'string' || info.name.trim() === ''
        || typeof info?.version !== 'string' || info.version.trim() === '') {
        throw planError('ACP_IDENTITY', 'ACP 代理必须声明 agentInfo.name 和 agentInfo.version，才能记录并核对已安装版本。请使用可报告身份的已审计适配器。');
    }
    const adapter = { executable: argv[0], name: info.name, version: info.version };
    if (expected !== undefined && ['executable', 'name', 'version'].some(key => adapter[key] !== expected[key])) {
        throw planError('ACP_IDENTITY_CHANGED', 'ACP 程序、名称或版本与预检不一致，已停止。请重新预检两个模型。');
    }
    return adapter;
}
function request(rpc, signal, method, params) {
    throwIfAborted(signal);
    return withSignal(rpc.request(method, params), signal);
}
function withSignal(promise, signal) {
    if (signal === undefined)
        return promise;
    return new Promise((resolve, reject) => {
        const onAbort = () => reject(abortError());
        signal.addEventListener('abort', onAbort, { once: true });
        promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
        if (signal.aborted)
            onAbort();
    });
}
function abortError() {
    const error = planError('CANCELLED', 'ACP 调用已取消。');
    error.name = 'AbortError';
    return error;
}
function contentText(content) {
    if (Array.isArray(content))
        return content.map(contentText).join('');
    if (content && content.type === 'text' && typeof content.text === 'string')
        return content.text;
    return '';
}
async function teardown(child, completion) {
    try {
        child.stdin?.end();
    }
    catch {
        // Already closed.
    }
    // The official subprocess seam escalates termination and confirms its owned
    // process range through waitForExit. Do not return while that is still live,
    // and never use the already-aborted task signal to skip this final wait.
    const cleanup = async () => {
        await child.terminate?.();
        if (child.waitForExit !== undefined) {
            const exited = await child.waitForExit(AbortSignal.timeout(CLEANUP_TIMEOUT_MS));
            if (exited !== true)
                throw new Error('子进程未确认退出');
        }
        const completed = await completion;
        if (completed?.error !== undefined)
            throw completed.error;
    };
    let timer;
    try {
        await Promise.race([
            cleanup(),
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('等待子进程退出超时')), CLEANUP_TIMEOUT_MS);
            }),
        ]);
    }
    catch (error) {
        throw planError('ACP_CLEANUP', `无法确认 ACP 子进程已经停止，请检查进程后再重试。${error instanceof Error ? error.message : String(error)}`);
    }
    finally {
        clearTimeout(timer);
    }
}
function throwIfAborted(signal) {
    if (signal?.aborted) {
        const error = planError('CANCELLED', 'ACP 调用已取消。');
        error.name = 'AbortError';
        throw error;
    }
}
class NdjsonRpc {
    constructor(stdin, stdout) {
        this.stdin = stdin;
        this.nextId = 1;
        this.pending = new Map();
        this.requests = new Map();
        this.notifications = new Map();
        this.buffer = '';
        this.closed = false;
        this.failure = null;
        // Pipe writes fail asynchronously when an adapter closes its input. Catch
        // that event rather than letting EPIPE terminate the host or wait for timeout.
        stdin.on('error', (error) => this.failAll(error instanceof Error ? error : new Error(String(error))));
        stdout.setEncoding('utf8');
        stdout.on('data', (chunk) => this.onData(chunk));
        stdout.on('end', () => this.failAll(planError('ACP_CLOSED', 'ACP stdout 已关闭。')));
        stdout.on('error', (error) => this.failAll(error instanceof Error ? error : new Error(String(error))));
    }
    onRequest(method, handler) {
        this.requests.set(method, handler);
    }
    onNotify(method, handler) {
        this.notifications.set(method, handler);
    }
    assertOpen() {
        if (this.closed)
            throw this.failure ?? planError('ACP_CLOSED', 'ACP 连接已关闭。');
    }
    request(method, params) {
        if (this.closed)
            return Promise.reject(this.failure ?? planError('ACP_CLOSED', `ACP 连接已关闭，无法调用 ${method}。`));
        const id = this.nextId;
        this.nextId += 1;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            try {
                this.send({ jsonrpc: '2.0', id, method, params });
            }
            catch (error) {
                this.pending.delete(id);
                reject(error instanceof Error ? error : new Error(String(error)));
            }
        });
    }
    notify(method, params) {
        this.send({ jsonrpc: '2.0', method, params });
    }
    onData(chunk) {
        if (this.closed)
            return;
        try {
            this.buffer += chunk;
            let newline = this.buffer.indexOf('\n');
            while (newline >= 0) {
                if (newline > MAX_ACP_LINE_CHARS)
                    throw planError('ACP_SIZE', 'ACP 单行响应超过大小限制。');
                const line = this.buffer.slice(0, newline).trim();
                this.buffer = this.buffer.slice(newline + 1);
                if (line !== '')
                    this.onLine(line);
                if (this.closed)
                    return;
                newline = this.buffer.indexOf('\n');
            }
            if (this.buffer.length > MAX_ACP_LINE_CHARS)
                throw planError('ACP_SIZE', 'ACP 单行响应超过大小限制。');
        }
        catch (error) {
            this.failAll(error instanceof Error ? error : planError('ACP_INVALID', 'ACP 响应无效。'));
        }
    }
    onLine(line) {
        let message;
        try {
            message = JSON.parse(line);
        }
        catch (error) {
            this.failAll(error instanceof Error ? error : new Error(String(error)));
            return;
        }
        if (message === null || typeof message !== 'object' || Array.isArray(message)
            || message.jsonrpc !== '2.0'
            || (message.id !== undefined && message.id !== null && typeof message.id !== 'string' && !Number.isSafeInteger(message.id))
            || (Object.hasOwn(message, 'method') && typeof message.method !== 'string')
            || (!Object.hasOwn(message, 'method') && !(Object.hasOwn(message, 'id') && (Object.hasOwn(message, 'result') !== Object.hasOwn(message, 'error'))))) {
            this.failAll(planError('ACP_INVALID', 'ACP 响应不是有效的 JSON-RPC 消息。'));
            return;
        }
        if (message.id !== undefined && message.id !== null && typeof message.method === 'string') {
            this.answer(message);
            return;
        }
        if (message.id !== undefined && message.id !== null && (Object.hasOwn(message, 'result') || Object.hasOwn(message, 'error'))) {
            const pending = this.pending.get(message.id);
            if (pending === undefined)
                return;
            this.pending.delete(message.id);
            if (Object.hasOwn(message, 'error'))
                pending.reject(rpcError(message.error));
            else
                pending.resolve(message.result);
            return;
        }
        if (typeof message.method === 'string') {
            const handler = this.notifications.get(message.method);
            if (handler !== undefined)
                handler(message.params);
        }
    }
    answer(message) {
        const handler = this.requests.get(message.method);
        const responded = handler === undefined
            ? Promise.reject(new Error(`不支持的 ACP 请求：${message.method}`))
            : Promise.resolve(handler(message.params));
        responded.then(result => this.send({ jsonrpc: '2.0', id: message.id, result }), error => this.send({
            jsonrpc: '2.0',
            id: message.id,
            error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
        })).catch(error => this.failAll(error instanceof Error ? error : new Error(String(error))));
    }
    send(message) {
        if (this.closed)
            return;
        this.stdin.write(`${JSON.stringify(message)}\n`);
    }
    failAll(error) {
        if (this.closed)
            return;
        this.closed = true;
        this.failure = error;
        this.buffer = '';
        for (const pending of this.pending.values())
            pending.reject(error);
        this.pending.clear();
    }
}
function rpcError(error) {
    const message = error && typeof error.message === 'string' ? error.message : 'ACP 请求失败。';
    const failure = planError('ACP_REQUEST', message);
    if (Number.isSafeInteger(error?.code))
        failure.rpcCode = error.code;
    return failure;
}
