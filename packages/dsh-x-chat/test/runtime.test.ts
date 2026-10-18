import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import LlmRuntime, { LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import * as plugin from '../src/index.ts'
import { chatViewModel } from '../src/client/model.ts'

test('official ToolRuntime preserves error identity and presentation metadata without locale-dependent requests', async () => {
  const ctx = new Context()
  const modelText = '  Provider 原文\n'
  const requests: GenerateOptions[] = []
  let failing = false
  class FixtureAdapter extends LlmAdapter {
    async *stream(options: GenerateOptions): AsyncGenerator<StreamChunk> {
      requests.push(options)
      if (failing) throw new Error('Bearer PRIVATE_PROVIDER_DETAILS')
      yield { type: 'text-delta', index: 0, text: modelText }
      yield { type: 'finish', reason: { kind: 'max-tokens' } }
    }
  }
  const invoke = (arguments_: Record<string, unknown>) => ctx.tools.execute({
    name: 'dsh_x_chat', arguments: arguments_, callId: ToolCallId(crypto.randomUUID()), signal: new AbortController().signal,
  })
  try {
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(LlmRuntime)
    ctx.llm.registerAdapter(['fixture'], new FixtureAdapter())
    await ctx.plugin(plugin)
    const args = { provider: 'fixture', model: 'fixture-model', prompt: '  问题\n', context: '原文  ' }
    const success = await invoke(args)
    assert.equal(success.isError, false)
    assert.equal((success.value as { text: string }).text, modelText)
    assert.equal((success.content[0] as { text: string }).text, modelText)
    assert.equal((success.content[1] as { text: string }).text, '[回答达到输出 token 上限，内容可能不完整。]')
    const meta = success.meta as Record<string, unknown>
    assert.equal(meta.kind, 'dsh-x-chat')
    assert.equal(meta.version, 1)
    assert.equal(meta.answerBlocks, 1)
    assert.equal(meta.truncated, true)
    const view = chatViewModel('result', { ...success, args: { text: (key: string) => (args as Record<string, string>)[key] } })
    assert.equal(view.text, modelText)
    assert.equal(view.truncated, true)
    assert.equal(view.provider, 'fixture')
    assert.equal((requests[0].messages[0].content[0] as { text: string }).text, JSON.stringify({ prompt: args.prompt, context: args.context }))
    assert.deepEqual(requests[0].tools, [])
    const validation = await invoke({ ...args, prompt: '' })
    assert.equal(validation.isError, true)
    assert.deepEqual(validation.error?.info, { name: 'DshXChatError', code: 'DSH_X_CHAT_PROMPT_TYPE' })
    failing = true
    const failed = await invoke(args)
    assert.equal(failed.isError, true)
    // The official LLM layer normalizes adapter exceptions to an error finish.
    assert.deepEqual(failed.error?.info, { name: 'DshXChatError', code: 'DSH_X_CHAT_FINISH' })
    assert.doesNotMatch(JSON.stringify(failed), /PRIVATE_PROVIDER_DETAILS/)
  } finally {
    await ctx.fiber.dispose()
  }
})
