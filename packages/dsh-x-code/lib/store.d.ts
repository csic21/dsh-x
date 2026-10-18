import { HarnessError } from '@deepseek-ai/dsh-llm';
/** Durable storage failure that carries a routable Code error code. */
export declare class CodeError extends HarnessError {
    constructor(code: string, message: string);
}
export declare const fail: (code: string, message: string) => CodeError;
export declare const hash: (value: unknown) => string;
export declare function sessionId(value: unknown): string;
/** The durable per-session review document; the record type is the caller's contract. */
export interface ReviewData<T = Record<string, unknown>> {
    version: number;
    scope: string;
    sessionId: string;
    revision: number;
    reviews: T[];
}
/** Bounded per-session review storage rooted in one profile. */
export interface ReviewStore<T = Record<string, unknown>> {
    scope: string;
    read(id: string): ReviewData<T>;
    mutate(id: string, fn: (value: ReviewData<T>) => void): ReviewData<T>;
}
export declare function createReviewStore<T = Record<string, unknown>>(profile: string): ReviewStore<T>;
