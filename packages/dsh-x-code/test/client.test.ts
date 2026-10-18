import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'
import React, { act, useSyncExternalStore } from 'react'
import { createOfficialLocale } from '../../../test/fixtures/locale.mjs'

const wait=()=>new Promise<any>(resolve=>setTimeout(resolve,0))
const fixture=(): any=>({scope:'profile',sessionId:'session',revision:1,workspace:{id:'workspace-v1',repoRoot:'/repo/example',cwd:'/repo/example',head:'a'.repeat(40),base:'a'.repeat(40),baseRef:'HEAD',mode:'worktree'},files:[{path:'src/calc.js',status:'modified',selectable:true,changed:true},{path:'README.md',status:'unchanged',selectable:true,changed:false}],limits:{maxSelectedFiles:20,maxReviewBytes:48000},dshAvailable:true,dshModel:{provider:'deepseek',model:'test-current'},review:null,history:[]})
const contents={path:'src/calc.js',kind:'text',status:'modified',text:'export function divide(a, b) {\n  return a / b\n}\n',beforeText:'export function divide(a, b) {\n  return b ? a / b : 0\n}\n',hash:'1'.repeat(64),version:'Worktree',baseVersion:'a'.repeat(40),hunks:[{oldStart:1,oldLines:3,newStart:1,newLines:3,lines:[' export function divide(a, b) {','-  return b ? a / b : 0','+  return a / b',' }']}]}

