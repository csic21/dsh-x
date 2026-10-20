import { boundObservation } from '../../contract/observation.ts'
import type { Observation } from '../../contract/observation.ts'
import type { SnapshotResult } from './contract.ts'

/** Model-facing refs are the bare `e12` keys; the CLI expects the `@e12` form. */
export function cliRef(ref: string): string {
  return ref.startsWith('@') ? ref : `@${ref}`
}

const VALUE_ROLE = /\b(?:textbox|searchbox|combobox|spinbutton|slider)\b/

/**
 * agent-browser appends the current form value after `]:` for value-bearing roles.
 * Values never enter a model observation; the role/name/ref line is kept.
 */
export function redactSnapshot(text: string): string {
  return text.split('\n').map(line => {
    if (!VALUE_ROLE.test(line)) return line
    const marker = line.indexOf(']:')
    return marker >= 0 ? line.slice(0, marker + 2) : line
  }).join('\n')
}

/** Turn one CLI snapshot into the shared observation shape; text is bounded downstream. */
export function observationFromSnapshot(targetId: string, revision: number, snapshot: SnapshotResult, title = ''): Observation {
  const refs: Record<string, string> = {}
  for (const [ref, value] of Object.entries(snapshot.refs)) {
    const label = [value.role, value.name].filter(part => typeof part === 'string' && part.length > 0).join(': ')
    refs[ref] = label || 'element'
  }
  return boundObservation({ targetId, revision, url: snapshot.origin, title, text: redactSnapshot(snapshot.snapshot), refs })
}
