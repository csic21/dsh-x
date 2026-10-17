import assert from 'node:assert/strict'
import { PassThrough, Writable } from 'node:stream'
import test from 'node:test'

import { preflightAcp, runAcpPrompt } from '../src/acp.js'

test('stdin write errors reject the pending request without crashing the host', async () => {
  await assert.rejects(runAcpPrompt({
    modeId: 'read-only',
    argv: ['fixture'], cwd: process.cwd(), prompt: 'plan', timeoutMs: 5_000,
    spawn: () => {
      const stdout = new PassThrough()
      const stdin = new Writable({
        write(_chunk, _encoding, callback) {
          callback(Object.assign(new Error('ACP fixture input closed'), { code: 'EPIPE' }))
        },
      })
      return { stdin, stdout, terminate: () => stdout.end() }
    },
  }), { code: 'EPIPE' })
})

test('official subprocess input closure fails promptly while stdout stays open', { skip: process.platform === 'win32' }, async () => {
  const { Context } = await import('@deepseek-ai/cordis')
  const { default: SubprocessLocal } = await import('@deepseek-ai/dsh-subprocess-local')
  const ctx = new Context()
  try {
    await ctx.plugin(SubprocessLocal)
    const script = `
      const fs = require('node:fs');
      process.stdin.once('data', data => {
        const message = JSON.parse(data.toString().trim());
        fs.closeSync(0);
        process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:message.id,result:{protocolVersion:1,agentInfo:{name:'fixture',version:'1.0.0'}}})+'\\n');
      });
      setInterval(() => {}, 1000);
    `
    await assert.rejects(runAcpPrompt({
      spawn: spec => ctx.subprocess.spawn(spec),
      modeId: 'read-only',
      argv: [process.execPath, '-e', script], cwd: process.cwd(), prompt: 'plan', timeoutMs: 5_000,
    }), { code: 'EPIPE' })
  } finally {
    await ctx.fiber.dispose()
  }
})

test('a prompt collects chunk text and cancels permission requests', async () => {
  const methods = []
  let promptId
  const result = await runAcpPrompt({
    modeId: 'read-only',
    argv: ['agent'],
    cwd: '/work',
    prompt: 'plan this',
    timeoutMs: 5_000,
    spawn: scripted(message => {
      if (typeof message.method === 'string') methods.push(message.method)
      if (message.method === 'initialize') {
        return ok(message.id, initialized())
      }
      if (message.method === 'session/new') {
        assert.equal(message.params.cwd, '/work')
        assert.deepEqual(message.params.mcpServers, [])
        return ok(message.id, session('child-1'))
      }
      if (message.method === 'session/set_mode') {
        return ok(message.id, {})
      }
      if (message.method === 'session/prompt') {
        promptId = message.id
        return [{
          jsonrpc: '2.0',
          id: 90,
          method: 'session/request_permission',
          params: { toolCall: { kind: 'edit' }, options: [{ optionId: 'allow', kind: 'allow_once' }] },
        }]
      }
      if (message.result?.outcome?.outcome === 'cancelled') {
        return [
          note('agent_message_chunk', '计划正文', 'child-1'),
          ok(promptId, { stopReason: 'end_turn' }),
        ]
      }
      return undefined
    }),
  })
  assert.deepEqual(methods, ['initialize', 'session/new', 'session/set_mode', 'session/prompt'])
  assert.equal(result.ok, true)
  assert.equal(result.text, '计划正文')
  assert.equal(result.permissionDenials, 1)
})

test('authentication requirement fails without invoking any advertised login method', async () => {
  const methods = []
  await assert.rejects(() => runAcpPrompt({
    modeId: 'read-only',
    argv: ['agent'],
    cwd: '/work',
    prompt: 'plan',
    timeoutMs: 5_000,
    spawn: scripted(message => {
      if (typeof message.method === 'string') methods.push(message.method)
      if (message.method === 'initialize') {
        return ok(message.id, {
          ...initialized(),
          authMethods: [{ id: 'xai.api_key', name: 'API key' }],
        })
      }
      if (message.method === 'session/new') return failure(message.id, -32000, 'Authentication required')
      return undefined
    }),
  }), /登录/)
  assert.deepEqual(methods, ['initialize', 'session/new'])
})

