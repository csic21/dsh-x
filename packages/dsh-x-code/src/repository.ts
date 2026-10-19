import { realpath, lstat, readdir } from 'node:fs/promises'
import type { BigIntStats } from 'node:fs'
import path from 'node:path'
import { createGit } from './git.ts'
import type { Spawn } from './git.ts'
import { evidencePathReason, readEvidenceFile, containsCredentialLikeText, hashText, MAX_EVIDENCE_FILE_BYTES } from './files.ts'
import type { EvidenceFile } from './files.ts'
import { fail, hash } from './store.ts'
export const LIMITS = Object.freeze({maxFiles:4000,maxSelectedFiles:20,maxFileBytes:MAX_EVIDENCE_FILE_BYTES,maxReviewBytes:49152,maxFindings:100})
/** Comparison scope selected for one repository read. */
export type ReviewMode = 'worktree' | 'staged' | 'range'
/** Host workspace policy as validated before any repository request. */
export interface HostPolicy { workspaceRoot: string, mode: string }
/** One index or tree record for a path. */
export interface ManifestEntry { mode: string, oid: string, kind?: string, unmerged?: boolean }
/** One file view for one path; `kind` selects which optional payload fields apply. */
export interface FileEvidence {
  path: string
  kind: string
  reason?: string
  fingerprint?: string
  mode?: '100644' | '100755'
  text?: string
  beforeText?: string
  hash?: string
  beforeHash?: string
  status?: string
  version?: string
  baseVersion?: string
  afterKind?: string
  beforeKind?: string
  diff?: string
  hunks?: Hunk[]
  truncated?: boolean
  diffTruncated?: boolean
  selectable?: boolean
  changed?: boolean
}
/** One diff hunk with its original and current line coordinates. */
export interface Hunk { oldStart: number, oldLines: number, newStart: number, newLines: number, lines: string[] }
/** One enumerated manifest entry, whether or not its source may be shown. */
export interface WorkspaceFile { path: string, changed: boolean, status: string, selectable: boolean, reason: string | null }
/** The immutable repository identity a review is bound to. */
export interface Workspace {
  cwd: string
  repoRoot: string
  gitDir: string
  commonDir: string
  repositoryId: string
  head: string
  base: string
  baseRef: string
  mode: ReviewMode
  indexHash: string
  policyRoot: string
  id: string
}
/** One bounded repository inspection. */
export interface Inventory {
  workspace: Workspace
  files: WorkspaceFile[]
  complete: boolean
  truncated: boolean
  limits: typeof LIMITS
  before: Map<string, ManifestEntry>
  after: Map<string, ManifestEntry>
  signal: AbortSignal | undefined
  policy: HostPolicy
}
/** One immutable captured review scope. */
export interface CapturedSnapshot {
  snapshotId: string
  workspace: Workspace
  files: FileEvidence[]
  bytes: number
  paths: string[]
}
/** One repository read request; every field is validated before use. */
export interface InventoryOptions {
  cwd: string
  policy: HostPolicy | null | undefined
  mode?: string
  base?: string
  signal?: AbortSignal | undefined
}
const OID=/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/
const within=(root: string,cwd: string): boolean=>{const relative=path.relative(root,cwd);return relative===''||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative)}
export const validMode=(mode: unknown): ReviewMode=>{if(mode!=='worktree'&&mode!=='staged'&&mode!=='range')throw fail('CODE_MODE','Choose worktree, staged, or range.');return mode}
function records(raw: string): string[]{if(raw&&!raw.endsWith('\0'))throw fail('CODE_GIT','Incomplete Git manifest.');return raw?raw.slice(0,-1).split('\0'):[]}
export function createRepository(spawn: Spawn) {
 const git=createGit(spawn)
 async function required(cwd: string,args: string[],signal: AbortSignal | undefined,max?: number): Promise<string>{const r=await git(cwd,args,signal,max);if(!r.ok)throw fail('CODE_GIT','Git evidence is unavailable or exceeds its size limit.');return r.output}
 async function inventory({cwd,policy,mode='worktree',base,signal}: InventoryOptions): Promise<Inventory> {
  const reviewMode=validMode(mode);mode=reviewMode;cwd=await realpath(cwd)
  if(!policy||!path.isAbsolute(policy.workspaceRoot??'')||!['read-only','workspace-write','danger-full-access'].includes(policy.mode))throw fail('CODE_POLICY','The host workspace policy is unavailable.')
  const policyRoot=await realpath(policy.workspaceRoot)
  const repoRoot=await realpath((await required(cwd,['rev-parse','--show-toplevel'],signal)).trim())
  if(!within(policyRoot,cwd)||!within(policyRoot,repoRoot))throw fail('CODE_BOUNDARY','The repository is outside the host workspace boundary. Select its root as the session workspace.')
  const gitDir=await realpath((await required(cwd,['rev-parse','--absolute-git-dir'],signal)).trim())
  if(!within(policyRoot,gitDir))throw fail('CODE_BOUNDARY','Git metadata is outside the host workspace boundary. Select a workspace encompassing the repository metadata.')
  const commonRaw=(await required(cwd,['rev-parse','--git-common-dir'],signal)).trim(),commonDir=await realpath(path.resolve(cwd,commonRaw))
  if(!within(policyRoot,commonDir))throw fail('CODE_BOUNDARY','Shared Git metadata is outside the host workspace boundary.')
  for(const dir of new Set([gitDir,commonDir]))for(const name of ['config','config.worktree','index','HEAD','commondir']){const stat=await lstat(path.join(dir,name)).catch((error: NodeJS.ErrnoException)=>{if(error.code==='ENOENT')return null;throw error});if(stat?.isSymbolicLink())throw fail('CODE_BOUNDARY','Symbolic Git metadata is unsupported.')}
  const objects=path.join(commonDir,'objects'),alternate=await lstat(path.join(objects,'info','alternates')).catch((error: NodeJS.ErrnoException)=>{if(error.code==='ENOENT')return null;throw error})
  if(alternate&&(alternate.isSymbolicLink()||alternate.size>0))throw fail('CODE_BOUNDARY','Git alternate object stores are unsupported for scoped review.')
  let objectEntries=0;const queue=[objects]
  while(queue.length){signal?.throwIfAborted();const dir=queue.pop()!;if((await lstat(dir)).isSymbolicLink())throw fail('CODE_BOUNDARY','Symbolic Git object stores are unsupported.');for(const entry of await readdir(dir,{withFileTypes:true})){if(++objectEntries>20000)throw fail('CODE_INCOMPLETE','Git object metadata exceeds the inspection limit.');if(entry.isSymbolicLink())throw fail('CODE_BOUNDARY','Symbolic Git object stores are unsupported.');if(entry.isDirectory())queue.push(path.join(dir,entry.name))}}
  const gitStat=await lstat(gitDir,{bigint:true}),commonStat=await lstat(commonDir,{bigint:true});const repositoryId=hash({repoRoot,gitDir,commonDir,dev:String(gitStat.dev),ino:String(gitStat.ino),commonDev:String(commonStat.dev),commonIno:String(commonStat.ino)})
  const head=(await required(cwd,['rev-parse','--verify','HEAD'],signal)).trim()
  if(!OID.test(head))throw fail('CODE_HEAD','A committed Git HEAD is required.')
  let baseRef=mode==='range'?base:'HEAD',baseOid=head
  if(mode==='range') {
   if(typeof base!=='string'||!base||base.length>160||! /^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(base)||base.includes('..'))throw fail('CODE_BASE','Choose a branch, tag, or commit hash as the base.')
   const resolved=(await required(repoRoot,['rev-parse','--verify',`${base}^{commit}`],signal)).trim()
   if(!OID.test(resolved))throw fail('CODE_BASE','The base did not resolve to a commit.')
   baseOid=(await required(repoRoot,['merge-base',resolved,head],signal)).trim()
   if(!OID.test(baseOid))throw fail('CODE_BASE','The base has no supported merge base.')
  }
  const index=await required(repoRoot,['ls-files','--stage','-z'],signal)
  const indexEntries=new Map<string, ManifestEntry>()
  for(const entry of records(index)) { const m=/^([0-7]{6}) ([a-f0-9]{40}(?:[a-f0-9]{24})?) ([0-3])\t([\s\S]+)$/.exec(entry);if(!m)throw fail('CODE_GIT','Unsupported index record.');indexEntries.set(m[4],{mode:m[1],oid:m[2],unmerged:m[3]!=='0'||indexEntries.get(m[4])?.unmerged}) }
  async function tree(ref: string): Promise<Map<string, ManifestEntry>>{const result=new Map<string, ManifestEntry>();for(const entry of records(await required(repoRoot,['ls-tree','-r','-z',ref],signal))) {const m=/^([0-7]{6}) (blob|commit) ([a-f0-9]{40}(?:[a-f0-9]{24})?)\t([\s\S]+)$/.exec(entry);if(!m)throw fail('CODE_GIT','Unsupported tree record.');result.set(m[4],{mode:m[1],oid:m[3],kind:m[2]})}return result}
  const before=await tree(baseOid), after: Map<string, ManifestEntry>=mode==='range'?await tree(head):indexEntries
  const untracked=mode==='worktree'?records(await required(repoRoot,['ls-files','--others','--exclude-standard','-z'],signal)):[]
  const diffArgs=['diff','--name-only','-z','--no-ext-diff','--no-textconv','--ignore-submodules=all','--no-renames',...(mode==='staged'?['--cached',head]:mode==='range'?[baseOid,head]:[head]),'--']
  const changed=new Set([...records(await required(repoRoot,diffArgs,signal)),...untracked])
  const paths=[...new Set([...before.keys(),...after.keys(),...untracked])].sort()
  const truncated=paths.length>LIMITS.maxFiles
  const statCache=new Map<string, Promise<BigIntStats | { error: string | undefined }>>()
  async function safeStamp(file: string): Promise<string | null> {
   if(evidencePathReason(file))return null
   let cursor=repoRoot;const stamps: string[]=[]
   for(const part of file.split('/')) {
    cursor=path.join(cursor,part)
    if(!statCache.has(cursor))statCache.set(cursor,lstat(cursor,{bigint:true}).catch((error: NodeJS.ErrnoException)=>({error:error.code})))
    const stat=(await statCache.get(cursor))!
    // A failed lstat always carries an errno code; the fallback keeps the stamp total.
    if('error' in stat)return stat.error??'unavailable'
    if(stat.isSymbolicLink())return 'symlink'
    stamps.push((['dev','ino','mode','size','mtimeNs','ctimeNs'] as const).map(key=>String(stat[key])).join(':'))
   }
   return stamps.join('/')
  }
  const stamps: Array<[string, string | null]>=mode==='worktree'?await Promise.all(paths.slice(0,LIMITS.maxFiles).map(async file=>[file,await safeStamp(file)] as [string, string | null])):[]
  const files=paths.slice(0,LIMITS.maxFiles).map(file=>{
   const entry=after.get(file),old=before.get(file);const reason=evidencePathReason(file)|| (entry?.unmerged?'unmerged index':entry?.mode==='160000'||old?.mode==='160000'?'submodule':entry?.mode==='120000'||old?.mode==='120000'?'symbolic link':null)
   return {path:file,changed:changed.has(file),status:changed.has(file)?!old?'added':mode==='worktree'&&stamps.find(([p])=>p===file)?.[1]==='ENOENT'||!entry&&!untracked.includes(file)?'deleted':'modified':'unchanged',selectable:!reason,reason}
  })
  // Include the index and path set so stale UI cannot change revision semantics.
  const core={cwd,repoRoot,gitDir,commonDir,repositoryId,head,base:baseOid,baseRef:baseRef!,mode:reviewMode,indexHash:hash(index),policyRoot}
  const workspace: Workspace={...core,id:hash({...core,paths,stamps})}
  return {workspace,files,complete:!truncated,truncated,limits:LIMITS,before,after,signal,policy}
 }
 async function blob(inv: Inventory,entry: ManifestEntry | undefined,file: string,preview=false): Promise<FileEvidence> {
  if(!entry)return {path:file,kind:'missing',text:'',hash:hashText('')}
  if(!['100644','100755'].includes(entry.mode))return {path:file,kind:'symlink',reason:'symbolic link or unsupported Git object'}
  const limit=preview?Number.MAX_SAFE_INTEGER:LIMITS.maxFileBytes
  const size=Number((await required(inv.workspace.repoRoot,['cat-file','-s',entry.oid],inv.signal,100)).trim())
  if(!Number.isSafeInteger(size))return {path:file,kind:'oversized',reason:'file exceeds source size limit'}
  if(size>limit){
   if(!preview)return {path:file,kind:'oversized',reason:'file exceeds source size limit'}
   const captured=await git(inv.workspace.repoRoot,['cat-file','blob',entry.oid],inv.signal,limit)
   if(!captured.ok&&!captured.truncated)throw fail('CODE_GIT','Git evidence is unavailable or exceeds its size limit.')
   const prefix=captured.output.replace(/\uFFFD+$/u,'')
   if(/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(prefix)||prefix.includes('\uFFFD'))return {path:file,kind:'binary',reason:'binary or non-UTF-8 source'}
   if(containsCredentialLikeText(prefix))return {path:file,kind:'excluded',reason:'possible credential content excluded'}
   return {path:file,kind:'text',text:prefix,hash:hashText(prefix),truncated:true}
  }
  const text=await required(inv.workspace.repoRoot,['cat-file','blob',entry.oid],inv.signal,limit+1)
  if(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffd]/.test(text))return {path:file,kind:'binary',reason:'binary or non-UTF-8 source'}
  if(containsCredentialLikeText(text))return {path:file,kind:'excluded',reason:'possible credential content excluded'}
  return {path:file,kind:'text',text,hash:hashText(text)}
 }
 async function file(inv: Inventory,file: string,options?: {preview?: boolean}): Promise<FileEvidence> {
   const preview=options?.preview===true
  const meta=inv.files.find(item=>item.path===file)
  if(!meta||evidencePathReason(file)==='unsafe path')throw fail('CODE_PATH','The file is outside the enumerated repository scope.')
  if(!meta.selectable)return {path:file,kind:'excluded',status:meta.status,reason:meta.reason??undefined,truncated:false}
  // --no-index also checks tracked files, so ignored credentials remain excluded.
  const ignored=await git(inv.workspace.repoRoot,['check-ignore','--no-index','--',file],inv.signal,8192)
  if(ignored.code===0)return {path:file,kind:'excluded',status:meta.status,reason:'ignored file',truncated:false}
  if(ignored.code!==1)throw fail('CODE_GIT','Ignore rules could not be checked.')
  const before=await blob(inv,inv.before.get(file),file,preview)
  let after: FileEvidence=inv.workspace.mode==='worktree'?await readEvidenceFile(inv.workspace.repoRoot,file,preview?{maxBytes:Number.MAX_SAFE_INTEGER}:undefined):await blob(inv,inv.after.get(file),file,preview)
  if(after.kind==='missing')after={...after,text:'',hash:hashText('')}
  const version=inv.workspace.mode==='worktree'?'Worktree':inv.workspace.mode==='staged'?'Index':inv.workspace.head
  const withhold=(value: FileEvidence): FileEvidence=>({path:file,kind:value.kind==='opaque'?/size/.test(value.reason??'')?'oversized':/binary|UTF-8/.test(value.reason??'')?'binary':'excluded':value.kind,status:meta.status,reason:value.reason,truncated:false,version,baseVersion:inv.workspace.base})
  const bad=[before,after].find(value=>value.kind!=='text'&&value.kind!=='missing')
  if(bad&&(!preview||after.kind!=='text'&&after.kind!=='missing'))return withhold(bad)
  const diffArgs=['diff','--text','--no-color','--no-ext-diff','--no-textconv','--no-renames','--unified=3',...(inv.workspace.mode==='staged'?['--cached',inv.workspace.head]:inv.workspace.mode==='range'?[inv.workspace.base,inv.workspace.head]:[inv.workspace.head]),'--',file]
  let diff='',diffTruncated=false
  if(!preview)diff=await required(inv.workspace.repoRoot,diffArgs,inv.signal,LIMITS.maxFileBytes*3)
  else {const captured=await git(inv.workspace.repoRoot,diffArgs,inv.signal,Number.MAX_SAFE_INTEGER);if(captured.truncated){diffTruncated=true;diff=captured.output.replace(/\uFFFD+$/u,'')}else if(captured.ok)diff=captured.output;else diffTruncated=true}
  if(!inv.before.has(file)&&!inv.after.has(file)&&after.kind==='text') {
   const lines=(after.text??'').split('\n');if(lines.at(-1)==='')lines.pop()
   diff=`--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n${lines.map(line=>'+'+line).join('\n')}\n`
  }
  if(containsCredentialLikeText(diff))return {path:file,kind:'excluded',status:meta.status,reason:'possible credential content excluded',truncated:false}
  const hunks: Hunk[]=[];let hunk: Hunk | undefined
  for(const line of diff.split('\n')) {const m=/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);if(m){hunk={oldStart:+m[1],oldLines:+(m[2]??1),newStart:+m[3],newLines:+(m[4]??1),lines:[]};hunks.push(hunk)}else if(hunk&&/^[ +\\-]/.test(line))hunk.lines.push(line)}
  return {path:file,kind:after.kind,status:meta.status,afterKind:after.kind,beforeKind:before.kind==='text'||before.kind==='missing'?before.kind:'oversized',text:after.text??'',beforeText:before.kind==='text'?before.text??'':'',hash:after.hash,beforeHash:before.hash,version,baseVersion:inv.workspace.base,diff,hunks,truncated:before.truncated===true||after.truncated===true,diffTruncated}
 }
 async function capture(inv: Inventory,paths: string[]): Promise<CapturedSnapshot> {
  if(!inv.complete)throw fail('CODE_INCOMPLETE','The repository manifest exceeds the supported limit.')
  if(!Array.isArray(paths)||!paths.length||paths.length>LIMITS.maxSelectedFiles||new Set(paths).size!==paths.length||paths.some(p=>typeof p!=='string'))throw fail('CODE_SCOPE','Select 1–20 distinct files explicitly.')
  const files: FileEvidence[]=[];let bytes=0
  for(const p of [...paths].sort()){const result=await file(inv,p);if(result.kind!=='text'&&result.kind!=='missing')throw fail('CODE_EXCLUDED',`${p}: ${result.reason??result.kind}`);bytes+=Buffer.byteLength(result.text??'')+Buffer.byteLength(result.beforeText??'');if(bytes>LIMITS.maxReviewBytes)throw fail('CODE_BUDGET','Selected before/after source exceeds the 48 KB review budget. Select fewer or smaller files.');files.push(result)}
  const current=await inventory({cwd:inv.workspace.cwd,policy:inv.policy,mode:inv.workspace.mode,base:inv.workspace.baseRef,signal:inv.signal})
  if(current.workspace.id!==inv.workspace.id)throw fail('CODE_STALE','Workspace changed while capturing selected source. Refresh and retry.')
  const snapshotId=hash({workspace:inv.workspace,files:files.map(f=>({path:f.path,hash:f.hash,beforeHash:f.beforeHash}))})
  return {snapshotId,workspace:inv.workspace,files,bytes,paths:files.map(f=>f.path)}
 }
 return {inventory,file,capture}
}
