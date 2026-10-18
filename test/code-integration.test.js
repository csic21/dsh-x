import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import LlmRuntime, { LlmAdapter } from '@deepseek-ai/dsh-llm'
import SubprocessLocal from '@deepseek-ai/dsh-subprocess-local'
import * as agents from '../packages/dsh-x-agents/lib/index.js'
import * as code from '../packages/dsh-x-code/lib/index.js'
import { createCodeRoute } from '../packages/dsh-x-code/lib/routes.js'
import { createReviewStore } from '../packages/dsh-x-code/lib/store.js'

// Official Cordis, ToolRuntime, managed Git subprocess, durable stores, native
// approval bridge, and Code/Agents ownership are real. Only the model driver is
// synthetic: no external model, credentials, account or network calls occur.
async function harness(t,options={}) {
 const root=mkdtempSync(path.join(tmpdir(),'code-official-')),profile=mkdtempSync(path.join(tmpdir(),'code-profile-'))
 const git=(...args)=>execFileSync('git',args,{cwd:root,stdio:'pipe'}).toString();git('init','-q');writeFileSync(path.join(root,'app.js'),'export const divide = (a, b) => a / b\n');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','initial')
 const ctx=new Context(),routes=[];ctx.provide('connection',{fetch:{register:route=>{routes.push(route);return()=>{}}}});await ctx.plugin(SystemPrompt);await ctx.plugin(ToolRuntime);await ctx.plugin(SubprocessLocal)
 let cwd=root,policyRoot=root
 const agent={id:'code-session',session:{id:'code-session',requestHeader:()=>({config:{provider:'code-fixture',model:'code-fixture-model'}})}},approvals=[],turns=[],llmCalls=[]
 if(options.llm){await ctx.plugin(LlmRuntime);class FixtureLlm extends LlmAdapter {async *stream(input){llmCalls.push(input);if(options.llmStream){yield* options.llmStream(input);return}assert.deepEqual(input.tools,[]);assert.equal(input.messages.length,1);const prompt=input.messages[0].content[0].text;const files=JSON.parse(prompt.split('SOURCE_DATA=')[1]);yield {type:'text-delta',index:0,text:JSON.stringify({version:1,summary:'Synthetic official DSH model snapshot review',findings:files[0].after.includes('b === 0')?[]:[{path:files[0].path,startLine:1,endLine:1,severity:'medium',title:'Zero divisor',body:'Zero gives Infinity.',evidence:'a / b',trigger:'b=0'}],checks:[{name:'Tests',status:'not_run',evidence:'No tests executed.'}]})};yield {type:'finish',reason:{kind:'stop'}}}}ctx.llm.registerAdapter(['code-fixture'],new FixtureLlm())}
 ctx.provide('profileContext',{dir:profile});ctx.provide('workingDirectory',{ensure:async()=>cwd,get:()=>cwd});ctx.provide('sessions',{get:id=>id===agent.session.id?agent.session:null});ctx.provide('sandboxPolicy',{resolve:()=>({mode:'workspace-write',workspaceRoot:policyRoot,sessionId:agent.session.id})});ctx.provide('approval',{request:async req=>{approvals.push(req);return options.approve?options.approve(req,approvals.length,root):'allowed-once'}})
 const driver={capabilities:{nativeSessions:true,permissions:true},discover:async()=>({available:true,authenticated:true,models:[]}),run:async args=>{
  turns.push(args);await args.onEvent({type:'session',data:{nativeSessionId:'code-native-'+turns.length}})
  if(options.run)return options.run(args,root)
  if(args.prompt.startsWith('CODE_REPAIR_V1')) {
   const allowed=await args.requestPermission({id:'repair-file',nativeSessionId:'code-native-'+turns.length,title:'Repair selected fixture',details:{file:'app.js',effect:'Add zero guard'},options:[{id:'once',kind:'allow_once',label:'Allow once'},{id:'no',kind:'reject_once',label:'Decline'}]})
   if(allowed.optionId!=='once')return {status:'blocked',reason:'Fixture repair denied.'}
   writeFileSync(path.join(root,'app.js'),'export const divide = (a, b) => b === 0 ? null : a / b\n');return {status:'completed',summary:'Synthetic fixture changed app.js. No tests were executed.'}
  }
  assert.equal(args.sandboxPolicy.mode,'read-only')
  const source=JSON.parse(args.prompt.split('SOURCE_DATA=')[1]),file=source.find(f=>f.path==='app.js')
  return {status:'completed',summary:JSON.stringify({version:1,summary:'Synthetic fixture source-only review; no real model.',findings:file&&!file.after.includes('b === 0')?[{path:'app.js',startLine:1,endLine:1,severity:'medium',title:'Zero divisor produces Infinity',body:'The caller expects a nullable quotient.',evidence:'a / b',trigger:'Call divide(1, 0).'}]:[],checks:[{name:'Tests',status:'not_run',evidence:'No test was executed by this fixture.'}]})}
 }}
 if(options.agents!==false)await ctx.plugin(agents,{adapters:{codex:()=>driver,claude:()=>driver,grok:()=>driver,opencode:()=>driver}})
 const codeFiber=await ctx.plugin(code)
 const invoke=(name,args={},signal=new AbortController().signal)=>ctx.tools.execute({name,arguments:args,agent,signal,callId:crypto.randomUUID()})
 const inspect=()=>invoke('dsh_x_code_inspect'),argsOf=s=>({scope:s.scope,workspaceId:s.workspace.id,mode:s.workspace.mode,paths:['app.js'],runtime:'codex'})
 t.after(async()=>{await ctx.fiber.dispose();rmSync(root,{recursive:true,force:true});rmSync(profile,{recursive:true,force:true})})
 return {root,profile,ctx,agent,invoke,inspect,argsOf,approvals,turns,git,llmCalls,codeFiber,routes,setCwd:value=>{cwd=value;policyRoot=value},setPolicyRoot:value=>{policyRoot=value}}
}
test('official Code → Agents review, selected repair and re-review retain immutable findings and truthful tests',async t=>{
 const h=await harness(t),initial=await h.inspect();assert.equal(initial.isError,false,JSON.stringify(initial));assert.equal(initial.value.files.length,1)
 const first=await h.invoke('dsh_x_code_review',h.argsOf(initial.value));assert.equal(first.isError,false,JSON.stringify(first));assert.equal(first.value.review.state,'completed',JSON.stringify(first.value.review));assert.equal(first.value.review.findings.length,1);assert.equal(first.value.review.repairReady,true);assert.equal(h.approvals.length,1)
 const review=first.value.review,old=await h.invoke('dsh_x_code_file',{scope:first.value.scope,reviewId:review.id,path:'app.js'});assert.equal(old.value.immutable,true)
 const repaired=await h.invoke('dsh_x_code_repair',{scope:first.value.scope,reviewId:review.id,findingIds:[review.findings[0].id],runtime:'codex'});assert.equal(repaired.isError,false,JSON.stringify(repaired));assert.equal(repaired.value.review.repair.state,'completed');assert.equal(repaired.value.review.findings[0].status,'open');assert.equal(repaired.value.review.stale,true);assert.equal(h.approvals.length,3);assert.equal(repaired.value.review.repair.verification,'required')
 const after=await h.inspect(),verified=await h.invoke('dsh_x_code_review',{...h.argsOf(after.value),previousReviewId:review.id});assert.equal(verified.isError,false,JSON.stringify(verified));assert.equal(verified.value.review.findings.length,0);assert.equal(verified.value.review.verification.result,'no_findings_in_scope');assert.equal(verified.value.review.verification.testsVerified,false);assert.equal(verified.value.history[0].findings,1)
 const immutable=await h.invoke('dsh_x_code_file',{scope:first.value.scope,reviewId:review.id,path:'app.js'});assert.equal(immutable.value.text,old.value.text);assert.doesNotMatch(immutable.value.text,/b === 0/)
})
test('Code browsing works without Agents and native review reports dependency instead of hiding',async t=>{
 const h=await harness(t,{agents:false}),initial=await h.inspect();assert.equal(initial.value.agentsAvailable,false)
 const result=await h.invoke('dsh_x_code_review',h.argsOf(initial.value));assert.equal(result.isError,true);assert.equal(result.error.info.code,'CODE_AGENTS');assert.equal(h.turns.length,0)
})
test('rejecting native launch sends no review source prompt and preserves blocked record',async t=>{
 const h=await harness(t,{approve:async()=> 'rejected'}),initial=await h.inspect(),result=await h.invoke('dsh_x_code_review',h.argsOf(initial.value));assert.equal(result.value.review.state,'blocked');assert.equal(h.turns.length,0)
})
test('edited file invalidates workspaceId before review and old findings before repair',async t=>{
 const h=await harness(t),initial=await h.inspect();writeFileSync(path.join(h.root,'app.js'),'export const divide = (a, b) => a / b + 1\n')
 const stale=await h.invoke('dsh_x_code_review',h.argsOf(initial.value));assert.equal(stale.isError,true);assert.equal(stale.error.info.code,'CODE_STALE');assert.equal(h.turns.length,0)
 const current=await h.inspect(),reviewed=await h.invoke('dsh_x_code_review',h.argsOf(current.value));writeFileSync(path.join(h.root,'app.js'),'export const divide = (a, b) => a / b + 2\n')
 const fix=await h.invoke('dsh_x_code_repair',{scope:reviewed.value.scope,reviewId:reviewed.value.review.id,findingIds:[reviewed.value.review.findings[0].id],runtime:'codex'});assert.equal(fix.isError,true);assert.equal(fix.error.info.code,'CODE_STALE');assert.equal(h.turns.length,1)
})
test('changes during native repair launch approval block dispatch at the final freshness hook',async t=>{
 const h=await harness(t,{approve:async(req,n,root)=>{if(n===2)writeFileSync(path.join(root,'app.js'),'export const changedWhileApproving = true\n');return 'allowed-once'}})
 const initial=await h.inspect(),reviewed=await h.invoke('dsh_x_code_review',h.argsOf(initial.value));const result=await h.invoke('dsh_x_code_repair',{scope:reviewed.value.scope,reviewId:reviewed.value.review.id,findingIds:[reviewed.value.review.findings[0].id],runtime:'codex'})
 assert.equal(result.value.review.repair.state,'blocked');assert.equal(h.turns.length,1);assert.match(readFileSync(path.join(h.root,'app.js'),'utf8'),/changedWhileApproving/)
})
test('staged and committed findings cannot repair a different worktree',async t=>{
 const h=await harness(t),initial=await h.invoke('dsh_x_code_inspect',{mode:'staged'}),reviewed=await h.invoke('dsh_x_code_review',h.argsOf(initial.value));assert.equal(reviewed.value.review.repairReady,false)
 const result=await h.invoke('dsh_x_code_repair',{scope:reviewed.value.scope,reviewId:reviewed.value.review.id,findingIds:[reviewed.value.review.findings[0].id],runtime:'codex'});assert.equal(result.error.info.code,'CODE_REPAIR_MODE')
})
test('malformed model findings fail the review without silently claiming no issues',async t=>{
 const h=await harness(t,{run:async()=>({status:'completed',summary:'Looks good, all tests pass!'})}),initial=await h.inspect(),result=await h.invoke('dsh_x_code_review',h.argsOf(initial.value));assert.equal(result.isError,true);assert.equal(result.error.info.code,'CODE_RESULT');const last=await h.inspect();assert.equal(last.value.review.state,'failed');assert.deepEqual(last.value.review.findings,[])
})
test('RPC accepts bounded typed envelopes and rejects arbitrary fields',async()=>{
 const route=createCodeRoute('code/snapshot',async p=>({sessionId:p.sessionId}),['sessionId'])
 const request=payload=>new Request('http://localhost/api/code/snapshot',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',method:'code/snapshot',rpcId:'one',payload})})
 assert.equal((await route.fetch(request({sessionId:'one',cwd:'/etc'}))).status,400)
 assert.equal((await route.fetch(request({sessionId:'one'}))).status,200)
 assert.equal((await route.fetch(request({sessionId:'字'.repeat(3000)}))).status,413)
 assert.equal((await route.fetch(new Request('http://localhost',{method:'POST',headers:{'content-type':'text/plain'},body:'{}'}))).status,415)
})

test('default DSH review uses official LlmRuntime with bounded source and zero tools/history, independently of Agents',async t=>{
 const h=await harness(t,{llm:true,agents:false}),initial=await h.inspect();assert.equal(initial.value.dshAvailable,true);assert.deepEqual(initial.value.dshModel,{provider:'code-fixture',model:'code-fixture-model'})
 const result=await h.invoke('dsh_x_code_review',{...h.argsOf(initial.value),runtime:'dsh'});assert.equal(result.isError,false,JSON.stringify(result));assert.equal(result.value.review.state,'completed');assert.equal(result.value.review.findings.length,1);assert.equal(result.value.review.provider,'code-fixture');assert.equal(h.turns.length,0);assert.equal(h.llmCalls.length,1);assert.match(h.approvals[0].reason,/provider charges/);assert.match(h.approvals[0].reason,/app.js/)
 const request=createReviewStore(h.profile).read(h.agent.session.id).reviews.at(-1).request;assert.deepEqual(request.messages,h.llmCalls[0].messages);assert.equal(request.system,h.llmCalls[0].system);assert.deepEqual(request.tools,[]);assert.equal(request.sessionId,h.agent.session.id);assert.equal(request.config.maxTokens,h.llmCalls[0].maxTokens)
})
test('default review rejects launch denial, tool attempts and incomplete provider output',async t=>{
 const denied=await harness(t,{llm:true,agents:false,approve:async()=> 'rejected'}),initial=await denied.inspect();const result=await denied.invoke('dsh_x_code_review',{...denied.argsOf(initial.value),runtime:'dsh'});assert.equal(result.isError,true);assert.equal(denied.llmCalls.length,0);assert.equal((await denied.inspect()).value.review.state,'blocked')
 const malicious=await harness(t,{llm:true,agents:false,llmStream:async function*(){yield {type:'tool-call-delta',index:0,id:'bad',name:'read',argumentsDelta:'{}'}}}),snap=await malicious.inspect();const bad=await malicious.invoke('dsh_x_code_review',{...malicious.argsOf(snap.value),runtime:'dsh'});assert.equal(bad.isError,true);assert.equal(bad.error.info.code,'CODE_RESULT');assert.equal(malicious.turns.length,0)
})
test('Code-only unload cancels pending approval before any late native launch',async t=>{
 let ready,allow;const waiting=new Promise(r=>{ready=r});const h=await harness(t,{approve:async()=>{ready();return new Promise(r=>{allow=r})}}),initial=await h.inspect();const pending=h.invoke('dsh_x_code_review',h.argsOf(initial.value));await waiting;const disposed=h.codeFiber.dispose();allow('allowed-once');await Promise.all([pending,disposed]);assert.equal(h.turns.length,0)
})

test('Code-owned cancellation requires the exact scoped live operation and drains native execution',async t=>{
 let ready;const entered=new Promise(r=>{ready=r});const h=await harness(t,{run:async args=>{ready();await new Promise((resolve,reject)=>{args.signal.addEventListener('abort',()=>reject(args.signal.reason),{once:true})});return {status:'completed',summary:'unreachable'}}}),initial=await h.inspect();const pending=h.invoke('dsh_x_code_review',h.argsOf(initial.value));await entered
 const state=(await h.inspect()).value;assert.equal(state.operation.state,'reviewing');const route=h.routes.find(r=>r.path==='/api/code/cancel');assert.ok(route)
 const cancel=async operationId=>(await route.fetch(new Request('http://localhost/api/code/cancel',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',method:'code/cancel',rpcId:'cancel',payload:{sessionId:h.agent.session.id,scope:state.scope,operationId}})}))).json()
 assert.equal((await cancel('wrong-operation')).result.error.code,'CODE_STALE');assert.equal((await cancel(state.operation.id)).result.ok,true);await pending;const end=(await h.inspect()).value;assert.equal(end.operation,null);assert.equal(end.review.state,'cancelled')
})

test('historical findings remain inspectable but another repository cannot verify or expose them',async t=>{
 const h=await harness(t,{llm:true}),initial=await h.inspect(),reviewed=await h.invoke('dsh_x_code_review',{...h.argsOf(initial.value),runtime:'dsh'}),old=reviewed.value.review
 const detailRoute=h.routes.find(r=>r.path==='/api/code/review');const detail=async()=> (await detailRoute.fetch(new Request('http://localhost/api/code/review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'history',method:'code/review',payload:{sessionId:h.agent.session.id,scope:reviewed.value.scope,reviewId:old.id}})}))).json()
 const found=(await detail()).result.value;assert.equal(found.findings.length,1);assert.equal(found.isLatest,true);assert.equal(found.request,undefined);assert.equal(found.snapshot,undefined)
 const other=await harness(t);h.setCwd(other.root);const switched=await h.inspect();assert.equal(switched.value.review,null);assert.deepEqual(switched.value.history,[]);const cross=await h.invoke('dsh_x_code_review',{...h.argsOf(switched.value),runtime:'dsh',previousReviewId:old.id});assert.equal(cross.error.info.code,'CODE_VERIFY');assert.equal((await detail()).result.error.code,'CODE_BINDING')
 const source=await h.invoke('dsh_x_code_file',{scope:reviewed.value.scope,reviewId:old.id,path:'app.js'});assert.equal(source.error.info.code,'CODE_BINDING')
 h.setCwd(h.root);h.setPolicyRoot(other.root);assert.equal((await detail()).result.error.code,'CODE_BOUNDARY')
})
