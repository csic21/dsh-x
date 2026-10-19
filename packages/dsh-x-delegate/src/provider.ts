/**
 * Shared provider scaffolding for delegated external agents.
 *
 * Every backend registers on the public `ctx.subagents` seam and advertises no
 * start-time capabilities: an out-of-process child cannot honour
 * `agentOptions`, `agentPreset`, `outputSchema`, or harness-enforced depth.
 *
 * @module dsh-x-delegate/provider
 */

import type { Context } from '@deepseek-ai/cordis'
import type {
  ResolvedSubagentStartRequest,
  SubagentCapabilities,
  SubagentProvider,
  SubagentRun,
} from '@deepseek-ai/dsh-subagent'
import { assertUsableCwd } from '@deepseek-ai/dsh-subagent'
import type { SubagentStopReason } from '@deepseek-ai/dsh-subagent'

/** The capability set every external-agent backend advertises. */
export const NO_START_CAPABILITIES: SubagentCapabilities = {
  agentOptions: false,
  agentPreset: false,
  outputSchema: false,
  depthLimit: false,
}

/** A per-delegation start function. */
export type StartRun = (request: ResolvedSubagentStartRequest) => Promise<SubagentRun>

/** Options shared by every delegated provider. */
export interface DelegateProviderOptions {
  /** Registry name on `ctx.subagents`. */
  readonly name: string
  /** The context that owns the registration. */
  readonly ctx: Context
  /** Diagnostic prefix, e.g. `acp:grok`. */
  readonly prefix: string
  /** Backend start function. */
  readonly start: StartRun
}

/**
 * One registered external-agent provider.
 *
 * A child starts fresh in its own process, so `inheritsParentContext` is
 * always false and the model-facing tool derives standalone wording.
 */
export class DelegateProvider implements SubagentProvider {
  readonly name: string
  readonly capabilities: SubagentCapabilities = NO_START_CAPABILITIES
  readonly inheritsParentContext = false
  readonly #ctx: Context
  readonly #prefix: string
  readonly #start: StartRun

  constructor(options: DelegateProviderOptions) {
    this.name = options.name
    this.#ctx = options.ctx
    this.#prefix = options.prefix
    this.#start = options.start
  }

  /**
   * Validate the working directory, then hand the request to the backend.
   * @param request - the resolved start request.
   * @returns the published run.
   */
  async start(request: ResolvedSubagentStartRequest): Promise<SubagentRun> {
    if (request.signal.aborted) {
      throw new Error(`${this.#prefix}: request was aborted before startup`)
    }
    const cwd = assertUsableCwd(this.#prefix, 'child cwd', request.cwd)
    this.#ctx.logger.debug(`${this.#prefix}: delegating in ${cwd}`)
    return await this.#start({ ...request, cwd })
  }

  /**
   * Report a backend failure on the host logger without replacing it.
   * @param error - the original failure.
   * @param stopReason - the flattened stop reason.
   */
  report(error: Error, stopReason: SubagentStopReason): void {
    this.#ctx.logger.warn(`${this.#prefix}: delegated run failed (${stopReason}): ${error.message}`)
  }
}

/**
 * Assert a configured timing bound is a positive finite number within the
 * Node timer range.
 * @param prefix - diagnostic prefix.
 * @param field - the configuration field name.
 * @param value - the configured value.
 */
export function assertGraceMs(prefix: string, field: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0 || value > 2_147_483_647) {
    throw new Error(`${prefix}: ${field} must be a positive finite number no greater than 2147483647`)
  }
}
