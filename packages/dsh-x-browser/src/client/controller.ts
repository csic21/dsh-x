import { createGuest } from './guest.ts'
import type { BrowserCommandEnvelope, BrowserGuest, BrowserGuestDocument, BrowserGuestHost, BrowserDesktop } from './guest.ts'
import { NAVIGATION, fail } from '../protocol.ts'

declare global {
  /** The Desktop shell preload installs this bridge; the web preview has none. */
  var dshDesktop: BrowserDesktop | undefined
}

/** Transport envelope of one authenticated route call; the route owns the value shape. */
export interface BrowserRpcEnvelope { ok?: unknown, value?: unknown, error?: unknown }
/** Renderer RPC bridge the shell injects; `call` rejects on transport failure. */
export interface BrowserRpc { call(base: string, name: string, payload: Record<string, unknown>, signal: AbortSignal): Promise<BrowserRpcEnvelope> }
/** Renderer document subset the controller reads; tests supply a faithful stub. */
export interface BrowserDocument { hidden: boolean, addEventListener(type: string, listener: () => void): void, removeEventListener(type: string, listener: () => void): void }
/** Reply of `register`: the owned capability, its workspace binding, and the profile's grant policy. */
interface BrowserRegistration { tabId: string, capability: string, workspace: string, grantRevision: number, autoGrant?: boolean, background?: boolean }
/** Reply of `sync`, `grant`, `revoke` and `poll`: public tab state plus any queued command. */
interface BrowserSnapshot { epoch: number, grantRevision: number, granted: boolean, status: string, command: BrowserCommandEnvelope | null }
/** Reply of `confirm`: whether input may be dispatched. */
interface BrowserConfirmation { allowed: boolean }
/** Pane state the shell publishes; the guest-owned fields stay optional until it reports them. */
export interface BrowserPaneState {
  status: string
  granted: boolean
  visible: boolean
  epoch: number
  grantRevision: number
  ready: boolean
  /** Profile policy: AI access is granted automatically, so no Allow AI control applies. */
  autoGrant?: boolean
  /** Profile policy: the tab keeps working while hidden. */
  background?: boolean
  url: string
  title: string
  error: string | null
  busy: boolean
  tabId: string | null
  loading?: boolean
  canGoBack?: boolean
  canGoForward?: boolean
}
/** Pane-visible projection the body component renders from. */
export type BrowserPaneView = Pick<BrowserPaneState, 'status' | 'ready' | 'granted' | 'autoGrant' | 'background' | 'url' | 'title' | 'error' | 'loading' | 'canGoBack' | 'canGoForward'>
/** Renderer-side dependencies of one owned tab controller. */
export interface BrowserControllerOptions {
  rpc: BrowserRpc
  desktop?: BrowserDesktop | null
  sessionId: string
  clientTabId: string
  host?: BrowserGuestHost | null
  applicationOrigin?: string
  /** Address the pane should load before it is granted; a fresh tab otherwise starts blank. */
  initialUrl?: string
  onOpen?: (url: string) => void
  guestFactory?: (options: Parameters<typeof createGuest>[0]) => BrowserGuest
  pollMs?: number
  documentObject?: BrowserDocument & BrowserGuestDocument
}
/** Controller options one pane supplies; the shell entry adds its RPC bridge. */
export type BrowserPaneControllerOptions = Omit<BrowserControllerOptions, 'rpc'>
/** One owned tab controller; revocation is local and synchronous. */
export interface BrowserController {
  getSnapshot(): BrowserPaneState
  subscribe(listener: () => void): () => void
  start(): Promise<void>
  setVisible(value: boolean): void
  grant(): Promise<void>
  takeover(reason?: string): Promise<void>
  navigate(url: string): Promise<void>
  manual(action: string): Promise<void>
  dispose(): Promise<void>
}

