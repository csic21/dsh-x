import assert from 'node:assert/strict'
import { PassThrough, Writable } from 'node:stream'
import test from 'node:test'

import { runAcpPrompt } from '../src/acp.js'

test('stdin write errors reject the pending request without crashing the host', async () => {
  await assert.rejects(runAcpPrompt({
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
        process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:message.id,result:{protocolVersion:1}})+'\\n');
      });
      setInterval(() => {}, 1000);
    `
    await assert.rejects(runAcpPrompt({
      spawn: spec => ctx.subprocess.spawn(spec),
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
    argv: ['agent'],
    cwd: '/work',
    prompt: 'plan this',
    modeId: 'read-only',
    timeoutMs: 5_000,
    spawn: scripted(message => {
      if (typeof message.method === 'string') methods.push(message.method)
      if (message.method === 'initialize') {
        return ok(message.id, { protocolVersion: 1, authMethods: [] })
      }
      if (message.method === 'session/new') {
        assert.equal(message.params.cwd, '/work')
        assert.deepEqual(message.params.mcpServers, [])
        return ok(message.id, { sessionId: 'child-1' })
      }
      if (message.method === 'session/set_mode') {
        return { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'no mode' } }
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
          note('agent_message_chunk', '计划正文'),
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

test('an api-key-only auth list fails before a session starts', async () => {
  const methods = []
  await assert.rejects(() => runAcpPrompt({
    argv: ['agent'],
    cwd: '/work',
    prompt: 'plan',
    timeoutMs: 5_000,
    spawn: scripted(message => {
      if (typeof message.method === 'string') methods.push(message.method)
      if (message.method === 'initialize') {
        return ok(message.id, {
          protocolVersion: 1,
          authMethods: [{ id: 'xai.api_key', name: 'API key' }],
        })
      }
      return undefined
    }),
  }), /登录/)
  assert.deepEqual(methods, ['initialize'])
})

test('max_tokens keeps the partial text and is not success', async () => {
  const result = await runAcpPrompt({
    argv: ['agent'],
    cwd: '/work',
    prompt: 'plan',
    timeoutMs: 5_000,
    spawn: scripted(message => {
      if (message.method === 'initialize') return ok(message.id, { protocolVersion: 1 })
      if (message.method === 'session/new') return ok(message.id, { sessionId: 'child-2' })
      if (message.method === 'session/prompt') {
        return [note('agent_message_chunk', '一半'), ok(message.id, { stopReason: 'max_tokens' })]
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

function note(sessionUpdate, text) {
  return {
    jsonrpc: '2.0',
    method: 'session/update',
    params: { update: { sessionUpdate, content: { type: 'text', text } } },
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
    argv: ['agent'], cwd: '/work', prompt: 'plan', timeoutMs: 1_000,
    spawn: scripted(message => {
      if (message.method === 'initialize') return ok(message.id, { protocolVersion: 1 })
      if (message.method === 'session/new') return ok(message.id, { sessionId: 'bounded' })
      if (message.method === 'session/prompt') return [
        note('agent_message_chunk', 'x'.repeat(100_001)),
        note('agent_message_chunk', 'x'.repeat(100_001)),
        ok(message.id, { stopReason: 'end_turn' }),
      ]
    }),
  }), /正文超过/)
})