test('max_tokens keeps the partial text and is not success', async () => {
  const result = await runAcpPrompt({
    modeId: 'read-only',
    argv: ['agent'],
    cwd: '/work',
    prompt: 'plan',
    timeoutMs: 5_000,
    spawn: scripted(message => {
      if (message.method === 'initialize') return ok(message.id, initialized())
      if (message.method === 'session/new') return ok(message.id, session('child-2'))
      if (message.method === 'session/set_mode') return ok(message.id, {})
      if (message.method === 'session/prompt') {
        return [note('agent_message_chunk', '一半', 'child-2'), ok(message.id, { stopReason: 'max_tokens' })]
      }
      return undefined
    }),
  })
  assert.equal(result.ok, false)
  assert.equal(result.stopReason, 'max_tokens')
  assert.equal(result.text, '一半')
})

function ok(id, result) {
  return { jsonrpc: '2.0', id, result }
}

function note(sessionUpdate, text, sessionId = 'fixture-session') {
  return {
    jsonrpc: '2.0',
    method: 'session/update',
    params: { sessionId, update: { sessionUpdate, content: { type: 'text', text } } },
  }
}

function scripted(respond) {
  return () => {
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    let buffer = ''
    stdin.on('data', chunk => {
      buffer += chunk.toString('utf8')
      let newline = buffer.indexOf('\n')
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (line !== '') write(respond(JSON.parse(line)))
        newline = buffer.indexOf('\n')
      }
    })
    function write(replied) {
      const messages = Array.isArray(replied) ? replied : replied === undefined ? [] : [replied]
      for (const item of messages) stdout.write(`${JSON.stringify(item)}\n`)
    }
    return {
      stdin,
      stdout,
      terminate() {
        stdout.end()
      },
      done: Promise.resolve({ exitCode: 0, signal: null }),
    }
  }
}


for (const payload of [null, [], 'text', 7, {}, { jsonrpc: '2.0', id: {}, result: {} }, { jsonrpc: '2.0', method: 1 }]) {
  test(`invalid JSON-RPC structure fails safely: ${JSON.stringify(payload)}`, async () => {
    await assert.rejects(runAcpPrompt({
      modeId: 'read-only',
      argv: ['agent'], cwd: '/work', prompt: 'plan', timeoutMs: 1_000,
      spawn: () => {
        const stdin = new PassThrough()
        const stdout = new PassThrough()
        stdin.once('data', () => setImmediate(() => stdout.write(`${JSON.stringify(payload)}\n`)))
        return { stdin, stdout, terminate: () => stdout.end() }
      },
    }), /JSON-RPC/)
  })
}

test('oversized unterminated ACP lines fail without waiting for deadline', async () => {
  await assert.rejects(runAcpPrompt({
    modeId: 'read-only',
    argv: ['agent'], cwd: '/work', prompt: 'plan', timeoutMs: 1_000,
    spawn: () => {
      const stdin = new PassThrough()
      const stdout = new PassThrough()
      stdin.once('data', () => setImmediate(() => stdout.write('x'.repeat(256_001))))
      return { stdin, stdout, terminate: () => stdout.end() }
    },
  }), /单行响应超过/)
})

test('oversized terminated ACP lines fail before JSON parsing', async () => {
  await assert.rejects(runAcpPrompt({
    modeId: 'read-only',
    argv: ['agent'], cwd: '/work', prompt: 'plan', timeoutMs: 1_000,
    spawn: () => {
      const stdin = new PassThrough()
      const stdout = new PassThrough()
      stdin.once('data', () => setImmediate(() => stdout.write(`${'x'.repeat(256_001)}\n`)))
      return { stdin, stdout, terminate: () => stdout.end() }
    },
  }), /单行响应超过/)
})

