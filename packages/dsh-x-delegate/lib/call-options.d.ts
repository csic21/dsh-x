/**
 * Per-call options stashed on the tool's abort signal.
 *
 * The shared activation request has no free-form field for an external agent's
 * model or permission tier, and advertising `agentOptions` would send the model
 * id through the DSH LLM preflight, which rejects ids the host does not serve.
 * The activation manager replaces the tool signal with its own controller
 * before `provider.start`, but it forwards the same `prompt` array. The tool
 * binds options on that array and the provider reads them once.
 *
 * @module dsh-x-delegate/call-options
 */
import type { PermissionPolicy } from './acp/run.ts';
import type { CodexSandboxMode } from './codex/run.ts';
/** Options chosen on one tool call, layered over the provider's configured defaults. */
export interface CallOptions {
    /** ACP `model` config id, or the Codex `--model` value. */
    readonly model?: string;
    /** ACP permission tier for this call. */
    readonly permission?: PermissionPolicy;
    /** Codex sandbox for this call. */
    readonly sandbox?: CodexSandboxMode;
}
/**
 * Bind options to the prompt array the activation forwards unchanged.
 * @param prompt - the prompt array placed on the activation request.
 * @param options - caller-selected overrides.
 */
export declare function bindCallOptions(prompt: object, options: CallOptions): void;
/**
 * Read and drop the options bound to a start request's prompt.
 * @param prompt - the request prompt array.
 * @returns the bound options, or `undefined` when the start was not made by a delegation tool.
 */
export declare function takeCallOptions(prompt: object): CallOptions | undefined;
