import test from 'node:test'
import assert from 'node:assert/strict'
import { createAgentBrowserBackend } from '../src/backends/agent-browser/backend.ts'
import type { CliResult, CliRunner } from '../src/backends/agent-browser/cli.ts'
import type { BrowserScope } from '../src/backends/types.ts'
import { createScriptedCli } from './fixtures/agent-browser.ts'

const scope: BrowserScope = { profile: 'profile-a', sessionId: 'session-a', workspace: '/work/a' }
const other: BrowserScope = { ...scope, sessionId: 'session-b' }

function backendWith(runner: CliRunner) {
  return createAgentBrowserBackend({ runner, headed: false })
}

test('cdp backend refuses non-HTTP destinations before any CLI call', async () => {
  const h = createScriptedCli()
  const backend = backendWith(h.runner)
  await assert.rejects(backend.open(scope, 'file:///etc/passwd'), { code: 'BROWSER_URL' })
  await assert.rejects(backend.open(scope, 'javascript:alert(1)'), { code: 'BROWSER_URL' })
  assert.equal(h.calls.length, 0)
})

test('open, list and observe produce stable tab-scoped targets', async t => {
  const h = createScriptedCli()
  const backend = backendWith(h.runner)
  t.after(() => backend.dispose())
  await backend.ensure(scope)
  const target = await backend.open(scope, 'example.test')
  assert.equal(target.targetId, 't1')
  assert.equal(target.url, 'https://example.test/')
  assert.equal((await backend.list(scope)).length, 1)
  const observation = await backend.observe(scope, target.targetId)
  assert.equal(observation.targetId, 't1')
  assert.deepEqual(Object.keys(observation.refs), ['e1', 'e2'])
  assert.equal(observation.refs.e1, 'button: Go')
  assert.equal(observation.url, 'https://example.test/')
  assert.deepEqual(h.argv().map(call => call[0]), ['open', 'tab', 'tab', 'snapshot'])
  assert.deepEqual(h.calls[0], ['--version'])
})

test('refs stay bound to the latest observation and every action rotates them', async t => {
  const h = createScriptedCli()
  const backend = backendWith(h.runner)
  t.after(() => backend.dispose())
  const target = await backend.open(scope, 'example.test')
  await assert.rejects(backend.execute(scope, target.targetId, { action: 'click', target: 'e1' }), { code: 'BROWSER_STALE' })
  const observation = await backend.observe(scope, target.targetId)
  const clicked = await backend.execute(scope, target.targetId, { action: 'click', target: 'e1' })
  assert.equal(clicked.untrustedPageContent, true)
  assert.ok(clicked.revision > observation.revision)
  assert.deepEqual(h.argv().map(call => call[0]), ['open', 'tab', 'snapshot', 'click'])
  await assert.rejects(backend.execute(scope, target.targetId, { action: 'click', target: 'e1' }), { code: 'BROWSER_STALE' })
})

test('a second open creates a new tab instead of navigating the first', async t => {
  const h = createScriptedCli()
  const backend = backendWith(h.runner)
  t.after(() => backend.dispose())
  const first = await backend.open(scope, 'example.test')
  const second = await backend.open(scope, 'example.test/two')
  assert.notEqual(second.targetId, first.targetId)
  assert.ok(h.argv().some(call => call[0] === 'tab' && call[1] === 'new'))
})

test('navigate maps to open, updates the URL and invalidates old refs', async t => {
  const h = createScriptedCli()
  const backend = backendWith(h.runner)
  t.after(() => backend.dispose())
  const target = await backend.open(scope, 'example.test')
  await backend.observe(scope, target.targetId)
  const result = await backend.execute(scope, target.targetId, { action: 'navigate', url: 'example.test/next' })
  assert.deepEqual(result.value, { opened: 'https://example.test/next' })
  await assert.rejects(backend.execute(scope, target.targetId, { action: 'click', target: 'e1' }), { code: 'BROWSER_STALE' })
  assert.deepEqual(h.argv().slice(-1)[0], ['open', 'https://example.test/next'])
})

