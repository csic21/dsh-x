import test from 'node:test'
import assert from 'node:assert/strict'
import { createAgentBrowserCli, spawnRunner } from '../src/backends/agent-browser/cli.ts'
import type { CliResult, CliRunner } from '../src/backends/agent-browser/cli.ts'

const session = 'dsh-0123456789abcdef'
const success = (data: unknown): CliResult => ({ code: 0, stdout: JSON.stringify({ success: true, data, error: null }), stderr: '' })

function fakeRunner(results: CliResult[]) {
  const calls: string[][] = []
  const runner: CliRunner = async ({ args }) => {
    calls.push([...args])
    if (args.includes('--version')) return { code: 0, stdout: 'agent-browser 0.39.1\n', stderr: '' }
    const next = results.shift()
    if (!next) throw new Error('unexpected invocation')
    return next
  }
  return { runner, calls }
}

test('session names are opaque, deterministic and never leak ids into argv', () => {
  const cli = createAgentBrowserCli({ runner: async () => success({}) })
  const name = cli.sessionName('profile-a', 'session-a')
  assert.match(name, /^dsh-[0-9a-f]{16}$/)
  assert.equal(name, cli.sessionName('profile-a', 'session-a'))
  assert.notEqual(name, cli.sessionName('profile-a', 'session-b'))
  assert.notEqual(name, cli.sessionName('profile-b', 'session-a'))
})

test('invoke runs the version gate once and passes global flags before the command', async () => {
  const { runner, calls } = fakeRunner([success({ tabs: [] }), success({ tabs: [] })])
  const cli = createAgentBrowserCli({ runner, extraArgs: ['--args', '--no-sandbox'] })
  await cli.version()
  await cli.invoke(session, ['tab', 'list'])
  await cli.invoke(session, ['tab', 'list'])
  assert.deepEqual(calls[0], ['--version'])
  assert.deepEqual(calls[1], ['--json', '--session', session, '--args', '--no-sandbox', 'tab', 'list'])
  assert.equal(calls.filter(call => call[0] === '--version').length, 1)
})

test('command failures keep the mapped code and a bounded message', async () => {
  const { runner } = fakeRunner([
    { code: 0, stdout: '{"success":false,"data":null,"error":"Unknown ref: e99"}', stderr: '' },
    { code: 0, stdout: '{"success":false,"data":null,"error":"Tab t9 not found","code":"tab_gone"}', stderr: '' },
  ])
  const cli = createAgentBrowserCli({ runner })
  await assert.rejects(cli.invoke(session, ['click', '@e99']), { code: 'BROWSER_STALE' })
  await assert.rejects(cli.invoke(session, ['tab', 'close', 't9']), { code: 'BROWSER_TARGET' })
})

test('a crashed process without JSON is a daemon failure, not a protocol failure', async () => {
  const { runner } = fakeRunner([{ code: 2, stdout: '', stderr: 'Auto-launch failed: CDP response channel closed' }])
  const cli = createAgentBrowserCli({ runner })
  await assert.rejects(cli.invoke(session, ['open', 'about:blank']), { code: 'BROWSER_DAEMON' })
})

test('a version outside the supported series fails before any page work and is retried later', async () => {
  let versions = 0
  const runner: CliRunner = async ({ args }) => {
    if (args.includes('--version')) { versions++; return { code: 0, stdout: 'agent-browser 0.40.0', stderr: '' } }
    return success({})
  }
  const cli = createAgentBrowserCli({ runner })
  await assert.rejects(cli.invoke(session, ['open', 'about:blank']), { code: 'BROWSER_VERSION' })
  await assert.rejects(cli.invoke(session, ['open', 'about:blank']), { code: 'BROWSER_VERSION' })
  assert.equal(versions, 2)
})

test('missing binaries and hangs surface as stable browser errors', async () => {
  await assert.rejects(spawnRunner({ command: 'agent-browser-definitely-missing', args: [], timeoutMs: 2000 }), { code: 'BROWSER_BINARY_MISSING' })
  const started = Date.now()
  await assert.rejects(spawnRunner({ command: process.execPath, args: ['-e', 'setTimeout(() => {}, 60000)'], timeoutMs: 150 }), { code: 'BROWSER_TIMEOUT' })
  assert.equal(Date.now() - started < 5000, true)
})

test('oversized output is refused instead of truncated into a fake result', async () => {
  await assert.rejects(spawnRunner({ command: process.execPath, args: ['-e', 'process.stdout.write("x".repeat(300000))'], timeoutMs: 5000 }), { code: 'BROWSER_RESULT' })
})
