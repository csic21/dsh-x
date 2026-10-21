import { randomUUID, timingSafeEqual } from 'node:crypto'
import { boundedResult, fail, identifier, modelUrl, NAVIGATION, validateCommand } from '../../protocol.ts'
import type { BrowserCommand, BrowserFailure, BrowserJson } from '../../protocol.ts'
import type { BrowserScope, BrowserTurn } from '../types.ts'

declare module '@deepseek-ai/cordis' {
  interface Events {
    /** Bounded browser diagnostics consumed by tests and packaged smoke tooling. */
    'dsh-x-browser/trace'(event: BrowserTraceEvent): void
  }
}

export type { BrowserScope, BrowserTurn }

/** Concrete embedded backend the composition root wires into the tool surface. */
export type EmbeddedBroker = ReturnType<typeof createBrowserBroker>
/** Model-facing tab snapshot; the capability never leaves the trusted renderer closure. */
export type BrowserPublicTab = { tabId: string, sessionId: string, epoch: number, grantRevision: number, visible: boolean, granted: boolean, title: string, url: string, busy: boolean, status: string }
/** Bounded diagnostics emitted as `dsh-x-browser/trace` for tests and packaged smoke tooling. */
export type BrowserTraceEvent = { event: string, reason: string | null, tabId: string, sessionId: string, expectedTurn: number | null, currentTurn: number | null, runId: string | null, expectedRunId: string | null, currentRunId: string | null, epoch: number, grantRevision: number }
/** Settled canonical value of one owned browser command; `result` is untrusted page evidence. */
export type BrowserExecutionResult = { tabId: string, epoch: number, grantRevision: number, untrustedPageContent: true, result: BrowserJson }
/** Capability-bound client request; every field is runtime-validated before use. */
type BrowserAuthRequest = { tabId?: string, capability?: string }
/** Capability-bound state report; every field is runtime-validated before use. */
type BrowserSyncPayload = BrowserAuthRequest & { epoch: number, visible: boolean, title?: string, url?: string }
/** Capability-bound grant request; every field is runtime-validated before use. */
type BrowserGrantPayload = BrowserAuthRequest & { epoch: number, grantRevision: number }
/** Capability-bound dispatch admission; every field is runtime-validated before use. */
type BrowserConfirmPayload = BrowserAuthRequest & { commandId: string, grantRevision: number, epoch: number }
/** Capability-bound acknowledgement; every field is runtime-validated before use. */
type BrowserAcknowledgePayload = BrowserAuthRequest & { commandId: string, grantRevision: number, epoch: number, result?: unknown, error?: unknown }
/** Native owner lifetime handed to one dispatch. */
type BrowserDispatchOwner = { signal?: AbortSignal, runId?: unknown, turnNumber?: unknown, assertCurrent?: () => void, ownerToken?: symbol | null }
/** Queue entry for one dispatched command; its abort hook and watchdog are attached immediately after creation. */
type BrowserPending = { id: string, epoch: number, revision: number, command: BrowserCommand, delivered: boolean, resolve: (value: BrowserExecutionResult) => void, reject: (error: BrowserFailure) => void, signal?: AbortSignal, assertCurrent?: () => void, abort?: () => void, timer?: NodeJS.Timeout }
/** One live tab lease owned by this broker. */
type BrowserTab = { id: string, capability: string, clientTabId: unknown, binding: BrowserScope, epoch: number, revision: number, visible: boolean, granted: boolean, title: string, url: string, runId: string | null, ownerToken: symbol | null, ownerClaimed: boolean, pending: BrowserPending | null, lastSeen: number, status: string, expectedTurn?: number, observedTurn?: number, observedRunId?: string | null }
/** Why one dispatched command stopped; `run-ended` keeps a sticky grant, everything else revokes it. */
type BrowserStop = { code: 'BROWSER_STALE' | 'BROWSER_RUN' | 'BROWSER_REVOKED', message: string }
/** Host services the broker calls back into. */
type BrowserBrokerOptions = {
  profile: string
  contextOf: (sessionId: string) => Promise<BrowserScope>
  turnOf?: (sessionId: string) => BrowserTurn | null | undefined
  now?: () => number
  timeoutMs?: number
  heartbeatMs?: number
  /**
   * Unattended profile policy. When true, one explicit UI grant keeps working for
   * this tab across turns and across in-tab navigation instead of expiring at the
   * end of the authorizing turn. Take over, hide, close, workspace change and
   * renderer disconnection still revoke it. Defaults to false (per-turn grant).
   */
  stickyGrants?: boolean
  /**
   * Unattended profile policy. When true, the renderer grants AI access itself as
   * soon as the tab is ready and visible, so nobody has to press Allow AI. Only the
   * explicit `autoGrant` config reaches this flag; the capability still never leaves
   * the renderer closure, and Take over, hiding, closing, workspace change and
   * renderer disconnection still revoke the grant.
   */
  autoGrant?: boolean
  onRevoke?: (tab: BrowserPublicTab & { reason: string }) => void
  onTrace?: (event: BrowserTraceEvent) => void
}

