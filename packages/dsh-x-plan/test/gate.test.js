import assert from 'node:assert/strict'
import test from 'node:test'
import { gateDecision } from '../src/gate.js'

test('draft, busy, failed and interrupted states refuse mutations but preserve management and reads', () => {
  for (const state of ['draft', 'reviewing', 'needs_user', 'cancelled', 'completed']) {
    for (const toolName of ['bash', 'write', 'run_code']) assert.equal(gateDecision({ toolName, workflow: { state } }).kind, 'deny')
    for (const toolName of ['read', 'dsh_x_approve_plan', 'dsh_x_review', 'dsh_x_plan_status']) assert.equal(gateDecision({ toolName, workflow: { state } }).kind, 'next')
  }
  assert.equal(gateDecision({ toolName: 'write', locked: true }).kind, 'deny')
})
test('approved states only admit separately validated official mutation capabilities', () => {
  for (const state of ['approved', 'executing']) {
    for (const toolName of ['write', 'edit', 'bash']) assert.equal(gateDecision({ toolName, workflow: { state } }).kind, 'next')
    assert.equal(gateDecision({ toolName: 'run_code', workflow: { state } }).kind, 'deny')
  }
})
test('no active workflow leaves host policy in charge; approvals happen inside management tools', () => {
  for (const toolName of ['bash', 'dsh_x_approve_plan', 'dsh_x_discard_plan']) assert.equal(gateDecision({ toolName }).kind, 'next')
})
