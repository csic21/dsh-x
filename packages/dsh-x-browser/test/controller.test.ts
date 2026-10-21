import test from 'node:test'
import assert from 'node:assert/strict'
import { createBrowserController } from '../src/client/controller.ts'
const tick = () => new Promise<any>(resolve => setImmediate(resolve))
const deferred = () => { let resolve!: (value: any) => void; const promise = new Promise<any>(done => { resolve = done }); return { promise, resolve } }
function fixture(options: Record<string, any> = {}) {
  let revision = 0, granted = false, active = false, syncs = 0, command: any = null, invalidate: any
  const calls: any[] = [], state = { ready: true, epoch: 1, title: 'Fixture', url: 'https://example.test/' }, reply = (value: any) => ({ ok: true, value })
  const rpc = { async call(_base: any, name: any, args: any) {
    calls.push({ name, args })
    if (name === 'browser/register') return reply({ tabId: 'owned-tab', capability: 'owned-cap', workspace: '/work', grantRevision: 0, autoGrant: options.register === true })
    if (name === 'browser/sync') { syncs++; if (options.sync) { const value = options.sync(syncs, { epoch: 1, grantRevision: revision, granted, status: 'manual' }); if (value) return value } return reply({ epoch: 1, grantRevision: revision, granted, status: granted ? 'ready' : 'manual' }) }
    if (name === 'browser/grant') { granted = true; revision++; const response = reply({ epoch: 1, grantRevision: revision, granted }); return options.grant ? options.grant(response) : response }
    if (name === 'browser/revoke') { granted = false; revision++; return reply({ grantRevision: revision }) }
    if (name === 'browser/poll') { const current = command; command = null; return reply({ grantRevision: revision, granted, command: current }) }
    if (name === 'browser/confirm') return options.confirm ? options.confirm(args) : reply({ allowed: true })
    if (name === 'browser/ack') return reply({ acknowledged: true })
    if (name === 'browser/close') { granted = false; return reply({ closed: true }) }
    throw Error(name)
  } }
  const guest = { state: () => state, start: async () => {}, grant: () => { active = true }, revoke: () => { active = false }, dispose: async () => {}, perform: async (raw: any, controls: any) => options.perform ? options.perform(raw, controls) : { epoch: 1, result: {} }, navigate: async (value: any) => { state.url = value }, manual() {} }
  const controller = createBrowserController({ rpc, desktop: { protocolVersion: 1, browser: {} as any }, sessionId: 'session', clientTabId: 'ui', host: {}, pollMs: 100000, documentObject: { hidden: false, addEventListener() {}, removeEventListener() {} }, guestFactory: ({ onChange, onInvalidate }) => {
    invalidate = onInvalidate
    const ready = () => onChange!({ ...state, loading: false, error: null, canGoBack: false, canGoForward: false })
    // `guestReadyLater` models the real ordering: the pane is visible first, the
    // webview reports ready afterwards, so start() must not block on that flip.
    guest.start = async () => { if (options.guestReadyLater) { state.ready = false; void options.guestReadyLater.promise.then(() => { state.ready = true; ready() }) } else ready() }
    return guest
  } })
  if (options.startHidden !== true) controller.setVisible(true)
  return { controller, calls, active: () => active, serverGranted: () => granted, invalidate: (reason: string, navigation: boolean) => invalidate(reason, navigation), navigateWhilePending: () => { state.epoch++; state.url = 'https://elsewhere.test/b'; invalidate('navigation', true) }, setCommand: (value: any) => { command = value } }
}
test('grant waits behind stale pump sync; old response cannot overwrite or orphan new server authority', async t => {
  const old = deferred(), f = fixture({ sync: (count: any) => count === 1 ? old.promise : null }); t.after(() => f.controller.dispose())
  await f.controller.start()
  const granting = f.controller.grant(); await tick()
  assert.equal(f.calls.some(call => call.name === 'browser/grant'), false)
  old.resolve({ ok: true, value: { epoch: 1, grantRevision: 0, granted: false, status: 'manual' } })
  await granting; await tick()
  assert.equal(f.controller.getSnapshot().granted, true); assert.equal(f.serverGranted(), true); assert.equal(f.active(), true)
})
test('hiding and showing while grant response is pending cannot reactivate the old grant', async t => {
  const pending = deferred(); let response
  const f = fixture({ grant: (value: any) => { response = value; return pending.promise } }); t.after(() => f.controller.dispose())
  await f.controller.start(); await tick()
  const granting = f.controller.grant()
  while (!response) await tick()
  f.controller.setVisible(false); f.controller.setVisible(true); await tick()
  pending.resolve(response); await granting; await tick()
  assert.equal(f.controller.getSnapshot().granted, false); assert.equal(f.serverGranted(), false); assert.equal(f.active(), false)
})
test('takeover is immediate and late guest completion sends no success acknowledgement', async t => {
  const pending = deferred(); let entered = false
  const f = fixture({ perform: () => { entered = true; return pending.promise } }); t.after(() => f.controller.dispose())
  await f.controller.start(); await tick(); await f.controller.grant()
  const revision = f.controller.getSnapshot().grantRevision
  f.setCommand({ id: 'command-1', action: 'observe', epoch: 1, grantRevision: revision })
  for (let i = 0; !entered && i < 100; i++) await new Promise<any>(resolve => setTimeout(resolve, 1))
  assert.equal(entered, true)
  const takeover = f.controller.takeover()
  assert.equal(f.active(), false); assert.equal(f.controller.getSnapshot().granted, false)
  pending.resolve({ epoch: 1, result: { text: 'late' } }); await takeover; await tick()
  assert.equal(f.calls.filter(call => call.name === 'browser/ack').length, 0)
})

