import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { hostname, tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { resolveHome } from '../src/home.js'
import {
  approvePlan, currentWorkflow, discardPlan, failureCount, latestApproved, listRounds,
  prepareApproval, readApproved, readWorkflow, recoverTaskLock, replaceDraft,
  reviewLimitReached, sessionPlansDir, taskLockState, transitionWorkflow,
  unapprovedDraft, withTaskLock, writeNewPlan, writeReview,
} from '../src/store.js'

const STORE_URL = pathToFileURL(path.resolve(import.meta.dirname, '../src/store.js')).href
const fixture = t => {
  const root = mkdtempSync(path.join(tmpdir(), 'dsh-x-plan-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const dir = sessionPlansDir(root, 'session-3')
  const record = { planner: 'codex', reviewer: 'claude', cwd: root, text: '计划\n', baseline: { head: 'abc', repoRoot: root }, manifest: { version: 1, goal: 'test' } }
  return { root, dir, record }
}
function approve(dir, round = 1, context) {
  const captured = prepareApproval(dir, round, context)
  return approvePlan(dir, round, { token: captured.token, expectedHash: captured.hash, expectedRevision: captured.revision })
}
function mutate(file, value) { chmodSync(file, 0o600); writeFileSync(file, value) }
function changeJson(file, update) { mutate(file, JSON.stringify(update(JSON.parse(readFileSync(file, 'utf8'))))) }
function code(expected) { return error => error.code === `DSH_X_PLAN_${expected}` }

test('session ids and rounds cannot escape storage', t => {
  assert.equal(sessionPlansDir('/tmp/dsh-x', 'session-1'), path.resolve('/tmp/dsh-x/plans/session-1'))
  for (const id of ['../session-1', 'session/1', '.', '..', '', 'a'.repeat(129)]) assert.throws(() => sessionPlansDir('/tmp/dsh-x', id))
  const { dir } = fixture(t)
  for (const round of [0, -1, 1.5, '../x', Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => readApproved(dir, round), code('ROUND_INVALID'))
})

test('home resolution keeps DSH_HOME override and product default', () => {
  assert.equal(path.basename(resolveHome({})), '.dsh-x')
  assert.equal(resolveHome({ DSH_HOME: '/tmp/custom-home' }), path.resolve('/tmp/custom-home'))
})

test('single task lifecycle, bounded failures, cancellation, and replacement round', t => {
  const { root, dir, record } = fixture(t)
  const written = writeNewPlan(dir, record)
  assert.equal(written.round, 1)
  assert.equal(unapprovedDraft(dir)?.round, 1)
  assert.equal(readWorkflow(dir, 1).goal, 'test')
  assert.throws(() => writeNewPlan(dir, record), code('DRAFT_EXISTS'))
  const approved = approve(dir)
  assert.equal(approved.text, record.text)
  assert.equal(unapprovedDraft(dir), null)
  assert.equal(latestApproved(dir)?.round, 1)
  assert.equal(readApproved(dir, 1, { cwd: root, baseline: record.baseline }).meta.planner, 'codex')
  assert.deepEqual(approved.manifest, record.manifest)
  assert.throws(() => writeNewPlan(dir, record), code('DRAFT_EXISTS'))
  assert.throws(() => replaceDraft(dir, 1, record), code('DRAFT_EXISTS'))
  transitionWorkflow(dir, 1, 'executing', { expectedState: 'approved' })
  transitionWorkflow(dir, 1, 'reviewing')
  assert.equal(writeReview(dir, { round: 1, reviewer: 'claude', verdict: 'fail', gaps: '1. 缺测试' }).state, 'executing')
  transitionWorkflow(dir, 1, 'reviewing')
  assert.equal(writeReview(dir, { round: 1, reviewer: 'claude', verdict: 'fail', gaps: '1. 仍缺测试' }).state, 'needs_user')
  assert.equal(failureCount(dir, 1), 2)
  assert.equal(reviewLimitReached(dir, 1), true)
  assert.throws(() => transitionWorkflow(dir, 1, 'executing'), code('STATE_TRANSITION'))
  discardPlan(dir, 1)
  assert.equal(latestApproved(dir), null)
  assert.throws(() => readApproved(dir, 1), code('DISCARDED'))
  assert.equal(writeNewPlan(dir, record).round, 2)
})

test('approval requires captured token/hash and rejects changed draft', t => {
  const { dir, record } = fixture(t)
  const written = writeNewPlan(dir, record)
  assert.throws(() => approvePlan(dir, 1), code('APPROVAL_REQUIRED'))
  const captured = prepareApproval(dir, 1)
  assert.equal(captured.body, record.text)
  assert.match(captured.hash, /^[a-f0-9]{64}$/)
  writeFileSync(written.path, 'changed after showing user')
  assert.throws(() => approvePlan(dir, 1, { token: captured.token, expectedHash: captured.hash }), code('DRAFT_CHANGED'))
  const refreshed = prepareApproval(dir, 1)
  assert.equal(refreshed.revision, captured.revision + 1)
  assert.throws(() => approvePlan(dir, 1, { token: captured.token, expectedHash: captured.hash }), code('APPROVAL_STALE'))
  const approved = approvePlan(dir, 1, { token: refreshed.token, expectedHash: refreshed.hash })
  assert.equal(approved.text, 'changed after showing user')
  assert.equal(approved.hash, refreshed.hash)
  writeFileSync(written.path, 'later draft edit')
  assert.equal(readApproved(dir, 1).text, approved.text)
})

test('approval payload hash binds baseline and structured manifest as well as body', t => {
  const { dir, record } = fixture(t)
  writeNewPlan(dir, record)
  const captured = prepareApproval(dir, 1)
  changeJson(path.join(dir, 'plan-1.approval-request.json'), request => ({ ...request, manifest: { goal: 'different' } }))
  assert.throws(() => approvePlan(dir, 1, { token: captured.token, expectedHash: captured.hash }), code('DRAFT_CHANGED'))
  const captured2 = prepareApproval(dir, 1)
  changeJson(path.join(dir, 'plan-1.approval-request.json'), request => ({ ...request, binding: { ...request.binding, baseline: { head: 'evil' } } }))
  assert.throws(() => approvePlan(dir, 1, { token: captured2.token, expectedHash: captured2.hash }), code('DRAFT_CHANGED'))
})

test('approved body tampering is detected without silently regenerating the snapshot', t => {
  const { dir, record } = fixture(t)
  writeNewPlan(dir, record)
  const approved = approve(dir)
  mutate(approved.path, 'tampered')
  assert.throws(() => readApproved(dir, 1), code('APPROVAL_TAMPERED'))
  assert.throws(() => latestApproved(dir), code('APPROVAL_TAMPERED'))
  assert.throws(() => transitionWorkflow(dir, 1, 'executing'), code('APPROVAL_TAMPERED'))
})

test('approved snapshot manifest and original metadata tampering are detected', t => {
  const { dir, record } = fixture(t)
  writeNewPlan(dir, record)
  const approved = approve(dir)
  const manifestFile = approved.path.replace(/\.md$/, '.json')
  const original = readFileSync(manifestFile, 'utf8')
  changeJson(manifestFile, value => ({ ...value, binding: { ...value.binding, baseline: { head: 'changed' } } }))
  assert.throws(() => readApproved(dir, 1), code('APPROVAL_TAMPERED'))
  mutate(manifestFile, original)
  changeJson(path.join(dir, 'plan-1.json'), value => ({ ...value, reviewer: 'grok' }))
  assert.throws(() => readApproved(dir, 1), code('APPROVAL_TAMPERED'))
})

test('cwd and complete supplied baseline are bound, canonical JSON key order is stable', t => {
  const { root, dir, record } = fixture(t)
  writeNewPlan(dir, record)
  const other = path.join(root, 'other'); mkdirSync(other)
  assert.throws(() => prepareApproval(dir, 1, { cwd: other, baseline: record.baseline }), code('BINDING_MISMATCH'))
  assert.throws(() => prepareApproval(dir, 1, { cwd: root, baseline: { ...record.baseline, head: 'changed' } }), code('BINDING_MISMATCH'))
  approve(dir, 1, { cwd: root, baseline: { repoRoot: root, head: 'abc' }, manifest: record.manifest })
  assert.throws(() => readApproved(dir, 1, { cwd: other }), code('BINDING_MISMATCH'))
  assert.throws(() => readApproved(dir, 1, { baseline: { ...record.baseline, head: 'other' } }), code('BINDING_MISMATCH'))
  assert.equal(readApproved(dir, 1, { cwd: root }).binding.cwd, root)
})

test('legacy approved markdown requires renewed approval and old content stays preserved', t => {
  const { dir, record } = fixture(t)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'plan-1.md'), record.text)
  writeFileSync(path.join(dir, 'plan-1.approved.md'), 'legacy untrusted approval')
  writeFileSync(path.join(dir, 'plan-1.json'), JSON.stringify({ round: 1, planner: record.planner, reviewer: record.reviewer, cwd: record.cwd }))
  assert.equal(readWorkflow(dir, 1).state, 'needs_user')
  assert.equal(unapprovedDraft(dir)?.round, 1)
  assert.equal(latestApproved(dir), null)
  assert.throws(() => readApproved(dir, 1), code('REAPPROVAL_REQUIRED'))
  const approved = approve(dir, 1, record)
  assert.equal(approved.text, record.text)
  assert.equal(readFileSync(path.join(dir, 'plan-1.approved.md'), 'utf8'), 'legacy untrusted approval')
})

test('reapproval keeps immutable previous snapshot and resets failures only for new approved revision', t => {
  const { dir, record } = fixture(t)
  writeNewPlan(dir, record)
  const old = approve(dir)
  transitionWorkflow(dir, 1, 'reviewing')
  writeReview(dir, { round: 1, reviewer: 'claude', verdict: 'inconclusive', gaps: 'evidence incomplete' })
  assert.equal(failureCount(dir, 1), 0)
  assert.equal(readWorkflow(dir, 1).state, 'needs_user')
  const renewed = approve(dir)
  assert.equal(renewed.revision, old.revision + 1)
  assert.notEqual(renewed.path, old.path)
  assert.equal(readFileSync(old.path, 'utf8'), record.text)
  transitionWorkflow(dir, 1, 'reviewing')
  const review = writeReview(dir, { round: 1, reviewer: 'claude', verdict: 'pass', gaps: '' })
  assert.equal(review.attempt, 2)
  assert.equal(readWorkflow(dir, 1).state, 'completed')
  assert.equal(currentWorkflow(dir), null)
  assert.throws(() => transitionWorkflow(dir, 1, 'executing'), code('STATE_TRANSITION'))
  assert.throws(() => prepareApproval(dir, 1), code('CLOSED'))
})

test('invalid transitions and review writes fail closed', t => {
  const { dir, record } = fixture(t)
  writeNewPlan(dir, record)
  assert.throws(() => transitionWorkflow(dir, 1, 'executing'), code('STATE_TRANSITION'))
  approve(dir)
  assert.throws(() => transitionWorkflow(dir, 1, 'reviewing', { expectedState: 'executing' }), code('STATE_CONFLICT'))
  assert.throws(() => writeReview(dir, { round: 1, reviewer: 'claude', verdict: 'pass', gaps: '' }), code('STATE_TRANSITION'))
  transitionWorkflow(dir, 1, 'reviewing')
  assert.throws(() => writeReview(dir, { round: 1, reviewer: 'codex', verdict: 'pass', gaps: '' }), code('REVIEW_INVALID'))
  assert.throws(() => transitionWorkflow(dir, 1, 'completed'), code('STATE_TRANSITION'))
})

test('draft replacement preserves history and failed replacement leaves the original active', t => {
  const { dir, record } = fixture(t)
  const old = writeNewPlan(dir, record)
  assert.throws(() => replaceDraft(dir, 1, { ...record, cwd: '' }))
  assert.equal(currentWorkflow(dir).round, 1)
  const next = replaceDraft(dir, 1, { ...record, text: 'revised' })
  assert.equal(next.round, 2)
  assert.equal(readWorkflow(dir, 1).state, 'cancelled')
  assert.equal(currentWorkflow(dir).round, 2)
  assert.equal(readFileSync(old.path, 'utf8'), record.text)
})

test('task lock exists before any draft, rejects overlapping processes, and releases', async t => {
  const { dir } = fixture(t)
  await withTaskLock(dir, async lock => {
    assert.equal(taskLockState(dir).token, lock.token)
    assert.equal(taskLockState(dir).operation, 'planning')
    assert.equal(currentWorkflow(dir), null)
    await assert.rejects(withTaskLock(dir, async () => {}), code('TASK_BUSY'))
    const script = `import { withTaskLock } from ${JSON.stringify(STORE_URL)}; try { await withTaskLock(${JSON.stringify(dir)}, async()=>{}) } catch(e) { console.log(e.code) }`
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' })
    assert.equal(child.status, 0)
    assert.match(child.stdout, /DSH_X_PLAN_TASK_BUSY/)
  }, { operation: 'planning' })
  assert.equal(taskLockState(dir), null)
})

test('task errors persist needs_user and release the lock', async t => {
  const { dir, record } = fixture(t)
  writeNewPlan(dir, record); approve(dir)
  await assert.rejects(withTaskLock(dir, async () => {
    transitionWorkflow(dir, 1, 'reviewing')
    throw new Error('provider failed')
  }), /provider failed/)
  assert.equal(taskLockState(dir), null)
  assert.equal(readWorkflow(dir, 1).state, 'needs_user')
})

test('foreign runtime executing/reviewing state never implicitly resumes', t => {
  const { dir, record } = fixture(t)
  writeNewPlan(dir, record); approve(dir); transitionWorkflow(dir, 1, 'executing')
  changeJson(path.join(dir, 'plan-1.state.json'), value => ({ ...value, runtimeId: 'dead-runtime' }))
  assert.equal(readWorkflow(dir, 1).state, 'needs_user')
  assert.equal(readWorkflow(dir, 1).recoveryRequired, true)
  assert.throws(() => transitionWorkflow(dir, 1, 'reviewing'), code('STATE_TRANSITION'))
  assert.equal(approve(dir).state, 'approved')
})

test('stale task lock recovery requires exact token and demonstrably dead same-host owner', async t => {
  const { dir, record } = fixture(t)
  writeNewPlan(dir, record); approve(dir); transitionWorkflow(dir, 1, 'executing')
  const lock = { token: 'dead-token', runtimeId: 'dead-runtime', pid: 2147483647, hostname: hostname(), startedAt: new Date().toISOString() }
  writeFileSync(path.join(dir, '.task.lock'), JSON.stringify(lock))
  await assert.rejects(withTaskLock(dir, async () => {}), code('RECOVERY_REQUIRED'))
  assert.throws(() => recoverTaskLock(dir, { expectedToken: 'wrong' }), code('RECOVERY_TOKEN'))
  assert.equal(recoverTaskLock(dir, { expectedToken: lock.token }).recovered, true)
  assert.equal(readWorkflow(dir, 1).state, 'needs_user')
  assert.equal(taskLockState(dir), null)
  await withTaskLock(dir, async current => {
    assert.throws(() => recoverTaskLock(dir, { expectedToken: current.token }), code('TASK_BUSY'))
  })
})

test('malformed locks, state, and symlink snapshots fail closed', async t => {
  const { dir, record } = fixture(t)
  writeNewPlan(dir, record)
  writeFileSync(path.join(dir, '.task.lock'), '{')
  assert.throws(() => taskLockState(dir), code('LOCK_INVALID'))
  await assert.rejects(withTaskLock(dir, async () => {}), code('LOCK_INVALID'))
  rmSync(path.join(dir, '.task.lock'))
  const approved = approve(dir)
  rmSync(approved.path)
  symlinkSync(path.join(dir, 'plan-1.md'), approved.path)
  assert.throws(() => readApproved(dir, 1), code('STORAGE_INVALID'))
  writeFileSync(path.join(dir, 'plan-1.state.json'), '{')
  assert.throws(() => readWorkflow(dir, 1), code('STATE_INVALID'))
})

test('orphan review files are never overwritten and numbering advances by highest reserved attempt', t => {
  const { dir, record } = fixture(t)
  writeNewPlan(dir, record); approve(dir); transitionWorkflow(dir, 1, 'reviewing')
  writeFileSync(path.join(dir, 'review-1-4.md'), 'orphan from crash')
  const review = writeReview(dir, { round: 1, reviewer: 'claude', verdict: 'fail', gaps: 'gap' })
  assert.equal(review.attempt, 5)
  assert.equal(readFileSync(path.join(dir, 'review-1-4.md'), 'utf8'), 'orphan from crash')
  assert.throws(() => writeReview(dir, { round: 1, reviewer: 'claude', verdict: 'fail', gaps: 'race' }), code('STATE_TRANSITION'))
})

test('concurrent process draft writers create exactly one active task', async t => {
  const { dir, record } = fixture(t)
  const script = `import { writeNewPlan } from ${JSON.stringify(STORE_URL)}; try { console.log('ok', writeNewPlan(${JSON.stringify(dir)},${JSON.stringify(record)}).round) } catch(e) { console.log(e.code) }`
  const results = await Promise.all(Array.from({ length: 6 }, () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script])
    let out = ''; let err = ''
    child.stdout.on('data', data => { out += data }); child.stderr.on('data', data => { err += data })
    child.on('error', reject); child.on('close', status => status === 0 ? resolve(out) : reject(new Error(err)))
  })))
  assert.equal(results.filter(out => out.startsWith('ok')).length, 1)
  assert.deepEqual(listRounds(dir), [1])
  assert.equal(readdirSync(dir).filter(name => name.endsWith('.lock')).length, 0)
})

