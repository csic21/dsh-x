/**
 * Bounded multi-step browser runs.
 *
 * A run is a list of ordinary actions executed back to back against one owned tab,
 * so a whole verification loop costs one model round trip instead of one per action.
 * Every step is still validated by the same command contract as a single action; the
 * only addition is a label locator, which lets a step name a control instead of
 * carrying a reference that the previous step invalidated.
 *
 * @module dsh-x-browser/contract/batch
 */
import type { Action } from './commands.ts';
/** Hard bounds keep one call's work and one call's result predictable. */
export declare const RUN_LIMITS: {
    readonly steps: 20;
    readonly label: 200;
    readonly text: 4000;
    readonly key: 24;
    readonly url: 4096;
};
/** One step of a run, already narrowed to plain JSON. */
export interface RunStep {
    action: Action;
    /** Reference from the observation the caller last saw. */
    target?: string;
    /** Visible label to resolve against a fresh observation, for click and type. */
    label?: string;
    text?: string;
    value?: string;
    url?: string;
    key?: string;
    x?: number;
    y?: number;
}
/** One model-visible target projection; the surrounding text is dropped internally. */
export interface RunTarget {
    ref: string;
    tag?: string;
    type?: string;
    label?: string;
    editable?: boolean;
}
/** How one observed target is matched against a label locator. */
export interface LabelMatch {
    target: RunTarget;
    /** `exact` wins over `partial`, an editable control wins over a static one. */
    rank: number;
}
/**
 * Validate one untrusted run payload.
 *
 * Rejects unknown fields instead of ignoring them: a misspelled step would otherwise
 * silently do nothing, which is worse than a clear failure in an unattended loop.
 *
 * @param value - untrusted `steps` argument.
 * @returns the accepted steps, in order.
 */
export declare function validateRun(value: unknown): RunStep[];
/**
 * Resolve one label locator against freshly observed targets.
 *
 * Exact label matches outrank partial ones, and an editable control outranks a static
 * one, so `type` finds the input rather than its surrounding label text. Ties keep the
 * page's own order, which is the order a human would scan.
 *
 * @param targets - targets from the internal observation.
 * @param label - the visible label to find.
 * @param wantEditable - true when the step needs an editable control.
 * @returns the winning match, if any.
 */
export declare function matchLabel(targets: readonly RunTarget[], label: string, wantEditable?: boolean): LabelMatch | undefined;
/** A short, model-safe list of what a page actually offered, for a failed locator. */
export declare function describeLabels(targets: readonly RunTarget[], limit?: number): string;
