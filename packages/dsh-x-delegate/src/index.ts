/**
 * dsh-x-delegate: delegate one task to an external coding agent.
 *
 * Three backends, each registered on the public `ctx.subagents` seam:
 *
 * - `grok` and `opencode` speak the Agent Client Protocol over stdio. They are
 *   configured per instance (command, args, model, permission tier) and can set
 *   a session model through `session/set_config_option`.
 * - `codex` has no ACP surface, so it runs `codex exec --json` and folds the
 *   event stream. The binary is configurable instead of pinned.
 *
 * @module dsh-x-delegate
 */

import type { Context } from '@deepseek-ai/cordis'
import { startAcpRun, PERMISSION_POLICIES, type AcpRunSpec, type PermissionPolicy } from './acp/run.ts'
import { takeCallOptions } from './call-options.ts'
import { startCodexRun, CODEX_SANDBOX_MODES, type CodexRunSpec, type CodexSandboxMode } from './codex/run.ts'
import { assertGraceMs, DelegateProvider } from './provider.ts'
import { registerDelegateTool } from './tool.ts'

export const name = 'dsh-x-delegate'
export const inject = ['subagents', 'subprocess', 'tools']

/** One ACP backend instance (Grok or OpenCode). */
export interface AcpAgentConfig {
  /** Provider registry name, e.g. `grok`. Must not collide with another mounted provider. */
  providerName: string
  /** Model-facing tool name. Defaults to `delegate_<providerName>`. */
  toolName?: string
  /** Executable to spawn. */
  command: string
  /** Arguments passed to {@link command}. */
  args: string[]
  /** Unattended permission tier. */
  permission: PermissionPolicy
  /** Session configuration applied after `session/new`, e.g. `{ model: 'x' }`. */
  config: Record<string, string>
  /** Optional auth method id; omitted uses the first advertised method. */
  authMethodId?: string
  /** Extra environment entries layered over the scrubbed parent environment. */
  env: Record<string, string>
  /** Grace for the child's EOF-driven flush. */
  disposeEofGraceMs: number
  /** Grace between termination tiers. */
  disposeGraceMs: number
}

/** The Codex backend instance. */
export interface CodexAgentConfig {
  /**
   * Provider registry name. Defaults avoid `codex`, which the official Codex
   * bundle already registers.
   */
  providerName: string
  /** Model-facing tool name. Defaults to `delegate_codex`. */
  toolName?: string
  /** `codex`, an absolute path, or `bundled`. */
  command: string
  /** Optional `--model` value. */
  model?: string
  /** Sandbox mode. */
  sandbox: CodexSandboxMode
  /** Extra environment entries layered over the scrubbed parent environment. */
  env: Record<string, string>
  /** Grace between termination tiers. */
  disposeGraceMs: number
}

/** Plugin configuration. */
export interface Config {
  /** ACP backends to register. Defaults to Grok and OpenCode. */
  acp: AcpAgentConfig[]
  /** Codex backend. `false` skips it; omission uses {@link DEFAULT_CODEX_AGENT}. */
  codex?: CodexAgentConfig | false
  /** Whether to register the model-facing tools. */
  tools: boolean
}

/** The two ACP agents this plugin ships defaults for. */
export const DEFAULT_ACP_AGENTS: readonly AcpAgentConfig[] = [
  {
    providerName: 'grok',
    command: 'grok',
    args: ['agent', 'stdio'],
    permission: 'read-only',
    config: {},
    env: {},
    disposeEofGraceMs: 6_000,
    disposeGraceMs: 3_000,
  },
  {
    providerName: 'opencode',
    // `--standalone` keeps every delegation on a private server so concurrent
    // runs cannot contend for one shared background service.
    command: 'opencode',
    args: ['acp', '--standalone'],
    permission: 'read-only',
    config: {},
    env: {},
    disposeEofGraceMs: 6_000,
    disposeGraceMs: 3_000,
  },
]

/** The Codex defaults: whatever `codex` is on PATH, never a pinned payload. */
export const DEFAULT_CODEX_AGENT: CodexAgentConfig = {
  providerName: 'delegate-codex',
  toolName: 'delegate_codex',
  command: 'codex',
  sandbox: 'workspace-write',
  env: {},
  disposeGraceMs: 3_000,
}

