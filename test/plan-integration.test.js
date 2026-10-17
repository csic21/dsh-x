import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { copyFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SubprocessLocal from '@deepseek-ai/dsh-subprocess-local'
import * as plan from '../packages/dsh-x-plan/index.js'
import { captureBaseline } from '../packages/dsh-x-plan/src/baseline.js'
import { parseContract } from '../packages/dsh-x-plan/src/contract.js'
import { readApproved, readWorkflow, sessionPlansDir, taskLockState, writeNewPlan } from '../packages/dsh-x-plan/src/store.js'

// These tests use the real Cordis policy pipeline and official local subprocess
// provider. ACP and the structured bash tool are explicitly labelled fixtures;
// no real adapter account, model request, package install, or remote is used.
const onlyPosix = { skip: process.platform === 'win32' ? 'Executable mock ACP fixture currently uses a POSIX shebang.' : false }

test('real ToolRuntime plans, rejects unapproved edits, approves exact scope and completes review', onlyPosix, async t => {
  const h = await harness(t)
  const planned = await h.invoke('dsh_x_plan', { goal: 'Update the fixture note', planner: 'codex', reviewer: 'claude', context: 'note.txt exists. Run node --version.', language: 'en' })
  assert.equal(planned.isError, false, show(planned))
  assert.equal(planned.meta.workflowState, 'draft')
  assert.match(planned.meta.body, /Mock fixture plan/)
  assert.equal((await h.invoke('write', { file_path: 'note.txt', content: 'blocked' })).isError, true)
  assert.equal(readFileSync(path.join(h.repo, 'note.txt'), 'utf8'), 'original\n')
  assert.equal((await h.invoke('dsh_x_approve_plan')).error.info.code, 'DSH_X_PLAN_APPROVAL_UNAVAILABLE')
  h.installApproval(() => 'rejected')
  assert.equal((await h.invoke('dsh_x_approve_plan')).error.info.code, 'DSH_X_PLAN_APPROVAL_DENIED')
  h.answer = () => 'allowed-once'
  const approved = await h.invoke('dsh_x_approve_plan')
  assert.equal(approved.isError, false, show(approved))
  assert.equal(approved.meta.workflowState, 'approved')
  assert.equal(approved.meta.operation, 'approve')
  assert.deepEqual(Object.keys(h.requests.at(-1).displayReason).sort(), ['en', 'zh'])
  assert.match(h.requests.at(-1).displayReason.en, /round 1/i)
  assert.equal((await h.invoke('write', { file_path: 'outside.txt', content: 'blocked' })).isError, true)
  assert.equal(existsSync(path.join(h.repo, 'outside.txt')), false)
  assert.equal((await h.invoke('write', { file_path: 'note.txt', content: 'approved edit\n' })).isError, false)
  assert.equal(readWorkflow(h.dir, 1).state, 'executing')
  const review = await h.invoke('dsh_x_review')
  assert.equal(review.isError, false, show(review))
  assert.equal(review.meta.verdict, 'pass', show(review))
  assert.equal(review.meta.workflowState, 'completed')
  assert.equal(h.trace().filter(entry => entry.role === 'reviewer').length, 1)
  assert.ok(h.executed.some(entry => entry.name === 'bash' && entry.parent !== undefined))
  assert.equal(taskLockState(h.dir), null)
  assert.ok(JSON.stringify((await h.ctx.systemPrompt.assemble()).sections).includes('dsh_x_plan'))
})

test('official approval result cannot authorize a draft edited while the prompt is open', onlyPosix, async t => {
  const h = await harness(t)
  await h.draft('node --version')
  h.installApproval(() => {
    writeFileSync(path.join(h.dir, 'plan-1.md'), `${h.planText}\nChanged after display.\n`)
    return 'allowed-once'
  })
  const result = await h.invoke('dsh_x_approve_plan')
  assert.equal(result.isError, true)
  assert.equal(result.error.info.code, 'DSH_X_PLAN_DRAFT_CHANGED')
  assert.throws(() => readApproved(h.dir, 1))
  assert.equal((await h.invoke('write', { file_path: 'note.txt', content: 'blocked' })).isError, true)
  assert.equal(taskLockState(h.dir), null)
})

test('workspace mutation during approval is rejected instead of refreshing the task baseline', onlyPosix, async t => {
  const h = await harness(t)
  await h.draft('node --version')
  h.installApproval(() => {
    writeFileSync(path.join(h.repo, 'note.txt'), 'changed during approval\n')
    return 'allowed-once'
  })
  const result = await h.invoke('dsh_x_approve_plan')
  assert.equal(result.isError, true)
  assert.equal(result.error.info.code, 'DSH_X_PLAN_APPROVAL_STALE')
  assert.throws(() => readApproved(h.dir, 1))
  assert.equal(readWorkflow(h.dir, 1).state, 'draft')
})

test('real exit 7 defeats the mock model pass and two failures stop execution and replanning', onlyPosix, async t => {
  const h = await harness(t)
  await h.draft('exit 7')
  h.installApproval(() => 'allowed-once')
  assert.equal((await h.invoke('dsh_x_approve_plan')).isError, false)
  const before = h.trace().filter(entry => entry.role === 'reviewer').length
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const review = await h.invoke('dsh_x_review')
    assert.equal(review.isError, false, show(review))
    assert.equal(review.meta.verdict, 'fail', show(review))
    assert.equal(review.meta.attempt, attempt)
    assert.match(review.meta.text, /failed \(7\)/)
  }
  assert.equal(h.trace().filter(entry => entry.role === 'reviewer').length, before, 'deterministic failure must not invoke model review')
  assert.equal(readWorkflow(h.dir, 1).state, 'needs_user')
  assert.equal((await h.invoke('dsh_x_review')).isError, true)
  assert.equal((await h.invoke('write', { file_path: 'note.txt', content: 'blocked' })).isError, true)
  const bypass = await h.invoke('dsh_x_plan', { goal: 'Bypass stopped task', planner: 'codex' })
  assert.equal(bypass.error.info.code, 'DSH_X_PLAN_DRAFT_EXISTS')
  const resumed = await h.invoke('dsh_x_approve_plan')
  assert.equal(resumed.isError, false, show(resumed))
  assert.ok(resumed.meta.revision > 1)
  assert.equal(readWorkflow(h.dir, 1).state, 'approved')
})

