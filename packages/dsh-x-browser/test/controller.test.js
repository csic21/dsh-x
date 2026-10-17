import test from 'node:test'
import assert from 'node:assert/strict'
import { createBrowserController } from '../src/client/controller.js'
const tick = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
function fixture(options = {}) {
  let revision = 0, granted = false, active = false, syncs = 0, command = null, invalidate
  const calls = [], state = { ready: true, epoch: 1, title: 'Fixture', url: 'https://example.test/' }, reply = value => ({ ok: true, value })
  const rpc = { async call(_base, name, args) {
    calls.push({ name, args })
    if (name === 'browser/register') return reply({ tabId: 'owned-tab', capability: 'owned-cap', workspace: '/work', grantRevision: 0 })
    if (name === 'browser/sync') { syncs++; if (options.sync) { const value = options.sync(syncs, { epoch: 1, grantRevision: revision, granted, status: 'manual' }); if (value) return value } return reply({ epoch: 1, grantRevision: revision, granted, status: granted ? 'ready' : 'manual' }) }
    if (name === 'browser/grant') { granted = true; revision++; const response = reply({ epoch: 1, grantRevision: revision, granted }); return options.grant ? options.grant(response) : response }
    if (name === 'browser/revoke') { granted = false; revision++; return reply({ grantRevision: revision }) }
    if (name === 'browser/poll') { const current = command; command = null; return reply({ grantRevision: revision, granted, command: current }) }
    if (name === 'browser/ack') return reply({ acknowledged: true })
    if (name === 'browser/close') { granted = false; return reply({ closed: true }) }
    throw Error(name)
  } }
  const guest = { state: () => state, start: async () => {}, grant: () => { active = true }, revoke: () => { active = false }, dispose: async () => {}, perform: async raw => options.perform ? options.perform(raw) : { epoch: 1, result: {} }, navigate: async value => { state.url = value }, manual() {} }
  const controller = createBrowserController({ rpc, desktop: { protocolVersion: 1, browser: {} }, sessionId: 'session', clientTabId: 'ui', host: {}, pollMs: 100000, documentObject: { hidden: false, addEventListener() {}, removeEventListener() {} }, guestFactory: ({ onChange, onInvalidate }) => { invalidate = onInvalidate; guest.start = async () => onChange(state); return guest } })
  controller.setVisible(true)
  return { controller, calls, active: () => active, serverGranted: () => granted, navigateWhilePending: () => { state.epoch++; state.url = 'https://elsewhere.test/b'; invalidate('navigation', true) }, setCommand: value => { command = value } }
}
test('grant waits behind stale pump sync; old response cannot overwrite or orphan new server authority', async t => {
  const old = deferred(), f = fixture({ sync: count => count === 1 ? old.promise : null }); t.after(() => f.controller.dispose())
  await f.controller.start()
  const granting = f.controller.grant(); await tick()
  assert.equal(f.calls.some(call => call.name === 'browser/grant'), false)
  old.resolve({ ok: true, value: { epoch: 1, grantRevision: 0, granted: false, status: 'manual' } })
  await granting; await tick()
  assert.equal(f.controller.getSnapshot().granted, true); assert.equal(f.serverGranted(), true); assert.equal(f.active(), true)
})
test('hiding and showing while grant response is pending cannot reactivate the old grant', async t => {
  const pending = deferred(); let response
  const f = fixture({ grant: value => { response = value; return pending.promise } }); t.after(() => f.controller.dispose())
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
  for (let i = 0; !entered && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 1))
  assert.equal(entered, true)
  const takeover = f.controller.takeover()
  assert.equal(f.active(), false); assert.equal(f.controller.getSnapshot().granted, false)
  pending.resolve({ epoch: 1, result: { text: 'late' } }); await takeover; await tick()
  assert.equal(f.calls.filter(call => call.name === 'browser/ack').length, 0)
})

test('navigation during a pending grant cannot authorize the replacement document', async t => {
 const pending = deferred(); let response
 const f = fixture({ grant: value => { response = value; return pending.promise } }); t.after(() => f.controller.dispose())
 await f.controller.start(); const granting = f.controller.grant(); while (!response) await tick()
 f.navigateWhilePending(); pending.resolve(response); await granting; await tick()
 assert.equal(f.controller.getSnapshot().granted, false); assert.equal(f.serverGranted(), false); assert.equal(f.active(), false)
})
