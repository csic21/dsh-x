import { createGuest } from './guest.js'
import { NAVIGATION, fail } from '../protocol.js'

/** Renderer lifetime owner. Revocation is local and synchronous before any RPC or runner interruption. */
export function createBrowserController({ rpc, desktop = globalThis.dshDesktop, sessionId, clientTabId, host, applicationOrigin = globalThis.location?.origin, onOpen, guestFactory = createGuest, pollMs = 750, documentObject = globalThis.document }) {
  let registration, guest, disposed = false, visible = false, timer, pumping = false, granting = false, pumpWaiters = [], running = null, generation = 0
  const listeners = new Set(), requests = new Set()
  let state = { status: 'loading', granted: false, visible: false, epoch: 0, grantRevision: 0, ready: false, url: '', title: '', error: null, busy: false, tabId: null }
  const publish = patch => { if (disposed) return; state = { ...state, ...patch }; for (const callback of listeners) callback() }
  const auth = () => ({ tabId: registration.tabId, capability: registration.capability })
  const stopReason = error => ({ BROWSER_RUN: 'turn-ended', BROWSER_SCOPE: 'workspace-changed', BROWSER_STALE: 'document-changed', BROWSER_CLOSED: 'closed', BROWSER_REVOKED: 'stopped' })[error?.code] ?? 'disconnected'
  const errorDetail = error => `${/^BROWSER_[A-Z_]{1,50}$/.test(error?.code ?? '') ? `[${error.code}] ` : ''}${String(error?.message ?? 'Browser connection failed.')}`.slice(0, 300)
  async function call(method, payload) {
    const abort = new AbortController(); requests.add(abort)
    const timeout = setTimeout(() => abort.abort(), 12000)
    try {
      const value = await rpc.call('/api', `browser/${method}`, payload, abort.signal)
      if (!value?.ok) throw value?.error ?? fail('BROWSER_RPC', 'Browser connection failed.')
      return value.value
    } finally { requests.delete(abort); clearTimeout(timeout) }
  }
  function localRevoke(reason = 'manual') {
    generation++; guest?.revoke(); publish({ granted: false, busy: false, status: reason })
  }
  async function takeover(reason = 'manual') {
    localRevoke(reason)
    const ownGeneration = generation
    if (registration && !disposed) {
      try { const result = await call('revoke', auth()); if (!disposed && generation === ownGeneration) publish({ grantRevision: result.grantRevision }) }
      catch { publish({ error: 'Browser connection failed. AI control remains disabled.' }) }
    }
  }
  const sync = () => call('sync', { ...auth(), epoch: guest.state().epoch, visible: visible && !documentObject?.hidden, title: guest.state().title, url: guest.state().url })
  async function execute(command) {
    if (running || !state.granted || !visible || documentObject?.hidden) { await takeover('manual'); return }
    const ownGeneration = generation
    running = command; publish({ busy: true, status: 'running' })
    try {
      const outcome = await guest.perform(command, { beforeInput: async () => {
        if (disposed || ownGeneration !== generation) throw fail('BROWSER_REVOKED', 'Browser control ended before input dispatch.')
        const confirmation = await call('confirm', { ...auth(), commandId: command.id, grantRevision: command.grantRevision, epoch: guest.state().epoch })
        if (!confirmation.allowed || disposed || ownGeneration !== generation) throw fail('BROWSER_REVOKED', 'Browser input authority expired.')
      } })
      if (disposed || ownGeneration !== generation) return
      await call('ack', { ...auth(), commandId: command.id, grantRevision: command.grantRevision, epoch: outcome.epoch, result: outcome.result })
      if (!disposed && ownGeneration === generation) publish({ status: 'ready' })
    } catch (error) {
      if (!disposed && ownGeneration === generation) {
        // A failed acknowledgement is an uncertain mutation, not permission to replay.
        try { await call('ack', { ...auth(), commandId: command.id, grantRevision: command.grantRevision, epoch: guest.state().epoch, error: String(error.message ?? error).slice(0, 300) }) } catch {}
        await takeover('stopped')
        publish({ error: String(error.message ?? 'Browser operation stopped.').slice(0, 300) })
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
      const result = await call('poll', auth())
      if (disposed) return
      if (ownGeneration !== generation) { if (result.command) await takeover('stale-command'); return }
      if (state.granted && !result.granted) { await takeover(result.status); return }
      if (result.command) void execute(result.command)
    } catch (error) {
      if (!disposed && ownGeneration === generation) { await takeover(stopReason(error)); publish({ error: errorDetail(error) }) }
    } finally { pumping = false; for (const done of pumpWaiters.splice(0)) done(); if (!disposed && !granting) timer = setTimeout(pump, pollMs) }
  }
  const visibility = () => { if (documentObject?.hidden) void takeover('hidden') }
  documentObject?.addEventListener('visibilitychange', visibility)
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    async start() {
      try {
        if (desktop?.protocolVersion !== 1 || !desktop.browser) throw fail('BROWSER_DESKTOP', 'A compatible DSH Desktop shell is required. Web preview does not provide an embedded browser.')
        registration = await call('register', { sessionId, clientTabId })
        if (disposed) { await call('close', auth()).catch(() => {}); return }
        guest = guestFactory({ desktop, workspace: registration.workspace, host, applicationOrigin, documentObject,
          onOpen, onChange: next => publish(next), onInvalidate: (reason, navigation) => {
            if ((state.granted || granting) && !(navigation && running && NAVIGATION.has(running.action))) void takeover(reason)
          } })
        publish({ tabId: registration.tabId, grantRevision: registration.grantRevision })
        await guest.start()
        if (disposed) return
        publish({ status: 'manual' }); void pump()
      } catch (error) { if (!disposed) publish({ status: 'unavailable', error: String(error.message ?? 'Embedded browser unavailable.'), ready: false }) }
    },
    setVisible(value) { visible = Boolean(value); publish({ visible }); if (!visible) void takeover('hidden') },
    async grant() {
      if (disposed || granting || !guest?.state().ready || !visible || documentObject?.hidden) return
      granting = true; clearTimeout(timer); localRevoke('manual')
      const ownGeneration = generation
      try {
        if (pumping) await new Promise(resolve => pumpWaiters.push(resolve))
        if (disposed || ownGeneration !== generation || !visible || documentObject?.hidden) return
        await call('revoke', auth())
        if (disposed || ownGeneration !== generation) return
        const fresh = await sync()
        if (disposed || ownGeneration !== generation) return
        const granted = await call('grant', { ...auth(), epoch: fresh.epoch, grantRevision: fresh.grantRevision })
        if (disposed || ownGeneration !== generation || !visible) { void takeover('hidden'); return }
        guest.grant(granted.grantRevision)
        publish({ granted: true, grantRevision: granted.grantRevision, status: 'ready', error: null })
      } catch (error) { if (!disposed && ownGeneration === generation) { await takeover('manual'); publish({ error: String(error.message ?? 'AI access was not enabled.') }) } }
      finally { granting = false; if (!disposed) { clearTimeout(timer); timer = setTimeout(pump, 0) } }
    },
    takeover,
    async navigate(url) { void takeover(); if (!disposed) { try { await guest.navigate(url); publish({ error: null }) } catch (error) { publish({ error: error.message }) } } },
    async manual(action) { void takeover(); if (!disposed) { try { guest.manual(action) } catch (error) { publish({ error: error.message }) } } },
    async dispose() {
      if (disposed) return
      localRevoke('closed'); disposed = true; clearTimeout(timer); documentObject?.removeEventListener('visibilitychange', visibility)
      for (const request of requests) request.abort()
      if (registration) await call('close', auth()).catch(() => {})
      await guest?.dispose(); listeners.clear()
    },
  }
}
