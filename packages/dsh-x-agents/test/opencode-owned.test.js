import test from 'node:test'
import assert from 'node:assert/strict'
import {join} from 'node:path'
import {ownedEnvironment,freeModels,runtimeConfig,validateEffectiveConfig,createOwnedOpenCodeAdapter,closeOwnedProcess} from '../src/adapters/opencode-owned.js'
const model=(cost={input:0,output:0,cache:{read:0,write:0}})=>({name:'Fixture',cost,capabilities:{toolcall:true}})
test('only exact public provider zero-price tool-capable models survive; order deterministic',()=>{
 const models=freeModels({connected:['opencode','other'],all:[{id:'other',models:{free:model()}},{id:'opencode',models:{z:model(),a:model(),paid:model({input:0,output:1}),cache:model({input:0,output:0,cache:{write:1}}),tier:model({input:0,output:0,tiers:{large:{input:1}}}),unknown:model({input:0}),text:{...model(),capabilities:{toolcall:false}},'bad/model':model()}}]})
 assert.deepEqual(models.map(m=>m.id),['opencode/a','opencode/z']);assert.ok(models.every(m=>m.free===true))
 assert.deepEqual(freeModels({connected:[],all:[{id:'opencode',models:{a:model()}}]}),[])
})
test('owned environment scrubs inherited credentials and all native homes are private',()=>{
 process.env.DSH_TEST_PRIVATE_KEY='synthetic';process.env.OPENCODE_CONFIG='ambient-private-file'
 try{const env=ownedEnvironment('/fixture/root',runtimeConfig('opencode/a'), 'fixture-ephemeral-password');assert.equal(env.DSH_TEST_PRIVATE_KEY,undefined);assert.equal(env.OPENCODE_CONFIG,undefined)
 for(const key of ['HOME','USERPROFILE','XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_STATE_HOME','XDG_CACHE_HOME','APPDATA','LOCALAPPDATA','TMPDIR','TEMP'])assert.ok(env[key].startsWith(join('/fixture','root')))
 for(const key of ['OPENCODE_PURE','OPENCODE_DISABLE_PROJECT_CONFIG','OPENCODE_DISABLE_CLAUDE_CODE','OPENCODE_DISABLE_DEFAULT_PLUGINS','OPENCODE_DISABLE_EXTERNAL_SKILLS'])assert.equal(env[key],'true')
 assert.equal(env.OPENCODE_SERVER_PASSWORD,'fixture-ephemeral-password');assert.equal(JSON.parse(env.OPENCODE_CONFIG_CONTENT).permission['*'],'deny')
 }finally{delete process.env.DSH_TEST_PRIVATE_KEY;delete process.env.OPENCODE_CONFIG}
})
test('effective config must retain deny-all policy, pinned models and exact owned MCP',()=>{
 const expected=runtimeConfig('opencode/free',{type:'remote',url:'http://127.0.0.1:9000/mcp',oauth:false,headers:{Authorization:'Bearer fixture'}})
 validateEffectiveConfig(structuredClone(expected),expected)
 assert.deepEqual(expected.permission,{'*':'deny',dsh_browser_tabs:'allow',dsh_browser_action:'allow',task:'deny'})
 for(const change of [c=>c.permission['*']='allow',c=>c.model='opencode/paid',c=>c.small_model='opencode/paid',c=>c.agent.compaction.model='opencode/paid',c=>c.agent.build.disable=false,c=>c.mcp.other={type:'remote'},c=>c.plugin.push('unknown'),c=>c.provider.opencode.whitelist.push('paid'),c=>c.skills.urls.push('https://example.com/skill'),c=>c.references=['/private'],c=>c.agent.extra={},c=>c.agent.compaction.permission['*']='allow',c=>c.agent.dsh_browser.prompt='private',c=>c.experimental={anything:true}]){const actual=structuredClone(expected);change(actual);assert.throws(()=>validateEffectiveConfig(actual,expected),/policy|prompt|configured/)}
})
test('owned mode refuses unsupported policy, continuation, implicit model and credential config',async()=>{
 let calls=0;const adapter=createOwnedOpenCodeAdapter({spawn:()=>{calls++}})
 const discovery=await adapter.discover({cwd:'/tmp',sandboxPolicy:{mode:'read-only'},signal:new AbortController().signal});assert.equal(discovery.available,false);assert.match(discovery.reason,/writable workspace/)
 assert.equal((await adapter.run({nativeSessionId:'old'})).status,'blocked');assert.equal((await adapter.run({prompt:'hello'})).status,'blocked');assert.equal(calls,0)
 assert.throws(()=>createOwnedOpenCodeAdapter({spawn(){},config:{password:'never'}}),/credentials/)
})

