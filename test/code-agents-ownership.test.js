// Real official ToolRuntime and Agents ownership hooks; all native calls below
// are synthetic adapters. No provider requests, credentials or model usage.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SubprocessLocal from '@deepseek-ai/dsh-subprocess-local'
import * as agents from '../packages/dsh-x-agents/lib/index.js'
import * as plan from '../packages/dsh-x-plan/lib/index.js'
import { sessionPlansDir, writeNewPlan, prepareApproval, approvePlan } from '../packages/dsh-x-plan/lib/store.js'

const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}
const args = { runtime: 'codex', prompt: 'Synthetic Code ownership fixture' }
const tick = () => new Promise(resolve => setImmediate(resolve))
async function harness(t, options = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'code-agents-ownership-')), ctx = new Context()
  await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(SubprocessLocal)
  const agent = { id: 'code-fixture', session: { id: 'code-fixture' } }
  let calls = 0, writes = 0, mode = options.mode ?? 'workspace-write'
  const approvals = []
  ctx.provide('profileContext', { dir })
  ctx.provide('workingDirectory', { ensure: async () => dir, get: () => dir })
  ctx.provide('sandboxPolicy', { resolve: () => ({ mode, workspaceRoot: dir }) })
  ctx.provide('approval', { request: async request => { approvals.push(request); return options.approve?.(request) ?? 'allowed-once' } })
  const driver = {
    capabilities: { nativeSessions: true, permissions: true },
    discover: async request => options.discover ? options.discover(request) : ({ available: true, authenticated: true, models: [] }),
    run: async request => {
      calls++
      await request.onEvent({ type: 'session', data: { nativeSessionId: 'fixture-native' } })
      if (options.run) return options.run(request)
      return { nativeSessionId: 'fixture-native', status: 'completed', summary: 'Synthetic fixture' }
    },
  }
  await ctx.plugin(agents, options.native ? {} : { trustedExternalRuntime: options.trustedExternalRuntime === true, adapters: { codex: options_ => { options.adapterOptions?.(options_); return driver } } })
  const register = (name, execute) => ctx.tools.register(defineTool({ name, description: 'Ownership test fixture', parameters: {},
    output: { schema: { type: 'object', additionalProperties: true, properties: {} }, render: (_a, value) => [{ type: 'text', text: JSON.stringify(value) }] }, execute }))
  const dispatch = (exec, extra = {}) => ctx.tools.execute({ name: 'dsh_x_agents_run', arguments: { ...args, ...(exec.name === 'dsh_x_code_review' ? { readOnly: true } : {}) },
    agent: exec.agent, signal: exec.signal, callId: randomUUID(), rootCallId: exec.rootCallId, parent: exec.token, ...extra })
  register('write', async () => { writes++; if (options.write) await options.write(); return { written: true } })
  for (const name of ['dsh_x_code_review', 'dsh_x_code_repair']) {
    register(name, async (_args, exec) => options.wrapper ? options.wrapper(exec, dispatch) : { nested: await dispatch(exec) })
  }
  t.after(async () => { await ctx.fiber.dispose(); rmSync(dir, { recursive: true, force: true }) })
  return { ctx, agent, dir, approvals, calls: () => calls, writes: () => writes, register, dispatch, setMode: value => { mode = value },
    invoke: (name, arguments_ = {}, signal = new AbortController().signal) => ctx.tools.execute({ name, arguments: arguments_, agent, signal, callId: randomUUID() }) }
}

test('Code wrappers delegate through the real runtime and retain native launch approval', async t => {
  const h = await harness(t)
  for (const name of ['dsh_x_code_review', 'dsh_x_code_repair']) {
    const result = await h.invoke(name)
    assert.equal(result.isError, false, JSON.stringify(result))
    assert.equal(result.value.nested.isError, false, JSON.stringify(result))
    assert.equal(result.value.nested.value.task.state, 'completed')
  }
  assert.equal(h.calls(), 2)
  assert.equal(h.approvals.length, 2)
  assert.ok(h.approvals.every(request => request.toolName === 'dsh_x_agents_run'))
})

