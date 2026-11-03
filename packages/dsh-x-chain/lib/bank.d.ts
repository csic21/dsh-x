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
/** One lossless JSON value. Mirrors the kernel value domain without a dependency. */
export type JsonValue = null | boolean | number | string | JsonValue[] | {
    [key: string]: JsonValue;
};
/** One condition over an earlier step's receipt. All conditions must hold. */
export interface Guard {
    /** Id of an earlier step in the same bank. */
    readonly step: string;
    /** Required receipt status: `true` for success, `false` for a failed step. */
    readonly ok?: boolean;
    /** Dot path into the step's canonical value, e.g. `exitCode` or `files.0.path`. */
    readonly path?: string;
    /** Expected JSON value at {@link path}, or the whole value when `path` is absent. */
    readonly equals?: JsonValue;
}
/** One literal action. */
export interface BankStep {
    /** Unique id within the bank, referenced by later guards. */
    readonly id: string;
    /** Registered tool name to dispatch. */
    readonly tool: string;
    /** Complete literal arguments; never a placeholder or an expression. */
    readonly arguments: Record<string, JsonValue>;
    /** Conditions over earlier steps; the chain stops at this step when any is false. */
    readonly when: readonly Guard[];
}
/** One settled step, kept for guards and for the model-facing summary. */
export interface StepReceipt {
    readonly id: string;
    readonly tool: string;
    readonly ok: boolean;
    readonly ms: number;
    /** Model-facing text of the step, already truncated. */
    readonly text: string;
    /** Canonical value, kept in memory only so guards can read it. */
    readonly value?: JsonValue;
}
/** The enforced shape of one bank. */
export interface ChainLimits {
    /** Tool names a bank may dispatch. */
    readonly allowedTools: readonly string[];
    /** Upper bound on steps per call. */
    readonly maxSteps: number;
}
/** A rejected bank, with a message meant for the model to correct. */
export declare class ChainInputError extends Error {
    constructor(message: string);
}
/**
 * Validate a model-supplied bank before anything runs.
 * @param raw - the `steps` argument, unvalidated.
 * @param limits - allowed tools and the step ceiling.
 * @returns the normalized bank.
 * @throws {ChainInputError} when the bank is malformed, unbounded, or recursive.
 */
export declare function parseSteps(raw: unknown, limits: ChainLimits): BankStep[];
/** Resolve a dot path against one JSON value; array indices are numeric segments. */
export declare function lookup(value: unknown, path: string): {
    exists: boolean;
    value?: JsonValue;
};
/** Structural equality for lossless JSON. */
export declare function jsonEqual(a: unknown, b: unknown): boolean;
/**
 * Evaluate one guard against settled receipts.
 * A guard whose step never ran fails closed.
 * @param guard - the declared condition.
 * @param receipts - settled receipts keyed by step id.
 * @returns whether the condition holds.
 */
export declare function guardHolds(guard: Guard, receipts: ReadonlyMap<string, StepReceipt>): boolean;
/** Explain a failed guard without leaking more than the compared value. */
export declare function describeGuard(guard: Guard, receipts: ReadonlyMap<string, StepReceipt>): string;
/** Keep both ends of a long receipt; the middle is usually the least useful. */
export declare function truncate(text: string, max: number): string;
