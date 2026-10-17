import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeAShare, parseSaved, quoteStatus, STORAGE_KEY, scopedStorageKey } from '../src/watchlist.js'
import { createWatchlistController } from '../src/client/controller.js'
import { createWatchlistHandler, createWatchlistRoute } from '../src/watchlist-rpc.js'
import { mountWhenVacant } from '../src/client/placement.js'
import { quoteResource, addressFor } from '../src/client/resource.js'
const scope = '11111111-1111-4111-8111-111111111111'
const key = scopedStorageKey(scope)
const owner = { principal: { kind: 'owner' } }
const endpoint = 'dsh-x-stock.quotes'
const signal = () => new AbortController().signal

test('A-share identity is exchange-qualified and keeps leading zeros', () => {
  assert.equal(normalizeAShare('sz', '000001'), 'SZ.000001')
  for (const [market, code] of [['US','000001'], ['SH','AAPL'],['SH','60051'],['SH','600519x']]) assert.throws(() => normalizeAShare(market,code))
  assert.throws(() => parseSaved('{'))
  assert.throws(() => parseSaved(JSON.stringify({version:1,pins:[{symbol:'SH.600519'},{symbol:'SH.600519'}]})))
})
test('pins add/remove/order/collapse persist only preferences; invalid and full lists reject', () => {
  let raw
  const storage = { getItem: () => raw, setItem: (key, value) => { assert.equal(key,scopedStorageKey(scope));raw=value } }
  const c = createWatchlistController(storage)
  c.setScope(scope)
  c.add({symbol:'SZ.000001',alias:'平安'}); c.add({symbol:'SH.600519'}); c.move('SH.600519',-1); c.collapse(true)
  assert.deepEqual(c.source.getSnapshot().pins.map(p=>p.symbol),['SH.600519','SZ.000001'])
  assert.throws(()=>c.add({symbol:'SH.600519'}),/duplicate/)
  for(let i=2;i<8;i++)c.add({symbol:`SZ.00000${i}`})
  assert.throws(()=>c.add({symbol:'SZ.000009'}),/limit/)
  c.remove('SH.600519'); c.move('missing',1)
  const second=createWatchlistController(storage);second.setScope(scope)
  const restored=second.source.getSnapshot()
  assert.equal(restored.collapsed,true);assert.equal(restored.pins.length,7)
  assert.deepEqual(Object.keys(JSON.parse(raw)),['version','pins','collapsed'])
})
test('storage denial is visible and keeps edits in memory; another window syncs', () => {
  const events = new EventTarget()
  const c=createWatchlistController({getItem(){throw Error()},setItem(){throw Error()}},events)
  c.setScope(scope)
  assert.match(c.source.getSnapshot().storageError,/storage-read/)
  c.add({symbol:'SH.600519'})
  assert.equal(c.source.getSnapshot().pins.length,1);assert.match(c.source.getSnapshot().storageError,/storage-save/)
  const event = new Event('storage');Object.assign(event,{key,newValue:JSON.stringify({version:1,pins:[{symbol:'BJ.430047'}]})});events.dispatchEvent(event)
  assert.equal(c.source.getSnapshot().pins[0].symbol,'BJ.430047');c.dispose()
})
test('quote RPC requires verified owner, exact payload, bounded duplicates and validated A-share identities',async()=>{
  const handler=createWatchlistHandler()
  assert.equal((await handler(endpoint,{symbols:['SH.600519']},signal(),{})).error.code,'stock/forbidden')
  for(const payload of [{symbols:['AAPL']},{symbols:['SH.600519'],key:'secret'},{symbols:Array(9).fill('SH.600519')},{symbols:['SH.600519','SH.600519']},null])assert.equal((await handler(endpoint,payload,signal(),owner)).error.code,'stock/invalid-input')
  const result=await handler(endpoint,{symbols:['SH.600519']},signal(),owner)
  assert.equal(result.value.quotes[0].status,'unconfigured');assert.equal(result.value.quotes[0].price,null);assert.equal(result.value.source,null)
})
test('future provider projection excludes arbitrary fields and hides failures',async()=>{
  const handler=createWatchlistHandler({now:()=>Date.parse('2026-10-16T07:00:00Z'),provider:{name:'Authorized test fixture',quote:async symbol=>({symbol,price:12,changePercent:1,quotedAt:'2026-10-16T06:59:00Z',credential:'never',name:'测试'})}})
  const result=await handler(endpoint,{symbols:['SZ.000001']},signal(),owner)
  assert.equal(result.value.quotes[0].price,12);assert.equal(JSON.stringify(result).includes('never'),false)
  const failed=createWatchlistHandler({provider:{quote(){throw Error('SECRET')}}})
  assert.equal(JSON.stringify(await failed(endpoint,{symbols:['SZ.000001']},signal(),owner)).includes('SECRET'),false)
})
function slotFixture(initial=[]) {
  let entries=[...initial], listener, disposeInjection
  const flush=()=>listener?.()
  return {
    get entriesNow(){return entries}, flush,
    add(component){entries.push({component});flush()},remove(component){entries=entries.filter(e=>e.component!==component);flush()},
    inject(key,callback){assert.equal(key,'shell.bottom');disposeInjection=callback();return disposeInjection},
    entries(){return entries},subscribe(key,fn){listener=fn;return()=>{listener=undefined}},
    register(options,component){assert.equal(options.name,'shell.bottom');assert.equal(options.priority,Number.MAX_SAFE_INTEGER);const entry={component};entries.push(entry);return()=>{entries=entries.filter(e=>e!==entry)}},
  }
}
test('bottom never shadows even hidden occupants, yields to later competitors and recovers without loops',()=>{
  const Component=()=>{}, Other=()=>{}
  const slots=slotFixture([{component:Other}]);const states=[]
  const dispose=mountWhenVacant(slots,{},Component,state=>states.push(state))
  assert.equal(slots.entriesNow.length,1);assert.equal(states.at(-1),'occupied')
  slots.remove(Other);assert.equal(slots.entriesNow[0].component,Component)
  slots.flush();slots.flush();assert.equal(slots.entriesNow.length,1)
  slots.add(Other);assert.equal(slots.entriesNow.length,1);assert.equal(slots.entriesNow[0].component,Other)
  slots.remove(Other);assert.equal(slots.entriesNow.length,1)
  dispose();slots.flush();assert.equal(slots.entriesNow.length,0)
})
test('resource uses official RPC, no market endpoint, and aborts unconfigured waiting without repolling',async()=>{
  let calls=0
  const rpc={call:async(channel,path,payload)=>{calls++;assert.equal(channel,'/api');assert.equal(path,endpoint);return{ok:true,value:{source:null,quotes:[{symbol:payload.symbols[0],status:'unconfigured',price:null}]}}}}
  const abort=new AbortController(),resource=quoteResource(rpc,new EventTarget(),{onLine:true})
  const stream=resource.open(addressFor('SH.600519'),{signal:abort.signal})
  assert.equal((await stream.next()).value.value.status,'unconfigured')
  const pending=stream.next();abort.abort();assert.equal((await pending).done,true);assert.equal(calls,1)
})
test('hidden/offline resources do not call host; old quote labels never imply realtime',async()=>{
  const target=new EventTarget();target.hidden=true
  let calls=0;const abort=new AbortController()
  const stream=quoteResource({call:()=>calls++},target,{onLine:false}).open(addressFor('SZ.000001'),{signal:abort.signal})
  assert.equal((await stream.next()).value.error.code,'stock/offline');assert.equal(calls,0)
  abort.abort();await stream.return()
  assert.equal(quoteStatus(), 'unconfigured')
  assert.match(quoteStatus({quotedAt:'2020-01-01T00:00:00Z'}),/stale/)
  assert.match(quoteStatus({quotedAt:null}),/unknown-time/)
})

