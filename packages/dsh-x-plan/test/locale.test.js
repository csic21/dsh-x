import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import React, { act, useSyncExternalStore } from 'react'
import { JSDOM } from 'jsdom'
import { createOfficialLocale } from '../../../test/fixtures/locale.mjs'
import { en, zh, NS, planErrorKey } from '../src/client/locales.js'
import { readPresentation } from '../src/client/presentation.js'
import { approvalText } from '../src/approval-text.js'
import { apply } from '../index.js'
import { sessionPlansDir, writeNewPlan } from '../src/store.js'

const meta = { kind: 'dsh-x-plan.result', version: 1, operation: 'plan', round: 1234, path: '/计划/plan-1234.md', body: '  模型计划 原文\nDo exactly this.\n', verdict: null, attempt: 0, missingVerdict: false }
const placeholders = value => [...value.matchAll(/\{([^}]+)\}/g)].map(match => match[1]).sort()
test('plan dictionaries cover the same keys, placeholders and every owned error code', async () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort())
  for (const key of Object.keys(zh)) { assert.ok(en[key]); assert.deepEqual(placeholders(en[key]), placeholders(zh[key]), key) }
  for (const file of ['../index.js', '../src/agents.js', '../src/acp.js', '../src/store.js', '../src/plan-text.js']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8')
    for (const match of source.matchAll(/(?:planError\(|code:\s*)'([A-Z_]+)'/g)) assert.ok(en[`error.${match[1].replace(/^DSH_X_PLAN_/, '')}`], `${file}: ${match[1]}`)
  }
  assert.equal(planErrorKey({ name: 'DshXPlanError', code: 'DSH_X_PLAN_NO_DRAFT' }), 'error.NO_DRAFT')
  assert.equal(planErrorKey({ name: 'Other', code: 'DSH_X_PLAN_NO_DRAFT' }), 'error.UNKNOWN')
  assert.equal(planErrorKey({ name: 'AbortError', code: 'DSH_X_PLAN_CANCELLED' }), 'error.CANCELLED')
  assert.equal(readPresentation(meta), meta)
  for (const invalid of [{}, { ...meta, version: 2 }, { ...meta, round: -1 }, { ...meta, operation: 'unknown' }, { ...meta, body: null }, { ...meta, operation: 'review', verdict: 'unknown' }]) assert.equal(readPresentation(invalid), null)
})

test('native approval maps follow the official locale and keep model reasons, round and paths intact', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'plan-locale-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    const dir = sessionPlansDir(home, 'locale-session')
    const plan = writeNewPlan(dir, { planner: 'codex', reviewer: 'claude', cwd: home, text: 'User/model 原文' })
    let gate
    apply({ effect() {}, on(name, callback) { if (name === 'tools/pre-execute') gate = callback }, tools: { register() {} } })
    const decision = await gate({ name: 'dsh_x_approve_plan', agent: { id: 'locale-session' }, arguments: { round: 2 } }, () => assert.fail('must ask'))
    assert.equal(decision.kind, 'ask')
    assert.deepEqual(Object.keys(decision.displayReason).sort(), ['en', 'zh'])
    assert.match(decision.reason, /批准第 1 轮/)
    assert.match(decision.displayReason.en, /Approve plan round 1/)
    assert.match(decision.displayReason.en, /specifies round 2/)
    assert.ok(decision.displayReason.en.includes(plan.path))
    const locale = await createOfficialLocale('en')
    assert.equal(locale.resolveText(decision.displayReason), decision.displayReason.en)
    locale.setLocale('zh')
    assert.equal(locale.resolveText(decision.displayReason), decision.displayReason.zh)
    locale.addLanguage({ id: 'fr', label: 'Français', fallback: 'en' }); locale.setLocale('fr')
    assert.equal(locale.resolveText(decision.displayReason), decision.displayReason.en)
    const discarded = approvalText({ toolName: 'dsh_x_discard_plan', draft: null, discard: { round: 1234, path: '/计划.md' } })
    assert.match(discarded.en, /Discard plan round 1,234: \/计划.md/)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous
    rmSync(home, { recursive: true, force: true })
  }
})

