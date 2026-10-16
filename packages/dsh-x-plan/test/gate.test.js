import assert from 'node:assert/strict'
import test from 'node:test'

import { gateDecision } from '../src/gate.js'

const draft = { round: 2, path: '/tmp/plan-2.md' }

test('an open draft blocks bash and allows read', () => {
  assert.equal(gateDecision({ toolName: 'bash', draft, discard: draft }).kind, 'deny')
  assert.equal(gateDecision({ toolName: 'write', draft, discard: draft }).kind, 'deny')
  assert.equal(gateDecision({ toolName: 'run_code', draft, discard: draft }).kind, 'deny')
  assert.equal(gateDecision({ toolName: 'read', draft, discard: draft }).kind, 'next')
  assert.equal(gateDecision({ toolName: 'dsh_x_review', draft, discard: draft }).kind, 'deny')
})

test('approve and discard ask the user while a draft is open', () => {
  assert.equal(gateDecision({ toolName: 'dsh_x_approve_plan', draft, discard: draft }).kind, 'ask')
  assert.equal(gateDecision({ toolName: 'dsh_x_discard_plan', draft, discard: draft }).kind, 'ask')
})

test('no draft leaves ordinary tools alone', () => {
  assert.equal(gateDecision({ toolName: 'bash', draft: null, discard: null }).kind, 'next')
  assert.equal(gateDecision({ toolName: 'dsh_x_approve_plan', draft: null, discard: null }).kind, 'next')
})

test('discard still asks when the latest plan is already approved', () => {
  const decision = gateDecision({
    toolName: 'dsh_x_discard_plan',
    draft: null,
    discard: { round: 1, path: '/tmp/plan-1.approved.md' },
  })
  assert.equal(decision.kind, 'ask')
})
