import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as chain from '../src/index.ts'
import { registerChainTool } from '../src/tool.ts'
import type { ChainResultSummary } from '../src/tool.ts'

interface Seen {
  name: string
  nested: boolean
  schema: string | undefined
  args: unknown
}

async function harness(t: test.TestContext, config: Record<string, unknown> = {}, onResult?: (summary: ChainResultSummary) => void) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  const seen: Seen[] = []

  const text = (value: unknown) => [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value) }]

  ctx.tools.register(defineTool({
    name: 'write',
    description: 'write a file',
    parameters: { path: { type: 'string', required: true }, content: { type: 'string', required: true } },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { path: { type: 'string', required: true } } },
      render: (args, value) => text(`wrote ${String(value.path)}\n${args.content}`),
    },
    execute: async (args, exec) => {
      seen.push({ name: 'write', nested: exec.parent !== undefined, schema: exec.schema?.name, args })
      return { path: args.path }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'bash',
    description: 'run a command',
    parameters: { command: { type: 'string', required: true } },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { exitCode: { type: 'integer', required: true }, stdout: { type: 'string', required: true } },
      },
      render: (_args, value) => text(value.stdout),
    },
    execute: async (args, exec) => {
      seen.push({ name: 'bash', nested: exec.parent !== undefined, schema: exec.schema?.name, args })
      if (args.command.includes('explode')) throw new Error('boom')
      const exitCode = args.command.includes('exit=1') ? 1 : 0
      return { exitCode, stdout: exitCode === 0 ? 'all good' : 'one test failed' }
    },
  }))

  if (onResult === undefined) await ctx.plugin(chain, config)
  else {
    registerChainTool(ctx, {
      name: 'chain_run',
      allowedTools: ['write', 'bash'],
      maxSteps: 8,
      maxStepChars: 1500,
      continueOnError: config.continueOnError === true,
      onResult,
    })
  }
  t.after(async () => { await ctx.fiber.dispose() })

  const events: { type: string, data: Record<string, unknown> }[] = []
  const session = { id: 'session-fixture', append: (type: string, data: Record<string, unknown>) => { events.push({ type, data }) } }
  const agent = { session }

  const run = async (steps: unknown[], withAgent = false) => {
    const callId = crypto.randomUUID()
    const result = await ctx.tools.execute({
      callId: callId as never,
      name: 'chain_run',
      arguments: { steps },
      ...(withAgent ? { agent: agent as never } : {}),
      signal: new AbortController().signal,
    })
    return { result, seen, events, callId }
  }
  return { ctx, run, seen, events }
}

test('a chain runs literal steps in order as nested dispatches', async t => {
  const { run, seen } = await harness(t)
  const { result } = await run([
    { id: 'write', tool: 'write', arguments: { path: 'a.ts', content: 'export {}' } },
    { id: 'test', tool: 'bash', arguments: { command: 'pnpm test' } },
  ])
  assert.equal(result.isError, false)
  const value = result.value as Record<string, unknown>
  assert.equal(value.executed, 2)
  assert.equal(value.roundTripsSaved, 1)
  assert.deepEqual((value.steps as { id: string }[]).map(step => step.id), ['write', 'test'])
  assert.deepEqual(seen.map(call => call.name), ['write', 'bash'])
  assert.ok(seen.every(call => call.nested), 'every step must dispatch as a nested call with a parent token')
  assert.match(result.content[0].type === 'text' ? result.content[0].text : '', /2 steps executed, 1 model round trip saved/)
})

test('a guard that does not hold stops the chain before the step', async t => {
  const { run, seen } = await harness(t)
  const { result } = await run([
    { id: 'test', tool: 'bash', arguments: { command: 'pnpm test exit=1' } },
    { id: 'report', tool: 'write', arguments: { path: 'ok.txt', content: 'pass' }, when: [{ step: 'test', path: 'exitCode', equals: 0 }] },
  ])
  assert.equal(result.isError, false)
  const value = result.value as Record<string, unknown>
  assert.equal(value.executed, 1)
  assert.deepEqual(seen.map(call => call.name), ['bash'])
  const stopped = value.stopped as { step: string, reason: string, detail: string }
  assert.equal(stopped.step, 'report')
  assert.equal(stopped.reason, 'guard')
  assert.match(stopped.detail, /exitCode/)
})

test('a failed step stops the chain unless continueOnError is set', async t => {
  const strict = await harness(t)
  const first = await strict.run([
    { id: 'boom', tool: 'bash', arguments: { command: 'explode' } },
    { id: 'after', tool: 'write', arguments: { path: 'a', content: 'b' } },
  ])
  assert.equal(first.result.isError, false)
  const stopped = (first.result.value as Record<string, unknown>).stopped as Record<string, unknown>
  assert.equal(stopped.reason, 'error')
  assert.equal((first.result.value as Record<string, unknown>).executed, 1)

  const loose = await harness(t, { continueOnError: true })
  const second = await loose.run([
    { id: 'boom', tool: 'bash', arguments: { command: 'explode' } },
    { id: 'after', tool: 'write', arguments: { path: 'a', content: 'b' }, when: [{ step: 'boom', ok: false }] },
  ])
  assert.equal((second.result.value as Record<string, unknown>).executed, 2)
  assert.equal((second.result.value as Record<string, unknown>).stopped, undefined)
  assert.deepEqual(loose.seen.map(call => call.name), ['bash', 'write'])
})

