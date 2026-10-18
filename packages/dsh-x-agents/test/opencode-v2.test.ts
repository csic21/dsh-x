import assert from 'node:assert/strict'
import test from 'node:test'
import { createOpenCodeV2Adapter } from '../src/adapters/opencode-v2.ts'

const password = 'synthetic-fixture-password-only'
const cwd = '/fixture/work'
const defaults: any = { cwd, prompt: 'Inspect the fixture', sandboxPolicy: { mode: 'danger-full-access', workspaceRoot: cwd }, trustedExternalRuntime: true }
const json = (value: any, status = 200, headers: any = {}) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', ...headers } })
const tick = () => new Promise<any>(resolve => setImmediate(resolve))

function fixture(options: any = {}) {
  const calls: any[] = []
  const events: any[] = []
  let controller: any, streamClosed = false
  const state: any = { outcome: undefined }
  const send = (event: any) => { if (!streamClosed) controller?.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)) }
  const session = (id = 'ses_v2') => ({ id, location: { directory: options.cwd || cwd }, ...(state.outcome ? { outcome: state.outcome } : {}) })
  const fetch = async (raw: any, request: any) => {
    const url = new URL(raw), path = url.pathname, body = request.body ? JSON.parse(request.body) : undefined
    calls.push({ path, method: request.method, body, query: url.searchParams })
    if (!request.headers.Authorization && !options.noAuth) return json({ _tag: 'UnauthorizedError', message: 'Authentication required' }, 401, { 'www-authenticate': 'Basic realm="opencode"' })
    if (options.rejectAuth && request.headers.Authorization) return json({}, 401, { 'www-authenticate': 'Basic realm="opencode"' })
    if (path === '/api/info') return json({ version: options.version || '2.0.32', pid: 1, urls: ['http://127.0.0.1:4096'] })
    if (path === '/api/model') return json({ data: options.noModels ? [] : [{ id: 'deepseek-flash', modelID: 'deepseek-flash', providerID: 'deepseek', name: 'DeepSeek Flash' }] })
    if (path === '/api/session' && request.method === 'POST') return json({ data: session() })
    if (path === '/api/event') {
      streamClosed = false
      const stream = new ReadableStream({
        start(c) {
          controller = c
          send({ type: 'server.connected', data: {} })
          request.signal.addEventListener('abort', () => { if (!streamClosed) { streamClosed = true; try { c.error(new Error('fixture stream aborted')) } catch {} } }, { once: true })
        },
        cancel() { streamClosed = true },
      })
      return new Response(stream, { headers: { 'content-type': 'text/event-stream' } })
    }
    const match = path.match(/^\/api\/session\/([^/]+)(.*)$/)
    if (match) {
      const [, sessionID, tail] = match
      if (!tail) return json({ data: session(sessionID) })
      if (tail === '/permission') return json({ data: options.pendingPermissions || [] })
      if (tail === '/prompt' && request.method === 'POST') {
        assert.equal(url.searchParams.get('directory'), options.cwd || cwd)
        state.outcome = 'succeeded'
        await options.onPrompt?.({ sessionID, send, state })
        return json({ data: { id: 'msg_user', sessionID } })
      }
      if (tail === '/interrupt') {
        state.outcome = 'interrupted'
        send({ type: 'session.execution.interrupted', data: { sessionID } })
        return json({ interrupted: true })
      }
      const reply = tail.match(/^\/permission\/([^/]+)\/reply$/)
      if (reply) {
        calls.push({ path, method: request.method, body, decision: body?.decision })
        send({ type: 'permission.replied', data: { sessionID, requestID: reply[1], decision: body?.decision } })
        return new Response(null, { status: 204 })
      }
    }
    assert.fail(`Unexpected fixture route ${request.method} ${path}`)
  }
  const adapter = createOpenCodeV2Adapter({ fetch, config: { endpoint: 'http://127.0.0.1:4096', password, requestTimeoutMs: 3000, cleanupTimeoutMs: 1000, statusPollMs: 1, ...options.config } })
  return {
    adapter, calls, events, send, state,
    run(extra: any = {}) { return adapter.run({ ...defaults, onEvent: (event: any) => { events.push(event) }, ...extra }) },
    closeStream() { if (!streamClosed) { streamClosed = true; controller.close() } },
  }
}

test('v2 discovery reports version, models and enforces basic auth', async () => {
  const { adapter } = fixture()
  const found: any = await adapter.discover({ cwd, sandboxPolicy: defaults.sandboxPolicy, trustedExternalRuntime: true })
  assert.equal(found.available, true)
  assert.equal(found.authenticated, true)
  assert.equal(found.version, '2.0.32')
  assert.deepEqual(found.models.map((item: any) => item.id), ['deepseek/deepseek-flash'])
})

test('v2 discovery fails closed without an authentication challenge', async () => {
  const { adapter } = fixture({ noAuth: true })
  const found: any = await adapter.discover({ cwd })
  assert.equal(found.available, false)
  assert.equal(found.authenticated, false)
  assert.match(found.reason, /server-password challenge/)
})

test('v2 discovery rejects a 1.x server instead of guessing', async () => {
  const { adapter } = fixture({ version: '1.19.3' })
  const found: any = await adapter.discover({ cwd })
  assert.equal(found.available, false)
  assert.match(found.reason, /requires the 2\.x protocol/)
})

