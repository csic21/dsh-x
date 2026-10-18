/** Bounded JSON value crossing the browser bridge; identical to the official `JsonValue`. */
export type BrowserJson = null | boolean | number | string | BrowserJson[] | { [key: string]: BrowserJson }
/** Shared finite protocol. Never accepts JavaScript, selectors, CDP or arbitrary IPC. */
export const ACTIONS = Object.freeze(['observe', 'navigate', 'click', 'type', 'scroll', 'press', 'back', 'forward', 'reload'])
export const NAVIGATION = new Set(['navigate', 'back', 'forward', 'reload'])
export const MAX_RESULT_BYTES = 64 * 1024
/** Error carrying a stable browser protocol code; the host maps it to a tool failure. */
export interface BrowserFailure extends Error { code: string }
/** One validated finite browser command; only the fields its action allows are present. */
export interface BrowserCommand {
  action: string
  url?: string
  target?: string
  text?: string
  x?: number
  y?: number
  key?: string
}
/** Admitted field names per action; every other payload key is rejected. */
type CommandFields = Readonly<Record<string, readonly string[]>>
/** Untrusted value restricted to a plain object; class instances, arrays and primitives fail. */
function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
}
export function fail(code: string, message: string): BrowserFailure { return Object.assign(new Error(message), { code }) }
export function identifier(value: unknown, label = 'identifier'): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9:_-]{1,160}$/.test(value)) throw fail('BROWSER_INPUT', `Invalid ${label}.`)
  return value
}
export function parseAddress(value: unknown, applicationOrigin?: string | null): string {
  if (typeof value !== 'string' || value.length > 4096 || !value.trim()) throw fail('BROWSER_URL', 'Enter a bounded HTTP(S) URL.')
  let url: URL
  try { url = new URL(value.includes('://') ? value : `https://${value}`) } catch { throw fail('BROWSER_URL', 'Enter a valid HTTP(S) URL.') }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw fail('BROWSER_URL', 'Only HTTP(S) URLs without embedded credentials are allowed.')
  if (applicationOrigin && applicationOrigin !== 'null') {
    let host: URL | undefined
    try { host = new URL(applicationOrigin) } catch {}
    if (host && ['http:', 'https:'].includes(host.protocol) && url.port === host.port && (url.hostname === host.hostname || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw fail('BROWSER_HOST', 'The application host cannot be opened in a browser guest.')
    // Desktop's dsh-app origin is not its HTTP host. The official main-process
    // guest network hook independently blocks the actual authenticated host.
  }
  return url.href
}
export function validateCommand(raw: unknown, applicationOrigin?: string | null): BrowserCommand {
  if (!plainObject(raw) || typeof raw.action !== 'string' || !ACTIONS.includes(raw.action)) throw fail('BROWSER_INPUT', 'Choose a supported browser action.')
  const fields = ({ observe: [], navigate: ['url'], click: ['target'], type: ['target', 'text'], scroll: ['x', 'y'], press: ['key'], back: [], forward: [], reload: [] } as CommandFields)[raw.action]
  if (Object.keys(raw).some(key => key !== 'action' && !fields.includes(key))) throw fail('BROWSER_INPUT', 'Unknown browser command field.')
  const result: BrowserCommand = { action: raw.action }
  if (raw.action === 'navigate') result.url = parseAddress(raw.url, applicationOrigin)
  if (['click', 'type'].includes(raw.action)) {
    if (typeof raw.target !== 'string' || !/^e\d+:s\d+:n\d+$/.test(raw.target)) throw fail('BROWSER_TARGET', 'Use an exact target from the latest observation.')
    result.target = raw.target
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
export function boundedResult(value: unknown): BrowserJson {
  let json
  try { json = JSON.stringify(value) } catch { throw fail('BROWSER_RESULT', 'Invalid browser result.') }
  if (!json || new TextEncoder().encode(json).length > MAX_RESULT_BYTES) throw fail('BROWSER_RESULT', 'Browser result exceeds the size limit.')
  return JSON.parse(json)
}

/** Only origin/path may cross into a model result; query/hash can contain login secrets. */
export function modelUrl(value: unknown): string { try { const url = new URL(value as string); if (!['http:', 'https:'].includes(url.protocol)) return ''; url.username = ''; url.password = ''; url.search = ''; url.hash = ''; return url.href } catch { return '' } }
