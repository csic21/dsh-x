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
import type { Context } from '@deepseek-ai/cordis';
import { type PermissionPolicy } from './acp/run.ts';
import { type CodexSandboxMode } from './codex/run.ts';
export declare const name = "dsh-x-delegate";
export declare const inject: string[];
/** One ACP backend instance (Grok or OpenCode). */
export interface AcpAgentConfig {
    /** Provider registry name, e.g. `grok`. Must not collide with another mounted provider. */
    providerName: string;
    /** Model-facing tool name. Defaults to `delegate_<providerName>`. */
    toolName?: string;
    /** Executable to spawn. */
    command: string;
    /** Arguments passed to {@link command}. */
    args: string[];
    /** Unattended permission tier. */
    permission: PermissionPolicy;
    /** Session configuration applied after `session/new`, e.g. `{ model: 'x' }`. */
    config: Record<string, string>;
    /** Optional auth method id; omitted uses the first advertised method. */
    authMethodId?: string;
    /** Extra environment entries layered over the scrubbed parent environment. */
    env: Record<string, string>;
    /** Grace for the child's EOF-driven flush. */
    disposeEofGraceMs: number;
    /** Grace between termination tiers. */
    disposeGraceMs: number;
}
/** The Codex backend instance. */
export interface CodexAgentConfig {
    /**
     * Provider registry name. Defaults avoid `codex`, which the official Codex
     * bundle already registers.
     */
    providerName: string;
    /** Model-facing tool name. Defaults to `delegate_codex`. */
    toolName?: string;
    /** `codex`, an absolute path, or `bundled`. */
    command: string;
    /** Optional `--model` value. */
    model?: string;
    /** Sandbox mode. */
    sandbox: CodexSandboxMode;
    /** Extra environment entries layered over the scrubbed parent environment. */
    env: Record<string, string>;
    /** Grace between termination tiers. */
    disposeGraceMs: number;
}
/** Plugin configuration. */
export interface Config {
    /** ACP backends to register. Defaults to Grok and OpenCode. */
    acp: AcpAgentConfig[];
    /** Codex backend. `false` skips it; omission uses {@link DEFAULT_CODEX_AGENT}. */
    codex?: CodexAgentConfig | false;
    /** Whether to register the model-facing tools. */
    tools: boolean;
}
/** The two ACP agents this plugin ships defaults for. */
export declare const DEFAULT_ACP_AGENTS: readonly AcpAgentConfig[];
/** The Codex defaults: whatever `codex` is on PATH, never a pinned payload. */
export declare const DEFAULT_CODEX_AGENT: CodexAgentConfig;
/**
 * Register every configured backend and its tool.
 * @param ctx - the host context.
 * @param config - plugin configuration.
 */
export declare function apply(ctx: Context, config?: Partial<Config>): void;