test('v2 run creates a session in the workspace and streams text, usage and completion', async () => {
  const { run, calls, events } = fixture({
    async onPrompt({ sessionID, send }: any) {
      send({ type: 'session.execution.started', data: { sessionID } })
      send({ type: 'session.text.started', data: { sessionID, assistantMessageID: 'msg_a', ordinal: 0 } })
      send({ type: 'session.text.delta', data: { sessionID, assistantMessageID: 'msg_a', ordinal: 0, delta: 'Hello' } })
      send({ type: 'session.text.ended', data: { sessionID, assistantMessageID: 'msg_a', ordinal: 0, text: 'Hello there' } })
      send({ type: 'session.step.ended', data: { sessionID, assistantMessageID: 'msg_a', finish: 'stop', cost: 0.01, tokens: { input: 5, output: 2 } } })
      send({ type: 'session.reasoning.delta', data: { sessionID, assistantMessageID: 'msg_a', ordinal: 0, delta: 'hidden chain' } })
      send({ type: 'session.execution.succeeded', data: { sessionID } })
    },
  })
  const result: any = await run()
  assert.equal(result.status, 'completed')
  assert.equal(result.summary, 'Hello there')
  const created = calls.find((call: any) => call.path === '/api/session' && call.method === 'POST')
  assert.deepEqual(created.body.location, { directory: cwd })
  const prompt = calls.find((call: any) => call.path === '/api/session/ses_v2/prompt')
  assert.equal(prompt.body.text, 'Inspect the fixture')
  const assistant = events.filter((event: any) => event.type === 'assistant')
  assert.equal(assistant.at(-1).text, 'Hello there')
  assert.equal(assistant.some((event: any) => /hidden chain/.test(event.text)), false)
  assert.equal(events.some((event: any) => event.type === 'usage'), true)
})

test('v2 permission.asked maps to a one-time decision and replies once', async () => {
  const { run, calls, events } = fixture({
    async onPrompt({ sessionID, send }: any) {
      send({ type: 'session.execution.started', data: { sessionID } })
      send({ type: 'permission.asked', data: { sessionID, id: 'perm_1', action: 'shell', resources: ['ls'], save: [], metadata: { command: 'ls' } } })
      send({ type: 'session.text.ended', data: { sessionID, assistantMessageID: 'msg_a', ordinal: 0, text: 'done' } })
      send({ type: 'session.execution.succeeded', data: { sessionID } })
    },
  })
  const asked: any[] = []
  const result: any = await run({ requestPermission: async (request: any) => { asked.push(request); return { optionId: 'once' } } })
  assert.equal(result.status, 'completed')
  assert.equal(asked.length, 1)
  assert.equal(asked[0].kind, 'permission')
  assert.deepEqual(asked[0].options.map((option: any) => option.id), ['once', 'reject'])
  const reply = calls.find((call: any) => /\/permission\/perm_1\/reply$/.test(call.path))
  assert.deepEqual(reply.body, { decision: 'once' })
  assert.equal(events.some((event: any) => event.type === 'permission'), true)
})

test('v2 permission rejection is forwarded as a reject decision', async () => {
  const { run, calls } = fixture({
    async onPrompt({ sessionID, send }: any) {
      send({ type: 'session.execution.started', data: { sessionID } })
      send({ type: 'permission.asked', data: { sessionID, id: 'perm_2', action: 'edit', resources: ['a.ts'], save: [] } })
      send({ type: 'session.execution.succeeded', data: { sessionID } })
    },
  })
  const result: any = await run({ requestPermission: async () => ({ optionId: 'reject' }) })
  assert.equal(result.status, 'completed')
  const reply = calls.find((call: any) => /\/permission\/perm_2\/reply$/.test(call.path))
  assert.deepEqual(reply.body, { decision: 'reject' })
})

test('v2 native form requests block the turn instead of guessing', async () => {
  const { run } = fixture({
    async onPrompt({ sessionID, send }: any) {
      send({ type: 'session.execution.started', data: { sessionID } })
      send({ type: 'session.form.create', data: { sessionID, id: 'form_1' } })
    },
  })
  const result: any = await run()
  assert.equal(result.status, 'blocked')
  assert.match(result.reason, /structured input/)
})

test('v2 cancellation interrupts the native session and reports cancelled', async () => {
  const controller = new AbortController()
  const { run, calls } = fixture({
    async onPrompt({ sessionID, send }: any) {
      send({ type: 'session.execution.started', data: { sessionID } })
      send({ type: 'session.text.delta', data: { sessionID, assistantMessageID: 'msg_a', ordinal: 0, delta: 'working' } })
      setTimeout(() => controller.abort(), 20)
    },
  })
  const result: any = await run({ signal: controller.signal })
  assert.equal(result.status, 'cancelled')
  assert.equal(calls.some((call: any) => /\/interrupt$/.test(call.path)), true)
})

test('v2 run is blocked without explicit external trust', async () => {
  const { run, calls } = fixture({})
  const result: any = await run({ sandboxPolicy: { mode: 'workspace-write', workspaceRoot: cwd }, trustedExternalRuntime: false })
  assert.equal(result.status, 'blocked')
  assert.match(result.reason, /explicit trust/)
  assert.equal(calls.length, 0)
})

test('v2 run blocks a session that already has a pending decision', async () => {
  const { run } = fixture({ pendingPermissions: [{ id: 'perm_pending', sessionID: 'ses_v2', action: 'shell', resources: ['ls'] }] })
  const result: any = await run()
  assert.equal(result.status, 'blocked')
  assert.match(result.reason, /pending decision/)
})
