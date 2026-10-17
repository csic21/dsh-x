import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as plan from '../packages/dsh-x-plan/index.js'
import { writeNewPlan, sessionPlansDir } from '../packages/dsh-x-plan/src/store.js'

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
    assert.ok(JSON.stringify((await ctx.systemPrompt.assemble()).sections).includes('dsh_x_plan'))
  } finally {
    await ctx.fiber.dispose()
    if(previous===undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME=previous
    rmSync(home,{recursive:true,force:true})
  }
})
