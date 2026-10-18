import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import SubprocessLocal from '@deepseek-ai/dsh-subprocess-local'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { preflightAcp, runAcpPrompt } from '../packages/dsh-x-plan/lib/acp.js'
import { captureBaseline } from '../packages/dsh-x-plan/lib/baseline.js'
import { assessEvidence, collectEvidence, enforceEvidenceVerdict } from '../packages/dsh-x-plan/lib/collect.js'
import { executeChecks } from '../packages/dsh-x-plan/lib/checks.js'

const onlyPosix = { skip: process.platform === 'win32' ? 'Structured bash fixture uses /bin/sh.' : false }

test('official subprocess provider preflights and runs a fixed mock ACP identity in safe mode', async t => {
  const h = await fixture(t)
  const preflight = await preflightAcp(h.acp)
  assert.equal(preflight.ok, true)
  assert.equal(preflight.modeId, 'read-only')
  assert.deepEqual(preflight.adapter, { executable: process.execPath, name: 'dsh-x-mock-acp-fixture', version: '1.0.0-fixture' })
  const result = await runAcpPrompt({ ...h.acp, expectedAdapter: preflight.adapter, prompt: 'Mock fixture planning request only.' })
  assert.equal(result.ok, true)
  assert.match(result.text, /Mock fixture plan only/)
  assert.match(result.text, /dsh-x-plan/)
  assert.deepEqual(h.trace().filter(entry => entry.role).map(entry => entry.role), ['planner'])
})

test('official subprocess rejects unsafe mock mode and changed identity before any model prompt', async t => {
  const h = await fixture(t)
  const preflight = await preflightAcp(h.acp)
  writeFileSync(h.versionFile, '2.0.0-changed-fixture')
  await assert.rejects(runAcpPrompt({ ...h.acp, expectedAdapter: preflight.adapter, prompt: 'Must not be sent.' }), error => error.code === 'DSH_X_PLAN_ACP_IDENTITY_CHANGED')
  writeFileSync(h.versionFile, '1.0.0-fixture')
  h.writeConfig({ noSafeMode: true })
  await assert.rejects(preflightAcp(h.acp), error => error.code === 'DSH_X_PLAN_READONLY_UNAVAILABLE')
  assert.equal(h.trace().filter(entry => entry.method === 'session/prompt').length, 0)
})

test('official runtime approval and subprocess records feed task-relative evidence without shell fallback', onlyPosix, async t => {
  const h = await fixture(t)
  const baseline = await captureBaseline(spec => h.ctx.subprocess.spawn(spec), { cwd: h.repo })
  assert.equal(baseline.complete, true)
  writeFileSync(path.join(h.repo, 'note.txt'), 'changed after plan\n')
  writeFileSync(path.join(h.repo, 'new.js'), 'export const fixture = true\n')
  await git(h.repo, ['add', '.'])
  await git(h.repo, ['commit', '-qm', 'mock task commit'])
  const checks = [{ id: 'node-version', command: 'node --version', required: true }]
  const executed = await h.execute(checks)
  assert.equal(executed.isError, false, JSON.stringify(executed))
  assert.equal(executed.value.quiescent, true)
  assert.equal(executed.value.runs[0].exitCode, 0)
  assert.match(executed.value.runs[0].output, /v\d+/)
  assert.equal(h.approvals.length, 1)
  assert.equal(h.starts.length, 1)
  assert.ok(h.starts[0].parent)
  const evidence = await collectEvidence(spec => h.ctx.subprocess.spawn(spec), { cwd: h.repo, baseline, commands: checks.map(check => check.command), runs: executed.value.runs })
  assert.equal(assessEvidence(evidence).verdict, 'ready', JSON.stringify(evidence.issues))
  assert.equal(evidence.status, '')
  assert.match(evidence.diff, /changed after plan/)
  assert.match(evidence.diff, /export const fixture/)
})

test('official runtime rejection prevents acceptance subprocess launch', onlyPosix, async t => {
  const h = await fixture(t)
  h.answer = 'rejected'
  const result = await h.execute([{ id: 'denied-check', command: 'touch must-not-run.txt', required: true }])
  assert.equal(result.isError, false, JSON.stringify(result))
  assert.equal(result.value.runs[0].unavailable, true)
  assert.equal(result.value.runs[0].exitCode, null)
  assert.equal(h.approvals.length, 1)
  assert.equal(h.starts.length, 0)
})

test('real nonzero and timed-out subprocess checks cannot become model pass and fully settle', onlyPosix, async t => {
  const h = await fixture(t)
  for (const [command, timeoutMs, timedOut] of [
    ['exit 7', 5_000, false],
    ['node -e "setInterval(() => {}, 1000)"', 80, true],
  ]) {
    const result = await h.execute([{ id: 'failure-check', command, required: true }], timeoutMs)
    assert.equal(result.isError, false, JSON.stringify(result))
    const run = result.value.runs[0]
    assert.equal(run.timedOut, timedOut)
    if (!timedOut) assert.equal(run.exitCode, 7)
    if (!timedOut) assert.equal(result.value.quiescent, true)
    // A cancelled runtime result may withhold canonical foreground output;
    // the collector still treats its observed timeout as a deterministic fail.
    assert.equal(enforceEvidenceVerdict('pass', { complete: true, issues: [], commands: [command], runs: [run] }).verdict, 'fail')
  }
  for (const handle of h.handles) assert.equal(await handle.waitForExit(AbortSignal.timeout(2_000)), true)
})

