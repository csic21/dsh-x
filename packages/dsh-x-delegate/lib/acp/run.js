/**
 * ACP child lifecycle for one delegation: spawn, handshake, authenticate,
 * configure, prompt, and quiescent disposal.
 *
 * Differences from the official provider, each driven by an observed defect:
 *
 * - `authenticate` is attempted from the peer's advertised methods, so agents
 *   such as Grok that require an explicit auth step can start at all.
 * - Session `configOptions` (model, effort, mode) are read and applied through
 *   `session/set_config_option`, so a caller can select a model instead of
 *   inheriting whatever the agent defaults to.
 * - Permission answers use three tiers instead of allow-all / deny-all.
 * - Streamed assistant chunks are grouped by message id, so a replayed or
 *   duplicated chunk cannot duplicate the answer text.
 *
 * @module dsh-x-delegate/acp/run
 */
import { randomUUID } from 'node:crypto';
import { settleRunResult, subprocessRunHandle, } from '@deepseek-ai/dsh-subagent';
import { deferred } from '../deferred.js';
import { ACP_METHODS, AcpRpcError, AcpWire, } from './wire.js';
/** Every accepted {@link PermissionPolicy}. */
export const PERMISSION_POLICIES = ['deny', 'read-only', 'allow'];
/** Tool kinds a `read-only` policy approves. */
const READ_ONLY_TOOL_KINDS = new Set(['read', 'search', 'think', 'fetch']);
/** Default grace between SIGTERM and SIGKILL on disposal. */
export const DEFAULT_DISPOSE_GRACE_MS = 3_000;
/** Default grace for the child's EOF-driven flush before escalation. */
export const DEFAULT_DISPOSE_EOF_GRACE_MS = 6_000;
/** Render fixed safe failure text from structured facts only. */
function failureDiagnostic(facts) {
    const fields = [`stage: ${facts.stage}`, `category: ${facts.category}`];
    const exitCode = facts.outcome?.exitCode;
    if (exitCode !== null && exitCode !== undefined)
        fields.push(`exit code: ${exitCode}`);
    const signal = facts.outcome?.signal;
    if (signal !== null && signal !== undefined)
        fields.push(`signal: ${signal}`);
    return `Delegated agent failure (${fields.join('; ')})`;
}
/** Render the retained permission decision. */
function permissionDiagnostic(decision) {
    return `Delegated agent permission (policy: ${decision.policy}; request: ${decision.request}; decision: ${decision.decision})`;
}
/** An unpublished-start failure carrying fixed facts. */
class AcpRunFailure extends Error {
    facts;
    constructor(facts, cause) {
        super(`dsh-x-delegate: ${failureDiagnostic(facts)}`, cause === undefined ? undefined : { cause });
        this.name = 'AcpRunFailure';
        this.facts = facts;
    }
}
/** Map an ACP stop reason to the harness vocabulary. */
export function acpStopReason(reason) {
    switch (reason) {
        case 'end_turn':
            return 'completed';
        case 'max_tokens':
            return 'max-tokens';
        case 'refusal':
            return 'refusal';
        case 'cancelled':
            return 'aborted';
        default:
            // An unknown terminal reason is a failure, never a silent success.
            return 'error';
    }
}
/** Normalize a caught value to an Error. */
function toError(value) {
    return value instanceof Error ? value : new Error(String(value));
}
/** Report a host failure without letting the sink replace it. */
function reportFailure(spec, error) {
    try {
        spec.onError?.(toError(error), 'error');
    }
    catch {
        // Host logging cannot replace the child failure.
    }
}
/** Extract the text of one ACP content block. */
function contentText(block) {
    if (block === null || typeof block !== 'object' || Array.isArray(block))
        return '';
    const text = block.text;
    return typeof text === 'string' ? text : '';
}
/** Translate harness prompt blocks into ACP text blocks. */
export function toAcpPrompt(prompt) {
    const blocks = [];
    for (const block of prompt) {
        if (block.type === 'text')
            blocks.push({ type: 'text', text: block.text });
    }
    return blocks;
}
/**
 * Accumulates streamed assistant text without duplicating replayed chunks.
 *
 * ACP agents emit `agent_message_chunk` updates. A reconnecting or replaying
 * agent can re-send chunks for the same message id; appending blindly would
 * duplicate the answer. Chunks are therefore grouped per message id, and the
 * final answer is the last non-empty group in arrival order.
 */
