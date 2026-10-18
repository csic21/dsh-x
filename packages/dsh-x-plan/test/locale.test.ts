import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import React, { act, useSyncExternalStore } from 'react'
import { JSDOM } from 'jsdom'
import { createOfficialLocale } from '../../../test/fixtures/locale.mjs'
import { en, zh, NS, planErrorKey } from '../src/client/locales.ts'
import { readPresentation } from '../src/client/presentation.ts'
import { approvalText } from '../src/approval-text.ts'
import { apply } from '../src/index.ts'
import { sessionPlansDir, writeNewPlan } from '../src/store.ts'

const meta: any = { kind: 'dsh-x-plan.result', version: 1, operation: 'plan', round: 1234, path: '/计划/plan-1234.md', body: '  模型计划 原文\nDo exactly this.\n', verdict: null, attempt: 0, missingVerdict: false }
const placeholders = (value: any) => [...value.matchAll(/\{([^}]+)\}/g)].map(match => match[1]).sort()
test('plan dictionaries cover the same keys, placeholders and every owned error code', async () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort())
  for (const key of Object.keys(zh)) { assert.ok(en[key as keyof typeof en]); assert.deepEqual(placeholders(en[key as keyof typeof en]), placeholders(zh[key as keyof typeof zh]), key) }
  const backendFiles = (await readdir(new URL('../src/', import.meta.url))).filter(file => file.endsWith('.ts')).map(file => `../src/${file}`)
  for (const file of ['../src/index.ts', ...backendFiles] as const) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8')
    // Include conditional code arguments such as TASK_BUSY / STORE_BUSY.
    const argumentsToCheck = [...source.matchAll(/planError\(([^,\n]*)|code:\s*('(?:DSH_X_PLAN_)?[A-Z_]+')/g)]
    for (const argument of argumentsToCheck) for (const match of (argument[1] ?? argument[2]).matchAll(/'([A-Z_]+)'/g)) {
      assert.ok(en[`error.${match[1].replace(/^DSH_X_PLAN_/, '')}` as keyof typeof en], `${file}: ${match[1]}`)
    }
    for (const match of source.matchAll(/readJson\([^\n]*?,\s*'([A-Z_]+)'/g)) assert.ok(en[`error.${match[1]}` as keyof typeof en], `${file}: ${match[1]}`)
  }
  assert.equal(planErrorKey({ name: 'DshXPlanError', code: 'DSH_X_PLAN_NO_DRAFT' }), 'error.NO_DRAFT')
  assert.equal(planErrorKey({ name: 'Other', code: 'DSH_X_PLAN_NO_DRAFT' }), 'error.UNKNOWN')
  assert.equal(planErrorKey({ name: 'AbortError', code: 'DSH_X_PLAN_CANCELLED' }), 'error.CANCELLED')
  assert.equal(readPresentation(meta), meta)
  for (const invalid of [{}, { ...meta, version: 99 }, { ...meta, round: -1 }, { ...meta, operation: 'unknown' }, { ...meta, body: null }, { ...meta, operation: 'review', verdict: 'unknown' }] as const) assert.equal(readPresentation(invalid), null)
})

test('native immutable approval maps follow official live locale', async () => {
  const snapshot: any = { round: 2, revision: 3, hash: 'a'.repeat(64), body: 'User/model 原文', binding: { cwd: '/workspace/demo' }, manifest: { goal: 'Goal', files: ['src/file.js'], checks: [{command:'npm test'}] } }
  const display = approvalText({ toolName:'dsh_x_approve_plan', snapshot })
  assert.deepEqual(Object.keys(display).sort(), ['en','zh'])
  assert.match(display.en, /current session/)
  assert.ok(display.en.includes(snapshot.hash)); assert.ok(display.zh.includes(snapshot.body))
  const locale = await createOfficialLocale('en')
  assert.equal((locale as any).resolveText(display), display.en)
  locale.setLocale('zh'); assert.equal((locale as any).resolveText(display), display.zh)
  ;(locale as any).addLanguage({id:'fr',label:'Français',fallback:'en'}); locale.setLocale('fr')
  assert.equal((locale as any).resolveText(display), display.en)
  const discarded = approvalText({toolName:'dsh_x_discard_plan',discard:{round:2}})
  assert.match(discarded.en,/does not undo/)
})

