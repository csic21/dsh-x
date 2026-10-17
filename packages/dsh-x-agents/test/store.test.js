import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createTaskStore, safeData } from '../src/store.js'
const make = () => createTaskStore(mkdtempSync(path.join(tmpdir(), 'agents-store-')))
const start = store => store.claim('session-1', { runtime: 'codex', prompt: 'A task', cwd: '/tmp' })
test('profile scopes and task persistence are distinct', () => {
 const a=make(), b=make();assert.notEqual(a.scope,b.scope)
 const c=start(a);a.event('session-1',c.task.id,c.task.runId,{type:'session',data:{nativeSessionId:'native-1'}})
 a.state('session-1',c.task.id,c.task.runId,'completed');a.release('session-1',c.task.id,c.task.runId)
 const restored=createTaskStore(path.dirname(a.root));assert.equal(restored.read('session-1').task.nativeSessionId,'native-1');assert.equal(b.read('session-1').task,null)
})
test('old callbacks and releases cannot change a continued run', () => {
 const a=make(), old=start(a);a.event('session-1',old.task.id,old.task.runId,{type:'session',data:{nativeSessionId:'native'}})
 a.state('session-1',old.task.id,old.task.runId,'completed');a.release('session-1',old.task.id,old.task.runId)
 const prior=a.read('session-1');const newer=a.claim('session-1',{taskId:old.task.id,expectedScope:a.scope,expectedRevision:prior.revision,runtime:'codex',prompt:'continue',cwd:'/tmp'})
 assert.notEqual(newer.task.runId,old.task.runId)
 assert.throws(()=>a.event('session-1',old.task.id,old.task.runId,{type:'assistant',text:'late'}),/no longer owns/)
 assert.throws(()=>a.state('session-1',old.task.id,old.task.runId,'completed'),/no longer owns/)
 assert.throws(()=>a.release('session-1',old.task.id,old.task.runId),/another host/)
})
test('concurrent and stale claims fail closed',()=>{
 const a=make(),c=start(a);assert.throws(()=>start(a),/owns/)
 a.state('session-1',c.task.id,c.task.runId,'completed');a.release('session-1',c.task.id,c.task.runId)
 assert.throws(()=>a.claim('session-1',{taskId:c.task.id,expectedScope:a.scope,expectedRevision:0,runtime:'codex',prompt:'x',cwd:'/tmp'}),/changed/)
 assert.equal(a.hasLock('session-1'),false)
})
test('restarted hosts show interrupted ownership without replay',()=>{
 const a=make();start(a);const restored=createTaskStore(path.dirname(a.root));assert.equal(restored.snapshot('session-1').task.state,'interrupted');assert.throws(()=>start(restored),/owns/)
})
test('native session changes are rejected',()=>{
 const a=make(),c=start(a);a.event('session-1',c.task.id,c.task.runId,{type:'session',data:{nativeSessionId:'one'}})
 assert.throws(()=>a.event('session-1',c.task.id,c.task.runId,{type:'session',data:{nativeSessionId:'two'}}),/identity changed/)
})
test('large event streams remain readable and sensitive keys are withheld',()=>{
 const a=make(),c=start(a)
 for(let i=0;i<240;i++)a.event('session-1',c.task.id,c.task.runId,{type:'tool',text:'x'.repeat(4000),data:{a:'y'.repeat(3900),b:'z'.repeat(3900),password:'fixture-secret-123'}})
 const current=a.read('session-1');assert.ok(current.task.events.length<240);assert.equal(current.task.events.at(-1).data.password,'[redacted]')
 assert.ok(Buffer.byteLength(JSON.stringify(current))<1500000)
 assert.deepEqual(safeData({nested:{authorization:'Bearer fixture',env:{OTHER:'hidden'}}}),{nested:{authorization:'[redacted]',env:'[redacted]'}})
})
test('session paths reject traversal',()=>{const a=make();assert.throws(()=>a.read('../other'),/Invalid session/)})

test('discovery quarantine records the runtime that failed rather than defaulting to Codex',()=>{
 const a=make();a.quarantine('session-1','Fixture cleanup uncertainty','grok')
 assert.equal(a.snapshot('session-1').task.runtime,'grok');assert.equal(a.hasLock('session-1'),true)
})