test('adapter identities are pinned and sanitized evidence summary survives status reads', t => {
  const { dir, record } = fixture(t)
  const adapters = { planner: { version: '1.2.3', binary: '/usr/bin/planner' }, reviewer: { version: '2.3.4', binary: '/usr/bin/reviewer' } }
  writeNewPlan(dir, { ...record, adapters })
  const captured = prepareApproval(dir, 1)
  assert.deepEqual(captured.adapters, adapters)
  const approved = approvePlan(dir, 1, { token: captured.token, expectedHash: captured.hash })
  assert.deepEqual(approved.meta.adapters, adapters)
  transitionWorkflow(dir, 1, 'reviewing')
  const evidence = { complete: true, checks: [{ id: 'test', status: 'passed', exitCode: 0 }] }
  writeReview(dir, { round: 1, reviewer: 'claude', verdict: 'pass', gaps: 'All done', evidence })
  assert.deepEqual(readWorkflow(dir, 1).latestReview.evidence, evidence)
  assert.equal(readWorkflow(dir, 1).latestReview.verdict, 'pass')
  assert.deepEqual(JSON.parse(readFileSync(path.join(dir, 'review-1-1.json'), 'utf8')).evidence, evidence)
})

test('oversized adapter/evidence summaries fail without creating trusted records', t => {
  const { dir, record } = fixture(t)
  assert.throws(() => writeNewPlan(dir, { ...record, adapters: { value: 'x'.repeat(33000) } }), code('STORAGE_SIZE'))
  assert.equal(currentWorkflow(dir), null)
  writeNewPlan(dir, record); approve(dir); transitionWorkflow(dir, 1, 'reviewing')
  assert.throws(() => writeReview(dir, { round: 1, reviewer: 'claude', verdict: 'pass', gaps: '', evidence: { value: 'x'.repeat(132000) } }), code('STORAGE_SIZE'))
  assert.equal(readdirSync(dir).filter(name => /^review-/.test(name)).length, 0)
})

