import { EventEmitter } from 'node:events';
import { PassThrough, Transform } from 'node:stream';
export const failure = (message, code = 'AGENTS_CLAUDE_PROTOCOL') => Object.assign(new Error(message), { code });
export function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    promise.catch(() => { });
    return { promise, resolve, reject };
}
export async function abortable(promise, signal) {
    if (!signal)
        return promise;
    if (signal.aborted) {
        void promise.catch(() => { });
        throw failure('Claude operation cancelled.', 'ABORT_ERR');
    }
    const gate = deferred(), abort = () => gate.reject(failure('Claude operation cancelled.', 'ABORT_ERR'));
    signal.addEventListener('abort', abort, { once: true });
    try {
        return await Promise.race([promise, gate.promise]);
    }
    finally {
        signal.removeEventListener('abort', abort);
    }
}
export async function deadline(promise, ms, signal) {
    const gate = deferred(), timer = setTimeout(() => gate.reject(failure('Claude native protocol timed out.', 'AGENTS_CLAUDE_TIMEOUT')), ms);
    try {
        return await abortable(Promise.race([promise, gate.promise]), signal);
    }
    finally {
        clearTimeout(timer);
    }
}
/** Bound protocol data BEFORE the SDK's readline/async message queue. */
class FrameLimit extends Transform {
    constructor({ maxFrameBytes, maxOutputBytes, maxFrames, onFrame }) {
        super();
        this.onFrame = onFrame;
        this.maxFrameBytes = maxFrameBytes;
        this.maxOutputBytes = maxOutputBytes;
        this.maxFrames = maxFrames;
        this.frameBytes = 0;
        this.bytes = 0;
        this.frames = 0;
        this.pending = Buffer.alloc(0);
    }
    reject(callback) { this.failed = true; this.emit('protocol-error'); callback(); }
    _flush(callback) { if (this.pending.length && !this.failed)
        return this.reject(callback); callback(); }
    _transform(chunk, encoding, callback) {
        if (this.failed)
            return callback();
        this.bytes += chunk.length;
        if (this.bytes > this.maxOutputBytes)
            return this.reject(callback);
        for (const value of chunk) {
            if (value === 10) {
                this.frameBytes = 0;
                if (++this.frames > this.maxFrames)
                    return this.reject(callback);
            }
            else if (++this.frameBytes > this.maxFrameBytes)
                return this.reject(callback);
        }
        this.pending = Buffer.concat([this.pending, chunk]);
        try {
            let at;
            while ((at = this.pending.indexOf(10)) >= 0) {
                const line = this.pending.subarray(0, at);
                this.pending = this.pending.subarray(at + 1);
                if (!line.toString('utf8').trim())
                    continue;
                const message = JSON.parse(line.toString('utf8'));
                if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string')
                    throw failure('Invalid Claude protocol frame.');
                if (message.type === 'control_request' && !['can_use_tool', 'elicitation', 'request_user_dialog'].includes(message.request?.subtype))
                    throw failure('Unsupported Claude control request.');
                this.onFrame?.(message);
                this.push(Buffer.concat([line, Buffer.from('\n')]));
            }
            callback();
        }
        catch {
            this.reject(callback);
        }
    }
}
/** Final write-time fence for SDK replies queued before native cancellation. */
class ReplyFence extends Transform {
    constructor(owner) { super({ highWaterMark: 65536 }); this.owner = owner; this.pending = Buffer.alloc(0); }
    _transform(chunk, encoding, callback) {
        this.pending = Buffer.concat([this.pending, chunk]);
        if (this.pending.length > this.owner.options.maxFrameBytes)
            return callback(failure('Claude outgoing frame exceeded its limit.'));
        try {
            let at;
            while ((at = this.pending.indexOf(10)) >= 0) {
                const line = this.pending.subarray(0, at);
                this.pending = this.pending.subarray(at + 1);
                if (!line.toString('utf8').trim())
                    continue;
                const message = JSON.parse(line.toString('utf8')), response = message.response;
                if (message.type === 'control_response' && response?.response?.behavior === 'allow'
                    && (this.owner.closed || this.owner.requestController.signal.aborted || this.owner.cancelledRequests.has(response.request_id))) {
                    response.response = { behavior: 'deny', message: 'The native request is no longer active.', interrupt: true,
                        ...(response.response.toolUseID ? { toolUseID: response.response.toolUseID } : {}) };
                }
                this.push(`${JSON.stringify(message)}\n`);
            }
            callback();
        }
        catch {
            callback(failure('Claude outgoing protocol was invalid.'));
        }
    }
}
/**
 * The SDK requires a synchronous SpawnedProcess. The host has an asynchronous
 * managed-range spawner. This stream shell never invokes child_process itself.
 * Range cleanup includes a spawn still awaiting confinement, not just root exit.
 */
