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

test('run discovers only its selected runtime and preserves the other catalog entries',async()=>{
 const h=fixture(), seen=[]
 const c=createAgentsController({store:h.store,cwdOf:async()=>h.dir,policyOf:()=>({mode:'workspace-write',workspaceRoot:h.dir}),approve:async()=>true,adapter:async runtime=>{seen.push(runtime);return h.driver}})
 const result=await c.run({...args,runtime:'grok'},h.exec)
 assert.equal(result.task.state,'completed');assert.ok(seen.every(runtime=>runtime==='grok'))
 assert.equal(result.catalog.find(item=>item.id==='claude').reason,'not-inspected')
})
test('a configuration marker alone does not authorize Claude startup',async()=>{
 const h=fixture();let text
 h.driver.discover=async()=>({available:true,authenticated:null,models:[{id:'test-model'}],authentication:{state:'configured-unverified',source:'native-account-info'},providerAuthentication:'configured-unverified'})
 const c=createAgentsController({store:h.store,cwdOf:async()=>h.dir,policyOf:()=>({mode:'workspace-write',workspaceRoot:h.dir}),adapter:async()=>h.driver,approve:async(_exec,request)=>{text=request.details;return'rejected'}})
 const result=await c.run({...args,runtime:'claude'},h.exec)
 assert.equal(result.task.state,'blocked');assert.equal(h.counts().calls,0);assert.equal(text,undefined)
 assert.equal(result.catalog.find(item=>item.id==='claude').authenticated,null)
})
test('credential configuration exceptions cannot authorize unknown sources or other runtimes',async()=>{
 for(const [runtime,source] of [['claude','environment-exists'],['grok','native-account-info'],['codex','native-account-info']]) {
  const h=fixture();h.driver.discover=async()=>({available:true,authenticated:null,models:[],authentication:{state:'configured-unverified',source}})
  const result=await h.controller.run({runtime,prompt:'Fixture task'},h.exec)
  assert.equal(result.task.state,'blocked');assert.equal(h.counts().calls,0)
 }
})

test('Grok version-only discovery defers native setup until explicit launch approval',async()=>{
 const h=fixture();let body
 h.driver.discover=async()=>({available:true,authenticated:null,models:[],authentication:{state:'requires-native-initialization',source:'version-only'}})
 const c=createAgentsController({store:h.store,cwdOf:async()=>h.dir,policyOf:()=>({mode:'workspace-write',workspaceRoot:h.dir}),adapter:async()=>h.driver,approve:async(_exec,request)=>{body=request.details;return'rejected'}})
 const result=await c.run({runtime:'grok',prompt:'Fixture task'},h.exec)
 assert.equal(result.task.state,'blocked');assert.equal(h.counts().calls,0);assert.match(body,/sync plugins/);assert.match(body,/Not checked/)
})

test('native advertised models survive version-only refresh only for the same backend',async()=>{
 const h=fixture();h.driver.backendIdentity='fixture-backend-a'
 h.driver.discover=async()=>({available:true,authenticated:null,models:[],capabilities:{models:false,resume:false},authentication:{state:'requires-native-initialization',source:'version-only'}})
 h.driver.run=async run=>{await run.onEvent({type:'session',data:{nativeSessionId:'fixture-native',models:[{id:'native-model',label:'Native model'}],capabilities:{resume:true}}});return{status:'completed',nativeSessionId:'fixture-native'}}
 const first=await h.controller.run({runtime:'grok',prompt:'Fixture'},h.exec)
 assert.equal(first.task.state,'completed');assert.equal(first.catalog.find(x=>x.id==='grok').capabilities.resume,true)
 const refreshed=await h.controller.inspect(h.exec)
 assert.equal(refreshed.catalog.find(x=>x.id==='grok').models[0].id,'native-model')
 assert.equal(refreshed.catalog.find(x=>x.id==='grok').capabilities.models,true)
 const selected=await h.controller.run({runtime:'grok',model:'native-model',prompt:'New fixture task'},h.exec)
 assert.equal(selected.task.state,'completed')
 h.driver.backendIdentity='fixture-backend-b'
 const changed=await h.controller.run({runtime:'grok',model:'native-model',prompt:'Other backend'},h.exec)
 assert.equal(changed.task.state,'blocked');assert.match(changed.task.reason,/not advertised/)
})