test('legacy approval cannot become trusted with an absent baseline', t => {
  const { dir, record } = fixture(t)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'plan-1.md'), record.text)
  writeFileSync(path.join(dir, 'plan-1.approved.md'), record.text)
  writeFileSync(path.join(dir, 'plan-1.json'), JSON.stringify({ round: 1, planner: record.planner, reviewer: record.reviewer, cwd: record.cwd }))
  assert.throws(() => prepareApproval(dir, 1), code('REAPPROVAL_REQUIRED'))
  assert.equal(readWorkflow(dir, 1).state, 'needs_user')
})

test('interrupted replacement with two active rounds requires explicit resolution', t => {
  const { dir, record } = fixture(t)
  writeNewPlan(dir, record)
  // Simulate the narrow crash window after replacement publication, before old cancellation.
  writeFileSync(path.join(dir, 'plan-2.md'), 'replacement')
  writeFileSync(path.join(dir, 'plan-2.json'), JSON.stringify({ ...JSON.parse(readFileSync(path.join(dir, 'plan-1.json'), 'utf8')), round: 2, replacesRound: 1 }))
  writeFileSync(path.join(dir, 'plan-2.state.json'), JSON.stringify({ ...JSON.parse(readFileSync(path.join(dir, 'plan-1.state.json'), 'utf8')), round: 2, replacesRound: 1 }))
  assert.equal(currentWorkflow(dir).state, 'needs_user')
  assert.equal(currentWorkflow(dir).reason, 'multiple_active_rounds')
  assert.deepEqual(currentWorkflow(dir).conflictingRounds, [1, 2])
  assert.throws(() => prepareApproval(dir, 2), code('MULTIPLE_ACTIVE'))
  assert.throws(() => writeNewPlan(dir, record), code('DRAFT_EXISTS'))
  discardPlan(dir, 1)
  assert.equal(currentWorkflow(dir).round, 2)
  assert.equal(currentWorkflow(dir).state, 'draft')
})

