// Independent audit regressions. Native runtime calls are synthetic fixtures;
// only the DSH ToolRuntime and ApprovalService below are real installed services.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SubprocessLocal from '@deepseek-ai/dsh-subprocess-local'
import Approval from '@deepseek-ai/dsh-user-approval'
import * as agents from '../packages/dsh-x-agents/lib/index.js'
import * as plan from '../packages/dsh-x-plan/lib/index.js'
import { sessionPlansDir, writeNewPlan, prepareApproval, approvePlan, discardPlan } from '../packages/dsh-x-plan/lib/store.js'
import { createTaskStore } from '../packages/dsh-x-agents/lib/store.js'
import { createAgentsController } from '../packages/dsh-x-agents/lib/controller.js'
import { readSnapshot } from '../packages/dsh-x-agents/src/client/model.ts'

const tick = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}
const args = { runtime: 'codex', prompt: 'Synthetic local audit only' }
const cleanupFailure = () => Object.assign(new Error('Fixture discovery child may remain'), { code: 'AGENTS_CLEANUP_UNCONFIRMED' })
function fixture(t, options = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'agents-independent-audit-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const store = createTaskStore(dir), calls = []
  const driver = {
    backendIdentity: 'fixture-backend-a',
    capabilities: { permissions: true, nativeSessions: true },
    discover: async request => options.discover ? options.discover(request) : {
      available: true, authenticated: true, models: [], capabilities: options.capabilities,
    },
    run: async request => {
      await request.onEvent({ type: 'session', data: { nativeSessionId: 'fixture-native' } })
      if (options.run) await options.run(request)
      return { status: 'completed', nativeSessionId: 'fixture-native', summary: 'Explicit fixture only' }
    },
  }
  const controller = createAgentsController({
    store, adapter: async () => driver, cwdOf: async () => options.cwdOf ? options.cwdOf(dir) : dir,
    policyOf: () => ({ mode: 'workspace-write', workspaceRoot: dir }),
    approve: async (...values) => { calls.push(values); return options.approve ? options.approve(...values) : 'allowed-once' },
    askInput: options.askInput,
  })
  return { controller, store, calls, driver, dir, exec: { agent: { session: { id: 'fixture-session' } }, signal: new AbortController().signal } }
}
const permission = (extra = {}) => ({
  id: 'request-1', nativeSessionId: 'fixture-native', title: 'Command',
  details: { command: 'printf harmless', cwd: '/tmp/fixture', threadId: 'fixture-native', turnId: 'turn-1' },
  options: [{ id: 'accept', kind: 'allow_once', label: 'Once' }, { id: 'decline', kind: 'reject_once', label: 'Decline' }],
  ...extra,
})

test('audit: structured native permission details reach the host approval', async t => {
  let decision
  const h = fixture(t, { run: async request => { decision = await request.requestPermission(permission()) } })
  await h.controller.run(args, h.exec)
  assert.equal(decision.optionId, 'accept')
  assert.match(h.calls[1][1].details, /printf harmless/)
  assert.doesNotMatch(h.calls[1][1].details, /\[object Object\]/)
})

test('audit: explicit runtime false capability overrides static advertisement', async t => {
  const h = fixture(t, { capabilities: { permissions: false } })
  const snapshot = await h.controller.inspect(h.exec)
  assert.equal(snapshot.catalog.find(item => item.id === 'codex').capabilities.permissions, false)
})

test('audit: native request resolution revokes a late affirmative host answer', async t => {
  const requestAbort = new AbortController()
  let decision, prompted = false
  const h = fixture(t, {
    approve: async (_exec, request) => {
      if (request.title === 'Command') { prompted = true; requestAbort.abort() }
      return 'allowed-once'
    },
    run: async request => {
      try { decision = await request.requestPermission(permission({ signal: requestAbort.signal })) } catch {}
    },
  })
  await h.controller.run(args, h.exec)
  assert.equal(prompted, true)
  assert.notEqual(decision?.optionId, 'accept')
})

test('audit: large native data remains a valid readable workbench snapshot', async t => {
  const h = fixture(t, { run: request => request.onEvent({ type: 'tool', data: { a: 'a'.repeat(3900), b: 'b'.repeat(3900), c: 'c'.repeat(3900) } }) })
  const snapshot = await h.controller.run(args, h.exec)
  assert.ok(readSnapshot(snapshot, 'fixture-session'))
  assert.equal(snapshot.task.events.find(event => event.type === 'tool').data.truncated, true)
})

test('audit: numeric usage survives credential-key redaction', async t => {
  const h = fixture(t, { run: request => request.onEvent({ type: 'usage', data: { tokens: { input: 31, output: 7 }, totalTokens: 38, accessToken: 'synthetic-secret' } }) })
  const snapshot = await h.controller.run(args, h.exec)
  const data = snapshot.task.events.find(event => event.type === 'usage').data
  assert.deepEqual(data.tokens, { input: 31, output: 7 })
  assert.equal(data.totalTokens, 38)
  assert.equal(data.accessToken, '[redacted]')
})

