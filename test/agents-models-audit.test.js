// Independent model-directory regressions. Native drivers are synthetic;
// the integration cases use the real installed DSH ToolRuntime and approval.
// No vendor account, private credential, network request or model turn is used.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SubprocessLocal from '@deepseek-ai/dsh-subprocess-local'
import Approval from '@deepseek-ai/dsh-user-approval'
import * as agents from '../packages/dsh-x-agents/index.js'
import * as plan from '../packages/dsh-x-plan/index.js'
import { createTaskStore } from '../packages/dsh-x-agents/src/store.js'
import { createAgentsController } from '../packages/dsh-x-agents/src/controller.js'
import { readSnapshot } from '../packages/dsh-x-agents/src/client/model.js'
import { sessionPlansDir, writeNewPlan, prepareApproval, approvePlan, discardPlan } from '../packages/dsh-x-plan/src/store.js'

const sessionId = 'models-audit-session'
const tick = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const cleanupFailure = () => Object.assign(new Error('Synthetic model initializer cleanup is unconfirmed'), { code: 'AGENTS_CLEANUP_UNCONFIRMED' })
const catalog = (extra = {}) => ({ available: true, authenticated: null, version: 'fixture-1', models: [{ id: 'fixture-model', label: 'Fixture model' }], ...extra })

function fixture(t, options = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'agents-models-audit-'))
  const store = createTaskStore(dir), abort = new AbortController(), approvals = [], factories = [], probes = [], discoveries = []
  let cwd = dir, policy = { mode: 'workspace-write', workspaceRoot: dir }, time = 1_800_000_000_000
  const driver = {
    backendIdentity: 'synthetic-models-backend-a', capabilities: { nativeSessions: true, models: true },
    discover: async request => { discoveries.push(request); return options.discover ? options.discover(request) : catalog({ models: [], authentication: { state: 'requires-native-initialization', source: 'version-only' } }) },
    discoverModels: async request => { probes.push(request); return options.probe ? options.probe(request) : catalog() },
    run: async () => { throw new Error('No model turn belongs in this fixture') },
  }
  const exec = { agent: { session: { id: sessionId } }, signal: abort.signal }
  const controller = createAgentsController({ store,
    adapter: async (runtime, request) => { factories.push(runtime); return options.factory ? options.factory(runtime, request, driver) : driver },
    cwdOf: async request => options.cwdOf ? options.cwdOf(request, cwd) : cwd,
    policyOf: () => policy, now: () => time, modelTtlMs: 5000,
    approve: async (...args) => { approvals.push(args); return options.approve ? options.approve(...args) : 'allowed-once' },
  })
  t.after(async () => { await controller.dispose(); rmSync(dir, { recursive: true, force: true }) })
  return { dir, store, controller, driver, exec, abort, approvals, factories, probes, discoveries,
    args: { runtime: 'claude', scope: store.scope },
    setCwd: value => { cwd = value }, setPolicy: value => { policy = value }, advance: value => { time += value },
  }
}

function seedCompleted(h) {
  const claimed = h.store.claim(sessionId, { runtime: 'codex', prompt: 'Prior synthetic task', cwd: h.dir })
  h.store.event(sessionId, claimed.task.id, claimed.task.runId, { type: 'session', data: { nativeSessionId: 'prior-native-session' } })
  h.store.state(sessionId, claimed.task.id, claimed.task.runId, 'completed', { summary: 'Preserve this result' })
  h.store.release(sessionId, claimed.task.id, claimed.task.runId)
  const file = readdirSync(h.store.root).find(name => name !== 'scope.json' && name.endsWith('.json'))
  return { filename: path.join(h.store.root, file), bytes: readFileSync(path.join(h.store.root, file), 'utf8') }
}

test('models audit: successful preparation leaves an empty task store empty', async t => {
  const h = fixture(t), before = h.store.read(sessionId)
  const result = await h.controller.models(h.args, h.exec)
  assert.equal(result.modelRuntime, 'claude')
  assert.equal(result.task, null)
  assert.deepEqual(h.store.read(sessionId), before)
  assert.deepEqual(readdirSync(h.store.root), ['scope.json'])
  assert.equal(h.probes.length, 1)
  assert.equal(h.discoveries.length, 0)
  assert.ok(h.factories.every(id => id === 'claude'))
  assert.equal('prompt' in h.probes[0], false)
  assert.equal('nativeSessionId' in h.probes[0], false)
  assert.equal(result.catalog.find(item => item.id === 'claude').modelCatalog.accessVerified, false)
})

