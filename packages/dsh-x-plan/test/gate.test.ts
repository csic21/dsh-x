import assert from 'node:assert/strict'
import test from 'node:test'
import { gateDecision } from '../src/gate.ts'

test('draft, busy, failed and interrupted states refuse mutations but preserve management and reads', () => {
  for (const state of ['draft', 'reviewing', 'needs_user', 'cancelled', 'completed'] as const) {
    for (const toolName of ['bash', 'write', 'run_code'] as const) assert.equal(gateDecision({ toolName, workflow: { state } }).kind, 'deny')
    for (const toolName of ['read', 'dsh_x_approve_plan', 'dsh_x_review', 'dsh_x_plan_status'] as const) assert.equal(gateDecision({ toolName, workflow: { state } }).kind, 'next')
  }
  assert.equal(gateDecision({ toolName: 'write', locked: true }).kind, 'deny')
})
test('approved states only admit separately validated official mutation capabilities', () => {
  for (const state of ['approved', 'executing'] as const) {
    for (const toolName of ['write', 'edit', 'bash'] as const) assert.equal(gateDecision({ toolName, workflow: { state } }).kind, 'next')
    assert.equal(gateDecision({ toolName: 'run_code', workflow: { state } }).kind, 'deny')
  }
})
test('no active workflow leaves host policy in charge; approvals happen inside management tools', () => {
  for (const toolName of ['bash', 'dsh_x_approve_plan', 'dsh_x_discard_plan'] as const) assert.equal(gateDecision({ toolName }).kind, 'next')
})