export class ChunkAccumulator {
    #byMessage = new Map();
    #order = [];
    #anonymous = '';
    /**
     * Add one chunk.
     * @param messageId - the ACP message id, when the agent supplied one.
     * @param text - the chunk text.
     */
    push(messageId, text) {
        if (text.length === 0)
            return;
        if (messageId === undefined || messageId.length === 0) {
            this.#anonymous += text;
            return;
        }
        if (!this.#byMessage.has(messageId))
            this.#order.push(messageId);
        // Chunks are deltas of one message. Replacing would keep only the last piece.
        this.#byMessage.set(messageId, (this.#byMessage.get(messageId) ?? '') + text);
    }
    /**
     * Select the answer: the last message group, else accumulated anonymous text.
     * @returns the selected text, or `''` when nothing arrived.
     */
    collect() {
        for (let index = this.#order.length - 1; index >= 0; index -= 1) {
            const id = this.#order[index];
            if (id === undefined)
                continue;
            const text = this.#byMessage.get(id);
            if (text !== undefined && text.length > 0)
                return text;
        }
        return this.#anonymous;
    }
}
/** Read the advertised auth method ids from the peer's capabilities. */
function advertisedAuthMethods(capabilities) {
    const methods = capabilities.authMethods;
    if (!Array.isArray(methods))
        return [];
    const ids = [];
    for (const method of methods) {
        if (method === null || typeof method !== 'object' || Array.isArray(method))
            continue;
        const id = method.id;
        if (typeof id === 'string' && id.length > 0)
            ids.push(id);
    }
    return ids;
}
/** Decide one permission request under the configured policy. */
export function decidePermission(policy, params) {
    const toolCall = params.toolCall;
    const kind = toolCall !== null && typeof toolCall === 'object' && !Array.isArray(toolCall) && typeof toolCall.kind === 'string'
        ? toolCall.kind
        : 'unknown';
    const options = Array.isArray(params.options) ? params.options : [];
    const allow = options.find(option => {
        if (option === null || typeof option !== 'object' || Array.isArray(option))
            return false;
        return option.kind === 'allow_once' || option.kind === 'allow_always';
    });
    const optionId = allow !== null && typeof allow === 'object' && !Array.isArray(allow) && typeof allow.optionId === 'string'
        ? allow.optionId
        : undefined;
    const permitted = policy === 'allow'
        || (policy === 'read-only' && READ_ONLY_TOOL_KINDS.has(kind));
    if (permitted && optionId !== undefined) {
        return {
            outcome: { outcome: 'selected', optionId },
            decision: { policy, request: kind, decision: 'allowed' },
        };
    }
    return {
        outcome: { outcome: 'cancelled' },
        decision: { policy, request: kind, decision: 'denied' },
    };
}
/** Bounded wait for the managed range to empty. */
async function rangeExitsWithin(child, ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); }, ms);
    try {
        return await child.waitForExit(controller.signal);
    }
    finally {
        clearTimeout(timer);
    }
}
/**
 * Cooperative teardown: stdin EOF, then the terminate escalation, then the
 * process owner's exit proof.
 * @param child - the spawned child handle.
 * @param eofGraceMs - tier-1 window after stdin EOF.
 */
export async function disposeAcpChild(child, eofGraceMs) {
    const failures = [];
    try {
        child.stdin?.end();
    }
    catch {
        // A concurrently closed stdin does not change range ownership.
    }
    let exited = false;
    try {
        exited = await rangeExitsWithin(child, eofGraceMs);
    }
    catch (error) {
        failures.push(toError(error));
    }
    if (!exited) {
        child.terminate();
        try {
            await child.waitForExit();
        }
        catch (error) {
            failures.push(toError(error));
        }
    }
    await child.done.catch(() => { });
    if (failures.length === 1)
        throw failures[0];
    if (failures.length > 1)
        throw new AggregateError(failures, 'ACP child teardown failed');
}
/**
 * Start one ACP delegation and publish its run handle.
 * @param request - the subagent start request; its signal is the cancellation channel.
 * @param spec - resolved spawn, policy, and configuration inputs.
 * @returns the published run.
 */