test('models audit: success and rejection preserve the exact existing task bytes', async t => {
  for (const outcome of ['allowed-once', 'rejected']) {
    const h = fixture(t, { approve: async () => outcome }), before = seedCompleted(h)
    if (outcome === 'allowed-once') await h.controller.models(h.args, h.exec)
    else await assert.rejects(() => h.controller.models(h.args, h.exec), { code: 'AGENTS_APPROVAL' })
    assert.equal(readFileSync(before.filename, 'utf8'), before.bytes)
    assert.equal(h.store.hasLock(sessionId), false)
    assert.equal(h.probes.length, outcome === 'allowed-once' ? 1 : 0)
  }
})

test('models audit: foreign profile and unsupported runtime never acquire or dispatch', async t => {
  const h = fixture(t)
  for (const args of [{ runtime: 'claude', scope: 'other-profile' }, { runtime: 'unknown', scope: h.store.scope }]) {
    await assert.rejects(() => h.controller.models(args, h.exec), { code: 'AGENTS_STALE' })
  }
  assert.equal(h.factories.length, 0)
  assert.equal(h.approvals.length, 0)
  assert.equal(h.store.hasLock(sessionId), false)
})

test('models audit: restricted host mode cannot initialize the external OpenCode service', async t => {
  const h = fixture(t)
  await assert.rejects(() => h.controller.models({ ...h.args, runtime: 'opencode' }, h.exec), { code: 'AGENTS_SANDBOX' })
  assert.equal(h.approvals.length, 0)
  assert.equal(h.probes.length, 0)
  assert.equal(h.store.hasLock(sessionId), false)
})

test('models audit: mutating caller arguments cannot change the approved runtime', async t => {
  let h
  h = fixture(t, { approve: async () => { h.args.runtime = 'grok'; h.args.scope = 'foreign'; return 'allowed-once' } })
  const result = await h.controller.models(h.args, h.exec)
  assert.equal(result.modelRuntime, 'claude')
  assert.ok(h.factories.every(id => id === 'claude'))
  assert.match(h.approvals[0][1].title, /claude/)
})

for (const change of ['cwd', 'policy', 'backend']) {
  test(`models audit: ${change} drift during approval prevents native initialization`, async t => {
    let h
    h = fixture(t, { approve: async () => {
      if (change === 'cwd') { const other = path.join(h.dir, 'other'); mkdirSync(other); h.setCwd(other) }
      if (change === 'policy') h.setPolicy({ mode: 'read-only', workspaceRoot: h.dir })
      if (change === 'backend') h.driver.backendIdentity = 'synthetic-models-backend-b'
      return 'allowed-once'
    } })
    await assert.rejects(() => h.controller.models(h.args, h.exec), { code: 'AGENTS_BINDING' })
    assert.equal(h.probes.length, 0)
    assert.equal(h.store.hasLock(sessionId), false)
  })
}

test('models audit: admission and persistent fence precede asynchronous directory lookup', async t => {
  const entered = deferred(), release = deferred()
  let reads = 0
  const h = fixture(t, { cwdOf: async (_exec, cwd) => { if (++reads === 1) { entered.resolve(); await release.promise } return cwd } })
  const pending = h.controller.models(h.args, h.exec)
  try {
    await entered.promise
    assert.equal(h.store.hasLock(sessionId), true)
    assert.equal(h.controller.isRunning(sessionId), true)
    assert.equal(h.controller.snapshot(sessionId).operation.state, 'waiting_permission')
    await assert.rejects(() => h.controller.models(h.args, h.exec), { code: 'AGENTS_BUSY' })
    await assert.rejects(() => h.controller.run({ runtime: 'grok', prompt: 'Should not start' }, h.exec), { code: 'AGENTS_BUSY' })
    await h.controller.inspect(h.exec)
    assert.equal(h.factories.length, 0)
    const otherHost = createTaskStore(h.dir)
    assert.throws(() => otherHost.claimOperation(sessionId, 'grok'), { code: 'AGENTS_BUSY' })
  } finally { release.resolve(); await pending }
})

