import test from 'node:test'
import assert from 'node:assert/strict'
import { createAgentBrowserBackend } from '../src/backends/agent-browser/backend.ts'
import type { EmbeddedBroker } from '../src/backends/embedded/broker.ts'
import { cdpRuntime, embeddedRuntime } from '../src/runtime.ts'
import { CDP_CAPABILITIES } from '../src/contract/capabilities.ts'
import type { RuntimeResult } from '../src/runtime.ts'
import { createScriptedCli } from './fixtures/agent-browser.ts'

const scope = { profile: 'profile-a', sessionId: 'session-a', workspace: '/work/a' }

test('cdp runtime maps target revisions to epochs and always grants through config', async t => {
  const h = createScriptedCli()
  const backend = createAgentBrowserBackend({ runner: h.runner, headed: true })
  const runtime = cdpRuntime(backend, { allowedDomains: ['example.test'] })
  t.after(() => runtime.dispose())
  const opened = await runtime.open!(scope, 'https://example.test/a', {})
  assert.equal(opened.tabId, 't1')
  assert.equal(opened.grantRevision, 0)
  assert.equal(opened.granted, true)
  assert.equal(opened.visible, true)
  const list = await runtime.list(scope)
  assert.equal(list.runtime, 'cdp')
  assert.equal(list.experimental, true)
  const target = list.tabs[0]
  const observed = await runtime.execute(scope, { tabId: target.tabId, epoch: target.epoch, grantRevision: 0, command: { action: 'observe' } }, {})
  assert.ok(observed.epoch > target.epoch)
  const observation = observed.result as Record<string, unknown>
  assert.equal((observation.refs as Record<string, string>).e1, 'button: Go')
  const clicked = await runtime.execute(scope, { tabId: target.tabId, epoch: observed.epoch, grantRevision: 0, command: { action: 'click', target: 'e1' } }, {})
  assert.deepEqual(clicked.result, { acknowledged: 'click' })
})

test('cdp runtime enforces the domain allowlist for open and navigate', async t => {
  const h = createScriptedCli()
  const runtime = cdpRuntime(createAgentBrowserBackend({ runner: h.runner, headed: false }), { allowedDomains: ['example.test'] })
  t.after(() => runtime.dispose())
  await assert.rejects(runtime.open!(scope, 'https://other.test/', {}), { code: 'BROWSER_URL' })
  const opened = await runtime.open!(scope, 'https://sub.example.test/', {})
  assert.equal(opened.url, 'https://sub.example.test/')
  const current = (await runtime.list(scope)).tabs[0]
  await assert.rejects(runtime.execute(scope, { tabId: current.tabId, epoch: current.epoch, grantRevision: 0, command: { action: 'navigate', url: 'https://other.test/' } }, {}), { code: 'BROWSER_URL' })
})

test('cdp runtime rejects stale epochs and non-zero grant revisions before touching the page', async t => {
  const h = createScriptedCli()
  const runtime = cdpRuntime(createAgentBrowserBackend({ runner: h.runner, headed: false }))
  t.after(() => runtime.dispose())
  const opened = await runtime.open!(scope, 'https://example.test/', {})
  await assert.rejects(runtime.execute(scope, { tabId: opened.tabId, epoch: opened.epoch + 99, grantRevision: 0, command: { action: 'observe' } }, {}), { code: 'BROWSER_STALE' })
  await assert.rejects(runtime.execute(scope, { tabId: opened.tabId, epoch: opened.epoch, grantRevision: 1, command: { action: 'observe' } }, {}), { code: 'BROWSER_STALE' })
  await assert.rejects(runtime.execute(scope, { tabId: 'missing', epoch: opened.epoch, grantRevision: 0, command: { action: 'observe' } }, {}), { code: 'BROWSER_TARGET' })
})

test('embedded runtime is a pure passthrough over the renderer broker', async () => {
  const calls: string[] = []
  const broker = {
    async list() { calls.push('list'); return { tabs: [], runtime: 'dsh', nativeRuntimes: [], experimental: true } },
    async execute(_scope: unknown, args: { command: { action: string } }) { calls.push('execute'); const result: RuntimeResult = { tabId: 't1', epoch: 2, grantRevision: 0, untrustedPageContent: true, result: { action: args.command.action } }; return result },
    dispose() { calls.push('dispose') },
  } as unknown as EmbeddedBroker
  const runtime = embeddedRuntime(broker)
  const list = await runtime.list(scope)
  assert.equal(list.runtime, 'dsh')
  const result = await runtime.execute(scope, { tabId: 't1', epoch: 1, grantRevision: 0, command: { action: 'observe' } }, {})
  assert.deepEqual(result.result, { action: 'observe' })
  await runtime.dispose()
  assert.deepEqual(calls, ['list', 'execute', 'dispose'])
})

test('cdp runtime forwards the cancellation signal to list and execute', async () => {
  let listSignal: AbortSignal | undefined
  let executeSignal: AbortSignal | undefined
  const backend = {
    kind: 'cdp',
    capabilities: CDP_CAPABILITIES,
    async list(_scope: unknown, signal?: AbortSignal) { listSignal = signal; return [{ targetId: 't1', title: '', url: 'https://example.test/', visible: false, revision: 1 }] },
    async execute(_scope: unknown, _targetId: string, _command: unknown, signal?: AbortSignal) { executeSignal = signal; return { targetId: 't1', revision: 2, observation: null, value: null, untrustedPageContent: true } },
    async dispose() {},
  } as unknown as import('../src/backends/types.ts').BrowserBackend
  const runtime = cdpRuntime(backend)
  const controller = new AbortController()
  await runtime.list(scope, { signal: controller.signal })
  assert.equal(listSignal, controller.signal)
  await runtime.execute(scope, { tabId: 't1', epoch: 1, grantRevision: 0, command: { action: 'observe' } }, { signal: controller.signal })
  assert.equal(executeSignal, controller.signal)
})
