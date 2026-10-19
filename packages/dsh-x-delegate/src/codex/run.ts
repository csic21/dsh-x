/**
 * Codex delegation over `codex exec --json`.
 *
 * The official `@deepseek-ai/dsh-subagent-codex` drives `codex app-server` and
 * pins both the npm payload (`@openai/codex@0.153.4`, ~275 MB per platform)
 * and the protocol baseline in source constants, so it cannot use a Codex the
 * user already installed. This backend instead runs the `exec --json`
 * non-interactive surface, whose newline-delimited event stream is stable
 * across Codex releases and which resolves the binary from configuration,
 * `PATH`, or a bundled payload.
 *
 * Observed event stream (`codex exec --json`):
 *
 * ```text
 * {"type":"thread.started","thread_id":"..."}
 * {"type":"turn.started"}
 * {"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"..."}}
 * {"type":"turn.completed","usage":{...}}
 * {"type":"turn.failed","error":{"message":"..."}}
 * {"type":"error","message":"..."}
 * ```
 *
 * @module dsh-x-delegate/codex/run
 */

import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
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

/** Default grace between SIGTERM and SIGKILL on disposal. */
export const DEFAULT_DISPOSE_GRACE_MS = 3_000

/** Sandbox mode passed to `codex exec --sandbox`. */
export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access'

/** Every accepted {@link CodexSandboxMode}. */
export const CODEX_SANDBOX_MODES = ['read-only', 'workspace-write', 'danger-full-access'] as const

/** Fully resolved inputs for one Codex delegation. */
export interface CodexRunSpec {
  /** Absolute path or bare name of the `codex` executable. */
  readonly command: string
  /** Optional `--model` value. */
  readonly model?: string | undefined
  /** Sandbox mode. */
  readonly sandbox: CodexSandboxMode
  /** Skip approval prompts; required for unattended runs. */
  readonly fullAuto: boolean
  /** Absolute working directory. */
  readonly cwd: string
  /** Extra environment entries layered over the scrubbed parent environment. */
  readonly env: Record<string, string>
  /** Grace between termination tiers. */
  readonly disposeGraceMs: number
  /** Spawn function from the subprocess seam. */
  readonly spawn: (spec: SubprocessSpawnSpec) => SubprocessHandle
  /** Host sink for original failures. */
  readonly onError?: ((error: Error, stopReason: SubagentStopReason) => void) | undefined
}

/** Structured failure facts for one Codex run. */
export interface CodexFailureFacts {
  readonly stage: 'spawn' | 'stream' | 'process' | 'teardown'
  readonly outcome?: SubprocessOutcome | undefined
}

/** Render fixed safe failure text. */
export function codexFailureDiagnostic(facts: CodexFailureFacts): string {
  const fields = [`stage: ${facts.stage}`]
  const exitCode = facts.outcome?.exitCode
  if (exitCode !== null && exitCode !== undefined) fields.push(`exit code: ${exitCode}`)
  const signal = facts.outcome?.signal
  if (signal !== null && signal !== undefined) fields.push(`signal: ${signal}`)
  return `Delegated agent failure (${fields.join('; ')})`
}

/** An unpublished-start failure carrying fixed facts. */
class CodexRunFailure extends Error {
  readonly facts: CodexFailureFacts

  constructor(facts: CodexFailureFacts, cause?: unknown) {
    super(`dsh-x-delegate: ${codexFailureDiagnostic(facts)}`, cause === undefined ? undefined : { cause })
    this.name = 'CodexRunFailure'
    this.facts = facts
  }
}

/**
 * Build the `codex exec` argument vector.
 * @param spec - the resolved run inputs.
 * @returns argv excluding the executable itself.
 */
export function codexExecArgv(spec: Pick<CodexRunSpec, 'model' | 'sandbox' | 'fullAuto' | 'cwd'>): string[] {
  const argv = ['exec', '--json', '--skip-git-repo-check', '--cd', spec.cwd, '--sandbox', spec.sandbox]
  if (spec.fullAuto) argv.push('--dangerously-bypass-approvals-and-sandbox')
  if (spec.model !== undefined && spec.model.length > 0) argv.push('--model', spec.model)
  // The prompt arrives on stdin so an arbitrary task never becomes argv text.
  argv.push('-')
  return argv
}