test('Code wrapper reserves the whole operation before and after its native child', async t => {
  const before = deferred(), start = deferred(), after = deferred(), finish = deferred()
  const h = await harness(t, { wrapper: async (exec, dispatch) => {
    before.resolve(); await start.promise
    const nested = await dispatch(exec)
    after.resolve(); await finish.promise
    return { nested }
  } })
  const running = h.invoke('dsh_x_code_review')
  try {
    await before.promise
    for (const name of ['write', 'dsh_x_agents_run', 'dsh_x_agents_models', 'dsh_x_code_repair']) {
      assert.equal((await h.invoke(name, args)).isError, true, name)
    }
    start.resolve(); await after.promise
    assert.equal((await h.invoke('write')).isError, true)
    assert.equal((await h.invoke('dsh_x_agents_run', args)).isError, true)
    assert.equal(h.writes(), 0)
  } finally { start.resolve(); finish.resolve(); await running }
  assert.equal((await h.invoke('write')).isError, false)
})

test('concurrent and sequential child replay cannot consume a second native turn', async t => {
  const h = await harness(t, { wrapper: async (exec, dispatch) => {
    const children = await Promise.all([dispatch(exec), dispatch(exec)])
    children.push(await dispatch(exec))
    return { children }
  } })
  const result = await h.invoke('dsh_x_code_review')
  assert.equal(result.isError, false)
  assert.equal(result.value.children.filter(child => !child.isError).length, 1, JSON.stringify(result))
  assert.equal(h.calls(), 1)
})

test('only exact execution token, root and child tool can inherit the wrapper lease', async t => {
  const h = await harness(t, { wrapper: async (exec, dispatch) => {
    const rejected = await Promise.all([
      dispatch(exec, { parent: String(exec.token) }),
      dispatch(exec, { parent: Symbol('dsh.tool.execution') }),
      dispatch(exec, { rootCallId: 'unrelated-root' }),
      dispatch(exec, { name: 'write', arguments: {} }),
      dispatch(exec, { name: 'dsh_x_agents_models', arguments: { runtime: 'codex', scope: 'fixture' } }),
      dispatch(exec, { name: 'dsh_x_code_repair', arguments: {} }),
      dispatch(exec, { arguments: { ...args, readOnly: false } }),
    ])
    return { rejected, valid: await dispatch(exec) }
  } })
  const result = await h.invoke('dsh_x_code_review')
  assert.equal(result.isError, false)
  assert.ok(result.value.rejected.every(child => child.isError), JSON.stringify(result))
  assert.equal(result.value.valid.isError, false)
  assert.equal(h.calls(), 1); assert.equal(h.writes(), 0)
})

test('an in-flight ordinary mutation blocks wrapper admission', async t => {
  const entered = deferred(), finish = deferred()
  const h = await harness(t, { write: async () => { entered.resolve(); await finish.promise } })
  const write = h.invoke('write')
  try {
    await entered.promise
    assert.equal((await h.invoke('dsh_x_code_review')).isError, true)
    assert.equal(h.calls(), 0)
  } finally { finish.resolve(); await write }
  assert.equal((await h.invoke('dsh_x_code_review')).value.nested.isError, false)
})

test('nested host denial blocks dispatch and releases wrapper ownership', async t => {
  const h = await harness(t, { approve: () => 'rejected' })
  const result = await h.invoke('dsh_x_code_review')
  assert.equal(result.value.nested.value.task.state, 'blocked')
  assert.equal(h.calls(), 0)
  assert.equal((await h.invoke('write')).isError, false)
})

test('cancellation drains native cleanup before the wrapper lease is released', async t => {
  const entered = deferred(), aborted = deferred(), finish = deferred()
  const h = await harness(t, { run: async request => {
    entered.resolve(); request.signal.addEventListener('abort', () => aborted.resolve(), { once: true })
    await finish.promise
    return { status: 'cancelled', summary: 'Fixture stopped' }
  } })
  const controller = new AbortController()
  let settled = false
  const running = h.invoke('dsh_x_code_review', {}, controller.signal).then(result => { settled = true; return result })
  try {
    await entered.promise; controller.abort(); await aborted.promise; await tick()
    assert.equal(settled, false)
    assert.equal((await h.invoke('write')).isError, true)
  } finally { finish.resolve(); await running }
  assert.equal((await h.invoke('write')).isError, false)
})

test('uncertain native cleanup retains its durable fence after the wrapper settles', async t => {
  const h = await harness(t, { run: async () => { throw Object.assign(new Error('Fixture cleanup not confirmed'), { code: 'AGENTS_CLEANUP_UNCONFIRMED' }) } })
  const result = await h.invoke('dsh_x_code_review')
  assert.equal(result.value.nested.value.task.state, 'interrupted')
  assert.equal((await h.invoke('write')).isError, true)
  assert.equal((await h.invoke('dsh_x_code_repair')).isError, true)
})