test('resource rejection preserves protocol failure rather than throwing the stream',async()=>{
  const abort=new AbortController()
  const stream=quoteResource({call:async()=>{throw Error('raw transport secret')}},new EventTarget(),{onLine:true}).open(addressFor('SH.600519'),{signal:abort.signal})
  const result=await stream.next()
  assert.equal(result.value.ok,false);assert.equal(result.value.error.code,'stock/connection');assert.equal(JSON.stringify(result).includes('secret'),false)
  abort.abort();await stream.return()
})

test('late resource results are dropped after unmount abort',async()=>{
  let resolve
  const abort=new AbortController()
  const stream=quoteResource({call:()=>new Promise(done=>{resolve=done})},new EventTarget(),{onLine:true}).open(addressFor('SH.600519'),{signal:abort.signal})
  const pending=stream.next();abort.abort();resolve({ok:true,value:{quotes:[{symbol:'SH.600519',price:999}]}})
  assert.equal((await pending).done,true)
})

test('exact shared route validates and echoes generic RPC envelopes without claiming the Gateway',async()=>{
  const route=createWatchlistRoute()
  assert.equal(route.path,'/api/dsh-x-stock.quotes');assert.deepEqual(route.methods,['POST'])
  const request=(value,headers={})=>new Request(`http://host${route.path}`,{method:'POST',headers:{'content-type':'application/json',...headers},body:typeof value==='string'?value:JSON.stringify(value)})
  const message={type:'client-request',rpcId:'r1',method:endpoint,payload:{symbols:['SH.600519']}}
  const response=await route.fetch(request(message)),result=await response.json()
  assert.equal(response.status,200);assert.equal(result.rpcId,'r1');assert.equal(result.type,'server-response');assert.equal(result.result.value.quotes[0].status,'unconfigured')
  for(const input of [null,[],{}, {...message,method:'other'}, {...message,rpcId:4}, {...message,extra:true}, '{broken'])assert.equal((await route.fetch(request(input))).status,400)
  assert.equal((await route.fetch(request(message,{'content-type':'text/plain'}))).status,415)
  assert.equal((await route.fetch(request('x'.repeat(8193)))).status,413)
})
