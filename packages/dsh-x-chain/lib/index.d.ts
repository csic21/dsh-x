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
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "dsh-x-chain";
export declare const inject: string[];
/** Plugin configuration. */
export interface Config {
    /** Register the tool. Defaults to `true`. */
    enabled?: boolean;
    /**
     * Tool names a bank may dispatch. Defaults to the file and command tools.
     * `chain_run` is always rejected, whatever the list says.
     */
    allowedTools?: string[];
    /** Maximum steps in one bank, 1–32. Defaults to 8. */
    maxSteps?: number;
    /** Model-visible characters kept per step, 200–20000. Defaults to 1500. */
    maxStepChars?: number;
    /** Keep running after a failed step. Defaults to `false`. */
    continueOnError?: boolean;
}
/** Tools a bank may dispatch when the configuration names none. */
export declare const DEFAULT_ALLOWED_TOOLS: readonly string[];
/** The model-facing tool name. */
export declare const TOOL_NAME = "chain_run";
/** The authenticated endpoint the settings page reads. */
export declare const STATS_ENDPOINT = "dsh-x-chain/stats";
/** Normalize the allowlist: non-empty strings, unique, never the chain tool itself. */
export declare function resolveAllowedTools(configured: readonly string[] | undefined): string[];
/**
 * Register the chain tool.
 * @param ctx - the host context.
 * @param config - plugin configuration from the Cordis patch.
 */
export declare function apply(ctx: Context, config?: Partial<Config>): void;