test('both draft and approved Plan deny Code wrappers before native launch', async t => {
  const h = await harness(t), previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = h.dir
  t.after(() => { if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome })
  await h.ctx.plugin(plan)
  const dir = sessionPlansDir(h.dir, h.agent.id)
  writeNewPlan(dir, { planner: 'codex', reviewer: 'claude', cwd: h.dir, text: 'Synthetic existing Plan', baseline: { head: 'fixture-head', repoRoot: h.dir }, manifest: { version: 1, goal: 'Synthetic plan' } })
  for (const name of ['dsh_x_code_review', 'dsh_x_code_repair']) assert.equal((await h.invoke(name)).isError, true)
  const approval = prepareApproval(dir, 1)
  approvePlan(dir, 1, { token: approval.token, expectedHash: approval.hash, expectedRevision: approval.revision })
  for (const name of ['dsh_x_code_review', 'dsh_x_code_repair']) assert.equal((await h.invoke(name)).isError, true)
  assert.equal(h.calls(), 0); assert.equal(h.approvals.length, 0)
})

test('read-only turn tightens every adapter and discovery without altering host settings', async t => {
  const bindings = [], policies = []
  const h = await harness(t, { mode: 'danger-full-access',
    adapterOptions: options => bindings.push(options.binding),
    discover: async request => { policies.push(request.sandboxPolicy); return { available: true, authenticated: true, models: [] } },
    run: async request => { policies.push(request.sandboxPolicy); return { status: 'completed', summary: 'Read-only fixture' } },
  })
  const result = await h.invoke('dsh_x_agents_run', { ...args, readOnly: true })
  assert.equal(result.value.task.state, 'completed', JSON.stringify(result))
  assert.equal(result.value.task.readOnly, true)
  assert.ok(bindings.length >= 3)
  assert.ok(bindings.every(bound => bound.policy.mode === 'read-only' && bound.hostPolicy.mode === 'danger-full-access'))
  assert.ok(policies.length >= 2 && policies.every(policy => policy.mode === 'read-only'))
  assert.equal(h.ctx.sandboxPolicy.resolve().mode, 'danger-full-access')
  assert.match(h.approvals[0].reason, /read-only file confinement/)
})

test('read-only turn rejects native permission escalation without an approval prompt', async t => {
  let decision
  const h = await harness(t, { run: async request => {
    decision = await request.requestPermission({ id: 'native-write', nativeSessionId: 'fixture-native', title: 'Write file',
      details: { command: 'touch file.txt' }, options: [{ id: 'yes', kind: 'allow_once', label: 'Once' }] })
    return { status: 'completed', summary: 'Denied write fixture' }
  } })
  await h.invoke('dsh_x_agents_run', { ...args, readOnly: true })
  assert.deepEqual(decision, { optionId: null })
  assert.equal(h.approvals.length, 1)
})

test('read-only effective mode cannot hide actual host policy drift during approval', async t => {
  let h
  h = await harness(t, { approve: () => { h.setMode('danger-full-access'); return 'allowed-once' } })
  const result = await h.invoke('dsh_x_agents_run', { ...args, readOnly: true })
  assert.equal(result.value.task.state, 'blocked')
  assert.match(result.value.task.reason, /policy changed/)
  assert.equal(h.calls(), 0)
})

test('read-only option is strictly boolean and OpenCode cannot bypass confinement', async t => {
  const h = await harness(t, { mode: 'danger-full-access', trustedExternalRuntime: true })
  for (const readOnly of ['true', 1, null]) assert.equal((await h.invoke('dsh_x_agents_run', { ...args, readOnly })).isError, true)
  const result = await h.invoke('dsh_x_agents_run', { ...args, runtime: 'opencode', readOnly: true })
  assert.equal(result.value.task.state, 'blocked')
  assert.match(result.value.task.reason, /cannot confine an external OpenCode/)
  assert.equal(h.calls(), 0); assert.equal(h.approvals.length, 0)
})

