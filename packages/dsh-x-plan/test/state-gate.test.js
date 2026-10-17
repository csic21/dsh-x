import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import * as plan from '../index.js'

function captureGate() {
  let gate
  plan.apply({
    effect() {},
    systemPrompt: { section() {} },
    on(event, handler) { if (event === 'tools/pre-execute') gate = handler },
    tools: { register() {} },
  })
  return gate
}

test('plan-state IO error fails closed while missing directory/no-agent remain usable', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'dsh-state-gate-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    const gate = captureGate()
    const next = async () => ({ kind: 'allow' })
    assert.equal((await gate({ name: 'write' }, next)).kind, 'allow')
    assert.equal((await gate({ name: 'write', agent: { id: 'missing' } }, next)).kind, 'allow')
    mkdirSync(path.join(home, 'plans'))
    writeFileSync(path.join(home, 'plans', 'blocked'), 'not a directory')
    await assert.rejects(gate({ name: 'write', agent: { id: 'blocked' } }, next), /无法读取.*计划状态/)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    rmSync(home, { recursive: true, force: true })
  }
})