/** Tool descriptions, kept separate so the model-facing text stays reviewable. */
const TOOL_DESCRIPTIONS = {
  grok: 'Delegate a self-contained task to Grok running as an external agent in this workspace. It works in its own process and returns only its final answer. Use it for a focused, independent subtask; it does not see this conversation.',
  opencode: 'Delegate a self-contained task to OpenCode running as an external agent in this workspace. It works in its own process and returns only its final answer. Use it for a focused, independent subtask; it does not see this conversation.',
  codex: 'Delegate a self-contained task to Codex running as an external agent in this workspace. It works in its own process and returns only its final answer. Use it for a focused, independent subtask; it does not see this conversation.',
} as const

/** Resolve one ACP config into the backend's run spec defaults. */
function acpSpec(config: AcpAgentConfig, ctx: Context, cwd: string, env: Record<string, string>): AcpRunSpec {
  return {
    command: config.command,
    args: config.args,
    cwd,
    permission: config.permission,
    env: { ...config.env, ...env },
    config: Object.keys(config.config).length > 0 ? config.config : undefined,
    authMethodId: config.authMethodId,
    disposeEofGraceMs: config.disposeEofGraceMs,
    disposeGraceMs: config.disposeGraceMs,
    spawn: spec => ctx.subprocess.spawn(spec),
  }
}

/** Resolve one Codex config into the backend's run spec defaults. */
function codexSpec(config: CodexAgentConfig, ctx: Context, cwd: string, env: Record<string, string>): CodexRunSpec {
  return {
    command: config.command,
    model: config.model,
    sandbox: config.sandbox,
    fullAuto: config.sandbox === 'danger-full-access',
    cwd,
    env: { ...config.env, ...env },
    disposeGraceMs: config.disposeGraceMs,
    spawn: spec => ctx.subprocess.spawn(spec),
  }
}

/** Normalize a configured list, falling back to the shipped defaults. */
function resolveAcpAgents(config: Partial<Config>): readonly AcpAgentConfig[] {
  const configured = config.acp ?? []
  return configured.length > 0 ? configured : DEFAULT_ACP_AGENTS
}

/**
 * Register every configured backend and its tool.
 * @param ctx - the host context.
 * @param config - plugin configuration.
 */
export function apply(ctx: Context, config: Partial<Config> = {}): void {
  const acpAgents = resolveAcpAgents(config)
  const registerTools = config.tools !== false
  const seen = new Set<string>()

  for (const agent of acpAgents) {
    const prefix = `dsh-x-delegate:${agent.providerName}`
    if (seen.has(agent.providerName)) {
      throw new Error(`dsh-x-delegate: duplicate provider name ${JSON.stringify(agent.providerName)}`)
    }
    seen.add(agent.providerName)
    if (!PERMISSION_POLICIES.includes(agent.permission)) {
      throw new Error(`dsh-x-delegate: ${agent.providerName}.permission must be one of ${PERMISSION_POLICIES.join(', ')}`)
    }
    assertGraceMs(prefix, 'disposeEofGraceMs', agent.disposeEofGraceMs)
    assertGraceMs(prefix, 'disposeGraceMs', agent.disposeGraceMs)

    const provider = new DelegateProvider({
      name: agent.providerName,
      ctx,
      prefix,
      start: async request => {
        const call = takeCallOptions(request.prompt)
        const spec = acpSpec(agent, ctx, request.cwd, {})
        const config = {
          ...spec.config,
          ...(call?.model === undefined ? {} : { model: call.model }),
        }
        return await startAcpRun(request, {
          ...spec,
          permission: call?.permission ?? spec.permission,
          config: Object.keys(config).length > 0 ? config : undefined,
          onError: (error, stopReason) => provider.report(error, stopReason),
        })
      },
    })
    ctx.subagents.registerProvider(provider)

    if (registerTools) {
      const description = TOOL_DESCRIPTIONS[agent.providerName as keyof typeof TOOL_DESCRIPTIONS]
        ?? `Delegate a self-contained task to ${agent.providerName} running as an external agent in this workspace.`
      registerDelegateTool(ctx, {
        name: agent.toolName ?? `delegate_${agent.providerName}`,
        provider: agent.providerName,
        description,
        extraParameters: ACP_CALL_PARAMETERS,
        capture: captureAcpCall,
      })
    }
  }

  const codex = config.codex === false ? undefined : (config.codex ?? DEFAULT_CODEX_AGENT)
  if (codex !== undefined) {
    const prefix = `dsh-x-delegate:${codex.providerName}`
    if (seen.has(codex.providerName)) {
      throw new Error(`dsh-x-delegate: duplicate provider name ${JSON.stringify(codex.providerName)}`)
    }
    if (!CODEX_SANDBOX_MODES.includes(codex.sandbox)) {
      throw new Error(`dsh-x-delegate: ${codex.providerName}.sandbox must be one of ${CODEX_SANDBOX_MODES.join(', ')}`)
    }
    assertGraceMs(prefix, 'disposeGraceMs', codex.disposeGraceMs)

    const provider = new DelegateProvider({
      name: codex.providerName,
      ctx,
      prefix,
      start: async request => {
        const call = takeCallOptions(request.prompt)
        const spec = codexSpec(codex, ctx, request.cwd, {})
        const sandbox = call?.sandbox ?? spec.sandbox
        return await startCodexRun(request, {
          ...spec,
          model: call?.model ?? spec.model,
          sandbox,
          fullAuto: sandbox === 'danger-full-access',
          onError: (error, stopReason) => provider.report(error, stopReason),
        })
      },
    })
    ctx.subagents.registerProvider(provider)

    if (registerTools) {
      registerDelegateTool(ctx, {
        name: codex.toolName ?? 'delegate_codex',
        provider: codex.providerName,
        description: TOOL_DESCRIPTIONS.codex,
        extraParameters: CODEX_CALL_PARAMETERS,
        capture: captureCodexCall,
      })
    }
  }
}

