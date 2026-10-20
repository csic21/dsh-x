import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as plugin from '../src/index.ts'

const cli = fileURLToPath(new URL('./fixtures/fake-agent-browser.mjs', import.meta.url))

async function harness(t: import('node:test').TestContext, options: { approve?: () => string, command?: string } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'browser-cdp-')), ctx = new Context(), approvals: any[] = []
  await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime)
  const agent: any = { id: 'cdp-session', session: { id: 'cdp-session' } }
  const boundary = { openTurnStartSeq: 1, lastTurn: 1 }
  ctx.provide('profileContext', { dir })
  ctx.provide('workingDirectory', { ensure: async () => dir, get: () => dir })
  ctx.provide('sessions', { get: (id: any) => id === agent.session.id ? agent.session : undefined })
  ctx.provide('sessionProjections', { stateOf: () => boundary })
  ctx.provide('approval', { request: async (request: any) => { approvals.push(request); return options.approve ? options.approve() : 'allowed-once' } })
  await ctx.plugin(plugin, { backend: 'cdp', cdp: { command: options.command ?? cli, headed: false, allowedDomains: ['example.test'] } })
  const invoke = async (name: string, args = {}, signal = new AbortController().signal): Promise<any> => ctx.tools.execute({ name, arguments: args, agent, signal, callId: crypto.randomUUID() as import('@deepseek-ai/dsh-llm').ToolCallId })
  t.after(async () => { await ctx.fiber.dispose(); rmSync(dir, { recursive: true, force: true }) })
  return { invoke, approvals }
}

test('cdp tools open, observe and click with one approval per non-observe action', async t => {
  const h = await harness(t)
  const opened = await h.invoke('dsh_x_browser_open', { url: 'https://example.test/' })
  assert.equal(opened.isError, false, JSON.stringify(opened))
  assert.equal(opened.value.backend, 'cdp')
  assert.equal(opened.value.tabId, 't1')
  assert.equal(h.approvals.length, 1)
  const tabs = await h.invoke('dsh_x_browser_tabs')
  assert.equal(tabs.isError, false, JSON.stringify(tabs))
  assert.equal(tabs.value.runtime, 'cdp')
  const tab = tabs.value.tabs[0]
  assert.equal(tab.grantRevision, 0)
  const observed = await h.invoke('dsh_x_browser_action', { tabId: tab.tabId, epoch: tab.epoch, grantRevision: 0, action: 'observe' })
  assert.equal(observed.isError, false, JSON.stringify(observed))
  assert.equal(observed.value.result.refs.e1, 'button: Go')
  const clicked = await h.invoke('dsh_x_browser_action', { tabId: tab.tabId, epoch: observed.value.epoch, grantRevision: 0, action: 'click', target: 'e1' })
  assert.equal(clicked.isError, false, JSON.stringify(clicked))
  assert.equal(h.approvals.length, 2)
  assert.match(h.approvals[1].reason, /external Chrome/)
})

test('cdp tools fail closed on stale epochs and domains outside the allowlist', async t => {
  const h = await harness(t)
  const opened = await h.invoke('dsh_x_browser_open', { url: 'https://example.test/' })
  assert.equal(opened.isError, false, JSON.stringify(opened))
  const stale = await h.invoke('dsh_x_browser_action', { tabId: 't1', epoch: opened.value.epoch + 99, grantRevision: 0, action: 'observe' })
  assert.equal(stale.isError, true)
  assert.equal(stale.error.info.code, 'BROWSER_STALE')
  const denied = await h.invoke('dsh_x_browser_open', { url: 'https://other.test/' })
  assert.equal(denied.isError, true)
  assert.equal(denied.error.info.code, 'BROWSER_URL')
  assert.equal(h.approvals.length, 1)
})

test('cdp tools expose select with a value', async t => {
  const h = await harness(t)
  await h.invoke('dsh_x_browser_open', { url: 'https://example.test/' })
  const tabs = await h.invoke('dsh_x_browser_tabs')
  const tab = tabs.value.tabs[0]
  const observed = await h.invoke('dsh_x_browser_action', { tabId: tab.tabId, epoch: tab.epoch, grantRevision: 0, action: 'observe' })
  assert.equal(observed.isError, false, JSON.stringify(observed))
  const selected = await h.invoke('dsh_x_browser_action', { tabId: tab.tabId, epoch: observed.value.epoch, grantRevision: 0, action: 'select', target: 'e1', value: 'b' })
  assert.equal(selected.isError, false, JSON.stringify(selected))
  assert.equal(h.approvals.length, 2)
})

test('cdp approval rejection and cancellation stop before the browser starts', async t => {
  const denied = await harness(t, { approve: () => 'rejected' })
  const rejected = await denied.invoke('dsh_x_browser_open', { url: 'https://example.test/' })
  assert.equal(rejected.isError, true)
  assert.equal(rejected.error.info.code, 'BROWSER_APPROVAL')
  assert.equal(denied.approvals.length, 1)

  const cancelled = await harness(t)
  const abort = new AbortController(); abort.abort()
  const stopped = await cancelled.invoke('dsh_x_browser_open', { url: 'https://example.test/' }, abort.signal)
  assert.equal(stopped.isError, true)
  assert.equal(cancelled.approvals.length, 0)
})

test('missing CLI fails closed with an actionable code', async t => {
  const h = await harness(t, { command: 'agent-browser-definitely-missing' })
  const failed = await h.invoke('dsh_x_browser_open', { url: 'https://example.test/' })
  assert.equal(failed.isError, true)
  assert.equal(failed.error.info.code, 'BROWSER_BINARY_MISSING')
})
