# Internal adapter contract v1

Adapters export factories returning {id,transport,capabilities,discover,run}.
Factory accepts {spawn,fetch,config}. No global secrets or automatic installation.
`discover({cwd,signal})` returns {available,version,authenticated,models:[{id,label}],reason,capabilities}; unknown auth must not be represented as authenticated.
`run({prompt,model,cwd,nativeSessionId,signal,onEvent,requestPermission,requestInput})` returns {nativeSessionId,status:'completed'|'cancelled'|'blocked'|'failed',summary,reason?,usage?}. Events via awaited onEvent({type,text?,data?}); allowed types: session,assistant,tool,plan,permission,input,usage,status,diagnostic. session event data {nativeSessionId}. Never fabricate vendor output.
`requestPermission({id,kind,title,details,options:[{id,label,kind:'allow_once'|'allow_always'|'reject_once'|'reject_always'}]})` resolves {optionId:string|null}; callback must map exact request and never infer broad grant from once. Unknown request/missing callback fail closed.
`requestInput({id,title,questions})` resolves {answers}|null; cancellation null. Backend may intentionally reject unsupported input, but emit visible blocked reason.
Run must own process/request cancellation, await quiescence, and surface cleanup uncertainty as thrown error.code='AGENTS_CLEANUP_UNCONFIRMED'. Native session creation/resume identity emitted immediately for durable checkpoint. No automatic resume/start retry. Do not expose raw environment/auth tokens in event text.
Factories may be async. Tests should inject spawn/fetch and use protocol fixtures; production auth/model calls not authorized without user setup. Shared driver names: createCodexAdapter, createOpenCodeAdapter. Parent owns orchestration/store and validates states.
