import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'
import React, { act, useSyncExternalStore } from 'react'
import { createOfficialLocale } from '../../../test/fixtures/locale.mjs'

// DOM integration of the real published factory, using an explicit host fixture.
// This does not claim a real browser layout or an assembled-kernel UI test.
test('built client separates the watchlist from the fixed bar and supports add/order/remove/navigation/persistence',async()=>{
  const dom=new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>',{url:'http://localhost/'})
  const original: any={window:(globalThis as any).window,document:globalThis.document,localStorage:globalThis.localStorage,IS_REACT_ACT_ENVIRONMENT:(globalThis as any).IS_REACT_ACT_ENVIRONMENT}
  ;(globalThis as any).window=dom.window;globalThis.document=dom.window.document;globalThis.localStorage=dom.window.localStorage;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true
  let exported: any, selectedPanel: any=null
  const entries=new Map(), effects: any=[], calls: any=[], disposers: any=[], resources: any=[]
  const slots: any={
    inject(key: any,callback: any){const dispose=callback();disposers.push(dispose);return dispose},
    entries:(key: any)=>entries.get(key)??[],subscribe:()=>()=>{},
    register(options: any,component: any){const entry: any={options,component};entries.set(options.name,[...(entries.get(options.name)??[]),entry]);return()=>entries.set(options.name,(entries.get(options.name)??[]).filter((x: any)=>x!==entry))},
  }
  const scope='11111111-1111-4111-8111-111111111111'
  const storageKey=`dsh-x-finance:watchlist:v2:${scope}`
  const locale = await createOfficialLocale()
  const rpcCalls: any[]=[]
  const ctx: any={locale,slots,on(){return()=>{}},effect(fn: any){const dispose=fn();effects.push(dispose);return dispose},resources:{register(provider: any){resources.push(provider);return()=>{}}},connection:{rpc:{call:async(channel: any,endpoint: any,payload: any)=>{
    rpcCalls.push(JSON.parse(JSON.stringify({endpoint,payload})))
    if(endpoint==='dsh-x-finance.scope')return {ok:true,value:{scope}}
    // Offline fixtures only: the directory never receives a live security here.
    if(endpoint==='dsh-x-finance.search')return {ok:true,value:payload?.action==='status'?{status:'ready',enabled:true,source:'test-directory',results:[]}:{status:'ready',enabled:true,source:'test-directory',results:[{symbol:'SZ.002594',name:'比亚迪',kind:'stock'},{symbol:'SH.510300',name:'沪深300ETF华泰柏瑞',kind:'etf'}]}}
    if(endpoint==='dsh-x-finance.market-preference')return {ok:true,value:{enabled:true,forced:false}}
    if(endpoint==='dsh-x-finance.watch-schedule')return {ok:true,value:{enabled:false,running:false,syncedCount:0,lastAttemptDate:null,updatedAt:null,resultDate:null,rows:[],error:null,sourceEnabled:true,partial:false,freshness:'empty',blockedReason:'disabled'}}
    // The daily chart is part of the same page; this fixture has no bars, so it
    // must render the explicit "no daily data" state instead of a fake candle.
    if(endpoint==='dsh-x-finance.market'&&payload?.kind==='history')return {ok:true,value:{status:'unconfigured',source:null}}
    throw new Error(`unexpected endpoint ${endpoint}`)
  }}},layout:{selectPanel(value: any){selectedPanel=value;calls.push(value)}}}
  vm.runInNewContext(await readFile(new URL('../lib/client.js',import.meta.url),'utf8'),{window:{__ModuleLoader__:{load(value: any){assert.equal(value.id,'dsh-x-finance');exported=value.factory((name: any)=>{assert.equal(name,'react');return React})}}},globalThis,navigator:dom.window.navigator,document:dom.window.document,URL,AbortController,setTimeout,clearTimeout,console})
  const { createRoot } = await import('react-dom/client')
  const root=createRoot(dom.window.document.getElementById('app')!)
  const saved=()=>JSON.parse(localStorage.getItem(storageKey)!)
  try {
    await act(async()=>exported.apply(ctx))
    // An empty watchlist registers no bottom bar: the single bottom slot stays free.
    assert.deepEqual(Array.from(entries.keys()).sort(),['main','sidebar.panellist','tool.call.toolview'])
    assert.equal(entries.get('main')[0].options.key,'dsh-x-finance')
    assert.equal(entries.get('sidebar.panellist')[0].options.id,'dsh-x-finance')
    assert.equal(resources[0].protocol,'dsh-x-finance')
    const page=entries.get('main')[0]
    function Render({entry}: any) {
      useSyncExternalStore<any>(locale.subscribe.bind(locale), locale.getSnapshot.bind(locale), locale.getSnapshot.bind(locale))
      const face=entry.options.inject()
      const source=face.hooks.watchlist
      const useWatchlist=(selector: any)=>selector(useSyncExternalStore<any>(source.subscribe,source.getSnapshot,source.getSnapshot))
      // One batched resource shape for a single stock and for the fixed bar.
      const useResource=(address: any)=>{
        const path=String(address).replace('dsh-resource://dsh-x-finance/','')
        const [kind,rest]=path.split('/')
        const symbols=kind==='fixed'?String(rest).split(','):[String(rest)]
        return {status:'live',value:{source:'test-source',quotes:symbols.map(symbol=>({symbol,status:'unconfigured',name:'',price:null,changePercent:null,quotedAt:null,fetchedAt:'2026-10-16T07:00:00Z',marketStatus:'unknown'}))}}
      }
      return React.createElement(entry.component,{...face,useWatchlist,useResource,t:locale.bind(entry.options.locale)})
    }
    const render=async (entry: any)=>act(async()=>root.render(React.createElement(Render,{entry})))
    const click=async (button: any)=>act(async()=>button.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})))
    await render(page)
    assert.match(document.body.textContent,/还没有自选股票/)
    const input=async(element: any,value: any)=>act(async()=>{
      const prototype=element.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype
      ;(Object.getOwnPropertyDescriptor(prototype,'value'))!.set!.call(element,value)
      element.dispatchEvent(new dom.window.Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}))
    })
    const submit=async()=>act(async()=>(document.querySelector<HTMLElement & HTMLInputElement>('form'))!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})))
    await input(document.querySelector<HTMLElement & HTMLInputElement>('input[inputmode="numeric"]'),'600519')
    await input(document.querySelector<HTMLElement & HTMLInputElement>('input[name="alias"]'),'贵州茅台')
    await submit()
    await input(document.querySelector<HTMLElement & HTMLInputElement>('select'),'SZ')
    await input(document.querySelector<HTMLElement & HTMLInputElement>('input[inputmode="numeric"]'),'000001')
    await input(document.querySelector<HTMLElement & HTMLInputElement>('input[name="alias"]'),'平安银行')
    await submit()
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('article'))!.getAttribute('aria-label'),'SZ.000001 股票详情')
    await click(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="上移 SZ.000001"]'))
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('ol li'))!.textContent,/平安银行/)
    // Being on the watchlist is not being fixed: the bar is still absent.
    assert.equal(entries.get('shell.bottom'),undefined)
    assert.equal(saved().items.length,2)
    assert.deepEqual(saved().items.map((item: any)=>item.fixed),[false,false])
    await click(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="固定 SZ.000001 到底部栏"]'))
    assert.deepEqual(saved().items.map((item: any)=>[item.symbol,item.fixed]),[['SZ.000001',true],['SH.600519',false]])
    assert.match(document.body.textContent,/已固定 1\/8/)
    const bar=entries.get('shell.bottom')[0]
    await render(bar)
    const barText=()=>document.querySelector<HTMLElement & HTMLInputElement>('.dxs-bar')!.textContent!
    assert.match(barText(),/固定 1/)
    assert.match(barText(),/平安银行/)
    assert.doesNotMatch(barText(),/贵州茅台/)
    assert.match(document.body.textContent,/未配置行情/)
    await click([...document.querySelectorAll('button')].find(button=>button.textContent!.includes('平安银行')))
    assert.equal(selectedPanel,'dsh-x-finance')
    await click(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="收起固定股票条"]'))
    assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('.dxs-strip'),null)
    assert.ok(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="展开固定股票条"]'))
    await click(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="展开固定股票条"]'))
    // Hiding the bar releases the slot and the page can bring it back.
    await click(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="隐藏固定栏"]'))
    assert.equal((entries.get('shell.bottom')??[]).length,0)
    await render(page)
    assert.match(document.body.textContent,/固定栏已隐藏/)
    await click([...document.querySelectorAll('button')].find(button=>button.textContent==='显示固定栏')!)
    assert.equal((entries.get('shell.bottom')??[]).length,1)
    // The settings drawer is the one place for appearance, bar and source. Its
    // quiet mode renames the page and releases the bottom slot immediately.
    await click(document.querySelector<HTMLElement & HTMLInputElement>('[aria-haspopup="dialog"]')!)
    assert.ok(document.querySelector('[role="dialog"]'))
    assert.match(document.body.textContent!, /金融设置/)
    await click(document.querySelector<HTMLElement & HTMLInputElement>('input[aria-label="低调模式"]')!)
    assert.equal(JSON.parse(localStorage.getItem('dsh-x-finance:settings:v1')!).discreet,true)
    assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('main.dxs-page')!.classList.contains('dxs-discreet'),true)
    assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('h1')!.textContent,'工作台')
    assert.deepEqual([...document.querySelectorAll('.dxs-titlebar nav.dxs-view-tabs button')].map(button=>button.textContent),['列表','概览','关注','概率','指数','商品','分析'])
    assert.equal((entries.get('shell.bottom')??[]).length,0)
    // The drawer stays open, so the boss key's effect can be undone at once.
    await click(document.querySelector<HTMLElement & HTMLInputElement>('input[aria-label="低调模式"]')!)
    assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('h1')!.textContent,'金融')
    assert.equal((entries.get('shell.bottom')??[]).length,1)
    await click(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="关闭设置"]')!)
    assert.equal(document.querySelector('[role="dialog"]'),null)
    await click([...document.querySelectorAll('button')].find(button=>button.textContent==='返回对话')!)
    assert.equal(selectedPanel,null);assert.deepEqual(calls,['dsh-x-finance',null])
    await click(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="移除 SH.600519"]'))
    assert.equal(saved().items.length,1)
    // The page-level lookup is not a step of the add form: a pick opens a
    // preview page and writes nothing to the saved list.
    const lookup=document.querySelector<HTMLElement & HTMLInputElement>('.dxs-lookup input[name="instrument-lookup"]')!
    assert.ok(lookup,'the page offers a directory field of its own')
    assert.ok(document.querySelector('input[name="instrument-search"]'),'the add form keeps its own directory field')
    await input(lookup,'比亚')
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,320))})
    await click([...document.querySelectorAll<HTMLElement>('.dxs-lookup-bar [role="option"]')].find(option=>option.textContent!.includes('比亚迪'))!)
    assert.match(document.body.textContent!, /临时查看（未加入自选）/)
    assert.deepEqual(saved().items.map((item: any)=>item.symbol),['SZ.000001'],'looking a stock up must not write the watchlist')
    await click(document.querySelector<HTMLElement & HTMLInputElement>('.dxs-preview-back')!)
    // Name search in the add form: an explicit query, a debounce, then a pick
    // that fills the manual fields. The preview above unmounted the rail, so the
    // field is re-read instead of reusing a detached node.
    assert.match(document.body.textContent!, /搜索使用本机免费源/)
    const beforeAddSearch=rpcCalls.length
    await input(document.querySelector<HTMLElement & HTMLInputElement>('input[name="instrument-search"]'),'比亚')
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,320))})
    // Only the add form asks for a directory query here: the lookup above was
    // already debounced and settled before this point.
    assert.deepEqual(rpcCalls.slice(beforeAddSearch).filter((call: any)=>call.payload?.action==='search'),[{endpoint:'dsh-x-finance.search',payload:{action:'search',query:'比亚'}}])
    assert.match(document.body.textContent!, /比亚迪/)
    await click([...document.querySelectorAll<HTMLElement>('.dxs-form [role="option"]')].find(option=>option.textContent!.includes('比亚迪'))!)
    assert.equal(document.querySelector<HTMLInputElement>('input[name="code"]')!.value,'002594')
    assert.equal(document.querySelector<HTMLSelectElement>('select[name="exchange"]')!.value,'SZ')
    assert.equal(document.querySelector<HTMLInputElement>('input[name="alias"]')!.value,'比亚迪')
    assert.match(document.body.textContent!, /已选择 比亚迪 · SZ.002594 · 股票/)
    await submit()
    // Adding an alias alone never fixes a stock to the bar.
    assert.deepEqual(saved().items.at(-1),{symbol:'SZ.002594',alias:'比亚迪',fixed:false})
    await click(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="移除 SZ.002594"]'))
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('article'))!.getAttribute('aria-label'),'SZ.000001 股票详情')
    const form=document.querySelector<HTMLElement & HTMLInputElement>('form')
    await act(async()=>(form)!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})))
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('[role="alert"]'))!.textContent,/六位/)
    await act(async () => locale.setLocale('en'))
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('h1'))!.textContent, 'Finance')
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('[role="alert"]'))!.textContent, /six-digit/)
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('article'))!.textContent, /平安银行/)
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('article'))!.textContent, /10\/16\/2026, 15:00:00 \(Shanghai\)/)
    assert.equal(entries.get('sidebar.panellist')[0].options.label(), 'Finance')
    assert.ok(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="Move SZ.000001 up"]'))
    assert.ok(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="Unfix SZ.000001"]'))
    assert.match(document.body.textContent, /Daily data is off/)
    await act(async () => (locale as any).addLanguage({ id: 'fr', label: 'Français', fallback: 'en' }))
    await act(async () => locale.setLocale('fr'))
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('h1'))!.textContent, 'Finance')
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('[role="alert"]'))!.textContent, /six-digit/)
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('article'))!.textContent, /16\/10\/2026 15:00:00 \(Shanghai\)/)
    await act(async () => locale.setLocale('zh'))
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('[role="alert"]'))!.textContent, /六位/)
    assert.match(document.body.textContent,/日 K 数据未开启/)
    assert.match(document.body.textContent,/数据不足/)
    assert.equal(document.querySelectorAll('canvas').length,0)
    // Discreet mode hides the bar by default, but the page offers a one-click
    // keep action; the bar then renders with the same neutral palette.
    await click(document.querySelector<HTMLElement & HTMLInputElement>('[aria-haspopup="dialog"]')!)
    await click(document.querySelector<HTMLElement & HTMLInputElement>('input[aria-label="低调模式"]')!)
    assert.equal((entries.get('shell.bottom')??[]).length,0)
    await click(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="关闭设置"]')!)
    assert.match(document.body.textContent!,/低调模式下显示固定栏/)
    await click([...document.querySelectorAll('button')].find(button=>button.textContent==='低调模式下显示固定栏')!)
    assert.equal((entries.get('shell.bottom')??[]).length,1)
    assert.equal(JSON.parse(localStorage.getItem('dsh-x-finance:settings:v1')!).barInDiscreet,true)
    await render(entries.get('shell.bottom')[0])
    assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('.dxs-bar')!.classList.contains('dxs-discreet'),true)
    assert.match(barText(),/工作台/)
    const tool=entries.get('tool.call.toolview')[0]
    let toolBlock: any={kind:'tool-result',isError:false,meta:{kind:'dsh-x-finance.quote',version:1,quote:{symbol:'BRK.B',provider:'Finnhub',price:1234.5,open:null,high:1300,low:1200,previousClose:1230,change:4.5,changePercent:0.37,quotedAt:'2026-10-16T07:00:00Z',fetchedAt:'2026-10-16T07:00:02Z'}},content:[]}
    function RenderTool() {
      useSyncExternalStore<any>(locale.subscribe.bind(locale),locale.getSnapshot.bind(locale),locale.getSnapshot.bind(locale))
      return React.createElement(tool.component,{...tool.options.inject(),phase:'result',block:toolBlock,t:locale.bind(tool.options.locale)})
    }
    await act(async()=>root.render(React.createElement(RenderTool)))
    assert.match(document.body.textContent,/查询股票报价 · BRK.B/)
    await act(async()=>locale.setLocale('en'))
    assert.match(document.body.textContent,/Look up a stock quote · BRK.B/)
    assert.match(document.body.textContent,/1,234.50/)
    assert.match(document.body.textContent,/\+0.37%/)
    assert.match(document.body.textContent,/Finnhub/)
    assert.match(document.body.textContent,/not investment advice/)
    toolBlock={kind:'tool-result',isError:true,error:{name:'DshXFinanceError',code:'DSH_X_FINANCE_MISSING_KEY'},content:[{type:'text',text:'Do not use model-facing diagnostic as UI text'}]}
    await act(async()=>root.render(React.createElement(RenderTool)))
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('[role="alert"]'))!.textContent,/Set FINNHUB_API_KEY/)
    assert.doesNotMatch(document.body.textContent,/model-facing diagnostic/)
    await act(async()=>locale.setLocale('zh'))
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('[role="alert"]'))!.textContent,/请在运行环境设置/)

  } finally {
    await act(async()=>root.unmount())
    disposers.reverse().forEach((dispose: any) =>dispose?.());effects.reverse().forEach((dispose: any) =>dispose?.())
    assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('style[data-plugin="dsh-x-finance"]'),null)
    dom.window.close()
    for(const [key,value] of Object.entries(original)){if(value===undefined)delete (globalThis as any)[key as keyof typeof globalThis];else (globalThis as any)[key as keyof typeof globalThis]=value}
  }
})
