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

import { randomUUID } from 'node:crypto'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import {
  settleRunResult,
  subprocessRunHandle,
  type SubagentResult,
  type SubagentRun,
  type SubagentStartRequest,
  type SubagentStopReason,
} from '@deepseek-ai/dsh-subagent'
import type { SubprocessHandle, SubprocessOutcome, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { deferred } from '../deferred.ts'
import {
  ACP_METHODS,
  AcpRpcError,
  AcpWire,
  type AcpWireStreams,
  type JsonObject,
  type JsonValue,
} from './wire.ts'

/** How unattended permission requests are answered. */
export type PermissionPolicy =
  /** Decline every request. */
  | 'deny'
  /** Approve read-only tool kinds; decline anything that mutates or executes. */
  | 'read-only'
  /** Approve every request that offers an allow option. */
  | 'allow'

/** Every accepted {@link PermissionPolicy}. */
export const PERMISSION_POLICIES = ['deny', 'read-only', 'allow'] as const

/** Tool kinds a `read-only` policy approves. */
const READ_ONLY_TOOL_KINDS: ReadonlySet<string> = new Set(['read', 'search', 'think', 'fetch'])

/** Default grace between SIGTERM and SIGKILL on disposal. */
export const DEFAULT_DISPOSE_GRACE_MS = 3_000

/** Default grace for the child's EOF-driven flush before escalation. */
export const DEFAULT_DISPOSE_EOF_GRACE_MS = 6_000

/** Which model the child session should use. */
export interface ModelSelection {
  /** The `configOptions` id to set, usually `model`. */
  readonly configId: string
  /** The option value to select. */
  readonly value: string
}

/** Fully resolved inputs for one ACP delegation. */
export interface AcpRunSpec {
  /** Executable to spawn. */
  readonly command: string
  /** Arguments passed to {@link command}. */
  readonly args: readonly string[]
  /** Absolute working directory for both the process and the ACP session. */
  readonly cwd: string
  /** Unattended permission policy. */
  readonly permission: PermissionPolicy
  /** Extra environment entries layered over the scrubbed parent environment. */
  readonly env: Record<string, string>
  /** Optional session configuration applied after `session/new`. */
  readonly config?: Readonly<Record<string, string>> | undefined
  /** Optional auth method id to try when the peer advertises one. */
  readonly authMethodId?: string | undefined
  /** Grace for the child's EOF-driven flush. */
  readonly disposeEofGraceMs: number
  /** Grace between termination tiers. */
  readonly disposeGraceMs: number
  /** Spawn function from the subprocess seam. */
  readonly spawn: (spec: SubprocessSpawnSpec) => SubprocessHandle
  /** Host sink for original failures. */
  readonly onError?: ((error: Error, stopReason: SubagentStopReason) => void) | undefined
}

/** Failure stages this backend reports. */
type AcpFailureStage = 'initialize' | 'authenticate' | 'new-session' | 'configure' | 'prompt' | 'process' | 'teardown'

/** Failure categories this backend reports. */
type AcpFailureCategory = 'protocol' | 'authentication' | 'configuration' | 'transport' | 'process-start' | 'process-exit' | 'remote-limit' | 'unknown'

/** Structured, provider-owned failure facts. */
interface AcpFailureFacts {
  readonly stage: AcpFailureStage
  readonly category: AcpFailureCategory
  readonly outcome?: SubprocessOutcome | undefined
}

/** One permission decision retained for the diagnostic. */
interface PermissionDecision {
  readonly policy: PermissionPolicy
  readonly request: string
  readonly decision: 'allowed' | 'denied'
}

/** Render fixed safe failure text from structured facts only. */
function failureDiagnostic(facts: AcpFailureFacts): string {
  const fields = [`stage: ${facts.stage}`, `category: ${facts.category}`]
  const exitCode = facts.outcome?.exitCode
  if (exitCode !== null && exitCode !== undefined) fields.push(`exit code: ${exitCode}`)
  const signal = facts.outcome?.signal
  if (signal !== null && signal !== undefined) fields.push(`signal: ${signal}`)
  return `Delegated agent failure (${fields.join('; ')})`
}

/** Render the retained permission decision. */
function permissionDiagnostic(decision: PermissionDecision): string {
  return `Delegated agent permission (policy: ${decision.policy}; request: ${decision.request}; decision: ${decision.decision})`
}

/** An unpublished-start failure carrying fixed facts. */
class AcpRunFailure extends Error {
  readonly facts: AcpFailureFacts

  constructor(facts: AcpFailureFacts, cause?: unknown) {
    super(`dsh-x-delegate: ${failureDiagnostic(facts)}`, cause === undefined ? undefined : { cause })
    this.name = 'AcpRunFailure'
    this.facts = facts
  }
}

/** Map an ACP stop reason to the harness vocabulary. */
export function acpStopReason(reason: string): SubagentStopReason {
  switch (reason) {
    case 'end_turn':
      return 'completed'
    case 'max_tokens':
      return 'max-tokens'
    case 'refusal':
      return 'refusal'
    case 'cancelled':
      return 'aborted'
    default:
      // An unknown terminal reason is a failure, never a silent success.
      return 'error'
  }
}

/** Normalize a caught value to an Error. */
function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

/** Report a host failure without letting the sink replace it. */
function reportFailure(spec: AcpRunSpec, error: unknown): void {
  try {
    spec.onError?.(toError(error), 'error')
  } catch {
    // Host logging cannot replace the child failure.
  }
}

/** Extract the text of one ACP content block. */
function contentText(block: JsonValue): string {
  if (block === null || typeof block !== 'object' || Array.isArray(block)) return ''
  const text = block.text
  return typeof text === 'string' ? text : ''
}

/** Translate harness prompt blocks into ACP text blocks. */
export function toAcpPrompt(prompt: readonly ContentBlock[]): JsonValue[] {
  const blocks: JsonValue[] = []
  for (const block of prompt) {
    if (block.type === 'text') blocks.push({ type: 'text', text: block.text })
  }
  return blocks
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
  readonly #byMessage = new Map<string, string>()
  readonly #order: string[] = []
  #anonymous = ''

  /**
   * Add one chunk.
   * @param messageId - the ACP message id, when the agent supplied one.
   * @param text - the chunk text.
   */
  push(messageId: string | undefined, text: string): void {
    if (text.length === 0) return
    if (messageId === undefined || messageId.length === 0) {
      this.#anonymous += text
      return
    }
    if (!this.#byMessage.has(messageId)) this.#order.push(messageId)
    // Chunks are deltas of one message. Replacing would keep only the last piece.
    this.#byMessage.set(messageId, (this.#byMessage.get(messageId) ?? '') + text)
  }

  /**
   * Select the answer: the last message group, else accumulated anonymous text.
   * @returns the selected text, or `''` when nothing arrived.
   */
  collect(): string {
    for (let index = this.#order.length - 1; index >= 0; index -= 1) {
      const id = this.#order[index]
      if (id === undefined) continue
      const text = this.#byMessage.get(id)
      if (text !== undefined && text.length > 0) return text
    }
    return this.#anonymous
  }
}

/** Read the advertised auth method ids from the peer's capabilities. */
function advertisedAuthMethods(capabilities: JsonObject): string[] {
  const methods = capabilities.authMethods
  if (!Array.isArray(methods)) return []
  const ids: string[] = []
  for (const method of methods) {
    if (method === null || typeof method !== 'object' || Array.isArray(method)) continue
    const id = method.id
    if (typeof id === 'string' && id.length > 0) ids.push(id)
  }
  return ids
}

/** Decide one permission request under the configured policy. */
export function decidePermission(
  policy: PermissionPolicy,
  params: JsonObject,
): { readonly outcome: JsonObject, readonly decision: PermissionDecision } {
  const toolCall = params.toolCall
  const kind = toolCall !== null && typeof toolCall === 'object' && !Array.isArray(toolCall) && typeof toolCall.kind === 'string'
    ? toolCall.kind
    : 'unknown'
  const options = Array.isArray(params.options) ? params.options : []
  const allow = options.find(option => {
    if (option === null || typeof option !== 'object' || Array.isArray(option)) return false
    return option.kind === 'allow_once' || option.kind === 'allow_always'
  })
  const optionId = allow !== null && typeof allow === 'object' && !Array.isArray(allow) && typeof allow.optionId === 'string'
    ? allow.optionId
    : undefined

  const permitted = policy === 'allow'
    || (policy === 'read-only' && READ_ONLY_TOOL_KINDS.has(kind))

  if (permitted && optionId !== undefined) {
    return {
      outcome: { outcome: 'selected', optionId },
      decision: { policy, request: kind, decision: 'allowed' },
    }
  }
  return {
    outcome: { outcome: 'cancelled' },
    decision: { policy, request: kind, decision: 'denied' },
  }
}

/** Bounded wait for the managed range to empty. */
async function rangeExitsWithin(child: SubprocessHandle, ms: number): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, ms)
  try {
    return await child.waitForExit(controller.signal)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Cooperative teardown: stdin EOF, then the terminate escalation, then the
 * process owner's exit proof.
 * @param child - the spawned child handle.
 * @param eofGraceMs - tier-1 window after stdin EOF.
 */
export async function disposeAcpChild(child: SubprocessHandle, eofGraceMs: number): Promise<void> {
  const failures: Error[] = []
  try {
    child.stdin?.end()
  } catch {
    // A concurrently closed stdin does not change range ownership.
  }
  let exited = false
  try {
    exited = await rangeExitsWithin(child, eofGraceMs)
  } catch (error: unknown) {
    failures.push(toError(error))
  }
  if (!exited) {
    child.terminate()
    try {
      await child.waitForExit()
    } catch (error: unknown) {
      failures.push(toError(error))
    }
  }
  await child.done.catch(() => { /* exit facts are observed by the caller */ })
  if (failures.length === 1) throw failures[0] as Error
  if (failures.length > 1) throw new AggregateError(failures, 'ACP child teardown failed')
}

/**
 * Start one ACP delegation and publish its run handle.
 * @param request - the subagent start request; its signal is the cancellation channel.
 * @param spec - resolved spawn, policy, and configuration inputs.
 * @returns the published run.
 */
export async function startAcpRun(request: SubagentStartRequest, spec: AcpRunSpec): Promise<SubagentRun> {
  if (request.signal.aborted) throw new Error('delegation aborted before the ACP child started')
  const id = randomUUID() as SessionId

  let child: SubprocessHandle
  try {
    child = spec.spawn({
      argv: [spec.command, ...spec.args],
      cwd: spec.cwd,
      stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'inherit' },
      graceMs: spec.disposeGraceMs,
      env: spec.env,
    })
  } catch (error: unknown) {
    reportFailure(spec, error)
    throw new AcpRunFailure({ stage: 'process', category: 'process-start' }, error)
  }

  if (child.stdin === undefined || child.stdout === undefined) {
    child.terminate()
    throw new Error('dsh-x-delegate: the subprocess implementation dropped a piped protocol stream')
  }

  let processOutcome: SubprocessOutcome | undefined
  let processFailure: Error | undefined
  const processDone = child.done.then(
    outcome => { processOutcome = outcome; return outcome },
    (error: unknown) => { processFailure = toError(error); throw processFailure },
  )
  const processRejected: Promise<never> = processDone.then(
    () => new Promise<never>(() => { /* parks: a clean exit never wins the startup race */ }),
    (error: unknown) => Promise.reject(toError(error)),
  )
  processRejected.catch(() => { /* observed by the startup race */ })

  const observeOutcome = async (signal?: AbortSignal): Promise<SubprocessOutcome | undefined> => {
    if (processOutcome !== undefined) return processOutcome
    const timeout = AbortSignal.timeout(Math.ceil(spec.disposeGraceMs))
    const bound = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
    const aborted = deferred<undefined>()
    const onAbort = (): void => { aborted.resolve(undefined) }
    bound.addEventListener('abort', onAbort, { once: true })
    if (bound.aborted) onAbort()
    try {
      return await Promise.race([processDone, aborted.promise])
    } catch {
      return processOutcome
    } finally {
      bound.removeEventListener('abort', onAbort)
    }
  }

  let processDisposal: Promise<void> | undefined
  const disposeProcess = (): Promise<void> => (processDisposal ??= disposeAcpChild(child, spec.disposeEofGraceMs))

  const accumulator = new ChunkAccumulator()
  const flags = { cancelled: false }
  let latestPermission: PermissionDecision | undefined
  let diagnostic: string | undefined

  const streams: AcpWireStreams = {
    output: child.stdin,
    input: child.stdout,
  }
  const wire = new AcpWire({
    streams,
    onNotification: ({ method, params }) => {
      if (method !== ACP_METHODS.client.sessionUpdate) return
      const update = params.update
      if (update === null || typeof update !== 'object' || Array.isArray(update)) return
      if (update.sessionUpdate !== 'agent_message_chunk') return
      const messageId = typeof update.messageId === 'string' ? update.messageId : undefined
      accumulator.push(messageId, contentText(update.content as JsonValue))
    },
    onRequest: ({ method, params }) => {
      if (method !== ACP_METHODS.client.requestPermission) {
        // Unknown client methods fail closed with a JSON-RPC error frame.
        throw new Error(`unsupported client method: ${method}`)
      }
      const decided = decidePermission(spec.permission, params)
      latestPermission = decided.decision
      return decided.outcome
    },
  })

  let sessionId: string | undefined
  let startupStage: AcpFailureStage = 'initialize'
  const cancelSettled = deferred<void>()
  const requestCancel = (): void => {
    if (flags.cancelled) return
    flags.cancelled = true
    cancelSettled.resolve()
    if (sessionId !== undefined) wire.cancel(sessionId)
  }
  const onAbort = (): void => { requestCancel() }
  request.signal.addEventListener('abort', onAbort, { once: true })

  const collectOutput = (): readonly ContentBlock[] => {
    const text = accumulator.collect()
    return text.length > 0 ? [{ type: 'text', text }] : []
  }

  try {
    await Promise.race([
      (async (): Promise<void> => {
        const capabilities = await wire.initialize(
          { name: 'dsh-x-delegate', version: '0.1.0' },
          {},
          request.signal,
        )

        startupStage = 'authenticate'
        const methodIds = advertisedAuthMethods(capabilities)
        const authId = spec.authMethodId ?? methodIds[0]
        if (authId !== undefined) {
          try {
            await wire.authenticate(authId, request.signal)
          } catch (error: unknown) {
            // An explicitly configured method must succeed. An auto-selected
            // method may be declined by a peer that is already signed in.
            if (spec.authMethodId !== undefined || !(error instanceof AcpRpcError)) throw error
          }
        }

        startupStage = 'new-session'
        const session = await wire.newSession(spec.cwd, [], request.signal)
        sessionId = session.sessionId

        if (spec.config !== undefined) {
          startupStage = 'configure'
          for (const [configId, value] of Object.entries(spec.config)) {
            await wire.setConfigOption(session.sessionId, configId, value, request.signal)
          }
        }

        if (flags.cancelled) throw new Error('delegation cancelled before the ACP session started')
      })(),
      processRejected,
      cancelSettled.promise.then((): never => {
        throw new Error('delegation cancelled before the ACP session started')
      }),
    ])
  } catch (error: unknown) {
    request.signal.removeEventListener('abort', onAbort)
    const cancelledBeforeCleanup = flags.cancelled
    const observedOutcome = !cancelledBeforeCleanup && !(error instanceof AcpRunFailure)
      ? await observeOutcome()
      : undefined
    wire.close(toError(error))
    if (!cancelledBeforeCleanup) {
      reportFailure(spec, error instanceof AcpRunFailure ? error.cause : processFailure ?? error)
    }
    try {
      await disposeProcess()
    } catch (cleanupError: unknown) {
      reportFailure(spec, cleanupError)
      const cleanupFailure = new AcpRunFailure({
        stage: 'teardown',
        category: processOutcome === undefined ? 'unknown' : 'process-exit',
        ...(processOutcome === undefined ? {} : { outcome: processOutcome }),
      }, cleanupError)
      throw cancelledBeforeCleanup
        ? new AggregateError([cleanupFailure], cleanupFailure.message)
        : new AggregateError(
          [error instanceof AcpRunFailure ? error : startupFailure(error, startupStage, observedOutcome), cleanupFailure],
          `${(error instanceof AcpRunFailure ? error : startupFailure(error, startupStage, observedOutcome)).message}; ${cleanupFailure.message}`,
        )
    }
    if (cancelledBeforeCleanup) throw new Error('delegation aborted before the ACP child started')
    throw error instanceof AcpRunFailure ? error : startupFailure(error, startupStage, observedOutcome)
  }

  if (sessionId === undefined) throw new Error('unreachable: ACP startup fulfilled without a session id')
  const remoteSessionId = sessionId

  const result: Promise<SubagentResult> = settleRunResult({
    attempt: async (): Promise<SubagentResult> => {
      try {
        const stopReason = await Promise.race([
          wire.prompt(remoteSessionId, toAcpPrompt(request.prompt), request.signal),
          cancelSettled.promise.then((): never => {
            throw new Error('delegation cancelled while the ACP prompt was running')
          }),
        ])
        const mapped = acpStopReason(stopReason)
        if (mapped !== 'completed') {
          diagnostic = latestPermission === undefined
            ? `Delegated agent stopped with reason: ${stopReason}`
            : `${failureDiagnostic({ stage: 'prompt', category: 'remote-limit' })}\n${permissionDiagnostic(latestPermission)}`
        }
        return {
          output: collectOutput(),
          ...(diagnostic === undefined ? {} : { diagnostic }),
          stopReason: mapped,
        }
      } catch (error: unknown) {
        if (!flags.cancelled) {
          const outcome = await observeOutcome(request.signal)
          const facts: AcpFailureFacts = outcome === undefined
            ? { stage: 'prompt', category: 'transport' }
            : { stage: 'process', category: 'process-exit', outcome }
          diagnostic = latestPermission === undefined
            ? failureDiagnostic(facts)
            : `${failureDiagnostic(facts)}\n${permissionDiagnostic(latestPermission)}`
        }
        throw processFailure ?? error
      }
    },
    collectOutput,
    collectDiagnostic: () => diagnostic,
    cancelled: () => flags.cancelled,
    onError: spec.onError,
    signal: request.signal,
    onAbort,
  })

  return subprocessRunHandle({
    id,
    result,
    signal: request.signal,
    onAbort,
    requestCancel,
    teardown: async () => {
      try {
        await disposeProcess()
      } catch (error: unknown) {
        reportFailure(spec, error)
        throw new AcpRunFailure({
          stage: 'teardown',
          category: processOutcome === undefined ? 'unknown' : 'process-exit',
          ...(processOutcome === undefined ? {} : { outcome: processOutcome }),
        }, error)
      }
    },
  })
}

/** Classify an unpublished startup failure. */
function startupFailure(error: unknown, stage: AcpFailureStage, outcome: SubprocessOutcome | undefined): AcpRunFailure {
  const category: AcpFailureCategory = stage === 'authenticate'
    ? 'authentication'
    : stage === 'configure'
      ? 'configuration'
      : outcome === undefined ? 'transport' : 'process-exit'
  return new AcpRunFailure({ stage, category, ...(outcome === undefined ? {} : { outcome }) }, error)
}
