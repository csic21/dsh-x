/**
 * A promise plus the functions that settle it.
 *
 * `Promise.withResolvers` needs the ES2024 lib, which this repository does not
 * enable, so the same shape is built by hand.
 */
export interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
  reject(error: unknown): void
}

/** Create one deferred. */
export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
