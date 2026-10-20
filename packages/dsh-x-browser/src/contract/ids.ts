import { fail } from './errors.ts'

/** Bounded opaque identifier shared by sessions, tabs and targets. */
export function identifier(value: unknown, label = 'identifier'): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9:_-]{1,160}$/.test(value)) throw fail('BROWSER_INPUT', `Invalid ${label}.`)
  return value
}
