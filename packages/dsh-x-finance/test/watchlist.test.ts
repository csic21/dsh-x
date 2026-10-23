import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_FIXED, MAX_WATCHLIST, normalizeAShare, parseSaved, quoteStatus, scopedStorageKey, STORAGE_KEY, LEGACY_STORAGE_KEY } from '../src/watchlist.ts'
import { createWatchlistController } from '../src/client/controller.ts'
import { mountWhenVacant } from '../src/client/placement.ts'
import { quoteResource, addressFor, fixedAddressFor, pollDelay, FIXED_POLL_MS, IDLE_POLL_MS } from '../src/client/resource.ts'
import { MARKET_ENDPOINT } from '../src/market.ts'
import { fixedBarShortcutLabel, isApplePlatform, isFixedBarShortcut } from '../src/client/shortcut.ts'
const scope = '11111111-1111-4111-8111-111111111111'
const key = scopedStorageKey(scope)
const legacyKey = `${LEGACY_STORAGE_KEY}:${scope}`
const signal = () => new AbortController().signal

function quotePayload(symbols: string[]) {
  return { status: 'ready', source: '腾讯行情 (unofficial)', quotes: symbols.map(symbol => ({ symbol, status: 'available', name: symbol, price: 10, changePercent: 1, quotedAt: '2026-10-16T07:00:00Z', fetchedAt: '2026-10-16T07:00:00Z', marketStatus: 'unknown' })) }
}

test('A-share identity is exchange-qualified and keeps leading zeros', () => {
  assert.equal(normalizeAShare('sz', '000001'), 'SZ.000001')
  for (const [market, code] of [['US','000001'], ['SH','AAPL'],['SH','60051'],['SH','600519x']] as const) assert.throws(() => normalizeAShare(market,code))
  assert.throws(() => parseSaved('{'))
  assert.throws(() => parseSaved(JSON.stringify({version:2,items:[{symbol:'SH.600519'},{symbol:'SH.600519'}]})))
  assert.throws(() => parseSaved(JSON.stringify({version:2,items:Array.from({length:MAX_WATCHLIST + 1},() => ({symbol:'SH.600519'}))})))
  assert.throws(() => parseSaved(JSON.stringify({version:2,items:Array.from({length:MAX_FIXED + 1},(_,index) => ({symbol:`SZ.00000${index}`,fixed:true}))})))
})

test('a version 1 payload is imported as a watchlist with nothing fixed', () => {
  const saved = parseSaved(JSON.stringify({ version: 1, pins: [{ symbol: 'SH.600519', alias: '贵州茅台' }], collapsed: true }))
  assert.deepEqual(saved, { items: [{ symbol: 'SH.600519', alias: '贵州茅台', fixed: false }], collapsed: true, barHidden: false })
})

test('watchlist and the fixed bar are separate lists that persist only as preferences', () => {
  let raw: any
  const storage: any = { getItem: () => raw, setItem: (storageKey: any, value: any) => { assert.equal(storageKey, key); raw = value } }
  const c = createWatchlistController(storage)
  c.setScope(scope)
  c.add({symbol:'SZ.000001',alias:'平安'}); c.add({symbol:'SH.600519'}); c.move('SH.600519',-1); c.collapse(true); c.toggleBar()
  assert.deepEqual(c.source.getSnapshot().items.map(item=>item.symbol),['SH.600519','SZ.000001'])
  // Being on the watchlist never fixes a stock to the bottom bar.
  assert.deepEqual(c.source.getSnapshot().items.map(item=>item.fixed),[false,false])
  c.setFixed('SH.600519', true)
  assert.deepEqual(c.source.getSnapshot().items.map(item=>item.fixed),[true,false])
  for (let index = 2; index <= MAX_FIXED; index++) { c.add({symbol:`SZ.00000${index}`}); c.setFixed(`SZ.00000${index}`, true) }
  assert.equal(c.source.getSnapshot().items.filter(item=>item.fixed).length, MAX_FIXED)
  assert.throws(() => c.setFixed('SZ.000001', true), /fixed-limit/)
  assert.throws(() => c.add({symbol:'SH.600519'}), /duplicate/)
  c.setFixed('SH.600519', false)
  c.setFixed('SZ.000001', true)
  assert.equal(c.source.getSnapshot().items.filter(item=>item.fixed).length, MAX_FIXED)
  c.remove('SZ.000001'); c.move('missing',1)
  const second=createWatchlistController(storage);second.setScope(scope)
  const restored=second.source.getSnapshot()
  assert.equal(restored.collapsed,true);assert.equal(restored.barHidden,true)
  assert.equal(restored.items.length,MAX_FIXED)
  assert.equal(restored.items.filter(item=>item.fixed).length,MAX_FIXED-1)
  assert.deepEqual(Object.keys(JSON.parse(raw)),['version','items','collapsed','barHidden'])
  assert.equal(JSON.parse(raw).version,2)
})

