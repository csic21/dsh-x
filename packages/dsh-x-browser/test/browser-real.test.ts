import test from 'node:test'
import assert from 'node:assert/strict'
import { createAgentBrowserBackend } from '../src/backends/agent-browser/backend.ts'
import { cdpRuntime } from '../src/runtime.ts'

/**
 * Opt-in real-browser smoke. Skipped unless DSH_X_BROWSER_REAL=1.
 *
 * Required: an agent-browser CLI on PATH (or DSH_X_BROWSER_CLI) and a usable Chrome.
 * Optional:
 *   DSH_X_BROWSER_URL   page to open (default https://example.com/)
 *   DSH_X_BROWSER_ARGS  JSON array of global CLI args, e.g. '["--args","--no-sandbox"]'
 *   DSH_X_BROWSER_HOME  HOME for the child CLI, to keep its sessions out of your real home
 */
const enabled = process.env.DSH_X_BROWSER_REAL === '1'
const command = process.env.DSH_X_BROWSER_CLI || 'agent-browser'
const url = process.env.DSH_X_BROWSER_URL || 'https://example.com/'
const extraArgs: string[] = process.env.DSH_X_BROWSER_ARGS ? JSON.parse(process.env.DSH_X_BROWSER_ARGS) : []
const home = process.env.DSH_X_BROWSER_HOME
const env = home ? { ...process.env, HOME: home } : undefined

test('real agent-browser: open, observe, click and list one tab', { skip: enabled ? false : 'set DSH_X_BROWSER_REAL=1 with an installed agent-browser CLI', timeout: 180_000 }, async t => {
  const backend = createAgentBrowserBackend({ command, headed: false, extraArgs, env, timeoutMs: 60_000 })
  const runtime = cdpRuntime(backend)
  t.after(() => runtime.dispose())
  const scope = { profile: 'real-browser', sessionId: `real-${Date.now()}`, workspace: process.cwd() }
  const opened = await runtime.open!(scope, url, {})
  assert.equal(typeof opened.tabId, 'string')
  assert.equal(opened.grantRevision, 0)
  const observed = await runtime.execute(scope, { tabId: opened.tabId, epoch: opened.epoch, grantRevision: 0, command: { action: 'observe' } }, {})
  const observation = observed.result as { refs: Record<string, string>, text: string, truncated: boolean }
  assert.ok(Object.keys(observation.refs).length > 0, 'the page must expose at least one interactive ref')
  assert.equal(observation.truncated, false)
  const pressed = await runtime.execute(scope, { tabId: opened.tabId, epoch: observed.epoch, grantRevision: 0, command: { action: 'press', key: 'PageDown' } }, {})
  assert.equal(pressed.untrustedPageContent, true)
  const reobserved = await runtime.execute(scope, { tabId: opened.tabId, epoch: pressed.epoch, grantRevision: 0, command: { action: 'observe' } }, {})
  const refs = (reobserved.result as { refs: Record<string, string> }).refs
  const ref = Object.keys(refs)[0]
  const clicked = await runtime.execute(scope, { tabId: opened.tabId, epoch: reobserved.epoch, grantRevision: 0, command: { action: 'click', target: ref } }, {})
  assert.equal(clicked.untrustedPageContent, true)
  const tabs = await runtime.list(scope)
  assert.equal(tabs.tabs.length, 1)
  assert.equal(tabs.runtime, 'cdp')
})
