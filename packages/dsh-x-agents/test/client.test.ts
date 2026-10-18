import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import React, { act, useSyncExternalStore } from 'react'
import { JSDOM } from 'jsdom'
import { createOfficialLocale } from '../../../test/fixtures/locale.mjs'
import { NS, en, zh } from '../src/client/locales.ts'
import { CAPABILITIES, addressFor } from '../src/client/model.ts'

const caps = Object.fromEntries(CAPABILITIES.map(key => [key, true]))
const catalog = () => ['codex', 'opencode', 'claude', 'grok'].map(id => ({ id, label: id, transport: 'fixture', available: ['claude','grok'].includes(id) ? false : null, authenticated: null, version: null, reason: ['claude','grok'].includes(id) ? 'not-integrated' : 'not-inspected', models: [{ id: `${id}/model`, label: `${id} model` }], capabilities: caps, limitations: ['Fixture protocol only'], providerAuthentication: 'unverified', sandbox: { enforcement: 'not-verified' } }))
const snapshot = (task: any = null) => ({ scope: 'scope-a', sessionId: 'session-a', revision: 1, catalog: catalog(), task })
const task = (more: any = {}) => ({ id: 'task-a', runId: 'run-a', revision: 3, title: 'Fix the login test', runtime: 'codex', model: 'codex/model', cwd: '/workspace/project', nativeSessionId: 'native-a', state: 'completed', events: [
  { seq: 1, type: 'assistant', text: 'Actual ', data: { messageId: 'msg-a', delta: true } },
  { seq: 2, type: 'assistant', text: 'output', data: { messageId: 'msg-a', delta: true } },
  { seq: 3, type: 'assistant', text: 'Actual output.', data: { messageId: 'msg-a', delta: false } },
  { seq: 4, type: 'tool', data: { name: 'Read', input: { path: 'src/example.js' } } },
  { seq: 5, type: 'plan', data: { steps: [{ title: 'Inspect native output', status: 'pending' }] } },
  { seq: 6, type: 'usage', data: { input_tokens: 12, output_tokens: 7 } },
  { seq: 7, type: 'permission', data: { details: 'private permission details' } },
  { seq: 8, type: 'input', data: { answers: 'private question answer' } },
], summary: 'Native output <script>no execution</script>', reason: null, allowedActions: ['request-start','request-continue','inspect'], updatedAt: '2026-10-17T07:00:00Z', ...more })

test('locale dictionaries have matching keys and no ambiguous approval or completion claim', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort())
  for (const [key, value] of Object.entries(en)) assert.ok(typeof value === 'string' && value && typeof zh[key as keyof typeof zh] === 'string' && zh[key as keyof typeof zh], key)
  assert.match(en.completed, /does not by itself mean/)
  assert.match(zh.cancelled, /不会自动撤销/)
  assert.match(en.hostHint, /does not change the normal Send/)
})

