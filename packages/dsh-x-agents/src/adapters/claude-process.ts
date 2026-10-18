import type { SpawnedProcess } from '@anthropic-ai/claude-agent-sdk'
import type { Deferred } from '../types.ts'
import { EventEmitter } from 'node:events';
import { PassThrough, Transform } from 'node:stream';

export const failure = (message: any, code = 'AGENTS_CLAUDE_PROTOCOL') => Object.assign(new Error(message), { code });
export function deferred(): Deferred {
  let resolve!: (value?: any) => void, reject!: (reason?: unknown) => void;
  const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no; });
  promise.catch(() => {});
  return { promise, resolve, reject };
}
export async function abortable(promise: any, signal: any) {
  if (!signal) return promise;
  if (signal.aborted) { void promise.catch(() => {}); throw failure('Claude operation cancelled.', 'ABORT_ERR'); }
  const gate = deferred(), abort = () => gate.reject(failure('Claude operation cancelled.', 'ABORT_ERR'));
  signal.addEventListener('abort', abort, { once: true });
  try { return await Promise.race([promise, gate.promise]); }
  finally { signal.removeEventListener('abort', abort); }
}
export async function deadline(promise: any, ms: any, signal: any) {
  const gate = deferred(), timer = setTimeout(() => gate.reject(failure('Claude native protocol timed out.', 'AGENTS_CLAUDE_TIMEOUT')), ms);
  try { return await abortable(Promise.race([promise, gate.promise]), signal); }
  finally { clearTimeout(timer); }
}

/** Bound protocol data BEFORE the SDK's readline/async message queue. */
class FrameLimit extends Transform {
  declare emit: any
  declare push: any

  declare onFrame: any
  declare maxFrameBytes: any
  declare maxOutputBytes: any
  declare maxFrames: any
  declare frameBytes: number
  declare bytes: number
  declare frames: number
  declare pending: any
  declare failed: boolean

  constructor({ maxFrameBytes, maxOutputBytes, maxFrames, onFrame }: any) {
    super(); this.onFrame = onFrame; this.maxFrameBytes = maxFrameBytes; this.maxOutputBytes = maxOutputBytes; this.maxFrames = maxFrames;
    this.frameBytes = 0; this.bytes = 0; this.frames = 0; this.pending = Buffer.alloc(0);
  }
  reject(callback: any) { this.failed = true; this.emit('protocol-error'); callback(); }
  _flush(callback: any) { if (this.pending.length && !this.failed) return this.reject(callback); callback(); }
  _transform(chunk: any, encoding: any, callback: any) {
    if (this.failed) return callback();
    this.bytes += chunk.length;
    if (this.bytes > this.maxOutputBytes) return this.reject(callback);
    for (const value of chunk) {
      if (value === 10) { this.frameBytes = 0; if (++this.frames > this.maxFrames) return this.reject(callback); }
      else if (++this.frameBytes > this.maxFrameBytes) return this.reject(callback);
    }
    this.pending = Buffer.concat([this.pending, chunk]);
    try {
      let at;
      while ((at = this.pending.indexOf(10)) >= 0) {
        const line = this.pending.subarray(0, at); this.pending = this.pending.subarray(at + 1);
        if (!line.toString('utf8').trim()) continue;
        const message = JSON.parse(line.toString('utf8'));
        if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') throw failure('Invalid Claude protocol frame.');
        if (message.type === 'control_request' && !['can_use_tool', 'elicitation', 'request_user_dialog'].includes(message.request?.subtype)) throw failure('Unsupported Claude control request.');
        this.onFrame?.(message);
        this.push(Buffer.concat([line, Buffer.from('\n')]));
      }
      callback();
    } catch { this.reject(callback); }
  }
}

/** Final write-time fence for SDK replies queued before native cancellation. */
class ReplyFence extends Transform {
  declare push: any

  declare owner: any
  declare pending: any

  constructor(owner: any) { super({ highWaterMark: 65536 }); this.owner = owner; this.pending = Buffer.alloc(0); }
  _transform(chunk: any, encoding: any, callback: any) {
    this.pending = Buffer.concat([this.pending, chunk]);
    if (this.pending.length > this.owner.options.maxFrameBytes) return callback(failure('Claude outgoing frame exceeded its limit.'));
    try {
      let at;
      while ((at = this.pending.indexOf(10)) >= 0) {
        const line = this.pending.subarray(0, at); this.pending = this.pending.subarray(at + 1);
        if (!line.toString('utf8').trim()) continue;
        const message = JSON.parse(line.toString('utf8')), response = message.response;
        if (message.type === 'control_response' && response?.response?.behavior === 'allow'
          && (this.owner.closed || this.owner.requestController.signal.aborted || this.owner.cancelledRequests.has(response.request_id))) {
          response.response = { behavior: 'deny', message: 'The native request is no longer active.', interrupt: true,
            ...(response.response.toolUseID ? { toolUseID: response.response.toolUseID } : {}) };
        }
        this.push(`${JSON.stringify(message)}\n`);
      }
      callback();
    } catch { callback(failure('Claude outgoing protocol was invalid.')); }
  }
}

/**
 * The SDK requires a synchronous SpawnedProcess. The host has an asynchronous
 * managed-range spawner. This stream shell never invokes child_process itself.
 * Range cleanup includes a spawn still awaiting confinement, not just root exit.
 */
export class ClaudeProcessOwner {
  declare spawn: any
  declare options: any
  declare processes: any[]
  declare fatal: any
  declare closed: boolean
  declare nativeResultReceived: boolean
  declare requestController: any
  declare cancelledRequests: Set<any>