test('published plan toolviews switch live, preserve model text and actions, and localize errors', async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>')
  const previous = { window: globalThis.window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT }
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
  const effects = [], entries = [], disposers = []
  let root
  try {
    const locale = await createOfficialLocale('zh')
    let client
    vm.runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), { document: dom.window.document, window: { __ModuleLoader__: { load(row) { assert.equal(row.id, 'dsh-x-plan'); client = row.factory(name => { assert.equal(name, 'react'); return React }) } } } })
    client.apply({ locale, effect(fn) { const dispose = fn(); effects.push(dispose); return dispose }, slots: { inject(name, fn) { assert.equal(name, 'tool.call.toolview'); const dispose = fn(); disposers.push(dispose); return dispose }, register(options, component) { const entry = { options, component }; entries.push(entry); return () => entries.splice(entries.indexOf(entry), 1) } } })
    assert.deepEqual(entries.map(entry => entry.options.key), ['dsh_x_plan', 'dsh_x_approve_plan', 'dsh_x_discard_plan', 'dsh_x_review'])
    const { createRoot } = await import('react-dom/client')
    root = createRoot(document.getElementById('app'))
    let current = { phase: 'result', block: { kind: 'tool-result', isError: false, meta, content: [] } }
    let entry = entries[0], opened, inspected = 0
    function Render() {
      useSyncExternalStore(locale.subscribe.bind(locale), locale.getSnapshot.bind(locale), locale.getSnapshot.bind(locale))
      return React.createElement(entry.component, { ...current, ...entry.options.inject(), toolName: entry.options.key, t: locale.bind(NS), openFile(value) { opened = value }, inspect() { inspected++ } })
    }
    const render = () => act(async () => root.render(React.createElement(Render)))
    await render()
    assert.match(document.body.textContent, /第 1,234 轮计划已保存/)
    assert.equal(document.querySelector('pre').textContent, meta.body)
    await act(async () => locale.setLocale('en'))
    assert.match(document.body.textContent, /Plan round 1,234 is saved/)
    assert.equal(document.querySelector('pre').textContent, meta.body)
    await act(async () => document.querySelector('button').click())
    assert.equal(opened, meta.path)
    await act(async () => [...document.querySelectorAll('button')].at(-1).click())
    assert.equal(inspected, 1)
    current = { phase: 'result', block: { isError: true, error: { name: 'DshXPlanError', code: 'DSH_X_PLAN_NO_DRAFT' }, content: [{ type: 'text', text: '原始模型诊断' }] } }
    await render()
    assert.equal(document.querySelector('[role="alert"]').textContent, en['error.NO_DRAFT'])
    await act(async () => locale.setLocale('zh'))
    assert.equal(document.querySelector('[role="alert"]').textContent, zh['error.NO_DRAFT'])
    assert.doesNotMatch(document.body.textContent, /原始模型诊断/)
    entry = entries[3]
    current = { phase: 'result', block: { isError: false, meta: { ...meta, operation: 'review', verdict: 'fail', missingVerdict: true }, content: [] } }
    await render()
    assert.match(document.body.textContent, /验收未通过/)
    await act(async () => { locale.addLanguage({ id: 'de-DE', label: 'Deutsch', fallback: 'en' }); locale.setLocale('de-DE') })
    assert.match(document.body.textContent, /Plan round 1.234 did not pass review/)
    assert.equal(document.querySelector('[role="alert"]').textContent, en['review.missing-verdict'])
    assert.equal(document.querySelector('pre').textContent, meta.body)
    for (const [index, operation, verdict, expected] of [[1,'approve',null,/is approved/],[2,'discard',null,/is discarded/],[3,'review','pass',/passed review/],[3,'review','stopped',/Further reviews have stopped/]]) {
      entry = entries[index]; current = { phase:'result',block:{isError:false,meta:{...meta,operation,verdict,attempt:2},content:[]} }; await render(); assert.match(document.body.textContent, expected)
    }
    current = { phase: 'result', block: { isError: false, content: [{ type: 'text', text: 'Historical model 原文' }] } }
    await render(); assert.match(document.body.textContent,/historical result/); assert.equal(document.querySelector('pre').textContent,'Historical model 原文')
  } finally {
    if (root) await act(async () => root.unmount())
    disposers.reverse().forEach(dispose => dispose?.()); effects.reverse().forEach(dispose => dispose?.())
    assert.equal(document.querySelector('style[data-plugin="dsh-x-plan"]'), null)
    dom.window.close()
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value }
  }
})
