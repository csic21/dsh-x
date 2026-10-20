/**
 * Fixtures were captured from the real CLI: agent-browser 0.39.1, macOS arm64,
 * Chrome stable, `--json` mode, 2026-10-20. Keep them byte-faithful when possible.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertVersion,
  classifyError,
  openResult,
  parseEnvelope,
  parseVersion,
  snapshotResult,
  tabsResult,
} from '../src/backends/agent-browser/contract.ts'
import { cliRef, observationFromSnapshot, redactSnapshot } from '../src/backends/agent-browser/parse.ts'

const openLine = '{"success":true,"data":{"lifecycle":{"effectiveLaunch":{"browserLaunched":true,"engine":"chrome","launchHash":1732458185396288403},"launched":false,"relaunchedBrowser":false,"restartedBackground":false,"restoreStatus":"not_configured","reused":true,"saveStatus":"not_attempted"},"targetId":"88BD2573D29B19981BC1B27FD33AB23C","title":"","url":"about:blank"},"error":null}'
const snapshotLine = '{"success":true,"data":{"lifecycle":{"launched":false},"origin":"data:text/html,<title>Probe</title>","refs":{"e1":{"name":"Submit","role":"button"},"e2":{"name":"Email","role":"textbox"}},"removedRefs":[],"snapshot":"- button \\"Submit\\" [ref=e1]\\n- textbox \\"Email\\" [ref=e2]"},"error":null}'
const tabsLine = '{"success":true,"data":{"lifecycle":{"launched":false},"tabs":[{"active":true,"label":null,"tabId":"t1","targetId":"88BD2573D29B19981BC1B27FD33AB23C","title":"Probe","type":"page","url":"https://example.test/"}]},"error":null}'
const failureLine = '{"success":false,"data":null,"error":"Unknown ref: e99"}'
const tabFailureLine = '{"success":false,"data":null,"error":"Tab t9 not found; run `agent-browser tab` to list open tabs"}'

test('version gate accepts the captured series and rejects everything else', () => {
  assert.deepEqual(parseVersion('agent-browser 0.39.1\n'), { major: 0, minor: 39, patch: 1 })
  assert.equal(parseVersion('something else'), null)
  assert.deepEqual(assertVersion('agent-browser 0.39.1'), { major: 0, minor: 39, patch: 1 })
  assert.throws(() => assertVersion('agent-browser 0.40.0'), { code: 'BROWSER_VERSION' })
  assert.throws(() => assertVersion('agent-browser 1.0.0'), { code: 'BROWSER_VERSION' })
  assert.throws(() => assertVersion('nonsense'), { code: 'BROWSER_VERSION' })
})

test('envelope parsing tolerates log lines but never invents success', () => {
  const open = parseEnvelope(openLine)
  assert.equal(open.success, true)
  assert.equal((open.data as Record<string, unknown>).targetId, '88BD2573D29B19981BC1B27FD33AB23C')
  const failure = parseEnvelope(failureLine)
  assert.equal(failure.success, false)
  assert.equal(failure.data, null)
  assert.equal(failure.error, 'Unknown ref: e99')
  assert.equal(parseEnvelope(`noise line\n${snapshotLine}`).success, true)
  assert.throws(() => parseEnvelope('not json at all'), { code: 'BROWSER_PROTOCOL' })
  assert.throws(() => parseEnvelope('{"data":{}}'), { code: 'BROWSER_PROTOCOL' })
})

test('data guards keep the fields the backend needs and reject wrong shapes', () => {
  const open = openResult(parseEnvelope(openLine).data)
  assert.equal(open.url, 'about:blank')
  assert.equal(open.title, '')
  assert.throws(() => openResult({ url: 'https://example.test/' }), { code: 'BROWSER_PROTOCOL' })
  const snapshot = snapshotResult(parseEnvelope(snapshotLine).data)
  assert.equal(snapshot.snapshot.startsWith('- button'), true)
  assert.deepEqual(snapshot.refs.e1, { name: 'Submit', role: 'button' })
  assert.throws(() => snapshotResult({ origin: 'x', snapshot: 1 }), { code: 'BROWSER_PROTOCOL' })
  const tabs = tabsResult(parseEnvelope(tabsLine).data)
  assert.deepEqual(tabs.map(tab => tab.tabId), ['t1'])
  assert.equal(tabs[0].active, true)
  assert.throws(() => tabsResult({ tabs: 'nope' }), { code: 'BROWSER_PROTOCOL' })
})

test('command failures map onto the plugin error taxonomy', () => {
  assert.equal(classifyError('Unknown ref: e99'), 'BROWSER_STALE')
  assert.equal(classifyError('Tab t9 not found; run `agent-browser tab`'), 'BROWSER_TARGET')
  assert.equal(classifyError('Auto-launch failed: CDP response channel closed'), 'BROWSER_DAEMON')
  assert.equal(classifyError('Timed out waiting for selector'), 'BROWSER_TIMEOUT')
  assert.equal(classifyError('Something odd happened'), 'BROWSER_UNAVAILABLE')
})

test('snapshots become shared observations with private URL parts removed', () => {
  const title = 'Probe'
  const observation = observationFromSnapshot('t1', 2, {
    origin: 'https://example.test/a?token=secret#frag',
    refs: { e1: { name: 'Submit', role: 'button' }, e2: { role: 'textbox' } },
    snapshot: '- button "Submit" [ref=e1]\n- textbox "Email" [ref=e2]: a@b.com',
  }, title)
  assert.equal(observation.url, 'https://example.test/a')
  assert.equal(observation.title, 'Probe')
  assert.equal(observation.revision, 2)
  assert.deepEqual(observation.refs, { e1: 'button: Submit', e2: 'textbox' })
  assert.equal(observation.truncated, false)
  assert.equal(cliRef('e1'), '@e1')
  assert.equal(cliRef('@e1'), '@e1')
  assert.equal(observation.text.includes('a@b.com'), false)
  assert.equal(observation.text.includes('textbox "Email" [ref=e2]'), true)
})

test('form values are stripped from snapshots without touching ordinary text', () => {
  const text = redactSnapshot('- textbox "Email" [ref=e2]: a@b.com\n- button "Save: now" [ref=e1]\n- combobox "Plan" [ref=e3]: secret-plan')
  assert.equal(text.includes('a@b.com'), false)
  assert.equal(text.includes('secret-plan'), false)
  assert.equal(text.includes('button "Save: now"'), true)
})
