import { randomUUID } from 'node:crypto'
import { fail } from './store.js'

export function isBrowserChild(exec, tickets) {
  const ticket=tickets.get(exec.callId)
  return Boolean(ticket && ticket.parent===exec.parent && ticket.rootCallId===exec.rootCallId && ticket.session===exec.agent?.session && ticket.name===exec.name && !ticket.signal.aborted)
}

/** Authority is a real ToolRuntime parent Symbol, never a model argument. */
export function bindNativeBrowser({exec,runId,signal,assertCurrent,ownership,execute,tickets}) {
  const lifetime=new AbortController(),combined=AbortSignal.any([signal,lifetime.signal])
  const closeOwner=ownership.bind(exec.token,{runtime:'opencode',nativeRunId:runId,signal:combined})
  let closed=false,pending=false
  return {async invoke(name,args,requestSignal) {
    if(closed||pending||!['dsh_x_browser_tabs','dsh_x_browser_action'].includes(name))throw fail('AGENTS_BROWSER','This native browser call is unavailable or another call is pending.')
    pending=true
    const callSignal=requestSignal?AbortSignal.any([combined,requestSignal]):combined
    let callId
    try {
      await assertCurrent();callSignal.throwIfAborted()
      if(closed)throw fail('AGENTS_BROWSER','This native browser run has closed.')
      callId=randomUUID()
      const ticket={parent:exec.token,rootCallId:exec.rootCallId,session:exec.agent.session,name,signal:callSignal,consumed:false}
      tickets.set(callId,ticket)
      const result=await execute({name,arguments:args,agent:exec.agent,signal:callSignal,callId,rootCallId:exec.rootCallId,parent:exec.token})
      await assertCurrent();callSignal.throwIfAborted()
      if(result.isError)throw fail(result.error?.info?.code??'AGENTS_BROWSER',result.error?.message??result.error?.info?.message??'Browser action failed.')
      return result.value
    } finally {if(callId)tickets.delete(callId);pending=false}
  },close(){if(closed)return;closed=true;lifetime.abort(new Error('Native browser bridge closed'));closeOwner()}}
}
