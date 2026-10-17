import { realpathSync } from 'node:fs'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createTaskStore, fail } from './src/store.js'
import { createAgentsController } from './src/controller.js'
import { createAgentsRoute } from './src/routes.js'
import { createCodexAdapter } from './src/adapters/codex.js'
import { createOpenCodeAdapter } from './src/adapters/opencode.js'

export const name = 'dsh-x-agents'
export const inject = ['tools', 'workingDirectory', 'subprocess', 'profileContext', 'systemPrompt']
const reads = new Set(['read','read_image','glob','grep','web_search','web_fetch','session_event_read','session_event_search','session_search','list_mcp_resources','read_mcp_resource','dsh_x_agents_inspect'])
export function apply(ctx, config = {}) {
  const store = createTaskStore(ctx.profileContext.dir)
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
          if (!policy || realpathSync(liveCwd) !== options.binding.cwd || policy.mode !== options.binding.policy.mode || realpathSync(policy.workspaceRoot) !== options.binding.policy.workspaceRoot) throw fail('AGENTS_BINDING', 'Host policy or working directory changed before process start.')
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

      return runtime === 'codex'
        ? createCodexAdapter({ spawn, config: { executable: process.env.DSH_X_AGENTS_CODEX_COMMAND ?? 'codex', ...config.codex } })
        : createOpenCodeAdapter({ fetch: globalThis.fetch, config: { endpoint: process.env.DSH_X_AGENTS_OPENCODE_URL, password: process.env.DSH_X_AGENTS_OPENCODE_PASSWORD, username: process.env.DSH_X_AGENTS_OPENCODE_USERNAME ?? 'opencode', ...config.opencode } })
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
  })
  const mutations = new Map(), pending = new Map()
  ctx.on('tools/execute', async (exec, next) => {
    const id = exec.agent?.session?.id
    if (!id || reads.has(exec.name)) return next()
    if (exec.name === 'dsh_x_agents_run') {
      if (mutations.get(id)?.size || pending.has(id)) throw fail('AGENTS_BUSY', 'Another operation is still writing in this session.')
      pending.set(id, exec.token)
      try { return await next() } finally { if (pending.get(id) === exec.token) pending.delete(id) }
    }
    if (pending.has(id) || controller.isRunning(id) || store.hasLock(id)) throw fail('AGENTS_BUSY', 'An external run owns this session.')
    const active = mutations.get(id) ?? new Set(); mutations.set(id, active); active.add(exec.token)
    try { return await next() } finally { active.delete(exec.token); if (!active.size) mutations.delete(id) }
  })
  ctx.effect(() => () => controller.dispose(), 'agents: runtime lifetime')
  ctx.effect(() => ctx.systemPrompt.section({ name, order: 8100, interpolate: false, text: 'Agents is an explicit native-runtime delegation workflow. When the user selects it, use dsh_x_agents_inspect to check setup and dsh_x_agents_run to send their task to the selected runtime. DSH coordinates while the external native agent executes. Continue an existing task only with its exact scope/taskId/revision and unchanged runtime/model. A completed native turn does not prove tests or task acceptance. Never bypass an active Plan workflow, native permission request, unavailable authentication, or uncertain cleanup. Do not send credentials as prompt text. Do not automatically start another runtime or change host permissions when one is blocked.' }), 'agents: instructions')
  const present = value => ({ kind: 'dsh-x-agents.result', version: 1, ...value })
  const output = { schema: { type: 'object', additionalProperties: true, properties: {} }, presentationMeta: (_args, value) => present(value), render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] }
  ctx.tools.register(defineTool({ name: 'dsh_x_agents_inspect', description: 'Read native runtime setup and current task. Does not authenticate, install software, or call a model.', parameters: {}, output, execute: (_args, exec) => controller.inspect(exec) }))
  ctx.tools.register(defineTool({ name: 'dsh_x_agents_run', description: 'Delegate one turn to Codex or OpenCode native agent. Requests official approval, preserves native session identity, streams actual events. Setup or policy gaps block execution.', parameters: {
    runtime: { type: 'string', required: true, enum: ['codex','opencode'] }, prompt: { type: 'string', required: true }, model: { type: 'string' }, taskId: { type: 'string' }, expectedRevision: { type: 'integer' }, scope: { type: 'string' },
  }, output, execute: (args, exec) => controller.run(args, exec) }))
  ctx.effect(() => ctx.tools.guard(exec => {
    const id = exec.agent?.session?.id
    if (id && (controller.isRunning(id) || store.hasLock(id) || pending.has(id) && pending.get(id) !== exec.token) && !reads.has(exec.name)) return 'An external agent run owns this session. Wait for it to stop; concurrent writes are blocked.'
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