test('audit: old callbacks cannot resurrect a terminal run', async t => {
  const h = fixture(t), snapshot = await h.controller.run(args, h.exec)
  assert.throws(() => h.store.state('fixture-session', snapshot.task.id, snapshot.task.runId, 'running'), /no longer owns/)
})

test('audit: launch binds an immutable prompt and route', async t => {
  const input = { runtime: 'codex', prompt: 'Approved harmless prompt' }
  let actual
  const h = fixture(t, { approve: async () => { input.prompt = 'Unapproved changed prompt'; return 'allowed-once' }, run: async request => { actual = request.prompt } })
  await h.controller.run(input, h.exec)
  assert.ok(actual === undefined || actual === 'Approved harmless prompt', `Dispatched mutated prompt: ${actual}`)
})

test('audit: discovery cleanup uncertainty retains a running task fence', async t => {
  const h = fixture(t, { discover: async () => { throw cleanupFailure() } })
  const snapshot = await h.controller.run(args, h.exec)
  assert.equal(snapshot.task.state, 'interrupted')
  assert.equal(h.store.hasLock('fixture-session'), true)
})

test('audit: standalone discovery uncertainty quarantines the session', async t => {
  let calls = 0
  const h = fixture(t, { discover: async () => { calls++; throw cleanupFailure() } })
  await h.controller.inspect(h.exec).catch(() => {})
  assert.equal(h.store.hasLock('fixture-session'), true)
  const snapshot = await h.controller.inspect(h.exec)
  assert.equal(calls, 1)
  assert.equal(snapshot.task.state, 'interrupted')
})

test('audit: backend changes during launch approval prevent dispatch', async t => {
  let actual, h
  h = fixture(t, { approve: async () => { h.driver.backendIdentity = 'fixture-backend-b'; return 'allowed-once' }, run: async () => { actual = true } })
  const snapshot = await h.controller.run(args, h.exec)
  assert.equal(actual, undefined)
  assert.equal(snapshot.task.state, 'blocked')
})

test('audit: continuation cannot silently migrate to another backend', async t => {
  const h = fixture(t), first = await h.controller.run(args, h.exec)
  h.driver.backendIdentity = 'fixture-backend-b'
  await assert.rejects(() => h.controller.run({ ...args, scope: first.scope, taskId: first.task.id, expectedRevision: first.revision }, h.exec), /preserve/)
  assert.equal(h.store.hasLock('fixture-session'), false)
})

test('audit: public discovery does not spawn a second runtime during a run', async t => {
  const entered = deferred(), finish = deferred()
  let discoveries = 0
  const h = fixture(t, {
    discover: async () => { discoveries++; return { available: true, authenticated: true, models: [] } },
    run: async () => { entered.resolve(); await finish.promise },
  })
  const pending = h.controller.run(args, h.exec)
  try {
    await entered.promise
    const before = discoveries, snapshot = await h.controller.inspect(h.exec)
    assert.equal(snapshot.task.state, 'running')
    assert.equal(discoveries, before)
  } finally { finish.resolve(); await pending }
})

test('audit: standalone discovery excludes concurrent starts and is owned until settlement', async t => {
  const entered = deferred(), finish = deferred()
  let discoveries = 0
  const h = fixture(t, { discover: async () => { discoveries++; if (discoveries === 1) { entered.resolve(); await finish.promise } return { available: true, authenticated: true, models: [] } } })
  const pending = h.controller.inspect(h.exec)
  try {
    await entered.promise
    assert.equal(h.controller.isRunning('fixture-session'), true)
    await assert.rejects(() => h.controller.run(args, h.exec), error => error.code === 'AGENTS_BUSY')
    await h.controller.inspect(h.exec)
    assert.equal(discoveries, 1)
  } finally { finish.resolve(); await pending }
})

test('audit: run admission is reserved before awaiting directory resolution', async t => {
  const entered = deferred(), finish = deferred()
  let bindings = 0, discoveries = 0
  const h = fixture(t, {
    cwdOf: async dir => { if (++bindings === 1) { entered.resolve(); await finish.promise } return dir },
    discover: async () => { discoveries++; return { available: true, authenticated: true, models: [] } },
  })
  const pending = h.controller.run(args, h.exec)
  try {
    await entered.promise
    await h.controller.inspect(h.exec)
    assert.equal(discoveries, 0, 'Public inspect started a runtime inside run admission')
  } finally { finish.resolve(); await pending }
})