test('published plan toolviews switch live, preserve model text and actions, and localize errors', async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>')
  const previous: any = { window: (globalThis as any).window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT }
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
  const effects: any = [], entries: any = [], disposers: any = []
  let root: any
  try {
    const locale = await createOfficialLocale('zh')
    let client: any
    vm.runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), { document: dom.window.document, window: { __ModuleLoader__: { load(row: any) { assert.equal(row.id, 'dsh-x-plan'); client = row.factory((name: any) => { assert.equal(name, 'react'); return React }) } } } })
    client.apply({ locale, effect(fn: any) { const dispose = fn(); effects.push(dispose); return dispose }, slots: { inject(name: any, fn: any) { assert.equal(name, 'tool.call.toolview'); const dispose = fn(); disposers.push(dispose); return dispose }, register(options: any, component: any) { const entry: any = { options, component }; entries.push(entry); return () => entries.splice(entries.indexOf(entry), 1) } } })
    assert.deepEqual(entries.map((entry: any) => entry.options.key), ['dsh_x_plan', 'dsh_x_approve_plan', 'dsh_x_discard_plan', 'dsh_x_review', 'dsh_x_plan_status', 'dsh_x_revise_plan', 'dsh_x_recover_plan'])
    const { createRoot } = await import('react-dom/client')
    root = createRoot(document.getElementById('app')!)
    let current: any = { phase: 'result', block: { kind: 'tool-result', isError: false, meta, content: [] } }
    let entry = entries[0], opened: any, inspected = 0
    function Render() {
      useSyncExternalStore<any>(locale.subscribe.bind(locale), locale.getSnapshot.bind(locale), locale.getSnapshot.bind(locale))
      return React.createElement(entry.component, { ...current, ...entry.options.inject(), toolName: entry.options.key, t: locale.bind(NS), openFile(value: any) { opened = value }, inspect() { inspected++ } })
    }
    const render = () => act(async () => root.render(React.createElement(Render)))
    await render()
    assert.match(document.body.textContent, /第 1,234 轮计划已保存/)
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('pre'))!.textContent, meta.body)
    await act(async () => locale.setLocale('en'))
    assert.match(document.body.textContent, /Plan round 1,234 is saved/)
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('pre'))!.textContent, meta.body)
    await act(async () => (document.querySelector<HTMLElement & HTMLInputElement>('button'))!.click())
    assert.equal(opened, meta.path)
    await act(async () => ([...document.querySelectorAll('button')].at(-1))!.click())
    assert.equal(inspected, 1)
    current = { phase: 'result', block: { isError: true, error: { name: 'DshXPlanError', code: 'DSH_X_PLAN_NO_DRAFT' }, content: [{ type: 'text', text: '原始模型诊断' }] } }
    await render()
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('[role="alert"]'))!.textContent, en['error.NO_DRAFT'])
    await act(async () => locale.setLocale('zh'))
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('[role="alert"]'))!.textContent, zh['error.NO_DRAFT'])
    assert.doesNotMatch(document.body.textContent, /原始模型诊断/)
    entry = entries[3]
    current = { phase: 'result', block: { isError: false, meta: { ...meta, operation: 'review', verdict: 'fail', missingVerdict: true }, content: [] } }
    await render()
    assert.match(document.body.textContent, /验收未通过/)
    await act(async () => { (locale as any).addLanguage({ id: 'de-DE', label: 'Deutsch', fallback: 'en' }); locale.setLocale('de-DE') })
    assert.match(document.body.textContent, /Plan round 1.234 did not pass review/)
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('[role="alert"]'))!.textContent, en['review.missing-verdict'])
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('pre'))!.textContent, meta.body)
    for (const [index, operation, verdict, expected] of [[1,'approve',null,/is approved/],[2,'discard',null,/is discarded/],[3,'review','pass',/passed review/],[3,'review','stopped',/Further reviews have stopped/]] as const) {
      entry = entries[index]; current = { phase:'result',block:{isError:false,meta:{...meta,operation,verdict,attempt:2},content:[]} }; await render(); assert.match(document.body.textContent, expected)
    }
    current = { phase: 'result', block: { isError: false, content: [{ type: 'text', text: 'Historical model 原文' }] } }
    await render(); assert.match(document.body.textContent,/historical result/); assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('pre'))!.textContent,'Historical model 原文')
  } finally {
    if (root) await act(async () => root.unmount())
    disposers.reverse().forEach((dispose: any) => dispose?.()); effects.reverse().forEach((dispose: any) => dispose?.())
    assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('style[data-plugin="dsh-x-plan"]'), null)
    dom.window.close()
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete (globalThis as any)[key as keyof typeof globalThis]; else (globalThis as any)[key as keyof typeof globalThis] = value }
  }
})
