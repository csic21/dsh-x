import type { BackendKind, CapabilitySet } from '../contract/capabilities.ts'
import type { BrowserCommand } from '../contract/commands.ts'
import type { BrowserJson } from '../contract/json.ts'
import type { Observation } from '../contract/observation.ts'

/** One profile/session/workspace binding; a target only ever acts inside its own. */
export interface BrowserScope {
  profile: string
  sessionId: string
  workspace: string
}

/** Current turn boundary reported by the host session projections. */
export interface BrowserTurn {
  runId: string | null
  turn: number
}

/** Model-facing target state; backend-private handles never leave the backend. */
export interface TargetSummary {
  targetId: string
  title: string
  url: string
  visible: boolean
  revision: number
}

/** Settled value of one backend command; `observation` is untrusted page evidence. */
export interface BackendExecution {
  targetId: string
  revision: number
  observation: Observation | null
  value: BrowserJson | null
  untrustedPageContent: true
}

/** One execution backend. Authority, approvals and turn binding live above this interface. */
export interface BrowserBackend {
  readonly kind: BackendKind
  readonly capabilities: CapabilitySet
  ensure(scope: BrowserScope, signal?: AbortSignal): Promise<void>
  list(scope: BrowserScope, signal?: AbortSignal): Promise<TargetSummary[]>
  open(scope: BrowserScope, url: string, signal?: AbortSignal): Promise<TargetSummary>
  observe(scope: BrowserScope, targetId: string, signal?: AbortSignal): Promise<Observation>
  execute(scope: BrowserScope, targetId: string, command: BrowserCommand, signal?: AbortSignal): Promise<BackendExecution>
  close(scope: BrowserScope, targetId: string, signal?: AbortSignal): Promise<void>
  dispose(): Promise<void>
}
