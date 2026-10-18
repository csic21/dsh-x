import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {Context} from '@deepseek-ai/cordis'
import ToolRuntime,{defineTool} from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SubprocessLocal from '@deepseek-ai/dsh-subprocess-local'
import * as agents from '../packages/dsh-x-agents/lib/index.js'
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}}
async function fixture(t,run,approve=async()=> 'allowed-once'){
 const dir=mkdtempSync(path.join(tmpdir(),'agents-browser-bridge-')),ctx=new Context(),agent={session:{id:crypto.randomUUID()}}
 await ctx.plugin(SystemPrompt);await ctx.plugin(ToolRuntime);await ctx.plugin(SubprocessLocal)
 ctx.provide('profileContext',{dir});ctx.provide('workingDirectory',{ensure:async()=>dir,get:()=>dir});ctx.provide('sandboxPolicy',{resolve:()=>({mode:'workspace-write',workspaceRoot:dir})});ctx.provide('approval',{request:approve})
 const lifetimes=new Map();let childCalls=0
 ctx.provide('dshXBrowserOwnership',{bind(token,lifetime){lifetimes.set(token,lifetime);return()=>lifetimes.delete(token)}})
 for(const name of ['dsh_x_browser_tabs','dsh_x_browser_action'])ctx.tools.register(defineTool({name,parameters:{},description:'Synthetic Browser body for bridge integration only',output:{schema:{type:'object',additionalProperties:true,properties:{}},render:()=>[]},execute:async(_args,exec)=>{childCalls++;assert.ok(lifetimes.has(exec.parent));assert.equal(exec.agent,agent);if(name.endsWith('action'))assert.equal(await ctx.get('approval').request({agent,signal:exec.signal,callId:exec.callId,toolName:name}),'allowed-once');return{visibleFixture:true}}}))
 const driver={id:'opencode',capabilities:{ownedBrowser:true,resume:false},backendIdentity:'synthetic-owned',discover:async()=>({available:true,authenticated:true,models:[{id:'opencode/fixture',free:true}],capabilities:{ownedBrowser:true,resume:false}}),run}
 await ctx.plugin(agents,{adapters:{opencode:()=>driver}})
 const invoke=(name,args)=>ctx.tools.execute({name,arguments:args,agent,signal:new AbortController().signal,callId:crypto.randomUUID()})
 t.after(async()=>{await ctx.fiber.dispose();rmSync(dir,{recursive:true,force:true})})
 return{ctx,invoke,agent,lifetimes,childCalls:()=>childCalls}
}
test('official ToolRuntime permits only exact ticketed Browser children inside one owned native run',async t=>{
 let bridge;const entered=deferred(),finish=deferred(),approvals=[]
 const h=await fixture(t,async args=>{bridge=args.browser;entered.resolve();await finish.promise;await bridge.invoke('dsh_x_browser_tabs',{});await bridge.invoke('dsh_x_browser_action',{});return{status:'completed',summary:'Synthetic bridge validation only'}},async request=>{approvals.push(request);return'allowed-once'})
 const running=h.invoke('dsh_x_agents_run',{runtime:'opencode',prompt:'Synthetic fixture',model:'opencode/fixture',browser:true});await entered.promise
 const unrelated=await h.invoke('dsh_x_browser_tabs',{});assert.equal(unrelated.isError,true);assert.equal(h.childCalls(),0)
 finish.resolve();const result=await running;assert.equal(result.isError,false,JSON.stringify(result));assert.equal(result.value.task.state,'completed');assert.equal(h.childCalls(),2);assert.equal(approvals.length,2);assert.equal(h.lifetimes.size,0)
 await assert.rejects(bridge.invoke('dsh_x_browser_tabs',{}),/unavailable/)
})
test('denied native launch creates no Browser authority or child invocation',async t=>{
 let runs=0;const h=await fixture(t,async()=>{runs++},async()=> 'rejected')
 const result=await h.invoke('dsh_x_agents_run',{runtime:'opencode',prompt:'Synthetic fixture',model:'opencode/fixture',browser:true})
 assert.equal(result.value.task.state,'blocked');assert.equal(runs,0);assert.equal(h.lifetimes.size,0);assert.equal(h.childCalls(),0)
})
