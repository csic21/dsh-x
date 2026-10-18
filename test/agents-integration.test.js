import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SubprocessLocal from '@deepseek-ai/dsh-subprocess-local'
import * as agents from '../packages/dsh-x-agents/lib/index.js'
async function harness(t, options={}) {
 const dir=mkdtempSync(path.join(tmpdir(),'agents-official-runtime-')),ctx=new Context()
 await ctx.plugin(SystemPrompt);await ctx.plugin(ToolRuntime);await ctx.plugin(SubprocessLocal)
 const agent={id:'fixture-session',session:{id:'fixture-session'}}
 let mode='workspace-write', writes=0
 ctx.provide('profileContext',{dir});ctx.provide('workingDirectory',{ensure:async()=>dir,get:()=>dir})
 ctx.provide('sandboxPolicy',{resolve:()=>({mode,workspaceRoot:dir,sessionId:agent.id})})
 ctx.provide('approval',{request:async request=>options.approve?options.approve(request):'allowed-once'})
 const driver={id:'codex',capabilities:{nativeSessions:true,resume:true,permissions:true},discover:async()=>({available:true,authenticated:true,models:[]}),run:async args=>{
  await args.onEvent({type:'session',data:{nativeSessionId:args.nativeSessionId??'fixture-native'}})
  if(options.run)return options.run(args)
  return {nativeSessionId:'fixture-native',status:'completed',summary:'Explicit fixture output; no vendor call'}
 }}
 await ctx.plugin(agents,{adapters:{codex:()=>driver,opencode:()=>driver,claude:()=>driver,grok:()=>driver}})
 ctx.tools.register(defineTool({name:'write',description:'Fixture write',parameters:{},output:{schema:{type:'object',additionalProperties:false,properties:{text:{type:'string'}}},render:(_a,v)=>[{type:'text',text:v.text}]},execute:async()=>{writes++;return {text:'write'}}}))
 const invoke=(name,args={})=>ctx.tools.execute({name,arguments:args,agent,signal:new AbortController().signal,callId:crypto.randomUUID()})
 t.after(()=>ctx.fiber.dispose())
 return{ctx,agent,invoke,writes:()=>writes,setMode:value=>{mode=value}}
}
test('official ToolRuntime starts and continues exact native task without fabricated primary-agent switch',async t=>{
 const h=await harness(t),first=await h.invoke('dsh_x_agents_run',{runtime:'codex',prompt:'Fixture native task'})
 assert.equal(first.isError,false,JSON.stringify(first));assert.equal(first.value.task.state,'completed')
 const task=first.value.task
 const next=await h.invoke('dsh_x_agents_run',{runtime:'codex',prompt:'Continue fixture',taskId:task.id,scope:first.value.scope,expectedRevision:first.value.revision})
 assert.equal(next.isError,false,JSON.stringify(next));assert.equal(next.value.task.nativeSessionId,task.nativeSessionId)
})
test('official host denial prevents native dispatch',async t=>{
 let calls=0;const h=await harness(t,{run:async()=>{calls++;return{status:'completed'}},approve:async()=> 'rejected'})
 const result=await h.invoke('dsh_x_agents_run',{runtime:'codex',prompt:'Fixture deny'})
 assert.equal(result.value.task.state,'blocked');assert.equal(calls,0)
})
test('native run fences concurrent same-session writes through official guard',async t=>{
 let entered,finish;const ready=new Promise(r=>{entered=r})
 const h=await harness(t,{run:async()=>{entered();await new Promise(r=>{finish=r});return {status:'completed',summary:'Fixture'}}})
 const pending=h.invoke('dsh_x_agents_run',{runtime:'codex',prompt:'Fixture active'});await ready
 const write=await h.invoke('write');assert.equal(write.isError,true);assert.equal(h.writes(),0)
 finish();await pending;assert.equal((await h.invoke('write')).isError,false)
})
test('native permission scope reaches actual approval body with single grant semantics',async t=>{
 const requests=[];let answer
 const h=await harness(t,{approve:async request=>{requests.push(request);return'allowed-once'},run:async args=>{
  answer=await args.requestPermission({id:'fixture-request',nativeSessionId:'fixture-native',title:'Fixture write permission',details:{command:'echo fixture',cwd:'/fixture'},options:[{id:'once',kind:'allow_once',label:'Once'},{id:'always',kind:'allow_always',label:'Always'}]})
  return{status:'completed',summary:'Fixture'}
 }})
 await h.invoke('dsh_x_agents_run',{runtime:'codex',prompt:'Fixture native approval'})
 assert.deepEqual(answer,{optionId:'once'});assert.match(requests[1].reason,/echo fixture/);assert.doesNotMatch(requests[1].reason,/\[object Object\]/)
})

