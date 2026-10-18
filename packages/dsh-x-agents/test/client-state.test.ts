import test from 'node:test'
import assert from 'node:assert/strict'
import { createAgentsController } from '../src/client/controller.ts'
import { ACTIONS, CAPABILITIES, STATES, addressFor, canPrepare, eventDataPreview, insertRequest, parseAddress, prepareModels, prepareRun, presentationEvents, readSnapshot } from '../src/client/model.ts'

const tick = () => new Promise<any>(resolve => setTimeout(resolve, 0))
const caps = Object.fromEntries(CAPABILITIES.map(key => [key, true]))
const agent = (id: any, more: any = {}) => ({ id, label: id, transport: 'fixture', available: null, authenticated: null, version: null, reason: null, models: [{ id: `${id}-model`, label: `${id} model` }], capabilities: caps, ...more })
export const snapshot = (more: any = {}) => ({ scope: 'profile-a', sessionId: 'session-a', revision: 0, catalog: [agent('codex'), agent('opencode'), agent('claude', { available: false, reason: 'not-integrated' })], task: null, ...more })
const task = (more: any = {}) => ({ id: 'task-a', runId: 'run-a', revision: 2, title: 'Fix the test', runtime: 'codex', model: null, cwd: '/workspace/project', nativeSessionId: 'native-a', state: 'completed', events: [], summary: 'Turn ended', reason: null, allowedActions: ['request-start', 'request-continue', 'inspect'], updatedAt: '2026-10-17T07:00:00Z', ...more })

test('client snapshot validates identity, catalog, states and event sequence without inventing success', () => {
  assert.ok(readSnapshot(snapshot(), 'session-a'))
  for (const state of STATES) assert.ok(readSnapshot(snapshot({ task: task({ state, allowedActions: ACTIONS }) }), 'session-a'))
  assert.equal(readSnapshot(snapshot(), 'another-session'), null)
  for (const more of [{ scope: '' }, { revision: NaN }, { task: task({ state: 'passed' }) }, { task: task({ allowedActions: ['approve'] }) }, { task: task({ events: [{ seq: 2, type: 'assistant' }, { seq: 1, type: 'tool' }] }) }, { catalog: [agent('codex', { authenticated: 'yes' })] }, { catalog: [agent('codex'), agent('codex')] }] as const) assert.equal(readSnapshot(snapshot(more), 'session-a'), null)
  const address = addressFor('scope / # 中文', 'session / ?')
  assert.deepEqual(parseAddress(address), { scope: 'scope / # 中文', sessionId: 'session / ?' })
  for (const invalid of ['https://dsh-x-agents/a/b', 'dsh-resource://dsh-x-agents/a/b?x=1', 'dsh-resource://dsh-x-agents/a/b/c', 'dsh-resource://dsh-x-agents/%/b'] as const) assert.equal(parseAddress(invalid), null)
})

test('prepared requests bind exact scope, task revision, runtime and a real model; draft insertion preserves selection', () => {
  const value = snapshot({ task: task({ model: 'codex-model' }) })
  assert.ok(canPrepare(value.catalog[0]))
  assert.equal(canPrepare(value.catalog[2]), false)
  assert.deepEqual(prepareRun(value, { runtime: 'codex', model: 'codex-model', prompt: '  Fix the test  ', continueTask: true }), { runtime: 'codex', model: 'codex-model', prompt: 'Fix the test', scope: 'profile-a', taskId: 'task-a', expectedRevision: 2 })
  assert.deepEqual(prepareRun(snapshot(), { runtime: 'opencode', prompt: 'Explain the code' }), { runtime: 'opencode', prompt: 'Explain the code', scope: 'profile-a' })
  for (const options of [{ runtime: 'codex', prompt: '' }, { runtime: 'codex', model: 'opencode-model', prompt: 'x' }, { runtime: 'opencode', prompt: 'x', continueTask: true }, { runtime: 'claude', prompt: 'x' }] as const) assert.throws(() => prepareRun(value, options))
  assert.throws(() => prepareRun(snapshot({ task: task({ state: 'running', allowedActions: ['cancel'] }) }), { runtime: 'codex', prompt: 'x' }))
  let inserted: any, persisted = 0
  const actions: any = { captureInsertion: () => ({ start: 2, end: 9, draftRev: 4 }), insertText: (text: any, span: any) => { inserted = { text, span }; return true }, persistDraft: () => persisted++, setDraft: () => assert.fail('must not replace draft'), submit: () => assert.fail('must not send') }
  assert.equal(insertRequest(actions, 'request'), true)
  assert.deepEqual(inserted, { text: '\n\nrequest\n', span: { start: 9, end: 9, draftRev: 4 } })
  assert.equal(persisted, 1)
  assert.equal(insertRequest({ ...actions, insertText: () => false }, 'request'), false)
  assert.equal(persisted, 1)
  assert.equal(insertRequest({ ...actions, persistDraft() { throw new Error('save unavailable') } }, 'request'), true)
})

