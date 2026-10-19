import test from 'node:test'
import assert from 'node:assert/strict'
import { diffHunks, hunkRows, pairedRows, searchMatches, sourceLines, fileTree, isMarkdownPath, previewKind, viewerTabs, defaultViewerTab, readFile, readSnapshot, reviewRequest } from '../src/client/model.ts'
import { en, zh, messageKey } from '../src/client/locales.ts'
const snapshot = (): any => ({ scope:'profile',sessionId:'session',revision:1,workspace:{id:'version',mode:'worktree',base:'abc',baseRef:'main'},files:[{path:'src/b.js',status:'modified',selectable:true,changed:true},{path:'README.md',status:'unchanged',selectable:true,changed:false}],limits:{maxSelectedFiles:20},review:null })

test('English and Chinese cover the same complete UI key set',()=>{assert.deepEqual(Object.keys(en).sort(),Object.keys(zh).sort());for(const [key,value]of Object.entries(en)){assert.ok(value.length,key);assert.deepEqual([...value.matchAll(/\{(\w+)\}/g)].map(item=>item[1]).sort(),[...zh[key as keyof typeof zh].matchAll(/\{(\w+)\}/g)].map(item=>item[1]).sort(),key)}})
test('Git hunk projection preserves old/new numbers and aligns replacement runs',()=>{
 const hunks=diffHunks('diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -8,3 +8,4 @@ function f\n same\n-old\n+new\n+more\n end\n\\ No newline at end of file\n')
 assert.equal(hunks.length,1);assert.equal(hunks[0].heading,'function f')
 const rows=hunkRows(hunks[0]);assert.deepEqual(rows.map(row=>[row.old,row.new]),[[8,8],[9,null],[null,9],[null,10],[10,11]])
 const split=pairedRows(rows);assert.equal(split.length,4);assert.equal(split[1].left!.text,'old');assert.equal(split[1].right!.text,'new');assert.equal(split[2].left,undefined)
})
test('markdown preview is limited to md and mdx documents',()=>{
  assert.equal(isMarkdownPath('README.md'),true);assert.equal(isMarkdownPath('docs/guide.MDX'),true);assert.equal(isMarkdownPath('src/readme.md.ts'),false);assert.equal(isMarkdownPath('notes.md.bak'),false);assert.equal(isMarkdownPath(null),false)
})
test('svg keeps source and image preview, while raster media is preview only',()=>{
  assert.equal(previewKind('icons/logo.SVG'),'svg');assert.deepEqual(viewerTabs('icons/logo.SVG'),['source','preview','diff']);assert.equal(defaultViewerTab('icons/logo.SVG',false),'preview');assert.equal(defaultViewerTab('icons/logo.SVG',true),'source')
  assert.equal(previewKind('assets/pixel.PNG'),'image');assert.deepEqual(viewerTabs('assets/pixel.PNG'),['preview']);assert.equal(defaultViewerTab('shot.jpg',true),'preview')
  assert.equal(previewKind('clip.mp4'),'video');assert.equal(previewKind('tone.mp3'),'audio');assert.equal(previewKind('src/app.ts'),null);assert.deepEqual(viewerTabs('src/app.ts'),['source','diff']);assert.equal(previewKind('notes.md.bak'),null)
  const image={path:'a.png',kind:'image',mediaType:'image/png',data:'aaaa',beforeData:'bbbb',text:''}
  assert.equal(readFile(image,'a.png'),image);assert.equal(readFile({...image,data:1},'a.png'),null);assert.equal(readFile({path:'a.png',kind:'image'},'a.png')?.kind,'image')
})
test('source terminators and literal search preserve exact offsets',()=>{
 assert.deepEqual(sourceLines(''),[]);assert.deepEqual(sourceLines('a\n\n'),['a','']);assert.deepEqual(searchMatches(['A[a A[a','other'],'a[a'),[{line:1,start:0,end:3},{line:1,start:4,end:7}]);assert.deepEqual(searchMatches(['x'],''),[])
})
test('filename filtering does not turn source opening into review selection',()=>{
 const value=snapshot();const changed=fileTree(value.files,'','changed');assert.deepEqual(changed.directories.map(node=>node.path),['src']);assert.deepEqual(changed.files,[]);assert.deepEqual(changed.directories[0].files.map(file=>file.path),['src/b.js'])
 const all=fileTree(value.files,'','all');assert.deepEqual(all.directories.map(node=>node.path),['src']);assert.deepEqual(all.files.map(file=>file.path),['README.md'])
 const searched=fileTree(value.files,'read','all');assert.deepEqual(searched.directories,[]);assert.deepEqual(searched.files.map(file=>file.path),['README.md'])
 const absent=fileTree(value.files,'absent','all');assert.deepEqual(absent.directories,[]);assert.deepEqual(absent.files,[])
})
test('file tree nests directories and joins lone directory chains',()=>{
 const files=[{path:'src/a/b/deep.ts',status:'modified',selectable:true,changed:true},{path:'src/a/top.ts',status:'modified',selectable:true,changed:true},{path:'src/other/x.ts',status:'modified',selectable:true,changed:true},{path:'lib/x/y/z.ts',status:'modified',selectable:true,changed:true},{path:'docs/guide.md',status:'unchanged',selectable:true,changed:false},{path:'README.md',status:'unchanged',selectable:true,changed:false}] as any
 const tree=fileTree(files,'','all');assert.deepEqual(tree.directories.map(node=>node.path),['docs','lib/x/y','src']);assert.deepEqual(tree.files.map(file=>file.path),['README.md'])
 assert.deepEqual(tree.directories[1].files.map(file=>file.path),['lib/x/y/z.ts'])
 assert.deepEqual(tree.directories[2].directories.map(node=>node.path),['src/a','src/other']);assert.deepEqual(tree.directories[2].files,[])
 assert.deepEqual(tree.directories[2].directories[0].directories.map(node=>node.path),['src/a/b'])
 const changed=fileTree(files,'','changed');assert.deepEqual(changed.directories.map(node=>node.path),['lib/x/y','src']);assert.deepEqual(changed.files,[])
 const searched=fileTree(files,'top','all');assert.deepEqual(searched.directories.map(node=>node.path),['src/a']);assert.deepEqual(searched.directories[0].files.map(file=>file.path),['src/a/top.ts'])
})
test('wire validation rejects duplicate files and unknown review severity',()=>{
 const value=snapshot();assert.equal(readSnapshot(value,'session'),value);assert.equal(readSnapshot(value,'other'),null);value.files.push(value.files[0]);assert.equal(readSnapshot(value,'session'),null)
 const malformed=snapshot();malformed.review={id:'r',state:'completed',stale:false,findings:[{id:'f',path:'a',severity:'okay',title:'Title',body:'Body'}],checks:[]};assert.equal(readSnapshot(malformed,'session'),null)
})
test('review requests preserve user base reference and explicit selected paths',()=>{
 const value=snapshot();value.workspace.mode='range';assert.deepEqual(reviewRequest(value,{paths:['src/b.js']}),{scope:'profile',workspaceId:'version',mode:'range',base:'main',paths:['src/b.js'],runtime:'dsh'});assert.throws(()=>reviewRequest(value,{paths:['unknown']}),/selectionChanged/);assert.throws(()=>reviewRequest(value,{paths:[]}),/selectFiles/)
})

test('host error codes produce localized actionable states',()=>{for(const [code,key]of Object.entries({CODE_GIT:'gitUnavailable',CODE_BASE:'invalidBase',CODE_HEAD:'noHead',CODE_POLICY:'policyUnavailable',CODE_BOUNDARY:'boundaryBlocked',CODE_INCOMPLETE:'incompleteManifest',CODE_STALE:'fileChanged','code/invalid-snapshot':'invalidState'})){assert.equal(messageKey(code),key);assert.ok(en[key as keyof typeof en]);assert.ok(zh[key as keyof typeof zh])}})