/** One broker per host profile. Capabilities stay in trusted renderer closures, never model results. */
export function createBrowserBroker({ profile, contextOf, turnOf, now = Date.now, timeoutMs = 20_000, heartbeatMs = 5_000, stickyGrants = false, autoGrant = false, onRevoke = () => {}, onTrace = () => {} }: BrowserBrokerOptions) {
  const tabs = new Map<string, BrowserTab>()
  let disposed = false
  const same = (left?: BrowserScope | null, right?: BrowserScope | null) => left?.sessionId === right?.sessionId && left?.workspace === right?.workspace && left?.profile === right?.profile
  const publicTab = (tab: BrowserTab): BrowserPublicTab => ({ tabId: tab.id, sessionId: tab.binding.sessionId, epoch: tab.epoch, grantRevision: tab.revision, visible: tab.visible, granted: tab.granted, title: tab.granted ? tab.title : '', url: tab.granted ? modelUrl(tab.url) : '', busy: Boolean(tab.pending), status: tab.status })
  const touch = (tab: BrowserTab) => { tab.lastSeen = now() }
  function trace(event: string, tab: BrowserTab, reason: string | null = null, observedTurn?: BrowserTurn | null) {
    try {
      const turn = observedTurn ?? turnOf?.(tab.binding.sessionId)
      onTrace(Object.freeze({ event, reason, tabId: tab.id, sessionId: tab.binding.sessionId, expectedTurn: tab.expectedTurn ?? null, currentTurn: turn?.turn ?? null, runId: tab.runId, expectedRunId: tab.runId, currentRunId: turn?.runId ?? null, epoch: tab.epoch, grantRevision: tab.revision }))
    } catch {}
  }
  function get(id: unknown) {
    const tab = tabs.get(identifier(id, 'tab'))
    if (disposed || !tab) throw fail('BROWSER_CLOSED', 'The browser tab is closed or no longer connected.')
    return tab
  }
  function authenticate(args: BrowserAuthRequest) {
    const tab = get(args.tabId), cap = args.capability
    if (typeof cap !== 'string' || cap.length !== tab.capability.length || !timingSafeEqual(Buffer.from(cap), Buffer.from(tab.capability))) throw fail('BROWSER_OWNER', 'The browser capability does not own this tab.')
    return tab
  }
  function settle(tab: BrowserTab, error: BrowserFailure | null, value?: BrowserExecutionResult) {
    const pending = tab.pending
    if (!pending) return
    tab.pending = null
    clearTimeout(pending.timer!)
    pending.signal?.removeEventListener('abort', pending.abort!)
    error ? pending.reject(error) : pending.resolve(value!)
  }
  function revoke(tab: BrowserTab, reason = 'taken-over') {
    tab.granted = false; tab.revision++; tab.status = reason
    trace('revoke', tab, reason)
    tab.runId = null; tab.ownerToken = null; tab.ownerClaimed = false
    // Revoke queue authority synchronously, before any runner interrupt callback.
    settle(tab, fail('BROWSER_REVOKED', `Browser control ended: ${reason}. A sent input cannot be undone; do not retry it automatically.`))
    try { onRevoke({ ...publicTab(tab), reason }) } catch {}
  }
  /**
   * Abandon the queued command without touching the grant.
   *
   * Only used under `stickyGrants`, where the grant belongs to the tab rather than
   * to one turn: the authority that authorized this command is gone, but the tab
   * still is. Every path that keeps this distinction also records a trace event, so
   * a non-sticky profile can never reach it.
   */
  function stop(tab: BrowserTab, reason: string, code: BrowserStop['code'], message: string) {
    trace('stop', tab, reason)
    settle(tab, fail(code, message))
  }
  async function verify(tab: BrowserTab, binding?: BrowserScope) {
    const current = await contextOf(tab.binding.sessionId)
    if (!same(tab.binding, { ...current, profile }) || binding && !same(tab.binding, binding)) {
      trace('verify-failure', tab, 'workspace-changed')
      revoke(tab, 'workspace-changed'); throw fail('BROWSER_SCOPE', 'The browser session or workspace changed.')
    }
    if (tab.granted) {
      const turn = turnOf?.(tab.binding.sessionId)
      if (tab.observedTurn !== turn?.turn || tab.observedRunId !== turn?.runId) { trace('turnchange', tab, null, turn); tab.observedTurn = turn?.turn; tab.observedRunId = turn?.runId }
      // A sticky grant is bound to the tab, not to the turn that authorized it, so a
      // turn boundary is not a revocation reason. Everything else still fails closed.
      if (!stickyGrants && (!turn || turn.turn > tab.expectedTurn! || turn.turn === tab.expectedTurn && (!turn.runId || tab.runId && turn.runId !== tab.runId))) { trace('verify-failure', tab, 'turn-ended', turn); revoke(tab, 'turn-ended'); throw fail('BROWSER_RUN', 'The browser grant is no longer bound to the current or next authorized turn.') }
    }
    if (tab.granted && now() - tab.lastSeen > heartbeatMs) { trace('verify-failure', tab, 'disconnected'); revoke(tab, 'disconnected'); throw fail('BROWSER_OFFLINE', 'The visible browser stopped responding.') }
  }
  const sweep = setInterval(() => { for (const tab of tabs.values()) if (tab.granted && now() - tab.lastSeen > heartbeatMs) revoke(tab, 'disconnected') }, Math.min(heartbeatMs, 1000))
  sweep.unref?.()
  return {
    async register({ sessionId, clientTabId }: { sessionId: string, clientTabId: string }) {
      identifier(sessionId, 'session'); identifier(clientTabId, 'client tab')
      if (disposed) throw fail('BROWSER_CLOSED', 'Browser is unavailable.')
      const current = await contextOf(sessionId)
      if (!current || current.sessionId !== sessionId || typeof current.workspace !== 'string') throw fail('BROWSER_SCOPE', 'Open an existing conversation with a workspace.')
      for (const old of tabs.values()) if (old.binding.sessionId === sessionId && old.clientTabId === clientTabId) { revoke(old, 'replaced'); tabs.delete(old.id) }
      if (tabs.size >= 32) throw fail('BROWSER_LIMIT', 'Close a browser tab before opening another.')
      const tab: BrowserTab = { id: randomUUID(), capability: randomUUID() + randomUUID(), clientTabId, binding: { ...current, profile }, epoch: 0, revision: 0, visible: false, granted: false, title: '', url: '', runId: null, ownerToken: null, ownerClaimed: false, pending: null, lastSeen: now(), status: 'manual' }
      tabs.set(tab.id, tab)
      return { ...publicTab(tab), capability: tab.capability, workspace: tab.binding.workspace, autoGrant }
    },
    async list(binding: BrowserScope, { ownerToken = null, assertCurrent }: { ownerToken?: symbol | null, assertCurrent?: () => void } = {}) {
      const result: BrowserPublicTab[] = []
      for (const tab of tabs.values()) if (same(tab.binding, binding)) { try {
        await verify(tab, binding)
        assertCurrent?.()
        if (ownerToken !== null && (!tab.granted || !tab.visible)) continue
        if (tab.ownerClaimed && tab.ownerToken !== ownerToken) continue
        if (ownerToken !== null) { tab.ownerClaimed = true; tab.ownerToken = ownerToken }
        result.push(publicTab(tab))
      } catch {} }
      return { tabs: result, runtime: 'dsh', nativeRuntimes: [], experimental: true }
    },
    async sync(args: BrowserSyncPayload) {
      const tab = authenticate(args)
      await verify(tab)
      if (!Number.isSafeInteger(args.epoch) || args.epoch < tab.epoch || typeof args.visible !== 'boolean') throw fail('BROWSER_STALE', 'Stale browser state.')
      // A sticky grant follows this tab into a new document; the pending command that
      // targeted the old document is abandoned rather than revoked. The per-turn
      // default keeps the original behavior: any document change ends the grant.
      if (args.epoch !== tab.epoch && tab.pending && !NAVIGATION.has(tab.pending.command.action)) {
        stickyGrants ? stop(tab, 'document-changed', 'BROWSER_STALE', 'The page changed before the queued command ran. Observe again.') : revoke(tab, 'document-changed')
      }
      tab.epoch = args.epoch; tab.visible = args.visible
      tab.title = typeof args.title === 'string' ? args.title.slice(0, 200) : ''
      tab.url = typeof args.url === 'string' ? args.url.slice(0, 4096) : ''
      if (!tab.visible && tab.granted) revoke(tab, 'hidden')
      touch(tab)
      return publicTab(tab)
    },
    async grant(args: BrowserGrantPayload) {
      const tab = authenticate(args)
      await verify(tab)
      if (!tab.visible || args.epoch !== tab.epoch || args.grantRevision !== tab.revision) throw fail('BROWSER_STALE', 'Show and refresh this tab before enabling AI control.')
      if (tab.pending) throw fail('BROWSER_BUSY', 'A previous browser operation is still pending.')
      const turn = turnOf?.(tab.binding.sessionId)
      if (!turn || !Number.isSafeInteger(turn.turn) || turn.turn < 0) throw fail('BROWSER_RUN', 'The DSH turn boundary is unavailable.')
      tab.expectedTurn = turn.runId ? turn.turn : turn.turn + 1
      tab.granted = true; tab.runId = turn.runId ?? null; tab.ownerToken = null; tab.ownerClaimed = false; tab.revision++; tab.status = 'ready'; touch(tab)
      tab.observedTurn = turn.turn; tab.observedRunId = turn.runId
      trace('grant', tab, null, turn)
      return publicTab(tab)
    },
    revoke(args: BrowserAuthRequest) { const tab = authenticate(args); revoke(tab, 'taken-over'); touch(tab); return publicTab(tab) },
    revokeOwner(ownerToken: symbol) { for (const tab of tabs.values()) if (tab.granted && tab.ownerClaimed && tab.ownerToken === ownerToken) revoke(tab, 'native-run-ended') },
    close(args: BrowserAuthRequest) { const tab = authenticate(args); revoke(tab, 'closed'); tabs.delete(tab.id); return { closed: true } },
    async poll(args: BrowserAuthRequest) {
      const tab = authenticate(args)
      await verify(tab)
      touch(tab)
      const pending = tab.pending
      if (pending && !pending.delivered) {
        try { pending.assertCurrent?.(); pending.signal?.throwIfAborted() } catch {
          if (stickyGrants) { stop(tab, 'run-ended', 'BROWSER_RUN', 'The owning turn ended before this command was delivered. Observe again in the current turn.'); return { ...publicTab(tab), command: null } }
          revoke(tab, 'run-ended'); return { ...publicTab(tab), command: null }
        }
        pending.delivered = true
        return { ...publicTab(tab), command: { id: pending.id, epoch: pending.epoch, grantRevision: pending.revision, ...pending.command } }
      }
      return { ...publicTab(tab), command: null }
    },
    async confirm(args: BrowserConfirmPayload) {
      const tab = authenticate(args)
      await verify(tab)
      const pending = tab.pending
      if (!pending || !pending.delivered || pending.id !== args.commandId || !tab.granted || tab.revision !== args.grantRevision || pending.revision !== args.grantRevision || pending.epoch !== args.epoch || tab.epoch !== args.epoch) throw fail('BROWSER_STALE', 'Browser input authority expired before dispatch.')
      try { pending.assertCurrent?.(); pending.signal?.throwIfAborted() } catch {
        if (stickyGrants) { stop(tab, 'run-ended', 'BROWSER_RUN', 'The owning turn ended before input dispatch.'); throw fail('BROWSER_RUN', 'The owning turn ended before input dispatch.') }
        revoke(tab, 'run-ended'); throw fail('BROWSER_REVOKED', 'The owning run ended before input dispatch.')
      }
      return { allowed: true }
    },
    async acknowledge(args: BrowserAcknowledgePayload) {
      const tab = authenticate(args), pending = tab.pending
      await verify(tab)
      if (!pending || tab.pending !== pending || !pending.delivered || args.commandId !== pending.id || args.grantRevision !== pending.revision || tab.revision !== pending.revision || !tab.granted) throw fail('BROWSER_STALE', 'Late or unowned browser acknowledgement.')
      try { pending.assertCurrent?.(); pending.signal?.throwIfAborted() } catch {
        if (stickyGrants) { stop(tab, 'run-ended', 'BROWSER_RUN', 'The owning turn ended before acknowledgement.'); throw fail('BROWSER_RUN', 'The owning turn ended before acknowledgement.') }
        revoke(tab, 'run-ended'); throw fail('BROWSER_REVOKED', 'The owning run ended.')
      }
      const validEpoch = NAVIGATION.has(pending.command.action) ? args.epoch >= pending.epoch : args.epoch === pending.epoch
      if (!Number.isSafeInteger(args.epoch) || !validEpoch || tab.epoch > args.epoch) {
        if (stickyGrants) { stop(tab, 'document-changed', 'BROWSER_STALE', 'Browser document changed before acknowledgement. Observe again.'); throw fail('BROWSER_STALE', 'Browser document changed before acknowledgement.') }
        revoke(tab, 'document-changed'); throw fail('BROWSER_STALE', 'Browser document changed before acknowledgement.')
      }
      tab.epoch = args.epoch; touch(tab)
      // A settled command under a sticky grant must not keep claiming the tab, or a
      // later turn would be refused ownership of a grant that is meant to persist.
      if (stickyGrants) { tab.ownerClaimed = false; tab.ownerToken = null }
      if (args.error) settle(tab, fail('BROWSER_GUEST', String(args.error).slice(0, 300)))
      else settle(tab, null, { tabId: tab.id, epoch: tab.epoch, grantRevision: tab.revision, untrustedPageContent: true, result: boundedResult(args.result) })
      return { acknowledged: true }
    },
    async execute(binding: BrowserScope, args: { tabId: string, epoch: number, grantRevision: number, command: unknown }, { signal, runId, turnNumber, assertCurrent, ownerToken = null }: BrowserDispatchOwner = {}) {
      const tab = get(args.tabId)
      await verify(tab, binding)
      signal?.throwIfAborted(); assertCurrent?.()
      if (!tab.visible || !tab.granted) throw fail('BROWSER_GRANT', 'Ask the user to show this tab and enable AI access. Manual browsing remains available.')
      if (tab.ownerClaimed && tab.ownerToken !== ownerToken) throw fail('BROWSER_OWNER', 'This browser grant belongs to another tool or native run. Ask for a new explicit grant.')
      if (args.epoch !== tab.epoch || args.grantRevision !== tab.revision) throw fail('BROWSER_STALE', 'Refresh browser state; this command refers to an old document or grant.')
      if (typeof runId !== 'string' || !runId || !Number.isSafeInteger(turnNumber)) throw fail('BROWSER_RUN', 'A live owning DSH turn is required.')
      // Sticky grants admit any live owning turn; the per-turn default keeps the
      // original binding so a later turn cannot reuse an earlier turn's authority.
      if (!stickyGrants && (tab.expectedTurn !== turnNumber || tab.runId && tab.runId !== runId)) { revoke(tab, 'run-changed'); throw fail('BROWSER_RUN', 'This browser grant belongs to a different turn. Ask for a new grant.') }
      if (tab.pending) throw fail('BROWSER_BUSY', 'Wait for the current browser command; do not dispatch concurrently.')
      const command = validateCommand(args.command)
      tab.runId = runId; tab.ownerToken = ownerToken; tab.ownerClaimed = true
      return new Promise<BrowserExecutionResult>((resolve, reject) => {
        const pending: BrowserPending = { id: randomUUID(), epoch: tab.epoch, revision: tab.revision, command, delivered: false, resolve, reject, signal, assertCurrent }
        pending.abort = () => revoke(tab, 'cancelled')
        pending.timer = setTimeout(() => revoke(tab, pending.delivered ? 'acknowledgement-lost' : 'command-timeout'), timeoutMs)
        tab.pending = pending
        signal?.addEventListener('abort', pending.abort!, { once: true })
        if (signal?.aborted) pending.abort()
      })
    },
    dispose() { if (disposed) return; disposed = true; clearInterval(sweep); for (const tab of tabs.values()) revoke(tab, 'host-stopped'); tabs.clear() },
  }
}