// These tests retain the official ToolRuntime, plugin, durable task store, and
// managed subprocess implementation. Only the external Codex protocol is a
// synthetic local executable; no provider credentials or model calls are used.
async function stdioCodexHarness(t, options = {}) {
  const { fileURLToPath } = await import('node:url')
  const { rmSync } = await import('node:fs')
  const dir = mkdtempSync(path.join(tmpdir(), 'agents-codex-stdio-'))
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(SubprocessLocal)
  const agent = { id: `stdio-${crypto.randomUUID()}`, session: { id: `stdio-${crypto.randomUUID()}` } }
  const approvals = [], questions = []
  ctx.provide('profileContext', { dir })
  ctx.provide('workingDirectory', { ensure: async () => dir, get: () => dir })
  // This is an explicitly unrestricted synthetic test host. It does not
  // pretend that a pass-through wrapper supplies filesystem confinement.
  ctx.provide('sandboxPolicy', { resolve: () => ({ mode: options.mode ?? 'danger-full-access', workspaceRoot: dir, sessionId: agent.session.id }) })
  ctx.provide('approval', { request: async request => { approvals.push(request); return options.approve ? options.approve(request, approvals.length) : 'allowed-once' } })
  ctx.provide('userQuestions', { ask: async request => { questions.push(request); return { answers: request.questions.map(question => ({ id: question.id, selected: [question.options[0].label] })) } } })
  const executable = fileURLToPath(new URL('../packages/dsh-x-agents/test/fixtures/codex-app-server.mjs', import.meta.url))
  await ctx.plugin(agents, { codex: { executable, codexHome: dir, requestTimeoutMs: 3000, cleanupTimeoutMs: 5000 },
    adapters: Object.fromEntries(['opencode','claude','grok'].map(id => [id, () => ({ id, capabilities: {}, discover: async () => ({ available: false, authenticated: null, reason: 'Not part of this local fixture.' }) })])) })
  const invoke = (name, args = {}, signal = new AbortController().signal) => ctx.tools.execute({ name, arguments: args, agent, signal, callId: crypto.randomUUID() })
  t.after(async () => { await ctx.fiber.dispose(); rmSync(dir, { recursive: true, force: true }) })
  return { ctx, agent, dir, invoke, approvals, questions }
}

test('official subprocess and Codex adapter discover the synthetic CLI without a model turn', async t => {
  const h = await stdioCodexHarness(t)
  const response = await h.invoke('dsh_x_agents_inspect')
  assert.equal(response.isError, false, JSON.stringify(response))
  const codex = response.value.catalog.find(runtime => runtime.id === 'codex')
  assert.equal(codex.available, true, JSON.stringify(codex))
  assert.equal(codex.version, '0.153.4-fixture')
  assert.equal(codex.authenticated, true)
  assert.equal(codex.models[0].id, 'codex-fixture')
  assert.equal(response.value.task, null)
  assert.equal(h.approvals.length, 0)
})

