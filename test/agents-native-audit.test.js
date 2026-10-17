// Independent Claude/Grok review regressions. These drivers are synthetic.
// No native account, credential store, network, or paid model is used.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PassThrough, Writable } from 'node:stream'
import { createTaskStore } from '../packages/dsh-x-agents/src/store.js'
import { createAgentsController } from '../packages/dsh-x-agents/src/controller.js'
import { ClaudeProcessOwner } from '../packages/dsh-x-agents/src/adapters/claude-process.js'
import { createClaudeAdapter } from '../packages/dsh-x-agents/src/adapters/claude.js'
import { createClaudeFixture } from '../packages/dsh-x-agents/test/fixtures/claude-protocol.mjs'
import { createGrokAdapter } from '../packages/dsh-x-agents/src/adapters/grok.js'

const tick = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const pendingAuth = () => ({ state: 'requires-native-initialization', source: 'version-only' })
const cleanupFailure = () => Object.assign(new Error('Synthetic native cleanup is unconfirmed'), { code: 'AGENTS_CLEANUP_UNCONFIRMED' })

function fixture(t, runtime, options = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'agents-native-audit-'))
  const store = createTaskStore(dir), discoveries = [], approvals = [], dispatches = []
  const abort = new AbortController()
  const exec = { agent: { session: { id: 'native-audit-session' } }, signal: abort.signal }
  const driver = {
    backendIdentity: `synthetic-${runtime}-a`,
    capabilities: { nativeSessions: true, resume: true, permissions: true },
    discover: async request => options.discover ? options.discover(request) : ({ available: true, authenticated: null, models: [], authentication: pendingAuth() }),
    run: async request => {
      dispatches.push(request)
      await request.onEvent({ type: 'session', data: { nativeSessionId: 'native-audit-id' } })
      if (options.run) return options.run(request)
      return { status: 'completed', nativeSessionId: 'native-audit-id', summary: 'Synthetic local test' }
    },
  }
  const controller = createAgentsController({
    store,
    cwdOf: async () => dir,
    policyOf: () => ({ mode: 'workspace-write', workspaceRoot: dir }),
    adapter: async id => { discoveries.push(id); return driver },
    approve: async (...args) => { approvals.push(args); return options.approve ? options.approve(...args) : 'allowed-once' },
  })
  t.after(async () => { await controller.dispose(); rmSync(dir, { recursive: true, force: true }) })
  return { dir, store, controller, driver, exec, abort, discoveries, approvals, dispatches, args: { runtime, prompt: 'Synthetic native audit only' } }
}

for (const runtime of ['claude', 'grok']) {
  test(`native audit: ${runtime} explicit failed authentication cannot be overridden by a deferred marker`, async t => {
    const h = fixture(t, runtime, { discover: async () => ({ available: true, authenticated: false, models: [], authentication: pendingAuth() }) })
    const result = await h.controller.run(h.args, h.exec)
    assert.equal(result.task.state, 'blocked')
    assert.equal(h.approvals.length, 0)
    assert.equal(h.dispatches.length, 0)
  })

  test(`native audit: ${runtime} native initialization waits for explicit launch approval`, async t => {
    const entered = deferred(), release = deferred()
    const h = fixture(t, runtime, { approve: async () => { entered.resolve(); await release.promise; return 'rejected' } })
    const pending = h.controller.run(h.args, h.exec)
    try {
      await entered.promise
      assert.equal(h.dispatches.length, 0)
      assert.equal(h.controller.snapshot('native-audit-session').task.state, 'waiting_permission')
      assert.ok(h.discoveries.every(value => value === runtime), 'Start inspected an unrelated native runtime')
      assert.match(h.approvals[0][1].details, /not checked|not verified|unverified/i)
    } finally { release.resolve() }
    assert.equal((await pending).task.state, 'blocked')
    assert.equal(h.dispatches.length, 0)
    assert.equal(h.store.hasLock('native-audit-session'), false)
  })

  test(`native audit: ${runtime} cancellation defeats a late affirmative launch answer`, async t => {
    const entered = deferred(), release = deferred()
    const h = fixture(t, runtime, { approve: async () => { entered.resolve(); await release.promise; return 'allowed-once' } })
    const pending = h.controller.run(h.args, h.exec)
    try { await entered.promise; h.abort.abort(); await tick(); assert.equal(h.dispatches.length, 0) }
    finally { release.resolve() }
    assert.equal((await pending).task.state, 'cancelled')
    assert.equal(h.dispatches.length, 0)
  })

  test(`native audit: ${runtime} backend drift during approval blocks initialization`, async t => {
    let h
    h = fixture(t, runtime, { approve: async () => { h.driver.backendIdentity = `synthetic-${runtime}-b`; return 'allowed-once' } })
    const result = await h.controller.run(h.args, h.exec)
    assert.equal(result.task.state, 'blocked')
    assert.equal(h.dispatches.length, 0)
    assert.match(result.task.reason, /configuration changed/)
  })

  test(`native audit: ${runtime} unknown cleanup retains the native run fence`, async t => {
    const h = fixture(t, runtime, { run: async () => { throw cleanupFailure() } })
    const result = await h.controller.run(h.args, h.exec)
    assert.equal(result.task.state, 'interrupted')
    assert.equal(result.task.runtime, runtime)
    assert.equal(h.store.hasLock('native-audit-session'), true)
    assert.deepEqual(result.task.allowedActions, ['inspect'])
    await assert.rejects(() => h.controller.run(h.args, h.exec), error => error.code === 'AGENTS_BUSY')
    assert.equal(h.dispatches.length, 1, 'Uncertain native run was replayed')
  })
}