  constructor(spawn: any, options: any) { this.spawn = spawn; this.options = options; this.processes = []; this.fatal = deferred(); this.closed = false; this.nativeResultReceived = false; this.requestController = new AbortController(); this.cancelledRequests = new Set<any>(); }
  create = (native: any) => {
    if (this.closed || this.processes.length) throw failure('Claude attempted an unexpected additional process.');
    if (typeof native.command !== 'string' || !Array.isArray(native.args) || native.args.some((arg: any) => typeof arg !== 'string')) throw failure('Claude returned invalid process arguments.');
    const shell = new EventEmitter() as EventEmitter & { -readonly [K in keyof SpawnedProcess]: SpawnedProcess[K] } & { stdout: Transform };
    shell.stdin = new ReplyFence(this);
    shell.stdout = native.args.length === 1 && native.args[0] === '--version' ? new PassThrough({ highWaterMark: 8192 }) : new FrameLimit({ ...this.options, onFrame: (message: any) => {
      // Revoke requests at ingress, before the SDK/UI async queues can lag.
      if (message.type === 'result') { this.nativeResultReceived = true; this.requestController.abort(); }
      if (message.type === 'control_cancel_request' && typeof message.request_id === 'string') this.cancelledRequests.add(message.request_id);
    } });
    shell.killed = false; shell.exitCode = null; shell.signalCode = null;
    // SDK listeners arrive after create() returns. Keep late errors contained.
    shell.on('error', () => {});
    const launch = new AbortController();
    const launchSignal = AbortSignal.any([launch.signal, native.signal].filter(Boolean));
    const entry: {shell: typeof shell, child: any, ready?: Promise<void>, terminated: boolean, terminateFailed: boolean} = { shell, child: null, terminated: false, terminateFailed: false };
    const fatal = () => { if (this.closed) return; const error = failure('Claude managed protocol stream failed.'); this.fatal.reject(error); shell.emit('error', error); };
    shell.stdin.on('error', fatal); shell.stdout.on('error', fatal); shell.stdout.on('protocol-error', fatal);
    shell.kill = () => {
      shell.killed = true; launch.abort();
      if (entry.child && !entry.terminated) {
        entry.terminated = true;
        try { entry.child.terminate(); } catch { entry.terminateFailed = true; }
      }
      return !entry.terminateFailed;
    };
    const env = { ...Object.fromEntries(Object.keys(process.env).map(key => [key, undefined])), ...native.env };
    entry.ready = Promise.resolve().then(() => {
      if (this.closed || launchSignal.aborted) return null;
      return this.spawn({ argv: [native.command, ...native.args], cwd: native.cwd,
      stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' }, env, signal: launchSignal, graceMs: this.options.graceMs,
    }); }).then(child => {
      if (child === null && (this.closed || launchSignal.aborted)) return null;
      entry.child = child;
      if (!child?.stdin || !child?.stdout || !child?.done || typeof child.terminate !== 'function' || typeof child.waitForExit !== 'function') {
        entry.terminateFailed = true;
        throw failure('Claude requires a managed subprocess range with confirmed cleanup.');
      }
      child.stdin.on('error', fatal); child.stdout.on('error', fatal);
      child.stderr?.on('error', fatal);
      // Drain stderr without publishing it: it can contain credentials.
      child.stderr?.on('data', () => {});
      shell.stdin.pipe(child.stdin);
      child.stdout.pipe(shell.stdout);
      void child.done.then((outcome: any) => {
        shell.exitCode = outcome?.exitCode ?? null; shell.signalCode = outcome?.signal ?? null;
        shell.emit('exit', shell.exitCode, shell.signalCode);
      }, () => { const error = failure('Claude managed process failed.'); this.fatal.reject(error); shell.emit('error', error); });
      if (shell.killed || this.closed) shell.kill('SIGTERM');
      return child;
    }).catch(error => {
      const cleanupUnconfirmed = error?.code === 'AGENTS_CLEANUP_UNCONFIRMED';
      const clean = failure('Claude managed process could not start.', cleanupUnconfirmed ? error.code : undefined);
      this.fatal.reject(clean); shell.emit('error', clean); shell.stdout.end();
      // Host rollback is trusted only when it did not report cleanup uncertainty.
      if (entry.child || cleanupUnconfirmed) entry.terminateFailed = true;
      return null;
    });
    this.processes.push(entry);
    return shell;
  };
  guard(promise: any, signal: any) { return abortable(Promise.race([promise, this.fatal.promise]), signal); }
  async close(query?: any) {
    this.closed = true; this.requestController.abort();
    let closeFailed = false;
    try { query?.close(); } catch { closeFailed = true; }
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), this.options.cleanupTimeoutMs);
    try {
      for (const entry of this.processes) {
        entry.shell.kill('SIGTERM');
        const child = await abortable(entry.ready, controller.signal);
        if (entry.terminateFailed) throw failure('Claude termination could not be confirmed.');
        if (child) {
          entry.shell.kill('SIGTERM');
          try { child.stdin.end(); } catch { /* managed termination owns it */ }
          const empty = await abortable(Promise.resolve().then(() => child.waitForExit(controller.signal)), controller.signal);
          if (empty !== true) throw failure('Claude managed range is not confirmed empty.');
          await abortable(child.done.catch(() => {}), controller.signal);
        }
        entry.shell.stdin.destroy(); entry.shell.stdout.destroy();
      }
      if (closeFailed) throw failure('Claude SDK could not close.');
    } catch { throw failure('Claude process cleanup could not be confirmed.', 'AGENTS_CLEANUP_UNCONFIRMED'); }
    finally { clearTimeout(timer); }
  }
}
