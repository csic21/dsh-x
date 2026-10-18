import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseContract, requireReadyContract, pathInContract } from '../src/contract.ts'
const valid: any = { version:1, goal:'Outcome', files:['src/code.js'], steps:[{id:'one',title:'Change the code'}], questions:[], checks:[{id:'test',command:'node --test',required:true}] }
const fence = (value: any) => '```dsh-x-plan\n'+JSON.stringify(value)+'\n```'
test('contracts are bounded, explicit and reject malformed/missing/duplicate scope and blocking questions', () => {
 assert.deepEqual(requireReadyContract(parseContract(fence(valid))),valid)
 for(const value of [{...valid,files:['../escape']},{...valid,files:['.git/config']},{...valid,files:['/absolute']},{...valid,files:['x','x']},{...valid,checks:[{id:'a',command:'x',required:false}]},{...valid,version:2},{...valid,extra:true}] as const)assert.throws(()=>parseContract(fence(value)))
 assert.throws(()=>parseContract('plain plan'))
 assert.throws(()=>parseContract(fence(valid)+'\n'+fence(valid)))
 assert.throws(()=>requireReadyContract({...valid,checks:[]}))
 assert.throws(()=>requireReadyContract({...valid,questions:[{text:'Unresolved',blocking:true}]}))
})
test('repository-relative scope supports subdirectory sessions and rejects escaping symlink ancestors', () => {
 const root=mkdtempSync(path.join(tmpdir(),'plan-contract-')),outside=mkdtempSync(path.join(tmpdir(),'plan-outside-'))
 try {
  mkdirSync(path.join(root,'src'));writeFileSync(path.join(root,'src','code.js'),'old')
  assert.equal(pathInContract(root,path.resolve(root,'src','code.js'),valid),true)
  assert.equal(pathInContract(root,path.join(root,'other.js'),valid),false)
  symlinkSync(path.join(outside,'missing.txt'),path.join(root,'dangling.txt'))
  assert.equal(pathInContract(root,'dangling.txt',{files:['dangling.txt']}),false)
  symlinkSync(path.join(root,'src'),path.join(root,'alias'))
  assert.equal(pathInContract(root,'alias/code.js',{files:['alias/code.js']}),false)
  symlinkSync(outside,path.join(root,'linked'))
  assert.equal(pathInContract(root,'linked/new.js',{files:['linked/new.js']}),false)
 }finally{rmSync(root,{recursive:true,force:true});rmSync(outside,{recursive:true,force:true})}
})
