import { realpath, lstat, readdir } from 'node:fs/promises'
import type { BigIntStats } from 'node:fs'
import path from 'node:path'
import { createGit } from './git.ts'
import type { Spawn, GitPrepared } from './git.ts'
import { evidencePathReason, readEvidenceFile, readPreviewMedia, containsCredentialLikeText, hashText, MAX_EVIDENCE_FILE_BYTES } from './files.ts'
import type { EvidenceFile, MediaRead } from './files.ts'
import { MAX_PREVIEW_MEDIA_BYTES, mediaOf } from './formats.ts'
import type { MediaKind } from './formats.ts'
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
  /** Base64 media for a preview-only image, audio, or video. Never stored in a review snapshot. */
  data?: string
  beforeData?: string
  mediaType?: string
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
/** Run one async task per item with a bounded number of tasks in flight, keeping input order. */
async function mapLimit<T, U>(items: T[], limit: number, run: (item: T) => Promise<U>): Promise<U[]> {
  const results = new Array<U>(items.length)
  let next = 0
  const worker = async () => { while (next < items.length) { const index = next++; results[index] = await run(items[index]) } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
/** Read the per-component identity stamps that make one path's content version observable. */
async function pathStamps(repoRoot: string, paths: string[], signal: AbortSignal | undefined): Promise<Array<[string, string | null]>> {
  // Parent directories repeat across every path, so each component is inspected
  // once, and no more than 64 paths are walked at a time.
  const cache = new Map<string, Promise<BigIntStats | { error: string | undefined }>>()
  const inspect = async (file: string): Promise<string | null> => {
    if (evidencePathReason(file)) return null
    signal?.throwIfAborted()
    let cursor = repoRoot
    const stamps: string[] = []
    for (const part of file.split('/')) {
      cursor = path.join(cursor, part)
      if (!cache.has(cursor)) cache.set(cursor, lstat(cursor, { bigint: true }).catch((error: NodeJS.ErrnoException) => ({ error: error.code })))
      const stat = (await cache.get(cursor))!
      // A failed lstat always carries an errno code; the fallback keeps the stamp total.
      if ('error' in stat) return stat.error ?? 'unavailable'
      if (stat.isSymbolicLink()) return 'symlink'
      stamps.push((['dev','ino','mode','size','mtimeNs','ctimeNs'] as const).map(key => String(stat[key])).join(':'))
    }
    return stamps.join('/')
  }
  return mapLimit(paths, 64, async file => [file, await inspect(file)] as [string, string | null])
}
export function createRepository(spawn: Spawn) {
 const git=createGit(spawn)
 async function required(cwd: string,args: string[],signal: AbortSignal | undefined,max?: number): Promise<string>{const r=await git(cwd,args,signal,max);if(!r.ok)throw fail('CODE_GIT','Git evidence is unavailable or exceeds its size limit.');return r.output}
 async function inventory({cwd,policy,mode='worktree',base,signal}: InventoryOptions): Promise<Inventory> {
  const reviewMode=validMode(mode);mode=reviewMode;cwd=await realpath(cwd)
  if(!policy||!path.isAbsolute(policy.workspaceRoot??'')||!['read-only','workspace-write','danger-full-access'].includes(policy.mode))throw fail('CODE_POLICY','The host workspace policy is unavailable.')
  const policyRoot=await realpath(policy.workspaceRoot)
  // One Git start reports the work tree and both metadata directories.
  const roots=(await required(cwd,['rev-parse','--show-toplevel','--absolute-git-dir','--git-common-dir'],signal)).trimEnd().split('\n')
  if(roots.length!==3||roots.some(line=>!line))throw fail('CODE_GIT','Git evidence is unavailable or exceeds its size limit.')
  const repoRoot=await realpath(roots[0])
  if(!within(policyRoot,cwd)||!within(policyRoot,repoRoot))throw fail('CODE_BOUNDARY','The repository is outside the host workspace boundary. Select its root as the session workspace.')
  const gitDir=await realpath(roots[1])
  if(!within(policyRoot,gitDir))throw fail('CODE_BOUNDARY','Git metadata is outside the host workspace boundary. Select a workspace encompassing the repository metadata.')
  const commonDir=await realpath(path.resolve(cwd,roots[2]))
  if(!within(policyRoot,commonDir))throw fail('CODE_BOUNDARY','Shared Git metadata is outside the host workspace boundary.')
  for(const dir of new Set([gitDir,commonDir]))for(const name of ['config','config.worktree','index','HEAD','commondir']){const stat=await lstat(path.join(dir,name)).catch((error: NodeJS.ErrnoException)=>{if(error.code==='ENOENT')return null;throw error});if(stat?.isSymbolicLink())throw fail('CODE_BOUNDARY','Symbolic Git metadata is unsupported.')}
  const objects=path.join(commonDir,'objects'),alternate=await lstat(path.join(objects,'info','alternates')).catch((error: NodeJS.ErrnoException)=>{if(error.code==='ENOENT')return null;throw error})
  if(alternate&&(alternate.isSymbolicLink()||alternate.size>0))throw fail('CODE_BOUNDARY','Git alternate object stores are unsupported for scoped review.')
  let objectEntries=0;const queue=[objects]
  while(queue.length){signal?.throwIfAborted();const dir=queue.pop()!;if((await lstat(dir)).isSymbolicLink())throw fail('CODE_BOUNDARY','Symbolic Git object stores are unsupported.');for(const entry of await readdir(dir,{withFileTypes:true})){if(++objectEntries>20000)throw fail('CODE_INCOMPLETE','Git object metadata exceeds the inspection limit.');if(entry.isSymbolicLink())throw fail('CODE_BOUNDARY','Symbolic Git object stores are unsupported.');if(entry.isDirectory())queue.push(path.join(dir,entry.name))}}
  const [gitStat,commonStat]=await Promise.all([lstat(gitDir,{bigint:true}),lstat(commonDir,{bigint:true})]);const repositoryId=hash({repoRoot,gitDir,commonDir,dev:String(gitStat.dev),ino:String(gitStat.ino),commonDev:String(commonStat.dev),commonIno:String(commonStat.ino)})
  if(mode==='range'&&(typeof base!=='string'||!base||base.length>160||! /^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(base)||base.includes('..')))throw fail('CODE_BASE','Choose a branch, tag, or commit hash as the base.')
  // One safety-lookup round for the whole inspection; the manifest reads themselves
  // are independent of one another and therefore start together.
  const prepared: GitPrepared=await git.prepare(repoRoot,signal,{ignore:true,filters:true})
  const treeArgs=(ref: string)=>['ls-tree','-r','-z',ref]
  const diffManifest=(target: string[])=>['diff','--name-only','-z','--no-ext-diff','--no-textconv','--ignore-submodules=all','--no-renames',...target,'--']
  const headCapture=prepared.read({args:['rev-parse','--verify','HEAD']})
  const indexCapture=prepared.read({args:['ls-files','--stage','-z']})
  const untrackedCapture=mode==='worktree'?prepared.read({args:['ls-files','--others','--exclude-standard','-z']}):null
  // The base tree of worktree and staged review is HEAD itself, so Git can resolve it.
  const headTreeCapture=mode==='range'?null:prepared.read({args:treeArgs('HEAD')})
  const changedCapture=mode==='staged'?prepared.read({args:diffManifest(['--cached','HEAD'])}):mode==='worktree'?prepared.read({args:diffManifest(['HEAD'])}):null
  const baseCommitCapture=mode==='range'?prepared.read({args:['rev-parse','--verify',`${base}^{commit}`]}):null
  const settle=async(capture: Promise<{ok: boolean, output: string}> | null): Promise<string>=>{const r=await capture!;if(!r.ok)throw fail('CODE_GIT','Git evidence is unavailable or exceeds its size limit.');return r.output}
  const head=(await settle(headCapture)).trim()
  if(!OID.test(head))throw fail('CODE_HEAD','A committed Git HEAD is required.')
  const indexRaw=await settle(indexCapture)
  const untracked=mode==='worktree'?records(await settle(untrackedCapture)):[]
  const indexEntries=new Map<string, ManifestEntry>()
  for(const entry of records(indexRaw)) { const m=/^([0-7]{6}) ([a-f0-9]{40}(?:[a-f0-9]{24})?) ([0-3])\t([\s\S]+)$/.exec(entry);if(!m)throw fail('CODE_GIT','Unsupported index record.');indexEntries.set(m[4],{mode:m[1],oid:m[2],unmerged:m[3]!=='0'||indexEntries.get(m[4])?.unmerged}) }
  let baseOid=head
  if(mode==='range') {
   const resolved=(await settle(baseCommitCapture)).trim()
   if(!OID.test(resolved))throw fail('CODE_BASE','The base did not resolve to a commit.')
   baseOid=(await required(repoRoot,['merge-base',resolved,head],signal)).trim()
   if(!OID.test(baseOid))throw fail('CODE_BASE','The base has no supported merge base.')
  }
  const parseTree=(raw: string): Map<string, ManifestEntry>=>{const result=new Map<string, ManifestEntry>();for(const entry of records(raw)) {const m=/^([0-7]{6}) (blob|commit) ([a-f0-9]{40}(?:[a-f0-9]{24})?)\t([\s\S]+)$/.exec(entry);if(!m)throw fail('CODE_GIT','Unsupported tree record.');result.set(m[4],{mode:m[1],oid:m[3],kind:m[2]})}return result}
  const before=parseTree(await settle(headTreeCapture??prepared.read({args:treeArgs(baseOid)})))
  const after: Map<string, ManifestEntry>=mode==='range'?parseTree(await settle(prepared.read({args:treeArgs(head)}))):indexEntries
  const changedView=await settle(changedCapture??prepared.read({args:diffManifest([baseOid,head])}))
  const changed=new Set([...records(changedView),...untracked])
  const paths=[...new Set([...before.keys(),...after.keys(),...untracked])].sort()
  const truncated=paths.length>LIMITS.maxFiles
  const stamps: Array<[string, string | null]>=mode==='worktree'?await pathStamps(repoRoot,paths.slice(0,LIMITS.maxFiles),signal):[]
  const stampOf=new Map(stamps), untrackedSet=new Set(untracked)
  const files=paths.slice(0,LIMITS.maxFiles).map(file=>{
   const entry=after.get(file),old=before.get(file);const reason=evidencePathReason(file)|| (entry?.unmerged?'unmerged index':entry?.mode==='160000'||old?.mode==='160000'?'submodule':entry?.mode==='120000'||old?.mode==='120000'?'symbolic link':null)
   return {path:file,changed:changed.has(file),status:changed.has(file)?!old?'added':mode==='worktree'&&stampOf.get(file)==='ENOENT'||!entry&&!untrackedSet.has(file)?'deleted':'modified':'unchanged',selectable:!reason,reason}
  })
  // Include the index and path set so stale UI cannot change revision semantics.
  const core={cwd,repoRoot,gitDir,commonDir,repositoryId,head,base:baseOid,baseRef:(mode==='range'?base:'HEAD')!,mode:reviewMode,indexHash:hash(indexRaw),policyRoot}
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
 async function mediaBlob(inv: Inventory, entry: ManifestEntry | undefined, kind: MediaKind): Promise<MediaRead> {
  if(!entry)return {path:'',kind:'missing'}
  if(!['100644','100755'].includes(entry.mode))return {path:'',kind:'symlink',reason:'symbolic link or unsupported Git object'}
  const size=Number((await required(inv.workspace.repoRoot,['cat-file','-s',entry.oid],inv.signal,100)).trim())
  if(!Number.isSafeInteger(size)||size<0||size>MAX_PREVIEW_MEDIA_BYTES)return {path:'',kind:'oversized',reason:'file exceeds preview size limit'}
  const captured=await git(inv.workspace.repoRoot,['cat-file','blob',entry.oid],inv.signal,Math.max(size,1),true)
  if(!captured.ok||!captured.bytes||captured.bytes.length!==size)return {path:'',kind:'unavailable',reason:'file changed while collecting evidence'}
  return {path:'',kind,data:captured.bytes.toString('base64')}
 }
 async function previewMedia(inv: Inventory, file: string, kind: MediaKind, mime: string, meta: WorkspaceFile): Promise<FileEvidence> {
  const version=inv.workspace.mode==='worktree'?'Worktree':inv.workspace.mode==='staged'?'Index':inv.workspace.head
  const [afterRead,before]=await Promise.all([
   inv.workspace.mode==='worktree'?readPreviewMedia(inv.workspace.repoRoot,file):mediaBlob(inv,inv.after.get(file),kind),
   mediaBlob(inv,inv.before.get(file),kind),
  ])
  const after=afterRead
  const viewable=(side: MediaRead)=>side.kind===kind||side.kind==='missing'
  if(!viewable(after))return {path:file,kind:after.kind==='symlink'?'symlink':after.kind,status:meta.status,reason:after.reason,truncated:false,version,baseVersion:inv.workspace.base}
  const shown=after.kind===kind||before.kind===kind?kind:after.kind
  return {path:file,kind:shown,mediaType:mime,status:meta.status,data:after.data,beforeData:before.kind===kind?before.data:undefined,afterKind:after.kind,beforeKind:before.kind,text:'',beforeText:'',version,baseVersion:inv.workspace.base,diff:'',hunks:[],truncated:false,reason:shown===kind?undefined:after.reason}
 }
 async function file(inv: Inventory,file: string,options?: {preview?: boolean}): Promise<FileEvidence> {
  const preview=options?.preview===true
  const meta=inv.files.find(item=>item.path===file)
  if(!meta||evidencePathReason(file)==='unsafe path')throw fail('CODE_PATH','The file is outside the enumerated repository scope.')
  const media=mediaOf(file)
  const unmerged=Boolean(inv.after.get(file)?.unmerged||inv.before.get(file)?.unmerged)
  const mediaPreview=preview&&media!=null&&meta.reason==='not an allowlisted source-text file'&&!unmerged
  if(!meta.selectable&&!mediaPreview)return {path:file,kind:'excluded',status:meta.status,reason:meta.reason??undefined,truncated:false}
  const repoRoot=inv.workspace.repoRoot,worktree=inv.workspace.mode==='worktree'
  // --no-index also checks tracked files, so ignored credentials remain excluded.
  const checkIgnored=async()=>{const prepared=await git.prepare(repoRoot,inv.signal,{ignore:true,filters:true});return prepared.read({args:['check-ignore','--no-index','--',file],maxBytes:8192})}
  if(mediaPreview&&media){
   const ignored=await checkIgnored()
   if(ignored.code===0)return {path:file,kind:'excluded',status:meta.status,reason:'ignored file',truncated:false}
   if(ignored.code!==1)throw fail('CODE_GIT','Ignore rules could not be checked.')
   return previewMedia(inv,file,media.kind,media.mime,meta)
  }
  const diffArgs=['diff','--text','--no-color','--no-ext-diff','--no-textconv','--no-renames','--unified=3',...(inv.workspace.mode==='staged'?['--cached',inv.workspace.head]:inv.workspace.mode==='range'?[inv.workspace.base,inv.workspace.head]:[inv.workspace.head]),'--',file]
  const diffLimit=preview?Number.MAX_SAFE_INTEGER:LIMITS.maxFileBytes*3
  // Both source sides and the diff are independent; the ignore check needs the one
  // safety lookup this operation is about to perform anyway.
  const preparedPromise=git.prepare(repoRoot,inv.signal,{ignore:true,filters:true})
  const beforePromise=blob(inv,inv.before.get(file),file,preview)
  const afterPromise=worktree?readEvidenceFile(repoRoot,file,preview?{maxBytes:Number.MAX_SAFE_INTEGER}:undefined):blob(inv,inv.after.get(file),file,preview)
  const ignoredPromise=(async()=>{const prepared=await preparedPromise;return prepared.read({args:['check-ignore','--no-index','--',file],maxBytes:8192})})()
  const diffPromise=(async()=>{const prepared=await preparedPromise;return prepared.read({args:diffArgs,maxBytes:diffLimit})})()
  const [before,after,ignored,captured]=await Promise.all([beforePromise,afterPromise,ignoredPromise,diffPromise])
  if(ignored.code===0)return {path:file,kind:'excluded',status:meta.status,reason:'ignored file',truncated:false}
  if(ignored.code!==1)throw fail('CODE_GIT','Ignore rules could not be checked.')
  const version=inv.workspace.mode==='worktree'?'Worktree':inv.workspace.mode==='staged'?'Index':inv.workspace.head
  const withhold=(value: FileEvidence): FileEvidence=>({path:file,kind:value.kind==='opaque'?/size/.test(value.reason??'')?'oversized':/binary|UTF-8/.test(value.reason??'')?'binary':'excluded':value.kind,status:meta.status,reason:value.reason,truncated:false,version,baseVersion:inv.workspace.base})
  const bad=[before,after].find(value=>value.kind!=='text'&&value.kind!=='missing')
  if(bad&&(!preview||after.kind!=='text'&&after.kind!=='missing'))return withhold(bad)
  let diff='',diffTruncated=false
  if(!preview&&!captured.ok)throw fail('CODE_GIT','Git evidence is unavailable or exceeds its size limit.')
  if(preview&&(captured.truncated||!captured.ok)){diffTruncated=true;diff=captured.output.replace(/\uFFFD+$/u,'')}
  else diff=captured.output
  const afterFile: FileEvidence=after.kind==='missing'?{...after,text:'',hash:hashText('')}:after
  if(!inv.before.has(file)&&!inv.after.has(file)&&afterFile.kind==='text') {
   const lines=(afterFile.text??'').split('\n');if(lines.at(-1)==='')lines.pop()
   diff=`--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n${lines.map(line=>'+'+line).join('\n')}\n`
  }
  if(containsCredentialLikeText(diff))return {path:file,kind:'excluded',status:meta.status,reason:'possible credential content excluded',truncated:false}
  const hunks: Hunk[]=[];let hunk: Hunk | undefined
  for(const line of diff.split('\n')) {const m=/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);if(m){hunk={oldStart:+m[1],oldLines:+(m[2]??1),newStart:+m[3],newLines:+(m[4]??1),lines:[]};hunks.push(hunk)}else if(hunk&&/^[ +\\-]/.test(line))hunk.lines.push(line)}
  return {path:file,kind:afterFile.kind,status:meta.status,afterKind:afterFile.kind,beforeKind:before.kind==='text'||before.kind==='missing'?before.kind:'oversized',text:afterFile.text??'',beforeText:before.kind==='text'?before.text??'':'',hash:afterFile.hash,beforeHash:before.hash,version,baseVersion:inv.workspace.base,diff,hunks,truncated:before.truncated===true||afterFile.truncated===true,diffTruncated}
 }
 /**
  * Re-check the exact inputs one source read depends on: the commit and the index
  * it was enumerated from. The selected file verifies its own identity before and
  * after the read, so an unrelated worktree edit needs no second full manifest;
  * it arrives with the next inventory refresh instead.
  */
 async function revalidate(inv: Inventory): Promise<void> {
  const prepared=await git.prepare(inv.workspace.repoRoot,inv.signal)
  const [headCapture,indexCapture]=await prepared.parallel([{args:['rev-parse','--verify','HEAD']},{args:['ls-files','--stage','-z']}])
  if(!headCapture.ok||!indexCapture.ok)throw fail('CODE_GIT','Git evidence is unavailable or exceeds its size limit.')
  if(headCapture.output.trim()!==inv.workspace.head||hash(indexCapture.output)!==inv.workspace.indexHash)throw fail('CODE_STALE','Workspace changed while reading source. Refresh Code.')
 }
 async function capture(inv: Inventory,paths: string[]): Promise<CapturedSnapshot> {
  if(!inv.complete)throw fail('CODE_INCOMPLETE','The repository manifest exceeds the supported limit.')
  if(!Array.isArray(paths)||!paths.length||paths.length>LIMITS.maxSelectedFiles||new Set(paths).size!==paths.length||paths.some(p=>typeof p!=='string'))throw fail('CODE_SCOPE','Select 1–20 distinct files explicitly.')
  const sorted=[...paths].sort()
  // Selected files are independent reads; a small in-flight bound keeps process
  // pressure bounded without waiting for one file at a time.
  const captured=await mapLimit(sorted,4,async p=>[p,await file(inv,p)] as const)
  const files: FileEvidence[]=[];let bytes=0
  for(const [p,result] of captured){if(result.kind!=='text'&&result.kind!=='missing')throw fail('CODE_EXCLUDED',`${p}: ${result.reason??result.kind}`);bytes+=Buffer.byteLength(result.text??'')+Buffer.byteLength(result.beforeText??'');if(bytes>LIMITS.maxReviewBytes)throw fail('CODE_BUDGET','Selected before/after source exceeds the 48 KB review budget. Select fewer or smaller files.');files.push(result)}
  const current=await inventory({cwd:inv.workspace.cwd,policy:inv.policy,mode:inv.workspace.mode,base:inv.workspace.baseRef,signal:inv.signal})
  if(current.workspace.id!==inv.workspace.id)throw fail('CODE_STALE','Workspace changed while capturing selected source. Refresh and retry.')
  const snapshotId=hash({workspace:inv.workspace,files:files.map(f=>({path:f.path,hash:f.hash,beforeHash:f.beforeHash}))})
  return {snapshotId,workspace:inv.workspace,files,bytes,paths:files.map(f=>f.path)}
 }
 return {inventory,file,capture,revalidate}
}