test('all four runtimes require catalog capability and availability, while unverified authentication never becomes a success claim', () => {
  for (const runtime of ['codex', 'opencode', 'claude', 'grok'] as const) {
    const selected = agent(runtime, { available: true, authenticated: null, reason: 'authentication-not-verified', providerAuthentication: 'unverified' })
    const value = snapshot({ catalog: [selected] })
    assert.ok(readSnapshot(value, 'session-a'))
    assert.equal(canPrepare(selected), true)
    assert.deepEqual(prepareRun(value, { runtime, model: `${runtime}-model`, prompt: 'Review the code' }), { runtime, model: `${runtime}-model`, prompt: 'Review the code', scope: 'profile-a' })
    assert.equal(selected.authenticated, null)
    assert.equal(selected.providerAuthentication, 'unverified')
    assert.equal(canPrepare({ ...selected, authenticated: false }), true, 'preparing a request is not a model call or authentication grant')
    assert.equal(canPrepare({ ...selected, available: null }), true, 'declared capability can prepare an unverified request')
    for (const unavailable of [
      { ...selected, available: false, reason: 'not-configured' },
      { ...selected, available: false, reason: 'not-installed' },
      { ...selected, capabilities: { ...caps, nativeSessions: false } },
      { ...selected, capabilities: {} },
      { ...selected, reason: 'not-integrated' },
    ] as const) {
      assert.equal(canPrepare(unavailable), false)
      assert.throws(() => prepareRun(snapshot({ catalog: [unavailable] }), { runtime, prompt: 'Review the code' }), /runtime-unavailable/)
    }
    const resumed = snapshot({ catalog: [selected], task: task({ runtime, model: `${runtime}-model` }) })
    assert.deepEqual(prepareRun(resumed, { runtime, model: `${runtime}-model`, prompt: 'Continue', continueTask: true }), { runtime, model: `${runtime}-model`, prompt: 'Continue', scope: 'profile-a', taskId: 'task-a', expectedRevision: 2 })
    assert.throws(() => prepareRun({ ...resumed, catalog: [{ ...selected, capabilities: { ...caps, resume: false } }] }, { runtime, model: `${runtime}-model`, prompt: 'Continue', continueTask: true }), /action-unavailable/)
  }
  assert.equal(canPrepare(agent('unknown-runtime')), false)
  assert.equal(canPrepare(null), false)
})