test('many individually small text chunks cannot exceed total text cap', async () => {
  await assert.rejects(runAcpPrompt({
    modeId: 'read-only',
    argv: ['agent'], cwd: '/work', prompt: 'plan', timeoutMs: 1_000,
    spawn: scripted(message => {
      if (message.method === 'initialize') return ok(message.id, initialized())
      if (message.method === 'session/new') return ok(message.id, session('bounded'))
      if (message.method === 'session/set_mode') return ok(message.id, {})
      if (message.method === 'session/prompt') return [
        note('agent_message_chunk', 'x'.repeat(100_001), 'bounded'),
        note('agent_message_chunk', 'x'.repeat(100_001), 'bounded'),
        ok(message.id, { stopReason: 'end_turn' }),
      ]
    }),
  }), /正文超过/)
})

function initialized(overrides = {}) {
  return { protocolVersion: 1, agentInfo: { name: 'fixture-agent', version: '1.0.0' }, ...overrides }
}

function session(sessionId = 'fixture-session', modeId = 'read-only') {
  return { sessionId, modes: { currentModeId: modeId, availableModes: [{ id: modeId, name: modeId }] } }
}

function failure(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

function probe(responses = {}, { onMessage } = {}) {
  const messages = []
  let terminated = 0
  const factory = scripted(message => {
    messages.push(message)
    onMessage?.(message)
    if (Object.hasOwn(responses, message.method)) {
      const response = responses[message.method]
      return typeof response === 'function' ? response(message) : ok(message.id, response)
    }
    if (message.method === 'initialize') return ok(message.id, initialized())
    if (message.method === 'session/new') return ok(message.id, session())
    if (message.method === 'session/set_mode') return ok(message.id, {})
    if (message.method === 'session/prompt') return [note('agent_message_chunk', 'done'), ok(message.id, { stopReason: 'end_turn' })]
  })
  return {
    options: {
      argv: ['/audited/fixture-agent'], cwd: '/work', modeId: 'read-only', timeoutMs: 1_000,
      spawn(spec) {
        const child = factory(spec)
        return { ...child, terminate() { terminated += 1; child.terminate() } }
      },
    },
    get messages() { return messages },
    get methods() { return messages.map(message => message.method).filter(Boolean) },
    get terminated() { return terminated },
  }
}

test('preflight verifies credentials, identity, and mode without sending prompt content', async () => {
  const fixture = probe({ initialize: initialized({ authMethods: [
    { id: 'interactive-login', name: 'Use existing login in browser' },
    { id: 'cached_token', name: 'Cached token' },
    { id: 'api-key', name: 'API key' },
  ] }) })
  const result = await preflightAcp({ ...fixture.options, prompt: 'PRIVATE TASK MUST NOT BE SENT' })
  assert.deepEqual(result, {
    ok: true,
    adapter: { executable: '/audited/fixture-agent', name: 'fixture-agent', version: '1.0.0' },
    modeId: 'read-only', authentication: 'existing-session', permissionDenials: 0,
  })
  assert.deepEqual(fixture.methods, ['initialize', 'session/new', 'session/set_mode'])
  assert.deepEqual(fixture.messages[0].params.clientCapabilities, {})
  assert.equal(JSON.stringify(fixture.messages).includes('PRIVATE TASK'), false)
  assert.equal(fixture.terminated, 1)
})

for (const call of [preflightAcp, runAcpPrompt]) {
  test(`${call.name} fails closed when set_mode is rejected`, async () => {
    const fixture = probe({ 'session/set_mode': message => failure(message.id, -32601, 'mode not implemented') })
    await assert.rejects(call({ ...fixture.options, prompt: 'private task' }), { code: 'DSH_X_PLAN_ACP_MODE' })
    assert.deepEqual(fixture.methods, ['initialize', 'session/new', 'session/set_mode'])
    assert.equal(fixture.terminated, 1)
  })

  for (const modes of [undefined, null, {}, { availableModes: [] }, { availableModes: [{ id: 'plan' }] }, { availableModes: [{ id: 'agent' }] }]) {
    test(`${call.name} rejects unavailable read-only capability: ${JSON.stringify(modes)}`, async () => {
      const fixture = probe({ 'session/new': { sessionId: 'unprotected', modes } })
      await assert.rejects(call({ ...fixture.options, prompt: 'private task' }), { code: 'DSH_X_PLAN_READONLY_UNAVAILABLE' })
      assert.deepEqual(fixture.methods, ['initialize', 'session/new'])
      assert.equal(fixture.terminated, 1)
    })
  }

  test(`${call.name} blocks unsupported protocol before opening a session`, async () => {
    const fixture = probe({ initialize: initialized({ protocolVersion: 2 }) })
    await assert.rejects(call({ ...fixture.options, prompt: 'private task' }), { code: 'DSH_X_PLAN_ACP_PROTOCOL' })
    assert.deepEqual(fixture.methods, ['initialize'])
    assert.equal(fixture.terminated, 1)
  })

  for (const agentInfo of [undefined, {}, { name: 'fixture-agent' }, { name: '', version: '1' }, { name: 'fixture-agent', version: '' }]) {
    test(`${call.name} requires a reportable adapter identity: ${JSON.stringify(agentInfo)}`, async () => {
      const fixture = probe({ initialize: initialized({ agentInfo }) })
      await assert.rejects(call({ ...fixture.options, prompt: 'private task' }), { code: 'DSH_X_PLAN_ACP_IDENTITY' })
      assert.deepEqual(fixture.methods, ['initialize'])
      assert.equal(fixture.terminated, 1)
    })
  }
}

test('a successful preflight identity is checked again by the model call', async () => {
  const first = probe()
  const checked = await preflightAcp(first.options)
  const run = probe()
  const result = await runAcpPrompt({ ...run.options, expectedAdapter: checked.adapter, prompt: 'plan' })
  assert.equal(result.ok, true)
  assert.deepEqual(result.adapter, checked.adapter)
  assert.equal(run.terminated, 1)
})

for (const changed of ['executable', 'name', 'version']) {
  test(`a changed adapter ${changed} stops before the task is sent`, async () => {
    const fixture = probe()
    const expectedAdapter = { executable: '/audited/fixture-agent', name: 'fixture-agent', version: '1.0.0', [changed]: 'changed' }
    await assert.rejects(runAcpPrompt({ ...fixture.options, expectedAdapter, prompt: 'private task' }), { code: 'DSH_X_PLAN_ACP_IDENTITY_CHANGED' })
    assert.deepEqual(fixture.methods, ['initialize'])
    assert.equal(fixture.terminated, 1)
  })
}

for (const modeId of [undefined, null, '', 'agent', 'bypassPermissions']) {
  test(`unsafe or missing requested mode never spawns a child: ${modeId}`, async () => {
    let spawned = false
    await assert.rejects(preflightAcp({ modeId, spawn() { spawned = true } }), { code: 'DSH_X_PLAN_READONLY_UNAVAILABLE' })
    assert.equal(spawned, false)
  })
}

test('plan mode works only when explicitly requested and advertised', async () => {
  const fixture = probe({ 'session/new': session('claude-fixture', 'plan') })
  const result = await preflightAcp({ ...fixture.options, modeId: 'plan' })
  assert.equal(result.modeId, 'plan')
  assert.equal(fixture.messages.at(-1).params.modeId, 'plan')
})

test('a mode downgrade during a prompt fails and tears down the child', async () => {
  const fixture = probe({ 'session/prompt': message => [
    note('agent_message_chunk', 'partial'),
    { jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'fixture-session', update: { sessionUpdate: 'current_mode_update', currentModeId: 'agent' } } },
    ok(message.id, { stopReason: 'end_turn' }),
  ] })
  await assert.rejects(runAcpPrompt({ ...fixture.options, prompt: 'plan' }), { code: 'DSH_X_PLAN_ACP_MODE' })
  assert.equal(fixture.terminated, 1)
})

