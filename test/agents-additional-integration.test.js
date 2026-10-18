import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SubprocessLocal from '@deepseek-ai/dsh-subprocess-local'
import * as agents from '../packages/dsh-x-agents/lib/index.js'

// Real official DSH ToolRuntime + managed OS subprocess + official Anthropic
// SDK. Only the native CLI protocol peer is synthetic; no model/account calls.
async function harness(t, runtime, options = {}) {
 const dir = mkdtempSync(path.join(tmpdir(), `agents-${runtime}-official-`)), ctx = new Context()
 await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(SubprocessLocal)
 const agent = { id: crypto.randomUUID(), session: { id: crypto.randomUUID() } }, approvals = [], questions = []
 ctx.provide('profileContext', { dir })
 ctx.provide('workingDirectory', { ensure: async () => dir, get: () => dir })
 ctx.provide('sandboxPolicy', { resolve: () => ({ mode: 'danger-full-access', workspaceRoot: dir, sessionId: agent.session.id }) })
 ctx.provide('approval', { request: async request => { approvals.push(request); return options.reject ? 'rejected' : 'allowed-once' } })
 ctx.provide('userQuestions', { ask: async request => { questions.push(request); return { answers: request.questions.map(question => ({ id: question.id, selected: [question.options[0].label] })) } } })
 const executable = fileURLToPath(new URL(`../packages/dsh-x-agents/test/fixtures/${runtime}-cli.mjs`, import.meta.url))
 const config = { executable, requestTimeoutMs: 5000, cleanupTimeoutMs: 5000, ...(runtime === 'claude' ? { configDir: dir } : { nativeHome: dir }) }
 await ctx.plugin(agents, { [runtime]: config, adapters: Object.fromEntries(['codex','opencode','claude','grok'].filter(id => id !== runtime).map(id => [id, () => ({ capabilities: {}, discover: async () => ({ available: false, authenticated: null, reason: 'Outside this synthetic fixture.' }) })])) })
 const invoke = (name, args = {}, signal = new AbortController().signal) => ctx.tools.execute({ name, arguments: args, agent, signal, callId: crypto.randomUUID() })
 t.after(async () => { await ctx.fiber.dispose(); rmSync(dir, { recursive: true, force: true }) })
 return { ctx, invoke, approvals, questions }
}
for (const runtime of ['claude','grok']) {
 test(`${runtime}: official host discovers only a version, then explicitly starts and resumes the native fixture`, async t => {
  const h = await harness(t, runtime)
  const inspected = await h.invoke('dsh_x_agents_inspect')
  const setup = inspected.value.catalog.find(item => item.id === runtime)
  assert.equal(setup.available, true, JSON.stringify(setup)); assert.equal(setup.authenticated, null); assert.deepEqual(setup.models, [])
  assert.equal(h.approvals.length, 0)
  const first = await h.invoke('dsh_x_agents_run', { runtime, prompt: 'Synthetic fixture only' })
  assert.equal(first.isError, false, JSON.stringify(first)); assert.equal(first.value.task.state, 'completed', JSON.stringify(first.value.task))
  assert.ok(first.value.task.nativeSessionId)
  const second = await h.invoke('dsh_x_agents_run', { runtime, prompt: 'Continue synthetic fixture', scope: first.value.scope, taskId: first.value.task.id, expectedRevision: first.value.revision })
  assert.equal(second.value.task.state, 'completed', JSON.stringify(second.value.task)); assert.equal(second.value.task.nativeSessionId, first.value.task.nativeSessionId)
 })
 test(`${runtime}: approved directory preparation enables model choice before the first task`, async t => {
  const h=await harness(t,runtime)
  const setup=await h.invoke('dsh_x_agents_inspect')
  const prepared=await h.invoke('dsh_x_agents_models',{runtime,scope:setup.value.scope})
  assert.equal(prepared.isError,false,JSON.stringify(prepared));assert.equal(prepared.value.task,null)
  const item=prepared.value.catalog.find(item=>item.id===runtime)
  assert.ok(item.models.length);assert.equal(item.modelCatalog.status,'fresh');assert.equal(item.authenticated,null);assert.equal(h.approvals.length,1)
  const run=await h.invoke('dsh_x_agents_run',{runtime,prompt:'Synthetic fixture only',model:item.models[0].id,scope:setup.value.scope})
  assert.equal(run.value.task.state,'completed',JSON.stringify(run));assert.equal(run.value.task.model,item.models[0].id)
 })
 test(`${runtime}: rejected launch sends no native prompt`, async t => {
  const h = await harness(t, runtime, { reject: true })
  const result = await h.invoke('dsh_x_agents_run', { runtime, prompt: 'Synthetic fixture only' })
  assert.equal(result.value.task.state, 'blocked'); assert.equal(result.value.task.nativeSessionId, null); assert.equal(h.approvals.length, 1)
 })
 test(`${runtime}: native permission and questions use the host services`, async t => {
  const h = await harness(t, runtime)
  const permission = await h.invoke('dsh_x_agents_run', { runtime, prompt: 'fixture:permission' })
  assert.equal(permission.value.task.state, 'completed', JSON.stringify(permission.value.task)); assert.equal(h.approvals.length, 2)
  assert.match(h.approvals[1].reason, /printf fixture/)
  const input = await h.invoke('dsh_x_agents_run', { runtime, prompt: 'fixture:input' })
  assert.equal(input.value.task.state, 'completed', JSON.stringify(input.value.task)); assert.equal(h.questions.length, 1)
  assert.ok(h.questions[0].questions[0].id)
 })
 test(`${runtime}: official host abort waits for the native fixture to stop`, async t => {
  const h = await harness(t, runtime), abort = new AbortController()
  const pending = h.invoke('dsh_x_agents_run', { runtime, prompt: 'fixture:cancel' }, abort.signal)
  let ready = false
  for (let attempt = 0; attempt < 300; attempt++) {
   const state = await h.invoke('dsh_x_agents_inspect')
   if (state.value?.task?.nativeSessionId && state.value.task.state === 'running') { ready = true; break }
   await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.ok(ready, 'Native session did not enter the running state')
  abort.abort(new Error('Synthetic stop'))
  await pending
  const result = await h.invoke('dsh_x_agents_inspect')
  assert.equal(result.value.task.state, 'cancelled', JSON.stringify(result.value.task))
  assert.notEqual(result.value.task.allowedActions[0], 'cancel')
 })
}
