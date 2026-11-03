/**
 * The literal action bank: validation, receipt guards, and the pure helpers
 * the `chain_run` tool shares with its tests.
 *
 * A bank is deliberately narrow. It stores complete literal arguments, never
 * an expression, and every guard reads one earlier step's *real* receipt. That
 * keeps the whole mechanism replayable and auditable: nothing in the bank can
 * invent an argument or a fact.
 *
 * @module dsh-x-chain/bank
 */
/** A rejected bank, with a message meant for the model to correct. */
export class ChainInputError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ChainInputError';
    }
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isJson(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean')
        return true;
    if (typeof value === 'number')
        return Number.isFinite(value);
    if (Array.isArray(value))
        return value.every(isJson);
    if (isRecord(value))
        return Object.values(value).every(isJson);
    return false;
}
/**
 * Validate a model-supplied bank before anything runs.
 * @param raw - the `steps` argument, unvalidated.
 * @param limits - allowed tools and the step ceiling.
 * @returns the normalized bank.
 * @throws {ChainInputError} when the bank is malformed, unbounded, or recursive.
 */
export function parseSteps(raw, limits) {
    if (!Array.isArray(raw))
        throw new ChainInputError('steps must be an array');
    if (raw.length === 0)
        throw new ChainInputError('steps must contain at least one step');
    if (raw.length > limits.maxSteps) {
        throw new ChainInputError(`steps has ${raw.length} entries; at most ${limits.maxSteps} are allowed`);
    }
    const seen = new Set();
    const steps = [];
    raw.forEach((entry, index) => {
        const where = `steps[${index}]`;
        if (!isRecord(entry))
            throw new ChainInputError(`${where} must be an object`);
        const id = entry.id;
        if (typeof id !== 'string' || id.trim().length === 0)
            throw new ChainInputError(`${where}.id must be a non-empty string`);
        if (id.length > 64)
            throw new ChainInputError(`${where}.id must be at most 64 characters`);
        if (seen.has(id))
            throw new ChainInputError(`${where}.id ${JSON.stringify(id)} is used twice`);
        seen.add(id);
        const tool = entry.tool;
        if (typeof tool !== 'string' || tool.length === 0)
            throw new ChainInputError(`${where}.tool must be a non-empty string`);
        if (tool === 'chain_run')
            throw new ChainInputError(`${where}.tool cannot be chain_run itself`);
        if (!limits.allowedTools.includes(tool)) {
            throw new ChainInputError(`${where}.tool ${JSON.stringify(tool)} is not allowed in a chain; allowed: ${limits.allowedTools.join(', ')}`);
        }
        const rawArguments = entry.arguments ?? {};
        if (!isRecord(rawArguments))
            throw new ChainInputError(`${where}.arguments must be an object`);
        if (!isJson(rawArguments))
            throw new ChainInputError(`${where}.arguments must be lossless JSON`);
        const rawWhen = entry.when ?? [];
        if (!Array.isArray(rawWhen))
            throw new ChainInputError(`${where}.when must be an array`);
        const when = rawWhen.map((guard, guardIndex) => {
            const at = `${where}.when[${guardIndex}]`;
            if (!isRecord(guard))
                throw new ChainInputError(`${at} must be an object`);
            const target = guard.step;
            if (typeof target !== 'string' || target.length === 0)
                throw new ChainInputError(`${at}.step must be an earlier step id`);
            if (!seen.has(target) || target === id)
                throw new ChainInputError(`${at}.step ${JSON.stringify(target)} must name an earlier step`);
            const hasOk = Object.prototype.hasOwnProperty.call(guard, 'ok');
            const hasPath = Object.prototype.hasOwnProperty.call(guard, 'path');
            const hasEquals = Object.prototype.hasOwnProperty.call(guard, 'equals');
            if (!hasOk && !hasPath && !hasEquals)
                throw new ChainInputError(`${at} needs ok, path, or equals`);
            if (hasOk && typeof guard.ok !== 'boolean')
                throw new ChainInputError(`${at}.ok must be a boolean`);
            if (hasPath && (typeof guard.path !== 'string' || guard.path.length === 0)) {
                throw new ChainInputError(`${at}.path must be a non-empty dot path`);
            }
            if (hasEquals && !isJson(guard.equals))
                throw new ChainInputError(`${at}.equals must be lossless JSON`);
            return {
                step: target,
                ...(hasOk ? { ok: guard.ok } : {}),
                ...(hasPath ? { path: guard.path } : {}),
                ...(hasEquals ? { equals: guard.equals } : {}),
            };
        });
        steps.push({ id, tool, arguments: rawArguments, when });
    });
    return steps;
}
/** Resolve a dot path against one JSON value; array indices are numeric segments. */
export function lookup(value, path) {
    let current = value;
    for (const segment of path.split('.')) {
        if (Array.isArray(current)) {
            const index = Number(segment);
            if (!Number.isInteger(index) || index < 0 || index >= current.length)
                return { exists: false };
            current = current[index];
            continue;
        }
        if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, segment))
            return { exists: false };
        current = current[segment];
    }
    return isJson(current) ? { exists: true, value: current } : { exists: false };
}
/** Structural equality for lossless JSON. */
export function jsonEqual(a, b) {
    if (a === b)
        return true;
    if (Array.isArray(a)) {
        if (!Array.isArray(b) || a.length !== b.length)
            return false;
        return a.every((item, index) => jsonEqual(item, b[index]));
    }
    if (isRecord(a)) {
        if (!isRecord(b))
            return false;
        const keys = Object.keys(a);
        if (keys.length !== Object.keys(b).length)
            return false;
        return keys.every(key => Object.prototype.hasOwnProperty.call(b, key) && jsonEqual(a[key], b[key]));
    }
    return false;
}
/**
 * Evaluate one guard against settled receipts.
 * A guard whose step never ran fails closed.
 * @param guard - the declared condition.
 * @param receipts - settled receipts keyed by step id.
 * @returns whether the condition holds.
 */