test('mandatory truncated output yields inconclusive and no model review', onlyPosix, async t => {
  const h = await harness(t, { truncated: true })
  await h.draft('node --version')
  h.installApproval(() => 'allowed-once')
  assert.equal((await h.invoke('dsh_x_approve_plan')).isError, false)
  const review = await h.invoke('dsh_x_review')
  assert.equal(review.isError, false, show(review))
  assert.equal(review.meta.verdict, 'inconclusive')
  assert.equal(review.meta.workflowState, 'needs_user')
  assert.equal(h.trace().filter(entry => entry.role === 'reviewer').length, 0)
  assert.equal(taskLockState(h.dir), null)
})

test('missing structured bash tool remains inconclusive without raw shell fallback', onlyPosix, async t => {
  const h = await harness(t, { bash: false })
  await h.draft('node --version')
  h.installApproval(() => 'allowed-once')
  assert.equal((await h.invoke('dsh_x_approve_plan')).isError, false)
  const review = await h.invoke('dsh_x_review')
  assert.equal(review.isError, false, show(review))
  assert.equal(review.meta.verdict, 'inconclusive')
  assert.equal(h.executed.filter(entry => entry.name === 'bash').length, 0)
  assert.equal(h.trace().filter(entry => entry.role === 'reviewer').length, 0)
})

