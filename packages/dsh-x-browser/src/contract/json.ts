import { fail } from './errors.ts'
import { MAX_RESULT_BYTES } from './limits.ts'

/** Bounded JSON value crossing the browser bridge; identical to the official `JsonValue`. */
export type BrowserJson = null | boolean | number | string | BrowserJson[] | { [key: string]: BrowserJson }

/** Serialize once, enforce the byte budget, then return a detached copy. */
export function boundedJson(value: unknown, maxBytes: number = MAX_RESULT_BYTES): BrowserJson {
  let json: string | undefined
  try { json = JSON.stringify(value) } catch { throw fail('BROWSER_RESULT', 'Invalid browser result.') }
  if (!json || new TextEncoder().encode(json).length > maxBytes) throw fail('BROWSER_RESULT', 'Browser result exceeds the size limit.')
  return JSON.parse(json) as BrowserJson
}