export class ClaudeProcessOwner {
    constructor(spawn, options) { this.spawn = spawn; this.options = options; this.processes = []; this.fatal = deferred(); this.closed = false; this.nativeResultReceived = false; this.requestController = new AbortController(); this.cancelledRequests = new Set(); }
    create = (native) => {
        if (this.closed || this.processes.length)
            throw failure('Claude attempted an unexpected additional process.');
        if (typeof native.command !== 'string' || !Array.isArray(native.args) || native.args.some((arg) => typeof arg !== 'string'))
            throw failure('Claude returned invalid process arguments.');
        const shell = new EventEmitter();
        shell.stdin = new ReplyFence(this);
        shell.stdout = native.args.length === 1 && native.args[0] === '--version' ? new PassThrough({ highWaterMark: 8192 }) : new FrameLimit({ ...this.options, onFrame: (message) => {
                // Revoke requests at ingress, before the SDK/UI async queues can lag.
                if (message.type === 'result') {
                    this.nativeResultReceived = true;
                    this.requestController.abort();
                }
                if (message.type === 'control_cancel_request' && typeof message.request_id === 'string')
                    this.cancelledRequests.add(message.request_id);
            } });
        shell.killed = false;
        shell.exitCode = null;
        shell.signalCode = null;
        // SDK listeners arrive after create() returns. Keep late errors contained.
        shell.on('error', () => { });
        const launch = new AbortController();
        const launchSignal = AbortSignal.any([launch.signal, native.signal].filter(Boolean));
        const entry = { shell, child: null, terminated: false, terminateFailed: false };
        const fatal = () => { if (this.closed)
            return; const error = failure('Claude managed protocol stream failed.'); this.fatal.reject(error); shell.emit('error', error); };
        shell.stdin.on('error', fatal);
        shell.stdout.on('error', fatal);
        shell.stdout.on('protocol-error', fatal);
        shell.kill = () => {
            shell.killed = true;
            launch.abort();
            if (entry.child && !entry.terminated) {
                entry.terminated = true;
                try {
                    entry.child.terminate();
                }
                catch {
                    entry.terminateFailed = true;
                }
            }
            return !entry.terminateFailed;
        };
        const env = { ...Object.fromEntries(Object.keys(process.env).map(key => [key, undefined])), ...native.env };
        entry.ready = Promise.resolve().then(() => {
            if (this.closed || launchSignal.aborted)
                return null;
            return this.spawn({ argv: [native.command, ...native.args], cwd: native.cwd,
                stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' }, env, signal: launchSignal, graceMs: this.options.graceMs,
            });
        }).then(child => {
            if (child === null && (this.closed || launchSignal.aborted))
                return null;
            entry.child = child;
            if (!child?.stdin || !child?.stdout || !child?.done || typeof child.terminate !== 'function' || typeof child.waitForExit !== 'function') {
                entry.terminateFailed = true;
                throw failure('Claude requires a managed subprocess range with confirmed cleanup.');
            }
            child.stdin.on('error', fatal);
            child.stdout.on('error', fatal);
            child.stderr?.on('error', fatal);
            // Drain stderr without publishing it: it can contain credentials.
            child.stderr?.on('data', () => { });
            shell.stdin.pipe(child.stdin);
            child.stdout.pipe(shell.stdout);
            void child.done.then((outcome) => {
                shell.exitCode = outcome?.exitCode ?? null;
                shell.signalCode = outcome?.signal ?? null;
                shell.emit('exit', shell.exitCode, shell.signalCode);
            }, () => { const error = failure('Claude managed process failed.'); this.fatal.reject(error); shell.emit('error', error); });
            if (shell.killed || this.closed)
                shell.kill('SIGTERM');
            return child;
        }).catch(error => {
            const cleanupUnconfirmed = error?.code === 'AGENTS_CLEANUP_UNCONFIRMED';
            const clean = failure('Claude managed process could not start.', cleanupUnconfirmed ? error.code : undefined);
            this.fatal.reject(clean);
            shell.emit('error', clean);
            shell.stdout.end();
            // Host rollback is trusted only when it did not report cleanup uncertainty.
            if (entry.child || cleanupUnconfirmed)
                entry.terminateFailed = true;
            return null;
        });
        this.processes.push(entry);
        return shell;
    };
    guard(promise, signal) { return abortable(Promise.race([promise, this.fatal.promise]), signal); }
    async close(query) {
        this.closed = true;
        this.requestController.abort();
        let closeFailed = false;
        try {
            query?.close();
        }
        catch {
            closeFailed = true;
        }
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), this.options.cleanupTimeoutMs);
        try {
            for (const entry of this.processes) {
                entry.shell.kill('SIGTERM');
                const child = await abortable(entry.ready, controller.signal);
                if (entry.terminateFailed)
                    throw failure('Claude termination could not be confirmed.');
                if (child) {
                    entry.shell.kill('SIGTERM');
                    try {
                        child.stdin.end();
                    }
                    catch { /* managed termination owns it */ }
                    const empty = await abortable(Promise.resolve().then(() => child.waitForExit(controller.signal)), controller.signal);
                    if (empty !== true)
                        throw failure('Claude managed range is not confirmed empty.');
                    await abortable(child.done.catch(() => { }), controller.signal);
                }
                entry.shell.stdin.destroy();
                entry.shell.stdout.destroy();
            }
            if (closeFailed)
                throw failure('Claude SDK could not close.');
        }
        catch {
            throw failure('Claude process cleanup could not be confirmed.', 'AGENTS_CLEANUP_UNCONFIRMED');
        }
        finally {
            clearTimeout(timer);
        }
    }
}