test('approved task refuses cwd drift and changed adapter identity before checks', onlyPosix, async t => {
  const h = await harness(t)
  await h.draft('node --version')
  h.installApproval(() => 'allowed-once')
  assert.equal((await h.invoke('dsh_x_approve_plan')).isError, false)
  mkdirSync(path.join(h.repo, 'nested'))
  h.cwd = path.join(h.repo, 'nested')
  assert.equal((await h.invoke('write', { file_path: '../note.txt', content: 'blocked' })).isError, true)
  assert.equal((await h.invoke('dsh_x_review')).isError, true)
  h.cwd = h.repo
  writeFileSync(h.versionFile, '2.0.0-changed-fixture')
  const changed = await h.invoke('dsh_x_review')
  assert.equal(changed.isError, true)
  assert.equal(changed.error.info.code, 'DSH_X_PLAN_REVIEW_PREFLIGHT')
  assert.equal(h.executed.filter(entry => entry.name === 'bash').length, 0)
})

test('host policy denial stays authoritative after plan approval', onlyPosix, async t => {
  const h = await harness(t)
  await h.draft('node --version')
  h.installApproval(() => 'allowed-once')
  assert.equal((await h.invoke('dsh_x_approve_plan')).isError, false)
  h.ctx.on('tools/pre-execute', async (exec, next) => exec.name === 'write' ? { kind: 'deny', reason: 'Fixture host policy denies writes.' } : next())
  const result = await h.invoke('write', { file_path: 'note.txt', content: 'blocked by host' })
  assert.equal(result.isError, true)
  assert.equal(readFileSync(path.join(h.repo, 'note.txt'), 'utf8'), 'original\n')
})

test('ordinary shell execution still requires fresh command-specific official approval', onlyPosix, async t => {
  const h = await harness(t)
  await h.draft('node --version')
  h.installApproval(() => 'allowed-once')
  assert.equal((await h.invoke('dsh_x_approve_plan')).isError, false)
  h.answer = request => request.toolName === 'bash' ? 'rejected' : 'allowed-once'
  const args = { command: 'printf fixture-shell', workdir: h.repo, description: 'Mock shell tool', timeoutMs: 10_000 }
  assert.equal((await h.invoke('bash', args)).isError, true)
  assert.equal(h.executed.filter(entry => entry.name === 'bash').length, 0)
  h.answer = () => 'allowed-once'
  const allowed = await h.invoke('bash', args)
  assert.equal(allowed.isError, false, show(allowed))
  assert.equal(h.requests.filter(request => request.toolName === 'bash').length, 2)
})

test('rejected edited revision cannot skip original baseline',onlyPosix,async t=>{
 const h=await harness(t);await h.draft('node --version');
 writeFileSync(path.join(h.dir,'plan-1.md'),h.planText+'\nChanged before requesting approval.\n');
 h.installApproval(()=> 'rejected');
 const denied=await h.invoke('dsh_x_approve_plan');assert.equal(denied.error.info.code,'DSH_X_PLAN_APPROVAL_DENIED');
 const state=readWorkflow(h.dir,1);assert.ok(state.revision>1);assert.equal(state.everApproved,false);
 writeFileSync(path.join(h.repo,'note.txt'),'workspace drift after rejected revision\n');h.answer=()=> 'allowed-once';
 const stale=await h.invoke('dsh_x_approve_plan');assert.equal(stale.error.info.code,'DSH_X_PLAN_BASELINE_CHANGED');
 assert.equal(h.requests.length,1);assert.throws(()=>readApproved(h.dir,1));
});

test('planning cannot overlap an earlier no-plan write',onlyPosix,async t=>{
 let release,enter;const entered=new Promise(r=>enter=r),hold=new Promise(r=>release=r);
 const h=await harness(t,{beforeWrite:async()=>{enter();await hold}});
 const pending=h.invoke('write',{file_path:'note.txt',content:'earlier write\n'});await entered;
 try{const blocked=await h.invoke('dsh_x_plan',{goal:'Fixture planning',planner:'codex',reviewer:'claude'});assert.equal(blocked.error.info.code,'DSH_X_PLAN_TASK_BUSY');assert.equal(h.trace().length,0);}
 finally{release();assert.equal((await pending).isError,false)}
 const plan=await h.invoke('dsh_x_plan',{goal:'Fixture planning',planner:'codex',reviewer:'claude'});assert.equal(plan.isError,false,show(plan));
});

