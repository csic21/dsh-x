import { CDP_ACTIONS, EMBEDDED_ACTIONS, type Action } from './commands.ts'
import { fail } from './errors.ts'

export type Capability = Action
export type CapabilitySet = ReadonlySet<Capability>
export type BackendKind = 'embedded' | 'cdp'

/** Actions the embedded webview backend implements today. */
export const EMBEDDED_CAPABILITIES: CapabilitySet = new Set(EMBEDDED_ACTIONS)

/** Actions the agent-browser (CDP) backend exposes to the model. */
export const CDP_CAPABILITIES: CapabilitySet = new Set(CDP_ACTIONS)

export function capabilitiesOf(kind: BackendKind): CapabilitySet {
  return kind === 'embedded' ? EMBEDDED_CAPABILITIES : CDP_CAPABILITIES
}

export function supports(capabilities: CapabilitySet, action: Capability): boolean {
  return capabilities.has(action)
}

/** Refuse the action before any backend work; callers never branch on backend kind. */
export function assertCapability(capabilities: CapabilitySet, action: Capability): void {
  if (!capabilities.has(action)) throw fail('BROWSER_UNSUPPORTED', `This browser backend does not support ${action}.`)
}
