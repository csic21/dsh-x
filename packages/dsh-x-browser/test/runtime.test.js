import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as plugin from '../index.js'
async function harness(t, options = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'browser-runtime-')), ctx = new Context(), routes = new Map(), approvals = []
  await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime)
  const agent = { id: 'browser-session', session: { id: 'browser-session' } }
  let boundary = { openTurnStartSeq: 1, lastTurn: 1 }
  ctx.provide('profileContext', { dir }); ctx.provide('workingDirectory', { ensure: async () => dir, get: () => dir }); ctx.provide('sessions', { get: id => id === agent.session.id ? agent.session : undefined }); ctx.provide('sessionProjections', { stateOf: () => boundary })
  ctx.provide('connection', { fetch: { register: route => { routes.set(route.path, route); return () => {} } } })
  ctx.provide('approval', { request: async request => { approvals.push(request); return options.approve ? options.approve(request) : 'allowed-once' } })
  await ctx.plugin(plugin)
  async function rpc(name, payload) {
    const response = await routes.get(`/api/browser/${name}`).fetch(new Request(`http://localhost/api/browser/${name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', method: `browser/${name}`, rpcId: crypto.randomUUID(), payload }) }))
    const message = await response.json(); if (!message.result.ok) throw Object.assign(new Error(message.result.error.message), message.result.error); return message.result.value
  }
  const registration = await rpc('register', { sessionId: agent.session.id, clientTabId: 'ui-browser' }), auth = { tabId: registration.tabId, capability: registration.capability }
  await rpc('sync', { ...auth, epoch: 1, visible: true, url: 'https://example.test/?token=private', title: 'Fixture' })
  const granted = await rpc('grant', { ...auth, epoch: 1, grantRevision: 0 }), identity = { tabId: registration.tabId, epoch: 1, grantRevision: granted.grantRevision }
  const invoke = (name, args = {}, signal = new AbortController().signal) => ctx.tools.execute({ name, arguments: args, agent, signal, callId: crypto.randomUUID() })
  async function delivery() { for (let i = 0; i < 100; i++) { const value = await rpc('poll', auth); if (value.command) return value.command; await new Promise(resolve => setTimeout(resolve, 1)) } throw Error('No command delivered') }
  t.after(async () => { await ctx.fiber.dispose(); rmSync(dir, { recursive: true, force: true }) })
  return { ctx, rpc, invoke, delivery, identity, auth, approvals, setBoundary: value => { boundary = value } }
}
test('real official ToolRuntime reaches the capability broker and routes exact same-turn results with no Agents dependency', async t => {
  const h = await harness(t)
  const list = await h.invoke('dsh_x_browser_tabs'); assert.equal(list.isError, false, JSON.stringify(list)); assert.equal(list.value.tabs[0].url, 'https://example.test/')
  const pending = h.invoke('dsh_x_browser_action', { ...h.identity, action: 'observe' }), command = await h.delivery()
  await h.rpc('ack', { ...h.auth, commandId: command.id, epoch: 1, grantRevision: h.identity.grantRevision, result: { text: 'Fixture', targets: [] } })
  const result = await pending
  assert.equal(result.isError, false, JSON.stringify(result)); assert.equal(result.value.result.text, 'Fixture'); assert.equal(result.meta.kind, 'dsh-x-browser.result'); assert.equal(h.approvals.length, 0)
  const input = h.invoke('dsh_x_browser_action', { ...h.identity, action: 'scroll', x: 0, y: 120 }), send = await h.delivery()
  assert.equal(h.approvals.length, 1); assert.match(h.approvals[0].reason, /scroll/)
  await h.rpc('ack', { ...h.auth, commandId: send.id, epoch: 1, grantRevision: h.identity.grantRevision, result: { status: 'input-sent' } })
  assert.equal((await input).isError, false)
})
test('official approval rejection and turn change block dispatch before renderer input', async t => {
  const h = await harness(t, { approve: () => 'rejected' })
  const denied = await h.invoke('dsh_x_browser_action', { ...h.identity, action: 'reload' })
  assert.equal(denied.isError, true); assert.equal(denied.error.info.code, 'BROWSER_APPROVAL'); assert.equal((await h.rpc('poll', h.auth)).command, null)
  h.setBoundary({ openTurnStartSeq: 10, lastTurn: 2 })
  const stale = await h.invoke('dsh_x_browser_action', { ...h.identity, action: 'observe' }); assert.equal(stale.isError, true)
})
test('official tool cancellation revokes queue and late results cannot report successful input', async t => {
  const h = await harness(t), abort = new AbortController()
  const pending = h.invoke('dsh_x_browser_action', { ...h.identity, action: 'observe' }, abort.signal), command = await h.delivery()
  abort.abort()
  assert.equal((await pending).isError, true)
  await assert.rejects(h.rpc('ack', { ...h.auth, commandId: command.id, epoch: 1, grantRevision: h.identity.grantRevision, result: { text: 'late' } }))
  assert.equal((await h.rpc('poll', h.auth)).granted, false)
})

test('real ToolRuntime renders the exact closed-tab stale-action denial without embedding its structured code', async t => {
  const h = await harness(t)
  assert.deepEqual(await h.rpc('close', h.auth), { closed: true })
  const listed = await h.invoke('dsh_x_browser_tabs')
  assert.equal(listed.isError, false); assert.deepEqual(listed.value.tabs, [])
  const denied = await h.invoke('dsh_x_browser_action', { ...h.identity, action: 'observe' })
  assert.equal(denied.isError, true); assert.equal(denied.error.info.code, 'BROWSER_GRANT')
  const rendered = denied.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
  assert.equal(rendered, 'Error: Show the exact browser tab and enable AI access, then refresh tabs before requesting an action.')
  assert.doesNotMatch(rendered, /BROWSER_GRANT|BROWSER_CLOSED/)
  await assert.rejects(h.rpc('poll', h.auth), { code: 'BROWSER_CLOSED' })
})

test('real nested ToolRuntime children retain one native parent and stable run lifetime after a child settles', async t => {
  const h = await harness(t), run = new AbortController()
  let list, childSettled = false
  const stopped = new Promise(resolve => run.signal.addEventListener('abort', resolve, { once: true }))
  h.ctx.tools.register(defineTool({ name: 'native_browser_fixture', description: 'Synthetic parent execution fixture.', parameters: {},
    output: { schema: { type: 'object', properties: {}, additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(_args, exec) {
      const close = h.ctx.get('dshXBrowserOwnership').bind(exec.token, { runtime: 'opencode', nativeRunId: 'native-fixture', signal: run.signal })
      const invoke = (name, args) => h.ctx.tools.execute({ name, arguments: args, agent: exec.agent, signal: run.signal, callId: crypto.randomUUID(), rootCallId: exec.rootCallId, parent: exec.token })
      try {
        list = await invoke('dsh_x_browser_tabs', {})
        assert.equal(list.isError, false); assert.equal(list.value.runtime, 'opencode'); assert.deepEqual(list.value.nativeRuntimes, ['opencode'])
        const observed = await invoke('dsh_x_browser_action', { ...h.identity, action: 'observe' })
        assert.equal(observed.isError, false); childSettled = true
        await stopped
        return {}
      } finally { close() }
    },
  }))
  const parent = h.invoke('native_browser_fixture'), command = await h.delivery()
  await h.rpc('ack', { ...h.auth, commandId: command.id, epoch: 1, grantRevision: h.identity.grantRevision, result: { text: 'Native fixture' } })
  for (let i = 0; !childSettled && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 1))
  assert.equal(childSettled, true); assert.equal((await h.rpc('poll', h.auth)).granted, true)
  run.abort()
  assert.equal((await h.rpc('poll', h.auth)).granted, false)
  assert.equal((await parent).isError, false)
})

test('closed native parent cannot fall back to direct DSH after the user grants the tab again', async t => {
  const h = await harness(t), signal = new AbortController().signal
  let parent
  h.ctx.tools.register(defineTool({ name: 'native_owner_fixture', description: 'Synthetic owner fixture.', parameters: {},
    output: { schema: { type: 'object', properties: {}, additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(_args, exec) {
      parent = { agent: exec.agent, parent: exec.token, rootCallId: exec.rootCallId }
      const close = h.ctx.get('dshXBrowserOwnership').bind(exec.token, { runtime: 'opencode', nativeRunId: 'closed-native', signal })
      try { return (await h.ctx.tools.execute({ ...parent, name: 'dsh_x_browser_tabs', arguments: {}, signal, callId: crypto.randomUUID() })).value } finally { close() }
    },
  }))
  assert.equal((await h.invoke('native_owner_fixture')).isError, false)
  const stopped = await h.rpc('poll', h.auth)
  const granted = await h.rpc('grant', { ...h.auth, epoch: 1, grantRevision: stopped.grantRevision })
  for (const [name, args] of [['dsh_x_browser_tabs', {}], ['dsh_x_browser_action', { ...h.identity, grantRevision: granted.grantRevision, action: 'observe' }]]) {
    const stale = await h.ctx.tools.execute({ ...parent, name, arguments: args, signal, callId: crypto.randomUUID() })
    assert.equal(stale.isError, true); assert.match(stale.content[0].text, /no live Browser owner/)
  }
  assert.equal((await h.rpc('poll', h.auth)).command, null)
})