test('review cannot overlap an approved scoped write',onlyPosix,async t=>{
 let release,enter;const entered=new Promise(r=>enter=r),hold=new Promise(r=>release=r);
 const h=await harness(t,{beforeWrite:async()=>{enter();await hold}});await h.draft('node --version');h.installApproval(()=> 'allowed-once');assert.equal((await h.invoke('dsh_x_approve_plan')).isError,false);
 const pending=h.invoke('write',{file_path:'note.txt',content:'in flight approved write\n'});await entered;
 try{const blocked=await h.invoke('dsh_x_review');assert.equal(blocked.error.info.code,'DSH_X_PLAN_TASK_BUSY');assert.equal(h.trace().length,0);assert.ok(taskLockState(h.dir));}
 finally{release();assert.equal((await pending).isError,false)}
 assert.equal(taskLockState(h.dir),null);const review=await h.invoke('dsh_x_review');assert.equal(review.meta.verdict,'pass',show(review));
});

test('uncertain ACP cleanup retains fence before any draft exists',onlyPosix,async t=>{
 const h=await harness(t,{acpCleanupFailure:true});const result=await h.invoke('dsh_x_plan',{goal:'Fixture planning',planner:'codex',reviewer:'claude'});
 assert.equal(result.error.info.code,'DSH_X_PLAN_ACP_CLEANUP');
 const lock=taskLockState(h.dir);assert.equal(lock.retained,true);assert.equal(lock.reason,'acp_cleanup_unconfirmed');
 assert.equal((await h.invoke('write',{file_path:'note.txt',content:'blocked'})).isError,true);
 assert.equal((await h.invoke('dsh_x_plan',{goal:'Cannot replace running fixture',planner:'codex'})).error.info.code,'DSH_X_PLAN_TASK_BUSY');
 assert.equal(h.trace().filter(e=>e.method==='session/prompt').length,0);
});

test('non-descendant HEAD at the approved directory blocks mutation before writing', onlyPosix, async t => {
  const h = await harness(t)
  await h.draft('node --version')
  h.installApproval(() => 'allowed-once')
  assert.equal((await h.invoke('dsh_x_approve_plan')).isError, false)
  await git(h.repo, ['checkout', '--orphan', 'replacement-root'])
  await git(h.repo, ['commit', '-qm', 'unrelated root after plan approval'])
  const attempt = await h.invoke('write', { file_path: 'note.txt', content: 'must never overwrite unrelated branch\n' })
  assert.equal(attempt.isError, true, show(attempt))
  assert.equal(readFileSync(path.join(h.repo, 'note.txt'), 'utf8'), 'original\n')
  assert.equal(h.executed.filter(entry => entry.name === 'write').length, 0)
})

test('same-path Git directory replacement blocks mutation before writing', onlyPosix, async t => {
  const h = await harness(t)
  await h.draft('node --version')
  h.installApproval(() => 'allowed-once')
  assert.equal((await h.invoke('dsh_x_approve_plan')).isError, false)
  const { renameSync } = await import('node:fs')
  renameSync(path.join(h.repo, '.git'), path.join(h.root, 'original-fixture-git'))
  await git(h.repo, ['init', '-q'])
  await git(h.repo, ['config', 'user.email', 'fixture@example.invalid'])
  await git(h.repo, ['config', 'user.name', 'Replacement fixture'])
  await git(h.repo, ['add', '.'])
  await git(h.repo, ['commit', '-qm', 'unrelated replacement repository'])
  const attempt = await h.invoke('write', { file_path: 'note.txt', content: 'must never overwrite replacement repository\n' })
  assert.equal(attempt.isError, true, show(attempt))
  assert.equal(readFileSync(path.join(h.repo, 'note.txt'), 'utf8'), 'original\n')
  assert.equal(h.executed.filter(entry => entry.name === 'write').length, 0)
})

