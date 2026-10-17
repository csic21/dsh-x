import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { loadProfileScope } from '../src/scope.js'
import { createScopeRoute } from '../src/watchlist-rpc.js'
import { createWatchlistController } from '../src/client/controller.js'
import { STORAGE_KEY, scopedStorageKey } from '../src/watchlist.js'

test('profile scopes are stable across restarts, separate homes/profiles, and atomic under concurrent starts',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'dsh-stock-scope-'))
  try {
    const a=path.join(root,'home-a/profiles/web'), b=path.join(root,'home-b/profiles/web'), c=path.join(root,'home-a/profiles/work')
    const values=await Promise.all(Array.from({length:6},()=>loadProfileScope(a)))
    assert.equal(new Set(values).size,1)
    assert.equal(await loadProfileScope(a),values[0])
    const other=await loadProfileScope(b),profile=await loadProfileScope(c)
    assert.equal(new Set([values[0],other,profile]).size,3)
    assert.equal(values[0].includes(root),false)
    await writeFile(path.join(a,'.dsh-x-stock/scope.json'),'broken')
    await assert.rejects(loadProfileScope(a))
  } finally {await rm(root,{recursive:true,force:true})}
})

test('client does not read before scope, ignores legacy key, and separates two profiles on one origin',()=>{
  const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222'
  const data=new Map([[STORAGE_KEY,JSON.stringify({version:1,pins:[{symbol:'SH.600519'}]})]]),reads=[]
  const storage={getItem:key=>{reads.push(key);return data.get(key)},setItem:(key,value)=>data.set(key,value)}
  const events=new EventTarget()
  const first=createWatchlistController(storage,events)
  assert.equal(reads.length,0);assert.throws(()=>first.add({symbol:'SZ.000001'}))
  first.setScope(a);assert.equal(first.source.getSnapshot().pins.length,0)
  first.add({symbol:'SZ.000001'})
  const second=createWatchlistController(storage);second.setScope(b)
  assert.equal(second.source.getSnapshot().pins.length,0);second.add({symbol:'BJ.430047'})
  first.scopeLoading();assert.equal(first.source.getSnapshot().pins.length,0)
  const event=new Event('storage');Object.assign(event,{key:scopedStorageKey(a),newValue:data.get(scopedStorageKey(a))});events.dispatchEvent(event)
  assert.equal(first.source.getSnapshot().pins.length,0)
  first.setScope(b);assert.equal(first.source.getSnapshot().pins[0].symbol,'BJ.430047')
  first.setScope(a);assert.equal(first.source.getSnapshot().pins[0].symbol,'SZ.000001')
  assert.equal(reads.includes(STORAGE_KEY),false)
  assert.ok(data.has(scopedStorageKey(a)));assert.ok(data.has(scopedStorageKey(b)))
  first.scopeFailed();assert.throws(()=>first.add({symbol:'SH.600519'}))
})

test('scope owner-route accepts only empty payload and sanitizes storage errors',async()=>{
  const make=payload=>new Request('http://host/api/dsh-x-stock.scope',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'scope',method:'dsh-x-stock.scope',payload})})
  const route=createScopeRoute(async()=>{throw Error('/private/path SECRET')})
  const failed=await (await route.fetch(make({}))).json()
  assert.equal(failed.result.error.code,'stock/scope-unavailable');assert.equal(JSON.stringify(failed).includes('SECRET'),false)
  assert.equal((await (await route.fetch(make({path:'bad'}))).json()).result.error.code,'stock/invalid-input')
})
