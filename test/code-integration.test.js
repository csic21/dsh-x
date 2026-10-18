import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import LlmRuntime, { LlmAdapter } from '@deepseek-ai/dsh-llm'
import SubprocessLocal from '@deepseek-ai/dsh-subprocess-local'
import * as code from '../packages/dsh-x-code/lib/index.js'
import { createCodeRoute } from '../packages/dsh-x-code/lib/routes.js'
import { createReviewStore } from '../packages/dsh-x-code/lib/store.js'

// Official Cordis, ToolRuntime, managed Git subprocess, durable stores and the
// native approval bridge are real. Only the model driver is synthetic: no
// external model, credentials, account or network calls occur.
async function harness(t, options = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'code-official-')), profile = mkdtempSync(path.join(tmpdir(), 'code-profile-'))
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' }).toString()
  git('init', '-q'); writeFileSync(path.join(root, 'app.js'), 'export const divide = (a, b) => a / b\n'); git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'initial')
  const ctx = new Context(), routes = []
  ctx.provide('connection', { fetch: { register: route => { routes.push(route); return () => {} } } })
  await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(SubprocessLocal)
  const agent = { id: 'code-session', session: { id: 'code-session', requestHeader: () => ({ config: { provider: 'code-fixture', model: 'code-fixture-model' } }) } }
  const approvals = [], llmCalls = []
  if (options.llm !== false) {
    await ctx.plugin(LlmRuntime)
    class FixtureLlm extends LlmAdapter {
      async *stream(input) {
        llmCalls.push(input)
        if (options.llmStream) { yield* options.llmStream(input); return }
        assert.deepEqual(input.tools, [])
        assert.equal(input.messages.length, 1)
        const prompt = input.messages[0].content[0].text
        const files = JSON.parse(prompt.split('SOURCE_DATA=')[1])
        const after = files[0].after
        const findings = after.includes('b === 0') ? [] : [{ path: files[0].path, startLine: 1, endLine: 1, severity: 'medium', title: 'Zero divisor', body: 'Zero gives Infinity.', evidence: 'a / b', trigger: 'b=0' }]
        yield { type: 'text-delta', index: 0, text: JSON.stringify({ version: 1, summary: 'Synthetic official DSH model snapshot review', findings, checks: [{ name: 'Tests', status: 'not_run', evidence: 'No tests executed.' }] }) }
        yield { type: 'finish', reason: { kind: 'stop' } }
      }
    }
    ctx.llm.registerAdapter(['code-fixture'], new FixtureLlm())
  }
  let cwd = root, policyRoot = root
  ctx.provide('profileContext', { dir: profile })
  ctx.provide('workingDirectory', { ensure: async () => cwd, get: () => cwd })
  ctx.provide('sessions', { get: id => id === agent.session.id ? agent.session : null })
  ctx.provide('sandboxPolicy', { resolve: () => ({ mode: 'workspace-write', workspaceRoot: policyRoot, sessionId: agent.session.id }) })
  ctx.provide('approval', { request: async request => { approvals.push(request); return options.approve ? options.approve(request, approvals.length, root) : 'allowed-once' } })
  const codeFiber = await ctx.plugin(code)
  const invoke = (name, args = {}, signal = new AbortController().signal) => ctx.tools.execute({ name, arguments: args, agent, signal, callId: crypto.randomUUID() })
  const inspect = () => invoke('dsh_x_code_inspect')
  const argsOf = snapshot => ({ scope: snapshot.scope, workspaceId: snapshot.workspace.id, mode: snapshot.workspace.mode, paths: ['app.js'], runtime: 'dsh' })
  t.after(async () => { await ctx.fiber.dispose(); rmSync(root, { recursive: true, force: true }); rmSync(profile, { recursive: true, force: true }) })
  return { root, profile, ctx, agent, invoke, inspect, argsOf, approvals, llmCalls, git, codeFiber, routes, setCwd: value => { cwd = value; policyRoot = value }, setPolicyRoot: value => { policyRoot = value } }
}

test('official DSH review browses, reviews, preserves immutable evidence and verifies a fresh worktree re-review', async t => {
  const h = await harness(t), initial = await h.inspect()
  assert.equal(initial.isError, false, JSON.stringify(initial)); assert.equal(initial.value.files.length, 1)
  assert.equal(initial.value.dshAvailable, true); assert.deepEqual(initial.value.dshModel, { provider: 'code-fixture', model: 'code-fixture-model' }); assert.equal(h.ctx.tools.get('dsh_x_code_repair'), undefined)
  const first = await h.invoke('dsh_x_code_review', h.argsOf(initial.value))
  assert.equal(first.isError, false, JSON.stringify(first)); assert.equal(first.value.review.state, 'completed', JSON.stringify(first.value.review))
  assert.equal(first.value.review.findings.length, 1); assert.equal(first.value.review.provider, 'code-fixture'); assert.equal(h.llmCalls.length, 1)
  assert.match(h.approvals[0].reason, /provider charges/); assert.match(h.approvals[0].reason, /app\.js/)
  const storedRequest = createReviewStore(h.profile).read(h.agent.session.id).reviews.at(-1).request
  assert.deepEqual(storedRequest.messages, h.llmCalls[0].messages); assert.equal(storedRequest.system, h.llmCalls[0].system); assert.deepEqual(storedRequest.tools, [])
  assert.equal(storedRequest.sessionId, h.agent.session.id)
  const review = first.value.review, old = await h.invoke('dsh_x_code_file', { scope: first.value.scope, reviewId: review.id, path: 'app.js' })
  assert.equal(old.value.immutable, true); assert.match(old.value.text, /a \/ b/)
  writeFileSync(path.join(h.root, 'app.js'), 'export const divide = (a, b) => b === 0 ? null : a / b\n')
  const after = await h.inspect(), verified = await h.invoke('dsh_x_code_review', { ...h.argsOf(after.value), previousReviewId: review.id })
  assert.equal(verified.isError, false, JSON.stringify(verified)); assert.equal(verified.value.review.findings.length, 0)
  assert.equal(verified.value.review.verification.result, 'no_findings_in_scope'); assert.equal(verified.value.review.verification.testsVerified, false)
  assert.equal(verified.value.history[0].findings, 1)
  const immutable = await h.invoke('dsh_x_code_file', { scope: first.value.scope, reviewId: review.id, path: 'app.js' })
  assert.equal(immutable.value.text, old.value.text); assert.doesNotMatch(immutable.value.text, /b === 0/)
})

