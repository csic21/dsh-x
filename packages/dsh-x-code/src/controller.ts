import { randomUUID } from 'node:crypto'
import { fail, sessionId } from './store.ts'
import type { ReviewStore } from './store.ts'
import { createRepository, LIMITS } from './repository.ts'
import type { CapturedSnapshot, FileEvidence, HostPolicy, Inventory, ReviewMode } from './repository.ts'
import type { Spawn } from './git.ts'
import { reviewPrompt, parseReview } from './review.ts'
import { projectTranscript } from './transcript.ts'
import type { Finding, ReviewCheck } from './review.ts'
import type { ModelRoute, ReviewRequestRecord } from './llm-review.ts'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
/** The verification stamp recorded with a completed review. */
export interface VerificationView { previousReviewId: string, result: string, testsVerified: boolean }
/** One durable review record. */
export interface ReviewRecord {
  id: string
  hostId: string
  state: string
  createdAt: string
  updatedAt: string
  runtime: string
  model: string | null
  provider: string | null
  snapshotId: string
  snapshot: CapturedSnapshot
  mode: ReviewMode
  base: string
  baseRef: string
  head: string
  paths: string[]
  findings: Finding[]
  checks: ReviewCheck[]
  summary: string
  stale: boolean
  staleReason: string | null
  previousReviewId: string | null
  reason?: string
  verification?: VerificationView | null
  request?: ReviewRequestRecord | null
}
/** One review as exposed to the client; internal host fields are removed. */
export interface PublicReview {
  id: string
  state: string
  createdAt: string
  updatedAt: string
  runtime: string
  model: string | null
  provider: string | null
  snapshotId: string
  mode: ReviewMode
  base: string
  baseRef: string
  head: string
  paths: string[]
  findings: Finding[]
  checks: ReviewCheck[]
  summary: string
  stale: boolean
  staleReason: string | null
  previousReviewId: string | null
  reason?: string
  verification?: VerificationView | null
}
/** One review detail answer with its current freshness stamp. */
export type ReviewDetailView = PublicReview & { isLatest: boolean }
/** One recorded review summary in the history list. */
export interface HistoryView { id: string, state: string, createdAt: string, snapshotId: string, summary: string, runtime: string, findings: number, previousReviewId: string | null }
/** One active operation exposed to the client. */
export interface OperationView { id: string, kind: string, reviewId: string | null, state: string, startedAt: string }
/** Reviewer availability and identity for the current session. */
export interface ReviewerInfo { dshAvailable: boolean, dshModel: ModelRoute | null }
/** One bounded repository snapshot plus the current review state. */
export interface SnapshotView {
  scope: string
  sessionId: string
  revision: number
  workspace: Inventory['workspace']
  files: Inventory['files']
  limits: typeof LIMITS
  complete: boolean
  truncated: boolean
  dshAvailable: boolean
  dshModel: ModelRoute | null
  operation: OperationView | null
  review: PublicReview | null
  history: HistoryView[]
}
/** One source answer: the file view plus its binding and immutability. */
export type SourceView = FileEvidence & { immutable: boolean, workspaceId?: string, snapshotId?: string }
/** Optional scope overrides for one inventory read. */
export interface InventoryArgs { mode?: string, base?: string, signal?: AbortSignal | undefined }
/** One inspect/snapshot request from the tool or the client RPC. */
export interface SnapshotArgs extends InventoryArgs { sessionId?: string }
/** One source read request. */
export interface SourceArgs extends SnapshotArgs { scope?: string, workspaceId?: string, path: string, reviewId?: string, preview?: boolean }
/** One review detail request. */
export interface ReviewDetailArgs extends SnapshotArgs { scope?: string, reviewId?: string }
/** One review request. Runtime and model remain accepted only for explicit refusal. */
export interface ReviewArgs extends InventoryArgs { sessionId?: string, scope?: string, workspaceId?: string, runtime?: string, model?: string, paths: string[], previousReviewId?: string }
/** One cancellation request. */
export interface CancelArgs { sessionId?: string, scope?: string, operationId?: string }
/** Arguments the controller hands to the official model call. */
export interface DshReviewArgs {
  prompt: string
  snapshot: CapturedSnapshot
  route: ModelRoute
  beforeDispatch: () => Promise<void>
  recordRequest: (request: ReviewRequestRecord) => void
}
/** The host services a Code controller runs on. */
export interface CodeControllerDeps {
  store: ReviewStore<ReviewRecord>
  spawn: Spawn
  contextOf: (id: string, exec?: ToolRunContext) => Promise<{ cwd: string, policy: HostPolicy | undefined }>
  reviewerInfo?: (id: string, exec?: ToolRunContext) => ReviewerInfo
  dshReview?: (args: DshReviewArgs, exec: ToolRunContext) => Promise<string>
  messagesOf?: (id: string) => unknown
  now?: () => string
}
/** The in-process state of one owned Code operation. */
interface Operation { controller: AbortController, settlement: Promise<void>, id: string, kind: string, reviewId: string | null, state: string, startedAt: string, options: InventoryArgs }
// A thrown value is untrusted; read a code or message only through these guards.
const codeOf=(error: unknown): unknown=>(error as {code?: unknown} | null | undefined)?.code
const messageOf=(error: unknown): unknown=>(error as {message?: unknown} | null | undefined)?.message
const active=new Set(['running'])
export function createCodeController({store,spawn,contextOf,reviewerInfo=()=>({dshAvailable:false,dshModel:null}),dshReview,messagesOf=()=>[],now=()=>new Date().toISOString()}: CodeControllerDeps) {
 const repository=createRepository(spawn),running=new Map<string, Operation>(),host=randomUUID();let disposed=false
 const publicReview=(review: ReviewRecord | null | undefined): PublicReview | null =>{if(!review)return null;const cloned=structuredClone(review) as ReviewRecord & {repair?: unknown,nativeTask?: unknown};const {snapshot,hostId,request,repair:_repair,nativeTask:_nativeTask,...value}=cloned;if(active.has(value.state)&&hostId!==host){value.state='interrupted';value.reason='Previous host execution ended without a verified result. No automatic replay.'}if(value.state==='repairing'){value.state='interrupted';value.reason='Native repair was retired. Review the current source again.'}return value}
 const inventory=async(id: string,options: InventoryArgs={},exec?: ToolRunContext): Promise<Inventory>=>{const context=await contextOf(id,exec);return repository.inventory({...context,mode:options.mode??'worktree',base:options.base,signal:exec?.signal??options.signal})}
 async function freshness(id: string,review: ReviewRecord | null | undefined,exec: ToolRunContext | undefined,signal?: AbortSignal): Promise<{stale: boolean, staleReason: string | null}> {
  if(!review)return {stale:false,staleReason:null}
  try {const inv=await inventory(id,{mode:review.mode,base:review.baseRef,signal},exec);const current=await repository.capture(inv,review.paths);return current.snapshotId===review.snapshotId?{stale:false,staleReason:null}:{stale:true,staleReason:'Selected source, Git revision, index, or workspace changed after this review.'}}
  catch(error){if(exec?.signal?.aborted)throw exec.signal.reason;if(signal?.aborted)throw signal.reason;return {stale:true,staleReason:'The original workspace or selected source can no longer be verified.'}}
 }
 async function snapshot(args: SnapshotArgs,exec?: ToolRunContext): Promise<SnapshotView> {
  const id=sessionId(args.sessionId??exec?.agent?.session?.id),inv=await inventory(id,args,exec),data=store.read(id)
  const bound=(record: ReviewRecord)=>(['cwd','repoRoot','gitDir','repositoryId'] as const).every(key=>inv.workspace[key]===record.snapshot.workspace[key])
  const latest=data.reviews.at(-1),saved=latest&&bound(latest)?latest:null,review=publicReview(saved)
  if(review)Object.assign(review,await freshness(id,saved,exec,args.signal))
  const operation=running.get(id)
  return {scope:store.scope,sessionId:id,revision:data.revision,workspace:inv.workspace,files:inv.files,limits:LIMITS,complete:inv.complete,truncated:inv.truncated,...reviewerInfo(id,exec),operation:operation?{id:operation.id,kind:operation.kind,reviewId:operation.reviewId,state:operation.state,startedAt:operation.startedAt}:null,review,history:data.reviews.slice(0,-1).filter(bound).map(r=>({id:r.id,state:publicReview(r)!.state,createdAt:r.createdAt,snapshotId:r.snapshotId,summary:r.summary,runtime:r.runtime,findings:r.findings.length,previousReviewId:r.previousReviewId??null}))}
 }
 async function source(args: SourceArgs,exec?: ToolRunContext): Promise<SourceView> {
  const id=sessionId(args.sessionId??exec?.agent?.session?.id)
  if(args.scope!==store.scope)throw fail('CODE_STALE','Profile scope changed. Refresh Code.')
  if(args.reviewId) {
   // A session/cwd change must not expose another workspace's historical source.
   const saved=store.read(id).reviews.find(r=>r.id===args.reviewId)
   if(!saved)throw fail('CODE_STALE','The selected review is unavailable.')
   const current=await inventory(id,{mode:'worktree',signal:args.signal},exec)
   if((['cwd','repoRoot','gitDir','repositoryId'] as const).some(key=>current.workspace[key]!==saved.snapshot.workspace[key]))throw fail('CODE_BINDING','The session now belongs to another workspace.')
   const value=saved.snapshot.files.find(f=>f.path===args.path)
   if(!value)throw fail('CODE_PATH','The file was not included in this review.')
   return {...structuredClone(value),snapshotId:saved.snapshotId,immutable:true}
  }
  const inv=await inventory(id,args,exec)
  if(args.workspaceId!==inv.workspace.id)throw fail('CODE_STALE','Workspace revision changed. Refresh Code.')
  const file=await repository.file(inv,args.path,{preview:args.preview===true&&!exec})
  const after=await inventory(id,args,exec)
  if(after.workspace.id!==inv.workspace.id)throw fail('CODE_STALE','Workspace changed while reading source. Refresh Code.')
  return {...file,workspaceId:inv.workspace.id,immutable:false}
 }
 async function reviewDetail(args: ReviewDetailArgs,exec?: ToolRunContext): Promise<ReviewDetailView> {
  const id=sessionId(args.sessionId??exec?.agent?.session?.id);scope(args)
  const data=store.read(id),saved=data.reviews.find(r=>r.id===args.reviewId)
  if(!saved)throw fail('CODE_STALE','The selected review is no longer retained.')
  const inv=await inventory(id,{mode:'worktree',signal:args.signal},exec)
  if((['cwd','repoRoot','gitDir','repositoryId'] as const).some(key=>inv.workspace[key]!==saved.snapshot.workspace[key]))throw fail('CODE_BINDING','The selected review belongs to another repository or workspace.')
  return {...publicReview(saved)!,...await freshness(id,saved,exec,args.signal),isLatest:data.reviews.at(-1)?.id===saved.id}
 }
 function scope(args: {scope?: string}): void {if(args.scope!==store.scope)throw fail('CODE_STALE','Profile scope changed. Refresh Code.')}
 async function owned<T>(id: string,exec: ToolRunContext,kind: string,options: InventoryArgs,fn: (exec: ToolRunContext) => Promise<T>): Promise<T>{
  if(disposed)throw fail('CODE_UNAVAILABLE','Code was disabled.')
  if(running.has(id))throw fail('CODE_BUSY','A Code operation is already running.')
  const controller=new AbortController();let settle!: () => void;const settlement=new Promise<void>(resolve=>{settle=resolve})
  const operation: Operation={controller,settlement,id:randomUUID(),kind,reviewId:null,state:'preparing',startedAt:now(),options};running.set(id,operation)
  const signal=exec.signal?AbortSignal.any([exec.signal,controller.signal]):controller.signal
  try{return await fn({...exec,signal})}finally{if(running.get(id)===operation)running.delete(id);settle()}
 }
 function update(id: string,reviewId: string | undefined,patch: Partial<ReviewRecord>): void{store.mutate(id,data=>{const review=data.reviews.find(r=>r.id===reviewId);if(!review)throw fail('CODE_STALE','Review no longer exists.');Object.assign(review,patch,{updatedAt:now()})})}
 async function review(args: ReviewArgs,exec: ToolRunContext): Promise<SnapshotView> {
  const id=sessionId(exec.agent?.session?.id);scope(args)
  if(args.runtime!==undefined&&args.runtime!=='dsh')throw fail('CODE_RUNTIME','Code review uses the current DSH model only. Native agent review and repair were retired.')
  const reviewer=reviewerInfo(id,exec)
  if(!reviewer.dshAvailable||!dshReview)throw fail('CODE_MODEL','Select a configured current DSH model before reviewing.')
  if(args.model!==undefined)throw fail('CODE_MODEL','Snapshot review uses the current DSH route; model overrides are unsupported.')
  return owned(id,exec,'review',{mode:args.mode,base:args.base},async exec=>{
   const inv=await inventory(id,args,exec)
   if(inv.workspace.id!==args.workspaceId)throw fail('CODE_STALE','Workspace revision changed. Refresh and select the scope again.')
   const captured=await repository.capture(inv,args.paths),prompt=reviewPrompt(captured)
   const prior=args.previousReviewId?store.read(id).reviews.find(r=>r.id===args.previousReviewId):null
   if(args.previousReviewId&&(!prior||prior.state!=='completed'||JSON.stringify(prior.paths)!==JSON.stringify(captured.paths)||(['cwd','repoRoot','gitDir','repositoryId'] as const).some(key=>prior.snapshot.workspace[key]!==captured.workspace[key])))throw fail('CODE_VERIFY','Re-review must keep the exact previous file scope.')
   const record: ReviewRecord={id:randomUUID(),hostId:host,state:'running',createdAt:now(),updatedAt:now(),runtime:'dsh',model:reviewer.dshModel!.model,provider:reviewer.dshModel!.provider,snapshotId:captured.snapshotId,snapshot:captured,mode:inv.workspace.mode,base:inv.workspace.base,baseRef:inv.workspace.baseRef,head:inv.workspace.head,paths:captured.paths,findings:[],checks:[],summary:'',stale:false,staleReason:null,previousReviewId:prior?.id??null}
   store.mutate(id,data=>{data.reviews.push(record)});Object.assign(running.get(id)!,{reviewId:record.id,state:'waiting_permission'})
   try {
    const beforeDispatch=async()=>{const current=await freshness(id,record,exec);if(current.stale)throw fail('CODE_STALE','Source changed while review approval was pending. Refresh and review again.');running.get(id)!.state='reviewing'}
    const summary=await dshReview!({prompt,snapshot:captured,route:reviewer.dshModel!,beforeDispatch,recordRequest:request=>update(id,record.id,{request})},exec)
    running.get(id)!.state='verifying'
    const parsed=parseReview(summary,captured),fresh=await freshness(id,record,exec);exec.signal?.throwIfAborted()
    update(id,record.id,{...parsed,...fresh,state:'completed',verification:prior?{previousReviewId:prior.id,result:fresh.stale?'stale':parsed.findings.length?'findings_remaining':'no_findings_in_scope',testsVerified:false}:null})
   }catch(error){const code=codeOf(error);update(id,record.id,{state:exec.signal?.aborted?'cancelled':typeof code==='string'&&['CODE_APPROVAL','CODE_STALE'].includes(code)?'blocked':'failed',reason:String(messageOf(error)??'Review failed.').slice(0,2000)});throw error}
   return snapshot({sessionId:id,mode:args.mode,base:args.base},exec)
  })
 }
 async function cancel(args: CancelArgs): Promise<SnapshotView>{const id=sessionId(args.sessionId);scope(args);const operation=running.get(id);if(!operation||operation.id!==args.operationId)throw fail('CODE_STALE','This Code operation is no longer active.');operation.state='cancelling';operation.controller.abort(fail('CODE_CANCELLED','Cancelled by the user.'));return snapshot({sessionId:id,...operation.options})}
 function transcript(args: { sessionId?: string, signal?: AbortSignal }) {
  const id = sessionId(args.sessionId)
  return { messages: projectTranscript(messagesOf(id)) }
 }
 return {snapshot,source,reviewDetail,review,cancel,transcript,async dispose(){disposed=true;const operations=[...running.values()];for(const operation of operations)operation.controller.abort(new Error('Code plugin disabled.'));await Promise.all(operations.map(operation=>operation.settlement))}}
}