test('model catalog schema supports old snapshots and separate guarded preparation without creating or replacing a task', () => {
  const metadata: any = { status: 'fresh', fetchedAt: '2026-10-17T08:00:00Z', expiresAt: '2026-10-17T08:05:00Z', source: 'native-protocol', truncated: false, accessVerified: false }
  assert.ok(readSnapshot(snapshot(), 'session-a'))
  for (const status of ['not-loaded', 'fresh', 'stale', 'failed'] as const) assert.ok(readSnapshot(snapshot({ catalog: [agent('claude', { modelCatalog: { ...metadata, status } })] }), 'session-a'))
  for (const bad of [{ status: 'ready' }, { fetchedAt: 'not-a-date' }, { expiresAt: 123 }, { truncated: 'yes' }, { source: {} }, { accessVerified: 'yes' }] as const) assert.equal(readSnapshot(snapshot({ catalog: [agent('claude', { modelCatalog: { ...metadata, ...bad } })] }), 'session-a'), null)
  for (const runtime of ['codex', 'opencode', 'claude', 'grok'] as const) {
    const existing = snapshot({ catalog: [agent(runtime, { capabilities: { ...caps, models: false }, modelCatalog: { ...metadata, status: 'not-loaded', fetchedAt: null, expiresAt: null } })], task: task() })
    const before = structuredClone(existing)
    assert.deepEqual(prepareModels(existing, runtime), { runtime, scope: 'profile-a' })
    assert.deepEqual(existing, before)
    for (const state of ['waiting_permission', 'discovering', 'blocked'] as const) {
      const busy: any = { ...existing, operation: { kind: 'models', runtime, state, reason: state === 'blocked' ? 'Cleanup not confirmed' : undefined } }
      assert.ok(readSnapshot(busy, 'session-a'))
      assert.throws(() => prepareModels(busy, runtime), /action-unavailable/)
      assert.throws(() => prepareRun(busy, { runtime, prompt: 'Do work' }), /action-unavailable/)
    }
    assert.throws(() => prepareModels({ ...existing, task: task({ state: 'running', allowedActions: ['cancel'] }) }, runtime), /action-unavailable/)
    assert.throws(() => prepareModels({ ...existing, task: task({ state: 'interrupted', allowedActions: ['inspect'] }) }, runtime), /action-unavailable/)
    assert.deepEqual(prepareModels({ ...existing, task: null }, runtime), { runtime, scope: 'profile-a' })
  }
  assert.equal(readSnapshot(snapshot({ operation: { kind: 'models', runtime: 'codex', state: 'completed' } }), 'session-a'), null)
  assert.equal(readSnapshot(snapshot({ operation: { kind: 'models', runtime: 'unknown', state: 'discovering' } }), 'session-a'), null)
})

test('session reads abort on unmount and reset discards late old-profile replies', async () => {
  const calls: any = []
  const controller = createAgentsController({ call(channel: any, endpoint: any, payload: any, signal: any) { return new Promise<any>(resolve => calls.push({ channel, endpoint, payload, signal, resolve })) } }, { pollMs: 100000, timeoutMs: 100000 })
  const source = controller.source('session-a'), unlisten = source.subscribe(() => {})
  try {
    assert.equal(calls.length, 1)
    controller.reset()
    assert.ok(calls[0].signal.aborted)
    assert.equal(source.getSnapshot().snapshot, null)
    await tick()
    assert.equal(calls.length, 2)
    calls[0].resolve({ ok: true, value: snapshot() }); await tick()
    assert.equal(source.getSnapshot().snapshot, null)
    calls[1].resolve({ ok: true, value: snapshot({ scope: 'profile-b' }) }); await tick()
    assert.equal(source.getSnapshot().snapshot.scope, 'profile-b')
    controller.refresh('session-a')
    assert.equal(calls.length, 3)
    unlisten()
    assert.ok(calls[2].signal.aborted)
    calls[2].resolve({ ok: true, value: snapshot() }); await tick()
    assert.equal(source.getSnapshot().snapshot, null)
  } finally { unlisten(); controller.dispose() }
})

test('cancel is exact-scope/run guarded, never grants permission and does not retry an uncertain write', async () => {
  let value = snapshot({ revision: 3, task: task({ state: 'waiting_permission', allowedActions: ['cancel'] }) }), cancelCount = 0
  const controller = createAgentsController({ async call(channel: any, endpoint: any, payload: any) {
    assert.equal(channel, '/api')
    if (endpoint === 'agents/snapshot') return { ok: true, value }
    assert.equal(endpoint, 'agents/cancel'); cancelCount++
    assert.deepEqual(payload, { scope: 'profile-a', sessionId: 'session-a', taskId: 'task-a', runId: 'run-a' })
    throw new Error('connection lost after sending')
  } }, { pollMs: 100000 })
  const source = controller.source('session-a'), unlisten = source.subscribe(() => {})
  try {
    await tick()
    const target: any = { scope: 'profile-a', taskId: 'task-a', runId: 'run-a' }
    assert.equal((await controller.cancel('session-a', { ...target, scope: 'profile-b' })).ok, false)
    assert.equal((await controller.cancel('session-a', { ...target, runId: 'old-run' })).ok, false)
    assert.equal(cancelCount, 0)
    assert.equal((await controller.cancel('session-a', target)).ok, false)
    await tick()
    assert.equal(cancelCount, 1)
    assert.equal(source.getSnapshot().snapshot.task.state, 'waiting_permission')
    assert.equal(source.getSnapshot().pending, false)
  } finally { unlisten(); controller.dispose() }
})

