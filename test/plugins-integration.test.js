import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import LlmRuntime, { LlmAdapter } from '@deepseek-ai/dsh-llm'
import * as stock from '../packages/dsh-x-stock/lib/index.js'
import * as chat from '../packages/dsh-x-chat/src/index.ts'

const invoke = (ctx, name, args) => ctx.tools.execute({name,arguments:args,callId:crypto.randomUUID(),signal:new AbortController().signal})

test('stock entry executes through official tool schema/output validation with mocked HTTP', async () => {
 const ctx=new Context(); const originalFetch=globalThis.fetch; const key=process.env.FINNHUB_API_KEY
 try {
  await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(stock)
  process.env.FINNHUB_API_KEY='local-test-placeholder'
  globalThis.fetch=async(url,options)=>{
   assert.equal(url.origin,'https://finnhub.io')
   assert.equal(options.redirect,'error')
   return new Response(JSON.stringify({c:101,d:1,dp:1,o:100,h:102,l:99,pc:100,t:1720000000}),{headers:{'Content-Type':'application/json'}})
  }
  const result=await invoke(ctx,'dsh_x_stock_quote',{symbol:'AAPL'})
  assert.equal(result.isError,false,JSON.stringify(result))
  assert.equal(result.value.price,101)
  assert.equal(result.value.symbol,'AAPL')
  assert.equal(result.meta.kind,'dsh-x-stock.quote')
  assert.equal(result.meta.quote.symbol,'AAPL')
  delete process.env.FINNHUB_API_KEY
  const failed=await invoke(ctx,'dsh_x_stock_quote',{symbol:'AAPL'})
  assert.equal(failed.error.info.name,'DshXStockError')
  assert.equal(failed.error.info.code,'DSH_X_STOCK_MISSING_KEY')
 } finally {globalThis.fetch=originalFetch; if(key===undefined) delete process.env.FINNHUB_API_KEY; else process.env.FINNHUB_API_KEY=key; await ctx.fiber.dispose()}
})

test('chat entry executes through official ToolRuntime and native LlmRuntime with local adapter', async () => {
 const ctx=new Context()
 class FixtureAdapter extends LlmAdapter {
  async *stream(options){
   assert.deepEqual(options.tools,[])
   assert.equal(options.messages.length,1)
   yield {type:'text-delta',index:0,text:'本地协议测试成功'}
   yield {type:'finish',reason:{kind:'stop'}}
  }
 }
 try {
  await ctx.plugin(SystemPrompt);await ctx.plugin(ToolRuntime);await ctx.plugin(LlmRuntime)
  ctx.llm.registerAdapter(['fixture'],new FixtureAdapter())
  await ctx.plugin(chat)
  const result=await invoke(ctx,'dsh_x_chat',{prompt:'你好',provider:'fixture',model:'local'})
  assert.equal(result.isError,false,JSON.stringify(result))
  assert.equal(result.value.text,'本地协议测试成功')
 } finally {await ctx.fiber.dispose()}
})
