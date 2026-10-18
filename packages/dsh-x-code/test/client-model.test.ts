import test from 'node:test'
import assert from 'node:assert/strict'
import { diffHunks, hunkRows, pairedRows, searchMatches, sourceLines, fileGroups, readSnapshot, reviewRequest, repairRequest, reviewCanFix } from '../src/client/model.ts'
import { en, zh, messageKey } from '../src/client/locales.ts'
const snapshot = (): any => ({ scope:'profile',sessionId:'session',revision:1,workspace:{id:'version',mode:'worktree',base:'abc',baseRef:'main'},files:[{path:'src/b.js',status:'modified',selectable:true,changed:true},{path:'README.md',status:'unchanged',selectable:true,changed:false}],limits:{maxSelectedFiles:20},review:null })

test('English and Chinese cover the same complete UI key set',()=>{assert.deepEqual(Object.keys(en).sort(),Object.keys(zh).sort());for(const [key,value]of Object.entries(en)){assert.ok(value.length,key);assert.deepEqual([...value.matchAll(/\{(\w+)\}/g)].map(item=>item[1]).sort(),[...zh[key as keyof typeof zh].matchAll(/\{(\w+)\}/g)].map(item=>item[1]).sort(),key)}})
test('Git hunk projection preserves old/new numbers and aligns replacement runs',()=>{
 const hunks=diffHunks('diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -8,3 +8,4 @@ function f\n same\n-old\n+new\n+more\n end\n\\ No newline at end of file\n')
 assert.equal(hunks.length,1);assert.equal(hunks[0].heading,'function f')
 const rows=hunkRows(hunks[0]);assert.deepEqual(rows.map(row=>[row.old,row.new]),[[8,8],[9,null],[null,9],[null,10],[10,11]])
 const split=pairedRows(rows);assert.equal(split.length,4);assert.equal(split[1].left!.text,'old');assert.equal(split[1].right!.text,'new');assert.equal(split[2].left,undefined)
})
test('source terminators and literal search preserve exact offsets',()=>{
 assert.deepEqual(sourceLines(''),[]);assert.deepEqual(sourceLines('a\n\n'),['a','']);assert.deepEqual(searchMatches(['A[a A[a','other'],'a[a'),[{line:1,start:0,end:3},{line:1,start:4,end:7}]);assert.deepEqual(searchMatches(['x'],''),[])
})
test('filename filtering does not turn source opening into review selection',()=>{
 const value=snapshot();assert.deepEqual(fileGroups(value.files,'','changed').map(group=>group.directory),['src']);assert.equal(fileGroups(value.files,'read','all')[0].files[0].path,'README.md');assert.equal(fileGroups(value.files,'absent','all').length,0)
})
test('wire validation rejects duplicate files and unknown review severity',()=>{
 const value=snapshot();assert.equal(readSnapshot(value,'session'),value);assert.equal(readSnapshot(value,'other'),null);value.files.push(value.files[0]);assert.equal(readSnapshot(value,'session'),null)
 const malformed=snapshot();malformed.review={id:'r',state:'completed',stale:false,findings:[{id:'f',path:'a',severity:'okay',title:'Title',body:'Body'}],checks:[]};assert.equal(readSnapshot(malformed,'session'),null)
})
test('review requests preserve user base reference and explicit selected paths',()=>{
 const value=snapshot();value.workspace.mode='range';assert.deepEqual(reviewRequest(value,{paths:['src/b.js'],runtime:'codex'}),{scope:'profile',workspaceId:'version',mode:'range',base:'main',paths:['src/b.js'],runtime:'codex'});assert.throws(()=>reviewRequest(value,{paths:['unknown'],runtime:'codex'}),/selectionChanged/);assert.throws(()=>reviewRequest(value,{paths:[],runtime:'codex'}),/selectFiles/)
})
test('repairs require current completed worktree evidence and selected open findings',()=>{
 const value=snapshot();value.review={id:'r',state:'completed',mode:'worktree',stale:false,repairReady:true,findings:[{id:'f',status:'open'}]};assert.equal(reviewCanFix(value.review),true);assert.equal(reviewCanFix({...value.review,repair:{state:'failed'}}),true);assert.deepEqual(repairRequest(value,{findingIds:['f'],runtime:'codex'}),{scope:'profile',reviewId:'r',findingIds:['f'],runtime:'codex'});for(const patch of [{stale:true},{mode:'staged'},{state:'failed'},{repairReady:false},{repair:{state:'completed'}}])assert.equal(reviewCanFix({...value.review,...patch}),false);assert.throws(()=>repairRequest(value,{findingIds:['other'],runtime:'codex'}),/staleFix/)
})

test('host error codes produce localized actionable states',()=>{for(const [code,key]of Object.entries({CODE_GIT:'gitUnavailable',CODE_BASE:'invalidBase',CODE_HEAD:'noHead',CODE_POLICY:'policyUnavailable',CODE_BOUNDARY:'boundaryBlocked',CODE_INCOMPLETE:'incompleteManifest',CODE_STALE:'fileChanged','code/invalid-snapshot':'invalidState'})){assert.equal(messageKey(code),key);assert.ok(en[key as keyof typeof en]);assert.ok(zh[key as keyof typeof zh])}})