test('assistant chunks merge only with explicit message identity and delta semantics', () => {
  const events = [
    { seq: 1, type: 'assistant', text: 'Hello ', data: { messageId: 'm1', delta: true } },
    { seq: 2, type: 'assistant', text: 'world', data: { messageId: 'm1', delta: true } },
    { seq: 3, type: 'tool', text: 'Read a file' },
    { seq: 4, type: 'assistant', text: 'Hello world!', data: { messageId: 'm1', delta: false } },
    { seq: 5, type: 'assistant', text: 'Unknown semantics', data: { messageId: 'm2' } },
    { seq: 6, type: 'assistant', text: 'Unknown identity', data: { delta: true } },
    { seq: 7, type: 'assistant', text: 'First OpenCode part', data: { nativeSessionId: 'n2', messageId: 'm3', partId: 'p1', delta: false } },
    { seq: 8, type: 'assistant', text: 'Second OpenCode part', data: { nativeSessionId: 'n2', messageId: 'm3', partId: 'p2', delta: false } },
    { seq: 9, type: 'assistant', text: 'First OpenCode part updated', data: { nativeSessionId: 'n2', messageId: 'm3', partId: 'p1', delta: false } },
  ]
  const rows = presentationEvents(events)
  assert.deepEqual(rows.map(row => row.text), ['Hello world!', 'Read a file', 'Unknown semantics', 'Unknown identity', 'First OpenCode part updated', 'Second OpenCode part'])
  assert.equal(events[0].text, 'Hello ')
})

test('structured event previews are bounded and never duplicate permission scopes or question answer fields', () => {
  for (const type of ['tool', 'plan', 'usage', 'session', 'status', 'diagnostic'] as const) {
    const data = eventDataPreview({ type, data: { name: 'native-event', input_tokens: 12 } })
    assert.deepEqual(JSON.parse((data)!.body), { name: 'native-event', input_tokens: 12 })
    assert.equal((data)!.truncated, false)
  }
  for (const type of ['permission', 'input', 'assistant'] as const) assert.equal(eventDataPreview({ type, data: { details: 'private scope', answers: 'private answer' } }), null)
  assert.equal(eventDataPreview({ type: 'tool', data: { name: 'AskUserQuestion', output: 'private answer' } }), null)
  const filtered = eventDataPreview({ type: 'tool', data: { answers: ['private answer'], nested: { custom: 'free-form answer', apiKey: 'private key' }, output: 'Bearer abcdefghijklmnop' } })
  assert.doesNotMatch((filtered)!.body, /private answer|free-form answer|private key|abcdefghijklmnop/)
  const long = eventDataPreview({ type: 'tool', data: { output: 'x'.repeat(13000) } })
  assert.equal((long)!.body.length, 12000)
  assert.equal((long)!.truncated, true)
  const cyclic: any = {}; (cyclic as any).self = cyclic
  assert.equal(eventDataPreview({ type: 'tool', data: cyclic }), null)
})

test('resource cannot reveal another profile and releases its owned polling', async () => {
  let value = snapshot()
  const controller = createAgentsController({ async call() { return { ok: true, value } } }, { pollMs: 100000 })
  const abort = new AbortController(), stream = controller.resource.open(addressFor('profile-a', 'session-a'), { signal: abort.signal })
  try {
    await stream.next(); await tick()
    const live = await stream.next()
    assert.equal((live.value as any).value.snapshot.scope, 'profile-a')
    controller.reset(); value = snapshot({ scope: 'profile-b' })
    const loading = await stream.next()
    assert.equal((loading.value as any).value.snapshot, null)
    await tick()
    const changed = await stream.next()
    assert.equal((changed.value as any).value.status, 'scope-changed')
    assert.equal((changed.value as any).value.snapshot, null)
    abort.abort()
    assert.equal((await stream.next()).done, true)
  } finally { abort.abort(); await stream.return(); controller.dispose() }
})