test('navigation during a pending grant cannot authorize the replacement document', async t => {
 const pending = deferred(); let response
 const f = fixture({ grant: (value: any) => { response = value; return pending.promise } }); t.after(() => f.controller.dispose())
 await f.controller.start(); const granting = f.controller.grant(); while (!response) await tick()
 f.navigateWhilePending(); pending.resolve(response); await granting; await tick()
 assert.equal(f.controller.getSnapshot().granted, false); assert.equal(f.serverGranted(), false); assert.equal(f.active(), false)
})

test('controller confirms the exact owned command before allowing native input', async t => {
  let sent = false
  const f = fixture({ perform: async (_raw: any, { beforeInput }: any) => { await beforeInput!(); sent = true; return { epoch: 1, result: {} } } }); t.after(() => f.controller.dispose())
  await f.controller.start(); await tick(); await f.controller.grant()
  const revision = f.controller.getSnapshot().grantRevision
  f.setCommand({ id: 'command-1', action: 'scroll', x: 0, y: 100, epoch: 1, grantRevision: revision })
  for (let i = 0; !sent && i < 100; i++) await new Promise<any>(resolve => setTimeout(resolve, 1))
  assert.equal(sent, true)
  assert.deepEqual(f.calls.find(call => call.name === 'browser/confirm').args, { tabId: 'owned-tab', capability: 'owned-cap', commandId: 'command-1', grantRevision: revision, epoch: 1 })
  assert.equal(f.calls.filter(call => call.name === 'browser/ack').length, 1)
})

test('local takeover while host confirmation is pending prevents input and late acknowledgement', async t => {
  const pending = deferred(); let confirming = false, sent = false
  const f = fixture({ confirm: () => { confirming = true; return pending.promise }, perform: async (_raw: any, { beforeInput }: any) => { await beforeInput!(); sent = true; return { epoch: 1, result: {} } } }); t.after(() => f.controller.dispose())
  await f.controller.start(); await tick(); await f.controller.grant()
  f.setCommand({ id: 'command-1', action: 'scroll', x: 0, y: 100, epoch: 1, grantRevision: f.controller.getSnapshot().grantRevision })
  for (let i = 0; !confirming && i < 100; i++) await new Promise<any>(resolve => setTimeout(resolve, 1))
  assert.equal(confirming, true)
  await f.controller.takeover(); pending.resolve({ ok: true, value: { allowed: true } }); await tick()
  assert.equal(sent, false); assert.equal(f.active(), false)
  assert.equal(f.calls.filter(call => call.name === 'browser/ack').length, 0)
})

test('a turn-ended poll failure revokes control with its actual reason, not a connection-loss label', async t => {
  const f = fixture({ sync: (_count: any, current: any) => current.granted ? { ok: false, error: { code: 'BROWSER_RUN', message: 'The authorized turn ended.' } } : null }); t.after(() => f.controller.dispose())
  await f.controller.start(); await tick(); await f.controller.grant()
  for (let i = 0; f.controller.getSnapshot().granted && i < 100; i++) await new Promise<any>(resolve => setTimeout(resolve, 1))
  const state = f.controller.getSnapshot()
  assert.equal(state.granted, false); assert.equal(state.status, 'turn-ended'); assert.match(state.error!, /\[BROWSER_RUN\]/)
  assert.equal(f.active(), false); assert.equal(f.serverGranted(), false)
})