test('audit: plugin disposal aborts discovery and awaits its cleanup', async t => {
  const entered = deferred(), finish = deferred()
  let cancelled = false, settled = false, calls = 0
  const h = fixture(t, { discover: async ({ signal }) => {
    if (++calls === 1) {
      signal.addEventListener('abort', () => { cancelled = true }, { once: true })
      entered.resolve(); await finish.promise
    }
    return { available: false, authenticated: false, models: [] }
  } })
  const pending = h.controller.inspect(h.exec)
  await entered.promise
  const disposing = h.controller.dispose().then(() => { settled = true })
  try { await tick(); assert.equal(cancelled, true); assert.equal(settled, false) }
  finally { finish.resolve(); await Promise.all([pending, disposing]) }
})

async function officialFixture(t, opened, policy = 'ask') {
  const ctx = new Context(), dir = mkdtempSync(path.join(tmpdir(), 'agents-official-approval-audit-'))
  const events = opened ? [{ type: 'turn/start', data: {} }] : []
  let calls = 0
  const session = { id: 'fixture-approval', get seq() { return events.length }, eventAt: index => events[index], append: (type, data) => events.push({ type, data }) }
  const agent = { id: session.id, session }
  await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(SubprocessLocal); await ctx.plugin(Approval, { policy })
  ctx.on('approval/request', async () => 'allowed-once')
  ctx.provide('profileContext', { dir })
  ctx.provide('workingDirectory', { ensure: async () => dir, get: () => dir })
  ctx.provide('sandboxPolicy', { resolve: () => ({ mode: 'workspace-write', workspaceRoot: dir, sessionId: session.id }) })
  const driver = {
    backendIdentity: 'fixture-only', capabilities: { nativeSessions: true },
    discover: async () => ({ available: true, authenticated: true, models: [] }),
    run: async request => {
      calls++; await request.onEvent({ type: 'session', data: { nativeSessionId: 'fixture-native' } })
      return { status: 'completed', nativeSessionId: 'fixture-native', summary: 'Synthetic protocol fixture' }
    },
  }
  await ctx.plugin(agents, { adapters: { codex: () => driver, opencode: () => driver } })
  t.after(async () => { await ctx.fiber.dispose(); rmSync(dir, { recursive: true, force: true }) })
  return {
    ctx, dir, agent, events, calls: () => calls,
    run: () => ctx.tools.execute({ name: 'dsh_x_agents_run', arguments: { runtime: 'codex', prompt: 'Synthetic approval audit' }, agent, signal: new AbortController().signal, callId: 'fixture-call' }),
  }
}

test('audit: official approval refuses a closed turn without audit or dispatch', async t => {
  const h = await officialFixture(t, false), result = await h.run()
  assert.equal(result.value.task.state, 'blocked')
  assert.equal(h.calls(), 0)
  assert.match(result.value.task.reason, /outside an open turn/)
  assert.equal(h.events.length, 0)
})

test('audit: official one-time approval is logged inside the open turn', async t => {
  const h = await officialFixture(t, true), result = await h.run()
  assert.equal(result.value.task.state, 'completed')
  assert.equal(h.calls(), 1)
  assert.deepEqual(h.events.map(event => event.type), ['turn/start', 'approval/asked', 'approval/decided'])
  assert.equal(h.events[2].data.outcome, 'allowed-once')
})

test('audit: official never policy defeats an approving answerer', async t => {
  const h = await officialFixture(t, true, 'never'), result = await h.run()
  assert.equal(result.value.task.state, 'blocked')
  assert.equal(h.calls(), 0)
  assert.equal(h.events.at(-1).data.outcome, 'rejected')
})

test('audit: active legacy Plan cannot be bypassed by the new native runtime', async t => {
  const h = await officialFixture(t, true)
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = h.dir
  t.after(() => { if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome })
  await h.ctx.plugin(plan)
  const dir = sessionPlansDir(h.dir, h.agent.id)
  writeNewPlan(dir, { planner: 'codex', reviewer: 'claude', cwd: h.dir, text: 'Synthetic existing Plan', baseline: { head: 'fixture-head', repoRoot: h.dir }, manifest: { version: 1, goal: 'Synthetic plan' } })
  const draft = await h.run()
  assert.equal(draft.isError, true)
  assert.equal(h.calls(), 0)
  assert.equal(h.events.filter(event => event.type === 'approval/asked').length, 0)
  const approval = prepareApproval(dir, 1)
  approvePlan(dir, 1, { token: approval.token, expectedHash: approval.hash, expectedRevision: approval.revision })
  assert.equal((await h.run()).isError, true)
  assert.equal(h.calls(), 0)
  discardPlan(dir, 1)
  const afterDiscard = await h.run()
  assert.equal(afterDiscard.isError, false, JSON.stringify(afterDiscard))
  assert.equal(afterDiscard.value.task.state, 'completed')
  assert.equal(h.calls(), 1)
})