/**
 * Resolve the Codex executable.
 *
 * An explicit path wins; a bare name is passed through for the subprocess seam
 * to resolve against the scrubbed `PATH`; `bundled` selects the payload
 * installed beside this package when one exists.
 *
 * @param configured - the configured value.
 * @param bundledManifestPath - optional absolute path to a bundled package manifest.
 * @returns the value to spawn.
 */
export function resolveCodexCommand(configured: string, bundledManifestPath?: string): string {
  if (configured !== 'bundled') return configured
  if (bundledManifestPath === undefined) {
    throw new Error('dsh-x-delegate: codex.command is "bundled" but no bundled payload is installed; set it to "codex" or an absolute path')
  }
  if (!existsSync(bundledManifestPath)) {
    throw new Error(`dsh-x-delegate: the bundled Codex payload is missing at ${path.dirname(bundledManifestPath)}; set codex.command to "codex" or an absolute path`)
  }
  return bundledManifestPath
}

/** One parsed `codex exec --json` line. */
type CodexEvent = { readonly [key: string]: unknown }

/** Read a string field from an event object. */
function stringField(event: CodexEvent, key: string): string | undefined {
  const value = event[key]
  return typeof value === 'string' ? value : undefined
}

/**
 * Folds `codex exec --json` events into one assistant answer.
 *
 * Only `agent_message` items contribute. The last non-empty message wins, so a
 * final answer that follows commentary supersedes it; reasoning, tool calls,
 * and errors never become the answer.
 */
export class CodexEventFold {
  #lastMessage: string | undefined
  #failure: string | undefined

