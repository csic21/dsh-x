import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'
import React, { act, useSyncExternalStore } from 'react'
import { createOfficialLocale } from '../../../test/fixtures/locale.mjs'

// DOM integration of the real published factory, using an explicit host fixture.
// This does not claim a real browser layout or an assembled-kernel UI test.
test('built client registers safe slots and supports add/order/remove/navigation/persistence',async()=>{
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
  const locale = await createOfficialLocale()
  const ctx: any={locale,slots,on(){return()=>{}},effect(fn: any){const dispose=fn();effects.push(dispose);return dispose},resources:{register(provider: any){resources.push(provider);return()=>{}}},connection:{rpc:{call:async(channel: any,endpoint: any)=>{assert.equal(endpoint,'dsh-x-stock.scope');return {ok:true,value:{scope}}}}},layout:{selectPanel(value: any){selectedPanel=value;calls.push(value)}}}
  vm.runInNewContext(await readFile(new URL('../lib/client.js',import.meta.url),'utf8'),{window:{__ModuleLoader__:{load(value: any){assert.equal(value.id,'dsh-x-stock');exported=value.factory((name: any)=>{assert.equal(name,'react');return React})}}},globalThis,navigator:dom.window.navigator,document:dom.window.document,URL,AbortController,setTimeout,clearTimeout,console})
  const { createRoot } = await import('react-dom/client')
  const root=createRoot(dom.window.document.getElementById('app')!)
  try {
    await act(async()=>exported.apply(ctx))
    assert.deepEqual(Array.from(entries.keys()).sort(),['main','shell.bottom','sidebar.panellist','tool.call.toolview'])
    assert.equal(entries.get('main')[0].options.key,'dsh-x-stock')
    assert.equal(entries.get('sidebar.panellist')[0].options.id,'dsh-x-stock')
    assert.equal(resources[0].protocol,'dsh-x-stock')
    const page=entries.get('main')[0], bar=entries.get('shell.bottom')[0]
    function Render({entry}: any) {
      useSyncExternalStore<any>(locale.subscribe.bind(locale), locale.getSnapshot.bind(locale), locale.getSnapshot.bind(locale))
      const face=entry.options.inject()
      const source=face.hooks.watchlist
      const useWatchlist=(selector: any)=>selector(useSyncExternalStore<any>(source.subscribe,source.getSnapshot,source.getSnapshot))
      const useResource=(address: any)=>({status:'live',value:{symbol:address.split('/').at(-1),status:'unconfigured',price:null,source:null,quotedAt:null,fetchedAt:'2026-10-16T07:00:00Z'}})
      return React.createElement(entry.component,{...face,useWatchlist,useResource,t:locale.bind(entry.options.locale)})
    }
    const render=async (entry: any)=>act(async()=>root.render(React.createElement(Render,{entry})))
    const click=async (button: any)=>act(async()=>button.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})))
    await render(page)
    assert.match(document.body.textContent,/还没有固定股票/)
    const input=async(element: any,value: any)=>act(async()=>{
      const prototype=element.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype
      ;(Object.getOwnPropertyDescriptor(prototype,'value'))!.set!.call(element,value)
      element.dispatchEvent(new dom.window.Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}))
    })
    const submit=async()=>act(async()=>(document.querySelector<HTMLElement & HTMLInputElement>('form'))!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})))
    await input(document.querySelector<HTMLElement & HTMLInputElement>('input[inputmode="numeric"]'),'600519')
    await input(document.querySelector<HTMLElement & HTMLInputElement>('input[maxlength="24"]'),'贵州茅台')
    await submit()
    await input(document.querySelector<HTMLElement & HTMLInputElement>('select'),'SZ')
    await input(document.querySelector<HTMLElement & HTMLInputElement>('input[inputmode="numeric"]'),'000001')
    await input(document.querySelector<HTMLElement & HTMLInputElement>('input[maxlength="24"]'),'平安银行')
    await submit()
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('article'))!.getAttribute('aria-label'),'SZ.000001 股票详情')
    await click(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="上移 SZ.000001"]'))
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('ol li'))!.textContent,/平安银行/)
    await render(bar)
    assert.match(document.body.textContent,/未配置行情/)
    const firstStock=[...document.querySelectorAll('button')].find(button=>button.textContent.includes('平安银行'))
    await click(firstStock);assert.equal(selectedPanel,'dsh-x-stock')
    await click(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="收起自选股票"]'))
    assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('.dxs-strip'),null)
    assert.ok(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="展开自选股票"]'))
    await click(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="展开自选股票"]'))
    await render(page)
    await click([...document.querySelectorAll('button')].find(button=>button.textContent==='返回对话'))
    assert.equal(selectedPanel,null);assert.deepEqual(calls,['dsh-x-stock',null])
    await click(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="移除 SH.600519"]'))
    assert.equal(JSON.parse(localStorage.getItem(`dsh-x-stock:watchlist:v1:${scope}`)!).pins.length,1)
    const form=document.querySelector<HTMLElement & HTMLInputElement>('form')
    await act(async()=>(form)!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})))
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('[role="alert"]'))!.textContent,/六位/)
    await act(async () => locale.setLocale('en'))
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('h1'))!.textContent, 'Stocks')
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('[role="alert"]'))!.textContent, /six-digit/)
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('article'))!.textContent, /平安银行/)
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('article'))!.textContent, /10\/16\/2026, 15:00:00 \(Shanghai\)/)
    assert.equal(entries.get('sidebar.panellist')[0].options.label(), 'Stocks')
    assert.ok(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="Move SZ.000001 up"]'))
    assert.match(document.body.textContent, /No historical market data/)
    await act(async () => (locale as any).addLanguage({ id: 'fr', label: 'Français', fallback: 'en' }))
    await act(async () => locale.setLocale('fr'))
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('h1'))!.textContent, 'Stocks')
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('[role="alert"]'))!.textContent, /six-digit/)
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('article'))!.textContent, /16\/10\/2026 15:00:00 \(Shanghai\)/)
    await act(async () => locale.setLocale('zh'))
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('[role="alert"]'))!.textContent, /六位/)
    assert.match(document.body.textContent,/暂无历史行情/)
    assert.match(document.body.textContent,/数据不足/)
    assert.equal(document.querySelectorAll('canvas').length,0)
    const tool=entries.get('tool.call.toolview')[0]
    let toolBlock: any={kind:'tool-result',isError:false,meta:{kind:'dsh-x-stock.quote',version:1,quote:{symbol:'BRK.B',provider:'Finnhub',price:1234.5,open:null,high:1300,low:1200,previousClose:1230,change:4.5,changePercent:0.37,quotedAt:'2026-10-16T07:00:00Z',fetchedAt:'2026-10-16T07:00:02Z'}},content:[]}
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
    toolBlock={kind:'tool-result',isError:true,error:{name:'DshXStockError',code:'DSH_X_STOCK_MISSING_KEY'},content:[{type:'text',text:'Do not use model-facing diagnostic as UI text'}]}
    await act(async()=>root.render(React.createElement(RenderTool)))
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('[role="alert"]'))!.textContent,/Set FINNHUB_API_KEY/)
    assert.doesNotMatch(document.body.textContent,/model-facing diagnostic/)
    await act(async()=>locale.setLocale('zh'))
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('[role="alert"]'))!.textContent,/请在运行环境设置/)

  } finally {
    await act(async()=>root.unmount())
    disposers.reverse().forEach((dispose: any) =>dispose?.());effects.reverse().forEach((dispose: any) =>dispose?.())
    assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('style[data-plugin="dsh-x-stock"]'),null)
    dom.window.close()
    for(const [key,value] of Object.entries(original)){if(value===undefined)delete (globalThis as any)[key as keyof typeof globalThis];else (globalThis as any)[key as keyof typeof globalThis]=value}
  }
})
