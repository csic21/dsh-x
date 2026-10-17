import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import SubprocessLocal from '@deepseek-ai/dsh-subprocess-local'
import { runAcpPrompt } from '../packages/dsh-x-plan/src/acp.js'
import { collectEvidence } from '../packages/dsh-x-plan/src/collect.js'

test('real official subprocess provider completes ACP fixture and collects command output', async () => {
 const ctx=new Context()
 try {
  await ctx.plugin(SubprocessLocal)
  const result=await runAcpPrompt({spawn:spec=>ctx.subprocess.spawn(spec),argv:[process.execPath,fileURLToPath(new URL('./fixtures/acp-agent.mjs',import.meta.url))],cwd:process.cwd(),prompt:'fixture',timeoutMs:10000})
  assert.equal(result.ok,true)
  assert.match(result.text,/Fixture plan/)
  const evidence=await collectEvidence(spec=>ctx.subprocess.spawn(spec),{cwd:process.cwd(),commands:[`${process.execPath} --version`],signal:new AbortController().signal})
  assert.equal(evidence.runs[0].exitCode,0)
  assert.match(evidence.runs[0].output,/v\d+/)
 } finally { await ctx.fiber.dispose() }
})