test('stale store lock remains fail-closed for manual inspection, including recovery helper', t => {
  const { dir, record } = fixture(t)
  mkdirSync(dir, { recursive: true })
  const lock = { token: 'dead-store', runtimeId: 'dead-runtime', pid: 2147483647, hostname: hostname(), startedAt: new Date().toISOString() }
  writeFileSync(path.join(dir, '.store.lock'), JSON.stringify(lock))
  assert.throws(() => writeNewPlan(dir, record), code('RECOVERY_REQUIRED'))
  assert.throws(() => recoverTaskLock(dir, { expectedToken: 'anything' }), code('RECOVERY_REQUIRED'))
  assert.equal(JSON.parse(readFileSync(path.join(dir, '.store.lock'), 'utf8')).token, 'dead-store')
})

test('uncertain subprocess completion retains task lock and blocks unsafe resume', async t => {
  const { dir, record } = fixture(t)
  writeNewPlan(dir, record); approve(dir)
  let token
  await withTaskLock(dir, async lock => {
    token = lock.token
    transitionWorkflow(dir, 1, 'reviewing')
    lock.retain('acceptance_job_not_quiescent')
  }, { operation: 'reviewing' })
  assert.equal(taskLockState(dir).token, token)
  assert.equal(taskLockState(dir).retained, true)
  assert.equal(taskLockState(dir).reason, 'acceptance_job_not_quiescent')
  assert.equal(readWorkflow(dir, 1).state, 'needs_user')
  await assert.rejects(withTaskLock(dir, async () => {}), code('TASK_BUSY'))
  assert.throws(() => recoverTaskLock(dir, { expectedToken: token }), code('RECOVERY_REQUIRED'))
})

