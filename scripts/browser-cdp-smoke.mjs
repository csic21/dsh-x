#!/usr/bin/env node
/**
 * Reproducible CDP smoke: opens one page through the real agent-browser CLI,
 * observes, clicks the first ref, lists tabs, prints a JSON summary, and closes.
 *
 *   DSH_X_BROWSER_CLI=agent-browser DSH_X_BROWSER_URL=https://example.com/ \
 *   node scripts/browser-cdp-smoke.mjs
 *
 * Optional env (same as the gated test): DSH_X_BROWSER_ARGS, DSH_X_BROWSER_HOME.
 * Exits non-zero on any failure; never falls back to another browser.
 */
import { createAgentBrowserBackend } from '../packages/dsh-x-browser/src/backends/agent-browser/backend.ts'
import { cdpRuntime } from '../packages/dsh-x-browser/src/runtime.ts'

const command = process.env.DSH_X_BROWSER_CLI || 'agent-browser'
const url = process.env.DSH_X_BROWSER_URL || 'https://example.com/'
const extraArgs = process.env.DSH_X_BROWSER_ARGS ? JSON.parse(process.env.DSH_X_BROWSER_ARGS) : []
const home = process.env.DSH_X_BROWSER_HOME
const env = home ? { ...process.env, HOME: home } : undefined

const backend = createAgentBrowserBackend({ command, headed: false, extraArgs, env, timeoutMs: 60_000 })
const runtime = cdpRuntime(backend)
const scope = { profile: 'smoke', sessionId: `smoke-${Date.now()}`, workspace: process.cwd() }
try {
  const opened = await runtime.open(scope, url, {})
  const observed = await runtime.execute(scope, { tabId: opened.tabId, epoch: opened.epoch, grantRevision: 0, command: { action: 'observe' } }, {})
  const observation = observed.result
  const refs = Object.keys(observation.refs)
  if (refs.length === 0) throw new Error('the page exposed no interactive refs')
  const clicked = await runtime.execute(scope, { tabId: opened.tabId, epoch: observed.epoch, grantRevision: 0, command: { action: 'click', target: refs[0] } }, {})
  const tabs = await runtime.list(scope)
  console.log(JSON.stringify({
    ok: true,
    cli: command,
    url: observation.url,
    tabId: opened.tabId,
    epochs: [opened.epoch, observed.epoch, clicked.epoch],
    refs,
    tabs: tabs.tabs.map(tab => tab.tabId),
    truncated: observation.truncated,
  }, null, 2))
} catch (error) {
  console.error(JSON.stringify({ ok: false, cli: command, url, error: error instanceof Error ? error.message : String(error), code: error?.code ?? null }, null, 2))
  process.exitCode = 1
} finally {
  await runtime.dispose()
}