test('a version 1 record under the legacy key is imported once and rewritten as version 2', () => {
  const data = new Map<string, any>([[legacyKey, JSON.stringify({ version: 1, pins: [{ symbol: 'SH.600519', alias: '贵州茅台' }] })]])
  const storage: any = { getItem: (storageKey: any) => data.get(storageKey), setItem: (storageKey: any, value: any) => data.set(storageKey, value) }
  const c = createWatchlistController(storage)
  c.setScope(scope)
  assert.deepEqual(c.source.getSnapshot().items, [{ symbol: 'SH.600519', alias: '贵州茅台', fixed: false }])
  assert.equal(c.source.getSnapshot().barHidden, false)
  c.setFixed('SH.600519', true)
  assert.equal(JSON.parse(data.get(key)).items[0].fixed, true)
  const fresh = createWatchlistController(storage); fresh.setScope(scope)
  assert.equal(fresh.source.getSnapshot().items[0].fixed, true)
})

test('storage denial is visible and keeps edits in memory; another window syncs', () => {
  const events = new EventTarget()
  const c=createWatchlistController({getItem(){throw Error()},setItem(){throw Error()}},events)
  c.setScope(scope)
  assert.match(c.source.getSnapshot().storageError,/storage-read/)
  c.add({symbol:'SH.600519'})
  assert.equal(c.source.getSnapshot().items.length,1);assert.match(c.source.getSnapshot().storageError,/storage-save/)
  const event = new Event('storage');Object.assign(event,{key,newValue:JSON.stringify({version:2,items:[{symbol:'BJ.430047',fixed:true}],barHidden:true})});events.dispatchEvent(event)
  assert.equal(c.source.getSnapshot().items[0].symbol,'BJ.430047');c.dispose()
})

function slotFixture(initial: any[]=[]) {
  let entries=[...initial], listener: any, disposeInjection: any
  const flush=()=>listener?.()
  return {
    get entriesNow(){return entries}, flush,
    add(component: any){entries.push({component});flush()},remove(component: any){entries=entries.filter(e=>e.component!==component);flush()},
    inject(key: any,callback: any){assert.equal(key,'shell.bottom');disposeInjection=callback();return disposeInjection},
    entries(){return entries},subscribe(key: any,fn: any){listener=fn;return()=>{listener=undefined}},
    register(options: any,component: any){assert.equal(options.name,'shell.bottom');assert.equal(options.priority,Number.MAX_SAFE_INTEGER);const entry: any={component};entries.push(entry);return()=>{entries=entries.filter(e=>e!==entry)}},
  }
}
test('the empty or hidden bar releases the bottom slot; an occupant is never shadowed and recovery has no loops',()=>{
  const Component=()=>{}, Other=()=>{}
  const slots=slotFixture([{component:Other}]);const states: any=[]
  let visible=true, notify: any
  const dispose=mountWhenVacant(slots,{},Component,{onPlacement:(state: any)=>states.push(state),visible:()=>visible,subscribe:(listener: any)=>{notify=listener;return()=>{notify=undefined}}})
  assert.equal(slots.entriesNow.length,1);assert.equal(states.at(-1),'occupied')
  slots.remove(Other);assert.equal(slots.entriesNow[0].component,Component)
  slots.flush();slots.flush();assert.equal(slots.entriesNow.length,1)
  slots.add(Other);assert.equal(slots.entriesNow.length,1);assert.equal(slots.entriesNow[0].component,Other)
  slots.remove(Other);assert.equal(slots.entriesNow.length,1)
  visible=false;notify();assert.equal(slots.entriesNow.length,0)
  visible=true;notify();assert.equal(slots.entriesNow.length,1)
  dispose();slots.flush();assert.equal(slots.entriesNow.length,0)
})