test('discarded workflow retains revision, immutable hash, model metadata, and latest review', t => {
  const { dir, record } = fixture(t)
  writeNewPlan(dir, record); const approved = approve(dir); transitionWorkflow(dir, 1, 'reviewing')
  writeReview(dir, { round: 1, reviewer: 'claude', verdict: 'fail', gaps: 'gap', evidence: { complete: true } })
  discardPlan(dir, 1)
  const state = readWorkflow(dir, 1)
  assert.equal(state.state, 'cancelled')
  assert.equal(state.revision, approved.revision)
  assert.equal(state.hash, approved.hash)
  assert.equal(state.planner, record.planner)
  assert.equal(state.latestReview.attempt, 1)
  assert.equal(state.latestReview.evidence.complete, true)
})

test('manual draft revisions and rejected approvals never imply historical approval', t => {
  const { dir, record } = fixture(t)
  const draft = writeNewPlan(dir, record)
  assert.equal(readWorkflow(dir, 1).everApproved, false)
  const first = prepareApproval(dir, 1)
  writeFileSync(draft.path, 'manually revised draft')
  assert.throws(() => approvePlan(dir, 1, { token: first.token, expectedHash: first.hash }), code('DRAFT_CHANGED'))
  const second = prepareApproval(dir, 1)
  assert.equal(second.revision, 2)
  assert.equal(readWorkflow(dir, 1).everApproved, false)
  const approved = approvePlan(dir, 1, { token: second.token, expectedHash: second.hash })
  assert.equal(readWorkflow(dir, 1).everApproved, true)
  transitionWorkflow(dir, 1, 'needs_user', { reason: 'pause' })
  prepareApproval(dir, 1)
  assert.equal(readWorkflow(dir, 1).everApproved, true)
  assert.equal(readWorkflow(dir, 1).revision, approved.revision + 1)
  discardPlan(dir, 1)
  assert.equal(readWorkflow(dir, 1).everApproved, true)
})

