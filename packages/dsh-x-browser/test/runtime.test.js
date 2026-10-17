import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'
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
