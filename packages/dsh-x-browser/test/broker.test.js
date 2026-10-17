import test from 'node:test'
import assert from 'node:assert/strict'
import { createBrowserBroker } from '../src/broker.js'
const scope = { profile: 'profile-a', sessionId: 'session-a', workspace: '/work/a' }
async function fixture(options = {}) {
  const broker = createBrowserBroker({ profile: scope.profile, turnOf: () => ({ runId: 'run-a', turn: 1 }), contextOf: async id => ({ ...scope, sessionId: id }), ...options })
  const tab = await broker.register({ sessionId: scope.sessionId, clientTabId: 'ui-a' })
  const auth = { tabId: tab.tabId, capability: tab.capability }
  await broker.sync({ ...auth, epoch: 1, visible: true, title: 'Fixture', url: 'https://example.test/a?token=secret#private' })
  const grant = await broker.grant({ ...auth, epoch: 1, grantRevision: 0 })
  const action = (command = { action: 'observe' }, opts = {}) => broker.execute(scope, { tabId: tab.tabId, epoch: 1, grantRevision: grant.grantRevision, command }, { runId: 'run-a', turnNumber: 1, ...opts })
  return { broker, auth, tab, grant, action }
}
test('registration is bounded to existing workspace; model never receives capabilities or private URL tokens', async t => {
  const f = await fixture(); t.after(() => f.broker.dispose())
  const list = await f.broker.list(scope)
  assert.equal(list.tabs[0].url, 'https://example.test/a')
  assert.equal(JSON.stringify(list).includes(f.auth.capability), false)
  assert.deepEqual((await f.broker.list({ ...scope, profile: 'other' })).tabs, [])
  await assert.rejects(f.broker.poll({ ...f.auth, capability: 'wrong' }), { code: 'BROWSER_OWNER' })
})
test('only owner poll gets one command; ack resolves exact pending action; duplicate ack is rejected', async t => {
  const f = await fixture(); t.after(() => f.broker.dispose())
  const value = f.action(); await new Promise(resolve => setImmediate(resolve))
  const delivery = await f.broker.poll(f.auth)
  assert.equal(delivery.command.action, 'observe')
  assert.equal((await f.broker.poll(f.auth)).command, null)
  const ack = { ...f.auth, commandId: delivery.command.id, epoch: 1, grantRevision: f.grant.grantRevision, result: { text: 'fixture' } }
  await f.broker.acknowledge(ack)
  assert.equal((await value).result.text, 'fixture')
  await assert.rejects(f.broker.acknowledge(ack), { code: 'BROWSER_STALE' })
})
test('takeover revokes synchronously before callbacks, rejects pending, blocks stale commands and late ack', async t => {
  let observed
  const f = await fixture({ onRevoke: state => { observed = state } }); t.after(() => f.broker.dispose())
  const pending = f.action(); const rejection = assert.rejects(pending, { code: 'BROWSER_REVOKED' }); await new Promise(resolve => setImmediate(resolve))
  const delivery = await f.broker.poll(f.auth)
  f.broker.revoke(f.auth)
  assert.equal(observed.granted, false); assert.equal(observed.busy, false)
  await rejection
  await assert.rejects(f.action(), { code: 'BROWSER_GRANT' })
  await assert.rejects(f.broker.acknowledge({ ...f.auth, commandId: delivery.command.id, epoch: 1, grantRevision: f.grant.grantRevision, result: {} }), { code: 'BROWSER_STALE' })
})
test('navigation changes invalidate queued element actions, while owned navigation may acknowledge its new document', async t => {
  const f = await fixture(); t.after(() => f.broker.dispose())
  const pending = f.action({ action: 'click', target: 'e1:s1:n1' }); const rejection = assert.rejects(pending, { code: 'BROWSER_REVOKED' }); await new Promise(resolve => setImmediate(resolve))
  await f.broker.sync({ ...f.auth, epoch: 2, visible: true }); await rejection
  assert.equal((await f.broker.poll(f.auth)).command, null)
  const next = await fixture(); t.after(() => next.broker.dispose())
  const navigation = next.action({ action: 'navigate', url: 'https://example.test/next' }); await new Promise(resolve => setImmediate(resolve))
  const delivery = await next.broker.poll(next.auth)
  await next.broker.sync({ ...next.auth, epoch: 2, visible: true })
  await next.broker.acknowledge({ ...next.auth, commandId: delivery.command.id, grantRevision: next.grant.grantRevision, epoch: 2, result: { status: 'navigation-requested' } })
  assert.equal((await navigation).epoch, 2)
})
test('hidden, workspace switch, disconnected heartbeat, turn switch and abort all fail closed', async t => {
  for (const kind of ['hidden', 'workspace', 'heartbeat', 'turn', 'abort']) {
    let current = { ...scope }, clock = 100, active = true
    const f = await fixture({ contextOf: async () => current, now: () => clock, heartbeatMs: 50 }); t.after(() => f.broker.dispose())
    const abort = new AbortController()
    const pending = f.action({ action: 'observe' }, { signal: abort.signal, assertCurrent: () => { if (!active) throw new Error('Ended') } })
    const rejection = assert.rejects(pending); await new Promise(resolve => setImmediate(resolve))
    if (kind === 'hidden') await f.broker.sync({ ...f.auth, epoch: 1, visible: false })
    if (kind === 'workspace') { current = { ...scope, workspace: '/work/b' }; await assert.rejects(f.broker.poll(f.auth), { code: 'BROWSER_SCOPE' }) }
    if (kind === 'heartbeat') { clock += 100; await assert.rejects(f.broker.poll(f.auth), { code: 'BROWSER_OFFLINE' }) }
    if (kind === 'turn') { active = false; assert.equal((await f.broker.poll(f.auth)).command, null) }
    if (kind === 'abort') abort.abort()
    await rejection
  }
})
test('lost acknowledgement is never replayed and requires a new explicit grant', async t => {
  const f = await fixture({ timeoutMs: 20 }); t.after(() => f.broker.dispose())
  const pending = f.action({ action: 'click', target: 'e1:s1:n1' }); const rejection = assert.rejects(pending, /acknowledgement-lost/)
  await new Promise(resolve => setImmediate(resolve)); await f.broker.poll(f.auth); await rejection
  assert.equal((await f.broker.poll(f.auth)).command, null)
  await assert.rejects(f.action(), { code: 'BROWSER_GRANT' })
})
test('close and replacement destroy the old capability; a grant is bound to a single turn', async t => {
  const f = await fixture(); t.after(() => f.broker.dispose())
  const pending = f.action(); await new Promise(resolve => setImmediate(resolve)); const d = await f.broker.poll(f.auth)
  await f.broker.acknowledge({ ...f.auth, commandId: d.command.id, grantRevision: f.grant.grantRevision, epoch: 1, result: {} }); await pending
  await assert.rejects(f.action({ action: 'observe' }, { runId: 'run-b' }), { code: 'BROWSER_RUN' })
  await f.broker.register({ sessionId: scope.sessionId, clientTabId: 'ui-a' })
  await assert.rejects(f.broker.poll(f.auth), { code: 'BROWSER_CLOSED' })
})

