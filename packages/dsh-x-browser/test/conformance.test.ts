import test from 'node:test'
import assert from 'node:assert/strict'
import { createFakeBackend } from '../src/backends/fake.ts'
import { createAgentBrowserBackend } from '../src/backends/agent-browser/backend.ts'
import { EMBEDDED_CAPABILITIES } from '../src/contract/capabilities.ts'
import { createScriptedCli } from './fixtures/agent-browser.ts'
import { conformance } from './conformance.ts'

conformance('agent-browser (mock)', () => createFakeBackend())
conformance('embedded (mock)', () => createFakeBackend({ kind: 'embedded', capabilities: EMBEDDED_CAPABILITIES }))
conformance('agent-browser (scripted)', () => createAgentBrowserBackend({ runner: createScriptedCli().runner, headed: false }))

test('fake backend surfaces injected failures as stable browser errors', async () => {
  const backend = createFakeBackend({ failOn: { ensure: 'BROWSER_DAEMON', open: 'BROWSER_TIMEOUT' } })
  await assert.rejects(backend.ensure({ profile: 'p', sessionId: 's', workspace: '/w' }), { code: 'BROWSER_DAEMON' })
  await assert.rejects(backend.open({ profile: 'p', sessionId: 's', workspace: '/w' }, 'example.test'), { code: 'BROWSER_TIMEOUT' })
  await backend.dispose()
})
