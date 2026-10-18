import assert from 'node:assert/strict'
import test from 'node:test'

import { AGENT_LAUNCH, defaultReviewer, resolveLaunch } from '../src/agents.ts'

test('the default reviewer is a different supported family', () => {
  assert.equal(defaultReviewer('codex'), 'claude')
  assert.equal(defaultReviewer('claude'), 'codex')
  assert.equal(defaultReviewer('grok'), 'codex')
})

test('a preinstalled PATH binary is used without a package manager', async () => {
  const calls: any = []
  const launch = await resolveLaunch('codex', {
    env: {},
    resolveExecutable(command: any) {
      calls.push(command)
      if (command === 'codex-acp') return '/usr/local/bin/codex-acp'
      throw new Error('missing')
    },
  })
  assert.deepEqual(calls, ['codex-acp'])
  assert.deepEqual(launch.argv, ['/usr/local/bin/codex-acp'])
  assert.equal(launch.env.INITIAL_AGENT_MODE, 'read-only')
  assert.equal(launch.env.NO_BROWSER, '1')
  assert.equal(launch.env.DEFAULT_AUTH_REQUEST, '')
  assert.equal(launch.modeId, 'read-only')
})

test('missing adapters never fall back to npx, even when it is installed', async () => {
  const calls: any = []
  await assert.rejects(() => resolveLaunch('claude', {
    env: {},
    resolveExecutable(command: any) {
      calls.push(command)
      if (command === 'npx') return '/usr/bin/npx'
      throw new Error(`missing ${command}`)
    },
  }), error => {
    assert.equal((error as any).code, 'DSH_X_PLAN_LAUNCH')
    assert.match((error as any).message, /不会自动下载/)
    assert.match((error as any).message, /https:\/\/github.com\/agentclientprotocol\/claude-agent-acp/)
    return true
  })
  assert.deepEqual(calls, ['claude-agent-acp'])
  assert.equal(Object.values(AGENT_LAUNCH).some(spec => Object.hasOwn(spec, 'npxArgs')), false)
})

test('an explicit executable override keeps the mode policy and is not softened', async () => {
  const calls: any = []
  const launch = await resolveLaunch('claude', {
    env: { DSH_X_ACP_CLAUDE: ' /opt/audited-claude ' },
    resolveExecutable(command: any) { calls.push(command); return command },
  })
  assert.deepEqual(calls, ['/opt/audited-claude'])
  assert.deepEqual(launch.argv, ['/opt/audited-claude'])
  assert.equal(launch.modeId, 'plan')

  await assert.rejects(() => resolveLaunch('claude', {
    env: { DSH_X_ACP_CLAUDE: '/opt/missing-adapter' },
    resolveExecutable() { throw new Error('override missing') },
  }), /override missing/)
})

test('Grok can be probed but must advertise read-only rather than plan', async () => {
  const launch = await resolveLaunch('grok', {
    env: {},
    resolveExecutable(command: any) { assert.equal(command, 'grok'); return '/opt/grok' },
  })
  assert.deepEqual(launch.argv, ['/opt/grok', '--no-auto-update', 'agent', 'stdio'])
  assert.equal(launch.modeId, 'read-only')
})

test('cancellation does not fall back or become a missing-executable error', async () => {
  const controller = new AbortController()
  const error = Object.assign(new Error('cancelled resolution'), { name: 'AbortError' })
  const calls: any = []
  await assert.rejects(() => resolveLaunch('codex', {
    env: {}, signal: controller.signal,
    resolveExecutable(command: any) { calls.push(command); controller.abort(); throw error },
  }), value => value === error)
  assert.deepEqual(calls, ['codex-acp'])
})
