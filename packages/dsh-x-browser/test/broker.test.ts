import test from 'node:test'
import assert from 'node:assert/strict'
import { createBrowserBroker } from '../src/backends/embedded/broker.ts'
import { createBrowserOwnership } from '../src/ownership.ts'
import type { BrowserTraceEvent, BrowserTurn } from '../src/backends/embedded/broker.ts'
type BrowserBroker = ReturnType<typeof createBrowserBroker>
type BrokerOptions = Partial<Parameters<typeof createBrowserBroker>[0]>
type DispatchOwner = NonNullable<Parameters<BrowserBroker['execute']>[2]>
const scope = { profile: 'profile-a', sessionId: 'session-a', workspace: '/work/a' }
async function fixture(options: BrokerOptions = {}) {
  const broker = createBrowserBroker({ profile: scope.profile, turnOf: () => ({ runId: 'run-a', turn: 1 }), contextOf: async id => ({ ...scope, sessionId: id }), ...options })
  const tab = await broker.register({ sessionId: scope.sessionId, clientTabId: 'ui-a' })
  const auth = { tabId: tab.tabId, capability: tab.capability }
  await broker.sync({ ...auth, epoch: 1, visible: true, title: 'Fixture', url: 'https://example.test/a?token=secret#private' })
  const grant = await broker.grant({ ...auth, epoch: 1, grantRevision: 0 })
  const action = (command: unknown = { action: 'observe' }, opts: DispatchOwner = {}) => broker.execute(scope, { tabId: tab.tabId, epoch: 1, grantRevision: grant.grantRevision, command }, { runId: 'run-a', turnNumber: 1, ...opts })
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
  const value = f.action(); await new Promise<any>(resolve => setImmediate(resolve))
  const delivery = await f.broker.poll(f.auth)
  assert.equal(delivery.command!.action, 'observe')
  assert.equal((await f.broker.poll(f.auth)).command, null)
  const ack = { ...f.auth, commandId: delivery.command!.id, epoch: 1, grantRevision: f.grant.grantRevision, result: { text: 'fixture' } }
  await f.broker.acknowledge(ack)
  assert.equal(((await value).result as { text: string }).text, 'fixture')
  await assert.rejects(f.broker.acknowledge(ack), { code: 'BROWSER_STALE' })
})
test('takeover revokes synchronously before callbacks, rejects pending, blocks stale commands and late ack', async t => {
  let observed: { granted: boolean, busy: boolean } | undefined
  const f = await fixture({ onRevoke: state => { observed = state } }); t.after(() => f.broker.dispose())
  const pending = f.action(); const rejection = assert.rejects(pending, { code: 'BROWSER_REVOKED' }); await new Promise<any>(resolve => setImmediate(resolve))
  const delivery = await f.broker.poll(f.auth)
  f.broker.revoke(f.auth)
  assert.equal(observed!.granted, false); assert.equal(observed!.busy, false)
  await rejection
  await assert.rejects(f.action(), { code: 'BROWSER_GRANT' })
  await assert.rejects(f.broker.acknowledge({ ...f.auth, commandId: delivery.command!.id, epoch: 1, grantRevision: f.grant.grantRevision, result: {} }), { code: 'BROWSER_STALE' })
})
test('navigation changes invalidate queued element actions, while owned navigation may acknowledge its new document', async t => {
  const f = await fixture(); t.after(() => f.broker.dispose())
  const pending = f.action({ action: 'click', target: 'e1:s1:n1' }); const rejection = assert.rejects(pending, { code: 'BROWSER_REVOKED' }); await new Promise<any>(resolve => setImmediate(resolve))
  await f.broker.sync({ ...f.auth, epoch: 2, visible: true }); await rejection
  assert.equal((await f.broker.poll(f.auth)).command, null)
  const next = await fixture(); t.after(() => next.broker.dispose())
  const navigation = next.action({ action: 'navigate', url: 'https://example.test/next' }); await new Promise<any>(resolve => setImmediate(resolve))
  const delivery = await next.broker.poll(next.auth)
  await next.broker.sync({ ...next.auth, epoch: 2, visible: true })
  await next.broker.acknowledge({ ...next.auth, commandId: delivery.command!.id, grantRevision: next.grant.grantRevision, epoch: 2, result: { status: 'navigation-requested' } })
  assert.equal((await navigation).epoch, 2)
})
test('hidden, workspace switch, disconnected heartbeat, turn switch and abort all fail closed', async t => {
  for (const kind of ['hidden', 'workspace', 'heartbeat', 'turn', 'abort']) {
    let current = { ...scope }, clock = 100, active = true
    const f = await fixture({ contextOf: async () => current, now: () => clock, heartbeatMs: 50 }); t.after(() => f.broker.dispose())
    const abort = new AbortController()
    const pending = f.action({ action: 'observe' }, { signal: abort.signal, assertCurrent: () => { if (!active) throw new Error('Ended') } })
    const rejection = assert.rejects(pending); await new Promise<any>(resolve => setImmediate(resolve))
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
  await new Promise<any>(resolve => setImmediate(resolve)); await f.broker.poll(f.auth); await rejection
  assert.equal((await f.broker.poll(f.auth)).command, null)
  await assert.rejects(f.action(), { code: 'BROWSER_GRANT' })
})
test('close and replacement destroy the old capability; a grant is bound to a single turn', async t => {
  const f = await fixture(); t.after(() => f.broker.dispose())
  const pending = f.action(); await new Promise<any>(resolve => setImmediate(resolve)); const d = await f.broker.poll(f.auth)
  await f.broker.acknowledge({ ...f.auth, commandId: d.command!.id, grantRevision: f.grant.grantRevision, epoch: 1, result: {} }); await pending
  await assert.rejects(f.action({ action: 'observe' }, { runId: 'run-b' }), { code: 'BROWSER_RUN' })
  await f.broker.register({ sessionId: scope.sessionId, clientTabId: 'ui-a' })
  await assert.rejects(f.broker.poll(f.auth), { code: 'BROWSER_CLOSED' })
})

test('idle grant authorizes exactly the next turn; an unused active grant cannot be claimed by a later run', async t => {
  let turn: BrowserTurn = { runId: null, turn: 0 }
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
  const pending = f.action({ action: 'click', target: 'e1:s1:n1' }); const rejection = assert.rejects(pending, { code: 'BROWSER_REVOKED' }); await new Promise<any>(resolve => setImmediate(resolve))
  const delivery = await f.broker.poll(f.auth)
  const request = { ...f.auth, commandId: delivery.command!.id, epoch: 1, grantRevision: f.grant.grantRevision }
  assert.equal((await f.broker.confirm(request)).allowed, true)
  f.broker.revoke(f.auth); await rejection
  await assert.rejects(f.broker.confirm(request), { code: 'BROWSER_STALE' })
})

test('native grant is claimed by exactly one genuine parent and terminal run abort revokes a settled grant', async t => {
  const f = await fixture(); t.after(() => f.broker.dispose())
  const parent = Symbol('native-a'), other = Symbol('native-b'), abort = new AbortController()
  const ownership = createBrowserOwnership({ onClose: token => f.broker.revokeOwner(token) }); t.after(() => ownership.dispose())
  ownership.bind(parent, { runtime: 'opencode', nativeRunId: 'native-a', signal: abort.signal })
  assert.equal((await f.broker.list(scope, { ownerToken: parent })).tabs.length, 1)
  assert.deepEqual((await f.broker.list(scope, { ownerToken: other })).tabs, [])
  assert.deepEqual((await f.broker.list(scope)).tabs, [])
  await assert.rejects(f.action({ action: 'observe' }, { ownerToken: other }), { code: 'BROWSER_OWNER' })
  const pending = f.action({ action: 'observe' }, { ownerToken: parent }); await new Promise<any>(resolve => setImmediate(resolve))
  const delivery = await f.broker.poll(f.auth)
  await f.broker.acknowledge({ ...f.auth, commandId: delivery.command!.id, epoch: 1, grantRevision: f.grant.grantRevision, result: {} }); await pending
  abort.abort()
  const status = await f.broker.poll(f.auth)
  assert.equal(status.granted, false); assert.equal(status.status, 'native-run-ended')
  assert.deepEqual((await f.broker.list(scope, { ownerToken: parent })).tabs, [])
})

test('native owner ending during an awaited metadata lookup cannot claim or disclose a grant', async t => {
  let release: ((value?: unknown) => void) | undefined, waiting = false
  const f = await fixture({ contextOf: async id => { if (waiting) await new Promise<any>(resolve => { release = resolve }); return { ...scope, sessionId: id } } }); t.after(() => f.broker.dispose())
  const ownerToken = Symbol('native'), abort = new AbortController()
  waiting = true
  const listing = f.broker.list(scope, { ownerToken, assertCurrent: () => abort.signal.throwIfAborted() })
  abort.abort(); waiting = false; release!()
  assert.deepEqual((await listing).tabs, [])
  assert.equal((await f.broker.list(scope)).tabs.length, 1)
})

test('grant made during a finishing setup turn cannot silently authorize the following turn', async t => {
  let boundary = { runId: 'setup', turn: 1 }
  const traces: BrowserTraceEvent[] = []
  const f = await fixture({ turnOf: () => boundary, onTrace: event => traces.push(event) }); t.after(() => f.broker.dispose())
  boundary = { runId: 'next', turn: 2 }
  assert.deepEqual((await f.broker.list(scope)).tabs, [])
  const stopped = await f.broker.poll(f.auth)
  assert.equal(stopped.granted, false); assert.equal(stopped.status, 'turn-ended')
  assert.deepEqual(traces.find(event => event.event === 'grant'), { event: 'grant', reason: null, tabId: f.tab.tabId, sessionId: scope.sessionId, expectedTurn: 1, currentTurn: 1, runId: 'setup', expectedRunId: 'setup', currentRunId: 'setup', epoch: 1, grantRevision: 1 })
  const failure = traces.find(event => event.event === 'verify-failure')!
  assert.equal(failure.expectedTurn, 1); assert.equal(failure.currentTurn, 2); assert.equal(failure.expectedRunId, 'setup'); assert.equal(failure.currentRunId, 'next')
  assert.doesNotMatch(JSON.stringify(traces), /token=secret|private|example.test|Fixture|capability|profile-a|\/work\/a/)
  assert.equal(JSON.stringify(traces).includes(f.auth.capability), false)
  await f.broker.grant({ ...f.auth, epoch: 1, grantRevision: stopped.grantRevision })
  assert.equal((await f.broker.list(scope)).tabs[0].granted, true)
})

test('sticky grants survive a turn boundary and an unrelated document change, while every other stop still revokes', async t => {
  const scope = { profile: 'profile-s', sessionId: 'session-s', workspace: '/work/s' }
  let turn = { runId: 'run-1', turn: 1 }
  const broker = createBrowserBroker({ profile: scope.profile, stickyGrants: true, turnOf: () => turn, contextOf: async id => ({ ...scope, sessionId: id }) })
  t.after(() => broker.dispose())
  const tab = await broker.register({ sessionId: scope.sessionId, clientTabId: 'ui-s' }), auth = { tabId: tab.tabId, capability: tab.capability }
  await broker.sync({ ...auth, epoch: 1, visible: true, url: 'https://example.test/' })
  const grant = await broker.grant({ ...auth, epoch: 1, grantRevision: 0 })
  const dispatch = (command: unknown, owner = { runId: turn.runId!, turnNumber: turn.turn }) => broker.execute(scope, { tabId: tab.tabId, epoch: 1, grantRevision: grant.grantRevision, command }, owner)
  const settle = async (promise: Promise<any>, epoch = 1) => {
    await new Promise<any>(resolve => setImmediate(resolve))
    const delivery = await broker.poll(auth)
    await broker.acknowledge({ ...auth, commandId: delivery.command!.id, epoch, grantRevision: grant.grantRevision, result: { status: 'input-sent' } })
    return await promise
  }
  // Turn 2 must not need another grant, and a new document must not revoke one either.
  turn = { runId: 'run-2', turn: 2 }
  assert.equal((await broker.list(scope)).tabs[0].granted, true)
  await settle(dispatch({ action: 'scroll', x: 0, y: 10 }))
  await broker.sync({ ...auth, epoch: 2, visible: true, url: 'https://example.test/next' })
  assert.equal((await broker.list(scope)).tabs[0].granted, true)
  // The user is still the authority: taking over ends the sticky grant immediately.
  broker.revoke(auth)
  await assert.rejects(dispatch({ action: 'scroll', x: 0, y: 10 }), { code: 'BROWSER_GRANT' })
})

test('sticky grants still abandon a command whose owning turn ended, without dropping the tab grant', async t => {
  const scope = { profile: 'profile-n', sessionId: 'session-n', workspace: '/work/n' }
  const broker = createBrowserBroker({ profile: scope.profile, stickyGrants: true, turnOf: () => ({ runId: 'run-a', turn: 1 }), contextOf: async id => ({ ...scope, sessionId: id }) })
  t.after(() => broker.dispose())
  const tab = await broker.register({ sessionId: scope.sessionId, clientTabId: 'ui-n' }), auth = { tabId: tab.tabId, capability: tab.capability }
  await broker.sync({ ...auth, epoch: 1, visible: true })
  const grant = await broker.grant({ ...auth, epoch: 1, grantRevision: 0 }), run = new AbortController()
  const pending = broker.execute(scope, { tabId: tab.tabId, epoch: 1, grantRevision: grant.grantRevision, command: { action: 'scroll', x: 0, y: 5 } }, { runId: 'run-a', turnNumber: 1, signal: run.signal })
  await new Promise<any>(resolve => setImmediate(resolve))
  run.abort()
  await assert.rejects(pending, { code: 'BROWSER_REVOKED' })
  assert.equal((await broker.list(scope)).tabs[0].granted, false)
})

test('automatic tab opening serves one bounded request per session and expires it', async t => {
  const scope = { profile: 'profile-o', sessionId: 'session-o', workspace: '/work/o' }
  let clock = 1_000
  const broker = createBrowserBroker({ profile: scope.profile, autoOpen: true, now: () => clock, turnOf: () => ({ runId: 'run-a', turn: 1 }), contextOf: async id => ({ ...scope, sessionId: id }) })
  t.after(() => broker.dispose())
  await broker.requestOpen({ sessionId: scope.sessionId, url: 'https://example.test/page?token=secret#frag' })
  const first = broker.takeOpen({ sessionId: scope.sessionId })
  assert.equal(first.url, 'https://example.test/page') // query and fragment never reach the renderer surface
  assert.equal(broker.takeOpen({ sessionId: scope.sessionId }).url, null)
  await broker.requestOpen({ sessionId: scope.sessionId, url: 'https://example.test/late' })
  clock += 20_000
  assert.equal(broker.takeOpen({ sessionId: scope.sessionId }).url, null)
})

test('automatic tab opening is off unless configured and never accepts a non-HTTP target', async t => {
  const scope = { profile: 'profile-p', sessionId: 'session-p', workspace: '/work/p' }
  const broker = createBrowserBroker({ profile: scope.profile, turnOf: () => ({ runId: 'run-a', turn: 1 }), contextOf: async id => ({ ...scope, sessionId: id }) })
  t.after(() => broker.dispose())
  await assert.rejects(broker.requestOpen({ sessionId: scope.sessionId, url: 'https://example.test/' }), { code: 'BROWSER_DISABLED' })
  assert.equal(broker.takeOpen({ sessionId: scope.sessionId }).url, null)
})

test('an undelivered command is rebound to the new document instead of being abandoned', async t => {
  const s = { profile: 'p', sessionId: 's', workspace: '/w' }
  const broker = createBrowserBroker({ profile: s.profile, stickyGrants: true, turnOf: () => ({ runId: 'r', turn: 1 }), contextOf: async id => ({ ...s, sessionId: id }) })
  t.after(() => broker.dispose())
  const tab = await broker.register({ sessionId: s.sessionId, clientTabId: 'ui' }), auth = { tabId: tab.tabId, capability: tab.capability }
  await broker.sync({ ...auth, epoch: 1, visible: true })
  const grant = await broker.grant({ ...auth, epoch: 1, grantRevision: 0 })
  const pending = broker.execute(s, { tabId: tab.tabId, epoch: 1, grantRevision: grant.grantRevision, command: { action: 'click', target: 'e1:s1:n0' } }, { runId: 'r', turnNumber: 1 })
  await new Promise<any>(resolve => setImmediate(resolve))
  // The page navigates before the renderer ever polls for this command.
  await broker.sync({ ...auth, epoch: 2, visible: true })
  const delivery = await broker.poll(auth)
  assert.equal(delivery.command?.action, 'click')
  assert.equal(delivery.command?.epoch, 2)
  await broker.acknowledge({ ...auth, commandId: delivery.command!.id, epoch: 2, grantRevision: grant.grantRevision, result: { status: 'input-sent' } })
  assert.equal((await pending).epoch, 2)
})

test('a delivered command still stops when the document changes under it', async t => {
  const s = { profile: 'p2', sessionId: 's2', workspace: '/w2' }
  const broker = createBrowserBroker({ profile: s.profile, stickyGrants: true, turnOf: () => ({ runId: 'r', turn: 1 }), contextOf: async id => ({ ...s, sessionId: id }) })
  t.after(() => broker.dispose())
  const tab = await broker.register({ sessionId: s.sessionId, clientTabId: 'ui' }), auth = { tabId: tab.tabId, capability: tab.capability }
  await broker.sync({ ...auth, epoch: 1, visible: true })
  const grant = await broker.grant({ ...auth, epoch: 1, grantRevision: 0 })
  const pending = broker.execute(s, { tabId: tab.tabId, epoch: 1, grantRevision: grant.grantRevision, command: { action: 'click', target: 'e1:s1:n0' } }, { runId: 'r', turnNumber: 1 })
  const rejected = assert.rejects(pending, { code: 'BROWSER_STALE' })
  await new Promise<any>(resolve => setImmediate(resolve))
  await broker.poll(auth) // delivered
  await broker.sync({ ...auth, epoch: 2, visible: true })
  await rejected
})

test('a background profile keeps a hidden tab controllable; the default profile still revokes it', async t => {
  const run = async (background: boolean) => {
    const s = { profile: `p-${background}`, sessionId: `s-${background}`, workspace: '/w' }
    const broker = createBrowserBroker({ profile: s.profile, stickyGrants: true, background, turnOf: () => ({ runId: 'r', turn: 1 }), contextOf: async id => ({ ...s, sessionId: id }) })
    const tab = await broker.register({ sessionId: s.sessionId, clientTabId: 'ui' }), auth = { tabId: tab.tabId, capability: tab.capability }
    await broker.sync({ ...auth, epoch: 1, visible: true })
    const grant = await broker.grant({ ...auth, epoch: 1, grantRevision: 0 })
    await broker.sync({ ...auth, epoch: 1, visible: false })
    const listed = (await broker.list(s)).tabs[0]
    if (!background) { assert.equal(listed.granted, false); broker.dispose(); return }
    assert.equal(listed.granted, true)
    const pending = broker.execute(s, { tabId: tab.tabId, epoch: 1, grantRevision: grant.grantRevision, command: { action: 'scroll', x: 0, y: 10 } }, { runId: 'r', turnNumber: 1 })
    await new Promise<any>(resolve => setImmediate(resolve))
    const delivery = await broker.poll(auth)
    await broker.acknowledge({ ...auth, commandId: delivery.command!.id, epoch: 1, grantRevision: grant.grantRevision, result: { status: 'input-sent' } })
    assert.equal((await pending).epoch, 1)
    broker.dispose()
  }
  await run(false)
  await run(true)
})
