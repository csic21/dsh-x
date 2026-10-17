import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createTaskStore } from '../src/store.js'
import { createAgentsController } from '../src/controller.js'
function fixture(options={}) {
 const dir=mkdtempSync(path.join(tmpdir(),'agents-controller-')),store=createTaskStore(dir)
 let cwd=dir, policy={mode:'workspace-write',workspaceRoot:dir}, approvals=0, calls=0
 const exec={agent:{session:{id:'session-one'}},signal:new AbortController().signal}
 const driver={capabilities:{nativeSessions:true,resume:true,permissions:true},discover:async()=>({available:true,authenticated:true,models:[{id:'test-model',label:'Test fixture'}]}),run:async args=>{calls++;await args.onEvent({type:'session',data:{nativeSessionId:args.nativeSessionId??'native-one'}});return options.run?options.run(args):{nativeSessionId:'native-one',status:'completed',summary:'Fixture output'}}}
 const controller=createAgentsController({store,adapter:async()=>driver,cwdOf:async()=>cwd,policyOf:()=>policy,approve:async(...args)=>{approvals++;return options.approve?options.approve(...args):true},askInput:options.askInput,trustedExternalRuntime:options.trustedExternalRuntime})
 return {controller,store,exec,dir,setPolicy:value=>{policy=value},setCwd:value=>{cwd=value},counts:()=>({approvals,calls}),driver}
}
const args={runtime:'codex',prompt:'Fixture task',model:'test-model'}
test('one native session is preserved across explicit version-bound turns',async()=>{
 const h=fixture(),first=await h.controller.run(args,h.exec);assert.equal(first.task.state,'completed');assert.equal(first.task.nativeSessionId,'native-one')
 const second=await h.controller.run({...args,scope:first.scope,taskId:first.task.id,expectedRevision:first.revision},h.exec)
 assert.equal(second.task.id,first.task.id);assert.equal(second.task.nativeSessionId,'native-one');assert.equal(h.counts().calls,2)
 assert.equal(h.store.hasLock('session-one'),false)
})
test('declined launch never dispatches native turn',async()=>{
 const h=fixture({approve:async()=>false});const result=await h.controller.run(args,h.exec);assert.equal(result.task.state,'blocked');assert.equal(h.counts().calls,0)
})
test('native approval grants exactly the one-time option and rejects replay',async()=>{
 let response
 const h=fixture({run:async run=>{const request={id:'permission-1',nativeSessionId:'native-one',title:'Write file',details:'fixture.txt',options:[{id:'persist',kind:'allow_always',label:'Always'},{id:'single',kind:'allow_once',label:'Once'}]};response=await run.requestPermission(request);await assert.rejects(()=>run.requestPermission(request),/Repeated/);return{nativeSessionId:'native-one',status:'completed',summary:'done'}}})
 await h.controller.run(args,h.exec);assert.deepEqual(response,{optionId:'single'});assert.equal(h.counts().approvals,2)
})
test('always-only and cross-session native permission requests cannot grant',async()=>{
 const h=fixture({run:async run=>{assert.deepEqual(await run.requestPermission({id:'a',nativeSessionId:'native-one',title:'persist',options:[{id:'all',kind:'allow_always'}]}),{optionId:null});await assert.rejects(()=>run.requestPermission({id:'b',nativeSessionId:'wrong',options:[{id:'once',kind:'allow_once'}]}),/another session/);return{status:'completed',summary:'done'}}})
 await h.controller.run(args,h.exec);assert.equal(h.counts().approvals,1)
})
test('policy changes during approval prevent dispatch',async()=>{
 let h;h=fixture({approve:async()=>{h.setPolicy({mode:'read-only',workspaceRoot:h.dir});return true}})
 const result=await h.controller.run(args,h.exec);assert.equal(result.task.state,'blocked');assert.equal(h.counts().calls,0)
})
test('missing authentication and restricted OpenCode block without model turn',async()=>{
 const h=fixture();h.driver.discover=async()=>({available:true,authenticated:false,reason:'Login required'})
 assert.equal((await h.controller.run(args,h.exec)).task.state,'blocked');assert.equal(h.counts().calls,0)
 const b=fixture({trustedExternalRuntime:true});assert.match((await b.controller.run({...args,runtime:'opencode'},b.exec)).task.reason,/unsupported/);assert.equal(b.counts().calls,0)
})
test('uncertain cleanup retains durable run fence',async()=>{
 const h=fixture({run:async()=>{throw Object.assign(new Error('Stop unconfirmed'),{code:'AGENTS_CLEANUP_UNCONFIRMED'})}})
 const result=await h.controller.run(args,h.exec);assert.equal(result.task.state,'interrupted');assert.equal(h.store.hasLock('session-one'),true);assert.deepEqual(result.task.allowedActions,['inspect']);await assert.rejects(()=>h.controller.run(args,h.exec),/owns/)
})
test('cancel is exact profile/task/revision bound and waits for driver settlement',async()=>{
 let entered;const ready=new Promise(resolve=>{entered=resolve})
 const h=fixture({run:run=>new Promise(resolve=>{entered();run.signal.addEventListener('abort',()=>resolve({status:'cancelled',summary:'Stopped'}),{once:true})})})
 const pending=h.controller.run(args,h.exec);await ready
 const snap=h.controller.snapshot('session-one');assert.throws(()=>h.controller.cancel({sessionId:'session-one',scope:'other',taskId:snap.task.id,expectedRevision:snap.revision}),/changed/)
 h.controller.cancel({sessionId:'session-one',scope:snap.scope,taskId:snap.task.id,expectedRevision:snap.revision});assert.equal((await pending).task.state,'cancelled');assert.equal(h.store.hasLock('session-one'),false)
})
test('credentials in prompts and unknown selected models fail closed',async()=>{
 const h=fixture();await assert.rejects(()=>h.controller.run({...args,prompt:'password=fixture-secret-123'},h.exec),/credentials/)
 assert.equal((await h.controller.run({...args,model:'not-listed'},h.exec)).task.state,'blocked');assert.equal(h.counts().calls,0)
})
