import assert from 'node:assert/strict'
import test from 'node:test'

import { defaultReviewer, resolveLaunch } from '../src/agents.js'

test('the default reviewer is a different family', () => {
  assert.equal(defaultReviewer('codex'), 'claude')
  assert.equal(defaultReviewer('claude'), 'grok')
  assert.equal(defaultReviewer('grok'), 'codex')
})

test('a PATH binary wins over npx', async () => {
  const launch = await resolveLaunch('codex', {
    resolveExecutable(command) {
      if (command === 'codex-acp') return '/usr/local/bin/codex-acp'
      throw new Error('missing')
    },
  })
  assert.deepEqual(launch.argv, ['/usr/local/bin/codex-acp'])
  assert.equal(launch.env.INITIAL_AGENT_MODE, 'read-only')
  assert.equal(launch.modeId, 'read-only')
})

test('npx is the fallback and an explicit override is not softened', async () => {
  const fallback = await resolveLaunch('grok', {
    resolveExecutable(command) {
      if (command === 'npx') return '/usr/bin/npx'
      throw new Error(`missing ${command}`)
    },
  })
  assert.deepEqual(fallback.argv, ['/usr/bin/npx', '-y', '@xai-official/grok', '--no-auto-update', 'agent', 'stdio'])

  await assert.rejects(() => resolveLaunch('claude', {
    env: { DSH_X_ACP_CLAUDE: '/opt/claude-agent-acp' },
    resolveExecutable() {
      throw new Error('override missing')
    },
  }), /override missing/)
})
