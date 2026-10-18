import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import * as plan from '../src/index.ts'
function captureGuard() {
 let guard: any
 const context: any = { effect(fn: any) { return fn() }, systemPrompt:{section(){}}, on(){}, tools:{register(){},guard(fn: any){guard=fn}} }
 plan.apply(context)
 return guard
}
test('final monotonic guard fails closed on unreadable state but does not alter unrelated sessions', () => {
 const home=mkdtempSync(path.join(tmpdir(),'dsh-state-gate-')), previous=process.env.DSH_HOME
 process.env.DSH_HOME=home
 try {
  const guard=captureGuard()
  assert.equal((guard)!({name:'write'}),undefined)
  assert.equal((guard)!({name:'write',agent:{id:'missing'}}),undefined)
  mkdirSync(path.join(home,'plans'));writeFileSync(path.join(home,'plans','blocked'),'not a directory')
  assert.match((guard)!({name:'write',agent:{id:'blocked'}}),/blocked/i)
 }finally{if(previous===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previous;rmSync(home,{recursive:true,force:true})}
})
