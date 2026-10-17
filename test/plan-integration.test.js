import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as plan from '../packages/dsh-x-plan/index.js'
import { writeNewPlan, sessionPlansDir, writeReview, readApproved } from '../packages/dsh-x-plan/src/store.js'

test('actual Cordis/ToolRuntime loads plan and enforces approval gate', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'dsh-plan-integration-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  const ctx = new Context()
  try {
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    ctx.provide('workingDirectory', { ensure: async () => home })
    ctx.provide('subprocess', {})
    await ctx.plugin(plan)
    const names = ctx.tools.schemas().map(t => t.name)
    assert.ok(names.includes('dsh_x_plan'))
    assert.ok(names.includes('dsh_x_approve_plan'))
    let wrote = false
    ctx.tools.register(defineTool({name:'write',description:'test fixture',parameters:{},output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},execute:async()=>{wrote=true;return 'wrote'}}))
    const agent = { id: 'integration-session' }
    writeNewPlan(sessionPlansDir(home,agent.id), {planner:'codex',reviewer:'claude',cwd:home,text:'Test plan'})
    const invoke = (name,args={}) => ctx.tools.execute({name,arguments:args,callId:crypto.randomUUID(),signal:new AbortController().signal,agent})
    const blocked = await invoke('write')
    assert.equal(blocked.isError,true)
    assert.equal(wrote,false)
    const approval = await invoke('dsh_x_approve_plan')
    assert.equal(approval.isError,true, 'no approval service must fail closed')
    const requests=[]
    let answer='rejected'
    ctx.provide('approval',{async request(value){requests.push(value);return answer}})
    assert.equal((await invoke('dsh_x_approve_plan')).isError,true)
    assert.throws(()=>readApproved(sessionPlansDir(home,agent.id),1),/还没批准/)
    answer='allowed-once'
    const approved=await invoke('dsh_x_approve_plan')
    assert.equal(approved.isError,false,JSON.stringify(approved))
    assert.equal(approved.meta.kind,'dsh-x-plan.result')
    assert.equal(approved.meta.operation,'approve')
    assert.equal(approved.meta.body,'Test plan')
    assert.deepEqual(Object.keys(requests.at(-1).displayReason).sort(),['en','zh'])
    assert.match(requests.at(-1).displayReason.en,/Approve plan round 1/)
    assert.match(requests.at(-1).displayReason.zh,/批准第 1 轮/)
    assert.equal((await invoke('write')).isError,false)
    assert.equal(wrote,true)
    for(let i=0;i<2;i++)writeReview(sessionPlansDir(home,agent.id),{round:1,reviewer:'claude',verdict:'fail',gaps:'Model gap 原文'})
    const stopped=await invoke('dsh_x_review')
    assert.equal(stopped.isError,false,JSON.stringify(stopped))
    assert.equal(stopped.meta.operation,'review')
    assert.equal(stopped.meta.verdict,'stopped')
    assert.equal(stopped.meta.attempt,2)
    const discarded=await invoke('dsh_x_discard_plan')
    assert.equal(discarded.isError,false,JSON.stringify(discarded))
    assert.equal(discarded.meta.operation,'discard')
    assert.match(requests.at(-1).displayReason.en,/Discard plan round 1/)
    const noDraft=await invoke('dsh_x_approve_plan')
    assert.equal(noDraft.error.info.name,'DshXPlanError')
    assert.equal(noDraft.error.info.code,'DSH_X_PLAN_NO_DRAFT')
    for(const schema of ctx.tools.schemas().filter(tool=>tool.name.startsWith('dsh_x_'))) {
      assert.equal(Object.hasOwn(schema.parameters,'body'),false)
      assert.equal(Object.hasOwn(schema.parameters,'missingVerdict'),false)
    }

    assert.ok(JSON.stringify((await ctx.systemPrompt.assemble()).sections).includes('dsh_x_plan'))
  } finally {
    await ctx.fiber.dispose()
    if(previous===undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME=previous
    rmSync(home,{recursive:true,force:true})
  }
})