test('a retained lock cannot recover even when its owner process is demonstrably dead', async t => {
  const { dir, record } = fixture(t)
  writeNewPlan(dir, record)
  const lock = { token: 'retained-dead-owner', runtimeId: 'dead-runtime', pid: 2147483647, hostname: hostname(), startedAt: new Date().toISOString(), retained: true, reason: 'quiescence_unconfirmed' }
  writeFileSync(path.join(dir, '.task.lock'), JSON.stringify(lock))
  assert.equal(taskLockState(dir).ownerAlive, false)
  assert.throws(() => recoverTaskLock(dir, { expectedToken: lock.token }), code('RECOVERY_REQUIRED'))
  const { assertRecoverable } = await import('../src/store-lock.js')
  assert.throws(() => assertRecoverable({ ...lock, ownerAlive: false }, lock.token), code('RECOVERY_REQUIRED'))
  assert.equal(taskLockState(dir).token, lock.token)
})

test('ACP cleanup uncertainty automatically retains the session lock before and after draft creation', async t => {
  const { planError } = await import('../src/errors.js')
  for (const withDraft of [false, true]) {
    const { dir, record } = fixture(t)
    if (withDraft) { writeNewPlan(dir, record); approve(dir); transitionWorkflow(dir, 1, 'reviewing') }
    const error = withDraft ? planError('ACP_CLEANUP', 'child exit unconfirmed') : Object.assign(new Error('wrapped cleanup'), { info: { code: 'DSH_X_PLAN_ACP_CLEANUP' } })
    await assert.rejects(withTaskLock(dir, async () => { throw error }, { operation: withDraft ? 'reviewing' : 'planning' }), caught => caught === error)
    assert.equal(taskLockState(dir).retained, true)
    assert.equal(taskLockState(dir).reason, 'acp_cleanup_unconfirmed')
    if (withDraft) assert.equal(readWorkflow(dir, 1).state, 'needs_user')
    else assert.equal(currentWorkflow(dir), null)
    await assert.rejects(withTaskLock(dir, async () => {}), code('TASK_BUSY'))
  }
})
