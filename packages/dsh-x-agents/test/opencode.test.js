import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createOpenCodeAdapter } from '../src/adapters/opencode.js'
import { consumeSse, loopbackEndpoint } from '../src/adapters/opencode-http.js'
import { createAgentsController } from '../src/controller.js'
import { createTaskStore } from '../src/store.js'

const password = 'synthetic-fixture-password-only'
const cwd = '/fixture/work'
const defaults = { cwd, prompt: 'Inspect the fixture', sandboxPolicy: { mode: 'danger-full-access', workspaceRoot: cwd }, trustedExternalRuntime: true }
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', ...headers } })
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const tick = () => new Promise(resolve => setImmediate(resolve))
async function until(fn) { for (let i = 0; i < 100; i++) { if (fn()) return; await tick() } assert.fail('fixture condition was not reached') }

function schema() {
  const paths = {}
  for (const [path, method] of [
    ['/session', 'post'], ['/session/{sessionID}', 'get'], ['/session/status', 'get'],
    ['/session/{sessionID}/message', 'post'], ['/session/{sessionID}/message/{messageID}', 'get'],
    ['/session/{sessionID}/abort', 'post'], ['/session/{sessionID}/children', 'get'], ['/event', 'get'],
    ['/permission', 'get'], ['/question', 'get'], ['/question/{requestID}/reply', 'post'], ['/question/{requestID}/reject', 'post'],
  ]) paths[path] = { ...(paths[path] || {}), [method]: {} }
  paths['/permission/{requestID}/reply'] = { post: { requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { reply: { enum: ['once', 'always', 'reject'] } } } } } } } }
  return { openapi: '3.1.0', paths }
}