test('normal native config defaults and reordered MCP fields are accepted; permission order remains exact',()=>{
 const expected=runtimeConfig('opencode/free',{type:'remote',url:'http://127.0.0.1:9000/mcp',oauth:false,headers:{Authorization:'Bearer fixture'}}),actual=structuredClone(expected)
 actual.mode={};actual.command={};for(const agent of Object.values(actual.agent)){agent.options={};agent.permission??={}}
 actual.mcp.dsh_browser=Object.fromEntries(Object.entries(actual.mcp.dsh_browser).reverse());validateEffectiveConfig(actual,expected)
 actual.permission=Object.fromEntries(Object.entries(actual.permission).reverse());assert.throws(()=>validateEffectiveConfig(actual,expected),/policy/)
})

test('effective-config diagnostics identify only known fields, never rejected values or unknown keys',()=>{
 const expected=runtimeConfig('opencode/free',{type:'remote',url:'http://127.0.0.1:9000/mcp',oauth:false,headers:{Authorization:'Bearer never-print-this'}}),actual=structuredClone(expected)
 actual.permission=Object.fromEntries(Object.entries(actual.permission).reverse())
 actual.model='private-value';actual['unknown-secret-key']='private-value';actual.agent.dsh_browser.prompt='private-prompt'
 assert.throws(()=>validateEffectiveConfig(actual,expected),error=>{
  assert.equal(error.code,'OPENCODE_OWNED_CONFIG');assert.match(error.message,/root.extra-fields/);assert.match(error.message,/model.value/);assert.match(error.message,/permission.order/);assert.match(error.message,/agent.dsh_browser.extra-fields/)
  assert.doesNotMatch(error.message,/private-value|unknown-secret-key|private-prompt|never-print-this|127\.0\.0\.1/);assert.ok(error.message.length<1200);return true
 })
})

test('pinned HTTP permission encoding moves only schema-known task first, preserving browser precedence',()=>{
 for(const mcp of [undefined,{type:'remote',url:'http://127.0.0.1:9000/mcp',oauth:false,headers:{Authorization:'Bearer fixture'}}]){
  const expected=runtimeConfig(mcp?'opencode/free':undefined,mcp),actual=structuredClone(expected)
  const wire=value=>Object.hasOwn(value,'task')?{task:value.task,...Object.fromEntries(Object.entries(value).filter(([key])=>key!=='task'))}:value
  actual.permission=wire(actual.permission)
  for(const agent of Object.values(actual.agent)){agent.options={};agent.permission=wire(agent.permission??{})}
  actual.mode={};actual.command={}
  validateEffectiveConfig(actual,expected)
  const changed=structuredClone(actual);changed.permission.task='allow'
  assert.throws(()=>validateEffectiveConfig(changed,expected),/permission.value/)
  const extra=structuredClone(actual);extra.permission.bash='allow'
  assert.throws(()=>validateEffectiveConfig(extra,expected),/permission.value/)
  if(mcp){
   const reversed=structuredClone(actual);reversed.permission=Object.fromEntries(Object.entries(reversed.permission).reverse())
   assert.throws(()=>validateEffectiveConfig(reversed,expected),/permission.order/)
   const primary=structuredClone(actual);primary.agent.dsh_browser.permission={'*':'deny',dsh_browser_action:'allow',dsh_browser_tabs:'allow',task:'deny'}
   assert.throws(()=>validateEffectiveConfig(primary,expected),/agent.dsh_browser.permission.order/)
  }
 }
})

test('owned cleanup revokes and terminates before awaiting MCP callbacks, bounded on a hung callback',async()=>{
 const events=[]
 await assert.rejects(closeOwnedProcess({timeoutMs:10,browser:{close(){events.push('revoke')}},child:{terminate(){events.push('terminate')},waitForExit:async()=>true,done:Promise.resolve({exitCode:0})},mcp:{close(){events.push('mcp');return new Promise(()=>{})}}}),{code:'AGENTS_CLEANUP_UNCONFIRMED'})
 assert.deepEqual(events,['revoke','terminate','mcp'])
})
test('cleanup failure does not skip owned process termination',async()=>{
 let terminated=false,closed=false
 await assert.rejects(closeOwnedProcess({timeoutMs:100,browser:{close(){throw Error('lost owner')}},child:{terminate(){terminated=true},waitForExit:async()=>true,done:Promise.resolve({exitCode:0})},mcp:{close(){closed=true}}}),{code:'AGENTS_CLEANUP_UNCONFIRMED'})
 assert.equal(terminated,true);assert.equal(closed,true)
})