test('model preparation is approved, prompt-free and does not create or replace a task',async()=>{
 const h=fixture();let probes=0
 h.driver.discoverModels=async()=>{probes++;return{available:true,authenticated:null,version:'1',models:[{id:'listed',label:'Listed'}],authentication:{state:'unconfigured',source:'native-initialize'}}}
 const empty=await h.controller.models({runtime:'grok',scope:h.store.scope},h.exec)
 assert.equal(empty.task,null);assert.equal(empty.modelRuntime,'grok');assert.equal(empty.catalog.find(x=>x.id==='grok').models[0].id,'listed');assert.equal(h.counts().calls,0)
 const first=await h.controller.run(args,h.exec), before=structuredClone(first.task)
 const after=await h.controller.models({runtime:'claude',scope:h.store.scope},h.exec)
 assert.deepEqual(after.task,before);assert.equal(after.catalog.find(x=>x.id==='claude').authenticated,null);assert.equal(probes,2)
})
test('model preparation denial and stale profile dispatch nothing',async()=>{
 const h=fixture({approve:async()=>false});let probes=0;h.driver.discoverModels=async()=>{probes++;return{available:true,models:[]}}
 await assert.rejects(()=>h.controller.models({runtime:'grok',scope:'wrong'},h.exec),/scope/)
 await assert.rejects(()=>h.controller.models({runtime:'grok',scope:h.store.scope},h.exec),/not approved/)
 assert.equal(probes,0);assert.equal(h.store.snapshot('session-one').task,null);assert.equal(h.store.hasLock('session-one'),false)
})
test('model cleanup uncertainty keeps a durable fence without overwriting task',async()=>{
 const h=fixture();const before=await h.controller.run(args,h.exec)
 h.driver.discoverModels=async()=>{throw Object.assign(new Error('Unknown cleanup'),{code:'AGENTS_CLEANUP_UNCONFIRMED'})}
 await assert.rejects(()=>h.controller.models({runtime:'claude',scope:h.store.scope},h.exec),{code:'AGENTS_CLEANUP_UNCONFIRMED'})
 assert.equal(h.store.hasLock('session-one'),true);assert.deepEqual(h.store.read('session-one').task.id,before.task.id)
 await assert.rejects(()=>h.controller.models({runtime:'grok',scope:h.store.scope},h.exec),/owns/)
})
test('model directory preserves more than one hundred advertised models',async()=>{
 const h=fixture();h.driver.discoverModels=async()=>({available:true,models:Array.from({length:230},(_,i)=>({id:`m-${i}`,label:`Model ${i}`}))})
 const result=await h.controller.models({runtime:'codex',scope:h.store.scope},h.exec)
 assert.equal(result.catalog[0].models.length,230);assert.equal(result.catalog[0].modelCatalog.truncated,false)
})

test('catalog expiry is honest and status refresh does not extend native freshness',async()=>{
 let time=1_700_000_000_000;const dir=mkdtempSync(path.join(tmpdir(),'agents-model-ttl-')),store=createTaskStore(dir)
 const driver={backendIdentity:'fixed',capabilities:{nativeSessions:true,models:true},discover:async()=>({available:true,version:'1',authenticated:null,models:[],authentication:{state:'requires-native-initialization',source:'version-only'}}),discoverModels:async()=>({available:true,version:'1',authenticated:null,models:[{id:'listed',label:'Listed'}]})}
 const c=createAgentsController({store,adapter:async()=>driver,cwdOf:async()=>dir,policyOf:()=>({mode:'workspace-write',workspaceRoot:dir}),approve:async()=>true,now:()=>time,modelTtlMs:100})
 const exec={agent:{session:{id:'ttl-session'}},signal:new AbortController().signal}
 const first=await c.models({runtime:'grok',scope:store.scope},exec),stamp=first.catalog[3].modelCatalog.fetchedAt
 time+=101;assert.equal(c.snapshot('ttl-session').catalog[3].modelCatalog.status,'stale')
 const next=await c.inspect(exec);assert.equal(next.catalog[3].modelCatalog.status,'stale');assert.equal(next.catalog[3].modelCatalog.fetchedAt,stamp)
 driver.discoverModels=async()=>{throw new Error('fixture offline')}
 await assert.rejects(()=>c.models({runtime:'grok',scope:store.scope},exec),/offline/)
 const failed=await c.inspect(exec);assert.equal(failed.catalog[3].modelCatalog.status,'failed');assert.equal(failed.catalog[3].models[0].id,'listed')
})
