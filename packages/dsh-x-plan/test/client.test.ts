import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import React, { act, useSyncExternalStore } from 'react'
import { JSDOM } from 'jsdom'
import { createOfficialLocale } from '../../../test/fixtures/locale.mjs'
import { NS, en, zh } from '../src/client/locales.ts'
import { CHECK_STATES, WORKFLOW_STATES, checkSummary, readPresentation, taskStatus } from '../src/client/presentation.ts'

const original = '  Original model text 原始计划\n<script>do not execute()</script>\n'
const fixture = (extra: any = {}) => ({
  kind: 'dsh-x-plan.result', version: 2, operation: 'plan', round: 1234, revision: 2,
  hash: 'a'.repeat(64), path: '/a very long path/计划/plan-1234.revision-2.md', body: original,
  goal: '修复登录超时 / Fix expired sessions', planner: 'codex', reviewer: 'claude',
  workflowState: 'draft', verdict: null, attempt: 0, reason: '',
  files: ['src/auth.js', 'test/auth.test.js'],
  steps: [{ id: 'S1', title: 'Add a failing reproduction' }, { id: 'S2', title: 'Fix the refresh path' }],
  questions: [], checks: [{ id: 'C1', command: 'node --test test/auth.test.js', status: 'not-run', exitCode: null }],
  ...extra,
})

test('v2 metadata rejects unknown or malformed records without guessing state', () => {
  const meta = fixture()
  assert.equal(readPresentation(meta), meta)
  assert.equal(readPresentation(fixture({ checks: [{ id: 'C1', command: 'test', required: true }] })).checks[0].status, 'not-run')
  for (const operation of ['status', 'recover'] as const) assert.ok(readPresentation({ kind: 'dsh-x-plan.result', version: 2, operation, workflowState: 'none', text: 'No active plan.' }))
  assert.equal(readPresentation(fixture({ operation: 'approve', workflowState: 'none', text: 'Invalid approval' })), null)
  for (const workflowState of WORKFLOW_STATES) assert.ok(readPresentation(fixture({ workflowState })))
  for (const operation of ['plan', 'approve', 'discard', 'review', 'status', 'revise', 'recover'] as const) assert.ok(readPresentation(fixture({ operation })))
  const invalid = [
    { version: 3 }, { revision: 0 }, { hash: 'not-a-hash' }, { workflowState: 'done' },
    { checks: [{ id: 'C', command: 'test', status: 'running' }] }, { checks: [null] },
    { files: [null] }, { steps: [null] }, { questions: [{ text: 'Unknown', blocking: 'yes' }] },
    { reason: {} }, { attempt: NaN }, { verdict: 'probably-pass' },
  ]
  for (const entry of invalid) assert.equal(readPresentation(fixture(entry)), null, JSON.stringify(entry))
})

test('evidence counts use recorded statuses and never reward an unsupported pass', () => {
  const checks = CHECK_STATES.map((status, index) => ({ id: `C${index}`, command: 'test', status, exitCode: status === 'passed' ? 0 : null }))
  assert.deepEqual(checkSummary(fixture({ checks })).counts, { passed: 1, failed: 1, inconclusive: 1, 'not-run': 1 })
  for (const checks of [[], fixture().checks, [{ id: 'C', command: 'test', status: 'passed', exitCode: 1 }]] as const) {
    const meta = fixture({ checks, verdict: 'pass', workflowState: 'completed' })
    assert.equal(taskStatus(meta).tone, 'warning')
    assert.equal(taskStatus(meta).key, 'result.incomplete')
  }
  const passed = fixture({ checks: [{ id: 'C', command: 'test', status: 'passed', exitCode: 0 }], verdict: 'pass', workflowState: 'completed' })
  assert.equal(taskStatus(passed).tone, 'success')
  for (const verdict of [null, undefined, 'fail', 'inconclusive', 'stopped'] as const) {
    assert.equal(taskStatus({ ...passed, operation: 'status', verdict }).key, 'result.incomplete')
  }
  assert.equal(taskStatus(fixture({ questions: [{ text: 'Which behavior?', blocking: true }] })).key, 'task.questions-open')
  assert.equal(taskStatus(fixture({ operation: 'review', workflowState: 'needs_user', verdict: 'fail', reason: 'review_limit', attempt: 2 })).key, 'task.stopped')
})

