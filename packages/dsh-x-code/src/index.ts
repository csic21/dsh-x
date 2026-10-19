import type { Context } from '@deepseek-ai/cordis'
import type { ToolRunContext, ParameterSchemaSpec, InferArgs } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
import type { ReviewRecord } from './controller.ts'
import type { Spawn } from './git.ts'
import type { CodeRoute } from './routes.ts'
interface CodeHostServices {
  profileContext: { dir: string }
  subprocess: { spawn: Spawn }
  workingDirectory: { ensure(agent: unknown, signal: AbortSignal): Promise<string>, get(session: unknown): string }
  systemPrompt: { section(options: { name: string, order: number, interpolate: boolean, text: string }): () => void }
  connection: { fetch: { register(route: CodeRoute): () => void } }
}
import { runSnapshotReview } from './llm-review.ts'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createReviewStore, fail, sessionId } from './store.ts'
import { createCodeController } from './controller.ts'
import { createCodeRoute } from './routes.ts'
export const name='dsh-x-code'
export const inject=['tools','workingDirectory','subprocess','profileContext','systemPrompt']
export function apply(context: Context) {
 const ctx=context as Context & CodeHostServices
 const store=createReviewStore<ReviewRecord>(ctx.profileContext.dir)
 const sessionFor=(id: string)=>{const sessions=ctx.get('sessions');return sessions?.get(id as Parameters<NonNullable<typeof sessions>['get']>[0])}
 const selectedModel=(id: string,exec?: ToolRunContext)=>{const session=exec?.agent?.session??sessionFor(id);const route=session?.requestHeader?.()?.config??ctx.get('agentDefaultModel')?.currentSelection?.();return typeof route?.provider==='string'&&typeof route?.model==='string'&&route.provider.length<=256&&route.model.length<=256?{provider:route.provider,model:route.model}:null}
 const messagesOf=(id: string)=>{try{const session=sessionFor(id);return typeof session?.deriveMessages==='function'?session.deriveMessages():[]}catch{return []}}
 const controller=createCodeController({store,spawn:spec=>ctx.subprocess.spawn(spec),messagesOf,
  reviewerInfo:(id,exec)=>{const dshModel=selectedModel(id,exec);return {dshAvailable:Boolean(ctx.get('llm')&&dshModel),dshModel}},
  dshReview:async(args,exec)=>{
   const approval=ctx.get('approval');if(!approval)throw fail('CODE_APPROVAL','Official approval service is unavailable.')
   const result=await approval.request({agent:exec.agent!,callId:exec.callId,toolName:exec.name,signal:exec.signal,reason:`Code · ${args.route.provider}/${args.route.model}\nReview only these captured files / 仅审查以下快照文件：\n${args.snapshot.paths.join('\n')}\n${args.snapshot.bytes} UTF-8 bytes (before + after) · Snapshot ${args.snapshot.snapshotId}\nNo tools or session history. No test execution. This model call may incur provider charges.\n无工具、无会话历史，不执行测试。此模型调用可能产生提供方费用。`})
   if((result as unknown)!==true&&result!=='allowed-once')throw fail('CODE_APPROVAL','Snapshot review was not approved; no source was sent to the model.')
   exec.signal?.throwIfAborted();await args.beforeDispatch()
   const current=selectedModel(exec.agent!.session.id,exec);if(JSON.stringify(current)!==JSON.stringify(args.route))throw fail('CODE_MODEL','The current model changed during approval. Refresh and review again.')
   return runSnapshotReview(ctx.get('llm'),{...args,sessionId:exec.agent!.session.id},exec.signal)
  },
  contextOf:async(id,exec)=>{
   const session=exec?.agent?.session??sessionFor(sessionId(id))
   if(!session||session.id!==id)throw fail('CODE_SESSION','Open an existing conversation to select its workspace.')
   const cwd=exec?await ctx.workingDirectory.ensure(exec.agent,exec.signal):ctx.workingDirectory.get(session)
   return {cwd,policy:ctx.get('sandboxPolicy')?.resolve({session})}
  },
 })
 ctx.effect(()=>()=>controller.dispose(),'code: owned runtime lifetime')
 const output={schema:{type:'object',additionalProperties:true,properties:{}} as const,presentationMeta:(_args: unknown,value: Record<string, JsonValue>)=>({kind:'dsh-x-code.result',version:1,...value}),render:(_args: unknown,value: Record<string, JsonValue>): ContentBlock[]=>[{type:'text',text:JSON.stringify(value)}]}
 const modes={type:'string',enum:['worktree','staged','range']} as const, scope={type:'string',required:true} as const
 const register=<const S extends ParameterSchemaSpec>(name: string,description: string,parameters: S,execute: (args: InferArgs<S>, exec: ToolRunContext) => Promise<unknown>)=>ctx.tools.register(defineTool({name,description,parameters,output,execute: async (args, exec) => await execute(args,exec) as Record<string, JsonValue>}))
 register('dsh_x_code_inspect','Read the bounded local repository file manifest and durable Code review state. Does not send source to a model.',{mode:modes,base:{type:'string'}},(args,exec)=>controller.snapshot(args,exec))
 register('dsh_x_code_file','Read one allowlisted repository source or immutable review snapshot. No ignored, credential-like, symlink, binary or oversized content is returned.',{scope,workspaceId:{type:'string'},path:{type:'string',required:true},mode:modes,base:{type:'string'},reviewId:{type:'string'}},(args,exec)=>controller.source(args,exec))
 register('dsh_x_code_review','Review explicitly selected source snapshots with the current configured DSH model. Requests official approval and discloses provider costs. Re-review establishes new evidence; findings never imply executed tests.',{scope,workspaceId:{type:'string',required:true},mode:{...modes,required:true},base:{type:'string'},paths:{type:'array',items:{type:'string'},required:true},runtime:{type:'string',description:'Only dsh is accepted; native agent runtimes were retired.'},model:{type:'string',description:'Unsupported: review uses the current DSH model route.'},previousReviewId:{type:'string'}},(args,exec)=>controller.review(args,exec))
 ctx.effect(()=>ctx.systemPrompt.section({name,order:8200,interpolate:false,text:'Code is an explicit source-review workspace. Use dsh_x_code_inspect and dsh_x_code_file for bounded local browsing. Review only the files the user selected via dsh_x_code_review with the exact scope/workspaceId and the current DSH model. Never infer permission to send the entire repository. Preserve original findings; after changing source, re-review the same file scope with previousReviewId to establish new evidence. Source-only review cannot verify tests. Do not bypass stale source or secret exclusions. No native agent execution, repair action, PR or GitHub writes are supported.'}), 'code: instructions')
 ctx.inject(['connection'],hostContext=>{
  const host=hostContext as Context & CodeHostServices
  host.connection.fetch.register(createCodeRoute('code/snapshot',args=>controller.snapshot(args),['sessionId','mode','base']))
  host.connection.fetch.register(createCodeRoute('code/review',args=>controller.reviewDetail(args),['sessionId','scope','reviewId']))
  host.connection.fetch.register(createCodeRoute<{sessionId: string, scope: string, operationId: string}>('code/cancel',args=>controller.cancel(args),['sessionId','scope','operationId']))
  host.connection.fetch.register(createCodeRoute<{path: string}>('code/file',args=>controller.source({...args,preview:true}),['sessionId','scope','workspaceId','path','mode','base','reviewId']))
  host.connection.fetch.register(createCodeRoute('code/transcript',args=>controller.transcript(args),['sessionId']))
 })
}
