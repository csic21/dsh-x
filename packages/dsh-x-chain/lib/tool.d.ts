/**
 * The model-facing `chain_run` tool.
 *
 * One call carries a complete literal action bank. Every step dispatches
 * through the same registry the model would use directly, so policy, approval,
 * sandbox, and cancellation behave exactly as they do for a direct call. The
 * only thing the bank removes is the model round trip between two actions whose
 * arguments were already final.
 *
 * @module dsh-x-chain/tool
 */
import type { Context } from '@deepseek-ai/cordis';
/** Resolved tool options; every default is applied by the plugin entry. */
export interface ChainToolOptions {
    /** Registered tool name, e.g. `chain_run`. */
    readonly name: string;
    /** Tool names a bank may dispatch. */
    readonly allowedTools: readonly string[];
    /** Maximum steps in one bank. */
    readonly maxSteps: number;
    /** Model-visible character budget for one step's text. */
    readonly maxStepChars: number;
    /** Continue after a failed step instead of stopping the chain. */
    readonly continueOnError: boolean;
}
/** Why a chain stopped before running every step. */
export interface ChainStop {
    readonly step: string;
    readonly reason: 'guard' | 'error' | 'aborted';
    readonly detail?: string;
}
/** The canonical value of one `chain_run` call. */
export interface ChainValue {
    executed: number;
    roundTripsSaved: number;
    steps: {
        id: string;
        tool: string;
        ok: boolean;
        ms: number;
        text: string;
        truncated: boolean;
    }[];
    stopped?: {
        step: string;
        reason: string;
        detail?: string;
    };
}
/**
 * Register the chain tool on the host tool registry.
 * @param ctx - the host context carrying `tools`.
 * @param options - resolved limits and defaults.
 */
export declare function registerChainTool(ctx: Context, options: ChainToolOptions): void;