test('models audit: cancellation defeats a late affirmative approval', async t => {
  const entered = deferred(), release = deferred()
  const h = fixture(t, { approve: async () => { entered.resolve(); await release.promise; return 'allowed-once' } })
  const pending = h.controller.models(h.args, h.exec)
  const rejected = assert.rejects(pending)
  try { await entered.promise; h.abort.abort(); await tick(); assert.equal(h.probes.length, 0) }
  finally { release.resolve(); await rejected }
  assert.equal(h.probes.length, 0)
  assert.equal(h.store.hasLock(sessionId), false)
})

test('models audit: disposal awaits model initialization cleanup before releasing ownership', async t => {
  const entered = deferred(), release = deferred()
  let signal, disposed = false
  const h = fixture(t, { probe: async request => { signal = request.signal; entered.resolve(); await release.promise; return catalog() } })
  const pending = h.controller.models(h.args, h.exec), rejected = assert.rejects(pending)
  await entered.promise
  const disposal = h.controller.dispose().then(() => { disposed = true })
  try {
    await tick()
    assert.equal(signal.aborted, true)
    assert.equal(disposed, false)
    assert.equal(h.store.hasLock(sessionId), true)
    assert.equal(h.controller.snapshot(sessionId).operation.state, 'discovering')
  } finally { release.resolve(); await Promise.all([rejected, disposal]) }
  assert.equal(h.store.hasLock(sessionId), false)
  assert.equal(h.controller.snapshot(sessionId).operation, null)
})

test('models audit: changed backend after discovery cannot publish the returned catalog', async t => {
  let h
  h = fixture(t, { probe: async () => { h.driver.backendIdentity = 'synthetic-models-backend-b'; return catalog() } })
  await assert.rejects(() => h.controller.models(h.args, h.exec), { code: 'AGENTS_BINDING' })
  const item = h.controller.snapshot(sessionId).catalog.find(item => item.id === 'claude')
  assert.deepEqual(item.models, [])
  assert.equal(item.modelCatalog.status, 'failed')
})

test('models audit: cancellation during the final asynchronous binding check prevents publication', async t => {
  const entered = deferred(), release = deferred()
  let reads = 0
  const h = fixture(t, { cwdOf: async (_exec, cwd) => { if (++reads === 3) { entered.resolve(); await release.promise } return cwd } })
  const pending = h.controller.models(h.args, h.exec)
  await entered.promise
  h.abort.abort()
  release.resolve()
  await assert.rejects(pending)
  assert.equal(h.controller.snapshot(sessionId).catalog.find(item => item.id === 'claude').modelCatalog.status, 'failed')
  assert.equal(h.store.hasLock(sessionId), false)
})

for (const stage of [1, 2]) {
  test(`models audit: cancellation during binding stage ${stage} cannot dispatch initialization`, async t => {
    const entered = deferred(), release = deferred()
    let reads = 0
    const h = fixture(t, { cwdOf: async (_exec, cwd) => { if (++reads === stage) { entered.resolve(); await release.promise } return cwd } })
    const pending = h.controller.models(h.args, h.exec)
    await entered.promise
    h.abort.abort()
    release.resolve()
    await assert.rejects(pending)
    assert.equal(h.approvals.length, stage === 1 ? 0 : 1)
    assert.equal(h.probes.length, 0)
    assert.equal(h.store.hasLock(sessionId), false)
  })
}

test('models audit: unknown cleanup preserves existing task and blocks a replacement host', async t => {
  const h = fixture(t, { probe: async () => { throw cleanupFailure() } }), before = seedCompleted(h)
  await assert.rejects(() => h.controller.models(h.args, h.exec), { code: 'AGENTS_CLEANUP_UNCONFIRMED' })
  assert.equal(readFileSync(before.filename, 'utf8'), before.bytes)
  assert.equal(h.store.hasLock(sessionId), true)
  const replacement = createTaskStore(h.dir)
  assert.throws(() => replacement.claimOperation(sessionId, 'grok'), { code: 'AGENTS_BUSY' })
  assert.throws(() => replacement.claim(sessionId, { runtime: 'grok', prompt: 'No replay', cwd: h.dir }), { code: 'AGENTS_BUSY' })
  assert.deepEqual(h.controller.snapshot(sessionId).task.allowedActions, ['inspect'])
})