test('native audit: deferred authentication is denied for unknown sources and unrelated providers', async t => {
  for (const [runtime, authentication] of [
    ['claude', { state: 'requires-native-initialization', source: 'environment-exists' }],
    ['grok', { state: 'configured-unverified', source: 'native-account-info' }],
    ['codex', pendingAuth()],
  ]) {
    const h = fixture(t, runtime, { discover: async () => ({ available: true, authenticated: null, models: [], authentication }) })
    const result = await h.controller.run(h.args, h.exec)
    assert.equal(result.task.state, 'blocked')
    assert.equal(h.approvals.length, 0)
    assert.equal(h.dispatches.length, 0)
  }
})

const processOptions = { graceMs: 1, cleanupTimeoutMs: 1000, maxFrameBytes: 4096, maxOutputBytes: 8192, maxFrames: 100 }
function syntheticChild() {
  const exit = deferred()
  return { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), done: exit.promise,
    terminate() { exit.resolve({ exitCode: 0 }); this.stdout.end(); this.stderr.end() },
    waitForExit: async () => true,
  }
}

test('native audit: Claude bridge closed in the creation tick never starts the deferred process', async () => {
  let spawns = 0
  const owner = new ClaudeProcessOwner(async () => { spawns++; return syntheticChild() }, processOptions)
  owner.create({ command: 'synthetic-no-command', args: [], cwd: '/tmp', env: {} })
  await owner.close()
  assert.equal(spawns, 0, 'Native process started after the owner was already closed')
})

test('native audit: Claude bridge cancels an in-flight host confinement before it can launch', async () => {
  const entered = deferred(), release = deferred()
  let spawnSignal
  const owner = new ClaudeProcessOwner(async spec => {
    spawnSignal = spec.signal; entered.resolve(); await release.promise
    spec.signal?.throwIfAborted()
    return syntheticChild()
  }, processOptions)
  owner.create({ command: 'synthetic-no-command', args: [], cwd: '/tmp', env: {} })
  await entered.promise
  const closing = owner.close()
  try { await tick(); assert.equal(spawnSignal?.aborted, true, 'Host confinement did not receive cancellation') }
  finally { release.resolve(); await closing }
})

// The real installed SDK consumes a synthetic native byte stream here. The
// injected spawner never starts a process, reads a native account or calls a model.
function claudeWireFixture(onUser) {
  const messages = [], children = [], errors = []
  const adapter = createClaudeAdapter({ config: {
    executable: '/tmp/synthetic-claude-audit.mjs', configDir: '/tmp/synthetic-claude-audit-home',
    requestTimeoutMs: 250, cleanupTimeoutMs: 250,
  }, spawn: async spec => {
    const done = deferred(), stdout = new PassThrough(), stderr = new PassThrough()
    const child = { stdout, stderr, done: done.promise,
      terminate() { stdout.end(); stderr.end(); done.resolve({ exitCode: 0 }) },
      waitForExit: async () => true,
    }
    const protocol = createClaudeFixture({ argv: spec.argv, send: frame => stdout.write(JSON.stringify(frame) + '\n'), onUser })
    child.protocol = protocol
    let pending = ''
    child.stdin = new Writable({ write(bytes, encoding, callback) {
      pending += String(bytes)
      let newline
      while ((newline = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, newline); pending = pending.slice(newline + 1)
        if (!line.trim()) continue
        const message = JSON.parse(line); messages.push(message)
        void Promise.resolve().then(() => protocol.receive(message)).catch(error => errors.push(error))
      }
      callback()
    } })
    children.push(child)
    return child
  } })
  return { adapter, messages, children, errors }
}

