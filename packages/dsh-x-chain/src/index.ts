/**
 * dsh-x-chain: run a literal bank of tool calls inside one model step.
 *
 * The bank is the conservative half of the HarnessMM idea: the model commits
 * the next few actions while its arguments are still known, the harness runs
 * them under receipt guards, and any guard that does not hold hands control
 * back to the model. It never skips a model call the model has not already
 * decided to make, and every step still dispatches through the normal tool
 * pipeline — policy, approval, sandbox and cancellation included.
 *
 * @module dsh-x-chain
 */

import type { Context } from '@deepseek-ai/cordis'
import { registerChainTool } from './tool.ts'

export const name = 'dsh-x-chain'
export const inject = ['tools']

/** Plugin configuration. */
export interface Config {
  /** Register the tool. Defaults to `true`. */
  enabled?: boolean
  /**
   * Tool names a bank may dispatch. Defaults to the file and command tools.
   * `chain_run` is always rejected, whatever the list says.
   */
  allowedTools?: string[]
  /** Maximum steps in one bank, 1–32. Defaults to 8. */
  maxSteps?: number
  /** Model-visible characters kept per step, 200–20000. Defaults to 1500. */
  maxStepChars?: number
  /** Keep running after a failed step. Defaults to `false`. */
  continueOnError?: boolean
}

/** Tools a bank may dispatch when the configuration names none. */
export const DEFAULT_ALLOWED_TOOLS: readonly string[] = ['bash', 'read', 'write', 'edit', 'glob', 'grep']

/** The model-facing tool name. */
export const TOOL_NAME = 'chain_run'

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

/** Normalize the allowlist: non-empty strings, unique, never the chain tool itself. */
export function resolveAllowedTools(configured: readonly string[] | undefined): string[] {
  const source = configured === undefined || configured.length === 0 ? DEFAULT_ALLOWED_TOOLS : configured
  const tools = new Set<string>()
  for (const tool of source) {
    if (typeof tool !== 'string') continue
    const trimmed = tool.trim()
    if (trimmed.length === 0 || trimmed === TOOL_NAME) continue
    tools.add(trimmed)
  }
  return tools.size > 0 ? [...tools] : [...DEFAULT_ALLOWED_TOOLS]
}

/**
 * Register the chain tool.
 * @param ctx - the host context.
 * @param config - plugin configuration from the Cordis patch.
 */
export function apply(ctx: Context, config: Partial<Config> = {}): void {
  if (config.enabled === false) return
  registerChainTool(ctx, {
    name: TOOL_NAME,
    allowedTools: resolveAllowedTools(config.allowedTools),
    maxSteps: clampInt(config.maxSteps, 8, 1, 32),
    maxStepChars: clampInt(config.maxStepChars, 1500, 200, 20_000),
    continueOnError: config.continueOnError === true,
  })
}