test('autoGrant grants a ready visible tab without any click, exactly once', async t => {
  const f = fixture({ register: true }); t.after(() => f.controller.dispose())
  await f.controller.start(); await tick()
  for (let i = 0; !f.serverGranted() && i < 100; i++) await new Promise<any>(resolve => setTimeout(resolve, 1))
  assert.equal(f.serverGranted(), true)
  assert.equal(f.controller.getSnapshot().granted, true)
  assert.equal(f.active(), true)
  const grants = f.calls.filter((call: any) => call.name === 'browser/grant').length
  assert.equal(grants, 1)
  // A revocation must stay revoked: no background retry loop may re-grant it.
  await f.controller.takeover(); await tick(); await tick()
  assert.equal(f.serverGranted(), false)
  assert.equal(f.calls.filter((call: any) => call.name === 'browser/grant').length, grants)
})

test('a tab without autoGrant stays manual until the user grants it', async t => {
  const f = fixture(); t.after(() => f.controller.dispose())
  await f.controller.start(); await tick(); await tick()
  assert.equal(f.calls.some(call => call.name === 'browser/grant'), false)
  assert.equal(f.controller.getSnapshot().granted, false)
})

test('autoGrant also fires when the tab becomes visible after the guest is ready', async t => {
  const f = fixture({ register: true, startHidden: true }); t.after(() => f.controller.dispose())
  await f.controller.start(); await tick(); await tick()
  // The pane starts hidden, so readiness alone must not grant anything yet.
  assert.equal(f.serverGranted(), false)
  f.controller.setVisible(true); await tick()
  for (let i = 0; !f.serverGranted() && i < 100; i++) await new Promise<any>(resolve => setTimeout(resolve, 1))
  assert.equal(f.serverGranted(), true)
  assert.equal(f.controller.getSnapshot().granted, true)
})

test('autoGrant retries once when the guest becomes ready after the pane was already visible', async t => {
  const ready = deferred()
  const f = fixture({ register: true, guestReadyLater: ready }); t.after(() => f.controller.dispose())
  await f.controller.start(); await tick(); await tick()
  assert.equal(f.serverGranted(), false)
  ready.resolve(true)
  for (let i = 0; !f.serverGranted() && i < 100; i++) await new Promise<any>(resolve => setTimeout(resolve, 1))
  assert.equal(f.serverGranted(), true)
  assert.equal(f.controller.getSnapshot().granted, true)
})

test('a command refused before any input keeps the grant, so an unattended loop can observe again', async t => {
  const f = fixture({ perform: async () => { throw Object.assign(new Error('Observe the page again and choose an allowed target.'), { code: 'BROWSER_TARGET' }) } })
  t.after(() => f.controller.dispose())
  await f.controller.start(); await tick(); await f.controller.grant()
  f.setCommand({ id: 'stale', action: 'click', target: 'e1:s1:n9', epoch: 1, grantRevision: f.controller.getSnapshot().grantRevision })
  for (let i = 0; i < 200 && !f.controller.getSnapshot().error; i++) await new Promise<any>(resolve => setTimeout(resolve, 1))
  assert.equal(f.controller.getSnapshot().granted, true)
  assert.equal(f.serverGranted(), true)
  assert.match(String(f.controller.getSnapshot().error), /allowed target/)
})

test('autoGrant never restarts a grant that is already live', async t => {
  const f = fixture({ register: true }); t.after(() => f.controller.dispose())
  await f.controller.start(); await tick()
  for (let i = 0; !f.serverGranted() && i < 100; i++) await new Promise<any>(resolve => setTimeout(resolve, 1))
  const grants = f.calls.filter((call: any) => call.name === 'browser/grant').length
  assert.equal(grants, 1)
  // Re-asserting visibility while the grant is healthy must not revoke-and-redo it.
  const revokes = f.calls.filter(call => call.name === 'browser/revoke').length
  f.controller.setVisible(true); await tick(); await tick()
  assert.equal(f.calls.filter((call: any) => call.name === 'browser/grant').length, 1)
  // `grantNow` revokes once as its own first step; re-asserting visibility must add nothing.
  assert.equal(f.calls.filter(call => call.name === 'browser/revoke').length, revokes)
  assert.equal(f.serverGranted(), true)
})

test('an unattended profile renews the grant after a link navigates, without asking again', async t => {
  const f = fixture({ register: true }); t.after(() => f.controller.dispose())
  await f.controller.start(); await tick()
  for (let i = 0; !f.serverGranted() && i < 100; i++) await new Promise<any>(resolve => setTimeout(resolve, 1))
  const before = f.calls.filter((call: any) => call.name === 'browser/grant').length
  assert.equal(f.controller.getSnapshot().granted, true)
  // A click that navigates produces exactly this invalidation on the real guest.
  f.navigateWhilePending()
  for (let i = 0; i < 200 && f.calls.filter((call: any) => call.name === 'browser/grant').length === before; i++) await new Promise<any>(resolve => setTimeout(resolve, 2))
  assert.equal(f.calls.filter((call: any) => call.name === 'browser/grant').length, before + 1)
  assert.equal(f.serverGranted(), true)
  assert.equal(f.controller.getSnapshot().granted, true)
})

