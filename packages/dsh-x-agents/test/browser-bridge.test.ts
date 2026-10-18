import test from 'node:test'
import assert from 'node:assert/strict'
import {bindNativeBrowser,isBrowserChild} from '../src/browser-bridge.ts'
const deferred=()=>{let resolve!: (value?: any) => void;const promise=new Promise<any>(r=>resolve=r);return{promise,resolve}}
function fixture(options: any={}) {
 const controller=new AbortController(),tickets=new Map(),exec: any={token:Symbol(),rootCallId:'root',agent:{session:{id:'session'}}},calls: any=[]
 let closed=0,bound: any
 const bridge=bindNativeBrowser({exec,runId:'run',signal:controller.signal,assertCurrent:options.assertCurrent??(async()=>{}),tickets,ownership:{bind(token: any,value: any){assert.equal(token,exec.token);bound=value;return()=>closed++}},execute:async (call: any)=>{calls.push(call);assert.equal(isBrowserChild(call,tickets),true);return options.execute?options.execute(call):{value:{ok:true}}}})
 return{bridge,controller,tickets,exec,calls,closed:()=>closed,bound:()=>bound}
}
test('native browser child ticket binds exact parent, root, session, name and signal',async()=>{
 const h=fixture({execute:async (call: any)=>{
  for(const patch of [{parent:Symbol()},{rootCallId:'other'},{agent:{session:{id:'session'}}},{name:'write'},{callId:'forged'}] as const)assert.equal(isBrowserChild({...call,...patch},h.tickets),false)
  return{value:{ok:true}}
 }})
 assert.deepEqual(await h.bridge.invoke('dsh_x_browser_tabs',{}),{ok:true});assert.equal(h.tickets.size,0)
 h.bridge.close();h.bridge.close();assert.equal(h.closed(),1);assert.equal(h.bound().signal.aborted,true)
 await assert.rejects(h.bridge.invoke('dsh_x_browser_tabs',{}),/unavailable/)
})
test('pending browser slot is reserved before asynchronous liveness check',async()=>{
 const wait=deferred(),h=fixture({assertCurrent:()=>wait.promise})
 const first=h.bridge.invoke('dsh_x_browser_tabs',{})
 await assert.rejects(h.bridge.invoke('dsh_x_browser_action',{}),/pending/)
 wait.resolve();await first;assert.equal(h.calls.length,1)
})
test('closing during liveness check prevents a late child dispatch and releases pending',async()=>{
 const wait=deferred(),h=fixture({assertCurrent:()=>wait.promise})
 const first=h.bridge.invoke('dsh_x_browser_tabs',{});h.bridge.close();wait.resolve()
 await assert.rejects(first,/closed/);assert.equal(h.calls.length,0);assert.equal(h.tickets.size,0)
})
test('bridge close synchronously aborts pending ToolRuntime work and ignores late value',async()=>{
 const wait=deferred(),entered=deferred(),h=fixture({execute:async()=>{entered.resolve();await wait.promise;return{value:'late'}}})
 const result=h.bridge.invoke('dsh_x_browser_tabs',{});await entered.promise;const call=h.calls[0]
 h.bridge.close();assert.equal(call.signal.aborted,true);assert.equal(isBrowserChild(call,h.tickets),false);wait.resolve()
 await assert.rejects(result,/closed/);assert.equal(h.tickets.size,0)
})
test('failed liveness check does not strand slot; unsupported tool never dispatches',async()=>{
 let count=0;const h=fixture({assertCurrent:async()=>{if(++count===1)throw Error('stale')}})
 await assert.rejects(h.bridge.invoke('dsh_x_browser_tabs',{}),/stale/)
 await h.bridge.invoke('dsh_x_browser_tabs',{});await assert.rejects(h.bridge.invoke('write',{}),/unavailable/)
 assert.equal(h.calls.length,1);h.bridge.close()
})

test('a disconnected native request cannot dispatch after its awaited liveness check',async()=>{
 const wait=deferred(),h=fixture({assertCurrent:()=>wait.promise}),request=new AbortController()
 const result=h.bridge.invoke('dsh_x_browser_tabs',{},request.signal);request.abort(new Error('request disconnected'));wait.resolve()
 await assert.rejects(result,/disconnected/);assert.equal(h.calls.length,0);assert.equal(h.bound().signal.aborted,false);h.bridge.close()
})
