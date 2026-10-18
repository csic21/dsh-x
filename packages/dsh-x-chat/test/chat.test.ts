import test from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmCallConfig, StreamChunk } from '@deepseek-ai/dsh-llm'
import { apply, inject, name } from '../src/index.ts'
import { LIMITS, resolveConfig, runChat } from '../src/chat.ts'
import type { ChatArgs, ChatConfig, ChatLlm } from '../src/chat.ts'
import { DshXChatError, ERROR_MESSAGES } from '../src/errors.ts'
import type { DshXChatErrorCode } from '../src/errors.ts'

const route = { provider: 'fixture', model: 'fixture-model' }
const text = (value: string): StreamChunk => ({ type: 'text-delta', index: 0, text: value })
const finish = (kind: string): StreamChunk => ({ type: 'finish', reason: { kind } }) as unknown as StreamChunk

interface RecordedCall {
  config: LlmCallConfig
  signal?: AbortSignal
  options?: GenerateOptions
}

function fixture(chunks: readonly StreamChunk[] = [text('你好'), finish('stop')]) {
  const calls: RecordedCall[] = []
  const llm: ChatLlm = { async prepareCall(config, signal) {
    calls.push({ config, signal })
    return { config, async *stream(options) { calls[0].options = options; yield* chunks } }
  } }
  return { llm, calls }
}

test('plugin registers official tool with minimal dependencies', () => {
  const registered: Array<{ name: string }> = []
  apply({ tools: { register: (tool: { name: string }) => { registered.push(tool) } }, llm: fixture().llm } as unknown as Context)
  assert.equal(name, 'dsh-x-chat')
  assert.deepEqual(inject, ['tools', 'llm'])
  assert.equal(registered.length, 1)
  assert.equal(registered[0].name, 'dsh_x_chat')
})

test('one-shot explicitly routes native LLM, supplies no tools or history', async () => {
  const { llm, calls } = fixture()
  const result = await runChat(llm, { ...route, prompt: '问题', context: '参考' })
  assert.deepEqual(result, { ...route, text: '你好', truncated: false })
  assert.equal(calls[0].config.maxTokens, 2048)
  assert.deepEqual(calls[0].options?.tools, [])
  assert.equal(calls[0].options?.messages.length, 1)
  assert.deepEqual(calls[0].options?.messages[0], { role: 'user', content: [{ type: 'text', text: JSON.stringify({ prompt: '问题', context: '参考' }) }] })
  assert.ok(calls[0].options?.signal instanceof AbortSignal)
})

test('config route and paired override; no silent provider fallback', async () => {
  const { llm, calls } = fixture()
  await runChat(llm, { prompt: 'hi' }, { ...route, maxOutputTokens: 100 })
  assert.equal(calls[0].config.maxTokens, 100)
  await assert.rejects(runChat(llm, { prompt: 'hi', provider: 'other' }, route), /同时/)
  await assert.rejects(runChat(llm, { prompt: 'hi' }), /同时/)
  const other = fixture()
  assert.equal((await runChat(other.llm, { prompt: 'hi', provider: 'other', model: 'other-model' }, route)).provider, 'other')
})

test('validates config and UTF-8 input before dispatch', async () => {
  for (const config of [{ timeoutMs: 0 }, { timeoutMs: 120001 }, { maxOutputTokens: 8193 }, { maxOutputTokens: 1.5 }, { apiKey: 'not-supported' }, { locale: 'en' }, { language: 'zh' }, { provider: 'x' }, null]) {
    assert.throws(() => resolveConfig(config as unknown as ChatConfig))
  }
  const { llm, calls } = fixture()
  for (const args of [{ prompt: '' }, { prompt: ' ' }, { prompt: 1 }, { prompt: '中'.repeat(6000) }, { prompt: 'ok', context: 'x'.repeat(LIMITS.contextBytes + 1) }]) {
    await assert.rejects(runChat(llm, { ...route, ...args } as unknown as ChatArgs))
  }
  assert.equal(calls.length, 0)
})

test('reasoning omitted and token-limit metadata does not rewrite the model answer', async () => {
  const { llm } = fixture([{ type: 'reasoning-delta', index: 1, text: 'private reasoning' }, text('回答'), finish('max-tokens')])
  const result = await runChat(llm, { ...route, prompt: 'hi' })
  assert.equal(result.truncated, true)
  assert.equal(result.text, '回答')
  assert.doesNotMatch(result.text, /private/)
})

test('model whitespace, prompt and context remain verbatim', async () => {
  const answer = '  Original answer 原文\n\n[回答达到输出 token 上限，内容可能不完整。]\n'
  const prompt = '  问题 Question\n'
  const context = '\nReference 原材料  '
  const { llm, calls } = fixture([text(answer), finish('max-tokens')])
  const result = await runChat(llm, { ...route, prompt, context })
  assert.equal(result.text, answer)
  assert.equal(result.truncated, true)
  assert.equal((calls[0].options?.messages[0].content[0] as { text: string }).text, JSON.stringify({ prompt, context }))
})

