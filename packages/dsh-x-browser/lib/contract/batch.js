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
import { fail } from './errors.js';
/** Actions a run may perform; `observe` is implicit before a located step. */
const RUN_ACTIONS = new Set(['click', 'type', 'press', 'scroll', 'navigate', 'back', 'forward', 'reload', 'observe']);
/** Hard bounds keep one call's work and one call's result predictable. */
export const RUN_LIMITS = { steps: 20, label: 200, text: 4000, key: 24, url: 4096 };
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const boundedString = (value, field, limit) => {
    if (value === undefined)
        return undefined;
    if (typeof value !== 'string' || value.length > limit)
        throw fail('BROWSER_INPUT', `Run step ${field} must be a string of at most ${limit} characters.`);
    return value;
};
const boundedInteger = (value, field) => {
    if (value === undefined)
        return undefined;
    if (!Number.isSafeInteger(value) || Math.abs(value) > 20000)
        throw fail('BROWSER_INPUT', `Run step ${field} must be a small integer.`);
    return value;
};
/**
 * Validate one untrusted run payload.
 *
 * Rejects unknown fields instead of ignoring them: a misspelled step would otherwise
 * silently do nothing, which is worse than a clear failure in an unattended loop.
 *
 * @param value - untrusted `steps` argument.
 * @returns the accepted steps, in order.
 */
export function validateRun(value) {
    if (!Array.isArray(value) || value.length === 0)
        throw fail('BROWSER_INPUT', 'A run needs at least one step.');
    if (value.length > RUN_LIMITS.steps)
        throw fail('BROWSER_INPUT', `A run accepts at most ${RUN_LIMITS.steps} steps.`);
    return value.map((raw, index) => {
        if (!isRecord(raw))
            throw fail('BROWSER_INPUT', `Run step ${index + 1} must be an object.`);
        const known = new Set(['action', 'target', 'label', 'text', 'value', 'url', 'key', 'x', 'y']);
        for (const key of Object.keys(raw))
            if (!known.has(key))
                throw fail('BROWSER_INPUT', `Run step ${index + 1} has an unknown field: ${key}.`);
        const action = raw.action;
        if (typeof action !== 'string' || !RUN_ACTIONS.has(action))
            throw fail('BROWSER_INPUT', `Run step ${index + 1} has an unsupported action.`);
        // Only defined fields are kept: an undefined member would travel into the
        // approval text and the step log as noise.
        const step = { action: action };
        const target = boundedString(raw.target, 'target', 200);
        const label = boundedString(raw.label, 'label', RUN_LIMITS.label);
        const text = boundedString(raw.text, 'text', RUN_LIMITS.text);
        const value = boundedString(raw.value, 'value', 1000);
        const url = boundedString(raw.url, 'url', RUN_LIMITS.url);
        const key = boundedString(raw.key, 'key', RUN_LIMITS.key);
        const x = boundedInteger(raw.x, 'x');
        const y = boundedInteger(raw.y, 'y');
        if (target !== undefined)
            step.target = target;
        if (label !== undefined)
            step.label = label;
        if (text !== undefined)
            step.text = text;
        if (value !== undefined)
            step.value = value;
        if (url !== undefined)
            step.url = url;
        if (key !== undefined)
            step.key = key;
        if (x !== undefined)
            step.x = x;
        if (y !== undefined)
            step.y = y;
        if (step.action === 'click' && !step.target && !step.label)
            throw fail('BROWSER_INPUT', `Run step ${index + 1} needs a target or a label.`);
        if (step.action === 'type') {
            if (!step.target && !step.label)
                throw fail('BROWSER_INPUT', `Run step ${index + 1} needs a target or a label.`);
            if (typeof step.text !== 'string')
                throw fail('BROWSER_INPUT', `Run step ${index + 1} needs text to type.`);
        }
        if (step.action === 'navigate' && !step.url)
            throw fail('BROWSER_INPUT', `Run step ${index + 1} needs a URL.`);
        if (step.action === 'press' && !step.key)
            throw fail('BROWSER_INPUT', `Run step ${index + 1} needs a key.`);
        return step;
    });
}
const normalize = (value) => value.replace(/\s+/gu, ' ').trim().toLowerCase();
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
export function matchLabel(targets, label, wantEditable = false) {
    const needle = normalize(label);
    if (!needle)
        return undefined;
    let best;
    for (const target of targets) {
        if (typeof target.label !== 'string')
            continue;
        const candidate = normalize(target.label);
        if (!candidate)
            continue;
        const exact = candidate === needle;
        const partial = !exact && (candidate.includes(needle) || needle.includes(candidate));
        if (!exact && !partial)
            continue;
        if (wantEditable && target.editable !== true)
            continue;
        const rank = (exact ? 2 : 0) + (target.editable === true ? 1 : 0);
        if (!best || rank > best.rank)
            best = { target, rank };
    }
    return best;
}
/** A short, model-safe list of what a page actually offered, for a failed locator. */
export function describeLabels(targets, limit = 6) {
    const labels = targets.map(target => target.label).filter((label) => typeof label === 'string' && label.trim().length > 0);
    return labels.slice(0, limit).map(label => JSON.stringify(label.slice(0, 60))).join(', ') || '(none)';
}