test('resource asks the shared market route for the whole fixed bar in one call',async()=>{
  const calls: any[]=[]
  const rpc: any={call:async(channel: any,path: any,payload: any)=>{calls.push({channel,path,payload});return{ok:true,value:quotePayload(payload.symbols)}}}
  const abort=new AbortController()
  const stream=quoteResource(rpc,new EventTarget(),{onLine:true}).open(fixedAddressFor(['SH.600519','SZ.000001']),{signal:abort.signal})
  const value=(await stream.next()).value.value
  assert.deepEqual(calls,[{channel:'/api',path:MARKET_ENDPOINT,payload:{kind:'quotes',symbols:['SH.600519','SZ.000001']}}])
  assert.equal(value.source,'腾讯行情 (unofficial)')
  assert.deepEqual(value.quotes.map((quote: any)=>quote.symbol),['SH.600519','SZ.000001'])
  const pending=stream.next();abort.abort();assert.equal((await pending).done,true);assert.equal(calls.length,1)
})

test('one resource reads one stock and never polls a deliberately unconfigured source',async()=>{
  let calls=0
  const rpc: any={call:async(channel: any,path: any,payload: any)=>{calls++;assert.equal(path,MARKET_ENDPOINT);assert.deepEqual(payload,{kind:'quotes',symbols:['SH.600519']});return{ok:true,value:{status:'unconfigured',source:null}}}}
  const abort=new AbortController(),resource=quoteResource(rpc,new EventTarget(),{onLine:true})
  const stream=resource.open(addressFor('SH.600519'),{signal:abort.signal})
  const first=(await stream.next()).value
  assert.equal(first.ok,true);assert.equal(first.value.status,'unconfigured');assert.deepEqual(first.value.quotes,[])
  assert.equal(quoteStatus(first.value.quotes[0]),'unconfigured')
  const pending=stream.next();abort.abort();assert.equal((await pending).done,true);assert.equal(calls,1)
})

test('resource rejects malformed addresses and responses instead of inventing rows',async()=>{
  const resource=quoteResource({call:async()=>({ok:true,value:{status:'ready',source:'x',quotes:[]}})},new EventTarget(),{onLine:true})
  await assert.rejects(async()=>{const stream=resource.open('dsh-resource://dsh-x-finance/fixed/SH.600519,SH.600519',{signal:signal()});await stream.next()})
  await assert.rejects(async()=>{const stream=resource.open('dsh-resource://dsh-x-finance/quote/AAPL',{signal:signal()});await stream.next()})
  const abort=new AbortController()
  const stream=resource.open(addressFor('SH.600519'),{signal:abort.signal})
  const result=(await stream.next()).value
  assert.equal(result.ok,false);assert.equal(result.error.code,'finance/invalid')
  abort.abort();await stream.return()
})

test('realtime polling follows the quote time, not the wall clock',()=>{
  const fresh=quotePayload(['SH.600519'])
  assert.equal(pollDelay({ok:true,value:fresh},true,Date.parse('2026-10-16T07:00:30Z')),FIXED_POLL_MS)
  // A closed market, a suspension or a stale feed backs off to the idle poll.
  assert.equal(pollDelay({ok:true,value:fresh},true,Date.parse('2026-10-16T09:00:00Z')),IDLE_POLL_MS)
  assert.equal(pollDelay({ok:false,error:{code:'finance/connection'}},true,Date.parse('2026-10-16T07:00:00Z')),IDLE_POLL_MS)
  assert.equal(pollDelay({ok:true,value:quotePayload(['SH.600519'])},false,Date.parse('2026-10-16T07:00:00Z')),IDLE_POLL_MS)
  assert.equal(pollDelay({ok:true,value:{status:'ready',source:'x',quotes:[{symbol:'SH.600519',quotedAt:null}]}},true,Date.parse('2026-10-16T07:00:00Z')),IDLE_POLL_MS)
})