test('idle grant authorizes exactly the next turn; an unused active grant cannot be claimed by a later run', async t => {
  let turn = { runId: null, turn: 0 }
  const f = await fixture({ turnOf: () => turn }); t.after(() => f.broker.dispose())
  turn = { runId: 'run-b', turn: 2 }
  await assert.rejects(f.action({ action: 'observe' }, { runId: 'run-b', turnNumber: 2 }), { code: 'BROWSER_RUN' })
  let active = { runId: 'run-a', turn: 1 }
  const g = await fixture({ turnOf: () => active }); t.after(() => g.broker.dispose())
  active = { runId: 'run-b', turn: 2 }
  await assert.rejects(g.action({ action: 'observe' }, { runId: 'run-b', turnNumber: 2 }), { code: 'BROWSER_RUN' })
})

test('pre-input confirmation rejects a delivered command revoked while its page helper was pending', async t => {
  const f = await fixture(); t.after(() => f.broker.dispose())
  const pending = f.action({ action: 'click', target: 'e1:s1:n1' }); const rejection = assert.rejects(pending, { code: 'BROWSER_REVOKED' }); await new Promise(resolve => setImmediate(resolve))
  const delivery = await f.broker.poll(f.auth)
  const request = { ...f.auth, commandId: delivery.command.id, epoch: 1, grantRevision: f.grant.grantRevision }
  assert.equal((await f.broker.confirm(request)).allowed, true)
  f.broker.revoke(f.auth); await rejection
  await assert.rejects(f.broker.confirm(request), { code: 'BROWSER_STALE' })
})