test('models audit: a retained operation is visible after restart even with no task', async t => {
  const h = fixture(t, { probe: async () => { throw cleanupFailure() } })
  await assert.rejects(() => h.controller.models(h.args, h.exec), { code: 'AGENTS_CLEANUP_UNCONFIRMED' })
  const store = createTaskStore(h.dir)
  const replacement = createAgentsController({ store,
    adapter: async () => { throw new Error('Restarted inspection must not dispatch') },
    cwdOf: async () => h.dir, policyOf: () => ({ mode: 'workspace-write', workspaceRoot: h.dir }),
  })
  const snapshot = await replacement.inspect(h.exec)
  assert.equal(snapshot.task, null)
  assert.equal(snapshot.revision, 0)
  assert.equal(snapshot.operation.kind, 'models')
  assert.equal(snapshot.operation.runtime, 'claude')
  assert.equal(snapshot.operation.state, 'blocked')
  assert.match(snapshot.operation.reason, /verify|stopped|recovery/i)
  assert.ok(readSnapshot(snapshot, sessionId), 'Durable blocked-operation snapshot must remain readable by the workbench')
  assert.equal(store.hasLock(sessionId), true)
  await replacement.dispose()
})

test('models audit: only the exact operation owner can release its durable fence', async t => {
  const h = fixture(t), id = h.store.claimOperation(sessionId, 'claude'), other = createTaskStore(h.dir)
  assert.throws(() => h.store.releaseOperation(sessionId, 'wrong-operation'), { code: 'AGENTS_BUSY' })
  assert.throws(() => other.releaseOperation(sessionId, id), { code: 'AGENTS_BUSY' })
  assert.equal(h.store.hasLock(sessionId), true)
  h.store.releaseOperation(sessionId, id)
  assert.equal(h.store.hasLock(sessionId), false)
})

test('models audit: source catalog failure cannot be promoted to fresh successful evidence', async t => {
  const h = fixture(t, { probe: async () => catalog({ models: [], modelCatalog: { status: 'failed', source: 'native-discovery', error: 'Synthetic pagination failed' } }) })
  await assert.rejects(() => h.controller.models({ ...h.args, runtime: 'codex' }, h.exec))
  assert.equal(h.controller.snapshot(sessionId).catalog.find(item => item.id === 'codex').modelCatalog.status, 'failed')
  assert.equal(h.store.hasLock(sessionId), false)
})

test('models audit: cached models expire visibly and do not survive backend changes', async t => {
  const h = fixture(t)
  await h.controller.models(h.args, h.exec)
  h.advance(5001)
  assert.equal(h.controller.snapshot(sessionId).catalog.find(item => item.id === 'claude').modelCatalog.status, 'stale')
  await h.controller.inspect(h.exec)
  assert.equal(h.controller.snapshot(sessionId).catalog.find(item => item.id === 'claude').models[0].id, 'fixture-model')
  h.driver.backendIdentity = 'synthetic-models-backend-b'
  const refreshed = await h.controller.inspect(h.exec)
  assert.deepEqual(refreshed.catalog.find(item => item.id === 'claude').models, [])
})

test('models audit: catalog size is bounded and raw credential-shaped labels are withheld', async t => {
  const h = fixture(t, { probe: async () => catalog({ models: Array.from({ length: 2100 }, (_, index) => ({ id: `fixture-${index}`, label: index === 0 ? 'password=synthetic-secret-value' : `Model ${index}` })) }) })
  const result = await h.controller.models(h.args, h.exec), item = result.catalog.find(item => item.id === 'claude')
  assert.equal(item.models.length, 2000)
  assert.equal(item.modelCatalog.truncated, true)
  assert.doesNotMatch(JSON.stringify(result), /synthetic-secret-value/)
})