  /**
   * Consume one parsed event.
   * @param event - the parsed JSON object for one line.
   */
  push(event: CodexEvent): void {
    const type = stringField(event, 'type')
    if (type === 'item.completed') {
      const item = event.item
      if (item === null || typeof item !== 'object' || Array.isArray(item)) return
      const itemType = stringField(item as CodexEvent, 'type')
      if (itemType !== 'agent_message') return
      const text = stringField(item as CodexEvent, 'text')
      if (text !== undefined && text.length > 0) this.#lastMessage = text
      return
    }
    if (type === 'turn.failed') {
      const error = event.error
      if (error !== null && typeof error === 'object' && !Array.isArray(error)) {
        const message = stringField(error as CodexEvent, 'message')
        if (message !== undefined) this.#failure = message
      }
      return
    }
    if (type === 'error') {
      const message = stringField(event, 'message')
      if (message !== undefined && this.#failure === undefined) this.#failure = message
    }
  }

  /** The selected answer text, or `''`. */
  get answer(): string {
    return this.#lastMessage ?? ''
  }

  /** The last failure message the stream reported, if any. */
  get failure(): string | undefined {
    return this.#failure
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
 * Cooperative teardown for a Codex child: stdin EOF, then termination tiers.
 * @param child - the spawned child handle.
 * @param graceMs - tier-1 window after stdin EOF.
 */
export async function disposeCodexChild(child: SubprocessHandle, graceMs: number): Promise<void> {
  const failures: Error[] = []
  try {
    child.stdin?.end()
  } catch {
    // A concurrently closed stdin does not change range ownership.
  }
  let exited = false
  try {
    exited = await rangeExitsWithin(child, graceMs)
  } catch (error: unknown) {
    failures.push(error instanceof Error ? error : new Error(String(error)))
  }
  if (!exited) {
    child.terminate()
    try {
      await child.waitForExit()
    } catch (error: unknown) {
      failures.push(error instanceof Error ? error : new Error(String(error)))
    }
  }
  await child.done.catch(() => { /* exit facts are observed by the caller */ })
  if (failures.length === 1) throw failures[0] as Error
  if (failures.length > 1) throw new AggregateError(failures, 'Codex child teardown failed')
}

/** Normalize a caught value to an Error. */
function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

/** Report a host failure without letting the sink replace it. */
function reportFailure(spec: CodexRunSpec, error: unknown): void {
  try {
    spec.onError?.(toError(error), 'error')
  } catch {
    // Host logging cannot replace the child failure.
  }
}

/** Translate harness prompt blocks into one plain-text task. */
export function codexPromptText(prompt: readonly ContentBlock[]): string {
  const parts: string[] = []
  for (const block of prompt) {
    if (block.type === 'text') parts.push(block.text)
  }
  return parts.join('\n\n')
}

/**
 * Start one Codex delegation and publish its run handle.
 * @param request - the subagent start request; its signal is the cancellation channel.
 * @param spec - resolved command, sandbox, and environment inputs.
 * @returns the published run.
 */
export async function startCodexRun(request: SubagentStartRequest, spec: CodexRunSpec): Promise<SubagentRun> {
  const task = codexPromptText(request.prompt)
  if (task.trim().length === 0) throw new Error('dsh-x-delegate: the delegated task must contain text')
  if (request.signal.aborted) throw new Error('delegation aborted before the Codex child started')

  const id = randomUUID() as SessionId
  let child: SubprocessHandle
  try {
    child = spec.spawn({
      argv: [spec.command, ...codexExecArgv(spec)],
      cwd: spec.cwd,
      stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'inherit' },
      graceMs: spec.disposeGraceMs,
      env: spec.env,
    })
  } catch (error: unknown) {
    reportFailure(spec, error)
    throw new CodexRunFailure({ stage: 'spawn' }, error)
  }

  let processOutcome: SubprocessOutcome | undefined
  let processFailure: Error | undefined
  const processDone = child.done.then(
    outcome => { processOutcome = outcome; return outcome },
    (error: unknown) => { processFailure = toError(error); throw processFailure },
  )
  processDone.catch(() => { /* observed below and in the startup race */ })

  const fold = new CodexEventFold()
  let streamError: Error | undefined

  if (child.stdin !== undefined) {
    try {
      child.stdin.end(task)
    } catch (error: unknown) {
      streamError = toError(error)
    }
  }

  const consume = (): void => {
    if (child.stdout === undefined) return
    let buffer = ''
    child.stdout.on('data', (chunk: Buffer | string) => {
      buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      let index = buffer.indexOf('\n')
      while (index >= 0) {
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 1)
        if (line.trim().length > 0) {
          try {
            const event = JSON.parse(line) as CodexEvent
            if (event !== null && typeof event === 'object' && !Array.isArray(event)) fold.push(event)
          } catch {
            // A non-JSON diagnostic line never fails the run.
          }
        }
        index = buffer.indexOf('\n')
      }
    })
    child.stdout.on('error', (error: Error) => { streamError = error })
  }
  consume()

  const flags = { cancelled: false }
  const cancelSettled = deferred<void>()
  const requestCancel = (): void => {
    if (flags.cancelled) return
    flags.cancelled = true
    cancelSettled.resolve()
    child.terminate()
  }
  const onAbort = (): void => { requestCancel() }
  request.signal.addEventListener('abort', onAbort, { once: true })

  const collectOutput = (): readonly ContentBlock[] => {
    const answer = fold.answer
    return answer.length > 0 ? [{ type: 'text', text: answer }] : []
  }

  let diagnostic: string | undefined
  let processDisposal: Promise<void> | undefined
  const disposeProcess = (): Promise<void> => (processDisposal ??= disposeCodexChild(child, spec.disposeGraceMs))

  const result: Promise<SubagentResult> = settleRunResult({
    attempt: async (): Promise<SubagentResult> => {
      const settled = await Promise.race([
        processDone.then(() => 'exited' as const, () => 'exited' as const),
        cancelSettled.promise.then(() => 'cancelled' as const),
      ])
      if (settled === 'cancelled') {
        throw new Error('delegation cancelled while the Codex turn was running')
      }
      const exitCode = processOutcome?.exitCode
      const failure = fold.failure
      if (streamError !== undefined || (exitCode !== undefined && exitCode !== null && exitCode !== 0)) {
        const facts: CodexFailureFacts = { stage: 'process', ...(processOutcome === undefined ? {} : { outcome: processOutcome }) }
        diagnostic = failure === undefined ? codexFailureDiagnostic(facts) : `${codexFailureDiagnostic(facts)}\n${failure}`
        return { output: collectOutput(), diagnostic, stopReason: 'error' }
      }
      if (failure !== undefined) {
        diagnostic = `Delegated agent reported an error: ${failure}`
        return { output: collectOutput(), diagnostic, stopReason: 'error' }
      }
      const answer = fold.answer
      if (answer.length === 0) {
        diagnostic = 'Delegated agent finished without an answer'
        return { output: [], diagnostic, stopReason: 'error' }
      }
      return { output: collectOutput(), stopReason: 'completed' }
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
        throw new CodexRunFailure({
          stage: 'teardown',
          ...(processOutcome === undefined ? {} : { outcome: processOutcome }),
        }, error)
      }
    },
  })
}