export async function startAcpRun(request, spec) {
    if (request.signal.aborted)
        throw new Error('delegation aborted before the ACP child started');
    const id = randomUUID();
    let child;
    try {
        child = spec.spawn({
            argv: [spec.command, ...spec.args],
            cwd: spec.cwd,
            stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'inherit' },
            graceMs: spec.disposeGraceMs,
            env: spec.env,
        });
    }
    catch (error) {
        reportFailure(spec, error);
        throw new AcpRunFailure({ stage: 'process', category: 'process-start' }, error);
    }
    if (child.stdin === undefined || child.stdout === undefined) {
        child.terminate();
        throw new Error('dsh-x-delegate: the subprocess implementation dropped a piped protocol stream');
    }
    let processOutcome;
    let processFailure;
    const processDone = child.done.then(outcome => { processOutcome = outcome; return outcome; }, (error) => { processFailure = toError(error); throw processFailure; });
    const processRejected = processDone.then(() => new Promise(() => { }), (error) => Promise.reject(toError(error)));
    processRejected.catch(() => { });
    const observeOutcome = async (signal) => {
        if (processOutcome !== undefined)
            return processOutcome;
        const timeout = AbortSignal.timeout(Math.ceil(spec.disposeGraceMs));
        const bound = signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
        const aborted = deferred();
        const onAbort = () => { aborted.resolve(undefined); };
        bound.addEventListener('abort', onAbort, { once: true });
        if (bound.aborted)
            onAbort();
        try {
            return await Promise.race([processDone, aborted.promise]);
        }
        catch {
            return processOutcome;
        }
        finally {
            bound.removeEventListener('abort', onAbort);
        }
    };
    let processDisposal;
    const disposeProcess = () => (processDisposal ??= disposeAcpChild(child, spec.disposeEofGraceMs));
    const accumulator = new ChunkAccumulator();
    const flags = { cancelled: false };
    let latestPermission;
    let diagnostic;
    const streams = {
        output: child.stdin,
        input: child.stdout,
    };
    const wire = new AcpWire({
        streams,
        onNotification: ({ method, params }) => {
            if (method !== ACP_METHODS.client.sessionUpdate)
                return;
            const update = params.update;
            if (update === null || typeof update !== 'object' || Array.isArray(update))
                return;
            if (update.sessionUpdate !== 'agent_message_chunk')
                return;
            const messageId = typeof update.messageId === 'string' ? update.messageId : undefined;
            accumulator.push(messageId, contentText(update.content));
        },
        onRequest: ({ method, params }) => {
            if (method !== ACP_METHODS.client.requestPermission) {
                // Unknown client methods fail closed with a JSON-RPC error frame.
                throw new Error(`unsupported client method: ${method}`);
            }
            const decided = decidePermission(spec.permission, params);
            latestPermission = decided.decision;
            return decided.outcome;
        },
    });
    let sessionId;
    let startupStage = 'initialize';
    const cancelSettled = deferred();
    const requestCancel = () => {
        if (flags.cancelled)
            return;
        flags.cancelled = true;
        cancelSettled.resolve();
        if (sessionId !== undefined)
            wire.cancel(sessionId);
    };
    const onAbort = () => { requestCancel(); };
    request.signal.addEventListener('abort', onAbort, { once: true });
    const collectOutput = () => {
        const text = accumulator.collect();
        return text.length > 0 ? [{ type: 'text', text }] : [];
    };
    try {
        await Promise.race([
            (async () => {
                const capabilities = await wire.initialize({ name: 'dsh-x-delegate', version: '0.1.0' }, {}, request.signal);
                startupStage = 'authenticate';
                const methodIds = advertisedAuthMethods(capabilities);
                const authId = spec.authMethodId ?? methodIds[0];
                if (authId !== undefined) {
                    try {
                        await wire.authenticate(authId, request.signal);
                    }
                    catch (error) {
                        // An explicitly configured method must succeed. An auto-selected
                        // method may be declined by a peer that is already signed in.
                        if (spec.authMethodId !== undefined || !(error instanceof AcpRpcError))
                            throw error;
                    }
                }
                startupStage = 'new-session';
                const session = await wire.newSession(spec.cwd, [], request.signal);
                sessionId = session.sessionId;
                if (spec.config !== undefined) {
                    startupStage = 'configure';
                    for (const [configId, value] of Object.entries(spec.config)) {
                        await wire.setConfigOption(session.sessionId, configId, value, request.signal);
                    }
                }
                if (flags.cancelled)
                    throw new Error('delegation cancelled before the ACP session started');
            })(),
            processRejected,
            cancelSettled.promise.then(() => {
                throw new Error('delegation cancelled before the ACP session started');
            }),
        ]);
    }
    catch (error) {
        request.signal.removeEventListener('abort', onAbort);
        const cancelledBeforeCleanup = flags.cancelled;
        const observedOutcome = !cancelledBeforeCleanup && !(error instanceof AcpRunFailure)
            ? await observeOutcome()
            : undefined;
        wire.close(toError(error));
        if (!cancelledBeforeCleanup) {
            reportFailure(spec, error instanceof AcpRunFailure ? error.cause : processFailure ?? error);
        }
        try {
            await disposeProcess();
        }
        catch (cleanupError) {
            reportFailure(spec, cleanupError);
            const cleanupFailure = new AcpRunFailure({
                stage: 'teardown',
                category: processOutcome === undefined ? 'unknown' : 'process-exit',
                ...(processOutcome === undefined ? {} : { outcome: processOutcome }),
            }, cleanupError);
            throw cancelledBeforeCleanup
                ? new AggregateError([cleanupFailure], cleanupFailure.message)
                : new AggregateError([error instanceof AcpRunFailure ? error : startupFailure(error, startupStage, observedOutcome), cleanupFailure], `${(error instanceof AcpRunFailure ? error : startupFailure(error, startupStage, observedOutcome)).message}; ${cleanupFailure.message}`);
        }
        if (cancelledBeforeCleanup)
            throw new Error('delegation aborted before the ACP child started');
        throw error instanceof AcpRunFailure ? error : startupFailure(error, startupStage, observedOutcome);
    }
    if (sessionId === undefined)
        throw new Error('unreachable: ACP startup fulfilled without a session id');
    const remoteSessionId = sessionId;
    const result = settleRunResult({
        attempt: async () => {
            try {
                const stopReason = await Promise.race([
                    wire.prompt(remoteSessionId, toAcpPrompt(request.prompt), request.signal),
                    cancelSettled.promise.then(() => {
                        throw new Error('delegation cancelled while the ACP prompt was running');
                    }),
                ]);
                const mapped = acpStopReason(stopReason);
                if (mapped !== 'completed') {
                    diagnostic = latestPermission === undefined
                        ? `Delegated agent stopped with reason: ${stopReason}`
                        : `${failureDiagnostic({ stage: 'prompt', category: 'remote-limit' })}\n${permissionDiagnostic(latestPermission)}`;
                }
                return {
                    output: collectOutput(),
                    ...(diagnostic === undefined ? {} : { diagnostic }),
                    stopReason: mapped,
                };
            }
            catch (error) {
                if (!flags.cancelled) {
                    const outcome = await observeOutcome(request.signal);
                    const facts = outcome === undefined
                        ? { stage: 'prompt', category: 'transport' }
                        : { stage: 'process', category: 'process-exit', outcome };
                    diagnostic = latestPermission === undefined
                        ? failureDiagnostic(facts)
                        : `${failureDiagnostic(facts)}\n${permissionDiagnostic(latestPermission)}`;
                }
                throw processFailure ?? error;
            }
        },
        collectOutput,
        collectDiagnostic: () => diagnostic,
        cancelled: () => flags.cancelled,
        onError: spec.onError,
        signal: request.signal,
        onAbort,
    });
    return subprocessRunHandle({
        id,
        result,
        signal: request.signal,
        onAbort,
        requestCancel,
        teardown: async () => {
            try {
                await disposeProcess();
            }
            catch (error) {
                reportFailure(spec, error);
                throw new AcpRunFailure({
                    stage: 'teardown',
                    category: processOutcome === undefined ? 'unknown' : 'process-exit',
                    ...(processOutcome === undefined ? {} : { outcome: processOutcome }),
                }, error);
            }
        },
    });
}
/** Classify an unpublished startup failure. */
function startupFailure(error, stage, outcome) {
    const category = stage === 'authenticate'
        ? 'authentication'
        : stage === 'configure'
            ? 'configuration'
            : outcome === undefined ? 'transport' : 'process-exit';
    return new AcpRunFailure({ stage, category, ...(outcome === undefined ? {} : { outcome }) }, error);
}
