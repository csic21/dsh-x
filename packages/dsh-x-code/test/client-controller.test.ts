import test from 'node:test'
import assert from 'node:assert/strict'
import { createCodeController } from '../src/client/controller.ts'
const deferred=()=>{let resolve!: (value: any) => void;const promise=new Promise<any>(value=>resolve=value);return {promise,resolve}}
const tick=()=>new Promise<any>(resolve=>setTimeout(resolve,0))
const snap=(mode='worktree',id='v1')=>({scope:'scope',sessionId:'session',revision:1,workspace:{id,mode,baseRef:'main'},files:[{path:'a.js',status:'modified',selectable:true}],limits:{maxSelectedFiles:20},review:null})
const ok=(value: any)=>({ok:true,value})

test('late scope read never replaces a newer target or leaks prior file content',async()=>{
 const pending: any[]=[],rpc={call(_api: any,name: any,args: any){const value=deferred();pending.push({name,args,...value});return value.promise}},controller=createCodeController(rpc,{pollMs:100000}),source=controller.source('session'),unsubscribe=source.subscribe(()=>{})
 try{assert.equal(pending[0].args.mode,'worktree');controller.selectTarget('session','staged');assert.equal(pending[1].args.mode,'staged');pending[1].resolve(ok(snap('staged','stage')));await tick();pending[0].resolve(ok(snap()));await tick();assert.equal(source.getSnapshot().snapshot!.workspace.id,'stage')
 const a=controller.loadFile('session',{scope:'scope',workspaceId:'stage',path:'a.js',mode:'staged'});const first=pending.at(-1);const b=controller.loadFile('session',{scope:'scope',workspaceId:'stage',path:'b.js',mode:'staged'});const second=pending.at(-1);assert.equal(source.getSnapshot().file,null);second.resolve(ok({path:'b.js',kind:'text',text:'B',beforeText:''}));await b;first.resolve(ok({path:'a.js',kind:'text',text:'A',beforeText:''}));await a;assert.equal(source.getSnapshot().file!.text,'B')
 }finally{unsubscribe();controller.dispose()}
})
test('connection reset clears cached source and disables unconfirmed actions',async()=>{
 const controller=createCodeController({call:async(_api,name)=>name==='code/snapshot'?ok(snap()):ok({path:'a.js',kind:'text',text:'secret-free fixture',beforeText:''})},{pollMs:100000}),source=controller.source('session'),unsubscribe=source.subscribe(()=>{})
 try{await tick();await controller.loadFile('session',{scope:'scope',workspaceId:'v1',path:'a.js',mode:'worktree'});assert.equal(source.getSnapshot().fileStatus,'ready');controller.reset();assert.equal(source.getSnapshot().snapshot,null);assert.equal(source.getSnapshot().file,null);assert.equal((await controller.cancel('session')).ok,false)}finally{unsubscribe();controller.dispose()}
})
test('missing or malformed snapshots fail visibly instead of becoming no-findings',async()=>{
 const controller=createCodeController({call:async()=>ok({})},{pollMs:100000}),source=controller.source('session'),unsubscribe=source.subscribe(()=>{})
 try{await tick();assert.equal(source.getSnapshot().status,'failed');assert.equal(source.getSnapshot().snapshot,null);assert.equal(source.getSnapshot().error!.code,'code/invalid-snapshot')}finally{unsubscribe();controller.dispose()}
})

test('Stop uses the exact Code operation and retains browsing scope until its fresh read',async()=>{
 const calls: any[]=[];let value={...snap('staged','stage'),operation:{id:'operation-1',kind:'review',state:'reviewing',reviewId:'review-1'}}
 const controller=createCodeController({call:async(_api,name,args)=>{calls.push({name,args});if(name==='code/cancel'){value={...value,operation:{...value.operation,state:'cancelling'}};return ok({...value,workspace:{...value.workspace,mode:'worktree'}})}return ok(value)}},{pollMs:100000}),source=controller.source('session'),unsubscribe=source.subscribe(()=>{})
 try{await tick();const result=await controller.cancel('session');assert.equal(result.ok,true);assert.deepEqual(calls.find(call=>call.name==='code/cancel').args,{sessionId:'session',scope:'scope',operationId:'operation-1'});assert.equal(source.getSnapshot().snapshot!.workspace.mode,'staged');assert.equal(source.getSnapshot().snapshot!.operation!.state,'cancelling');assert.equal((await controller.cancel('session')).ok,false)}finally{unsubscribe();controller.dispose()}
})

test('late historical details cannot cross a workspace binding change',async()=>{
 const history=deferred();let current={...snap(),workspace:{...snap().workspace,cwd:'/one',repoRoot:'/one'}}
 const controller=createCodeController({call:async(_api,name)=>name==='code/review'?history.promise:ok(current)},{pollMs:100000}),source=controller.source('session'),unsubscribe=source.subscribe(()=>{})
 try{await tick();const loading=controller.loadReview('session','r1');assert.equal(source.getSnapshot().historyStatus,'loading');current={...current,workspace:{...current.workspace,id:'v2',cwd:'/two',repoRoot:'/two'}};controller.refresh('session');await tick();history.resolve(ok({id:'r1',paths:[],state:'completed',stale:false,findings:[],checks:[]}));await loading;assert.equal(source.getSnapshot().historyId,null);assert.equal(source.getSnapshot().inspectedReview,null)}finally{unsubscribe();controller.dispose()}
})
