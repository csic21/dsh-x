import { realpathSync } from 'node:fs'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createTaskStore, fail } from './src/store.js'
import { createAgentsController, RUNTIMES } from './src/controller.js'
import { createAgentsRoute } from './src/routes.js'
import { createCodexAdapter } from './src/adapters/codex.js'
import { createOpenCodeAdapter } from './src/adapters/opencode.js'
import { createOwnedOpenCodeAdapter } from './src/adapters/opencode-owned.js'
import { bindNativeBrowser, isBrowserChild } from './src/browser-bridge.js'
import { createClaudeAdapter } from './src/adapters/claude.js'
import { createGrokAdapter } from './src/adapters/grok.js'

export const name = 'dsh-x-agents'
export const inject = ['tools', 'workingDirectory', 'subprocess', 'profileContext', 'systemPrompt']
const reads = new Set(['read','read_image','glob','grep','web_search','web_fetch','session_event_read','session_event_search','session_search','list_mcp_resources','read_mcp_resource','dsh_x_agents_inspect','dsh_x_code_inspect','dsh_x_code_file'])
const codeWrappers = new Set(['dsh_x_code_review', 'dsh_x_code_repair'])
export function apply(ctx, config = {}) {
  const store = createTaskStore(ctx.profileContext.dir)
  const browserTickets = new Map()
  const browserChild = exec => isBrowserChild(exec,browserTickets)
  const controller = createAgentsController({ store,
    cwdOf: exec => ctx.workingDirectory.ensure(exec.agent, exec.signal),
    policyOf: exec => ctx.get('sandboxPolicy')?.resolve({ session: exec.agent.session }),
    trustedExternalRuntime: config.trustedExternalRuntime === true,
    adapter: async (runtime, options) => {
      if (config.adapters?.[runtime]) return config.adapters[runtime](options)
      const spawn = async spec => {
        const signal = spec.signal ? AbortSignal.any([options.exec.signal, spec.signal].filter(Boolean)) : options.exec.signal
        signal?.throwIfAborted()
        const assertBinding = () => {
          const policy = ctx.get('sandboxPolicy')?.resolve({ session: options.exec.agent.session })
          const liveCwd = ctx.workingDirectory.get?.(options.exec.agent.session) ?? options.binding.cwd
          const hostPolicy = options.binding.hostPolicy ?? options.binding.policy
          if (!policy || realpathSync(liveCwd) !== options.binding.cwd || JSON.stringify({ ...policy, workspaceRoot: realpathSync(policy.workspaceRoot) }) !== JSON.stringify(hostPolicy)) throw fail('AGENTS_BINDING', 'Host policy or working directory changed before process start.')
          signal?.throwIfAborted()
        }
        assertBinding()
        if (options.binding.policy.mode === 'danger-full-access') return ctx.subprocess.spawn({ ...spec, signal })
        const sandbox = ctx.get('sandbox')
        if (!sandbox) throw fail('AGENTS_SANDBOX', 'The host cannot confine this native process. Execution is blocked; no settings were changed.')
        const confined = await sandbox.confine(spec.argv, options.binding.policy, signal)
        if (confined.enforcement !== 'full') throw fail('AGENTS_SANDBOX', 'The host file-effect sandbox reports partial enforcement.')
        assertBinding()
        return ctx.subprocess.spawn({ ...spec, argv: confined.argv, signal })
      }

      if (runtime === 'codex') return createCodexAdapter({ spawn, config: { executable: process.env.DSH_X_AGENTS_CODEX_COMMAND ?? 'codex', ...config.codex } })
      if (runtime === 'opencode' && config.opencode?.mode === 'owned-browser') return createOwnedOpenCodeAdapter({spawn,fetch:globalThis.fetch,config:config.opencode})
      if (runtime === 'opencode') return createOpenCodeAdapter({ fetch: globalThis.fetch, config: { endpoint: process.env.DSH_X_AGENTS_OPENCODE_URL, password: process.env.DSH_X_AGENTS_OPENCODE_PASSWORD, username: process.env.DSH_X_AGENTS_OPENCODE_USERNAME ?? 'opencode', ...config.opencode } })
      if (runtime === 'claude') return createClaudeAdapter({ spawn, config: { ...(process.env.DSH_X_AGENTS_CLAUDE_COMMAND ? { executable: process.env.DSH_X_AGENTS_CLAUDE_COMMAND } : {}), ...config.claude } })
      if (runtime === 'grok') return createGrokAdapter({ spawn, config: { executable: process.env.DSH_X_AGENTS_GROK_COMMAND ?? 'grok', ...config.grok } })
      throw fail('AGENTS_RUNTIME', 'Unknown native runtime.')
    },
    bindBrowser: async (exec, {runId, signal, assertCurrent}) => {
      const ownership=ctx.get('dshXBrowserOwnership')
      if (!ownership || !ctx.tools.get('dsh_x_browser_tabs') || !ctx.tools.get('dsh_x_browser_action')) throw fail('AGENTS_BROWSER','The Browser ownership service is unavailable.')
      return bindNativeBrowser({exec,runId,signal,assertCurrent,ownership,tickets:browserTickets,execute:args=>ctx.tools.execute(args)})
    },
    approve: async (exec, request, signal) => {
      const service = ctx.get('approval')
      if (!service) throw fail('AGENTS_APPROVAL', 'Native approval service is unavailable; execution is blocked.')
      return service.request({ agent: exec.agent, callId: exec.callId, toolName: exec.name, signal,
        reason: `Agents · ${request.title}\n${request.details}\n仅允许此项一次 / Allow this request once only.` })
    },
    askInput: async (exec, questions, signal) => {
      const service = ctx.get('userQuestions')
      if (!service) return null
      return service.ask({ agent: exec.agent, signal, wait: { callId: exec.callId }, questions })
    },
    beforeDispatch: async exec => {
      try { await ctx.parallel('dsh-x-agents/before-dispatch', exec) }
      catch (error) {
        // Cordis drains every observer and aggregates failures. Preserve a
        // single structured stale-snapshot rejection instead of an empty text.
        if (error instanceof AggregateError && error.errors.length === 1) throw error.errors[0]
        throw fail('AGENTS_PREFLIGHT', 'Native dispatch revalidation failed; no task prompt was sent.')
      }
    },
  })
  const mutations = new Map(), pending = new Map()
  // Only the exact live wrapper execution may delegate one native run. Tokens
  // are same-process Symbols minted by ToolRuntime, never tool arguments.
  const ownsChild = (exec, lease) => lease?.wrapper === true && lease.child === null
    && exec.name === 'dsh_x_agents_run' && exec.parent === lease.owner
    && exec.rootCallId === lease.rootCallId
    && (!lease.readOnly || exec.arguments?.readOnly === true)
  ctx.on('tools/execute', async (exec, next) => {
    const id = exec.agent?.session?.id
    if (browserChild(exec)) {const ticket=browserTickets.get(exec.callId);if(ticket.consumed)throw fail('AGENTS_REPLAY','Native browser invocation was already consumed.');ticket.consumed=true;return next()}
    if (!id || reads.has(exec.name)) return next()
    if (['dsh_x_agents_run','dsh_x_agents_models'].includes(exec.name) || codeWrappers.has(exec.name)) {
      const existing = pending.get(id)
      if (mutations.get(id)?.size || controller.isRunning(id) || store.hasLock(id)
        || existing && !ownsChild(exec, existing)) throw fail('AGENTS_BUSY', 'Another operation is still writing in this session.')
      if (existing) {
        // Consume synchronously before the next await, closing the gap between
        // concurrent guards. The parent retains the lease through finalization.
        existing.child = exec.token
        return await next()
      }
      const lease = { owner: exec.token, rootCallId: exec.rootCallId, wrapper: codeWrappers.has(exec.name), readOnly: exec.name === 'dsh_x_code_review', child: null }
      pending.set(id, lease)
      try { return await next() } finally { if (pending.get(id) === lease) pending.delete(id) }
    }
    if (pending.has(id) || controller.isRunning(id) || store.hasLock(id)) throw fail('AGENTS_BUSY', 'An external run owns this session.')
    const active = mutations.get(id) ?? new Set(); mutations.set(id, active); active.add(exec.token)
    try { return await next() } finally { active.delete(exec.token); if (!active.size) mutations.delete(id) }
  })
  ctx.effect(() => () => controller.dispose(), 'agents: runtime lifetime')
  ctx.effect(() => ctx.systemPrompt.section({ name, order: 8100, interpolate: false, text: 'Agents is an explicit native-runtime delegation workflow. When the user selects it, use dsh_x_agents_inspect to check setup, dsh_x_agents_models with runtime and current scope to explicitly prepare or refresh model catalogs without a task prompt, and dsh_x_agents_run to send their task to the selected runtime. DSH coordinates while the external native agent executes. Continue an existing task only with its exact scope/taskId/revision and unchanged runtime/model. A completed native turn does not prove tests or task acceptance. Never bypass an active Plan workflow, native permission request, unavailable authentication, or uncertain cleanup. Do not send credentials as prompt text. Do not automatically start another runtime or change host permissions when one is blocked.' }), 'agents: instructions')
  const present = value => ({ kind: 'dsh-x-agents.result', version: 1, ...value })
  const output = { schema: { type: 'object', additionalProperties: true, properties: {} }, presentationMeta: (_args, value) => present(value), render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] }
  ctx.tools.register(defineTool({ name: 'dsh_x_agents_inspect', description: 'Read native runtime setup and current task. Does not authenticate, install software, or call a model.', parameters: {}, output, execute: (_args, exec) => pending.has(exec.agent?.session?.id) ? controller.snapshot(exec.agent.session.id) : controller.inspect(exec) }))
  ctx.tools.register(defineTool({ name: 'dsh_x_agents_models', description: 'Explicitly initialize one native runtime to read its model catalog without a task prompt. Requires official approval; initialization can load native configuration. A listed model is not verified account access.', parameters: {runtime:{type:'string',required:true,enum:[...RUNTIMES]},scope:{type:'string',required:true}}, output, execute:(args,exec)=>controller.models(args,exec) }))
  ctx.tools.register(defineTool({ name: 'dsh_x_agents_run', description: 'Delegate one turn to Codex, OpenCode, Claude or Grok native agent. Requests official approval, preserves native session identity, streams actual events. Setup or policy gaps block execution.', parameters: {
    runtime: { type: 'string', required: true, enum: [...RUNTIMES] }, prompt: { type: 'string', required: true }, model: { type: 'string' }, taskId: { type: 'string' }, expectedRevision: { type: 'integer' }, scope: { type: 'string' },
    browser: { type: 'boolean', description: 'Explicitly enable the user-granted embedded Browser tools for this owned OpenCode run only. Other runtime modes are unsupported.' },
    readOnly: { type: 'boolean', description: 'Tighten this native turn to read-only confinement without changing host settings. Native permission escalations and external OpenCode are blocked.' },
  }, output, execute: (args, exec) => controller.run(args, exec) }))
  ctx.effect(() => ctx.tools.guard(exec => {
    const id = exec.agent?.session?.id
    const lease = pending.get(id)
    if (browserChild(exec)) return
    if (id && (controller.isRunning(id) || store.hasLock(id)
      || lease && lease.owner !== exec.token && !ownsChild(exec, lease)) && !reads.has(exec.name)) return 'An external agent run owns this session. Wait for it to stop; concurrent writes are blocked.'
  }), 'agents: session ownership')
  ctx.inject(['connection'], host => {
    host.connection.fetch.register(createAgentsRoute('agents/snapshot', payload => {
      if (Object.keys(payload).join(',') !== 'sessionId') throw fail('AGENTS_INPUT', 'Snapshot requires only sessionId.')
      return controller.snapshot(payload.sessionId)
    }))
    host.connection.fetch.register(createAgentsRoute('agents/cancel', payload => {
      if (!['expectedRevision,scope,sessionId,taskId', 'runId,scope,sessionId,taskId'].includes(Object.keys(payload).sort().join(','))) throw fail('AGENTS_INPUT', 'Cancellation requires an exact task and revision.')
      return controller.cancel(payload)
    }))
  })
}