test('production client uses owned slots, scoped workspace, truthful native state and guarded chat preparation', async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><main id="app"></main></body></html>', { url: 'https://fixture.invalid' })
  const previous = Object.fromEntries(['window','document','navigator','IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  Object.defineProperties(globalThis, { window: { configurable: true, value: dom.window }, document: { configurable: true, value: dom.window.document }, navigator: { configurable: true, value: dom.window.navigator }, IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true } })
  const effects: any = [], registrations: any = [], resets: any[] = []
  let root: any
  try {
    const locale = await createOfficialLocale('zh')
    let client: any
    vm.runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), { document, AbortController, URL, Intl, setTimeout, clearTimeout, window: { __ModuleLoader__: { load(entry: any) { client = entry.factory((name: any) => { assert.equal(name, 'react'); return React }) } } } })
    client.apply({
      locale, connection: { rpc: { call: () => Promise.resolve({ ok: true, value: snapshot() }) } },
      effect(fn: any) { const dispose = fn(); effects.push(dispose); return dispose }, on(name: any, callback: any) { assert.equal(name, 'connection/reset'); resets.push(callback) },
      resources: { register(provider: any) { assert.equal(provider.protocol, 'dsh-x-agents'); return () => {} } },
      sidebarRightTabs: { register(definition: any) { assert.equal(definition.priority, 'extension'); assert.equal(definition.kind, 'dsh-x-agents'); return () => {} } },
      sidebarRight: { mounted: { getSnapshot: () => 'session-a' }, openResource() {} },
      slots: { inject(_name: any, fn: any) { const dispose = fn(); effects.push(dispose); return dispose }, register(options: any, component: any) { const entry: any = { options, component }; registrations.push(entry); return () => registrations.splice(registrations.indexOf(entry), 1) } },
    })
    assert.equal(registrations.length, 5)
    assert.equal(registrations.filter((entry: any) => entry.options.name === 'conversation.input.dock').length, 1)
    assert.equal(registrations.filter((entry: any) => entry.options.name === 'conversation.session.header.actions').length, 0)
    const panel = registrations.find((entry: any) => entry.options.name === 'sidebar.right.pane.tab')
    const entry = registrations.find((entry: any) => entry.options.name === 'conversation.input.dock')
    const tool = registrations.find((entry: any) => entry.options.key === 'dsh_x_agents_run')
    const modelsTool = registrations.find((entry: any) => entry.options.key === 'dsh_x_agents_models')
    assert.equal(modelsTool.options.inject().operationKind, 'models')
    assert.equal(tool.options.inject().operationKind, null)
    const { createRoot } = await import('react-dom/client')
    root = createRoot(document.getElementById('app')!)
    let current: any = { status: 'live', snapshot: snapshot(), error: null, pending: false }, sessionId = 'session-a', address = addressFor('scope-a','session-a'), inserted: any, rejectInsertion = false, stopped: any, mode = 'panel', refreshes = 0
    const inputActions: any = {
      captureInsertion: () => ({ start: 2, end: 8, draftRev: 7 }),
      insertText(text: any, span: any) { inserted = { text, span }; return !rejectInsertion }, persistDraft() {},
      setDraft: () => assert.fail('User draft cannot be replaced'), submit: () => assert.fail('Request cannot be auto-sent'),
    }
    function Render() {
      useSyncExternalStore<any>(locale.subscribe.bind(locale), locale.getSnapshot.bind(locale), locale.getSnapshot.bind(locale))
      const t = locale.bind(NS)
      if (mode === 'entry') return React.createElement(entry.component, {
        // Renderer-injected observable hooks require an explicit selector.
        // Keeping this contract strict catches entry crashes that an optional-selector mock hides.
        useAgents(selector: any) { assert.equal(typeof selector, 'function'); return selector(current) },
        openAgents() {}, t,
      })
      return mode === 'panel' ? React.createElement(panel.component, {
        sessionId, useTabInfo: () => ({ tab: { navigation: { address } } }), useResource: () => ({ status: 'live', value: current }), inputActions,
        cancel: async (target: any) => { stopped = target; return { ok: true } }, refresh() { refreshes++ }, t, formatTime: (value: any) => value || '—',
      }) : React.createElement(mode === 'models-tool' ? modelsTool.component : tool.component, { phase: 'result', block: { meta: { kind: 'dsh-x-agents.result', version: 1, ...current.snapshot, ...(mode === 'models-tool' ? { modelRuntime: 'claude' } : {}) }, isError: false }, operationKind: mode === 'models-tool' ? 'models' : null, t, inspect() {}, openCurrent() {} })
    }
    const render = () => act(async () => root.render(React.createElement(Render)))
    const click = async (element: any) => act(async () => element.click())
    const change = async (element: any, value: any) => act(async () => {
      const prototype = element.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLSelectElement.prototype
      ;(Object.getOwnPropertyDescriptor(prototype, 'value'))!.set!.call(element, value)
      element.dispatchEvent(new dom.window.Event(element.tagName === 'TEXTAREA' ? 'input' : 'change', { bubbles: true }))
    })
    await render()
    assert.match(document.body.textContent, /DSH 协调/)
    assert.match(document.body.textContent, /准备委派/)
    assert.match(document.body.textContent, /认证尚未验证/)
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('select'))!.value, 'codex')
    assert.equal(([...document.querySelectorAll('option')].find(option => option.value === 'claude'))!.disabled, true)
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-prepare .dxa-primary'))!.disabled, true)
    // Both fields share the same grid row; catalog actions must not stretch one field.
    const fields = document.querySelector<HTMLElement & HTMLInputElement>('.dxa-selectors')
    assert.equal((fields)!.children.length, 2)
    assert.ok([...(fields)!.children].every(field => field.tagName === 'LABEL' && field.querySelector('select')))
    assert.equal((fields)!.querySelector('button'), null)
    assert.ok(document.querySelector<HTMLElement & HTMLInputElement>('.dxa-catalog-heading .dxa-model-request'))
    const runtimeDetails = document.querySelector<HTMLElement & HTMLInputElement>('.dxa-runtime-details')
    assert.equal((runtimeDetails as any).open, false)
    assert.match((runtimeDetails)!.textContent, /Fixture protocol only/)
    assert.ok(document.querySelector<HTMLElement & HTMLInputElement>('.dxa-prepare .dxa-availability'))

    // New adapter integration is driven by the actual catalog, not a static
    // provider label. An unconfigured integration stays unavailable.
    current = { ...current, snapshot: { ...snapshot(), catalog: catalog().map((item: any) => ['claude', 'grok'].includes(item.id) ? { ...item, reason: 'not-configured' } : item) } }; await render()
    for (const runtime of ['claude', 'grok'] as const) {
      const option = [...(document.querySelector<HTMLElement & HTMLInputElement>('select') as any).options].find((item: any) => item.value === runtime)
      assert.equal(option.disabled, true)
      assert.match(option.textContent, /不可用/)
      assert.doesNotMatch(option.textContent, /尚未接入/)
    }
    current = { ...current, snapshot: { ...snapshot(), catalog: catalog().map((item: any) => item.id === 'claude'
      ? { ...item, available: true, authenticated: null, reason: 'authentication-not-verified', limitations: ['API authentication is required.'] }
      : item.id === 'grok' ? { ...item, available: true, authenticated: false, reason: 'sign-in-required', models: [], capabilities: { ...caps, models: false } } : item) } }; await render()
    for (const runtime of ['claude', 'grok'] as const) assert.equal([...(document.querySelector<HTMLElement & HTMLInputElement>('select') as any).options].find((item: any) => item.value === runtime).disabled, false)
    await change(document.querySelector<HTMLElement & HTMLInputElement>('select'), 'claude')
    await change(document.querySelector<HTMLElement & HTMLInputElement>('textarea'), 'Review using this native Agent')
    await change(document.querySelectorAll('select')[1], 'claude/model')
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-prepare'))!.textContent, /运行时认证尚未验证/)
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-prepare'))!.textContent, /模型供应方认证: 尚未验证/)
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-prepare'))!.textContent, /API authentication is required/)
    await click(document.querySelector<HTMLElement & HTMLInputElement>('.dxa-prepare .dxa-primary'))
    assert.match(((inserted)! as any).text, /"runtime": "claude"/)
    assert.match(((inserted)! as any).text, /"model": "claude\/model"/)
    await change(document.querySelector<HTMLElement & HTMLInputElement>('select'), 'grok')
    assert.equal(document.querySelectorAll('select')[1].disabled, true)
    assert.equal(document.querySelectorAll('select')[1].value, '')
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-prepare'))!.textContent, /运行时需要登录/)
    await click(document.querySelector<HTMLElement & HTMLInputElement>('.dxa-prepare .dxa-primary'))
    assert.match(((inserted)! as any).text, /"runtime": "grok"/)
    assert.doesNotMatch(((inserted)! as any).text, /"model"/)
    const beforeUnavailable = ((inserted)! as any).text
    current = { ...current, snapshot: { ...current.snapshot, catalog: current.snapshot.catalog.map((item: any) => item.id === 'grok' ? { ...item, available: false, reason: 'not-configured' } : item) } }; await render()
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('select'))!.value, 'grok')
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-prepare .dxa-primary'))!.disabled, true)
    await click(document.querySelector<HTMLElement & HTMLInputElement>('.dxa-prepare .dxa-primary'))
    assert.equal(((inserted)! as any).text, beforeUnavailable)
    current = { ...current, snapshot: snapshot() }; await render()
    await change(document.querySelector<HTMLElement & HTMLInputElement>('select'), 'codex')

    await change(document.querySelector<HTMLElement & HTMLInputElement>('textarea'), 'Fix only the login test')
    await change(document.querySelectorAll('select')[1], 'codex/model')
    await click(document.querySelector<HTMLElement & HTMLInputElement>('.dxa-prepare .dxa-primary'))
    assert.match(((inserted)! as any).text, /"runtime": "codex"/)
    assert.match(((inserted)! as any).text, /"model": "codex\/model"/)
    assert.match(((inserted)! as any).text, /"scope": "scope-a"/)
    assert.match(((inserted)! as any).text, /Fix only the login test/)
    assert.deepEqual(JSON.parse(JSON.stringify(((inserted)! as any).span)), { start: 8, end: 8, draftRev: 7 })
    assert.match(document.body.textContent, /尚未发送/)
    await act(async () => locale.setLocale('en'))
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('textarea'))!.value, 'Fix only the login test')
    assert.match(document.body.textContent, /DSH coordinates/)
    rejectInsertion = true
    await click(document.querySelector<HTMLElement & HTMLInputElement>('.dxa-prepare .dxa-primary'))
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('[role="alert"]'))!.textContent, /Nothing was inserted/)
    rejectInsertion = false
    await change(document.querySelector<HTMLElement & HTMLInputElement>('select'), 'opencode')
    assert.equal(document.querySelectorAll('select')[1].value, '')
    assert.equal([...document.querySelectorAll('select')[1].options].some(option => option.value === 'codex/model'), false)
    current = { ...current, snapshot: snapshot(task()) }; await render()
    assert.doesNotMatch(document.body.textContent, /The request was added without sending/)
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('textarea'))!.value, 'Fix only the login test')
    await click([...document.querySelectorAll('.dxa-modes button')].find(button => button.textContent === en.nextTurn))
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('select'))!.value, 'codex')
    assert.equal(document.querySelectorAll('select')[1].value, 'codex/model')
    assert.equal(document.querySelectorAll('select')[1].disabled, true)
    await click(document.querySelector<HTMLElement & HTMLInputElement>('.dxa-prepare .dxa-primary'))
    assert.match(((inserted)! as any).text, /"taskId": "task-a"/)
    assert.match(((inserted)! as any).text, /"expectedRevision": 3/)
    assert.match(((inserted)! as any).text, /"model": "codex\/model"/)
    assert.equal(document.querySelectorAll('[data-event="assistant"]').length, 1)
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('[data-event="assistant"] pre'))!.textContent, 'Actual output.')
    assert.equal(document.querySelectorAll('.dxa-event-data').length, 3)
    for (const type of ['tool', 'plan', 'usage'] as const) {
      const details = document.querySelector<HTMLElement & HTMLInputElement>(`[data-event="${type}"] .dxa-event-data`)
      assert.equal((details as any).open, false)
      assert.equal(((details)!.querySelector('summary'))!.textContent, en.eventData)
    }
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('[data-event="tool"] pre'))!.textContent, /src\/example.js/)
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('[data-event="plan"] pre'))!.textContent, /Inspect native output/)
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('[data-event="usage"] pre'))!.textContent, /"input_tokens": 12/)
    await click(document.querySelector<HTMLElement & HTMLInputElement>('[data-event="tool"] summary'))
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('[data-event="tool"] details') as any).open, true)
    assert.doesNotMatch(document.body.textContent, /private permission details|private question answer/)
    await act(async () => locale.setLocale('zh'))
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('[data-event="tool"] summary'))!.textContent, zh.eventData)
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('[data-event="tool"] details'))!.textContent, /不能保证移除所有敏感内容/)
    await act(async () => locale.setLocale('en'))
    assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('script'), null)
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-status'))!.textContent, en['state.completed'])
    assert.match(document.body.textContent, /does not by itself mean that tests/)
    current = { ...current, snapshot: snapshot(task({ state: 'waiting_permission', allowedActions: ['cancel'] })) }; await render()
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-next'))!.textContent, /panel cannot grant permission/)
    assert.doesNotMatch(document.body.textContent, /The request was added without sending/)
    assert.equal([...document.querySelectorAll('button')].some(button => /^(Allow|Approve|允许|批准)$/.test(button.textContent)), false)
    await click(document.querySelector<HTMLElement & HTMLInputElement>('.dxa-stop button'))
    assert.deepEqual(JSON.parse(JSON.stringify(stopped)), { scope: 'scope-a', taskId: 'task-a', runId: 'run-a' })
    current = { ...current, status: 'failed' }; await render()
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-stop button'))!.disabled, true)
    assert.match(document.body.textContent, /last received state/)
    current = { ...current, status: 'live', snapshot: snapshot(task({ state: 'running', cancellationRequested: true, allowedActions: [] })) }; await render()
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-status'))!.textContent, en['state.stopping'])
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-next'))!.textContent, /Waiting for the native process/)
    assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('.dxa-stop'), null)
    assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('.dxa-prepare'), null)
    current = { status: 'scope-changed', snapshot: null, error: null, pending: false }; await render()
    assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('.dxa-workspace'), null)
    assert.doesNotMatch(document.body.textContent, /Fix the login test|native-a/)
    assert.match(document.body.textContent, /profile changed/)
    current = { status: 'live', snapshot: snapshot(task()), error: null, pending: false }; sessionId = 'session-b'; await render()
    assert.match(document.body.textContent, /does not belong/)
    assert.doesNotMatch(document.body.textContent, /Fix the login test/)
    sessionId = 'session-a'
    const unchecked = snapshot()
    unchecked.catalog = unchecked.catalog.map((item: any) => ({ ...item, capabilities: Object.fromEntries(CAPABILITIES.map(key => [key, false])) }))
    current = { status: 'live', snapshot: unchecked, error: null, pending: false }; await render()
    assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('textarea'), null)
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-prepare .dxa-primary'))!.textContent, en.inspect)
    await click(document.querySelector<HTMLElement & HTMLInputElement>('.dxa-prepare .dxa-primary'))
    assert.match(((inserted)! as any).text, /dsh_x_agents_inspect/)
    assert.doesNotMatch(((inserted)! as any).text, /dsh_x_agents_run/)

    // Catalog discovery is an explicit, draft-preserving tool request. It can
    // run before any task, and its states never masquerade as task completion.
    const notLoaded: any = { status: 'not-loaded', fetchedAt: null, expiresAt: null, source: 'native-protocol', truncated: false, accessVerified: false }
    const modelsSnapshot: any = { ...snapshot(), catalog: catalog().map((item: any) => ({ ...item, available: true, authenticated: null, reason: 'requires-native-initialization', models: [], capabilities: { ...caps, models: false }, modelCatalog: notLoaded })) }
    current = { status: 'live', snapshot: modelsSnapshot, error: null, pending: false }; await render()
    await change(document.querySelector<HTMLElement & HTMLInputElement>('select'), 'claude')
    await change(document.querySelector<HTMLElement & HTMLInputElement>('textarea'), 'Keep this task goal')
    const beforeModels = structuredClone(current.snapshot)
    assert.equal(document.querySelectorAll('select')[1].value, '')
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-model-request'))!.textContent, en.modelsGet)
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-model-request'))!.disabled, false)
    await click(document.querySelector<HTMLElement & HTMLInputElement>('.dxa-model-request'))
    assert.match(((inserted)! as any).text, /dsh_x_agents_models/)
    assert.deepEqual(JSON.parse(((inserted)! as any).text.slice(((inserted)! as any).text.indexOf('{'))), { runtime: 'claude', scope: 'scope-a' })
    assert.doesNotMatch(((inserted)! as any).text, /"prompt"|"taskId"|"expectedRevision"/)
    assert.deepEqual(current.snapshot, beforeModels)
    assert.match(document.body.textContent, /The request was added without sending/)
    rejectInsertion = true
    await click(document.querySelector<HTMLElement & HTMLInputElement>('.dxa-model-request'))
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('[role="alert"]'))!.textContent, /Nothing was inserted/)
    rejectInsertion = false
    await click(document.querySelector<HTMLElement & HTMLInputElement>('.dxa-model-request'))
    current = { ...current, snapshot: { ...modelsSnapshot, operation: { kind: 'models', runtime: 'claude', state: 'waiting_permission' } } }; await render()
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-model-operation'))!.textContent, /waiting for approval/)
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-model-operation'))!.textContent, /panel cannot grant permission/)
    assert.doesNotMatch(document.body.textContent, /The request was added without sending/)
    assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('.dxa-current'), null)
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-model-request'))!.disabled, true)
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-prepare .dxa-primary'))!.disabled, true)
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-connections button'))!.disabled, true)
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('textarea'))!.value, 'Keep this task goal')
    assert.equal([...document.querySelectorAll('button')].some(button => /^(Allow|Approve|允许|批准)$/.test(button.textContent)), false)
    current = { ...current, snapshot: { ...modelsSnapshot, operation: { kind: 'models', runtime: 'claude', state: 'discovering' } } }; await render()
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-model-operation'))!.textContent, /conversation Stop button/)
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('textarea'))!.value, 'Keep this task goal')
    const blocked: any = { kind: 'models', runtime: 'claude', state: 'blocked', reason: 'Native cleanup is not confirmed after restart' }
    current = { ...current, snapshot: { ...modelsSnapshot, revision: 0, operation: blocked } }; await render()
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-model-operation'))!.textContent, /manual recovery/)
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-model-operation'))!.textContent, /after restart/)
    assert.doesNotMatch((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-model-operation'))!.textContent, /Reading the native model catalog/)
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-prepare .dxa-primary'))!.disabled, true)
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-model-request'))!.disabled, true)
    current = { ...current, snapshot: { ...unchecked, revision: 0, operation: blocked } }; await render()
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-prepare .dxa-primary'))!.textContent, en.inspect)
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-prepare .dxa-primary'))!.disabled, true)
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-connections button'))!.disabled, true)
    const fresh: any = { ...notLoaded, status: 'fresh', fetchedAt: '2026-10-17T08:00:00Z', expiresAt: '2026-10-17T08:05:00Z', source: 'native-model-advertisement' }
    const fetchedSnapshot: any = { ...modelsSnapshot, catalog: modelsSnapshot.catalog.map((item: any) => item.id === 'claude' ? { ...item, capabilities: { ...caps, models: true }, models: [{ id: 'claude-advertised', label: 'Native Claude model' }], modelCatalog: fresh } : item) }
    current = { ...current, snapshot: fetchedSnapshot }; await render()
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-model-request'))!.textContent, en.modelsUpdate)
    assert.equal(document.querySelectorAll('select')[1].disabled, false)
    assert.equal(document.querySelectorAll('select')[1].value, '')
    assert.deepEqual([...document.querySelectorAll('select')[1].options].map(option => option.value), ['', 'claude-advertised'])
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-model-catalog'))!.textContent, /1 models returned/)
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-model-catalog'))!.textContent, /not proof of account access, available credit or quota/)
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-model-catalog details'))!.textContent, /native-model-advertisement/)
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-model-catalog details') as any).open, false)
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('textarea'))!.value, 'Keep this task goal')
    await change(document.querySelectorAll('select')[1], 'claude-advertised')
    for (const status of ['stale', 'failed'] as const) {
      current = { ...current, snapshot: { ...fetchedSnapshot, catalog: fetchedSnapshot.catalog.map((item: any) => item.id === 'claude' ? { ...item, modelCatalog: { ...fresh, status, ...(status === 'failed' ? { error: 'Native catalog request failed' } : {}) } } : item) } }; await render()
      assert.equal(document.querySelectorAll('select')[1].value, 'claude-advertised')
      assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-model-request'))!.disabled, false)
      assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-model-catalog'))!.dataset.catalogState, status)
      assert.match((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-model-catalog .dxa-warning'))!.textContent, status === 'stale' ? /out of date/ : /update failed/)
    }
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-model-catalog'))!.textContent, /Native catalog request failed/)
    const previousInserted = ((inserted)! as any).text
    await click(document.querySelector<HTMLElement & HTMLInputElement>('.dxa-header button'))
    assert.equal(refreshes, 1)
    assert.equal(((inserted)! as any).text, previousInserted)
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-header button'))!.textContent, en.snapshotRefresh)
    await act(async () => locale.setLocale('zh'))
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-model-request'))!.textContent, zh.modelsUpdate)
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-model-catalog'))!.textContent, /不代表已验证账户可调用、余额或额度/)
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('textarea'))!.value, 'Keep this task goal')
    await act(async () => locale.setLocale('en'))
    current = { ...current, snapshot: { ...fetchedSnapshot, task: task() } }; mode = 'models-tool'; await render()
    assert.match(document.body.textContent, /Model catalog/)
    assert.match(document.body.textContent, /Catalog updated/)
    assert.match(document.body.textContent, /claude/)
    assert.doesNotMatch(document.body.textContent, /Fix the login test|Native output|Turn ended/)
    assert.equal(document.querySelectorAll('button').length, 2)
    current = { status: 'live', snapshot: snapshot(task()), error: null, pending: false }; mode = 'tool'; await render()
    assert.match(document.body.textContent, /Historical operation result/)
    assert.match(document.body.textContent, /does not by itself mean/)
    assert.equal(document.querySelectorAll('button').length, 2)
    mode = 'entry'; await render()
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-entry'))!.disabled, false)
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-entry'))!.textContent, /Agents.*Turn ended/)
    current = { status: 'loading', snapshot: null, error: null, pending: false }; await render()
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-entry'))!.disabled, true)
    current = { status: 'failed', snapshot: null, error: { code: 'agents/connection' }, pending: false }; await render()
    assert.equal((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-entry'))!.disabled, false)
    assert.match((document.querySelector<HTMLElement & HTMLInputElement>('.dxa-entry'))!.textContent, /Refresh/)
    assert.ok((document.querySelector<HTMLElement & HTMLInputElement>('style[data-plugin="dsh-x-agents"]'))!.textContent.includes('var(--dsw-alias-label-primary'))
  } finally {
    if (root) await act(async () => root.unmount())
    effects.reverse().forEach((dispose: any) => dispose?.())
    assert.equal(registrations.length, 0)
    assert.equal(document.querySelector<HTMLElement & HTMLInputElement>('style[data-plugin="dsh-x-agents"]'), null)
    dom.window.close()
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key as keyof typeof globalThis] }
  }
})