function fixture(options = {}) {
  const workdir = options.cwd || cwd
  const calls = [], events = [], permissions = [], questions = [], sessions = new Map([['ses_existing', { id: 'ses_existing', directory: workdir }]])
  let controller, userMessageID, streamClosed = false
  const state = { statuses: {}, userMessageID: undefined }
  const send = event => {
    if (!streamClosed) controller?.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\r\n\r\n`))
  }
  const assistant = (sessionID = 'ses_new') => ({ id: 'msg_assistant', sessionID, parentID: userMessageID, role: 'assistant', time: { created: 1, completed: 2 }, tokens: { input: 10, output: 3, reasoning: 0, cache: { read: 0, write: 0 } }, cost: 0.01 })
  const result = (sessionID = 'ses_new', text = 'Fixture finished.') => ({ info: assistant(sessionID), parts: [{ id: 'prt_text', messageID: 'msg_assistant', sessionID, type: 'text', text }] })
  const fetch = async (raw, request) => {
    const url = new URL(raw), path = url.pathname, body = request.body ? JSON.parse(request.body) : undefined
    calls.push({ path, method: request.method, body, headers: request.headers, query: url.searchParams, redirect: request.redirect })
    assert.equal(request.redirect, 'error')
    if (!request.headers.Authorization && !options.noAuth) return json({}, 401, { 'www-authenticate': 'Basic realm="OpenCode"' })
    if (options.rejectAuth && request.headers.Authorization) return json({}, 401, { 'www-authenticate': 'Basic realm="OpenCode"' })
    if (path === '/global/health') return options.redirect ? new Response('', { status: 302, headers: { location: 'http://outside.invalid' } }) : json({ healthy: true, version: '1.19.3' })
    if (path === '/doc') return json(options.schema || schema())
    if (path === '/provider') return json({ all: [
      { id: 'fixture', name: 'Fixture', models: { native: { name: 'Native model', apiKey: password } }, options: { apiKey: password } },
      { id: 'disconnected', name: 'Unavailable', models: { other: { name: 'Other model' } } },
    ], connected: options.noModels ? [] : ['fixture'], default: { fixture: 'native' } })
    if (path === '/session/status') return json(state.statuses)
    if (path === '/session' && request.method === 'POST') {
      const session = { id: 'ses_new', directory: options.directory ?? workdir }
      sessions.set(session.id, session)
      return json(session)
    }
    if (path === '/permission') return json(permissions)
    if (path === '/question') return json(questions)
    if (path === '/event') {
      streamClosed = false
      const stream = new ReadableStream({
        start(c) {
          controller = c
          send({ type: 'server.connected', properties: {} })
          request.signal.addEventListener('abort', () => { if (!streamClosed) { streamClosed = true; try { c.error(new Error('fixture stream aborted')) } catch {} } }, { once: true })
        },
        cancel() { streamClosed = true },
      })
      return new Response(stream, { headers: { 'content-type': 'text/event-stream' } })
    }
    const sessionMatch = path.match(/^\/session\/([^/]+)(.*)$/)
    if (sessionMatch) {
      const [, sessionID, tail] = sessionMatch
      if (!tail) return json(sessions.get(sessionID) || { id: sessionID, directory: workdir })
      if (tail === '/children') return json(options.children?.[sessionID] || [])
      if (tail.startsWith('/message/')) return json({ info: assistant(sessionID), parts: [] })
      if (tail === '/abort') {
        if (!options.keepBusy) {
          state.statuses = {}
          for (const list of [permissions, questions]) for (let i = list.length - 1; i >= 0; i--) if (list[i].sessionID === sessionID) list.splice(i, 1)
        }
        return json(options.abortResult ?? true)
      }
      if (tail === '/message' && request.method === 'POST') {
        assert.equal(url.searchParams.get('directory'), workdir)
        userMessageID = body.messageID
        state.userMessageID = userMessageID
        state.statuses = { [sessionID]: { type: 'busy' } }
        const value = options.onPrompt ? await options.onPrompt({ sessionID, send, assistant, result, permissions, questions, state }) : result(sessionID)
        if (!options.keepBusy) state.statuses = {}
        return json(value)
      }
    }
    const reply = path.match(/^\/(permission|question)\/([^/]+)\/(reply|reject)$/)
    if (reply) {
      const [, kind, id, action] = reply
      const list = kind === 'permission' ? permissions : questions
      const index = list.findIndex(item => item.id === id)
      const request = list[index]
      if (index !== -1) list.splice(index, 1)
      send({ type: `${kind}.${action === 'reject' ? 'rejected' : 'replied'}`, properties: { sessionID: request?.sessionID || 'ses_new', requestID: id, ...body } })
      return json(true)
    }
    assert.fail(`Unexpected fixture route ${request.method} ${path}`)
  }
  const adapter = createOpenCodeAdapter({ fetch, config: { endpoint: 'http://127.0.0.1:4096', password, sandboxPolicy: defaults.sandboxPolicy, trustedExternalRuntime: true, requestTimeoutMs: 5000, cleanupTimeoutMs: 1000, statusPollMs: 1, ...options.config } })
  return { adapter, fetch, calls, events, state, send, permissions, questions, assistant, result, sessions,
    closeStream() { if (!streamClosed) { streamClosed = true; controller.close() } },
    run(extra = {}) { return adapter.run({ ...defaults, cwd: workdir, onEvent: event => { events.push(event) }, ...extra }) },
  }
}

test('unconfigured discovery does not execute a binary or send any request', async () => {
  let called = false
  const adapter = createOpenCodeAdapter({ fetch: () => { called = true } })
  const result = await adapter.discover({ cwd })
  assert.equal(result.available, false)
  assert.match(result.reason, /Configure an existing/)
  assert.equal(called, false)
})

test('endpoint is explicit numeric HTTP loopback with no credential or redirect surface', () => {
  for (const endpoint of ['https://127.0.0.1:4096', 'http://example.com', 'http://localhost:4096', 'http://127.0.0.1/x', 'http://127.0.0.1/?x=1', 'http://127.0.0.1/#x', 'http://user:pass@127.0.0.1', 'http://2130706433:4096', 'http://0x7f000001:4096', 'file:///tmp/server']) assert.throws(() => loopbackEndpoint(endpoint))
  assert.equal(loopbackEndpoint('http://127.0.0.1:4096/'), 'http://127.0.0.1:4096')
  assert.equal(loopbackEndpoint('http://[::1]:4096'), 'http://[::1]:4096')
})

test('discovery verifies Basic auth enforcement, health, runtime schema and connected models without inference', async () => {
  const f = fixture()
  const result = await f.adapter.discover({ cwd })
  assert.equal(result.available, true)
  assert.equal(result.authenticated, true)
  assert.equal(result.providerAuthentication, 'unverified')
  assert.equal(result.version, '1.19.3')
  assert.deepEqual(result.models.map(model => model.id), ['fixture/native'])
  assert.equal(f.calls.every(call => call.method === 'GET'), true)
  assert.deepEqual(f.calls.map(call => call.path), ['/global/health', '/global/health', '/doc', '/provider'])
  assert.equal(f.calls[0].headers.Authorization, undefined)
  assert.match(f.calls[1].headers.Authorization, /^Basic /)
  assert.equal(JSON.stringify(result).includes(password), false)
})

test('missing password, unenforced auth, rejected auth, and redirects all block discovery', async () => {
  for (const options of [{ config: { password: '' } }, { noAuth: true }, { rejectAuth: true }, { redirect: true }]) {
    const f = fixture(options)
    const result = await f.adapter.discover({ cwd })
    assert.equal(result.available, false)
    assert.equal(f.calls.some(call => call.path === '/session'), false)
  }
})

test('missing reply schema is reported as unsupported rather than guessed', async () => {
  const spec = schema()
  delete spec.paths['/permission/{requestID}/reply']
  const result = await fixture({ schema: spec }).adapter.discover({ cwd })
  assert.equal(result.available, true)
  assert.equal(result.capabilities.permissions, false)
  assert.equal(result.capabilities.input, true)
})

test('external runtime requires full-access host and explicit trust before even discovery', async () => {
  const f = fixture()
  for (const extra of [{ trustedExternalRuntime: false }, { sandboxPolicy: { mode: 'workspace-write' } }, { sandboxPolicy: undefined }]) {
    assert.equal((await f.run(extra)).status, 'blocked')
  }
  assert.equal(f.calls.length, 0)
})

test('restricted or untrusted discovery only reads global health/schema and never initializes a project', async () => {
  for (const options of [{ trustedExternalRuntime: false }, { sandboxPolicy: { mode: 'workspace-write' } }]) {
    const f = fixture()
    const result = await f.adapter.discover({ cwd, ...options })
    assert.equal(result.available, false)
    assert.match(result.reason, /initialize/)
    assert.deepEqual(f.calls.map(call => call.path), ['/global/health', '/global/health', '/doc'])
    assert.equal(f.calls.every(call => !call.query.has('directory')), true)
  }
})

test('new native session is checkpointed before its first prompt; result is native and persistent', async () => {
  const f = fixture({ onPrompt({ sessionID, result }) {
    assert.equal(f.events[0].type, 'session')
    assert.equal(f.events[0].data.nativeSessionId, sessionID)
    return result(sessionID)
  } })
  const result = await f.run({ model: 'fixture/native' })
  assert.equal(result.status, 'completed')
  assert.equal(result.nativeSessionId, 'ses_new')
  assert.equal(result.summary, 'Fixture finished.')
  assert.equal(result.usage.tokens.output, 3)
  const prompt = f.calls.find(call => call.path.endsWith('/message') && call.method === 'POST')
  assert.match(prompt.body.messageID, /^msg_[a-f0-9]{12}[a-zA-Z0-9]{14}$/)
  assert.deepEqual(prompt.body.model, { providerID: 'fixture', modelID: 'native' })
  assert.equal(f.calls.some(call => call.path.includes('prompt_async')), false)
})

test('resume sends a new turn to the same native session and does not create or replay', async () => {
  const f = fixture()
  const result = await f.run({ nativeSessionId: 'ses_existing' })
  assert.equal(result.status, 'completed')
  assert.equal(result.nativeSessionId, 'ses_existing')
  assert.equal(f.calls.filter(call => call.path === '/session').length, 0)
  assert.equal(f.calls.filter(call => call.path === '/session/ses_existing/message' && call.method === 'POST').length, 1)
})

test('a busy native session is blocked without prompting or aborting existing work', async () => {
  const f = fixture()
  f.state.statuses = { ses_existing: { type: 'busy' } }
  const result = await f.run({ nativeSessionId: 'ses_existing' })
  assert.equal(result.status, 'blocked')
  assert.equal(f.calls.some(call => call.path.endsWith('/abort') || (call.path.endsWith('/message') && call.method === 'POST')), false)
})

test('working directory mismatch fails closed, preserving the new native ID', async () => {
  const f = fixture({ directory: '/other/project' })
  const result = await f.run()
  assert.equal(result.status, 'blocked')
  assert.equal(result.nativeSessionId, 'ses_new')
  assert.equal(f.events[0].type, 'session')
  assert.equal(f.calls.some(call => call.path.endsWith('/message')), false)
})

test('wrong response parent cannot complete a newer native turn', async () => {
  const f = fixture({ onPrompt({ sessionID, result }) { const value = result(sessionID); value.info.parentID = 'msg_old'; return value } })
  const result = await f.run()
  assert.equal(result.status, 'failed')
  assert.match(result.reason, /did not match/)
  assert.equal(f.calls.filter(call => call.path.endsWith('/abort')).length, 1)
  assert.equal(f.calls.filter(call => call.path.endsWith('/message') && call.method === 'POST').length, 1)
})

test('SSE normalizes text replacement/delta, tools, todos and native usage without leaking secrets', async () => {
  const ready = deferred()
  const f = fixture({ async onPrompt({ sessionID, send, assistant, result }) {
    send({ type: 'message.updated', properties: { info: assistant(sessionID) } })
    send({ type: 'message.part.updated', properties: { part: { id: 'p1', messageID: 'msg_assistant', sessionID, type: 'text', text: 'Hello' } } })
    send({ type: 'message.part.delta', properties: { sessionID, messageID: 'msg_assistant', partID: 'p1', field: 'text', delta: ' native' } })
    send({ type: 'message.part.updated', properties: { part: { id: 'p2', messageID: 'msg_assistant', sessionID, type: 'text', text: 'Second native part.' } } })
    send({ type: 'message.part.updated', properties: { part: { id: 'tool1', messageID: 'msg_assistant', sessionID, type: 'tool', tool: 'read', callID: 'call1', state: { status: 'completed', input: { path: 'README.md', password }, output: `secret=${password}` } } } })
    send({ type: 'todo.updated', properties: { sessionID, todos: [{ id: '1', content: 'Review', status: 'completed', priority: 'high' }] } })
    await ready.promise
    return result(sessionID)
  } })
  const running = f.run()
  await until(() => f.events.some(event => event.type === 'plan'))
  ready.resolve()
  assert.equal((await running).status, 'completed')
  assert.equal(f.events.some(event => event.type === 'assistant' && event.text === 'Hello native'), true)
  assert.equal(f.events.some(event => event.type === 'assistant' && event.text === 'Hello native\nSecond native part.'), true)
  assert.equal(f.events.some(event => event.type === 'tool'), true)
  assert.equal(f.events.some(event => event.type === 'usage'), true)
  assert.equal(JSON.stringify(f.events).includes(password), false)
})

function permission(sessionID, id = 'per_fixture') { return { id, sessionID, permission: 'bash', patterns: ['node --version'], always: ['node *'], metadata: { command: 'node --version' }, tool: { messageID: 'msg_assistant', callID: 'call1' } } }

test('duplicate permission events produce exactly one callback and one exact once reply', async () => {
  const finish = deferred()
  const f = fixture({ async onPrompt({ sessionID, send, assistant, result, permissions }) {
    send({ type: 'message.updated', properties: { info: assistant(sessionID) } })
    const request = permission(sessionID)
    permissions.push(request)
    send({ type: 'permission.asked', properties: request })
    send({ type: 'permission.asked', properties: request })
    await finish.promise
    return result(sessionID)
  } })
  let count = 0
  const running = f.run({ requestPermission(request) {
    count++
    assert.equal(request.identity.nativeSessionId, 'ses_new')
    assert.match(request.identity.turnId, /^msg_/)
    assert.equal(typeof request.identity.connectionEpoch, 'string')
    assert.deepEqual(request.options.map(option => option.id), ['once', 'reject'])
    assert.equal(request.signal.aborted, false)
    return { optionId: 'once' }
  } })
  await until(() => f.calls.some(call => call.path === '/permission/per_fixture/reply'))
  await until(() => f.permissions.length === 0)
  finish.resolve()
  assert.equal((await running).status, 'completed')
  assert.equal(count, 1)
  assert.deepEqual(f.calls.filter(call => call.path === '/permission/per_fixture/reply').map(call => call.body), [{ reply: 'once' }])
})

test('invalid or broader permission answers fail closed without an approval reply', async () => {
  const f = fixture({ async onPrompt({ sessionID, send, permissions }) {
    const request = permission(sessionID); permissions.push(request)
    send({ type: 'permission.asked', properties: request })
    await new Promise(() => {})
  } })
  const result = await f.run({ requestPermission: () => ({ optionId: 'always' }) })
  assert.equal(result.status, 'blocked')
  assert.equal(f.calls.some(call => call.path === '/permission/per_fixture/reply'), false)
  assert.equal(f.calls.some(call => call.path.endsWith('/abort')), true)
})

test('another client resolving an approval cancels the stale UI and prevents a late reply', async () => {
  const answer = deferred(), finish = deferred()
  let requestSignal
  const f = fixture({ async onPrompt({ sessionID, send, permissions, result }) {
    const request = permission(sessionID); permissions.push(request)
    send({ type: 'permission.asked', properties: request })
    await finish.promise
    return result(sessionID)
  } })
  const running = f.run({ requestPermission(request) { requestSignal = request.signal; return answer.promise } })
  await until(() => requestSignal)
  f.permissions.splice(0)
  f.send({ type: 'permission.replied', properties: { sessionID: 'ses_new', requestID: 'per_fixture', reply: 'reject' } })
  await until(() => requestSignal.aborted)
  answer.resolve({ optionId: 'once' })
  finish.resolve()
  assert.equal((await running).status, 'completed')
  assert.equal(f.calls.some(call => call.path === '/permission/per_fixture/reply'), false)
})

test('native question choices normalize to host IDs then map exactly back to native answers', async () => {
  const finish = deferred()
  const f = fixture({ async onPrompt({ sessionID, send, questions, result }) {
    const request = { id: 'que_fixture', sessionID, questions: [{ question: 'Choose a mode', header: 'Mode', options: [{ label: 'Fast', description: 'Quick' }, { label: 'Full', description: 'Complete' }], multiple: false }], tool: { messageID: 'msg_assistant', callID: 'call1' } }
    questions.push(request); send({ type: 'question.asked', properties: request })
    await finish.promise; return result(sessionID)
  } })
  const running = f.run({ requestInput(request) {
    assert.equal(request.questions[0].id, 'question_0')
    assert.equal(request.questions[0].multiSelect, false)
    return { answers: [{ id: 'question_0', selected: ['Full'] }] }
  } })
  await until(() => f.calls.some(call => call.path === '/question/que_fixture/reply'))
  finish.resolve()
  assert.equal((await running).status, 'completed')
  assert.deepEqual(f.calls.find(call => call.path === '/question/que_fixture/reply').body, { answers: [['Full']] })
})

test('secret questions and unknown approval protocol fail closed without displaying insecure input', async () => {
  for (const type of ['question.asked', 'permission.v2.asked']) {
    let asked = false
    const f = fixture({ async onPrompt({ sessionID, send, questions }) {
      const request = type === 'question.asked' ? { id: 'que_secret', sessionID, questions: [{ question: 'Enter your API key', options: [] }], tool: { messageID: 'msg_assistant', callID: 'call1' } } : { id: 'per_v2', sessionID, action: 'bash', resources: ['*'] }
      if (type === 'question.asked') questions.push(request)
      send({ type, properties: request })
      await new Promise(() => {})
    } })
    const result = await f.run({ requestInput() { asked = true } })
    assert.equal(result.status, 'blocked')
    assert.equal(asked, false)
    assert.equal(f.calls.some(call => /\/(reply|reject)$/.test(call.path)), false)
  }
})

test('cancellation during approval aborts native work, verifies idle, and ignores late approval', async () => {
  const controller = new AbortController(), answer = deferred()
  let requestSignal
  const f = fixture({ async onPrompt({ sessionID, send, permissions }) {
    const request = permission(sessionID); permissions.push(request)
    send({ type: 'permission.asked', properties: request })
    await new Promise(() => {})
  } })
  const running = f.run({ signal: controller.signal, requestPermission(request) { requestSignal = request.signal; return answer.promise } })
  await until(() => requestSignal)
  controller.abort()
  const result = await running
  answer.resolve({ optionId: 'once' })
  await tick()
  assert.equal(result.status, 'cancelled')
  assert.equal(requestSignal.aborted, true)
  assert.equal(f.calls.some(call => call.path.endsWith('/abort')), true)
  assert.equal(f.calls.some(call => call.path.endsWith('/reply')), false)
  const abortIndex = f.calls.findIndex(call => call.path.endsWith('/abort'))
  assert.equal(f.calls.slice(abortIndex + 1).some(call => call.path === '/session/status'), true)
})

test('cancellation with unconfirmed idle throws cleanup uncertainty rather than reporting cancelled', async () => {
  const controller = new AbortController()
  const f = fixture({ keepBusy: true, config: { cleanupTimeoutMs: 15 }, async onPrompt() { controller.abort(); await new Promise(() => {}) } })
  await assert.rejects(f.run({ signal: controller.signal }), { code: 'AGENTS_CLEANUP_UNCONFIRMED' })
})

test('unexpected SSE disconnect fails and aborts; no automatic prompt replay', async () => {
  const f = fixture({ async onPrompt() { await tick(); f.closeStream(); await new Promise(() => {}) } })
  const result = await f.run()
  assert.equal(result.status, 'failed')
  assert.match(result.reason, /stream closed/)
  assert.equal(f.calls.filter(call => call.path.endsWith('/message') && call.method === 'POST').length, 1)
  assert.equal(f.calls.filter(call => call.path.endsWith('/abort')).length, 1)
})

test('cancellation does not abort historical children without current-turn delegation', async () => {
  const controller = new AbortController()
  const f = fixture({ children: { ses_new: [{ id: 'ses_child', parentID: 'ses_new', directory: cwd }] }, async onPrompt() { controller.abort(); await new Promise(() => {}) } })
  assert.equal((await f.run({ signal: controller.signal })).status, 'cancelled')
  assert.deepEqual(f.calls.filter(call => call.path.endsWith('/abort')).map(call => call.path), ['/session/ses_new/abort'])
})

test('SSE decoder accepts fragmented UTF-8 and multiline data; malformed events fail explicitly', async () => {
  const controller = new AbortController(), values = []
  const bytes = new TextEncoder().encode(': heartbeat\r\ndata: {"type":"fixture",\r\ndata: "text":"你好"}\r\n\r\n')
  const stream = new ReadableStream({ start(c) { for (const byte of bytes) c.enqueue(new Uint8Array([byte])) } })
  await consumeSse(stream, value => { values.push(value); controller.abort() }, controller.signal).catch(error => assert.equal(error.name, 'AbortError'))
  assert.deepEqual(values, [{ type: 'fixture', text: '你好' }])
  const invalid = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: not-json\n\n')); c.close() } })
  await assert.rejects(consumeSse(invalid, () => {}, undefined), { code: 'OPENCODE_PROTOCOL' })
})

test('real controller accepts root-bound OpenCode permission and normalized native questions', async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'opencode-controller-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const permissionDone = deferred(), inputDone = deferred()
  const f = fixture({ cwd: directory, async onPrompt({ sessionID, send, permissions, questions, result }) {
    const approval = permission(sessionID)
    permissions.push(approval); send({ type: 'permission.asked', properties: approval })
    await permissionDone.promise
    const question = { id: 'que_native', sessionID, questions: [{ question: 'Choose a check', options: [{ label: 'Unit tests', description: 'Run fixtures' }], multiple: false }], tool: { messageID: 'msg_assistant', callID: 'call2' } }
    questions.push(question); send({ type: 'question.asked', properties: question })
    await inputDone.promise
    return result(sessionID)
  } })
  const store = createTaskStore(directory)
  let approvals = 0, inputs = 0
  const controller = createAgentsController({
    store, adapter: async runtime => runtime === 'opencode' ? f.adapter : { discover: async () => ({ available: false, authenticated: false, models: [] }) },
    cwdOf: async () => directory, policyOf: () => ({ mode: 'danger-full-access', workspaceRoot: directory }), trustedExternalRuntime: true,
    approve: async () => { approvals++; return 'allowed-once' },
    askInput: async (_exec, questions) => { inputs++; return { answers: [{ id: questions[0].id, selected: ['Unit tests'] }] } },
  })
  const running = controller.run({ runtime: 'opencode', model: 'fixture/native', prompt: 'Use the synthetic fixture' }, { agent: { session: { id: 'host-session' } }, signal: new AbortController().signal })
  await until(() => f.calls.some(call => call.path === '/permission/per_fixture/reply'))
  permissionDone.resolve()
  await until(() => f.calls.some(call => call.path === '/question/que_native/reply'))
  inputDone.resolve()
  const result = await running
  assert.equal(result.task.state, 'completed', result.task.reason)
  assert.equal(result.task.nativeSessionId, 'ses_new')
  assert.equal(approvals, 2)
  assert.equal(inputs, 1)
  assert.equal(store.hasLock('host-session'), false)
})

test('native scopes that need redaction are blocked before an incomplete approval can be shown', async () => {
  let asked = false
  const f = fixture({ async onPrompt({ sessionID, send, permissions }) {
    const request = permission(sessionID)
    request.metadata.password = password
    permissions.push(request); send({ type: 'permission.asked', properties: request })
    await new Promise(() => {})
  } })
  const result = await f.run({ requestPermission() { asked = true; return { optionId: 'once' } } })
  assert.equal(result.status, 'blocked')
  assert.equal(asked, false)
  assert.equal(JSON.stringify(f.events).includes(password), false)
})

test('foreign permission IDs and old native-message decisions never invoke a callback', async () => {
  let asked = false
  const f = fixture({ async onPrompt({ sessionID, send, assistant, permissions }) {
    const old = assistant(sessionID); old.parentID = 'msg_previous'
    send({ type: 'message.updated', properties: { info: old } })
    const request = permission(sessionID)
    permissions.push(request); send({ type: 'permission.asked', properties: request })
    await new Promise(() => {})
  } })
  const result = await f.run({ requestPermission() { asked = true } })
  assert.equal(result.status, 'blocked')
  assert.equal(asked, false)
  assert.equal(f.calls.some(call => call.path.endsWith('/reply')), false)
})

test('completion rejects message parts carrying another session identity', async () => {
  const f = fixture({ onPrompt({ sessionID, result }) { const response = result(sessionID); response.parts[0].sessionID = 'ses_other'; return response } })
  const result = await f.run()
  assert.equal(result.status, 'failed')
  assert.match(result.reason, /different native session/)
})

test('backend identity follows endpoint, user and agent routing but never a credential or its hash', () => {
  const make = config => createOpenCodeAdapter({ config: { endpoint: 'http://127.0.0.1:4096', password, username: 'fixture-user', agent: 'build', ...config } }).backendIdentity
  const original = make({})
  assert.equal(make({ password: 'rotated-fixture-secret' }), original)
  for (const change of [{ endpoint: 'http://127.0.0.1:4097' }, { username: 'other-user' }, { agent: 'plan' }]) assert.notEqual(make(change), original)
  assert.equal(original.includes(password), false)
  assert.equal(original.includes(Buffer.from(`fixture-user:${password}`).toString('base64')), false)
  assert.match(original, /127\.0\.0\.1:4096/)
})

test('controller rejects a continuation after backend configuration changes without contacting that server', async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'opencode-backend-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const first = fixture({ cwd: directory }), other = fixture({ cwd: directory, config: { endpoint: 'http://127.0.0.1:4097' } })
  let chosen = first.adapter
  const store = createTaskStore(directory)
  const controller = createAgentsController({ store, adapter: async runtime => runtime === 'opencode' ? chosen : { discover: async () => ({ available: false, models: [] }) }, cwdOf: async () => directory, policyOf: () => ({ mode: 'danger-full-access', workspaceRoot: directory }), trustedExternalRuntime: true, approve: async () => 'allowed-once' })
  const args = { runtime: 'opencode', model: 'fixture/native', prompt: 'First fixture turn' }
  const exec = { agent: { session: { id: 'host-backend' } }, signal: new AbortController().signal }
  const result = await controller.run(args, exec)
  assert.equal(result.task.state, 'completed')
  chosen = other.adapter
  await assert.rejects(controller.run({ ...args, prompt: 'Continue', scope: result.scope, taskId: result.task.id, expectedRevision: result.revision }, exec), /preserve runtime/)
  assert.equal(other.calls.length, 0)
  assert.equal(store.hasLock('host-backend'), false)
})

test('successive explicit prompts retain one native session and distinct parent correlation IDs', async () => {
  const f = fixture()
  const first = await f.run()
  assert.equal(first.status, 'completed')
  const second = await f.run({ nativeSessionId: first.nativeSessionId, prompt: 'A deliberate follow-up' })
  assert.equal(second.status, 'completed')
  assert.equal(first.nativeSessionId, second.nativeSessionId)
  assert.equal(f.calls.filter(call => call.path === '/session' && call.method === 'POST').length, 1)
  const prompts = f.calls.filter(call => call.path === '/session/ses_new/message' && call.method === 'POST')
  assert.equal(prompts.length, 2)
  assert.notEqual(prompts[0].body.messageID, prompts[1].body.messageID)
  assert.equal(prompts[0].body.messageID < prompts[1].body.messageID, true)
})

test('current native task delegation binds child cancellation ownership', async () => {
  const controller = new AbortController()
  const f = fixture({ children: { ses_new: [{ id: 'ses_child', parentID: 'ses_new', directory: cwd }] }, async onPrompt({ sessionID, send, assistant }) {
    send({ type: 'message.updated', properties: { info: assistant(sessionID) } })
    send({ type: 'message.part.updated', properties: { part: { id: 'prt_task', sessionID, messageID: 'msg_assistant', type: 'tool', tool: 'task', callID: 'call_delegate', state: { status: 'running', input: { prompt: 'Check child fixture' }, metadata: { sessionId: 'ses_child', parentSessionId: sessionID, background: true } } } } })
    await new Promise(() => {})
  } })
  const running = f.run({ signal: controller.signal })
  await until(() => f.events.some(event => event.type === 'tool' && event.data.name === 'task'))
  controller.abort()
  assert.equal((await running).status, 'cancelled')
  assert.deepEqual(f.calls.filter(call => call.path.endsWith('/abort')).map(call => call.path).sort(), ['/session/ses_child/abort', '/session/ses_new/abort'])
})

test('even delegated child decisions are not granted without an exact native child-turn correlation', async () => {
  let asked = false
  const f = fixture({ children: { ses_new: [{ id: 'ses_child', parentID: 'ses_new', directory: cwd }] }, async onPrompt({ sessionID, send, assistant, permissions }) {
    send({ type: 'message.updated', properties: { info: assistant(sessionID) } })
    send({ type: 'message.part.updated', properties: { part: { id: 'prt_task', sessionID, messageID: 'msg_assistant', type: 'tool', tool: 'task', callID: 'call_delegate', state: { status: 'running', input: { prompt: 'Check child fixture' }, metadata: { sessionId: 'ses_child', parentSessionId: sessionID } } } } })
    const request = { ...permission('ses_child'), tool: { messageID: 'msg_child_assistant', callID: 'call_child' } }
    permissions.push(request); send({ type: 'permission.asked', properties: request })
    await new Promise(() => {})
  } })
  const result = await f.run({ requestPermission() { asked = true; return { optionId: 'once' } } })
  assert.equal(result.status, 'blocked')
  assert.match(result.reason, /exact child user turn/)
  assert.equal(asked, false)
  assert.equal(f.calls.some(call => call.path.endsWith('/reply')), false)
})

test('historical child approval cannot be mistaken for current-turn delegation', async () => {
  let asked = false
  const f = fixture({ children: { ses_new: [{ id: 'ses_old_child', parentID: 'ses_new', directory: cwd }] }, config: { cleanupTimeoutMs: 20 }, async onPrompt({ send, permissions }) {
    const request = permission('ses_old_child')
    permissions.push(request); send({ type: 'permission.asked', properties: request })
    await new Promise(() => {})
  } })
  await assert.rejects(f.run({ requestPermission() { asked = true } }), { code: 'AGENTS_CLEANUP_UNCONFIRMED' })
  assert.equal(asked, false)
  assert.equal(f.calls.some(call => call.path === '/session/ses_old_child/abort'), false)
})

test('cancelled native question is rejected once and stops instead of continuing the model turn', async () => {
  const f = fixture({ async onPrompt({ sessionID, send, questions }) {
    const request = { id: 'que_cancel', sessionID, questions: [{ question: 'Which check?', options: [{ label: 'Test' }] }], tool: { messageID: 'msg_assistant', callID: 'call1' } }
    questions.push(request); send({ type: 'question.asked', properties: request })
    await new Promise(() => {})
  } })
  const result = await f.run({ requestInput: () => null })
  assert.equal(result.status, 'blocked')
  assert.equal(f.calls.filter(call => call.path === '/question/que_cancel/reject').length, 1)
  assert.equal(f.calls.some(call => call.path.endsWith('/abort')), true)
})

test('a root response does not finish or abort legitimate background child work at the cleanup deadline', async () => {
  const f = fixture({ keepBusy: true, config: { cleanupTimeoutMs: 15 }, children: { ses_new: [{ id: 'ses_child', parentID: 'ses_new', directory: cwd }] }, onPrompt({ sessionID, send, assistant, result, state }) {
    send({ type: 'message.updated', properties: { info: assistant(sessionID) } })
    send({ type: 'message.part.updated', properties: { part: { id: 'prt_background', sessionID, messageID: 'msg_assistant', type: 'tool', tool: 'task', callID: 'call_background', state: { status: 'completed', metadata: { sessionId: 'ses_child', parentSessionId: sessionID, background: true }, output: 'Child scheduled' } } } })
    state.statuses = { ses_child: { type: 'busy' } }
    return result(sessionID)
  } })
  let settled = false
  const running = f.run().then(result => { settled = true; return result })
  await until(() => f.calls.filter(call => call.path === '/session/status').length > 2)
  await new Promise(resolve => setTimeout(resolve, 30))
  assert.equal(settled, false)
  assert.equal(f.calls.some(call => call.path.endsWith('/abort')), false)
  f.state.statuses = {}
  assert.equal((await running).status, 'completed')
})

test('oversized discovery responses fail before a session or model request', async () => {
  const f = fixture({ config: { maxResponseBytes: 128 } })
  const result = await f.adapter.discover({ cwd })
  assert.equal(result.available, false)
  assert.equal(f.calls.some(call => call.method === 'POST'), false)
  assert.equal(JSON.stringify(result).includes(password), false)
})

test('only a live same-process managed owner permits confined HTTP transport and inherited internal signals',async()=>{
 const f=fixture(),owner=new AbortController()
 const adapter=createOpenCodeAdapter({fetch:f.fetch,managedScope:{cwd,signal:owner.signal},config:{endpoint:'http://127.0.0.1:4096',password,requestTimeoutMs:5000,statusPollMs:1,cleanupTimeoutMs:1000}})
 const result=await adapter.run({...defaults,sandboxPolicy:{mode:'workspace-write',workspaceRoot:cwd},trustedExternalRuntime:false,signal:owner.signal})
 assert.equal(result.status,'completed');assert.equal(f.calls.filter(call=>call.path.endsWith('/message')&&call.method==='POST').length,1)
 const count=f.calls.length
 const foreign=await adapter.run({...defaults,cwd:'/other',sandboxPolicy:{mode:'workspace-write'},trustedExternalRuntime:false,signal:owner.signal});assert.equal(foreign.status,'blocked');assert.equal(f.calls.length,count)
 owner.abort()
 const late=await adapter.run({...defaults,sandboxPolicy:{mode:'workspace-write'},trustedExternalRuntime:false,signal:new AbortController().signal});assert.equal(late.status,'blocked');assert.equal(f.calls.length,count)
})
