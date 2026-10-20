import { realpathSync } from 'node:fs'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { BrowserScope, BrowserTurn } from './backends/types.ts'
import { fail } from './contract/errors.ts'
import { identifier } from './contract/ids.ts'
import type { BrowserOwner } from './ownership.ts'

/** One DSH session as the official sessions service exposes it. */
export interface BrowserSession { id: string }
/** Turn boundary projection used to bind a grant to exactly one run. */
export interface BrowserTurnBoundary { lastTurn: number, openTurnStartSeq: number | null }
/** Official approval service this plugin consumes without a shipped type dependency. */
export interface BrowserApproval { request(request: { agent: unknown, callId: unknown, toolName: string, signal: AbortSignal, reason: string }): Promise<unknown> }

/**
 * Host services the authority reads. Optional services stay late-bound through `get`
 * so a service provided after plugin apply is still observed, as before.
 */
export interface AuthorityServices {
  profileContext: { dir: string }
  workingDirectory: { ensure(agent: unknown, signal: AbortSignal): Promise<string | undefined>, get(session: unknown): unknown }
  get(name: string): unknown
}

/** One live owning run handed to the backend for a single dispatch. */
export interface ExecutionTurn {
  signal: AbortSignal
  ownerToken: symbol | null
  runId: string
  turnNumber: number
  assertCurrent(): void
}

type SessionsService = { get(id: string): BrowserSession | undefined }
type ProjectionsService = { stateOf(session: BrowserSession, key: string): BrowserTurnBoundary | null | undefined }

function sessionsOf(services: AuthorityServices): SessionsService | undefined {
  return services.get('sessions') as SessionsService | undefined
}

function projectionsOf(services: AuthorityServices): ProjectionsService | undefined {
  return services.get('sessionProjections') as ProjectionsService | undefined
}

function approvalOf(services: AuthorityServices): BrowserApproval | undefined {
  return services.get('approval') as BrowserApproval | undefined
}

/**
 * Profile/session/workspace resolution, turn binding and approval.
 * Grant semantics stay backend-specific: the embedded backend grants per tab and turn,
 * while the CDP backend treats the explicit `backend: 'cdp'` config as consent and still
 * requires one official approval per action. See docs/dev/browser-cdp.md.
 */
export function createAuthority(services: AuthorityServices) {
  const profile = realpathSync(services.profileContext.dir)

  const contextOf = async (sessionId: string, exec?: ToolRunContext): Promise<BrowserScope> => {
    identifier(sessionId, 'session')
    const session = exec?.agent?.session ?? sessionsOf(services)?.get(sessionId)
    if (!session || session.id !== sessionId) throw fail('BROWSER_SESSION', 'Open an existing DSH conversation.')
    const cwd = exec ? await services.workingDirectory.ensure(exec.agent, exec.signal) : services.workingDirectory.get(session)
    if (typeof cwd !== 'string') throw fail('BROWSER_WORKSPACE', 'The conversation workspace is not ready.')
    return { profile, sessionId, workspace: realpathSync(cwd) }
  }

  const turnOf = (sessionId: string): BrowserTurn | null => {
    const session = sessionsOf(services)?.get(sessionId)
    const boundary = session && projectionsOf(services)?.stateOf(session, 'turnBoundary')
    return boundary ? { turn: boundary.lastTurn, runId: boundary.openTurnStartSeq === null ? null : `${sessionId}:${boundary.openTurnStartSeq}` } : null
  }

  const binding = async (exec: ToolRunContext): Promise<BrowserScope> => {
    if (!exec.agent?.session?.id) throw fail('BROWSER_SESSION', 'A current DSH conversation is required.')
    return contextOf(exec.agent.session.id, exec)
  }

  function executionTurn(exec: ToolRunContext, nativeOwner: BrowserOwner | null): ExecutionTurn {
    const current = () => projectionsOf(services)?.stateOf(exec.agent!.session, 'turnBoundary')?.openTurnStartSeq
    const sequence = current()
    if (!Number.isSafeInteger(sequence) || sequence! < 0) throw fail('BROWSER_RUN', 'A live owning DSH turn is required.')
    return {
      signal: exec.signal,
      ownerToken: nativeOwner?.ownerToken ?? null,
      runId: `${exec.agent!.session.id}:${sequence}`,
      turnNumber: projectionsOf(services)!.stateOf(exec.agent!.session, 'turnBoundary')!.lastTurn,
      assertCurrent() {
        nativeOwner?.assertCurrent()
        exec.signal.throwIfAborted()
        if (current() !== sequence) throw fail('BROWSER_RUN', 'The owning DSH turn ended.')
      },
    }
  }

  /** Every non-observe action needs one explicit official approval; no backend may skip it. */
  async function approve(exec: ToolRunContext, reason: string): Promise<void> {
    const approval = approvalOf(services)
    if (!approval) throw fail('BROWSER_APPROVAL', 'Official approval is unavailable; the browser action was not sent.')
    const result = await approval.request({ agent: exec.agent, callId: exec.callId, toolName: exec.name, signal: exec.signal, reason })
    if (result !== 'allowed-once') throw fail('BROWSER_APPROVAL', 'Browser action was not approved.')
  }

  return { profile, contextOf, turnOf, binding, executionTurn, approve }
}

export type BrowserAuthority = ReturnType<typeof createAuthority>
