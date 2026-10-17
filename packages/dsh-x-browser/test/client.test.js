import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'
import React, { act, useSyncExternalStore } from 'react'
import { createOfficialLocale } from '../../../test/fixtures/locale.mjs'
import { en, zh } from '../src/client/locales.js'

test('locale keys are complete and experimental/consent limits are visible in both languages', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort())
  assert.match(en.consent, /Passwords/); assert.match(zh.consent, /密码/)
})
test('compiled UI registers its own right-sidebar tab and shows honest web limitation in English and Chinese', async () => {
  const dom = new JSDOM('<html><head></head><body><div id="app"></div></body></html>', { url: 'http://localhost/' })
  const originals = { window: globalThis.window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT }
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const locale = await createOfficialLocale('en'), entries = new Map(), effects = [], definitions = [], requests = []
  let exported
  const slots = { inject(_key, fn) { return fn() }, register(options, component) { entries.set(options.name, { options, component }); return () => {} } }
  const ctx = { slots, locale, connection: { rpc: { call: async (...args) => { requests.push(args); return { ok: true, value: {} } } } }, sidebarRight: { openTab() {} }, sidebarRightTabs: { register(definition) { definitions.push(definition); return () => {} } }, on() {}, effect(fn) { const cleanup = fn(); effects.push(cleanup); return cleanup } }
  vm.runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), { window: { __ModuleLoader__: { load(entry) { exported = entry.factory(name => { assert.equal(name, 'react'); return React }) } } }, globalThis, document: dom.window.document, AbortController, URL, setTimeout, clearTimeout, console, TextEncoder })
  const { createRoot } = await import('react-dom/client'), root = createRoot(document.getElementById('app'))
  const abort = new AbortController(), actions = { bindCommands() { return () => {} }, openTab() {} }
  const useTabInfo = () => ({ tab: { id: 'ui-tab', visible: true, signal: abort.signal, actions, navigation: {} } })
  let entry
  function Render() { useSyncExternalStore(locale.subscribe.bind(locale), locale.getSnapshot.bind(locale), locale.getSnapshot.bind(locale)); return React.createElement(entry.component, { sessionId: 'session', useTabInfo, ...entry.options.inject('session'), t: locale.bind(entry.options.locale) }) }
  try {
    await act(async () => exported.apply(ctx)); entry = entries.get('sidebar.right.pane.tab')
    assert.equal(definitions[0].kind, 'dsh-x-browser'); assert.equal(definitions[0].multiple, true); assert.equal(definitions[0].keepMounted, true)
    assert.equal(entries.has('main'), false)
    await act(async () => { root.render(React.createElement(Render)); await new Promise(resolve => setTimeout(resolve, 0)) })
    assert.match(document.body.textContent, /Web preview cannot embed Chromium/)
    assert.equal(document.querySelector('[data-testid="dxb-enable-ai"]').disabled, true)
    assert.equal(document.querySelectorAll('iframe,webview').length, 0)
    assert.equal(requests.length, 0)
    await act(async () => { await locale.setLocale('zh') })
    assert.match(document.body.textContent, /网页版预览不能内嵌 Chromium/)
    assert.equal(document.querySelector('[data-testid="dxb-address"]').getAttribute('aria-label'), '网页地址')
    assert.match(document.querySelector('style').textContent, /max-width:420px/)
  } finally {
    await act(async () => { root.unmount(); for (const effect of effects.reverse()) if (typeof effect === 'function') await effect() })
    Object.assign(globalThis, originals); dom.window.close()
  }
})
