import { fail } from './errors.ts'
import { identifier } from './ids.ts'
import { MAX_OBSERVATION_REFS, MAX_OBSERVATION_TEXT_BYTES } from './limits.ts'

/** One bounded page observation shared by every backend; the model only ever sees this shape. */
export interface Observation {
  targetId: string
  url: string
  title: string
  revision: number
  refs: Record<string, string>
  text: string
  truncated: boolean
}

/** Untrusted backend input normalized before it reaches a model result. */
export interface ObservationInput {
  targetId: unknown
  revision: unknown
  url?: unknown
  title?: unknown
  refs?: unknown
  text?: unknown
}

const REF_KEY = /^[A-Za-z0-9:_@.-]{1,64}$/
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g

/** Only origin/path may cross into a model result; query/hash can contain login secrets. */
export function modelUrl(value: unknown): string {
  try {
    const url = new URL(value as string)
    if (!['http:', 'https:'].includes(url.protocol)) return ''
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return url.href
  } catch { return '' }
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

/** Cut on code-point boundaries so a multi-byte character never splits. */
function truncate(value: string, maxBytes: number): { text: string, truncated: boolean } {
  if (byteLength(value) <= maxBytes) return { text: value, truncated: false }
  let text = ''
  let used = 0
  for (const character of value) {
    const size = byteLength(character)
    if (used + size > maxBytes) break
    text += character
    used += size
  }
  return { text, truncated: true }
}

function boundRefs(value: unknown): { refs: Record<string, string>, truncated: boolean } {
  if (value === undefined) return { refs: {}, truncated: false }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail('BROWSER_RESULT', 'Observation references must be a plain object.')
  const refs: Record<string, string> = {}
  let kept = 0
  let truncated = false
  for (const [key, label] of Object.entries(value as Record<string, unknown>)) {
    if (typeof label !== 'string' || !REF_KEY.test(key)) { truncated = true; continue }
    if (kept >= MAX_OBSERVATION_REFS) { truncated = true; break }
    const bounded = truncate(label.replace(CONTROL, ''), 512)
    refs[key] = bounded.text
    if (bounded.truncated) truncated = true
    kept++
  }
  return { refs, truncated }
}

/** Normalize one backend observation: bounded text, bounded references, no private URL parts. */
export function boundObservation(input: ObservationInput): Observation {
  const targetId = identifier(input.targetId, 'target')
  if (!Number.isSafeInteger(input.revision) || (input.revision as number) < 0) throw fail('BROWSER_RESULT', 'Observation revision must be a non-negative integer.')
  if (input.url !== undefined && typeof input.url !== 'string') throw fail('BROWSER_RESULT', 'Observation URL must be a string.')
  if (input.title !== undefined && typeof input.title !== 'string') throw fail('BROWSER_RESULT', 'Observation title must be a string.')
  if (input.text !== undefined && typeof input.text !== 'string') throw fail('BROWSER_RESULT', 'Observation text must be a string.')
  const url = typeof input.url === 'string' ? modelUrl(input.url) : ''
  const title = truncate((input.title ?? '').replace(CONTROL, ''), 512)
  const text = truncate((input.text ?? '').replace(CONTROL, ''), MAX_OBSERVATION_TEXT_BYTES)
  const refs = boundRefs(input.refs)
  return {
    targetId,
    url,
    title: title.text,
    revision: input.revision as number,
    refs: refs.refs,
    text: text.text,
    truncated: title.truncated || text.truncated || refs.truncated,
  }
}