/** Optional per-call parameters for an ACP backend. */
const ACP_CALL_PARAMETERS = {
  model: {
    type: 'string' as const,
    description: 'Model id advertised by the agent (its session config option `model`). Omit to keep the agent default.',
  },
  permission: {
    type: 'string' as const,
    enum: [...PERMISSION_POLICIES],
    description: 'How to answer the child\'s permission prompts for this call: deny, read-only, or allow. Omit to use the configured tier.',
  },
}

/** Optional per-call parameters for Codex. */
const CODEX_CALL_PARAMETERS = {
  model: {
    type: 'string' as const,
    description: 'Codex model id passed as `--model`. Omit to keep the configured or native default.',
  },
  sandbox: {
    type: 'string' as const,
    enum: [...CODEX_SANDBOX_MODES],
    description: 'Codex sandbox for this call. Omit to use the configured sandbox.',
  },
}

/** Read ACP per-call overrides, rejecting values outside the closed sets. */
function captureAcpCall(args: Record<string, unknown>) {
  const model = typeof args.model === 'string' && args.model.length > 0 ? args.model : undefined
  const permission = typeof args.permission === 'string' && args.permission.length > 0 ? args.permission : undefined
  if (permission !== undefined && !PERMISSION_POLICIES.includes(permission as PermissionPolicy)) {
    throw new Error(`permission must be one of ${PERMISSION_POLICIES.join(', ')}`)
  }
  return {
    ...(model === undefined ? {} : { model }),
    ...(permission === undefined ? {} : { permission: permission as PermissionPolicy }),
  }
}

/** Read Codex per-call overrides, rejecting values outside the closed sets. */
function captureCodexCall(args: Record<string, unknown>) {
  const model = typeof args.model === 'string' && args.model.length > 0 ? args.model : undefined
  const sandbox = typeof args.sandbox === 'string' && args.sandbox.length > 0 ? args.sandbox : undefined
  if (sandbox !== undefined && !CODEX_SANDBOX_MODES.includes(sandbox as CodexSandboxMode)) {
    throw new Error(`sandbox must be one of ${CODEX_SANDBOX_MODES.join(', ')}`)
  }
  return {
    ...(model === undefined ? {} : { model }),
    ...(sandbox === undefined ? {} : { sandbox: sandbox as CodexSandboxMode }),
  }
}
