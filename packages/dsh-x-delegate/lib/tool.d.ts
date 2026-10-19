/**
 * Model-facing delegation tools.
 *
 * Each backend gets its own tool name so the model chooses a target explicitly,
 * and each tool exposes the knobs the official providers hard-code: the model,
 * the sandbox or permission tier, and (for ACP backends) the session
 * configuration the agent advertised.
 *
 * The tool starts through the shared activation seam, so the parent Agent keeps
 * ownership of lifecycle, cancellation, and result delivery. The tool returns
 * only an activation receipt; the run's outcome arrives through the normal
 * subagent notification path.
 *
 * @module dsh-x-delegate/tool
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { SubagentActivation } from '@deepseek-ai/dsh-subagent';
import { type CallOptions } from './call-options.ts';
/** One JSON value in a tool result. */
export type JsonValue = null | boolean | number | string | JsonValue[] | {
    [key: string]: JsonValue;
};
/** The activation receipt every delegation tool returns. */
export interface DelegationReceipt {
    /** Always `activation`. */
    readonly kind: 'activation';
    /** The provider that accepted the run. */
    readonly provider: string;
    /** The child identity minted by the activation manager. */
    readonly subagentId: string;
}
/** The `subagents` surface the tool drives. */
export interface DelegationSubagents {
    startActivation(spec: {
        readonly provider: string;
        readonly label: string;
        readonly request: {
            readonly prompt: ContentBlock[];
            readonly parent: Agent;
            readonly cwd?: string;
        };
        readonly signal: AbortSignal;
        readonly delivery: 'parent' | 'caller';
    }): Promise<SubagentActivation>;
}
/** Options for one delegation tool. */
export interface DelegateToolOptions {
    /** Tool name shown to the model, e.g. `delegate_grok`. */
    readonly name: string;
    /** Provider registry name. */
    readonly provider: string;
    /** Tool description shown to the model. */
    readonly description: string;
    /** Extra parameters contributed by the backend. */
    readonly extraParameters?: Record<string, unknown>;
    /** Read per-call overrides from the tool arguments. */
    readonly capture?: (args: Record<string, unknown>) => CallOptions;
}
/**
 * Register one delegation tool bound to a named provider.
 * @param ctx - the host context carrying `tools` and `subagents`.
 * @param options - tool identity, provider, and backend-specific schema.
 */
export declare function registerDelegateTool(ctx: Context, options: DelegateToolOptions): void;
