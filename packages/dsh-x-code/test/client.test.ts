import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'
import React, { act, useSyncExternalStore } from 'react'
import { createOfficialLocale } from '../../../test/fixtures/locale.mjs'

const wait=()=>new Promise<any>(resolve=>setTimeout(resolve,0))
const fixture=(): any=>({scope:'profile',sessionId:'session',revision:1,workspace:{id:'workspace-v1',repoRoot:'/repo/example',cwd:'/repo/example',head:'a'.repeat(40),base:'a'.repeat(40),baseRef:'HEAD',mode:'worktree'},files:[{path:'src/calc.js',status:'modified',selectable:true,changed:true},{path:'README.md',status:'unchanged',selectable:true,changed:false},{path:'zmedia/icon.svg',status:'unchanged',selectable:true,changed:false},{path:'zmedia/pixel.png',status:'unchanged',selectable:false,changed:false}],limits:{maxSelectedFiles:20,maxReviewBytes:48000},dshAvailable:true,dshModel:{provider:'deepseek',model:'test-current'},review:null,history:[]})
const contents={path:'src/calc.js',kind:'text',status:'modified',text:'export function divide(a, b) {\n  return a / b\n}\n',beforeText:'export function divide(a, b) {\n  return b ? a / b : 0\n}\n',hash:'1'.repeat(64),version:'Worktree',baseVersion:'a'.repeat(40),hunks:[{oldStart:1,oldLines:3,newStart:1,newLines:3,lines:[' export function divide(a, b) {','-  return b ? a / b : 0','+  return a / b',' }']}]}