test('native runtimes, model overrides and the retired repair tool are refused without dispatch', async t => {
  const h = await harness(t), initial = await h.inspect()
  const native = await h.invoke('dsh_x_code_review', { ...h.argsOf(initial.value), runtime: 'codex' })
  assert.equal(native.isError, true); assert.equal(native.error.info.code, 'CODE_RUNTIME')
  const override = await h.invoke('dsh_x_code_review', { ...h.argsOf(initial.value), model: 'other-model' })
  assert.equal(override.isError, true); assert.equal(override.error.info.code, 'CODE_MODEL')
  assert.equal(h.llmCalls.length, 0); assert.equal(h.approvals.length, 0)
})

test('review approval denial keeps a blocked record and sends no source', async t => {
  const h = await harness(t, { approve: async () => 'rejected' }), initial = await h.inspect()
  const result = await h.invoke('dsh_x_code_review', h.argsOf(initial.value))
  assert.equal(result.isError, true); assert.equal(result.error.info.code, 'CODE_APPROVAL')
  assert.equal(h.llmCalls.length, 0); assert.equal((await h.inspect()).value.review.state, 'blocked')
})

test('edited source invalidates the selected workspace revision before review', async t => {
  const h = await harness(t), initial = await h.inspect()
  writeFileSync(path.join(h.root, 'app.js'), 'export const divide = (a, b) => a / b + 1\n')
  const stale = await h.invoke('dsh_x_code_review', h.argsOf(initial.value))
  assert.equal(stale.isError, true); assert.equal(stale.error.info.code, 'CODE_STALE'); assert.equal(h.llmCalls.length, 0)
})

test('malformed model findings fail the review instead of claiming no issues', async t => {
  const h = await harness(t, { llmStream: async function* () { yield { type: 'text-delta', index: 0, text: 'Looks good, all tests pass!' }; yield { type: 'finish', reason: { kind: 'stop' } } } }), initial = await h.inspect()
  const result = await h.invoke('dsh_x_code_review', h.argsOf(initial.value))
  assert.equal(result.isError, true); assert.equal(result.error.info.code, 'CODE_RESULT')
  const last = await h.inspect(); assert.equal(last.value.review.state, 'failed'); assert.deepEqual(last.value.review.findings, [])
})

test('RPC accepts bounded typed envelopes and rejects arbitrary fields', async () => {
  const route = createCodeRoute('code/snapshot', async payload => ({ sessionId: payload.sessionId }), ['sessionId'])
  const request = payload => new Request('http://localhost/api/code/snapshot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', method: 'code/snapshot', rpcId: 'one', payload }) })
  assert.equal((await route.fetch(request({ sessionId: 'one', cwd: '/etc' }))).status, 400)
  assert.equal((await route.fetch(request({ sessionId: 'one' }))).status, 200)
  assert.equal((await route.fetch(request({ sessionId: '字'.repeat(3000) }))).status, 413)
  assert.equal((await route.fetch(new Request('http://localhost', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' }))).status, 415)
})

test('historical evidence cannot be rebound to another repository or escape the host boundary', async t => {
  const h = await harness(t), initial = await h.inspect(), reviewed = await h.invoke('dsh_x_code_review', h.argsOf(initial.value)), old = reviewed.value.review
  const detailRoute = h.routes.find(route => route.path === '/api/code/review')
  const detail = async () => (await detailRoute.fetch(new Request('http://localhost/api/code/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: 'history', method: 'code/review', payload: { sessionId: h.agent.session.id, scope: reviewed.value.scope, reviewId: old.id } }) }))).json()
  const found = (await detail()).result.value; assert.equal(found.findings.length, 1); assert.equal(found.isLatest, true); assert.equal(found.request, undefined); assert.equal(found.snapshot, undefined)
  const other = await harness(t); h.setCwd(other.root)
  const switched = await h.inspect(); assert.equal(switched.value.review, null); assert.deepEqual(switched.value.history, [])
  const cross = await h.invoke('dsh_x_code_review', { ...h.argsOf(switched.value), previousReviewId: old.id }); assert.equal(cross.error.info.code, 'CODE_VERIFY')
  assert.equal((await detail()).result.error.code, 'CODE_BINDING')
  const source = await h.invoke('dsh_x_code_file', { scope: reviewed.value.scope, reviewId: old.id, path: 'app.js' }); assert.equal(source.error.info.code, 'CODE_BINDING')
  h.setCwd(h.root); h.setPolicyRoot(other.root); assert.equal((await detail()).result.error.code, 'CODE_BOUNDARY')
})