export function guardHolds(guard, receipts) {
    const receipt = receipts.get(guard.step);
    if (receipt === undefined)
        return false;
    if (guard.ok !== undefined && receipt.ok !== guard.ok)
        return false;
    if (guard.path !== undefined) {
        const found = lookup(receipt.value, guard.path);
        if (!found.exists)
            return false;
        if (guard.equals !== undefined && !jsonEqual(found.value, guard.equals))
            return false;
        return true;
    }
    if (guard.equals !== undefined)
        return jsonEqual(receipt.value, guard.equals);
    return true;
}
/** Explain a failed guard without leaking more than the compared value. */
export function describeGuard(guard, receipts) {
    const receipt = receipts.get(guard.step);
    if (receipt === undefined)
        return `step ${JSON.stringify(guard.step)} did not run`;
    if (guard.ok !== undefined && receipt.ok !== guard.ok) {
        return `step ${JSON.stringify(guard.step)} ${receipt.ok ? 'succeeded' : 'failed'}, expected ${guard.ok ? 'success' : 'failure'}`;
    }
    const found = guard.path === undefined ? { exists: true, value: receipt.value } : lookup(receipt.value, guard.path);
    if (!found.exists)
        return `step ${JSON.stringify(guard.step)} has no ${JSON.stringify(guard.path)}`;
    return `step ${JSON.stringify(guard.step)} has ${JSON.stringify(guard.path ?? '$')} = ${JSON.stringify(guard.equals)}, actual ${JSON.stringify(found.value)}`;
}
/** Keep both ends of a long receipt; the middle is usually the least useful. */
export function truncate(text, max) {
    if (text.length <= max)
        return text;
    const head = Math.max(1, Math.floor(max * 0.6));
    const tail = Math.max(1, max - head);
    return `${text.slice(0, head)}\n… [${text.length - max} chars omitted] …\n${text.slice(-tail)}`;
}