test('a descendant task commit still allows later scoped mutation', onlyPosix, async t => {
  const h = await harness(t)
  await h.draft('node --version')
  h.installApproval(() => 'allowed-once')
  assert.equal((await h.invoke('dsh_x_approve_plan')).isError, false)
  writeFileSync(path.join(h.repo, 'note.txt'), 'first scoped implementation\n')
  await git(h.repo, ['add', 'note.txt'])
  await git(h.repo, ['commit', '-qm', 'task descendant commit'])
  const attempt = await h.invoke('write', { file_path: 'note.txt', content: 'second scoped implementation\n' })
  assert.equal(attempt.isError, false, show(attempt))
  assert.equal(readFileSync(path.join(h.repo, 'note.txt'), 'utf8'), 'second scoped implementation\n')
})

test('review on non-descendant history never dispatches acceptance commands', onlyPosix, async t => {
  const h = await harness(t)
  await h.draft('node --version')
  h.installApproval(() => 'allowed-once')
  assert.equal((await h.invoke('dsh_x_approve_plan')).isError, false)
  await git(h.repo, ['checkout', '--orphan', 'review-unrelated-root'])
  await git(h.repo, ['commit', '-qm', 'unrelated root before review'])
  const attempt = await h.invoke('dsh_x_review')
  assert.equal(attempt.isError, true, show(attempt))
  assert.equal(h.executed.filter(entry => entry.name === 'bash').length, 0)
})

test('a history switch during acceptance approval prevents command dispatch', onlyPosix, async t => {
  const h = await harness(t)
  await h.draft('node --version')
  h.installApproval(() => 'allowed-once')
  assert.equal((await h.invoke('dsh_x_approve_plan')).isError, false)
  h.answer = async request => {
    if (request.toolName === 'dsh_x_review') {
      await git(h.repo, ['checkout', '--orphan', 'during-review-approval'])
      await git(h.repo, ['commit', '-qm', 'unrelated root while approval waits'])
    }
    return 'allowed-once'
  }
  const attempt = await h.invoke('dsh_x_review')
  assert.ok(attempt.isError || attempt.meta.verdict === 'inconclusive', show(attempt))
  assert.equal(h.executed.filter(entry => entry.name === 'bash').length, 0)
})

test('unrelated history cannot be reapproved from needs_user', onlyPosix, async t => {
  const h = await harness(t)
  await h.draft('node --version')
  h.installApproval(() => 'allowed-once')
  assert.equal((await h.invoke('dsh_x_approve_plan')).isError, false)
  const { transitionWorkflow } = await import('../packages/dsh-x-plan/src/store.js')
  transitionWorkflow(h.dir, 1, 'needs_user')
  await git(h.repo, ['checkout', '--orphan', 'reapproval-unrelated-root'])
  await git(h.repo, ['commit', '-qm', 'unrelated root before reapproval'])
  const attempt = await h.invoke('dsh_x_approve_plan')
  assert.equal(attempt.isError, true, show(attempt))
  assert.equal(h.requests.length, 1)
})