test('a mode downgrade immediately after set_mode success prevents a prompt', async () => {
  const fixture = probe({ 'session/set_mode': message => [
    ok(message.id, {}),
    { jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'fixture-session', update: { sessionUpdate: 'current_mode_update', currentModeId: 'agent' } } },
  ] })
  await assert.rejects(runAcpPrompt({ ...fixture.options, prompt: 'plan' }), { code: 'DSH_X_PLAN_ACP_MODE' })
  assert.equal(fixture.methods.includes('session/prompt'), false)
  assert.equal(fixture.terminated, 1)
})

for (const stage of ['initialize', 'session/new', 'session/set_mode', 'session/prompt']) {
  test(`cancellation during ${stage} rejects and cleans up`, async () => {
    const controller = new AbortController()
    const fixture = probe({ [stage]: () => undefined }, { onMessage(message) {
      if (message.method === stage) setImmediate(() => controller.abort())
    } })
    await assert.rejects(runAcpPrompt({ ...fixture.options, signal: controller.signal, prompt: 'plan' }), { name: 'AbortError' })
    assert.equal(fixture.terminated, 1)
    assert.equal(fixture.methods.includes('session/cancel'), ['session/set_mode', 'session/prompt'].includes(stage))
    if (stage !== 'session/prompt') assert.equal(fixture.methods.includes('session/prompt'), false)
  })
}