test('built task card shows honest snapshots, version, roles, evidence, disclosure and real actions across languages', async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><main id="app"></main></body></html>')
  const previous: any = { window: (globalThis as any).window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT }
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
  const effects: any = [], slots: any = [], registrations: any = []
  let root: any
  try {
    const locale = await createOfficialLocale('zh')
    let client: any
    vm.runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), {
      document: dom.window.document,
      window: { __ModuleLoader__: { load(entry: any) { client = entry.factory((name: any) => { assert.equal(name, 'react'); return React }) } } },
    })
    client.apply({ locale, effect(fn: any) { const dispose = fn(); effects.push(dispose); return dispose }, slots: {
      inject(name: any, fn: any) { assert.equal(name, 'tool.call.toolview'); const dispose = fn(); slots.push(dispose); return dispose },
      register(options: any, component: any) { const entry: any = { options, component }; registrations.push(entry); return () => registrations.splice(registrations.indexOf(entry), 1) },
    } })
    assert.equal(registrations.length, 7)
    const entry = registrations[0]
    const { createRoot } = await import('react-dom/client')
    root = createRoot(document.getElementById('app')!)
    let current = fixture({ reason: 'draft_ready' }), handlers = true, opened: any, inspected = 0
    function Render() {
      useSyncExternalStore<any>(locale.subscribe.bind(locale), locale.getSnapshot.bind(locale), locale.getSnapshot.bind(locale))
      return React.createElement(entry.component, { phase: 'result', toolName: 'dsh_x_plan', block: { isError: false, meta: current, content: [{ type: 'text', text: original }] }, ...entry.options.inject(), t: locale.bind(NS), ...(handlers ? { openFile(path: any) { opened = path }, inspect() { inspected++ } } : {}) })
    }
    const render = () => act(async () => root.render(React.createElement(Render)))
    await render()
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('[role="status"]'))!.textContent, zh['workflow.draft'])
    assert.match(document.body.textContent, /第 1,234 轮 · 修订 2/)
    assert.match(document.body.textContent, /当前 DSH 会话/)
    assert.match(document.body.textContent, /本次操作的历史快照/)
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('.dxp-reason'))!.textContent, /草稿已保存/)
    assert.doesNotMatch(document.body.textContent, /DeepSeek/)
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('details') as any).open, false)
    await act(async () => (document.querySelector<HTMLElement & HTMLInputElement>('details > summary'))!.click())
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('details') as any).open, true)
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('.dxp-body'))!.textContent, original)
    assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('script'), null)
    assert.deepEqual([...document.querySelectorAll('button')].map(button => button.textContent), [zh['file.open'], zh.inspect])
    await act(async () => (document.querySelector<HTMLElement & HTMLInputElement>('button'))!.click())
    assert.equal(opened, current.path)
    await act(async () => (document.querySelector<HTMLElement & HTMLInputElement>('.dxp-inspect'))!.click())
    assert.equal(inspected, 1)
    await act(async () => locale.setLocale('en'))
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('details') as any).open, true)
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('[role="status"]'))!.textContent, en['workflow.draft'])
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('.dxp-body'))!.textContent, original)
    assert.match(document.body.textContent, /Only Allow on the official approval card/)
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('.dxp-reason'))!.textContent, /The draft is saved/)
    current = fixture({ questions: [{ text: 'Keep compatibility?', blocking: true }] }); await render()
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('[role="status"]'))!.textContent, en['task.questions-open'])
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('.dxp-next'))!.textContent, en['next.questions'])
    current = fixture({ operation: 'review', workflowState: 'needs_user', verdict: 'inconclusive', attempt: 1, reason: 'Fixture: command timed out.', checks: [{ id: 'C1', command: 'npm test', status: 'inconclusive', exitCode: null }] }); await render()
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('[role="status"]'))!.textContent, en['task.inconclusive'])
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('.dxp-evidence'))!.textContent, /0 passed · 0 failed · 1 inconclusive · 0 not run/)
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('.dxp-next'))!.textContent, /does not mean the implementation failed/)
    current = fixture({ operation: 'review', workflowState: 'needs_user', verdict: 'fail', reason: 'review_limit', attempt: 2 }); await render()
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('[role="status"]'))!.textContent, en['task.stopped'])
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('.dxp-next'))!.textContent, en['next.stopped'])
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('.dxp-reason'))!.textContent, /reached its review failure limit/)
    assert.doesNotMatch((document.querySelector<HTMLElement & HTMLInputElement>('.dxp-reason'))!.textContent, /review_limit/)
    current = fixture({ operation: 'review', workflowState: 'completed', verdict: 'pass' }); await render()
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('[role="status"]'))!.textContent, en['result.incomplete'])
    assert.ok(document.querySelector<HTMLElement & HTMLInputElement>('[role="alert"]'))
    assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('.dxp-status.dxp-success'), null)
    current = fixture({ operation: 'review', workflowState: 'completed', verdict: 'pass', checks: [{ id: 'C1', command: 'npm test', status: 'passed', exitCode: 0 }] }); await render()
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('[role="status"]'))!.textContent, en['workflow.completed'])
    assert.ok(document.querySelector<HTMLElement & HTMLInputElement>('.dxp-status.dxp-success'))
    current = { ...current, operation: 'status', verdict: null }; await render()
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('[role="status"]'))!.textContent, en['result.incomplete'])
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('.dxp-next'))!.textContent, en['next.unverified'])
    assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('.dxp-status.dxp-success'), null)
    current = fixture({ operation: 'discard', workflowState: 'cancelled' }); await render()
    assert.match(document.body.textContent, /does not undo file changes/)
    current = fixture({ operation: 'recover', workflowState: 'needs_user' }); await render()
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('.dxp-next'))!.textContent, /will not resume automatically/)
    current = fixture({ operation: 'status', workflowState: 'executing', reason: 'operation_locked' }); await render()
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('[role="status"]'))!.textContent, en['workflow.executing'])
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('.dxp-reason'))!.textContent, /An operation lock exists/)
    assert.doesNotMatch(document.body.textContent, /\d+%/)
    current = fixture({ operation: 'status', workflowState: 'needs_user', reason: 'repository_changed' }); await render()
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('.dxp-reason'))!.textContent, /repository state changed/)
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('[role="status"]'))!.textContent, en['workflow.needs_user'])
    handlers = false; await render(); assert.equal(document.querySelectorAll('button').length, 0)
    current = { kind: 'dsh-x-plan.result', version: 2, operation: 'status', workflowState: 'none', text: 'No active plan.' }; await render()
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('[role="status"]'))!.textContent, en['task.none'])
    assert.match(document.body.textContent, /Describe a goal/)
    assert.doesNotMatch(document.body.textContent, /This historical result/)
    current = { ...current, operation: 'recover' }; await render()
    assert.match(document.body.textContent, /no task will run automatically/)
    current = fixture({ version: 99 }); await render()
    assert.match(document.body.textContent, /historical result/)
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('.dxp-body'))!.textContent, original)
    assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('.dxp-task'), null)
  } finally {
    if (root) await act(async () => root.unmount())
    slots.reverse().forEach((dispose: any) => dispose?.()); effects.reverse().forEach((dispose: any) => dispose?.())
    assert.equal(registrations.length, 0)
    assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('style[data-plugin="dsh-x-plan"]'), null)
    dom.window.close()
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete (globalThis as any)[key as keyof typeof globalThis]; else (globalThis as any)[key as keyof typeof globalThis] = value }
  }
})