async function officialFixture(t, { opened = true, policy = 'ask', probe, write } = {}) {
  const ctx = new Context(), dir = mkdtempSync(path.join(tmpdir(), 'agents-models-official-audit-'))
  const events = opened ? [{ type: 'turn/start', data: {} }] : [], probes = [], writes = []
  const session = { id: sessionId, get seq() { return events.length }, eventAt: index => events[index], append: (type, data) => events.push({ type, data }) }
  const agent = { id: session.id, session }
  await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(SubprocessLocal); await ctx.plugin(Approval, { policy })
  ctx.on('approval/request', async () => 'allowed-once')
  ctx.provide('profileContext', { dir })
  ctx.provide('workingDirectory', { ensure: async () => dir, get: () => dir })
  ctx.provide('sandboxPolicy', { resolve: () => ({ mode: 'workspace-write', workspaceRoot: dir, sessionId }) })
  const driver = { backendIdentity: 'synthetic-models-official', capabilities: { nativeSessions: true, models: true },
    discover: async () => catalog(), discoverModels: async request => { probes.push(request); return probe ? probe(request) : catalog() },
  }
  await ctx.plugin(agents, { adapters: Object.fromEntries(['codex', 'opencode', 'claude', 'grok'].map(id => [id, () => driver])) })
  ctx.tools.register(defineTool({ name: 'write', description: 'Synthetic write only', parameters: {},
    output: { schema: { type: 'object', properties: {}, additionalProperties: true }, render: () => [] },
    execute: async () => { writes.push(true); if (write) await write(); return {} },
  }))
  const store = createTaskStore(dir)
  const invoke = (name, args = {}, signal = new AbortController().signal) => ctx.tools.execute({ name, arguments: args, agent, signal, callId: crypto.randomUUID() })
  t.after(async () => { await ctx.fiber.dispose(); rmSync(dir, { recursive: true, force: true }) })
  return { ctx, dir, store, agent, events, probes, writes, invoke,
    prepare: () => invoke('dsh_x_agents_models', { runtime: 'claude', scope: store.scope }),
  }
}

test('models audit: official approval rejects a closed turn before native initialization', async t => {
  const h = await officialFixture(t, { opened: false }), result = await h.prepare()
  assert.equal(result.isError, true)
  assert.equal(h.probes.length, 0)
  assert.equal(h.events.length, 0)
  assert.equal(h.store.read(sessionId).task, null)
  assert.equal(h.store.hasLock(sessionId), false)
})

test('models audit: official never policy cannot be overridden by the approval listener', async t => {
  const h = await officialFixture(t, { policy: 'never' }), result = await h.prepare()
  assert.equal(result.isError, true)
  assert.equal(h.probes.length, 0)
  assert.equal(h.events.at(-1).data.outcome, 'rejected')
})

test('models audit: official model preparation records one approval and no task turn', async t => {
  const h = await officialFixture(t), result = await h.prepare()
  assert.equal(result.isError, false, JSON.stringify(result))
  assert.equal(result.value.task, null)
  assert.equal(h.probes.length, 1)
  assert.deepEqual(h.events.map(event => event.type), ['turn/start', 'approval/asked', 'approval/decided'])
  assert.equal(h.events.at(-1).data.outcome, 'allowed-once')
  assert.equal(h.store.read(sessionId).revision, 0)
})

test('models audit: official preparation is fenced against preceding and concurrent writes', async t => {
  const writing = deferred(), finishWrite = deferred(), probing = deferred(), finishProbe = deferred()
  const h = await officialFixture(t, { write: async () => { writing.resolve(); await finishWrite.promise }, probe: async () => { probing.resolve(); await finishProbe.promise; return catalog() } })
  const write = h.invoke('write')
  try { await writing.promise; assert.equal((await h.prepare()).isError, true); assert.equal(h.probes.length, 0) }
  finally { finishWrite.resolve(); await write }
  const pending = h.prepare()
  try {
    await probing.promise
    assert.equal((await h.invoke('write')).isError, true)
    assert.equal(h.writes.length, 1)
    assert.equal((await h.prepare()).isError, true)
    assert.equal(h.probes.length, 1)
  } finally { finishProbe.resolve(); await pending }
  assert.equal((await h.invoke('write')).isError, false)
})

test('models audit: active legacy Plan blocks model initialization until explicitly discarded', async t => {
  const h = await officialFixture(t), previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = h.dir
  t.after(() => { if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome })
  await h.ctx.plugin(plan)
  const dir = sessionPlansDir(h.dir, h.agent.id)
  writeNewPlan(dir, { planner: 'codex', reviewer: 'claude', cwd: h.dir, text: 'Synthetic retained Plan', baseline: { head: 'fixture-head', repoRoot: h.dir }, manifest: { version: 1, goal: 'Synthetic plan' } })
  assert.equal((await h.prepare()).isError, true)
  assert.equal(h.probes.length, 0)
  assert.equal(h.events.filter(event => event.type === 'approval/asked').length, 0)
  const draft = prepareApproval(dir, 1)
  approvePlan(dir, 1, { token: draft.token, expectedHash: draft.hash, expectedRevision: draft.revision })
  assert.equal((await h.prepare()).isError, true)
  assert.equal(h.probes.length, 0)
  discardPlan(dir, 1)
  assert.equal((await h.prepare()).isError, false)
  assert.equal(h.probes.length, 1)
})
