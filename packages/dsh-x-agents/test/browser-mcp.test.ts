import test from 'node:test'
import assert from 'node:assert/strict'
import {request} from 'node:http'
import {createBrowserMcp} from '../src/adapters/browser-mcp.ts'
async function fixture(t: any,options: any={}){
 const controller=new AbortController(),calls: any=[]
 const mcp=await createBrowserMcp({signal:controller.signal,invoke:async(name: any,args: any,signal: any)=>{calls.push({name,args});return options.invoke?options.invoke(name,args,signal):{ok:true}},isActive:options.isActive??(()=>true)})
 let id=0
 const post=async(method: any,params?: any,extra: any={})=>fetch(mcp.config.url,{method:'POST',headers:{'content-type':'application/json',...mcp.config.headers,...extra.headers},body:JSON.stringify({jsonrpc:'2.0',id:extra.id??++id,method,params})})
 t.after(()=>mcp.close());return{mcp,post,calls,controller}
}
test('owned MCP requires exact ephemeral authorization and rejects browser origins',async t=>{
 const h=await fixture(t)
 assert.equal((await h.post('initialize',{}, {headers:{Authorization:'Bearer wrong'}})).status,403)
 assert.equal((await h.post('initialize',{}, {headers:{Origin:'https://example.com'}})).status,403)
 const result=await (await h.post('initialize',{protocolVersion:'2025-03-26'})).json();assert.equal(result.result.protocolVersion,'2025-03-26')
 const list=await(await h.post('tools/list')).json();assert.deepEqual(list.result.tools.map((t: any)=>t.name),['tabs','action']);assert.equal(h.calls.length,0)
})
test('MCP only invokes finite host tools while active and rejects replay',async t=>{
 let active=false;const h=await fixture(t,{isActive:()=>active})
 assert.equal((await h.post('tools/call',{name:'tabs'})).status,400);assert.equal(h.calls.length,0)
 active=true;const result=await(await h.post('tools/call',{name:'tabs',arguments:{}},{id:90})).json();assert.equal(result.result.isError,undefined);assert.equal(h.calls[0].name,'dsh_x_browser_tabs')
 const repeated=await(await h.post('tools/call',{name:'tabs'},{id:90})).json();assert.equal(repeated.error.code,-32600);assert.equal(h.calls.length,1)
 assert.equal((await h.post('tools/call',{name:'executeJavaScript',arguments:{code:'bad'}})).status,400);assert.equal(h.calls.length,1)
})
test('MCP preserves split UTF-8 input without arbitrary model code',async t=>{
 const h=await fixture(t),payload=Buffer.from(JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'action',arguments:{text:'你好'}}})),split=payload.indexOf(Buffer.from('你'))+1
 await new Promise<any>((resolve,reject)=>{const req=request(h.mcp.config.url,{method:'POST',headers:{...h.mcp.config.headers,'Content-Type':'application/json'}},res=>{res.resume();res.on('end',resolve)});req.on('error',reject);req.write(payload.subarray(0,split));setImmediate(()=>req.end(payload.subarray(split)))})
 assert.equal(h.calls[0].args.text,'你好')
})
test('MCP enforces a bounded forty-call budget and closes its loopback listener',async t=>{
 const h=await fixture(t)
 for(let i=0;i<40;i++)assert.equal((await h.post('tools/call',{name:'tabs'})).status,200)
 assert.equal((await h.post('tools/call',{name:'tabs'})).status,400);assert.equal(h.calls.length,40)
 await h.mcp.close();await assert.rejects(h.post('tools/list'))
})

test('disconnecting a native MCP call aborts its exact pending browser invocation',async t=>{
 let enter: any,finish: any;const entered=new Promise<any>(r=>enter=r),finished=new Promise<any>(r=>finish=r)
 const h=await fixture(t,{invoke:(_name: any,_args: any,signal: any)=>new Promise<any>((resolve,reject)=>{enter();signal.addEventListener('abort',()=>{finish();reject(signal.reason)},{once:true})})})
 const req=request(h.mcp.config.url,{method:'POST',headers:{...h.mcp.config.headers,'Content-Type':'application/json'}},res=>res.resume());req.on('error',()=>{})
 req.end(JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'tabs'}}));await entered;req.destroy();await finished
 assert.equal(h.calls.length,1)
})

test('native MCP cancellation notification aborts only its pending request and prevents dispatch replay',async t=>{
 let enter: any;const entered=new Promise<any>(r=>enter=r)
 const h=await fixture(t,{invoke:(_name: any,_args: any,signal: any)=>new Promise<any>((resolve,reject)=>{enter();signal.addEventListener('abort',()=>reject(signal.reason),{once:true})})})
 const result=h.post('tools/call',{name:'tabs'}, {id:77});await entered
 const cancelled=await fetch(h.mcp.config.url,{method:'POST',headers:{...h.mcp.config.headers,'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:77}})})
 assert.equal(cancelled.status,202);assert.equal((await(await result).json()).result.isError,true)
 const again=await(await h.post('tools/call',{name:'tabs'},{id:77})).json();assert.equal(again.error.code,-32600);assert.equal(h.calls.length,1)
})