test('native audit: Claude terminal result revokes a coalesced permission before any late grant', async () => {
  const h = claudeWireFixture(native => { native.permission(); native.finish() })
  let grants = 0
  const result = await h.adapter.run({ prompt: 'Synthetic fixture task', cwd: '/tmp',
    sandboxPolicy: { mode: 'workspace-write', workspaceRoot: '/tmp' },
    requestPermission: async () => { grants++; return { optionId: 'allow' } },
  })
  assert.equal(result.status, 'completed')
  assert.equal(h.messages.filter(message => message.type === 'control_response' && message.response.response?.behavior === 'allow').length, 0,
    'A native allow was sent after the terminal result had already arrived')
  assert.equal(grants, 0, 'A stale permission was presented after the native terminal result')
  assert.deepEqual(h.errors, [])
})

test('native audit: Claude terminal messages require their exact native session identity', async () => {
  for (const session_id of [undefined, null, '']) {
    const h = claudeWireFixture(native => native.frame({ type: 'result', subtype: 'success',
      is_error: false, result: 'Unbound synthetic result', session_id }))
    const result = await h.adapter.run({ prompt: 'Synthetic fixture task', cwd: '/tmp',
      sandboxPolicy: { mode: 'workspace-write', workspaceRoot: '/tmp' } })
    assert.equal(result.status, 'failed', `A result with session_id=${String(session_id)} was accepted`)
  }
})

function grokWireFixture(onPrompt) {
  const init = JSON.parse(readFileSync(new URL('../packages/dsh-x-agents/test/fixtures/grok/initialize-1.0.62.json', import.meta.url)))
  init.authMethods.push({ id: 'cached_token', name: 'Synthetic configured token' }); init._meta.defaultAuthMethodId = 'cached_token'
  const messages = [], children = [], errors = []
  const adapter = createGrokAdapter({ config: { nativeHome: '/tmp/synthetic-grok-audit-home', requestTimeoutMs: 250, cleanupTimeoutMs: 250 }, spawn: async spec => {
    const done = deferred(), stdout = new PassThrough(), stderr = new PassThrough()
    const child = { stdout, stderr, done: done.promise,
      terminate() { done.resolve({ exitCode: 0 }) }, waitForExit: async () => true,
      frame(value) { stdout.write(JSON.stringify({ jsonrpc: '2.0', ...value }) + '\n') },
      notify(method, params) { this.frame({ method, params }) },
      reply(request, result) { this.frame({ id: request.id, result }) },
    }
    child.stdin = new Writable({ write(bytes, encoding, callback) {
      const message = JSON.parse(String(bytes)); messages.push(message); callback()
      void Promise.resolve().then(() => {
        if (message.method === 'initialize') child.reply(message, init)
        if (message.method === 'session/new') child.reply(message, { sessionId: 'grok-audit-native', models: init._meta.modelState })
        if (message.method === 'session/prompt') onPrompt(child, message)
      }).catch(error => errors.push(error))
    } })
    children.push(child)
    if (spec.argv.at(-1) === '--version') queueMicrotask(() => { stdout.write('grok 1.0.62 (1474f9cbdd91)\n'); done.resolve({ exitCode: 0 }) })
    return child
  } })
  return { adapter, messages, children, errors }
}

test('native audit: Grok native request revocation is independent of a slow display event', async () => {
  const asked = deferred(), answer = deferred(), rendering = deferred(), releaseRender = deferred()
  let promptMessage
  const h = grokWireFixture((child, message) => {
    promptMessage = message
    child.frame({ id: 77, method: 'session/request_permission', params: { sessionId: 'grok-audit-native',
      toolCall: { toolCallId: 'audit-tool', title: 'Synthetic action', rawInput: { command: 'printf synthetic' } },
      options: [{ optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' }, { optionId: 'reject-once', name: 'Reject once', kind: 'reject_once' }],
    } })
  })
  const task = h.adapter.run({ prompt: 'Synthetic fixture task', cwd: '/tmp',
    sandboxPolicy: { mode: 'workspace-write', workspaceRoot: '/tmp' },
    requestPermission: request => { asked.resolve(request.signal); return answer.promise },
    onEvent: async event => { if (event.type === 'tool') { rendering.resolve(); await releaseRender.promise } },
  })
  const signal = await asked.promise, child = h.children.at(-1)
  child.notify('session/update', { sessionId: 'grok-audit-native', update: { sessionUpdate: 'tool_call_update', toolCallId: 'audit-tool', title: 'Display update' } })
  await rendering.promise
  child.notify('_x.ai/session_notification', { sessionId: 'grok-audit-native', update: { sessionUpdate: 'interaction_resolved', tool_call_id: 'audit-tool' } })
  answer.resolve({ optionId: 'allow-once' })
  try {
    await tick()
    assert.ok(!h.messages.some(message => message.id === 77 && message.result?.outcome?.optionId === 'allow-once'), 'A revoked permission was granted while display processing was stalled')
    assert.equal(signal.aborted, true, 'Native revocation waited for unrelated display persistence')
  } finally {
    releaseRender.resolve(); child.reply(promptMessage, { stopReason: 'end_turn' }); await task
  }
  assert.deepEqual(h.errors, [])
})