test('preflight timeout cancels a known session and never prompts', async () => {
  const fixture = probe({ 'session/set_mode': () => undefined })
  // Keep the event loop alive while AbortSignal.timeout (an unref timer) fires.
  const keepAlive = setTimeout(() => {}, 1_000)
  try {
    await assert.rejects(preflightAcp({ ...fixture.options, timeoutMs: 10 }), { name: 'AbortError' })
  } finally {
    clearTimeout(keepAlive)
  }
  assert.equal(fixture.methods.includes('session/prompt'), false)
  assert.equal(fixture.methods.includes('session/cancel'), true)
  assert.equal(fixture.terminated, 1)
})

for (const call of [preflightAcp, runAcpPrompt]) {
  test(`${call.name} waits for asynchronous termination and owned process exit`, async () => {
    const fixture = probe()
    const stages = []
    const result = await call({
      ...fixture.options, prompt: 'plan',
      spawn(spec) {
        const child = fixture.options.spawn(spec)
        return {
          ...child,
          async terminate() {
            await new Promise(resolve => setTimeout(resolve, 10))
            child.terminate()
            stages.push('terminate')
          },
          async waitForExit(signal) {
            assert.equal(signal.aborted, false)
            await new Promise(resolve => setTimeout(resolve, 10))
            stages.push('exit')
            return true
          },
        }
      },
    })
    assert.equal(result.ok, true)
    assert.deepEqual(stages, ['terminate', 'exit'])
  })
}

test('failed process cleanup is explicit rather than reporting a successful prompt', async () => {
  const fixture = probe()
  await assert.rejects(runAcpPrompt({
    ...fixture.options, prompt: 'plan',
    spawn(spec) {
      const child = fixture.options.spawn(spec)
      return { ...child, async waitForExit() { return false } }
    },
  }), { code: 'DSH_X_PLAN_ACP_CLEANUP' })
})

test('cleanup uses a fresh signal even after cancellation', async () => {
  const controller = new AbortController()
  const fixture = probe({ 'session/prompt': () => undefined }, { onMessage(message) {
    if (message.method === 'session/prompt') setImmediate(() => controller.abort())
  } })
  let waited = false
  await assert.rejects(runAcpPrompt({
    ...fixture.options, signal: controller.signal, prompt: 'plan',
    spawn(spec) {
      const child = fixture.options.spawn(spec)
      return { ...child, async waitForExit(signal) {
        assert.equal(controller.signal.aborted, true)
        assert.equal(signal.aborted, false)
        await new Promise(resolve => setTimeout(resolve, 10))
        waited = true
        return true
      } }
    },
  }), { name: 'AbortError' })
  assert.equal(waited, true)
})

test('handshake text and updates without the active session ID cannot enter a plan', async () => {
  const fixture = probe({
    initialize: message => [note('agent_message_chunk', 'before initialize'), ok(message.id, initialized())],
    'session/set_mode': message => [note('agent_message_chunk', 'before prompt'), ok(message.id, {})],
    'session/prompt': message => [
      { jsonrpc: '2.0', method: 'session/update', params: { update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'missing ID' } } } },
      note('agent_message_chunk', 'different session', 'someone-else'),
      note('agent_message_chunk', 'valid plan'),
      ok(message.id, { stopReason: 'end_turn' }),
    ],
  })
  const result = await runAcpPrompt({ ...fixture.options, prompt: 'plan' })
  assert.equal(result.text, 'valid plan')
})
