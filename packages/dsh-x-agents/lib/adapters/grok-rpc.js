import { StringDecoder } from 'node:string_decoder';
import { createHash } from 'node:crypto';
export function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    // A transport can fail between two requests. The next guarded operation
    // still sees the failure, without an unhandled-rejection window.
    promise.catch(() => { });
    return { promise, resolve, reject };
}
export function failure(message, code = 'AGENTS_GROK_PROTOCOL') {
    return Object.assign(new Error(message), { code });
}
export async function abortable(promise, signal) {
    if (!signal)
        return promise;
    if (signal.aborted) {
        void promise.catch(() => { });
        throw failure('Grok operation cancelled.', 'ABORT_ERR');
    }
    const cancellation = deferred();
    const abort = () => cancellation.reject(failure('Grok operation cancelled.', 'ABORT_ERR'));
    signal.addEventListener('abort', abort, { once: true });
    try {
        return await Promise.race([promise, cancellation.promise]);
    }
    finally {
        signal.removeEventListener('abort', abort);
    }
}
/** JSONL request correlation. Responses are independent of slow UI callbacks. */
export class GrokRpc {
    constructor(child, { requestTimeoutMs, maxFrameBytes, maxQueuedEvents, maxQueuedBytes, onNotification, onRequest, afterRequest, beforeNotification }) {
        this.child = child;
        this.requestTimeoutMs = requestTimeoutMs;
        this.maxFrameBytes = maxFrameBytes;
        this.maxQueuedEvents = maxQueuedEvents;
        this.maxQueuedBytes = maxQueuedBytes;
        this.onNotification = onNotification;
        this.onRequest = onRequest;
        this.afterRequest = afterRequest;
        this.beforeNotification = beforeNotification;
        this.pending = new Map();
        this.serverRequests = new Map();
        this.requestScopes = new Map();
        this.clearedRequests = new Set();
        this.handlers = new Set();
        this.nextId = 1;
        this.buffer = '';
        this.decoder = new StringDecoder('utf8');
        this.closed = false;
        this.queuedEvents = 0;
        this.queuedBytes = 0;
        this.writeBytes = 0;
        this.notifications = Promise.resolve();
        this.fatal = deferred();
        this.shutdown = deferred();
        this.onData = (chunk) => {
            if (this.closed)
                return;
            try {
                this.buffer += typeof chunk === 'string' ? chunk : this.decoder.write(chunk);
                let newline;
                while ((newline = this.buffer.indexOf('\n')) !== -1) {
                    const line = this.buffer.slice(0, newline);
                    this.buffer = this.buffer.slice(newline + 1);
                    if (Buffer.byteLength(line) > this.maxFrameBytes)
                        throw failure('Grok protocol frame exceeds its limit.');
                    if (line.trim())
                        this.receive(JSON.parse(line), Buffer.byteLength(line));
                }
                if (Buffer.byteLength(this.buffer) > this.maxFrameBytes)
                    throw failure('Grok protocol frame exceeds its limit.');
            }
            catch {
                this.fail(failure('Grok sent invalid or oversized protocol data.'));
            }
        };
        this.onStreamError = () => this.fail(failure('Grok protocol stream failed.'));
        this.onEnd = () => {
            // Drain frames preceding EOF before reporting an early process exit.
            void this.notifications.then(() => {
                if (!this.closed)
                    this.fail(failure('Grok ACP agent closed its protocol stream.'));
            });
        };
        child.stdout.on('data', this.onData);
        child.stdout.on('error', this.onStreamError);
        child.stdout.on('end', this.onEnd);
        child.stdin.on('error', this.onStreamError);
        // Drain diagnostics, but never publish stderr: it can contain credentials.
        this.drainStderr = () => { };
        child.stderr?.on('data', this.drainStderr);
        child.stderr?.on('error', this.onStreamError);
        void child.done.then(this.onEnd, this.onEnd);
    }
    fail(error) { if (!this.closed)
        this.fatal.reject(error); }
    async guard(promise, signal) {
        return abortable(Promise.race([promise, this.fatal.promise]), signal);
    }
    async send(message) {
        if (this.closed)
            throw failure('Grok connection is closed.');
        const frame = `${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`;
        const bytes = Buffer.byteLength(frame);
        if (bytes > this.maxFrameBytes || this.writeBytes + bytes > this.maxQueuedBytes)
            throw failure('Grok outgoing data exceeds its limit.');
        this.writeBytes += bytes;
        const write = new Promise((resolve, reject) => {
            this.child.stdin.write(frame, (error) => error ? reject(failure('Grok protocol write failed.')) : resolve());
        });
        const deadline = deferred();
        const timer = setTimeout(() => deadline.reject(failure('Grok ACP agent write timed out.', 'AGENTS_GROK_TIMEOUT')), this.requestTimeoutMs);
        try {
            await Promise.race([write, deadline.promise, this.shutdown.promise]);
        }
        finally {
            clearTimeout(timer ?? undefined);
            this.writeBytes -= bytes;
        }
    }
    async request(method, params, signal, { timeoutMs = this.requestTimeoutMs, onResult } = {}) {
        const id = this.nextId++;
        const response = deferred();
        response.onResult = onResult;
        this.pending.set(id, response);
        const timer = timeoutMs === null ? null : setTimeout(() => response.reject(failure('Grok ACP agent request timed out.', 'AGENTS_GROK_TIMEOUT')), timeoutMs);
        try {
            void this.send({ id, method, params }).catch(response.reject);
            return await this.guard(response.promise, signal);
        }
        finally {
            clearTimeout(timer ?? undefined);
            this.pending.delete(id);
        }
    }
    async notify(method, params, signal) {
        const deadline = deferred();
        const timer = setTimeout(() => deadline.reject(failure('Grok ACP agent write timed out.', 'AGENTS_GROK_TIMEOUT')), this.requestTimeoutMs);
        try {
            await this.guard(Promise.race([this.send({ method, params }), deadline.promise]), signal);
        }
        finally {
            clearTimeout(timer ?? undefined);
        }
    }
    reserve(bytes) {
        if (this.queuedBytes + bytes > this.maxQueuedBytes)
            throw failure('Grok pending protocol data exceeds its memory budget.');
        this.queuedBytes += bytes;
    }
    receive(message, bytes) {
        if (!message || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0')
            throw failure('Invalid Grok frame.');
        if (typeof message.method === 'string') {
            if (!message.params || typeof message.params !== 'object' || Array.isArray(message.params))
                throw failure('Invalid Grok parameters.');
            if (Object.hasOwn(message, 'id')) {
                if (!(typeof message.id === 'string' && message.id.length <= 1024) && !(typeof message.id === 'number' && Number.isSafeInteger(message.id)))
                    throw failure('Invalid Grok request id.');
                const signature = createHash('sha256').update(JSON.stringify([message.method, message.params])).digest('hex');
                if (this.serverRequests.has(message.id)) {
                    if (this.serverRequests.get(message.id) !== signature)
                        throw failure('Grok reused a request id for a different request.');
                    return; // The exact request has one callback and one response.
                }
                if (this.serverRequests.size >= this.maxQueuedEvents)
                    throw failure('Grok server request limit exceeded.');
                this.reserve(bytes);
                this.serverRequests.set(message.id, signature);
                const { sessionId } = message.params;
                const toolCallId = message.params.toolCall?.toolCallId ?? message.params.toolCallId;
                if (['session/request_permission', '_x.ai/ask_user_question'].includes(message.method))
                    this.requestScopes.set(message.id, { method: message.method,
                        sessionId: typeof sessionId === 'string' && sessionId.length <= 1024 ? sessionId : null,
                        toolCallId: typeof toolCallId === 'string' && toolCallId.length <= 1024 ? toolCallId : null });
                // Preserve the preceding item's display/details before asking, without
                // blocking later resolved/terminal notifications on the human answer.
                const handling = this.notifications.then(() => this.onRequest(message)).then(async (result) => {
                    if (!this.closed && !this.clearedRequests.has(message.id))
                        await this.send({ id: message.id, result });
                    await this.afterRequest?.(message.id);
                }, async (error) => {
                    if (!this.closed && !this.clearedRequests.has(message.id))
                        await this.send({ id: message.id, error: { code: -32601, message: 'This request is not supported by the host.' } });
                    this.fail(error);
                }).catch((error) => this.fail(error)).finally(() => { this.handlers.delete(handling); this.queuedBytes -= bytes; });
                this.handlers.add(handling);
            }
            else {
                // Control revocation must precede any slow display/persistence queue.
                this.beforeNotification?.(message.method, message.params);
                if (++this.queuedEvents > this.maxQueuedEvents)
                    throw failure('Grok notification queue limit exceeded.');
                this.reserve(bytes);
                this.notifications = this.notifications.then(() => {
                    if (!this.closed)
                        return this.onNotification(message.method, message.params);
                }).catch((error) => this.fail(error)).finally(() => { this.queuedEvents--; this.queuedBytes -= bytes; });
            }
            return;
        }
        if (!Object.hasOwn(message, 'id'))
            throw failure('Invalid Grok response.');
        const pending = this.pending.get(message.id);
        if (!pending)
            return; // Responses to locally cancelled requests are inert.
        if (Object.hasOwn(message, 'error')) {
            const code = Number.isSafeInteger(message.error?.code) ? message.error.code : null;
            pending.reject(Object.assign(failure('Grok ACP agent rejected the request.', 'AGENTS_GROK_REQUEST'), { rpcCode: code }));
        }
        else if (Object.hasOwn(message, 'result')) {
            pending.onResult?.(message.result);
            pending.resolve(message.result);
        }
        else
            throw failure('Invalid Grok response.');
    }
    invalidateRequest(id) { if (this.serverRequests.has(id))
        this.clearedRequests.add(id); }
    isRequestCleared(id) { return this.clearedRequests.has(id); }
    async quiesce() { await Promise.allSettled([this.notifications, ...this.handlers]); }
    close() {
        if (this.closed)
            return;
        this.closed = true;
        this.shutdown.reject(failure('Grok connection closed.'));
        this.child.stdout.off('data', this.onData);
        this.child.stdout.off('end', this.onEnd);
        this.child.stderr?.off('data', this.drainStderr);
        // Error listeners remain on these owned streams to contain late EPIPE.
        for (const pending of this.pending.values())
            pending.reject(failure('Grok connection closed.'));
        this.pending.clear();
    }
}
/** Managed-range emptiness, rather than the direct child's exit, is required. */
export async function cleanupGrokChild(child, wire, cleanupTimeoutMs) {
    wire?.close();
    let failed = false;
    try {
        child.stdin?.end();
    }
    catch { /* Termination below owns a closed pipe. */ }
    try {
        child.terminate();
    }
    catch {
        failed = true;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cleanupTimeoutMs);
    try {
        const empty = await abortable(Promise.resolve().then(() => child.waitForExit(controller.signal)), controller.signal);
        if (empty !== true || failed)
            throw failure('Grok process cleanup could not be confirmed.', 'AGENTS_CLEANUP_UNCONFIRMED');
        // done may reject for a failed spawn; an empty managed range is sufficient.
        await abortable(child.done.catch(() => { }), controller.signal);
        if (wire)
            await abortable(wire.quiesce(), controller.signal);
    }
    catch {
        throw failure('Grok process cleanup could not be confirmed.', 'AGENTS_CLEANUP_UNCONFIRMED');
    }
    finally {
        clearTimeout(timer ?? undefined);
    }
}