test('every owned error carries the official stable HarnessError identity', () => {
  for (const [code, message] of Object.entries(ERROR_MESSAGES) as Array<[DshXChatErrorCode, string]>) {
    const error = new DshXChatError(code)
    assert.ok(error instanceof HarnessError)
    assert.equal(error.name, 'DshXChatError')
    assert.equal(error.code, code)
    assert.equal(error.message, message)
  }
  assert.throws(() => new DshXChatError('unknown' as DshXChatErrorCode), /Unknown chat error code/)
})

test('validation errors use codes without interpolating input data', async () => {
  const cases: Array<[ChatArgs, DshXChatErrorCode]> = [
    [{ prompt: 'ok' }, 'DSH_X_CHAT_ROUTE'],
    [{ ...route, prompt: '' }, 'DSH_X_CHAT_PROMPT_TYPE'],
    [{ ...route, prompt: 'ok', context: 123 } as unknown as ChatArgs, 'DSH_X_CHAT_CONTEXT_TYPE'],
    [{ ...route, prompt: 'x'.repeat(LIMITS.promptBytes + 1) }, 'DSH_X_CHAT_PROMPT_LIMIT'],
    [{ ...route, prompt: 'ok', context: 'x'.repeat(LIMITS.contextBytes + 1) }, 'DSH_X_CHAT_CONTEXT_LIMIT'],
  ]
  for (const [args, code] of cases) {
    await assert.rejects(runChat(fixture().llm, args), error => (error as DshXChatError).code === code)
  }
})

test('rejects incomplete, empty, tool-call, error and malformed streams', async () => {
  for (const chunks of [
    [text('partial')], [finish('stop')], [text('ok'), finish('tool-calls')],
    [text('ok'), { type: 'finish', reason: { kind: 'error', failure: { message: 'SECRET' } } }],
    [{ type: 'tool-call-delta', index: 0, id: 't', argumentsDelta: '{}' }, finish('max-tokens')],
    [{ type: 'block-start', index: 0, blockType: 'tool-call' }, finish('stop')],
    [{ type: 'block-end', index: 0, block: { type: 'tool-call', name: 'exec', arguments: '{}' } }, finish('stop')],
    [text('ok'), finish('stop'), text('late')],
    [{ type: 'unknown' }],
  ] as unknown as StreamChunk[][]) {
    await assert.rejects(runChat(fixture(chunks).llm, { ...route, prompt: 'hi' }), error => !(error as Error).message.includes('SECRET'))
  }
})

test('response size cap aborts and closes stream', async () => {
  let closed = false
  let signal: AbortSignal | undefined
  const llm = { async prepareCall(config: LlmCallConfig, s: AbortSignal): Promise<{ readonly config: LlmCallConfig; stream(): AsyncIterable<StreamChunk> }> {
    signal = s; return { config, async *stream() {
      try { yield text('x'.repeat(LIMITS.streamBytes + 1)) } finally { closed = true }
    } }
  } }
  await assert.rejects(runChat(llm, { ...route, prompt: 'hi' }), /安全大小/)
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(signal)
  assert.equal(signal.aborted, true)
  assert.equal(closed, true)
})

test('pre-cancelled calls never dispatch', async () => {
  const { llm, calls } = fixture()
  const signal = AbortSignal.abort()
  await assert.rejects(runChat(llm, { ...route, prompt: 'hi' }, {}, signal))
  assert.equal(calls.length, 0)
})

test('timeout bounds uncooperative prepareCall and stream', async () => {
  const pending = new Promise<never>(() => {})
  for (const llm of [
    { prepareCall: () => pending },
    { prepareCall: async (config: LlmCallConfig) => ({ config, stream: () => ({ [Symbol.asyncIterator]() { return this }, next: () => pending }) }) },
  ] as unknown as ChatLlm[]) {
    await assert.rejects(runChat(llm, { ...route, prompt: 'hi' }, { timeoutMs: 15 }), /超时/)
  }
})

test('in-flight caller cancellation ends an uncooperative call', async () => {
  const controller = new AbortController()
  const result = runChat({ prepareCall: () => new Promise(() => {}) } as unknown as ChatLlm, { ...route, prompt: 'hi' }, {}, controller.signal)
  controller.abort()
  await assert.rejects(result, /取消/)
})

test('provider exception does not expose secrets', async () => {
  await assert.rejects(runChat({ prepareCall() { throw new Error('模型 Bearer SECRET') } } as unknown as ChatLlm, { ...route, prompt: 'hi' }), error => (error as Error).message.includes('调用失败') && !(error as Error).message.includes('SECRET'))
})
