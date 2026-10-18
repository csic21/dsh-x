import { fail, modelUrl, NAVIGATION, parseAddress, validateCommand } from '../protocol.ts'
import type { BrowserJson } from '../protocol.ts'
import { helperScript } from './dom-helper.ts'
import type { PageHelperRequest } from './dom-helper.ts'

/** One guest lease the Desktop shell grants for exactly one owned element. */
export interface BrowserLease { lease: string, partition: string }
/** The `window.dshDesktop` bridge; the Desktop main process owns this capability. */
export interface BrowserDesktop { protocolVersion: number, browser: { acquire(workspace: string): Promise<BrowserLease>, release(lease: string): Promise<unknown>, onOpenRequested(lease: string, listener: (url: string) => void): () => void } }
/** Reviewed subset of the Electron `<webview>` API this adapter calls. */
export interface BrowserGuestElement { className: string, dataset: Record<string, string>, setAttribute(name: string, value: string): void, addEventListener(name: string, listener: (event: BrowserGuestEvent) => void): void, removeEventListener(name: string, listener: (event: BrowserGuestEvent) => void): void, remove(): void, getURL(): string, getTitle(): string, canGoBack(): boolean, canGoForward(): boolean, loadURL(url: string): Promise<void>, executeJavaScript(script: string): Promise<BrowserHelperValue>, sendInputEvent(event: Record<string, unknown>): Promise<void>, insertText(text: string): Promise<void>, capturePage(): Promise<void>, reload(): void, goBack(): void, goForward(): void, stop(): void }
/** Minimal guest event fields the adapter reads; Electron adds many more. */
export interface BrowserGuestEvent { isMainFrame?: boolean, errorCode?: number }
/** Untrusted value the page helper returns; every field is validated before use. */
export interface BrowserHelperValue { text?: string, targets?: unknown, truncated?: unknown, limitations?: unknown, error?: unknown, x: number, y: number }
/** Page identity and readiness the controller reads back from its guest. */
export interface BrowserGuestState { ready: boolean, epoch: number, title: string, url: string }
/** Complete guest-owned page state published through `onChange` for the pane to merge. */
interface BrowserGuestView extends BrowserGuestState { loading: boolean, error: string | null, canGoBack: boolean, canGoForward: boolean }
/** One command envelope the broker dispatched to this owned tab. */
export interface BrowserCommandEnvelope { id: string, epoch: number, grantRevision: number, action: string, url?: string, target?: string, text?: string, x?: number, y?: number, key?: string }
/** Admission hook the renderer runs immediately before every native input event. */
export interface BrowserPerformControls { beforeInput?: () => Promise<unknown> | unknown }
/** Settled outcome of one admitted command; page evidence remains untrusted. */
export interface BrowserPerformOutcome { epoch: number, result: BrowserJson }
/** One target reference bound to its document epoch and observation snapshot. */
interface BrowserTargetRef { index: number, fingerprint: string, editable: boolean }
/** Renderer document subset the guest creates its lease element from; Electron returns a `<webview>`. */
export interface BrowserGuestDocument { createElement?(tag: string): unknown }
/** Host element the guest mounts into; the position probes stay optional for detached hosts. */
export interface BrowserGuestHost { isConnected?: boolean, getBoundingClientRect?(): { width: number, height: number }, append?(element: unknown): void }
/** Renderer-side dependencies of one owned guest. */
export interface BrowserGuestOptions { desktop?: BrowserDesktop | null, workspace: string, host: BrowserGuestHost, applicationOrigin?: string, onChange?: (state: BrowserGuestView) => void, onInvalidate?: (reason: string, navigation: boolean) => void, onOpen?: (url: string) => void, documentObject?: BrowserGuestDocument }
/** One owned visible guest lease. */
export interface BrowserGuest {
  start(): Promise<void>
  state(): BrowserGuestState
  grant(revision: number): void
  revoke(): void
  perform(raw: BrowserCommandEnvelope, controls?: BrowserPerformControls): Promise<BrowserPerformOutcome>
  navigate(url: string): Promise<void>
  manual(action: string): void
  dispose(): Promise<void>
}