test('compiled Code client browses, searches, switches locales and prepares exact DSH review without sending',async()=>{
 const dom=new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>',{url:'http://localhost/'})
 const originals={window:(globalThis as any).window,document:globalThis.document,IS_REACT_ACT_ENVIRONMENT:(globalThis as any).IS_REACT_ACT_ENVIRONMENT,ResizeObserver:globalThis.ResizeObserver}
 ;(globalThis as any).window=dom.window;globalThis.document=dom.window.document;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true
 const observers=new Set<ResizeObserver>();class ResizeObserver { callback: any; target: any; constructor(callback: any){this.callback=callback;observers.add(this)}observe(target: any){this.target=target}disconnect(){observers.delete(this)} }
 ;(globalThis as any).ResizeObserver=ResizeObserver
 const resize=async(selector: any,width: any)=>act(async()=>{const target=document.querySelector<HTMLElement & HTMLInputElement>(selector);const observer=[...observers].find(item=>item.target===target);assert.ok(observer,`observed ${selector}`);observer.callback([{target,contentRect:{width}}]);await wait()})
 const locale=await createOfficialLocale();await locale.setLocale('en')
 const entries=new Map(),effects: any[]=[],disposers: any[]=[],calls: any[]=[];let exported: any,panel='dsh-x-code',snapshot=fixture(),historical: any=null,draft='Existing user text',sendCount=0
 const slots={inject(key: any,fn: any){const dispose=fn();disposers.push(dispose);return dispose},register(options: any,component: any){const entry={options,component};entries.set(options.name,[...(entries.get(options.name)??[]),entry]);return()=>entries.set(options.name,(entries.get(options.name)??[]).filter((item: any) =>item!==entry))}}
 const ctx={slots,locale,layout:{selectPanel(value: any){panel=value}},on(){return()=>{}},effect(fn: any){const dispose=fn();effects.push(dispose);return dispose},connection:{rpc:{call:async(_api: any,name: any,args: any)=>{calls.push({name,args});return {ok:true,value:name==='code/snapshot'?structuredClone(snapshot):name==='code/review'?structuredClone(historical):args.path==='README.md'?{path:'README.md',kind:'text',text:'# Example\n',beforeText:'# Example\n',hunks:[],version:'Worktree',hash:'2'.repeat(64)}:structuredClone(contents)}}}}}
 const highlighter=()=>undefined
 const primitives={languageForPath:()=> 'javascript',useCodeHighlighter:()=>highlighter}
 vm.runInNewContext(await readFile(new URL('../lib/client.js',import.meta.url),'utf8'),{window:{__ModuleLoader__:{load(value: any){assert.equal(value.id,'dsh-x-code');exported=value.factory((name: any) =>{if(name==='react')return React;if(name==='@deepseek-ai/dsh-client-ui-primitives')return primitives;throw new Error(name)})}}},globalThis,document:dom.window.document,ResizeObserver,URL,AbortController,setTimeout,clearTimeout,console,Intl})
 const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('app')!)
 const inputActions={captureInsertion:()=>({start:draft.length,end:draft.length,revision:1}),insertText(text: any,span: any){assert.equal(span.start,span.end);draft+=text;return true},persistDraft(){},send(){sendCount++}}
 let entry: any,face: any
 function Render({sessionId='session'}: {sessionId?: string | null}){useSyncExternalStore(locale.subscribe.bind(locale),locale.getSnapshot.bind(locale),locale.getSnapshot.bind(locale));face=entry.options.inject(sessionId);const source=face.hooks.code;const useCode=(selector: any)=>selector(useSyncExternalStore(source.subscribe,source.getSnapshot,source.getSnapshot));return React.createElement(entry.component,{...face,sessionId,inputActions,useCode,t:locale.bind(entry.options.locale)})}
 const click=async (node: any)=>{assert.ok(node,'expected clickable element');await act(async()=>{node.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));await wait()})}
 const byText=(text: any)=>[...document.querySelectorAll('button')].find(button=>button.textContent===text)
 const change=async(node: any,value: any)=>act(async()=>{const proto=node.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(node,value);node.dispatchEvent(new dom.window.Event(node.tagName==='SELECT'?'change':'input',{bubbles:true}));await wait()})
 try{
  await act(async()=>exported.apply(ctx));entry=entries.get('dsh-x-code.workspace')[0]
  assert.equal(entries.get('main')[0].options.children['dsh-x-code.workspace'].scope,'session-maybe')
  await act(async()=>{root.render(React.createElement(Render));await wait()})
  assert.match(document.body.textContent,/example/);assert.match(document.body.textContent,/No review yet/)
  await resize('.dxc-page',900);assert.equal(document.querySelectorAll('.dxc-mobile-tabs button').length,2)
  await click(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="Open src/calc.js"]'))
  assert.match(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-source-lines')!.textContent,/return a \/ b/)
  await click(byText('Diff'));assert.equal(document.querySelectorAll('.dxc-unified-row')!.length,4)
  await click(byText('Unified'));assert.equal(document.querySelectorAll('.dxc-split-column')!.length,2)
  await click(byText('Source'));await click(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="Find in file"]'))
  await change(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-find input'),'return');assert.match(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-find')!.textContent,/1 \/ 1/);assert.equal(document.querySelectorAll('.dxc-source-lines mark').length,1)
  await click(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="Close find"]'));assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-find'),null)
  await click(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="Select src/calc.js for review"]'))
  await click([...document.querySelectorAll('button')].find(button=>button.textContent==='Review1'))
  assert.equal(panel,null);assert.equal(sendCount,0);assert.match(draft,/^Existing user text/);assert.match(draft,/dsh_x_code_review/);assert.match(draft,/"runtime": "dsh"/);assert.doesNotMatch(draft,/"model":/)
  await click(byText('All'))
  const branch=document.querySelector<HTMLDetailsElement>('.dxc-tree>.dxc-branch>details')!
  assert.equal(branch.open,true);assert.equal(branch.querySelector('.dxc-dir-name')!.textContent,'src');assert.equal(branch.querySelector('summary')!.getAttribute('aria-label'),'src');assert.equal(branch.querySelectorAll('.dxc-children>.dxc-file-row').length,1)
  assert.equal(document.querySelectorAll('.dxc-tree>.dxc-file-row').length,1);assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-tree>.dxc-file-row .dxc-file-name')!.textContent,'README.md')
  await click(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="Open README.md"]'));assert.match(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-source-lines')!.textContent,/# Example/)
  await act(async()=>locale.setLocale('zh'));assert.match(document.body.textContent,/当前工作区|工作区文件/);assert.ok(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="在文件中查找"]'))
  await act(async()=>locale.setLocale('en'))
  snapshot.revision=2;snapshot.review={id:'review-1',state:'completed',mode:'worktree',stale:false,createdAt:'2026-10-17T10:00:00Z',snapshotId:'snapshot-1',paths:['src/calc.js'],findings:[{id:'finding-1',path:'src/calc.js',side:'before',startLine:2,endLine:2,severity:'high',title:'Guard disappeared',body:'Zero denominators no longer have a defined fallback.',evidence:'return b ? a / b : 0',trigger:'b is zero',status:'open'}],checks:[]}
  await act(async()=>{face.refresh();await wait();await wait()})
  assert.match(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-findings')!.textContent,/Checks not run/)
  await click(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-finding-title'))
  assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-toolbar>select')!.value,'review')
  assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-viewer-options select')!.value,'old')
  assert.match(document.querySelector<HTMLElement & HTMLInputElement>('[data-focused="true"]')!.textContent,/return b/)
  assert.equal(calls.filter(call=>call.name==='code/file').at(-1).args.reviewId,'review-1')
  assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-page')!.dataset.pane,'findings')
  await click(byText('Re-review'))
  assert.match(draft,/"previousReviewId": "review-1"/)
  await resize('.dxc-page',390);await resize('.dxc-viewer',390)
  assert.equal(document.querySelectorAll('.dxc-mobile-tabs button').length,3)
  await click(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-finding-title'));assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-page')!.dataset.pane,'code')
  await click(byText('Diff'));assert.equal(byText('Unified')!.disabled,true);assert.equal(document.querySelectorAll('.dxc-split-column').length,0)
  await resize('.dxc-page',900);await resize('.dxc-viewer',620);await click(byText('Source'))
  snapshot.revision=3;snapshot.review.stale=true
  await act(async()=>{face.refresh();await wait();await wait()})
  assert.match(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-findings')!.textContent,/Files changed since this review/)
  historical={...structuredClone(snapshot.review),id:'review-old',snapshotId:'older-snapshot',stale:true,isLatest:false,findings:[{...snapshot.review.findings[0],id:'old-finding',title:'Earlier finding'}]}
  snapshot.history=[{id:'review-old',state:'completed',snapshotId:'older-snapshot',summary:'Earlier',runtime:'dsh',createdAt:'2026-10-16T10:00:00Z',findings:1,previousReviewId:null}]
  await act(async()=>{face.refresh();await wait();await wait()})
  await click(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-history-item'))
  assert.match(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-history-banner')!.textContent,/Historical review/)
  assert.match(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-finding-title')!.textContent,/Earlier finding/)
  await click(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-finding-title'))
  assert.equal(calls.filter(call=>call.name==='code/file').at(-1).args.reviewId,'review-old')
  await click(byText('Latest review'));assert.match(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-finding-title')!.textContent,/Guard disappeared/)
  snapshot.dshAvailable=false
  await act(async()=>{face.refresh();await wait();await wait()})
  assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-header .dxc-primary')!.disabled,true)
  assert.match(document.body.textContent,/Configure a session model/)
  snapshot.dshAvailable=true
  snapshot.revision=4;snapshot.workspace={...snapshot.workspace,id:'staged-v2',mode:'staged'}
  await act(async()=>{face.refresh();await wait();await wait()})
  assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('[id="code-scope-session"]')!.value,'staged')
  await act(async()=>{root.render(null);await wait()})
  await act(async()=>{root.render(React.createElement(Render));await wait()})
  assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('[id="code-scope-session"]')!.value,'staged')
  await act(async()=>{root.render(React.createElement(Render,{sessionId:null}));await wait()})
  assert.match(document.body.textContent,/Open a conversation to browse/)

 }finally{await act(async()=>root.unmount());disposers.reverse().forEach(fn=>fn?.());effects.reverse().forEach(fn=>fn?.());assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('style[data-plugin="dsh-x-code"]'),null);dom.window.close();for(const[key,value]of Object.entries(originals)){if(value===undefined)delete (globalThis as any)[key];else (globalThis as any)[key]=value}}
})
