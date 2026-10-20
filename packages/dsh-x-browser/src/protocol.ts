import { ACTION_SPEC, EMBEDDED_ACTIONS, EMBEDDED_REF_PATTERN, NAVIGATION, type Action, type BrowserCommand } from './contract/commands.ts'
import { fail } from './contract/errors.ts'
import type { BrowserFailure } from './contract/errors.ts'
import { identifier } from './contract/ids.ts'
import { boundedJson } from './contract/json.ts'
import type { BrowserJson } from './contract/json.ts'
import { modelUrl } from './contract/observation.ts'
import { parseAddress } from './contract/url.ts'

export type { BrowserCommand, BrowserFailure, BrowserJson }
export { boundedJson as boundedResult, fail, identifier, modelUrl, NAVIGATION, parseAddress }
export { MAX_RESULT_BYTES } from './contract/limits.ts'

/** Shared finite protocol. Never accepts JavaScript, selectors, CDP or arbitrary IPC. */
export const ACTIONS: readonly string[] = Object.freeze([...EMBEDDED_ACTIONS])

/** Untrusted value restricted to a plain object; class instances, arrays and primitives fail. */
function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
}

export function validateCommand(raw: unknown, applicationOrigin?: string | null, refPattern: RegExp = EMBEDDED_REF_PATTERN, actions: readonly string[] = ACTIONS): BrowserCommand {
  if (!plainObject(raw) || typeof raw.action !== 'string' || !actions.includes(raw.action)) throw fail('BROWSER_INPUT', 'Choose a supported browser action.')
  const fields = ACTION_SPEC[raw.action as Action].fields
  if (Object.keys(raw).some(key => key !== 'action' && !fields.includes(key))) throw fail('BROWSER_INPUT', 'Unknown browser command field.')
  const result: BrowserCommand = { action: raw.action as Action }
  if (raw.action === 'navigate') result.url = parseAddress(raw.url, applicationOrigin)
  if (['click', 'type'].includes(raw.action)) {
    if (typeof raw.target !== 'string' || !refPattern.test(raw.target)) throw fail('BROWSER_TARGET', 'Use an exact target from the latest observation.')
    result.target = raw.target
  }
  if (raw.action === 'select') {
    if (typeof raw.target !== 'string' || !refPattern.test(raw.target)) throw fail('BROWSER_TARGET', 'Use an exact target from the latest observation.')
    if (typeof raw.value !== 'string' || !raw.value || raw.value.length > 500 || /\u0000/.test(raw.value)) throw fail('BROWSER_INPUT', 'Select value must contain 1–500 characters.')
    result.target = raw.target
    result.value = raw.value
  }
  if (raw.action === 'type') {
    if (typeof raw.text !== 'string' || !raw.text || raw.text.length > 2000 || /\u0000/.test(raw.text)) throw fail('BROWSER_INPUT', 'Text must contain 1–2000 characters.')
    if (/-----BEGIN [A-Z ]*PRIVATE KEY|\b(?:sk-|gh[pousr]_|github_pat_|AKIA)[A-Za-z0-9_\-]{10,}|\bBearer\s+[A-Za-z0-9._\-]{12,}/i.test(raw.text)) throw fail('BROWSER_SECRET', 'Credentials must be entered manually.')
    if (/^\s*\d{4,8}\s*$/.test(raw.text) || /(?:\d[ -]?){13,19}/.test(raw.text)) throw fail('BROWSER_SECRET', 'Verification codes and card-like numbers must be entered manually.')
    result.text = raw.text
  }
  if (raw.action === 'scroll') {
    for (const key of ['x', 'y'] as const) { if (!Number.isInteger(raw[key]) || Math.abs(raw[key] as number) > 2000) throw fail('BROWSER_INPUT', 'Scroll distance must be an integer between -2000 and 2000.'); result[key] = raw[key] as number }
  }
  if (raw.action === 'press') {
    if (!['Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'].includes(raw.key as string)) throw fail('BROWSER_INPUT', 'This key is not supported. Use an explicitly approved click to submit.')
    result.key = raw.key as string
  }
  return result
}
