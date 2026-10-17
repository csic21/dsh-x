import { randomUUID } from 'node:crypto'
import { fail, sessionId } from './store.js'
import { createRepository, LIMITS } from './repository.js'
import { reviewPrompt, parseReview, repairPrompt } from './review.js'
const active=new Set(['running','repairing'])
export function createCodeController({store,spawn,contextOf,delegate,agentsAvailable,reviewerInfo=()=>({dshAvailable:false,dshModel:null,nativeReviewAvailable:false}),dshReview,now=()=>new Date().toISOString()}) {
 const repository=createRepository(spawn),running=new Map(),host=randomUUID();let disposed=false
 const publicReview=review=>{if(!review)return null;const {snapshot,hostId,request,...value}=structuredClone(review);if(value.repair){if(value.repair.state==='running'&&(value.repair.hostId??hostId)!==host){value.repair.state='interrupted';value.repair.reason='Previous repair ended without a verified outcome. Re-review before another repair.'}delete value.repair.hostId}if(active.has(value.state)&&hostId!==host){value.state='interrupted';value.reason='Previous host execution ended without a verified result. No automatic replay.'}return value}
 const inventory=async(id,options={},exec)=>{const context=await contextOf(id,exec);return repository.inventory({...context,mode:options.mode??'worktree',base:options.base,signal:exec?.signal??options.signal})}
 async function freshness(id,review,exec,signal) {
  if(!review)return {stale:false,staleReason:null}
  try {const inv=await inventory(id,{mode:review.mode,base:review.baseRef,signal},exec);const current=await repository.capture(inv,review.paths);return current.snapshotId===review.snapshotId?{stale:false,staleReason:null}:{stale:true,staleReason:'Selected source, Git revision, index, or workspace changed after this review.'}}
  catch(error){if(exec?.signal?.aborted)throw exec.signal.reason;if(signal?.aborted)throw signal.reason;return {stale:true,staleReason:'The original workspace or selected source can no longer be verified.'}}
 }
 async function snapshot(args,exec) {
  const id=sessionId(args.sessionId??exec?.agent?.session?.id),inv=await inventory(id,args,exec),data=store.read(id)
  const bound=record=>['cwd','repoRoot','gitDir','repositoryId'].every(key=>inv.workspace[key]===record.snapshot.workspace[key])
  const latest=data.reviews.at(-1),saved=latest&&bound(latest)?latest:null,review=publicReview(saved)
  if(review){Object.assign(review,await freshness(id,saved,exec,args.signal));review.repairReady=review.state==='completed'&&!review.stale&&review.mode==='worktree'&&review.findings.length>0&&!['running','completed'].includes(review.repair?.state)}
  return {scope:store.scope,sessionId:id,revision:data.revision,workspace:inv.workspace,files:inv.files,limits:LIMITS,complete:inv.complete,truncated:inv.truncated,agentsAvailable:agentsAvailable(),...reviewerInfo(id,exec),operation:running.has(id)?Object.fromEntries(['id','kind','reviewId','state','startedAt'].map(key=>[key,running.get(id)[key]])):null,review,history:data.reviews.slice(0,-1).filter(bound).map(r=>({id:r.id,state:publicReview(r).state,createdAt:r.createdAt,snapshotId:r.snapshotId,summary:r.summary,runtime:r.runtime,findings:r.findings.length,previousReviewId:r.previousReviewId??null}))}
 }
 async function source(args,exec) {
  const id=sessionId(args.sessionId??exec?.agent?.session?.id)
  if(args.scope!==store.scope)throw fail('CODE_STALE','Profile scope changed. Refresh Code.')
  if(args.reviewId) {
   // A session/cwd change must not expose another workspace's historical source.
   const saved=store.read(id).reviews.find(r=>r.id===args.reviewId)
   if(!saved)throw fail('CODE_STALE','The selected review is unavailable.')
   const current=await inventory(id,{mode:'worktree',signal:args.signal},exec)
   if(['cwd','repoRoot','gitDir','repositoryId'].some(key=>current.workspace[key]!==saved.snapshot.workspace[key]))throw fail('CODE_BINDING','The session now belongs to another workspace.')
   const value=saved.snapshot.files.find(f=>f.path===args.path)
   if(!value)throw fail('CODE_PATH','The file was not included in this review.')
   return {...structuredClone(value),snapshotId:saved.snapshotId,immutable:true}
  }
  const inv=await inventory(id,args,exec)
  if(args.workspaceId!==inv.workspace.id)throw fail('CODE_STALE','Workspace revision changed. Refresh Code.')
  const file=await repository.file(inv,args.path)
  const after=await inventory(id,args,exec)
  if(after.workspace.id!==inv.workspace.id)throw fail('CODE_STALE','Workspace changed while reading source. Refresh Code.')
  return {...file,workspaceId:inv.workspace.id,immutable:false}
 }
 async function reviewDetail(args,exec) {
  const id=sessionId(args.sessionId??exec?.agent?.session?.id);scope(args)
  const data=store.read(id),saved=data.reviews.find(r=>r.id===args.reviewId)
  if(!saved)throw fail('CODE_STALE','The selected review is no longer retained.')
  const inv=await inventory(id,{mode:'worktree',signal:args.signal},exec)
  if(['cwd','repoRoot','gitDir','repositoryId'].some(key=>inv.workspace[key]!==saved.snapshot.workspace[key]))throw fail('CODE_BINDING','The selected review belongs to another repository or workspace.')
  const result={...publicReview(saved),...await freshness(id,saved,exec,args.signal),isLatest:data.reviews.at(-1)?.id===saved.id}
  result.repairReady=result.isLatest&&result.state==='completed'&&!result.stale&&result.mode==='worktree'&&result.findings.length>0&&!['running','completed'].includes(result.repair?.state)
  return result
 }
 function scope(args){if(args.scope!==store.scope)throw fail('CODE_STALE','Profile scope changed. Refresh Code.')}
 async function owned(id,exec,kind,options,fn){
  if(disposed)throw fail('CODE_UNAVAILABLE','Code was disabled.')
  if(running.has(id))throw fail('CODE_BUSY','A Code operation is already running.')
  const controller=new AbortController();let settle;const settlement=new Promise(resolve=>{settle=resolve})
  const operation={controller,settlement,id:randomUUID(),kind,reviewId:null,state:'preparing',startedAt:now(),options};running.set(id,operation)
  const signal=exec.signal?AbortSignal.any([exec.signal,controller.signal]):controller.signal
  try{return await fn({...exec,signal})}finally{if(running.get(id)===operation)running.delete(id);settle()}
 }
 function update(id,reviewId,patch){store.mutate(id,data=>{const review=data.reviews.find(r=>r.id===reviewId);if(!review)throw fail('CODE_STALE','Review no longer exists.');Object.assign(review,patch,{updatedAt:now()})})}
 async function review(args,exec) {
  const id=sessionId(exec.agent?.session?.id);scope(args)
  if(args.runtime!=='dsh'&&!agentsAvailable())throw fail('CODE_AGENTS','Enable the Agents plugin to run a native review. Source browsing remains available.')
  const reviewer=reviewerInfo(id,exec)
  if(args.runtime==='dsh'&&(!reviewer.dshAvailable||!dshReview))throw fail('CODE_MODEL','Select a configured current DSH model before reviewing.')
  if(args.runtime==='dsh'&&args.model!==undefined)throw fail('CODE_MODEL','Snapshot review uses the current DSH route; model overrides are unsupported.')
  if(args.runtime==='opencode')throw fail('CODE_READ_ONLY','OpenCode HTTP cannot enforce this read-only review. Choose a local native runtime.')
  return owned(id,exec,'review',{mode:args.mode,base:args.base},async exec=>{
   const inv=await inventory(id,args,exec)
   if(inv.workspace.id!==args.workspaceId)throw fail('CODE_STALE','Workspace revision changed. Refresh and select the scope again.')
   const captured=await repository.capture(inv,args.paths),prompt=reviewPrompt(captured)
   const prior=args.previousReviewId?store.read(id).reviews.find(r=>r.id===args.previousReviewId):null
   if(args.previousReviewId&&(!prior||prior.state!=='completed'||JSON.stringify(prior.paths)!==JSON.stringify(captured.paths)||['cwd','repoRoot','gitDir','repositoryId'].some(key=>prior.snapshot.workspace[key]!==captured.workspace[key])))throw fail('CODE_VERIFY','Re-review must keep the exact previous file scope.')
   const record={id:randomUUID(),hostId:host,state:'running',createdAt:now(),updatedAt:now(),runtime:args.runtime,model:args.runtime==='dsh'?reviewer.dshModel.model:args.model??null,provider:args.runtime==='dsh'?reviewer.dshModel.provider:null,snapshotId:captured.snapshotId,snapshot:captured,mode:inv.workspace.mode,base:inv.workspace.base,baseRef:inv.workspace.baseRef,head:inv.workspace.head,paths:captured.paths,findings:[],checks:[],summary:'',stale:false,staleReason:null,previousReviewId:prior?.id??null,repair:null}
   store.mutate(id,data=>{data.reviews.push(record)});Object.assign(running.get(id),{reviewId:record.id,state:'waiting_permission'})
   try {
    const beforeDispatch=async()=>{const current=await freshness(id,record,exec);if(current.stale)throw fail('CODE_STALE','Source changed while review approval was pending. Refresh and review again.');running.get(id).state='reviewing'}
    const native=args.runtime==='dsh'?{task:{state:'completed',summary:await dshReview({prompt,snapshot:captured,route:reviewer.dshModel,beforeDispatch,recordRequest:request=>update(id,record.id,{request})},exec)}}:await delegate({runtime:args.runtime,model:args.model,prompt,readOnly:true},exec,{beforeDispatch})
    if(native.task?.state!=='completed'){update(id,record.id,{state:native.task?.state??'failed',reason:native.task?.reason??'Native review did not complete.',nativeTask:{id:native.task?.id,runId:native.task?.runId,scope:native.scope}});return snapshot({sessionId:id,mode:args.mode,base:args.base},exec)}
    running.get(id).state='verifying'
    const parsed=parseReview(native.task.summary,captured),fresh=await freshness(id,record,exec);exec.signal?.throwIfAborted()
    update(id,record.id,{...parsed,...fresh,state:'completed',nativeTask:args.runtime==='dsh'?null:{id:native.task.id,runId:native.task.runId,scope:native.scope},verification:prior?{previousReviewId:prior.id,result:fresh.stale?'stale':parsed.findings.length?'findings_remaining':'no_findings_in_scope',testsVerified:false}:null})
   }catch(error){update(id,record.id,{state:exec.signal?.aborted?'cancelled':['CODE_APPROVAL','CODE_STALE'].includes(error.code)?'blocked':'failed',reason:String(error.message??'Review failed.').slice(0,2000)});throw error}
   return snapshot({sessionId:id,mode:args.mode,base:args.base},exec)
  })
 }
 async function repair(args,exec) {
  const id=sessionId(exec.agent?.session?.id);scope(args)
  if(!agentsAvailable())throw fail('CODE_AGENTS','Enable the Agents plugin to repair findings.')
  return owned(id,exec,'repair',{},async exec=>{
   const saved=store.read(id).reviews.find(r=>r.id===args.reviewId)
   if(!saved||store.read(id).reviews.at(-1)?.id!==saved.id||saved.state!=='completed')throw fail('CODE_STALE','Select the latest completed review.')
   if(saved.mode!=='worktree')throw fail('CODE_REPAIR_MODE','Review the current worktree before repairing staged or committed findings.')
   const fresh=await freshness(id,saved,exec)
   if(fresh.stale)throw fail('CODE_STALE','Source changed since this review. Re-review before requesting repairs.')
   if(!Array.isArray(args.findingIds)||!args.findingIds.length||new Set(args.findingIds).size!==args.findingIds.length||args.findingIds.some(id=>!saved.findings.some(f=>f.id===id)))throw fail('CODE_FINDINGS','Select existing findings from this exact review.')
   if(saved.repair?.state==='completed')throw fail('CODE_VERIFY','This review already has a repair attempt. Re-review before another repair.')
   const prompt=repairPrompt(saved,args.findingIds);Object.assign(running.get(id),{reviewId:saved.id,state:'waiting_permission',options:{mode:saved.mode,base:saved.baseRef}})
   update(id,saved.id,{repair:{state:'running',hostId:host,findingIds:args.findingIds,runtime:args.runtime,model:args.model??null,startedAt:now(),verification:'required'}})
   try {
    const native=await delegate({runtime:args.runtime,model:args.model,prompt},exec,{beforeDispatch:async()=>{const current=await freshness(id,saved,exec);if(current.stale)throw fail('CODE_STALE','Source changed while repair approval was pending. Re-review before repairing.');running.get(id).state='repairing'}})
    running.get(id).state='verifying';const freshAfter=await freshness(id,saved,exec);exec.signal?.throwIfAborted()
    update(id,saved.id,{...freshAfter,repair:{state:native.task?.state??'failed',findingIds:args.findingIds,runtime:args.runtime,model:args.model??null,startedAt:now(),finishedAt:now(),nativeTask:{id:native.task?.id,runId:native.task?.runId,scope:native.scope},summary:native.task?.summary??'',verification:'required'}})
   }catch(error){update(id,saved.id,{repair:{state:exec.signal?.aborted?'cancelled':'failed',findingIds:args.findingIds,reason:String(error.message).slice(0,2000),verification:'required'}});throw error}
   return snapshot({sessionId:id,mode:saved.mode,base:saved.baseRef},exec)
  })
 }
 async function cancel(args){const id=sessionId(args.sessionId);scope(args);const operation=running.get(id);if(!operation||operation.id!==args.operationId)throw fail('CODE_STALE','This Code operation is no longer active.');operation.state='cancelling';operation.controller.abort(fail('CODE_CANCELLED','Cancelled by the user.'));return snapshot({sessionId:id,...operation.options})}
 return {snapshot,source,reviewDetail,review,repair,cancel,async dispose(){disposed=true;const operations=[...running.values()];for(const operation of operations)operation.controller.abort(new Error('Code plugin disabled.'));await Promise.all(operations.map(operation=>operation.settlement))}}
}