for (const sandboxMode of ['absent', 'partial', 'changed-during-confinement']) {
  test(`read-only process cannot start with ${sandboxMode} confinement even on an unrestricted host`, async t => {
    const h = await harness(t, { native: true, mode: 'danger-full-access' })
    let spawns = 0, confines = 0
    // Admission-boundary spy, not a purported filesystem sandbox. A denied
    // start must never reach the managed subprocess implementation.
    h.ctx.subprocess.spawn = async () => { spawns++; throw new Error('Unconfined fixture must never spawn') }
    if (sandboxMode !== 'absent') h.ctx.provide('sandbox', { confine: async (argv, policy) => {
      confines++; assert.equal(policy.mode, 'read-only')
      if (sandboxMode === 'changed-during-confinement') h.setMode('workspace-write')
      return { argv, enforcement: sandboxMode === 'partial' ? 'partial' : 'full' }
    } })
    const result = await h.invoke('dsh_x_agents_run', { ...args, readOnly: true })
    assert.equal(result.value.task.state, 'blocked', JSON.stringify(result))
    assert.equal(spawns, 0)
    assert.equal(confines, sandboxMode === 'absent' ? 0 : 1)
    assert.equal(h.approvals.length, 0)
  })
}

test('inspect during an outer Code lease returns state without unconfined discovery', async t => {
  const entered = deferred(), finish = deferred()
  let discoveries = 0
  const h = await harness(t, { discover: async () => { discoveries++; return { available: true, authenticated: true, models: [] } },
    wrapper: async (exec, dispatch) => { entered.resolve(); await finish.promise; return { nested: await dispatch(exec) } },
  })
  const running = h.invoke('dsh_x_code_review')
  try {
    await entered.promise
    assert.equal((await h.invoke('dsh_x_agents_inspect')).isError, false)
    assert.equal(discoveries, 0)
  } finally { finish.resolve(); await running }
  assert.equal(discoveries, 1)
})

test('post-approval dispatch observers retain the exact wrapper token and can reject stale repairs', async t => {
  let outer, called = 0
  const h = await harness(t, { wrapper: async (exec, dispatch) => { outer = exec.token; return { nested: await dispatch(exec) } } })
  h.ctx.on('dsh-x-agents/before-dispatch', exec => {
    called++
    assert.equal(h.approvals.length, 1)
    assert.equal(exec.parent, outer)
    assert.equal(exec.name, 'dsh_x_agents_run')
    throw Object.assign(new Error('Selected source changed during approval.'), { code: 'CODE_STALE' })
  })
  const result = await h.invoke('dsh_x_code_repair')
  assert.equal(result.value.nested.value.task.state, 'blocked')
  assert.match(result.value.nested.value.task.reason, /source changed during approval/)
  assert.equal(called, 1); assert.equal(h.calls(), 0)
  assert.equal((await h.invoke('write')).isError, false)
})

test('host policy is rechecked after dispatch observers settle', async t => {
  const h = await harness(t)
  h.ctx.on('dsh-x-agents/before-dispatch', async () => { await tick(); h.setMode('danger-full-access') })
  const result = await h.invoke('dsh_x_code_repair')
  assert.equal(result.value.nested.value.task.state, 'blocked')
  assert.match(result.value.nested.value.task.reason, /policy changed/)
  assert.equal(h.calls(), 0)
})

test('read-only prompts preserve 64k characters exactly while ordinary Agents keep the 12k bound', async t => {
  const prompts = []
  const h = await harness(t, { run: async request => { prompts.push(request.prompt); return { status: 'completed', summary: 'Complete read-only fixture' } } })
  const prompt = 'x'.repeat(64_000)
  assert.equal((await h.invoke('dsh_x_agents_run', { ...args, prompt, readOnly: true })).value.task.state, 'completed')
  assert.deepEqual(prompts, [prompt])
  for (const input of [{ prompt: prompt + 'x', readOnly: true }, { prompt: 'x'.repeat(12_001) }, { prompt: 'x'.repeat(12_001), readOnly: false }]) {
    assert.equal((await h.invoke('dsh_x_agents_run', { ...args, ...input })).isError, true)
  }
  assert.equal(h.calls(), 1)
})

test('read-only output preserves 12k characters but oversized completion fails explicitly', async t => {
  let summary = 'x'.repeat(12_000)
  const h = await harness(t, { run: async () => ({ status: 'completed', summary }) })
  const complete = await h.invoke('dsh_x_agents_run', { ...args, readOnly: true })
  assert.equal(complete.value.task.state, 'completed')
  assert.equal(complete.value.task.summary, summary)
  summary += 'x'
  const oversized = await h.invoke('dsh_x_agents_run', { ...args, readOnly: true })
  assert.equal(oversized.value.task.state, 'blocked')
  assert.equal(oversized.value.task.summary, '')
  assert.match(oversized.value.task.reason, /oversized/)
})