/** Own exactly one lease and one visible Electron guest. No iframe or external-browser fallback. */
export function createGuest({ desktop, workspace, host, applicationOrigin, onChange = () => {}, onInvalidate = () => {}, onOpen = () => {}, documentObject = document }: BrowserGuestOptions): BrowserGuest {
  let element!: BrowserGuestElement
  let reservation: BrowserLease | undefined
  let released = false, ready = false, disposed = false, epoch = 0, snapshot = 0, active = false, grantRevision = 0
  const refs = new Map<string, BrowserTargetRef>()
  let openDisposer: (() => void) | undefined
  let initPromise: Promise<void> | undefined
  let state: BrowserGuestView = { ready: false, loading: false, epoch: 0, url: '', title: '', error: null, canGoBack: false, canGoForward: false }
  const listeners: Array<[string, (event: BrowserGuestEvent) => void]> = []
  const publish = (patch: Partial<BrowserGuestView>) => { state = { ...state, ...patch }; onChange(state) }
  const invalidate = (reason: string, navigation = false) => { epoch++; refs.clear(); snapshot++; publish({ epoch }); onInvalidate(reason, navigation) }
  const listen = (name: string, fn: (event: BrowserGuestEvent) => void) => { element.addEventListener(name, fn); listeners.push([name, fn]) }
  const check = (command?: BrowserCommandEnvelope) => {
    if (disposed || !ready || !element) throw fail('BROWSER_UNAVAILABLE', 'The embedded desktop guest is not ready.')
    if (command && (host.isConnected === false || typeof host.getBoundingClientRect === 'function' && (host.getBoundingClientRect().width <= 0 || host.getBoundingClientRect().height <= 0))) throw fail('BROWSER_HIDDEN', 'The owned browser viewport is not visible.')
    if (command && (!active || command.grantRevision !== grantRevision || command.epoch !== epoch)) throw fail('BROWSER_STALE', 'Browser control or document changed.')
  }
  async function release() {
    if (released || !reservation) return
    released = true
    await desktop!.browser.release(reservation.lease)
  }
  async function mount() {
    if (disposed) return
    if (desktop?.protocolVersion !== 1 || !desktop.browser?.acquire || !desktop.browser?.release) throw fail('BROWSER_DESKTOP', 'A compatible DSH Desktop shell is required. The web app cannot embed Chromium.')
    reservation = await desktop.browser.acquire(workspace)
    if (disposed) { await release(); return }
    element = documentObject.createElement!('webview') as BrowserGuestElement
    element.className = 'dxb-webview'; element.dataset.testid = 'dxb-guest'
    element.setAttribute('name', reservation.lease); element.setAttribute('partition', reservation.partition)
    element.setAttribute('allowpopups', ''); element.setAttribute('src', `about:blank#${reservation.lease}`)
    openDisposer = desktop.browser.onOpenRequested(reservation.lease, url => { try { onOpen(parseAddress(url, applicationOrigin)) } catch {} })
    listen('did-start-navigation', event => {
      if (event.isMainFrame === false) return
      invalidate('navigation', true)
      publish({ loading: true })
    })
    const update = () => {
      if (disposed || !ready) return
      const url = element.getURL()
      publish({ url: url.startsWith('about:blank#') ? '' : url, title: element.getTitle().slice(0, 200), canGoBack: element.canGoBack(), canGoForward: element.canGoForward(), epoch })
    }
    listen('did-navigate', update); listen('did-navigate-in-page', update); listen('page-title-updated', update)
    listen('did-stop-loading', () => { update(); publish({ loading: false }) })
    listen('did-fail-load', event => { if (event.isMainFrame === false || event.errorCode === -3) return; invalidate('load-failed'); publish({ loading: false, error: 'The page failed to load.' }) })
    listen('render-process-gone', () => { ready = false; active = false; invalidate('guest-crashed'); publish({ ready: false, error: 'The embedded browser process stopped.' }) })
    const readyPromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(fail('BROWSER_TIMEOUT', 'The desktop guest did not become ready.')), 15000)
      listen('dom-ready', () => {
        if (disposed) { clearTimeout(timer); resolve(); return }
        if (!ready) {
          const methods = ['executeJavaScript', 'loadURL', 'sendInputEvent', 'insertText', 'capturePage'] as const
          if (methods.some(method => typeof element[method] !== 'function')) { clearTimeout(timer); reject(fail('BROWSER_API', 'This Desktop shell does not expose the required guest APIs.')); return }
          ready = true; publish({ ready: true, error: null, epoch }); clearTimeout(timer); resolve()
        }
        update()
      })
    })
    host.append!(element)
    await readyPromise
  }
  async function perform(raw: BrowserCommandEnvelope, { beforeInput = async () => {} }: BrowserPerformControls = {}): Promise<BrowserPerformOutcome> {
    check(raw)
    const { id, epoch: commandEpoch, grantRevision: revision, ...payload } = raw
    const command = validateCommand(payload, applicationOrigin)
    const assertCurrent = () => { if (disposed || !active || revision !== grantRevision || !NAVIGATION.has(command.action) && epoch !== commandEpoch) throw fail('BROWSER_STALE', 'Control was revoked or the page changed. Do not replay the action.') }
    const admitInput = async () => { assertCurrent(); await beforeInput(); assertCurrent() }
    assertCurrent()
    if (command.action === 'observe') {
      const value = await element.executeJavaScript(helperScript({ action: 'observe' }))
      assertCurrent(); snapshot++; refs.clear()
      if (!value || typeof value.text !== 'string' || !Array.isArray(value.targets)) throw fail('BROWSER_RESULT', 'Page observation is unavailable.')
      const targets = value.targets.slice(0, 120).flatMap(target => {
        if (!Number.isSafeInteger(target.index) || target.index < 0 || target.index > 1000 || typeof target.fingerprint !== 'string') return []
        const ref = `e${epoch}:s${snapshot}:n${target.index}`
        refs.set(ref, { index: target.index, fingerprint: target.fingerprint.slice(0, 800), editable: target.editable === true })
        return [{ ref, tag: String(target.tag).slice(0, 32), type: String(target.type).slice(0, 32), label: String(target.label).slice(0, 160), editable: target.editable === true }]
      })
      return { epoch, result: { text: value.text.slice(0, 16000), targets, truncated: Boolean(value.truncated), scope: 'top-frame-visible-dom', limitations: String(value.limitations ?? '').slice(0, 300), url: modelUrl(state.url), title: state.title } }
    }
    if (['click', 'type'].includes(command.action)) {
      const target = refs.get(command.target!)
      if (!target || command.action === 'type' && !target.editable) throw fail('BROWSER_TARGET', 'Observe the page again and choose an allowed target.')
      const point = await element.executeJavaScript(helperScript({ action: 'target', ...target, editable: command.action === 'type' }))
      assertCurrent()
      if (point?.error) throw fail('BROWSER_TARGET', String(point.error).slice(0, 300))
      if (!Number.isInteger(point?.x) || !Number.isInteger(point?.y) || point.x < 0 || point.y < 0 || point.x > 20000 || point.y > 20000) throw fail('BROWSER_TARGET', 'The page returned invalid target coordinates.')
      await admitInput(); assertCurrent()
      if (command.action === 'click') {
        await element.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, button: 'left', clickCount: 1 })
        await admitInput(); assertCurrent()
        await element.sendInputEvent({ type: 'mouseUp', x: point.x, y: point.y, button: 'left', clickCount: 1 })
      } else await element.insertText(command.text!)
    } else {
      await admitInput(); assertCurrent()
      if (command.action === 'scroll') await element.sendInputEvent({ type: 'mouseWheel', x: 10, y: 10, deltaX: command.x, deltaY: command.y, canScroll: true })
      else if (command.action === 'press') { await element.sendInputEvent({ type: 'keyDown', keyCode: command.key }); await admitInput(); assertCurrent(); await element.sendInputEvent({ type: 'keyUp', keyCode: command.key }) }
      else if (command.action === 'navigate') { await element.loadURL(command.url!) }
      else if (command.action === 'back') element.goBack()
      else if (command.action === 'forward') element.goForward()
      else if (command.action === 'reload') element.reload()
    }
    assertCurrent()
    refs.clear()
    return { epoch, result: { action: command.action, status: NAVIGATION.has(command.action) ? 'navigation-requested' : 'input-sent', notice: 'Input was sent to the visible guest. Observe again to verify its effect; never automatically retry a lost acknowledgement.' } }
  }
  return {
    start() { return initPromise ??= mount().catch(async error => { publish({ error: error.message, ready: false }); await release().catch(() => {}); throw error }) },
    state: () => state,
    grant(revision) { grantRevision = revision; active = true },
    revoke() { active = false; grantRevision++; refs.clear() },
    perform,
    async navigate(url) { check(); active = false; refs.clear(); await element.loadURL(parseAddress(url, applicationOrigin)) },
    manual(action) { check(); active = false; refs.clear(); if (action === 'back') element.goBack(); else if (action === 'forward') element.goForward(); else if (action === 'reload') element.reload(); else if (action === 'stop') element.stop() },
    async dispose() { if (disposed) return; disposed = true; active = false; refs.clear(); openDisposer?.(); for (const [name, fn] of listeners) element?.removeEventListener(name, fn); element?.remove(); await release() },
  }
}
