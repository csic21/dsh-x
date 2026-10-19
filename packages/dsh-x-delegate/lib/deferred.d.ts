/**
 * A promise plus the functions that settle it.
 *
 * `Promise.withResolvers` needs the ES2024 lib, which this repository does not
 * enable, so the same shape is built by hand.
 */
export interface Deferred<T> {
    readonly promise: Promise<T>;
    resolve(value: T): void;
    reject(error: unknown): void;
}
/** Create one deferred. */
export declare function deferred<T>(): Deferred<T>;