test('official stdio fixture checkpoints, streams and explicitly resumes its native thread', async t => {
  const h = await stdioCodexHarness(t)
  const first = await h.invoke('dsh_x_agents_run', { runtime: 'codex', model: 'codex-fixture', prompt: 'Exercise local fixture events.' })
  assert.equal(first.isError, false, JSON.stringify(first))
  assert.equal(first.value.task.state, 'completed', JSON.stringify(first.value.task))
  assert.match(first.value.task.nativeSessionId, /^codex-fixture-thread-/)
  assert.match(first.value.task.summary, /No model or command was run/)
  for (const type of ['session', 'assistant', 'tool', 'plan', 'usage']) assert.ok(first.value.task.events.some(event => event.type === type), type)
  const next = await h.invoke('dsh_x_agents_run', { runtime: 'codex', model: 'codex-fixture', prompt: 'Continue the synthetic native thread.', taskId: first.value.task.id, expectedRevision: first.value.revision, scope: first.value.scope })
  assert.equal(next.isError, false, JSON.stringify(next))
  assert.equal(next.value.task.state, 'completed', JSON.stringify(next.value.task))
  assert.equal(next.value.task.nativeSessionId, first.value.task.nativeSessionId)
})

test('official stdio native approval is separate from launch approval and grants only once', async t => {
  const h = await stdioCodexHarness(t)
  const response = await h.invoke('dsh_x_agents_run', { runtime: 'codex', prompt: 'fixture:approval' })
  assert.equal(response.isError, false, JSON.stringify(response))
  assert.equal(response.value.task.state, 'completed', JSON.stringify(response.value.task))
  assert.equal(h.approvals.length, 2)
  assert.match(h.approvals[1].reason, /echo fixture-only/)
  assert.match(h.approvals[1].reason, /Allow once/)
  assert.match(response.value.task.summary, /"decision":"accept"/)
  assert.doesNotMatch(response.value.task.summary, /acceptForSession/)
})

test('official stdio native question uses the host question service and returns exact selected labels', async t => {
  const h = await stdioCodexHarness(t)
  const response = await h.invoke('dsh_x_agents_run', { runtime: 'codex', prompt: 'fixture:input' })
  assert.equal(response.isError, false, JSON.stringify(response))
  assert.equal(response.value.task.state, 'completed', JSON.stringify(response.value.task))
  assert.equal(h.questions.length, 1)
  assert.equal(h.questions[0].questions[0].id, 'colour')
  assert.match(response.value.task.summary, /"answers":\["Blue"\]/)
})

test('official stdio cancellation waits for managed process cleanup before releasing the task', async t => {
  const h = await stdioCodexHarness(t)
  const controller = new AbortController()
  const pending = h.invoke('dsh_x_agents_run', { runtime: 'codex', prompt: 'fixture:hang' }, controller.signal)
  let snapshot
  for (let attempt = 0; attempt < 100; attempt++) {
    snapshot = await h.invoke('dsh_x_agents_inspect')
    if (snapshot.value?.task?.events.some(event => event.type === 'assistant')) break
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.ok(snapshot.value?.task?.nativeSessionId, JSON.stringify(snapshot))
  controller.abort(new Error('Stop the synthetic fixture.'))
  const cancelled = await pending
  // ToolRuntime may wrap caller cancellation; the durable state remains the
  // source of truth after the adapter's managed cleanup has settled.
  const final = await h.invoke('dsh_x_agents_inspect')
  assert.equal(final.value.task.state, 'cancelled', JSON.stringify({ cancelled, final }))
  assert.ok(final.value.task.allowedActions.includes('request-continue'))
})

test('official plugin refuses a restricted native process without a real sandbox backend', async t => {
  const h = await stdioCodexHarness(t, { mode: 'workspace-write' })
  const response = await h.invoke('dsh_x_agents_run', { runtime: 'codex', prompt: 'No sandbox backend is installed in this fixture.' })
  assert.equal(response.isError, false, JSON.stringify(response))
  assert.equal(response.value.task.state, 'blocked')
  assert.equal(response.value.task.nativeSessionId, null)
  assert.equal(h.approvals.length, 0)
})