test('hidden/offline resources do not call the host; old quotes never claim realtime',async()=>{
  const target=new EventTarget();(target as any).hidden=true
  let calls=0;const abort=new AbortController()
  const stream=quoteResource({call:()=>calls++},target,{onLine:false}).open(addressFor('SZ.000001'),{signal:abort.signal})
  assert.equal((await stream.next()).value.error.code,'finance/offline');assert.equal(calls,0)
  abort.abort();await stream.return()
  assert.equal(quoteStatus(), 'unconfigured')
  assert.match(quoteStatus({quotedAt:'2020-01-01T00:00:00Z'}),/stale/)
  assert.match(quoteStatus({quotedAt:null}),/unknown-time/)
  assert.equal(quoteStatus({status:'unavailable'}),'unavailable')
})

test('resource rejection preserves protocol failure rather than throwing the stream',async()=>{
  const abort=new AbortController()
  const stream=quoteResource({call:async()=>{throw Error('raw transport secret')}},new EventTarget(),{onLine:true}).open(addressFor('SH.600519'),{signal:abort.signal})
  const result=await stream.next()
  assert.equal(result.value.ok,false);assert.equal(result.value.error.code,'finance/connection');assert.equal(JSON.stringify(result).includes('secret'),false)
  abort.abort();await stream.return()
})

test('late resource results are dropped after unmount abort',async()=>{
  let resolve: any
  const abort=new AbortController()
  const stream=quoteResource({call:()=>new Promise<any>(done=>{resolve=done})},new EventTarget(),{onLine:true}).open(addressFor('SH.600519'),{signal:abort.signal})
  const pending=stream.next();abort.abort();(resolve)!({ok:true,value:quotePayload(['SH.600519'])})
  assert.equal((await pending).done,true)
})

test('the fixed bar shortcut is deliberate, layout-independent and never steals typing',()=>{
  const press = (patch: any) => ({ altKey: true, shiftKey: true, code: 'KeyS', target: { tagName: 'BODY' }, ...patch })
  assert.equal(isFixedBarShortcut(press({})), true)
  assert.equal(isFixedBarShortcut(press({ code: 'KeyB' })), false)
  assert.equal(isFixedBarShortcut(press({ altKey: false })), false)
  assert.equal(isFixedBarShortcut(press({ shiftKey: false })), false)
  assert.equal(isFixedBarShortcut(press({ repeat: true })), false)
  assert.equal(isFixedBarShortcut(undefined), false)
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) assert.equal(isFixedBarShortcut(press({ target: { tagName } })), false, tagName)
  assert.equal(isFixedBarShortcut(press({ target: { tagName: 'DIV', isContentEditable: true } })), false)
  assert.equal(isFixedBarShortcut(press({ target: undefined })), true)
  // macOS Option rewrites the character. The chord still matches on the physical key.
  assert.equal(isFixedBarShortcut(press({ key: 'Í' })), true)
  assert.equal(isApplePlatform({ platform: 'MacIntel', userAgent: '' }), true)
  assert.equal(isApplePlatform({ platform: '', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }), true)
  assert.equal(isApplePlatform({ userAgentData: { platform: 'macOS' }, platform: '', userAgent: '' }), true)
  assert.equal(isApplePlatform({ platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0)' }), false)
  assert.equal(isApplePlatform({ platform: 'Linux x86_64', userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' }), false)
  assert.equal(fixedBarShortcutLabel({ platform: 'MacIntel', userAgent: '' }), '⌥⇧S')
  assert.equal(fixedBarShortcutLabel({ platform: 'Win32', userAgent: '' }), 'Alt+Shift+S')
  assert.equal(fixedBarShortcutLabel({ platform: 'Linux x86_64', userAgent: '' }), 'Alt+Shift+S')
})

test('the storage key is scoped per profile scope',()=>{
  assert.equal(key,`${STORAGE_KEY}:${scope}`)
  assert.throws(()=>scopedStorageKey('not-a-scope'))
})