test('a zero-distance scroll is rejected instead of reporting success', async t => {
  const h = createScriptedCli()
  const backend = backendWith(h.runner)
  t.after(() => backend.dispose())
  const target = await backend.open(scope, 'example.test')
  await assert.rejects(backend.execute(scope, target.targetId, { action: 'scroll', x: 0, y: 0 }), { code: 'BROWSER_INPUT' })
})

test('press and scroll map to the CLI key and direction vocabulary', async t => {
  const h = createScriptedCli()
  const backend = backendWith(h.runner)
  t.after(() => backend.dispose())
  const target = await backend.open(scope, 'example.test')
  await backend.observe(scope, target.targetId)
  await backend.execute(scope, target.targetId, { action: 'press', key: 'ArrowUp' })
  await backend.observe(scope, target.targetId)
  await backend.execute(scope, target.targetId, { action: 'scroll', x: 40, y: -120 })
  const commands = h.argv()
  assert.deepEqual(commands.find(call => call[0] === 'press'), ['press', 'Up'])
  assert.deepEqual(commands.filter(call => call[0] === 'scroll'), [['scroll', 'up', '120'], ['scroll', 'right', '40']])
})

test('close removes one target and dispose closes the session once', async t => {
  const h = createScriptedCli()
  const backend = backendWith(h.runner)
  const target = await backend.open(scope, 'example.test')
  await backend.close(scope, target.targetId)
  assert.deepEqual(await backend.list(scope), [])
  await backend.dispose()
  await backend.dispose()
  assert.equal(h.calls.filter(args => args.slice(args.indexOf('--session') + 2)[0] === 'close').length, 1)
  await assert.rejects(backend.list(scope), { code: 'BROWSER_CLOSED' })
})

test('sessions stay isolated even when both reuse the same tab id', async t => {
  const h = createScriptedCli()
  const backend = backendWith(h.runner)
  t.after(() => backend.dispose())
  const first = await backend.open(scope, 'example.test')
  const foreign = await backend.open(other, 'example.test')
  assert.equal(first.targetId, foreign.targetId)
  assert.equal((await backend.list(scope)).length, 1)
  assert.equal((await backend.list(other)).length, 1)
  await backend.execute(scope, first.targetId, { action: 'observe' })
  await backend.execute(other, foreign.targetId, { action: 'observe' })
  const sessions = new Set(h.calls.filter(args => args.includes('--session')).map(args => args[args.indexOf('--session') + 1]))
  assert.equal(sessions.size, 2)
})

test('concurrent commands serialize in submission order', async t => {
  const order: string[] = []
  let targetId = 'T1'
  const runner: CliRunner = async ({ args }) => {
    if (args.includes('--version')) return { code: 0, stdout: 'agent-browser 0.39.1', stderr: '' }
    const command = args.slice(args.indexOf('--session') + 2)
    if (command[0] === 'open') return { code: 0, stdout: JSON.stringify({ success: true, data: { targetId, url: command[1], title: '' }, error: null }), stderr: '' }
    if (command[0] === 'tab' && command[1] === 'list') return { code: 0, stdout: JSON.stringify({ success: true, data: { tabs: [{ tabId: 't1', targetId, url: 'https://example.test/', title: '', active: true }] }, error: null }), stderr: '' }
    if (command[0] === 'snapshot') { order.push('snapshot-start'); await new Promise(resolve => setTimeout(resolve, 10)); order.push('snapshot-end'); return { code: 0, stdout: JSON.stringify({ success: true, data: { origin: 'https://example.test/', refs: {}, snapshot: '' }, error: null }), stderr: '' } }
    return { code: 0, stdout: JSON.stringify({ success: true, data: {}, error: null }), stderr: '' }
  }
  const backend = backendWith(runner)
  t.after(() => backend.dispose())
  const target = await backend.open(scope, 'example.test')
  await Promise.all([
    backend.execute(scope, target.targetId, { action: 'observe' }),
    backend.execute(scope, target.targetId, { action: 'observe' }),
  ])
  assert.deepEqual(order, ['snapshot-start', 'snapshot-end', 'snapshot-start', 'snapshot-end'])
})