async function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'dsh-official-subprocess-fixture-'))
  const repo = path.join(root, 'repo'), bin = path.join(root, 'bin')
  mkdirSync(repo); mkdirSync(bin)
  const adapterFile = path.join(bin, 'mock-acp.mjs')
  copyFileSync(fileURLToPath(new URL('./fixtures/acp-agent.mjs', import.meta.url)), adapterFile)
  const traceFile = path.join(root, 'mock-acp-trace.jsonl'), versionFile = path.join(root, 'mock-acp-version.txt')
  writeFileSync(traceFile, ''); writeFileSync(versionFile, '1.0.0-fixture')
  const configFile = path.join(bin, 'acp-fixture-config.json')
  const writeConfig = extra => writeFileSync(configFile, JSON.stringify({ traceFile, versionFile, ...extra }))
  writeConfig({})
  await git(repo, ['init', '-q'])
  await git(repo, ['config', 'user.email', 'fixture@example.invalid'])
  await git(repo, ['config', 'user.name', 'Mock subprocess fixture'])
  writeFileSync(path.join(repo, 'note.txt'), 'original\n')
  await git(repo, ['add', '.'])
  await git(repo, ['commit', '-qm', 'fixture'])
  const ctx = new Context()
  t.after(async () => { await ctx.fiber.dispose(); rmSync(root, { recursive: true, force: true }) })
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(SubprocessLocal)
  const h = { ctx, root, repo, traceFile, versionFile, writeConfig, answer: 'allowed-once', approvals: [], starts: [], handles: [] }
  h.acp = { spawn: spec => ctx.subprocess.spawn(spec), argv: [process.execPath, adapterFile], cwd: repo, modeId: 'read-only', timeoutMs: 10_000 }
  h.trace = () => readFileSync(traceFile, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
  ctx.provide('approval', { request: async request => { h.approvals.push(request); return h.answer } })
  ctx.on('tools/pre-execute', async (exec, next) => exec.name === 'bash' ? { kind: 'ask', reason: 'Approve this test fixture command through the real runtime.' } : next())
  const stream = { type: 'object', additionalProperties: false, properties: { text: { type: 'string', required: true }, truncated: { type: 'boolean', required: true } } }
  ctx.tools.register(defineTool({
    name: 'bash', description: 'Mock structured bash tool, official local subprocess provider',
    parameters: { command: { type: 'string', required: true }, workdir: { type: 'string', required: true }, description: { type: 'string', required: true }, timeoutMs: { type: 'integer', required: true }, run_in_background: { type: 'boolean' } },
    output: { schema: { type: 'object', additionalProperties: false, properties: {
      kind: { type: 'string', const: 'foreground' }, cwd: { type: 'string' }, exitCode: { oneOf: [{ type: 'integer' }, { type: 'null' }] }, signal: { oneOf: [{ type: 'string' }, { type: 'null' }] }, timedOut: { type: 'boolean' }, aborted: { type: 'boolean' }, stdout: stream, stderr: stream,
    } }, render: (_args, value) => [{ type: 'text', text: value.stdout.text || `exit ${value.exitCode}` }] },
    execute: async (args, exec) => {
      h.starts.push({ parent: exec.parent, args })
      const child = ctx.subprocess.spawn({ argv: ['/bin/sh', '-c', args.command], cwd: args.workdir, stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' }, signal: exec.signal, graceMs: 100 })
      h.handles.push(child)
      const [stdout, stderr, result] = await Promise.all([streamText(child.stdout), streamText(child.stderr), child.done])
      return { kind: 'foreground', cwd: args.workdir, exitCode: result.exitCode ?? null, signal: result.signal ?? null, timedOut: false, aborted: exec.signal.aborted, stdout: { text: stdout, truncated: false }, stderr: { text: stderr, truncated: false } }
    },
  }))
  ctx.tools.register(defineTool({
    name: 'mock_acceptance_parent', description: 'Mock parent using real nested tool dispatch',
    parameters: { checks: { type: 'json', required: true }, timeoutMs: { type: 'integer', required: true } },
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: (args, exec) => executeChecks(ctx, exec, { cwd: repo, checks: args.checks, timeoutMs: args.timeoutMs }),
  }))
  h.execute = (checks, timeoutMs = 5_000) => ctx.tools.execute({ name: 'mock_acceptance_parent', arguments: { checks, timeoutMs }, callId: randomUUID(), signal: new AbortController().signal, agent: { id: 'mock-subprocess-session' } })
  return h
}
async function streamText(stream) { stream.setEncoding('utf8'); let text = ''; for await (const chunk of stream) text += chunk; return text }
function git(cwd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, stdio: 'ignore' })
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`git fixture failed: ${code}`)))
  })
}