test('compiled Code client browses, searches, switches locales and prepares exact DSH review without sending',async()=>{
 const dom=new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>',{url:'http://localhost/'})
 const originals={window:(globalThis as any).window,document:globalThis.document,localStorage:(globalThis as any).localStorage,IS_REACT_ACT_ENVIRONMENT:(globalThis as any).IS_REACT_ACT_ENVIRONMENT,ResizeObserver:globalThis.ResizeObserver}
 ;(globalThis as any).window=dom.window;globalThis.document=dom.window.document;globalThis.localStorage=dom.window.localStorage;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true
 const observers=new Set<ResizeObserver>();class ResizeObserver { callback: any; target: any; constructor(callback: any){this.callback=callback;observers.add(this)}observe(target: any){this.target=target}disconnect(){observers.delete(this)} }
 ;(globalThis as any).ResizeObserver=ResizeObserver
 const resize=async(selector: any,width: any)=>act(async()=>{const target=document.querySelector<HTMLElement & HTMLInputElement>(selector);const observer=[...observers].find(item=>item.target===target);assert.ok(observer,`observed ${selector}`);observer.callback([{target,contentRect:{width}}]);await wait()})
 const locale=await createOfficialLocale();await locale.setLocale('en')
 const entries=new Map(),effects: any[]=[],disposers: any[]=[],calls: any[]=[];let exported: any,panel='dsh-x-code',navigations=0,snapshot=fixture(),historical: any=null,draft='Existing user text',sendCount=0
 const slots={inject(key: any,fn: any){const dispose=fn();disposers.push(dispose);return dispose},register(options: any,component: any){const entry={options,component};entries.set(options.name,[...(entries.get(options.name)??[]),entry]);return()=>entries.set(options.name,(entries.get(options.name)??[]).filter((item: any) =>item!==entry))}}
 const ctx={slots,locale,layout:{selectPanel(value: any){panel=value;navigations++}},on(){return()=>{}},effect(fn: any){const dispose=fn();effects.push(dispose);return dispose},connection:{rpc:{call:async(_api: any,name: any,args: any)=>{calls.push({name,args});const svgFile={path:'zmedia/icon.svg',kind:'text',text:'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="4" height="4"/></svg>\n',beforeText:'<svg xmlns="http://www.w3.org/2000/svg"></svg>\n',hunks:[],version:'Worktree',hash:'3'.repeat(64)}
    const pngFile={path:'zmedia/pixel.png',kind:'image',mediaType:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',beforeData:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',afterKind:'image',beforeKind:'image',text:'',beforeText:'',version:'Worktree',hash:'4'.repeat(64)}
    return {ok:true,value:name==='code/snapshot'?structuredClone(snapshot):name==='code/review'?structuredClone(historical):args.path==='README.md'?{path:'README.md',kind:'text',text:'# Example\n',beforeText:'# Example\n',hunks:[],version:'Worktree',hash:'2'.repeat(64)}:args.path==='zmedia/icon.svg'?svgFile:args.path==='zmedia/pixel.png'?pngFile:structuredClone(contents)}}}}}
 const highlighter=()=>undefined
 const primitives={languageForPath:()=> 'javascript',useCodeHighlighter:()=>highlighter,MarkdownText:({text}:{text:string})=>React.createElement('article',{'data-markdown':'true'},text)}
 const blobs=new Map<string,Blob>();let blobSeq=0
 ;(URL as any).createObjectURL=(blob: Blob)=>{const url=`blob:test/${++blobSeq}`;blobs.set(url,blob);return url}
 ;(URL as any).revokeObjectURL=(url: string)=>{blobs.delete(url)}
 vm.runInNewContext(await readFile(new URL('../lib/client.js',import.meta.url),'utf8'),{window:{__ModuleLoader__:{load(value: any){assert.equal(value.id,'dsh-x-code');exported=value.factory((name: any) =>{if(name==='react')return React;if(name==='@deepseek-ai/dsh-client-ui-primitives')return primitives;throw new Error(name)})}}},globalThis,document:dom.window.document,ResizeObserver,URL,Blob,atob,Uint8Array,AbortController,setTimeout,clearTimeout,console,Intl})
 const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('app')!)
 const inputActions={captureInsertion:()=>({start:draft.length,end:draft.length,revision:1}),insertText(text: any,span: any){assert.equal(span.start,span.end);draft+=text;return true},persistDraft(){},send(){sendCount++}}
 // The official renderer supplies the Factory render share; this fixture records
 // the occurrence instead of mounting the shipped Conversation.
 const factories: any[]=[]
 const renderFactorySlot=(name: any,props: any,options: any)=>{factories.push({name,props,options});return React.createElement('div',{'data-factory':name,'data-variant':props.variant},String(name))}
 let entry: any,face: any
 // The shell's standard hooks arrive through the slot props; a blank Session
 // keeps the embedded Conversation in its hero phase.
 const shell={blank:false}
 const useSession=(selector: any)=>selector({blank:shell.blank,openState:'open',awaitingFirstTurn:false,running:false,promptAttempted:false})
 const useConversation=(selector: any)=>selector({activeTargets:new Set()})
 const opened: string[]=[],started: Array<string | undefined>=[]
  const useSessions=(selector: any)=>selector({byId:{session:{blank:shell.blank,title:'Code review',updatedAt:2},older:{title:'Earlier',blank:false,updatedAt:1}}})
  const useWorkspaces=(selector: any)=>selector({workspaces:[{workspaceId:'workspace-v1',cwd:'/repo/example',sessionIds:['session','older']}]})
 function Render({sessionId='session'}: {sessionId?: string | null}){useSyncExternalStore(locale.subscribe.bind(locale),locale.getSnapshot.bind(locale),locale.getSnapshot.bind(locale));face=entry.options.inject(sessionId);const source=face.hooks.code;const useCode=(selector: any)=>selector(useSyncExternalStore(source.subscribe,source.getSnapshot,source.getSnapshot));return React.createElement(entry.component,{...face,sessionId,inputActions,useCode,renderFactorySlot,useSession,useConversation,useSessions,useWorkspaces,openSession:(id: string)=>opened.push(id),startSession:(workspaceId?: string)=>started.push(workspaceId),t:locale.bind(entry.options.locale)})}
 const click=async (node: any)=>{assert.ok(node,'expected clickable element');await act(async()=>{node.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));await wait()})}
 const byText=(text: any)=>[...document.querySelectorAll('button')].find(button=>button.textContent===text)
 const change=async(node: any,value: any)=>act(async()=>{const proto=node.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(node,value);node.dispatchEvent(new dom.window.Event(node.tagName==='SELECT'?'change':'input',{bubbles:true}));await wait()})
 try{
  await act(async()=>exported.apply(ctx));entry=entries.get('dsh-x-code.workspace')[0]
  assert.equal(entries.get('main')[0].options.children['dsh-x-code.workspace'].scope,'session-maybe')
  const navIcon=entries.get('sidebar.panellist')[0].component
  const glyph=navIcon({size:16})
  assert.equal(glyph.type(glyph.props).props.width,16,'the panel row size reaches the SVG')
  const defaultGlyph=navIcon({})
  assert.equal(defaultGlyph.type(defaultGlyph.props).props.width,20,'the composer entry keeps its default size')
  await act(async()=>{root.render(React.createElement(Render));await wait()})
  assert.match(document.body.textContent,/example/);assert.match(document.body.textContent,/No review yet/)
  assert.equal(document.querySelector('.dxc-activity')!.getAttribute('aria-label'),'Explorer')
  assert.equal(document.querySelectorAll('.dxc-activity-item').length,3)
  assert.equal(document.querySelectorAll('.dxc-splitter').length,2)
  assert.equal(document.querySelector('.dxc-page')!.getAttribute('data-sidebar'),'true')
  assert.equal(document.querySelector('.dxc-page')!.getAttribute('data-panel'),'true')
  await resize('.dxc-page',900);assert.equal(document.querySelectorAll('.dxc-mobile-tabs button').length,0)
  const sidebarSplitter=document.querySelector<HTMLElement & HTMLInputElement>('.dxc-splitter[aria-label="Resize the file sidebar"]')!
  assert.equal(sidebarSplitter.getAttribute('aria-valuenow'),'236')
  await act(async()=>{sidebarSplitter.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));await wait()})
  assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-splitter[aria-label="Resize the file sidebar"]')!.getAttribute('aria-valuenow'),'248')
  assert.equal(JSON.parse(localStorage.getItem('dsh-x-code:layout:v1')!).sidebar,248,'the resized track is persisted')
  assert.equal(document.querySelectorAll('.dxc-sidebar').length,1,'an open sidebar is mounted once')
  const tracks=()=>[...document.querySelectorAll('.dxc-workbench > *')].map(node=>node.className.split(' ')[0])
  assert.deepEqual(tracks(),['dxc-track-activity','dxc-sidebar','dxc-splitter','dxc-editor','dxc-splitter','dxc-panel'])
  const sidebarKey=async (key: string) => act(async()=>{document.querySelector<HTMLElement & HTMLInputElement>('.dxc-splitter[aria-label="Resize the file sidebar"]')!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key,bubbles:true}));await wait()})
  await sidebarKey('Home')
  assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-splitter[aria-label="Resize the file sidebar"]')!.getAttribute('aria-valuenow'),'180')
  assert.equal(document.querySelectorAll('.dxc-sidebar').length,1,'Home stops at the minimum instead of collapsing')
  await sidebarKey('Enter')
  assert.equal(document.querySelector('.dxc-page')!.getAttribute('data-sidebar'),null,'Enter collapses the sidebar')
  assert.equal(document.querySelectorAll('.dxc-sidebar').length,0)
  assert.equal(document.querySelectorAll('.dxc-splitter').length,1,'a collapsed track removes only its own separator')
  assert.deepEqual(tracks(),['dxc-track-activity','dxc-editor','dxc-splitter','dxc-panel'],'a collapsed sidebar leaves the editor in its own track')
  await click(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="Toggle sidebar"]'))
  assert.equal(document.querySelector('.dxc-page')!.getAttribute('data-sidebar'),'true')
  assert.equal(document.querySelectorAll('.dxc-splitter').length,2)
  await click(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="Open src/calc.js"]'))
  assert.equal(document.querySelectorAll('.dxc-tab').length,1)
  assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-tab')!.getAttribute('data-preview'),'true')
  assert.match(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-breadcrumbs')!.textContent!,/src.*calc\.js/)
  assert.match(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-statusbar')!.textContent!,/Read-only/)
  assert.match(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-source-lines')!.textContent,/return a \/ b/)
  await click(byText('Diff'));assert.equal(document.querySelectorAll('.dxc-unified-row')!.length,4)
  await click(byText('Unified'));assert.equal(document.querySelectorAll('.dxc-split-column')!.length,2)
  await click(byText('Source'));await click(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="Find in file"]'))
  await change(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-find input'),'return');assert.match(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-find')!.textContent,/1 \/ 1/);assert.equal(document.querySelectorAll('.dxc-source-lines mark').length,1)
  await click(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="Close find"]'));assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-find'),null)
  await click(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="Select src/calc.js for review"]'))
  await click([...document.querySelectorAll('button')].find(button=>button.textContent==='Review1'))
  assert.equal(panel,null);assert.equal(sendCount,0);assert.match(draft,/^Existing user text/);assert.match(draft,/dsh_x_code_review/);assert.match(draft,/"runtime": "dsh"/);assert.doesNotMatch(draft,/"model":/)
  assert.equal(document.querySelectorAll('.dxc-sidebar-tabs button').length,0)
  await click(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="Changed"]'))
  assert.equal(document.querySelectorAll('.dxc-sidebar-tabs button').length,2)
  await click([...document.querySelectorAll('.dxc-sidebar-tabs button')].find(button=>button.textContent==='All'))
  const branch=document.querySelector<HTMLDetailsElement>('.dxc-tree>.dxc-branch>details')!
  assert.equal(branch.open,true);assert.equal(branch.querySelector('.dxc-dir-name')!.textContent,'src');assert.equal(branch.querySelector('summary')!.getAttribute('aria-label'),'src');assert.equal(branch.querySelectorAll('.dxc-children>.dxc-file-row').length,1)
  assert.equal(document.querySelectorAll('.dxc-tree>.dxc-file-row').length,1);assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-tree>.dxc-file-row .dxc-file-name')!.textContent,'README.md')
  await click(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="Open README.md"]'));assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-viewer-controls [role=tab][aria-selected=true]')!.textContent,'Preview');assert.match(document.querySelector<HTMLElement & HTMLInputElement>('[data-markdown]')!.textContent,/# Example/);await click(byText('Source'));assert.match(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-source-lines')!.textContent,/# Example/)
  await click(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="Open zmedia/icon.svg"]'))
  assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-viewer-controls [role=tab][aria-selected=true]')!.textContent,'Preview')
  assert.equal(document.querySelectorAll('.dxc-viewer-controls [role=tab]').length,3)
  const svgPreview=document.querySelector<HTMLImageElement>('[data-media=svg] img')!
  assert.ok(svgPreview);assert.match(svgPreview.src,/^blob:/);assert.equal(document.querySelectorAll('script').length,0);assert.equal(blobs.get(svgPreview.src)?.type,'image/svg+xml')
  await click(byText('Source'));assert.match(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-source-lines')!.textContent,/<script>alert\(1\)<\/script>/)
  await click(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="Open zmedia/pixel.png"]'))
  assert.deepEqual([...document.querySelectorAll('.dxc-viewer-controls [role=tab]')].map(item=>item.textContent),['Preview'])
  assert.ok(document.querySelector('[data-media=image] img'));assert.equal(document.querySelector<HTMLInputElement>('[aria-label="Select zmedia/pixel.png for review"]')!.disabled,true)
  await click(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="Open README.md"]'));await click(byText('Source'))
  await act(async()=>locale.setLocale('zh'));assert.match(document.body.textContent,/当前工作区|工作区文件/);assert.ok(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="在文件中查找"]'))
  await act(async()=>locale.setLocale('en'))
  snapshot.revision=2;snapshot.review={id:'review-1',state:'completed',mode:'worktree',stale:false,createdAt:'2026-10-17T10:00:00Z',snapshotId:'snapshot-1',paths:['src/calc.js'],findings:[{id:'finding-1',path:'src/calc.js',side:'before',startLine:2,endLine:2,severity:'high',title:'Guard disappeared',body:'Zero denominators no longer have a defined fallback.',evidence:'return b ? a / b : 0',trigger:'b is zero',status:'open'}],checks:[]}
  await act(async()=>{face.refresh();await wait();await wait()})
  assert.match(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-panel')!.textContent,/Checks not run/)
  await click([...document.querySelectorAll('.dxc-panel-tabs button')].find(button=>button.textContent==='Problems1'))
  assert.equal(document.querySelectorAll('.dxc-problem').length,1)
  await click(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-problem'))
  await click([...document.querySelectorAll('.dxc-panel-tabs button')].find(button=>button.textContent==='Review'))
  await click(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-finding-title'))
  assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-toolbar>select')!.value,'review')
  assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-viewer-options select')!.value,'old')
  assert.match(document.querySelector<HTMLElement & HTMLInputElement>('[data-focused="true"]')!.textContent,/return b/)
  assert.equal(calls.filter(call=>call.name==='code/file').at(-1).args.reviewId,'review-1')
  assert.equal(document.querySelectorAll('.dxc-tab').length,2)
  assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-tab[data-active=true] button[role=tab]')!.getAttribute('title'),'src/calc.js')
  await click(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="Close README.md"]'))
  assert.equal(document.querySelectorAll('.dxc-tab').length,1,'closing an inactive tab keeps the active editor')
  assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-tab[data-active=true] button[role=tab]')!.getAttribute('title'),'src/calc.js')
  const pressed=()=>[...document.querySelectorAll('.dxc-activity-item')].find(button=>button.getAttribute('aria-pressed')==='true')!
  assert.equal(pressed().getAttribute('aria-label'),'Changed')
  await click(pressed())
  assert.equal(document.querySelector('.dxc-page')!.getAttribute('data-sidebar'),null,'choosing the active view collapses the sidebar')
  await click(pressed())
  assert.equal(document.querySelector('.dxc-page')!.getAttribute('data-sidebar'),'true','choosing it again restores the sidebar')
  await click([...document.querySelectorAll('.dxc-activity-item')].find(button=>button.getAttribute('aria-label')==='Explorer'))
  assert.equal(pressed().getAttribute('aria-label'),'Explorer')
  await click(byText('Re-review'))
  assert.match(draft,/"previousReviewId": "review-1"/)
  await resize('.dxc-page',390);await resize('.dxc-viewer',390)
  assert.equal(document.querySelectorAll('.dxc-mobile-tabs button').length,3)
  assert.equal(document.querySelectorAll('.dxc-splitter').length,0,'narrow layouts do not offer splitters')
  await click([...document.querySelectorAll('.dxc-mobile-tabs button')].find(button=>/^Findings/.test(button.textContent!))!)
  assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-page')!.dataset.pane,'findings')
  await click([...document.querySelectorAll('.dxc-panel-tabs button')].find(button=>button.textContent==='Review'))
  await click(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-finding-title'))
  assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-page')!.dataset.pane,'code')
  await click(byText('Diff'));assert.equal(byText('Unified')!.disabled,true);assert.equal(document.querySelectorAll('.dxc-split-column').length,0)
  await resize('.dxc-page',900);await resize('.dxc-viewer',620);await click(byText('Source'))
  snapshot.revision=3;snapshot.review.stale=true
  await act(async()=>{face.refresh();await wait();await wait()})
  assert.match(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-panel')!.textContent,/Files changed since this review/)
  historical={...structuredClone(snapshot.review),id:'review-old',snapshotId:'older-snapshot',stale:true,isLatest:false,findings:[{...snapshot.review.findings[0],id:'old-finding',title:'Earlier finding'}]}
  snapshot.history=[{id:'review-old',state:'completed',snapshotId:'older-snapshot',summary:'Earlier',runtime:'dsh',createdAt:'2026-10-16T10:00:00Z',findings:1,previousReviewId:null}]
  await act(async()=>{face.refresh();await wait();await wait()})
  await click(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="Review history"]'))
  assert.equal(document.querySelector('.dxc-sidebar-title')!.textContent!.includes('Review history'),true)
  await click(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-history-item'))
  assert.match(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-history-banner')!.textContent,/Historical review/)
  assert.match(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-finding-title')!.textContent,/Earlier finding/)
  await click(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-finding-title'))
  assert.equal(calls.filter(call=>call.name==='code/file').at(-1).args.reviewId,'review-old')
  await click(byText('Latest review'));assert.match(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-finding-title')!.textContent,/Guard disappeared/)
  snapshot.dshAvailable=false
  await act(async()=>{face.refresh();await wait();await wait()})
  assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-header-actions .dxc-primary')!.disabled,true)
  assert.match(document.body.textContent,/Configure a session model/)
  snapshot.dshAvailable=true
  snapshot.revision=4;snapshot.workspace={...snapshot.workspace,id:'staged-v2',mode:'staged'}
  await act(async()=>{face.refresh();await wait();await wait()})
  assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('[id="code-scope-session"]')!.value,'staged')
  await act(async()=>{root.render(null);await wait()})
  await act(async()=>{root.render(React.createElement(Render));await wait()})
  assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('[id="code-scope-session"]')!.value,'staged')
  // The Chat tab embeds the official Conversation Factory rather than a second
  // transcript: images, / commands and @ references therefore come from the shell.
  assert.equal(factories.length,0,'no Conversation occurrence before the Chat tab is opened')
  await click([...document.querySelectorAll('.dxc-panel-tabs button')].find(button=>button.textContent==='Chat'))
  assert.equal(factories.length,1)
  assert.equal(factories[0].name,'conversation.content')
  // The client bundle runs in its own realm, so compare fields instead of prototypes.
  assert.equal(factories[0].props.variant,'embedded')
  assert.equal(factories[0].props.phase,'active')
  assert.equal(factories[0].props.hero,false)
  assert.equal(typeof factories[0].options.slots.views,'function')
  assert.ok(document.querySelector('[data-factory="conversation.content"]'))
  assert.equal(document.querySelectorAll('.dxc-chat textarea,.dxc-chat-form').length,0,'no hand-written composer')
  // The shell's session store re-renders the occurrence on its own; an unchanged
  // snapshot poll does not, because the panel reuses the state it already shows.
  shell.blank=true
  await act(async()=>{root.render(React.createElement(Render));await wait()})
  assert.equal(factories.at(-1).props.phase,'hero','a blank Session keeps the centred hero composer')
  assert.equal(factories.at(-1).props.hero,true)
  shell.blank=false
  await act(async()=>{root.render(React.createElement(Render));await wait()})
  assert.equal(factories.at(-1).props.phase,'active')
  assert.match(draft,/dsh_x_code_review/,'the main composer draft is untouched by the embedded Chat tab')
  assert.equal(sendCount,0)
  // Right-click adds a file or the selected text to the shared draft and leaves sending to the composer.
  const menuAt=async(node: Element)=>{await act(async()=>{node.dispatchEvent(new dom.window.MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:30,clientY:40}));await wait()})}
  const stayed=navigations
  await click([...document.querySelectorAll('.dxc-activity-item')].find(button=>button.getAttribute('aria-label')==='Explorer'))
  await click(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="Open README.md"]'))
  await click(byText('Source'))
  await menuAt(document.querySelector<HTMLElement & HTMLInputElement>('[aria-label="Open README.md"]')!)
  assert.equal(document.querySelector('.dxc-context-menu')!.getAttribute('aria-label'),'Add to conversation')
  await click([...document.querySelectorAll('.dxc-context-menu [role=menuitem]')].find(button=>button.textContent==='Ask about this file'))
  assert.equal(document.querySelector('.dxc-context-menu'),null)
  assert.match(draft,/Please look at `README\.md`/)
  assert.equal(sendCount,0)
  assert.equal(navigations,stayed,'asking does not leave the workbench')
  assert.equal([...document.querySelectorAll('.dxc-panel-tabs [role=tab]')].find(button=>button.getAttribute('aria-selected')==='true')!.textContent,'Chat')
  const line=document.querySelector('.dxc-line-text')!
  const range=document.createRange();range.selectNodeContents(line);const selection=document.getSelection()!;selection.removeAllRanges();selection.addRange(range)
  await menuAt(document.querySelector('.dxc-code-scroll')!)
  await click([...document.querySelectorAll('.dxc-context-menu [role=menuitem]')].find(button=>button.textContent==='Ask about this selection'))
  assert.match(draft,/# Example/)
  assert.equal(sendCount,0)
  selection.removeAllRanges()
  const sessionBar=document.querySelector<HTMLSelectElement>('.dxc-session-bar select')!
  assert.equal(sessionBar.value,'session')
  assert.deepEqual([...sessionBar.options].map(option=>option.text),['Code review · Current','Earlier'])
  await change(sessionBar,'older')
  assert.deepEqual(opened,['older'])
  await click(document.querySelector<HTMLElement & HTMLInputElement>('.dxc-session-bar button'))
  assert.deepEqual(started,['workspace-v1'])
  assert.equal(sendCount,0,'switching or creating a session does not send the draft')
  await click([...document.querySelectorAll('.dxc-panel-tabs button')].find(button=>button.textContent==='Review'))
  await act(async()=>{root.render(React.createElement(Render,{sessionId:null}));await wait()})
  assert.match(document.body.textContent,/Open a conversation to browse/)
 }finally{await act(async()=>root.unmount());disposers.reverse().forEach(fn=>fn?.());effects.reverse().forEach(fn=>fn?.());assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('style[data-plugin="dsh-x-code"]'),null);dom.window.close();for(const[key,value]of Object.entries(originals)){if(value===undefined)delete (globalThis as any)[key];else (globalThis as any)[key]=value}}
})
