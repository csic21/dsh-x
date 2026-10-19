import assert from 'node:assert/strict'
import test from 'node:test'
import { PassThrough } from 'node:stream'
import { decidePermission, ChunkAccumulator } from '../src/acp/run.ts'
import { AcpWire } from '../src/acp/wire.ts'
import { bindCallOptions, takeCallOptions } from '../src/call-options.ts'
import { CodexEventFold, codexExecArgv } from '../src/codex/run.ts'

const pair = () => {
  const input = new PassThrough()
  const output = new PassThrough()
  const lines: string[] = []
  let pending = ''
  output.on('data', (chunk: Buffer) => {
    pending += chunk.toString('utf8')
    let index = pending.indexOf('\n')
    while (index >= 0) {
      lines.push(pending.slice(0, index))
      pending = pending.slice(index + 1)
      index = pending.indexOf('\n')
    }
  })
  return { input, output, lines }
}

test('ACP wire completes initialize, session creation, config, and prompt', async () => {
  const { input, output, lines } = pair()
  const wire = new AcpWire({ streams: { input, output } })
  const pending = wire.initialize({ name: 'probe', version: '0' })
  await new Promise(resolve => setImmediate(resolve))
  const init = JSON.parse(lines[0] ?? '{}') as { id: number, method: string }
  assert.equal(init.method, 'initialize')
  input.write(`${JSON.stringify({ jsonrpc: '2.0', id: init.id, result: { agentCapabilities: { authMethods: [{ id: 'env' }] } } })}\n`)
  const capabilities = await pending
  assert.equal((capabilities.authMethods as { id: string }[])[0]?.id, 'env')

  const sessionPending = wire.newSession('/tmp')
  await new Promise(resolve => setImmediate(resolve))
  const created = JSON.parse(lines.at(-1) ?? '{}') as { id: number, method: string }
  assert.equal(created.method, 'session/new')
  input.write(`${JSON.stringify({ jsonrpc: '2.0', id: created.id, result: { sessionId: 'ses_1', configOptions: [{ id: 'model', currentValue: 'a' }] } })}\n`)
  assert.equal((await sessionPending).sessionId, 'ses_1')

  const configPending = wire.setConfigOption('ses_1', 'model', 'b')
  await new Promise(resolve => setImmediate(resolve))
  const config = JSON.parse(lines.at(-1) ?? '{}') as { id: number, method: string, params: { value: string } }
  assert.equal(config.method, 'session/set_config_option')
  assert.equal(config.params.value, 'b')
  input.write(`${JSON.stringify({ jsonrpc: '2.0', id: config.id, result: {} })}\n`)
  await configPending

  const promptPending = wire.prompt('ses_1', [{ type: 'text', text: 'pong' }])
  await new Promise(resolve => setImmediate(resolve))
  const prompt = JSON.parse(lines.at(-1) ?? '{}') as { id: number }
  input.write(`${JSON.stringify({ jsonrpc: '2.0', id: prompt.id, result: { stopReason: 'end_turn' } })}\n`)
  assert.equal(await promptPending, 'end_turn')
  wire.close()
})

test('ACP wire ignores malformed lines and rejects pending requests when the peer closes', async () => {
  const { input, output } = pair()
  const wire = new AcpWire({ streams: { input, output } })
  const pending = wire.request('session/prompt', { sessionId: 'x', prompt: [] })
  input.write('not-json\n')
  input.end()
  await assert.rejects(pending, /transport closed/)
})

test('permission tiers allow reads, deny writes, and allow everything only when asked', () => {
  const read = { toolCall: { kind: 'read' }, options: [{ kind: 'allow_once', optionId: 'yes' }] }
  const edit = { toolCall: { kind: 'edit' }, options: [{ kind: 'allow_once', optionId: 'yes' }] }
  assert.equal(decidePermission('read-only', read).decision.decision, 'allowed')
  assert.equal(decidePermission('read-only', edit).decision.decision, 'denied')
  assert.equal(decidePermission('deny', read).decision.decision, 'denied')
  assert.equal(decidePermission('allow', edit).outcome.optionId, 'yes')
})

test('message chunks append within one id and the last message is the answer', () => {
  const fold = new ChunkAccumulator()
  fold.push('m1', 'plan ')
  fold.push('m1', 'only')
  fold.push('m2', 'pong')
  assert.equal(fold.collect(), 'pong')
  const anon = new ChunkAccumulator()
  anon.push(undefined, 'a')
  anon.push(undefined, 'b')
  assert.equal(anon.collect(), 'ab')
})

test('codex exec argv is unattended and the fold keeps the last agent message', () => {
  const argv = codexExecArgv({ cwd: '/tmp', sandbox: 'workspace-write', fullAuto: false, model: 'gpt-5.4' })
  assert.deepEqual(argv.slice(0, 4), ['exec', '--json', '--skip-git-repo-check', '--cd'])
  assert.ok(argv.includes('--model') && argv.includes('gpt-5.4'))
  assert.equal(argv.at(-1), '-')
  const fold = new CodexEventFold()
  fold.push({ type: 'item.completed', item: { id: '1', type: 'reasoning', text: 'thinking' } })
  fold.push({ type: 'item.completed', item: { id: '2', type: 'agent_message', text: 'first' } })
  fold.push({ type: 'item.completed', item: { id: '3', type: 'agent_message', text: 'pong' } })
  fold.push({ type: 'error', message: 'ignored after a failure is set' })
  fold.push({ type: 'turn.failed', error: { message: 'nope' } })
  assert.equal(fold.answer, 'pong')
  assert.equal(fold.failure, 'nope')
})

test('per-call options are readable once from the forwarded prompt array', () => {
  const prompt = [{ type: 'text' as const, text: 'task' }]
  bindCallOptions(prompt, { model: 'grok-4', permission: 'allow' })
  assert.deepEqual(takeCallOptions(prompt), { model: 'grok-4', permission: 'allow' })
  assert.equal(takeCallOptions(prompt), undefined)
})
