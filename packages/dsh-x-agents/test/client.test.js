import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import React, { act, useSyncExternalStore } from 'react'
import { JSDOM } from 'jsdom'
import { createOfficialLocale } from '../../../test/fixtures/locale.mjs'
import { NS, en, zh } from '../src/client/locales.js'
import { CAPABILITIES, addressFor } from '../src/client/model.js'

const caps = Object.fromEntries(CAPABILITIES.map(key => [key, true]))
const catalog = () => ['codex', 'opencode', 'claude', 'grok'].map(id => ({ id, label: id, transport: 'fixture', available: ['claude','grok'].includes(id) ? false : null, authenticated: null, version: null, reason: ['claude','grok'].includes(id) ? 'not-integrated' : 'not-inspected', models: [{ id: `${id}/model`, label: `${id} model` }], capabilities: caps, limitations: ['Fixture protocol only'], providerAuthentication: 'unverified', sandbox: { enforcement: 'not-verified' } }))
const snapshot = (task = null) => ({ scope: 'scope-a', sessionId: 'session-a', revision: 1, catalog: catalog(), task })
const task = (more = {}) => ({ id: 'task-a', runId: 'run-a', revision: 3, title: 'Fix the login test', runtime: 'codex', model: 'codex/model', cwd: '/workspace/project', nativeSessionId: 'native-a', state: 'completed', events: [
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
  for (const [key, value] of Object.entries(en)) assert.ok(typeof value === 'string' && value && typeof zh[key] === 'string' && zh[key], key)
  assert.match(en.completed, /does not by itself mean/)
  assert.match(zh.cancelled, /不会自动撤销/)
  assert.match(en.hostHint, /does not change the normal Send/)
})

test('production client uses owned slots, scoped workspace, truthful native state and guarded chat preparation', async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><main id="app"></main></body></html>', { url: 'https://fixture.invalid' })
  const previous = Object.fromEntries(['window','document','navigator','IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  Object.defineProperties(globalThis, { window: { configurable: true, value: dom.window }, document: { configurable: true, value: dom.window.document }, navigator: { configurable: true, value: dom.window.navigator }, IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true } })
  const effects = [], registrations = [], resets = []
  let root
  try {
    const locale = await createOfficialLocale('zh')
    let client
    vm.runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), { document, AbortController, URL, Intl, setTimeout, clearTimeout, window: { __ModuleLoader__: { load(entry) { client = entry.factory(name => { assert.equal(name, 'react'); return React }) } } } })
    client.apply({
      locale, connection: { rpc: { call: () => Promise.resolve({ ok: true, value: snapshot() }) } },
      effect(fn) { const dispose = fn(); effects.push(dispose); return dispose }, on(name, callback) { assert.equal(name, 'connection/reset'); resets.push(callback) },
      resources: { register(provider) { assert.equal(provider.protocol, 'dsh-x-agents'); return () => {} } },
      sidebarRightTabs: { register(definition) { assert.equal(definition.priority, 'extension'); assert.equal(definition.kind, 'dsh-x-agents'); return () => {} } },
      sidebarRight: { mounted: { getSnapshot: () => 'session-a' }, openResource() {} },
      slots: { inject(_name, fn) { const dispose = fn(); effects.push(dispose); return dispose }, register(options, component) { const entry = { options, component }; registrations.push(entry); return () => registrations.splice(registrations.indexOf(entry), 1) } },
    })
    assert.equal(registrations.length, 4)
    assert.equal(registrations.filter(entry => entry.options.name === 'conversation.input.dock').length, 1)
    assert.equal(registrations.filter(entry => entry.options.name === 'conversation.session.header.actions').length, 0)
    const panel = registrations.find(entry => entry.options.name === 'sidebar.right.pane.tab')
    const entry = registrations.find(entry => entry.options.name === 'conversation.input.dock')
    const tool = registrations.find(entry => entry.options.key === 'dsh_x_agents_run')
    const { createRoot } = await import('react-dom/client')
    root = createRoot(document.getElementById('app'))
    let current = { status: 'live', snapshot: snapshot(), error: null, pending: false }, sessionId = 'session-a', address = addressFor('scope-a','session-a'), inserted, rejectInsertion = false, stopped, mode = 'panel'
    const inputActions = {
      captureInsertion: () => ({ start: 2, end: 8, draftRev: 7 }),
      insertText(text, span) { inserted = { text, span }; return !rejectInsertion }, persistDraft() {},
      setDraft: () => assert.fail('User draft cannot be replaced'), submit: () => assert.fail('Request cannot be auto-sent'),
    }
    function Render() {
      useSyncExternalStore(locale.subscribe.bind(locale), locale.getSnapshot.bind(locale), locale.getSnapshot.bind(locale))
      const t = locale.bind(NS)
      if (mode === 'entry') return React.createElement(entry.component, {
        // Renderer-injected observable hooks require an explicit selector.
        // Keeping this contract strict catches entry crashes that an optional-selector mock hides.
        useAgents(selector) { assert.equal(typeof selector, 'function'); return selector(current) },
        openAgents() {}, t,
      })
      return mode === 'panel' ? React.createElement(panel.component, {
        sessionId, useTabInfo: () => ({ tab: { navigation: { address } } }), useResource: () => ({ status: 'live', value: current }), inputActions,
        cancel: async target => { stopped = target; return { ok: true } }, refresh() {}, t, formatTime: value => value || '—',
      }) : React.createElement(tool.component, { phase: 'result', block: { meta: { kind: 'dsh-x-agents.result', version: 1, ...current.snapshot }, isError: false }, t, inspect() {}, openCurrent() {} })
    }
    const render = () => act(async () => root.render(React.createElement(Render)))
    const click = async element => act(async () => element.click())
    const change = async (element, value) => act(async () => {
      const prototype = element.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLSelectElement.prototype
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value)
      element.dispatchEvent(new dom.window.Event(element.tagName === 'TEXTAREA' ? 'input' : 'change', { bubbles: true }))
    })
    await render()
    assert.match(document.body.textContent, /DSH 协调/)
    assert.match(document.body.textContent, /准备委派/)
    assert.match(document.body.textContent, /认证尚未验证/)
    assert.equal(document.querySelector('select').value, 'codex')
    assert.equal([...document.querySelectorAll('option')].find(option => option.value === 'claude').disabled, true)
    assert.equal(document.querySelector('.dxa-prepare .dxa-primary').disabled, true)

    // New adapter integration is driven by the actual catalog, not a static
    // provider label. An unconfigured integration stays unavailable.
    current = { ...current, snapshot: { ...snapshot(), catalog: catalog().map(item => ['claude', 'grok'].includes(item.id) ? { ...item, reason: 'not-configured' } : item) } }; await render()
    for (const runtime of ['claude', 'grok']) {
      const option = [...document.querySelector('select').options].find(item => item.value === runtime)
      assert.equal(option.disabled, true)
      assert.match(option.textContent, /不可用/)
      assert.doesNotMatch(option.textContent, /尚未接入/)
    }
    current = { ...current, snapshot: { ...snapshot(), catalog: catalog().map(item => item.id === 'claude'
      ? { ...item, available: true, authenticated: null, reason: 'authentication-not-verified', limitations: ['API authentication is required.'] }
      : item.id === 'grok' ? { ...item, available: true, authenticated: false, reason: 'sign-in-required', models: [], capabilities: { ...caps, models: false } } : item) } }; await render()
    for (const runtime of ['claude', 'grok']) assert.equal([...document.querySelector('select').options].find(item => item.value === runtime).disabled, false)
    await change(document.querySelector('select'), 'claude')
    await change(document.querySelector('textarea'), 'Review using this native Agent')
    await change(document.querySelectorAll('select')[1], 'claude/model')
    assert.match(document.querySelector('.dxa-prepare').textContent, /运行时认证尚未验证/)
    assert.match(document.querySelector('.dxa-prepare').textContent, /模型供应方认证: 尚未验证/)
    assert.match(document.querySelector('.dxa-prepare').textContent, /API authentication is required/)
    await click(document.querySelector('.dxa-prepare .dxa-primary'))
    assert.match(inserted.text, /"runtime": "claude"/)
    assert.match(inserted.text, /"model": "claude\/model"/)
    await change(document.querySelector('select'), 'grok')
    assert.equal(document.querySelectorAll('select')[1].disabled, true)
    assert.equal(document.querySelectorAll('select')[1].value, '')
    assert.match(document.querySelector('.dxa-prepare').textContent, /运行时需要登录/)
    await click(document.querySelector('.dxa-prepare .dxa-primary'))
    assert.match(inserted.text, /"runtime": "grok"/)
    assert.doesNotMatch(inserted.text, /"model"/)
    const beforeUnavailable = inserted.text
    current = { ...current, snapshot: { ...current.snapshot, catalog: current.snapshot.catalog.map(item => item.id === 'grok' ? { ...item, available: false, reason: 'not-configured' } : item) } }; await render()
    assert.equal(document.querySelector('select').value, 'grok')
    assert.equal(document.querySelector('.dxa-prepare .dxa-primary').disabled, true)
    await click(document.querySelector('.dxa-prepare .dxa-primary'))
    assert.equal(inserted.text, beforeUnavailable)
    current = { ...current, snapshot: snapshot() }; await render()
    await change(document.querySelector('select'), 'codex')

    await change(document.querySelector('textarea'), 'Fix only the login test')
    await change(document.querySelectorAll('select')[1], 'codex/model')
    await click(document.querySelector('.dxa-prepare .dxa-primary'))
    assert.match(inserted.text, /"runtime": "codex"/)
    assert.match(inserted.text, /"model": "codex\/model"/)
    assert.match(inserted.text, /"scope": "scope-a"/)
    assert.match(inserted.text, /Fix only the login test/)
    assert.deepEqual(JSON.parse(JSON.stringify(inserted.span)), { start: 8, end: 8, draftRev: 7 })
    assert.match(document.body.textContent, /尚未发送/)
    await act(async () => locale.setLocale('en'))
    assert.equal(document.querySelector('textarea').value, 'Fix only the login test')
    assert.match(document.body.textContent, /DSH coordinates/)
    rejectInsertion = true
    await click(document.querySelector('.dxa-prepare .dxa-primary'))
    assert.match(document.querySelector('[role="alert"]').textContent, /Nothing was inserted/)
    rejectInsertion = false
    await change(document.querySelector('select'), 'opencode')
    assert.equal(document.querySelectorAll('select')[1].value, '')
    assert.equal([...document.querySelectorAll('select')[1].options].some(option => option.value === 'codex/model'), false)
    current = { ...current, snapshot: snapshot(task()) }; await render()
    assert.doesNotMatch(document.body.textContent, /The request was added without sending/)
    assert.equal(document.querySelector('textarea').value, 'Fix only the login test')
    await click([...document.querySelectorAll('.dxa-modes button')].find(button => button.textContent === en.nextTurn))
    assert.equal(document.querySelector('select').value, 'codex')
    assert.equal(document.querySelectorAll('select')[1].value, 'codex/model')
    assert.equal(document.querySelectorAll('select')[1].disabled, true)
    await click(document.querySelector('.dxa-prepare .dxa-primary'))
    assert.match(inserted.text, /"taskId": "task-a"/)
    assert.match(inserted.text, /"expectedRevision": 3/)
    assert.match(inserted.text, /"model": "codex\/model"/)
    assert.equal(document.querySelectorAll('[data-event="assistant"]').length, 1)
    assert.equal(document.querySelector('[data-event="assistant"] pre').textContent, 'Actual output.')
    assert.equal(document.querySelectorAll('.dxa-event-data').length, 3)
    for (const type of ['tool', 'plan', 'usage']) {
      const details = document.querySelector(`[data-event="${type}"] .dxa-event-data`)
      assert.equal(details.open, false)
      assert.equal(details.querySelector('summary').textContent, en.eventData)
    }
    assert.match(document.querySelector('[data-event="tool"] pre').textContent, /src\/example.js/)
    assert.match(document.querySelector('[data-event="plan"] pre').textContent, /Inspect native output/)
    assert.match(document.querySelector('[data-event="usage"] pre').textContent, /"input_tokens": 12/)
    await click(document.querySelector('[data-event="tool"] summary'))
    assert.equal(document.querySelector('[data-event="tool"] details').open, true)
    assert.doesNotMatch(document.body.textContent, /private permission details|private question answer/)
    await act(async () => locale.setLocale('zh'))
    assert.equal(document.querySelector('[data-event="tool"] summary').textContent, zh.eventData)
    assert.match(document.querySelector('[data-event="tool"] details').textContent, /不能保证移除所有敏感内容/)
    await act(async () => locale.setLocale('en'))
    assert.equal(document.querySelector('script'), null)
    assert.equal(document.querySelector('.dxa-status').textContent, en['state.completed'])
    assert.match(document.body.textContent, /does not by itself mean that tests/)
    current = { ...current, snapshot: snapshot(task({ state: 'waiting_permission', allowedActions: ['cancel'] })) }; await render()
    assert.match(document.querySelector('.dxa-next').textContent, /panel cannot grant permission/)
    assert.doesNotMatch(document.body.textContent, /The request was added without sending/)
    assert.equal([...document.querySelectorAll('button')].some(button => /^(Allow|Approve|允许|批准)$/.test(button.textContent)), false)
    await click(document.querySelector('.dxa-stop button'))
    assert.deepEqual(JSON.parse(JSON.stringify(stopped)), { scope: 'scope-a', taskId: 'task-a', runId: 'run-a' })
    current = { ...current, status: 'failed' }; await render()
    assert.equal(document.querySelector('.dxa-stop button').disabled, true)
    assert.match(document.body.textContent, /last received state/)
    current = { ...current, status: 'live', snapshot: snapshot(task({ state: 'running', cancellationRequested: true, allowedActions: [] })) }; await render()
    assert.equal(document.querySelector('.dxa-status').textContent, en['state.stopping'])
    assert.match(document.querySelector('.dxa-next').textContent, /Waiting for the native process/)
    assert.equal(document.querySelector('.dxa-stop'), null)
    assert.equal(document.querySelector('.dxa-prepare'), null)
    current = { status: 'scope-changed', snapshot: null, error: null, pending: false }; await render()
    assert.equal(document.querySelector('.dxa-workspace'), null)
    assert.doesNotMatch(document.body.textContent, /Fix the login test|native-a/)
    assert.match(document.body.textContent, /profile changed/)
    current = { status: 'live', snapshot: snapshot(task()), error: null, pending: false }; sessionId = 'session-b'; await render()
    assert.match(document.body.textContent, /does not belong/)
    assert.doesNotMatch(document.body.textContent, /Fix the login test/)
    sessionId = 'session-a'
    const unchecked = snapshot()
    unchecked.catalog = unchecked.catalog.map(item => ({ ...item, capabilities: Object.fromEntries(CAPABILITIES.map(key => [key, false])) }))
    current = { status: 'live', snapshot: unchecked, error: null, pending: false }; await render()
    assert.equal(document.querySelector('textarea'), null)
    assert.equal(document.querySelector('.dxa-prepare .dxa-primary').textContent, en.inspect)
    await click(document.querySelector('.dxa-prepare .dxa-primary'))
    assert.match(inserted.text, /dsh_x_agents_inspect/)
    assert.doesNotMatch(inserted.text, /dsh_x_agents_run/)
    current = { status: 'live', snapshot: snapshot(task()), error: null, pending: false }; mode = 'tool'; await render()
    assert.match(document.body.textContent, /Historical operation result/)
    assert.match(document.body.textContent, /does not by itself mean/)
    assert.equal(document.querySelectorAll('button').length, 2)
    mode = 'entry'; await render()
    assert.equal(document.querySelector('.dxa-entry').disabled, false)
    assert.match(document.querySelector('.dxa-entry').textContent, /Agents.*Turn ended/)
    current = { status: 'loading', snapshot: null, error: null, pending: false }; await render()
    assert.equal(document.querySelector('.dxa-entry').disabled, true)
    current = { status: 'failed', snapshot: null, error: { code: 'agents/connection' }, pending: false }; await render()
    assert.equal(document.querySelector('.dxa-entry').disabled, false)
    assert.match(document.querySelector('.dxa-entry').textContent, /Refresh/)
    assert.ok(document.querySelector('style[data-plugin="dsh-x-agents"]').textContent.includes('var(--dsw-alias-label-primary'))
  } finally {
    if (root) await act(async () => root.unmount())
    effects.reverse().forEach(dispose => dispose?.())
    assert.equal(registrations.length, 0)
    assert.equal(document.querySelector('style[data-plugin="dsh-x-agents"]'), null)
    dom.window.close()
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
  }
})