test('an invalid bank is a tool error the model can correct', async t => {
  const { run } = await harness(t)
  const recursive = await run([{ id: 'a', tool: 'chain_run', arguments: {} }])
  assert.equal(recursive.result.isError, true)
  const text = recursive.result.content[0].type === 'text' ? recursive.result.content[0].text : ''
  assert.match(text, /cannot be chain_run/)

  const disallowed = await run([{ id: 'a', tool: 'rm', arguments: {} }])
  assert.equal(disallowed.result.isError, true)

  const forward = await run([
    { id: 'a', tool: 'write', arguments: { path: 'x', content: 'y' }, when: [{ step: 'b', ok: true }] },
    { id: 'b', tool: 'write', arguments: { path: 'x', content: 'y' } },
  ])
  assert.equal(forward.result.isError, true)
  const forwardText = forward.result.content[0].type === 'text' ? forward.result.content[0].text : ''
  assert.match(forwardText, /earlier step/)
})

test('the configured step ceiling is enforced', async t => {
  const { run } = await harness(t, { maxSteps: 1 })
  const { result } = await run([
    { id: 'a', tool: 'write', arguments: { path: 'a', content: 'b' } },
    { id: 'b', tool: 'write', arguments: { path: 'c', content: 'd' } },
  ])
  assert.equal(result.isError, true)
})

test('long step output is truncated but keeps both ends', async t => {
  const { run } = await harness(t, { maxStepChars: 200 })
  const big = `${'H'.repeat(400)}${'T'.repeat(400)}`
  const { result } = await run([{ id: 'w', tool: 'write', arguments: { path: 'a', content: big } }])
  const value = result.value as { steps: { text: string, truncated: boolean }[] }
  assert.equal(value.steps[0].truncated, true)
  assert.match(value.steps[0].text, /chars omitted/)
  assert.ok(value.steps[0].text.length < 500)
})


test('a nested step carries its schema and logs the PTC start/settle pair', async t => {
  const { run, events, seen } = await harness(t)
  const { result, callId } = await run([
    { id: 'w', tool: 'write', arguments: { path: 'a.ts', content: 'x' } },
    { id: 'b', tool: 'bash', arguments: { command: 'echo ok' }, when: [{ step: 'w', ok: true }] },
  ], true)
  assert.equal(result.isError, false)
  // A composite dispatch must hand over the registered schema; the Auto preset's
  // reviewer refuses a nested call whose binding schema is absent.
  assert.deepEqual(seen.map(call => call.schema).sort(), ['bash', 'write'])
  assert.deepEqual(events.map(event => event.type), [
    'tool/ptc-dispatch-start',
    'tool/ptc-dispatch',
    'tool/ptc-dispatch-start',
    'tool/ptc-dispatch',
  ])
  const first = events[0].data
  assert.equal(first.name, 'write')
  assert.equal(first.parentCallId, callId)
  assert.equal(first.rootCallId, callId)
  assert.match(String(first.subCallId), /:chain:1$/)
  assert.deepEqual(first.arguments, { path: 'a.ts', content: 'x' })
  assert.deepEqual(events[1].data.content, [{ type: 'text', text: 'wrote a.ts\nx' }])
})

test('an unregistered tool fails the step without dispatching', async t => {
  const { run, seen } = await harness(t, { allowedTools: ['write', 'ghost'] })
  const { result } = await run([{ id: 'g', tool: 'ghost', arguments: {} }])
  assert.equal(result.isError, false)
  const value = result.value as { executed: number, stopped: { reason: string, detail: string }, steps: { ok: boolean, text: string }[] }
  assert.equal(value.executed, 1)
  assert.equal(value.steps[0].ok, false)
  assert.match(value.steps[0].text, /not registered/)
  assert.equal(value.stopped.reason, 'error')
  assert.equal(seen.length, 0)
})


test('a settled chain reports once to the accounting sink', async t => {
  const reports: ChainResultSummary[] = []
  const { run } = await harness(t, {}, summary => reports.push(summary))
  await run([
    { id: 'w', tool: 'write', arguments: { path: 'a', content: 'b' } },
    { id: 'b', tool: 'bash', arguments: { command: 'echo ok' } },
  ], true)
  assert.equal(reports.length, 1)
  assert.deepEqual(reports[0], { sessionId: 'session-fixture', executed: 2, saved: 1, tools: ['write', 'bash'] })
})
