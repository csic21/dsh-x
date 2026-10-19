import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { createRepository } from '../src/repository.ts'
import { createReviewStore } from '../src/store.ts'
import { parseReview, reviewPrompt } from '../src/review.ts'
export function subprocess(spec: import('../src/git.ts').SpawnSpec): import('../src/git.ts').SpawnHandle{const child=spawn(spec.argv[0],spec.argv.slice(1),{cwd:spec.cwd,stdio:['ignore','pipe','pipe'],signal:spec.signal,env:{...process.env,...spec.env}});return {stdout:child.stdout,stderr:child.stderr,done:new Promise<any>((resolve,reject)=>{child.on('error',reject);child.on('close',(exitCode,signal)=>resolve({exitCode,signal}))})}}
export function fixture(t: import('node:test').TestContext){const root=mkdtempSync(path.join(tmpdir(),'code-repo-'));const git=(...args: string[])=>execFileSync('git',args,{cwd:root,stdio:'pipe'}).toString();git('init','-q');writeFileSync(path.join(root,'app.js'),'export const divide = (a, b) => a / b\n');writeFileSync(path.join(root,'.gitignore'),'ignored.js\n.env\n');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','initial');t.after(()=>rmSync(root,{recursive:true,force:true}));return {root,git,repository:createRepository(subprocess),options:{cwd:root,policy:{mode:'workspace-write',workspaceRoot:root}}}}
test('worktree, staged and base…HEAD have exact source versions and changed manifests',async t=>{
 const h=fixture(t),base=h.git('rev-parse','HEAD').trim();writeFileSync(path.join(h.root,'app.js'),'export const divide = (a, b) => b === 0 ? 0 : a / b\n');h.git('add','app.js');writeFileSync(path.join(h.root,'app.js'),'export const divide = (a, b) => b === 0 ? null : a / b\n')
 const wt=await h.repository.inventory(h.options),wi=await h.repository.file(wt,'app.js');assert.equal(wi.version,'Worktree');assert.match(wi.text!,/null/);assert.match(wi.beforeText!,/=> a \/ b/);assert.ok(wi.hunks!.length);assert.equal(wt.files.find(f=>f.path==='app.js')!.changed,true)
 const index=await h.repository.inventory({...h.options,mode:'staged'}),fi=await h.repository.file(index,'app.js');assert.equal(fi.version,'Index');assert.match(fi.text!,/\? 0/)
 h.git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','staged');const range=await h.repository.inventory({...h.options,mode:'range',base}),fr=await h.repository.file(range,'app.js');assert.match(fr.text!,/\? 0/);assert.equal(range.workspace.base,base);assert.equal(fr.version,h.git('rev-parse','HEAD').trim())
})
test('unknown/traversal paths, credential filenames, ignored content, symlinks and binaries are withheld',async t=>{
 const h=fixture(t);writeFileSync(path.join(h.root,'ignored.js'),'private ignored source');writeFileSync(path.join(h.root,'.env'),'unread');writeFileSync(path.join(h.root,'secret.js'),'const api_key = "abcdefghijklmnopqrstuv";');writeFileSync(path.join(h.root,'binary.js'),Buffer.from([0,1,2]));writeFileSync(path.join(h.root,'large.js'),'x'.repeat(70_000));symlinkSync('/etc/passwd',path.join(h.root,'link.js'));h.git('add','-f','ignored.js')
 const inv=await h.repository.inventory(h.options)
 for(const file of ['../etc/passwd','/etc/passwd','app.js\0'])await assert.rejects(()=>h.repository.file(inv,file),{code:'CODE_PATH'})
 assert.equal(inv.files.some(f=>f.path==='.env'),false)
 for(const file of ['ignored.js','secret.js','binary.js','large.js','link.js']){const v=await h.repository.file(inv,file);assert.notEqual(v.kind,'text',file);assert.equal(v.text,undefined,file);await assert.rejects(()=>h.repository.capture(inv,[file]),{code:'CODE_EXCLUDED'})}
})
test('preview shows source above the review cap and still withholds it from capture',async t=>{
 const h=fixture(t)
 writeFileSync(path.join(h.root,'wide.js'),'head\n'+'x'.repeat(70_000)+'\ntail\n')
 writeFileSync(path.join(h.root,'wide-secret.js'),'const api_key = "abcdefghijklmnopqrstuv";\n'+'y'.repeat(70_000))
 const inv=await h.repository.inventory(h.options)
 const shown=await h.repository.file(inv,'wide.js',{preview:true})
 assert.equal(shown.kind,'text');assert.equal(shown.truncated,false);assert.match(shown.text!,/^head\n/);assert.match(shown.text!,/tail\n$/)
 await assert.rejects(()=>h.repository.capture(inv,['wide.js']),{code:'CODE_EXCLUDED'})
 const secret=await h.repository.file(inv,'wide-secret.js',{preview:true})
 assert.notEqual(secret.kind,'text');assert.equal(secret.text,undefined)
 writeFileSync(path.join(h.root,'huge.js'),'A'.repeat(1024*1024+80)+'TAIL')
 const cut=await h.repository.file(await h.repository.inventory(h.options),'huge.js',{preview:true})
 assert.equal(cut.kind,'text');assert.equal(cut.truncated,false);assert.ok(cut.text!.endsWith('TAIL'));assert.equal(Buffer.byteLength(cut.text!),1024*1024+80+4)
})
test('selected parent-directory symlink is rejected and repository outside host root is blocked',async t=>{
 const h=fixture(t);mkdirSync(path.join(h.root,'src'));writeFileSync(path.join(h.root,'src','a.js'),'export const x = 1\n');h.git('add','src/a.js');h.git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','nested');rmSync(path.join(h.root,'src'),{recursive:true});symlinkSync('/tmp',path.join(h.root,'src'))
 const inv=await h.repository.inventory(h.options);await assert.rejects(()=>h.repository.file(inv,'src/a.js'),{code:'CODE_GIT'})
 await assert.rejects(()=>h.repository.inventory({...h.options,policy:{mode:'danger-full-access',workspaceRoot:'/usr'}}),{code:'CODE_BOUNDARY'})
})
test('review capture requires bounded explicit files and immutable content hashes change',async t=>{
 const h=fixture(t),inv=await h.repository.inventory(h.options),first=await h.repository.capture(inv,['app.js']);assert.ok(reviewPrompt(first).startsWith('CODE_REVIEW_V1'))
 await assert.rejects(()=>h.repository.capture(inv,[]),{code:'CODE_SCOPE'});await assert.rejects(()=>h.repository.capture(inv,['app.js','app.js']),{code:'CODE_SCOPE'})
 writeFileSync(path.join(h.root,'app.js'),'x'.repeat(50000));await assert.rejects(async()=>h.repository.capture(await h.repository.inventory(h.options),['app.js']),{code:'CODE_BUDGET'})
 writeFileSync(path.join(h.root,'app.js'),'export const changed = true\n');const second=await h.repository.capture(await h.repository.inventory(h.options),['app.js']);assert.notEqual(first.snapshotId,second.snapshotId)
})
test('Git clean/textconv commands are not executed by source or diff reads',async t=>{
 const h=fixture(t),marker=path.join(h.root,'filter-ran');writeFileSync(path.join(h.root,'.gitattributes'),'app.js filter=unsafe diff=unsafe\n');h.git('config','filter.unsafe.clean',`touch ${marker}`);h.git('config','filter.unsafe.process',`touch ${marker}`);h.git('config','filter.unsafe.required','true');h.git('config','diff.unsafe.textconv',`touch ${marker}`)
 const inv=await h.repository.inventory(h.options);await h.repository.file(inv,'app.js');assert.throws(()=>readFileSync(marker))
})
test('invalid base refs and unmerged files fail closed',async t=>{
 const h=fixture(t);for(const base of ['--output=/tmp','HEAD..main','HEAD@{1}','../private',''])await assert.rejects(()=>h.repository.inventory({...h.options,mode:'range',base}),{code:'CODE_BASE'})
})
test('structured findings require selected path, literal cited evidence and valid line range',async t=>{
 const h=fixture(t),snapshot=await h.repository.capture(await h.repository.inventory(h.options),['app.js'])
 const value={version:1,summary:'Synthetic source-only review',findings:[{path:'app.js',startLine:1,endLine:1,severity:'medium',title:'Zero divisor',body:'Zero produces Infinity.',evidence:'a / b',trigger:'b = 0'}],checks:[{name:'Tests',status:'passed',evidence:'Unverified native claim'}]}
 const result=parseReview(JSON.stringify(value),snapshot);assert.equal(result.findings.length,1);assert.equal(result.checks[0].status,'not_run');assert.equal(result.checks[0].verified,false)
 for(const patch of [{path:'outside.js'},{startLine:999,endLine:999},{evidence:'made up'},{severity:'urgent'}])await assert.rejects(async()=>parseReview(JSON.stringify({...value,findings:[{...value.findings[0],...patch}]}),snapshot),{code:'CODE_RESULT'})
})
test('profile scopes and review history persist independently with bounded sessions',t=>{
 const h=fixture(t),a=createReviewStore(h.root);a.mutate('session-a',v=>v.reviews.push({id:'one',state:'completed'}));const reload=createReviewStore(h.root);assert.equal(reload.scope,a.scope);assert.equal(reload.read('session-a').reviews[0].id,'one');assert.deepEqual(reload.read('session-b').reviews,[]);assert.throws(()=>a.read('../outside'),{code:'CODE_SESSION'})
})

test('diff coordinates remain deterministic under color and blank-context configuration and binary attributes',async t=>{
 const h=fixture(t);writeFileSync(path.join(h.root,'app.js'),'const a = 1\n\nconst b = 2\n');h.git('add','app.js');h.git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','blank lines');h.git('config','diff.suppressBlankEmpty','true');h.git('config','color.diff','always');writeFileSync(path.join(h.root,'.gitattributes'),'app.js -diff\n');writeFileSync(path.join(h.root,'app.js'),'const a = 1\n\nconst b = 3\n')
 const result=await h.repository.file(await h.repository.inventory(h.options),'app.js');assert.ok(result.hunks!.length);assert.ok(result.hunks![0].lines.includes(' '));assert.doesNotMatch(result.diff!,/\x1b/);assert.ok(result.hunks![0].lines.includes('+const b = 3'))
 rmSync(path.join(h.root,'app.js'));const inv=await h.repository.inventory(h.options);assert.equal(inv.files.find(f=>f.path==='app.js')!.status,'deleted');assert.equal((await h.repository.file(inv,'app.js')).afterKind,'missing')
})
test('recognizable Grok and Google key shapes never enter source previews or captured model input',async t=>{
 const h=fixture(t);for(const [name,key] of [['grok.js','xai-'+ 'a'.repeat(30)],['google.js','AIza'+ 'b'.repeat(35)]])writeFileSync(path.join(h.root,name),'const value = "'+key+'";')
 const inv=await h.repository.inventory(h.options);for(const name of ['grok.js','google.js']){const result=await h.repository.file(inv,name);assert.equal(result.kind,'excluded');assert.equal(result.text,undefined);await assert.rejects(()=>h.repository.capture(inv,[name]),{code:'CODE_EXCLUDED'})}
})

test('external alternate and symbolic Git object stores are rejected before blob capture',async t=>{
 const h=fixture(t);mkdirSync(path.join(h.root,'.git','objects','info'),{recursive:true});writeFileSync(path.join(h.root,'.git','objects','info','alternates'),'/outside/private/objects\n');await assert.rejects(()=>h.repository.inventory(h.options),{code:'CODE_BOUNDARY'});rmSync(path.join(h.root,'.git','objects','info','alternates'));symlinkSync('/tmp',path.join(h.root,'.git','objects','unsafe-link'));await assert.rejects(()=>h.repository.inventory(h.options),{code:'CODE_BOUNDARY'})
})


test('ordinary and explicitly configured global ignore rules remain enforced without global Git routing',async t=>{
 const h=fixture(t),home=path.join(h.root,'fixture-home');mkdirSync(home);const ignore=path.join(home,'global-ignore'),config=path.join(home,'.gitconfig');writeFileSync(ignore,'local-only.js\n');writeFileSync(config,`[core]\n excludesFile = ${ignore}\n`);writeFileSync(path.join(h.root,'local-only.js'),'private local source');
 for(const override of [false,true]) {
  const repo=createRepository(spec=>subprocess({...spec,env:{...spec.env,HOME:home,...(override?{GIT_CONFIG_GLOBAL:spec.env.GIT_CONFIG_GLOBAL===undefined?config:spec.env.GIT_CONFIG_GLOBAL}:{})}}));
  const inv=await repo.inventory(h.options);assert.equal(inv.files.some(f=>f.path==='local-only.js'),false);
  h.git('add','-f','local-only.js');const tracked=await repo.inventory(h.options);assert.equal((await repo.file(tracked,'local-only.js')).kind,'excluded');h.git('reset','-q','HEAD','--','local-only.js');
 }
})


test('byte-budget retention evicts oldest reviews without truncating the latest source',t=>{
 const h=fixture(t),store=createReviewStore(h.root),text='x'.repeat(1_500_000);
 for(const id of ['one','two','three'])store.mutate('history',value=>value.reviews.push({id,state:'completed',snapshot:{text}}));
 const retained=store.read('history').reviews;assert.deepEqual(retained.map(item=>item.id),['two','three']);assert.equal((retained[1].snapshot as {text: string}).text,text);
})
