import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { resolveHome } from '../src/home.js'
import {
  approvePlan,
  discardPlan,
  failureCount,
  latestApproved,
  readApproved,
  reviewLimitReached,
  sessionPlansDir,
  unapprovedDraft,
  writeNewPlan,
  writeReview,
} from '../src/store.js'

test('session ids stay inside the plans directory', () => {
  const dir = sessionPlansDir('/tmp/dsh-x', 'session-1')
  assert.equal(dir, path.resolve('/tmp/dsh-x/plans/session-1'))
  assert.throws(() => sessionPlansDir('/tmp/dsh-x', '../session-1'))
  assert.throws(() => sessionPlansDir('/tmp/dsh-x', 'session/1'))
})

test('unset DSH_HOME uses ~/.dsh-x', () => {
  const home = resolveHome({})
  assert.equal(path.basename(home), '.dsh-x')
})

test('DSH_HOME wins over the product default', () => {
  assert.equal(resolveHome({ DSH_HOME: '/tmp/custom-home' }), path.resolve('/tmp/custom-home'))
})

test('draft, approve, review failures, and discard', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'dsh-x-plan-'))
  try {
    const dir = sessionPlansDir(root, 'session-3')
    const plan = '目标\n\n```dsh-x-acceptance\npnpm test\n```\n'
    const written = writeNewPlan(dir, {
      planner: 'codex',
      reviewer: 'claude',
      cwd: root,
      text: plan,
    })
    assert.equal(written.round, 1)
    assert.equal(unapprovedDraft(dir)?.round, 1)
    assert.throws(() => writeNewPlan(dir, {
      planner: 'grok',
      reviewer: 'codex',
      cwd: root,
      text: plan,
    }))

    const approved = approvePlan(dir, 1)
    assert.equal(approved.text, plan)
    assert.equal(unapprovedDraft(dir), null)
    assert.equal(latestApproved(dir)?.round, 1)
    assert.equal(readApproved(dir, 1).meta.planner, 'codex')
    assert.equal(readApproved(dir, 1).meta.reviewer, 'claude')

    writeReview(dir, { round: 1, reviewer: 'claude', verdict: 'fail', gaps: '1. 缺测试' })
    writeReview(dir, { round: 1, reviewer: 'claude', verdict: 'fail', gaps: '1. 仍缺测试' })
    assert.equal(failureCount(dir, 1), 2)
    assert.equal(reviewLimitReached(dir, 1), true)

    discardPlan(dir, 1)
    assert.equal(latestApproved(dir), null)
    assert.throws(() => readApproved(dir, 1))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