/** Renderer lifetime owner. Revocation is local and synchronous before any RPC or runner interruption. */
export function createBrowserController({ rpc, desktop = globalThis.dshDesktop, sessionId, clientTabId, host, applicationOrigin = globalThis.location?.origin, initialUrl, onOpen, guestFactory = createGuest, pollMs = 750, documentObject = globalThis.document }: BrowserControllerOptions): BrowserController {
  let registration: BrowserRegistration | undefined, guest: BrowserGuest | undefined, disposed = false, visible = false, timer: ReturnType<typeof setTimeout> | undefined, pumping = false, granting = false, pumpWaiters: Array<(value?: unknown) => void> = [], running: BrowserCommandEnvelope | null = null, generation = 0, autoGrantTried = false
  /**
   * Set when the command in flight navigated the page itself. Such a document change
   * is the expected result of a click, not a failure, so it must not revoke the grant
   * or surface an error banner.
   */
  let navigatedByCommand = false
  /** Bounded automatic recoveries; a broken guest must not become an endless retry loop. */
  let autoRecoveries = 0
  const MAX_AUTO_RECOVERIES = 3
  const listeners = new Set<() => void>(), requests = new Set<AbortController>()
  let state: BrowserPaneState = { status: 'loading', granted: false, visible: false, epoch: 0, grantRevision: 0, ready: false, url: '', title: '', error: null, busy: false, tabId: null }
  const publish = (patch: Partial<BrowserPaneState>) => { if (disposed) return; state = { ...state, ...patch }; for (const callback of listeners) callback() }
  const auth = () => ({ tabId: registration!.tabId, capability: registration!.capability })
  const stopReason = (error: unknown) => ({ BROWSER_RUN: 'turn-ended', BROWSER_SCOPE: 'workspace-changed', BROWSER_STALE: 'document-changed', BROWSER_CLOSED: 'closed', BROWSER_REVOKED: 'stopped' } as Record<string, string>)[(error as { code?: string } | null | undefined)?.code ?? ''] ?? 'disconnected'
  const errorDetail = (error: unknown) => { const failure = error as { code?: string, message?: unknown }; return `${/^BROWSER_[A-Z_]{1,50}$/.test(failure?.code ?? '') ? `[${failure?.code}] ` : ''}${String(failure?.message ?? 'Browser connection failed.')}`.slice(0, 300) }
  async function call<T>(method: string, payload: Record<string, unknown>): Promise<T> {
    const abort = new AbortController(); requests.add(abort)
    const timeout = setTimeout(() => abort.abort(), 12000)
    try {
      const value = await rpc.call('/api', `browser/${method}`, payload, abort.signal)
      if (!value?.ok) throw value?.error ?? fail('BROWSER_RPC', 'Browser connection failed.')
      return value.value as T
    } finally { requests.delete(abort); clearTimeout(timeout) }
  }
  function localRevoke(reason = 'manual') {
    generation++; guest?.revoke(); publish({ granted: false, busy: false, status: reason })
  }
  async function takeover(reason = 'manual') {
    localRevoke(reason)
    const ownGeneration = generation
    if (registration && !disposed) {
      try { const result = await call<BrowserSnapshot>('revoke', auth()); if (!disposed && generation === ownGeneration) publish({ grantRevision: result.grantRevision }) }
      catch { publish({ error: 'Browser connection failed. AI control remains disabled.' }) }
    }
  }
  const sync = () => call<BrowserSnapshot>('sync', { ...auth(), epoch: guest!.state().epoch, visible: visible && !documentObject?.hidden, title: guest!.state().title, url: guest!.state().url })
  async function execute(command: BrowserCommandEnvelope) {
    if (running || !state.granted || (!visible && registration?.background !== true) || documentObject?.hidden) { await takeover('manual'); return }
    const ownGeneration = generation
    // `beforeInput` runs immediately before every native event, so this flag is the
    // exact boundary between "the page rejected the command" and "input may already
    // have reached the page". Only the latter is an uncertain mutation.
    let inputAdmitted = false
    navigatedByCommand = false
    running = command; publish({ busy: true, status: 'running' })
    try {
      const outcome = await guest!.perform(command, { beforeInput: async () => {
        if (disposed || ownGeneration !== generation) throw fail('BROWSER_REVOKED', 'Browser control ended before input dispatch.')
        const confirmation = await call<BrowserConfirmation>('confirm', { ...auth(), commandId: command.id, grantRevision: command.grantRevision, epoch: guest!.state().epoch })
        if (!confirmation.allowed || disposed || ownGeneration !== generation) throw fail('BROWSER_REVOKED', 'Browser input authority expired.')
        inputAdmitted = true
      } })
      if (disposed || ownGeneration !== generation) return
      await call('ack', { ...auth(), commandId: command.id, grantRevision: command.grantRevision, epoch: outcome.epoch, result: outcome.result })
      if (!disposed && ownGeneration === generation) publish({ status: 'ready', error: null })
    } catch (error) {
      if (!disposed && ownGeneration === generation) {
        const failure = error as { message?: unknown, code?: unknown }
        // A failed acknowledgement is an uncertain mutation, not permission to replay.
        try { await call('ack', { ...auth(), commandId: command.id, grantRevision: command.grantRevision, epoch: guest!.state().epoch, error: String(failure.message ?? error).slice(0, 300) }) } catch {}
        // Nothing reached the page when the command was refused before its first
        // input event — a stale target reference, for example. Reporting it and
        // keeping the grant lets an unattended loop observe again and continue,
        // instead of losing the tab to a typo in one reference.
        if (!inputAdmitted) publish({ error: String(failure.message ?? 'The browser refused the command.').slice(0, 300), status: 'ready' })
        else if (navigatedByCommand && registration?.autoGrant === true) publish({ status: 'ready', error: null })
        else {
          await takeover('stopped')
          publish({ error: String(failure.message ?? 'Browser operation stopped.').slice(0, 300) })
          recoverUnattended()
        }
      }
    } finally { if (running === command) { running = null; publish({ busy: false }) } }
  }
  async function pump() {
    if (disposed || !registration || !guest || pumping || granting) return
    pumping = true
    const ownGeneration = generation
    try {
      const current = await sync()
      if (disposed || ownGeneration !== generation) return
      if (state.granted && (!current.granted || current.grantRevision !== state.grantRevision)) { await takeover(current.status); return }
      publish({ grantRevision: current.grantRevision })
      const result = await call<BrowserSnapshot>('poll', auth())
      if (disposed) return
      if (ownGeneration !== generation) { if (result.command) await takeover('stale-command'); return }
      if (state.granted && !result.granted) { await takeover(result.status); return }
      if (result.command) void execute(result.command)
    } catch (error) {
      if (!disposed && ownGeneration === generation) { await takeover(stopReason(error)); publish({ error: errorDetail(error) }); recoverUnattended() }
    } finally { pumping = false; for (const done of pumpWaiters.splice(0)) done(); if (!disposed && !granting) timer = setTimeout(pump, pollMs) }
  }
  /**
   * Renew the grant for the document a navigation just produced.
   *
   * Delayed so the new document settles and the next `sync` reports its epoch; the
   * grant must cover the page that is actually on screen, never the one that left.
   */
  let regrantTimer: ReturnType<typeof setTimeout> | undefined
  function scheduleRegrant() {
    clearTimeout(regrantTimer)
    regrantTimer = setTimeout(() => {
      if (disposed || !visible || documentObject?.hidden) return
      void grantNow()
    }, 400)
  }
  /**
   * Recover an unattended tab whose grant an ordinary failure dropped.
   *
   * Bounded: a guest that keeps failing gets three attempts and then stays stopped, so
   * a broken page cannot turn into a tight retry loop. Every recovery re-checks that
   * the tab is still visible and the document still exists.
   */
  function recoverUnattended() {
    if (registration?.autoGrant !== true || autoRecoveries >= MAX_AUTO_RECOVERIES) return
    if (disposed || !visible || documentObject?.hidden) return
    autoRecoveries += 1
    scheduleRegrant()
  }
  const visibility = () => { if (documentObject?.hidden && registration?.background !== true) void takeover('hidden') }
  documentObject?.addEventListener('visibilitychange', visibility)
  /** The one grant path; the Allow AI button and unattended auto-grant both use it. */
  async function grantNow() {
    if (disposed || granting || !guest?.state().ready || (!visible && registration?.background !== true) || documentObject?.hidden) return
    granting = true; clearTimeout(timer); localRevoke('manual')
    const ownGeneration = generation
    try {
      if (pumping) await new Promise(resolve => pumpWaiters.push(resolve))
      if (disposed || ownGeneration !== generation || !visible || documentObject?.hidden) return
      await call('revoke', auth())
      if (disposed || ownGeneration !== generation) return
      const fresh = await sync()
      if (disposed || ownGeneration !== generation) return
      const granted = await call<BrowserSnapshot>('grant', { ...auth(), epoch: fresh.epoch, grantRevision: fresh.grantRevision })
      if (disposed || ownGeneration !== generation || !visible) { void takeover('hidden'); return }
      guest.grant(granted.grantRevision)
      autoRecoveries = 0
      publish({ granted: true, grantRevision: granted.grantRevision, status: 'ready', error: null })
    } catch (error) { if (!disposed && ownGeneration === generation) { const failure = error as { message?: unknown }; await takeover('manual'); publish({ error: String(failure.message ?? 'AI access was not enabled.') }) } }
    finally { granting = false; if (!disposed) { clearTimeout(timer); timer = setTimeout(pump, 0) } }
  }
  /**
   * Grant once, unattended, for a profile that configured `autoGrant`.
   *
   * This is not a retry loop: it makes exactly one attempt per ready page, so a
   * host refusal (wrong workspace, revoked capability, ended turn) is reported
   * instead of hammering the broker. Any later revocation keeps the tab under
   * manual control, because nothing calls this again.
   */
  const autoGrant = () => {
    // Never restart the flow for a tab that already holds a grant: grantNow revokes
    // first, so a redundant call would briefly revoke a healthy grant and reject any
    // action that arrived in that window.
    if (disposed || granting || state.granted || !guest?.state().ready || (!visible && registration?.background !== true) || documentObject?.hidden) return
    void grantNow()
  }
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    async start() {
      try {
        if (desktop?.protocolVersion !== 1 || !desktop.browser) throw fail('BROWSER_DESKTOP', 'A compatible DSH Desktop shell is required. Web preview does not provide an embedded browser.')
        registration = await call<BrowserRegistration>('register', { sessionId, clientTabId })
        if (disposed) { await call('close', auth()).catch(() => {}); return }
        guest = guestFactory({ desktop, workspace: registration.workspace, host: host!, applicationOrigin, documentObject, allowHidden: registration.background === true,
          onOpen, onChange: next => {
            publish(next)
            // The pane may be visible before the guest finishes mounting, so both
            // earlier attempts can bail out on `!ready`. Retry once when readiness
            // flips; `autoGrantTried` keeps a failure from looping.
            if (next.ready && registration?.autoGrant === true && !state.granted && !autoGrantTried) { autoGrantTried = true; void autoGrant() }
          }, onInvalidate: (reason, navigation) => {
            // A link that navigates ends the document the grant covered, so the default
            // profile drops the grant and asks the human again. An unattended profile has
            // nobody to ask: a navigation caused by the command in flight is expected, and
            // a page-driven one renews the grant for the new document. Every other
            // invalidation (hidden, crash, takeover) still goes through `takeover`.
            if (navigation && registration?.autoGrant === true) {
              if (running) navigatedByCommand = true
              else if (state.granted) scheduleRegrant()
              return
            }
            if ((state.granted || granting) && !(navigation && running && NAVIGATION.has(running.action))) void takeover(reason)
          } })
        publish({ tabId: registration.tabId, grantRevision: registration.grantRevision, autoGrant: registration.autoGrant === true, background: registration.background === true })
        await guest.start()
        if (disposed) return
        // Load the requested page before granting: the grant must cover the document
        // the caller asked for, and an unattended profile gets no later chance to
        // re-grant after a post-grant navigation revokes it.
        if (initialUrl) await guest.navigate(initialUrl).catch(() => {})
        if (disposed) return
        publish({ status: 'manual' }); void pump()
        // Unattended profile: grant as soon as the guest is ready instead of waiting
        // for the Allow AI button. `autoGrant` is answered by the host from explicit
        // config, and every revocation path below still ends the grant normally.
        if (registration.autoGrant === true) void autoGrant()
      } catch (error) { if (!disposed) { const failure = error as { message?: unknown }; publish({ status: 'unavailable', error: String(failure.message ?? 'Embedded browser unavailable.'), ready: false }) } }
    },
    setVisible(value) {
      visible = Boolean(value); publish({ visible })
      if (!visible) { if (registration?.background !== true) void takeover('hidden'); return }
      // A freshly opened tab becomes visible after `start()` resolved, so the
      // ready-time attempt alone would always lose the race with `setVisible(true)`.
      if (registration?.autoGrant === true) void autoGrant()
    },
    grant: grantNow,
    takeover,
    async navigate(url) { void takeover(); if (!disposed) { try { await guest!.navigate(url); publish({ error: null }) } catch (error) { const failure = error as { message?: string }; publish({ error: failure.message }) } } },
    async manual(action) { void takeover(); if (!disposed) { try { guest!.manual(action) } catch (error) { const failure = error as { message?: string }; publish({ error: failure.message }) } } },
    async dispose() {
      if (disposed) return
      localRevoke('closed'); disposed = true; clearTimeout(timer); documentObject?.removeEventListener('visibilitychange', visibility)
      for (const request of requests) request.abort()
      if (registration) await call('close', auth()).catch(() => {})
      await guest?.dispose(); listeners.clear()
    },
  }
}