test('a history switch after the first check prevents the next acceptance command', onlyPosix, async t => {
  const h = await harness(t)
  await h.draft('node --version')
  const manifest = parseContract(h.planText)
  manifest.checks.push({ id: 'second-check', command: 'printf second-check', required: true })
  h.planText = 'Two mock checks\n```dsh-x-plan\n' + JSON.stringify(manifest) + '\n```'
  writeFileSync(path.join(h.dir, 'plan-1.md'), h.planText)
  h.installApproval(() => 'allowed-once')
  assert.equal((await h.invoke('dsh_x_approve_plan')).isError, false)
  let switched = false
  h.ctx.on('tools/execute', async (exec, next) => {
    const result = await next()
    if (exec.name === 'bash' && !switched) {
      switched = true
      await git(h.repo, ['checkout', '--orphan', 'between-checks'])
      await git(h.repo, ['commit', '-qm', 'unrelated root after first check'])
    }
    return result
  })
  const attempt = await h.invoke('dsh_x_review')
  assert.ok(attempt.isError || attempt.meta.verdict === 'inconclusive', show(attempt))
  assert.equal(h.executed.filter(entry => entry.name === 'bash').length, 1)
})

async function harness(t, options = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'dsh-plan-runtime-fixture-'))
  const repo = path.join(root, 'repo'), home = path.join(root, 'home'), bin = path.join(root, 'bin')
  for (const dir of [repo, home, bin]) mkdirSync(dir)
  const executable = path.join(bin, 'mock-acp-fixture.mjs')
  copyFileSync(fileURLToPath(new URL('./fixtures/acp-agent.mjs', import.meta.url)), executable)
  chmodSync(executable, 0o755)
  await git(repo, ['init', '-q'])
  await git(repo, ['config', 'user.email', 'fixture@example.invalid'])
  await git(repo, ['config', 'user.name', 'Mock integration fixture'])
  writeFileSync(path.join(repo, 'note.txt'), 'original\n')
  await git(repo, ['add', '.'])
  await git(repo, ['commit', '-qm', 'fixture'])
  const versionFile = path.join(home, 'mock-acp-version.txt')
  writeFileSync(versionFile, '1.0.0-fixture')
  const env = { DSH_X_TEST_ACP_VERSION_FILE: versionFile, DSH_HOME: home, DSH_X_ACP_CODEX: executable, DSH_X_ACP_CLAUDE: executable, DSH_X_TEST_ACP_TRACE: path.join(home, 'mock-acp-trace.jsonl'), DSH_X_TEST_ACP_VERSION: '1.0.0-fixture', DSH_X_TEST_CHECK_COMMAND: 'node --version', DSH_X_TEST_ACP_NO_SAFE_MODE: undefined }
  writeFileSync(path.join(bin, 'acp-fixture-config.json'), JSON.stringify({ traceFile: env.DSH_X_TEST_ACP_TRACE, versionFile, checkCommand: 'node --version' }))
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]))
  for (const [key, value] of Object.entries(env)) value === undefined ? delete process.env[key] : process.env[key] = value
  const ctx = new Context()
  t.after(async () => {
    await ctx.fiber.dispose()
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value
    rmSync(root, { recursive: true, force: true })
  })
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(SubprocessLocal)
  if (options.acpCleanupFailure) {
    const actualSpawn = ctx.subprocess.spawn.bind(ctx.subprocess)
    ctx.subprocess.spawn = spec => {
      const child = actualSpawn(spec)
      if (spec.argv[0] !== executable) return child
      // The real child is drained, but this injected fault withholds proof of
      // cleanup to test the plugin's retained-lock response safely.
      return { stdin: child.stdin, stdout: child.stdout, stderr: child.stderr, done: child.done, terminate: () => child.terminate(), waitForExit: async () => { await child.waitForExit(); return false } }
    }
  }
  const agent = { id: 'mock-integration-session', session: { id: 'mock-integration-session' } }
  const h = { ctx, root, repo, home, versionFile, cwd: repo, agent, dir: sessionPlansDir(home, agent.id), requests: [], executed: [] }
  ctx.provide('workingDirectory', { ensure: async () => h.cwd, get: () => h.cwd })
  await ctx.plugin(plan)
  ctx.tools.register(defineTool({
    name: 'write', description: 'Mock fixture write tool',
    parameters: { file_path: { type: 'string', required: true }, content: { type: 'string', required: true } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute: async (args, exec) => { await options.beforeWrite?.(); h.executed.push({ name: 'write', parent: exec.parent }); writeFileSync(path.resolve(h.cwd, args.file_path), args.content); return 'Mock write completed.' },
  }))
  if (options.bash !== false) ctx.tools.register(defineTool({
    name: 'bash', description: 'Mock structured bash tool using the official subprocess provider',
    parameters: { command: { type: 'string', required: true }, workdir: { type: 'string', required: true }, description: { type: 'string', required: true }, timeoutMs: { type: 'integer', required: true }, run_in_background: { type: 'boolean' } },
    output: { schema: foregroundSchema(), render: (_args, value) => [{ type: 'text', text: value.stdout.text || `exit ${value.exitCode}` }] },
    execute: async (args, exec) => { h.executed.push({ name: 'bash', parent: exec.parent }); return runFixtureBash(ctx, args, exec, options) },
  }))
  h.invoke = (name, args = {}) => ctx.tools.execute({ name, arguments: args, callId: randomUUID(), signal: new AbortController().signal, agent })
  h.installApproval = answer => { h.answer = answer; ctx.provide('approval', { request: async request => { h.requests.push(request); return h.answer(request) } }) }
  h.trace = () => existsSync(env.DSH_X_TEST_ACP_TRACE) ? readFileSync(env.DSH_X_TEST_ACP_TRACE, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : []
  h.draft = async command => {
    const baseline = await captureBaseline(spec => ctx.subprocess.spawn(spec), { cwd: repo })
    assert.equal(baseline.complete, true, JSON.stringify(baseline.issues))
    const manifest = { version: 1, goal: 'Mock fixture task', files: ['note.txt'], steps: [{ id: 'step-1', title: 'Update fixture note' }], questions: [], checks: [{ id: 'check-1', command, required: true }] }
    h.planText = `Mock fixture plan only.\n\n\`\`\`dsh-x-plan\n${JSON.stringify(manifest)}\n\`\`\``
    const adapter = { executable, name: 'dsh-x-mock-acp-fixture', version: '1.0.0-fixture' }
    return writeNewPlan(h.dir, { planner: 'codex', reviewer: 'claude', cwd: repo, baseline, manifest: parseContract(h.planText), adapters: { planner: adapter, reviewer: adapter }, text: h.planText })
  }
  return h
}
function foregroundSchema() {
  const stream = { type: 'object', additionalProperties: false, properties: { text: { type: 'string', required: true }, truncated: { type: 'boolean', required: true } } }
  return { type: 'object', additionalProperties: false, properties: {
    kind: { type: 'string', const: 'foreground' }, cwd: { type: 'string' }, exitCode: { oneOf: [{ type: 'integer' }, { type: 'null' }] }, signal: { oneOf: [{ type: 'string' }, { type: 'null' }] }, timedOut: { type: 'boolean' }, aborted: { type: 'boolean' }, stdout: stream, stderr: stream,
  } }
}
async function runFixtureBash(ctx, args, exec, options) {
  const child = ctx.subprocess.spawn({ argv: ['/bin/sh', '-c', args.command], cwd: args.workdir, stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' }, signal: exec.signal, graceMs: 100 })
  const [stdout, stderr, outcome] = await Promise.all([streamText(child.stdout), streamText(child.stderr), child.done])
  return { kind: 'foreground', cwd: args.workdir, exitCode: outcome.exitCode ?? null, signal: outcome.signal ?? null, timedOut: false, aborted: exec.signal.aborted, stdout: { text: stdout, truncated: options.truncated === true }, stderr: { text: stderr, truncated: false } }
}
async function streamText(stream) { stream.setEncoding('utf8'); let text = ''; for await (const chunk of stream) text += chunk; return text }
function show(value) { return JSON.stringify(value) }
function git(cwd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, stdio: 'ignore' })
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`git fixture failed: ${args.join(' ')}, ${code}`)))
  })
}
