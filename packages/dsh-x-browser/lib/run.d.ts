/**
 * Multi-step browser runs against one owned tab.
 *
 * The host, not the model, performs the observe/act cycle a run needs, so a whole
 * verification loop costs one model round trip. Each step still goes through the same
 * validated command path as a single action, a navigation is allowed to settle before
 * the next step, and the run stops at the first failure with a precise report.
 *
 * @module dsh-x-browser/run
 */
import type { RunStep, RunTarget } from './contract/batch.ts';
import type { DispatchOwner, BrowserRuntime } from './runtime.ts';
import type { BrowserScope } from './backends/types.ts';
/** One step's outcome, kept short so the log never dominates the result. */
export interface RunStepResult {
    step: number;
    action: string;
    ok: boolean;
    /** How a locator resolved, or why the step stopped the run. */
    note?: string;
}
/** Model-facing result of one run. */
export interface RunOutcome {
    tabId: string;
    epoch: number;
    grantRevision: number;
    untrustedPageContent: true;
    steps: RunStepResult[];
    observation: {
        text: string;
        targets: RunTarget[];
        truncated: boolean;
        url: string;
        title: string;
    } | null;
}
/** Everything one run needs from the caller. */
export interface RunRequest {
    runtime: BrowserRuntime;
    scope: BrowserScope;
    owner: DispatchOwner;
    tabId: string;
    epoch: number;
    grantRevision: number;
    steps: readonly RunStep[];
    textLimit: number;
    targetLimit: number;
    /** Whether a final observation is returned when the last step did not produce one. */
    finalObservation: boolean;
}
/**
 * Execute one run.
 *
 * @param request - runtime, scope, owner, starting identity, steps and result bounds.
 * @returns per-step outcomes plus the final observation.
 * @throws BROWSER_INPUT, BROWSER_TARGET, BROWSER_HIDDEN, BROWSER_GRANT, BROWSER_STALE
 */
export declare function runSequence(request: RunRequest): Promise<RunOutcome>;