test('a default profile still drops the grant when a link navigates', async t => {
  const f = fixture(); t.after(() => f.controller.dispose())
  await f.controller.start(); await tick(); await f.controller.grant()
  assert.equal(f.serverGranted(), true)
  f.navigateWhilePending()
  for (let i = 0; i < 200 && f.serverGranted(); i++) await new Promise<any>(resolve => setTimeout(resolve, 2))
  assert.equal(f.serverGranted(), false)
  assert.equal(f.controller.getSnapshot().granted, false)
})

test('a click that navigates is not reported as a failure under autoGrant', async t => {
  const f: any = fixture({
    register: true,
    // The real guest invalidates its document while the click is still in flight,
    // then the command's own epoch check fails.
    perform: async (_raw: any, { beforeInput }: any) => {
      await beforeInput!()
      f.navigateWhilePending()
      throw Object.assign(new Error('Control was revoked or the page changed.'), { code: 'BROWSER_STALE' })
    },
  }); t.after(() => f.controller.dispose())
  await f.controller.start(); await tick()
  for (let i = 0; !f.serverGranted() && i < 100; i++) await new Promise<any>(resolve => setTimeout(resolve, 1))
  const revision = f.controller.getSnapshot().grantRevision
  f.setCommand({ id: 'nav-click', action: 'click', target: 'e1:s1:n1', epoch: 1, grantRevision: revision })
  for (let i = 0; i < 200 && f.controller.getSnapshot().busy !== false; i++) await new Promise<any>(resolve => setTimeout(resolve, 1))
  await tick(); await tick()
  const state = f.controller.getSnapshot()
  assert.equal(state.granted, true)
  assert.equal(state.error, null)
  assert.equal(state.status, 'ready')
  assert.equal(f.serverGranted(), true)
})

test('the pane reports the autoGrant policy so the UI can drop the Allow AI control', async t => {
  const f = fixture({ register: true }); t.after(() => f.controller.dispose())
  await f.controller.start(); await tick()
  assert.equal(f.controller.getSnapshot().autoGrant, true)
  const g = fixture(); t.after(() => g.controller.dispose())
  await g.controller.start(); await tick()
  assert.equal(g.controller.getSnapshot().autoGrant, false)
})

test('the same navigating click still stops a default profile, so the check is discriminating', async t => {
  const f: any = fixture({
    perform: async (_raw: any, { beforeInput }: any) => {
      await beforeInput!()
      f.navigateWhilePending()
      throw Object.assign(new Error('Control was revoked or the page changed.'), { code: 'BROWSER_STALE' })
    },
  }); t.after(() => f.controller.dispose())
  await f.controller.start(); await tick(); await f.controller.grant()
  f.setCommand({ id: 'nav-click', action: 'click', target: 'e1:s1:n1', epoch: 1, grantRevision: f.controller.getSnapshot().grantRevision })
  for (let i = 0; i < 300 && f.serverGranted(); i++) await new Promise<any>(resolve => setTimeout(resolve, 2))
  assert.equal(f.serverGranted(), false)
  assert.equal(f.controller.getSnapshot().granted, false)
})

test('an unattended tab recovers by itself after an ordinary stop, and gives up after three tries', async t => {
  let failures = 0
  const f: any = fixture({
    register: true,
    // The guest accepts input but the acknowledgement always fails.
    perform: async () => { failures += 1; throw Object.assign(new Error('acknowledgement failed'), { code: 'BROWSER_STALE' }) },
  }); t.after(() => f.controller.dispose())
  await f.controller.start(); await tick()
  for (let i = 0; !f.serverGranted() && i < 100; i++) await new Promise<any>(resolve => setTimeout(resolve, 1))
  for (let round = 0; round < 6; round++) {
    f.setCommand({ id: `cmd-${round}`, action: 'scroll', x: 0, y: 1, epoch: 1, grantRevision: f.calls.filter((c: any) => c.name === 'browser/grant').length })
    await new Promise<any>(resolve => setTimeout(resolve, 60))
  }
  // Recovery is bounded: the loop cannot spin forever on a guest that never succeeds.
  assert.ok(failures >= 1)
  assert.ok(f.calls.filter((call: any) => call.name === 'browser/grant').length <= 1 + 3, `grants=${f.calls.filter((call: any) => call.name === 'browser/grant').length}`)
})
