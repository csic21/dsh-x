/**
 * Shared provider scaffolding for delegated external agents.
 *
 * Every backend registers on the public `ctx.subagents` seam and advertises no
 * start-time capabilities: an out-of-process child cannot honour
 * `agentOptions`, `agentPreset`, `outputSchema`, or harness-enforced depth.
 *
 * @module dsh-x-delegate/provider
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ResolvedSubagentStartRequest, SubagentCapabilities, SubagentProvider, SubagentRun } from '@deepseek-ai/dsh-subagent';
import type { SubagentStopReason } from '@deepseek-ai/dsh-subagent';
/** The capability set every external-agent backend advertises. */
export declare const NO_START_CAPABILITIES: SubagentCapabilities;
/** A per-delegation start function. */
export type StartRun = (request: ResolvedSubagentStartRequest) => Promise<SubagentRun>;
/** Options shared by every delegated provider. */
export interface DelegateProviderOptions {
    /** Registry name on `ctx.subagents`. */
    readonly name: string;
    /** The context that owns the registration. */
    readonly ctx: Context;
    /** Diagnostic prefix, e.g. `acp:grok`. */
    readonly prefix: string;
    /** Backend start function. */
    readonly start: StartRun;
}
/**
 * One registered external-agent provider.
 *
 * A child starts fresh in its own process, so `inheritsParentContext` is
 * always false and the model-facing tool derives standalone wording.
 */
export declare class DelegateProvider implements SubagentProvider {
    #private;
    readonly name: string;
    readonly capabilities: SubagentCapabilities;
    readonly inheritsParentContext = false;
    constructor(options: DelegateProviderOptions);
    /**
     * Validate the working directory, then hand the request to the backend.
     * @param request - the resolved start request.
     * @returns the published run.
     */
    start(request: ResolvedSubagentStartRequest): Promise<SubagentRun>;
    /**
     * Report a backend failure on the host logger without replacing it.
     * @param error - the original failure.
     * @param stopReason - the flattened stop reason.
     */
    report(error: Error, stopReason: SubagentStopReason): void;
}
/**
 * Assert a configured timing bound is a positive finite number within the
 * Node timer range.
 * @param prefix - diagnostic prefix.
 * @param field - the configuration field name.
 * @param value - the configured value.
 */
export declare function assertGraceMs(prefix: string, field: string, value: number): void;
