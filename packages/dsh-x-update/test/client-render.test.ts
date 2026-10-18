import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { en, NS } from '../src/client/locales.ts'
import type { UpdateStatus } from '../src/types.ts'

const require = createRequire(import.meta.url)

async function loadFactory(path: string | URL, imports: (name: string) => unknown, globals: Record<string, unknown> = {}): Promise<any> {
  let loaded: any
  vm.runInNewContext(await readFile(path, 'utf8'), {
    ...globals,
    window: { __ModuleLoader__: { load(row: any) { loaded = { id: row.id, exports: row.factory(imports) } } } },
    console,
  })
  return loaded
}

function status(): UpdateStatus {
  return {
    schema: 1, phase: 'idle', checkedAt: '2026-10-18T00:00:00.000Z', error: null,
    local: {
      home: '/home', profile: 'desktop', runtimeVersion: '0.2.1-rc.2',
      plugins: [{ name: 'dsh-x-code', version: '0.1.1' }],
    },
    plan: {
      kind: 'plugin', reason: 'plugin-newer', plugin: null,
      targets: [{ name: 'dsh-x-code', version: '0.1.2', file: 'dsh-x-code-0.1.2.tgz', sha256: 'a'.repeat(64), integrity: '', url: 'https://example.invalid/code.tgz' }],
      current: { pluginVersion: '0.1.1', runtimeVersion: '0.2.1-rc.2' },
      available: { pluginVersion: '0.1.2', runtime: '0.2.1-rc.2' },
    },
    config: { repository: 'csic21/dsh-x', autoCheck: true },
  }
}

test('built settings section registers and renders an available plugin update', async t => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>')
  const original = { window: (globalThis as any).window, document: (globalThis as any).document, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT }
  ;(globalThis as any).window = dom.window
  ;(globalThis as any).document = dom.window.document
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  const calls: string[] = []
  const rpc = { async call(_channel: string, endpoint: string) { calls.push(endpoint); return { ok: true, value: status() } } }
  const effects: unknown[] = []
  const registrations: any[] = []
  let root: any
  try {
    const plugin = await loadFactory(new URL('../lib/client.js', import.meta.url), (name: string) => {
      assert.equal(name, 'react')
      return React
    }, { document: dom.window.document, AbortController, setInterval, clearInterval, setTimeout, clearTimeout })
    assert.equal(plugin.id, 'dsh-x-update')
    assert.deepEqual(Array.from(plugin.exports.inject), ['slots', 'connection', 'locale'])
    const t = (key: string, params: Record<string, unknown> = {}) => {
      let value = (en as Record<string, string>)[key] ?? key
      for (const [name, replacement] of Object.entries(params)) value = value.replaceAll(`{${name}}`, String(replacement))
      return value
    }
    plugin.exports.apply({
      locale: { register() {}, bind() { return t } },
      effect(fn: () => unknown) { const dispose = fn(); effects.push(dispose); return dispose },
      connection: { rpc },
      slots: {
        inject(name: string, fn: () => () => void) { assert.equal(name, 'settings.section'); const dispose = fn(); effects.push(dispose); return dispose },
        register(options: any, component: any) { const entry = { options, component }; registrations.push(entry); return () => registrations.splice(registrations.indexOf(entry), 1) },
      },
    })
    assert.equal(registrations.length, 1)
    const entry = registrations[0]
    assert.equal(entry.options.name, 'settings.section')
    assert.equal(entry.options.id, 'dsh-x-update')
    assert.equal(entry.options.order, 30)
    assert.equal(entry.options.locale, NS)
    assert.equal(entry.options.label(), 'Plugin updates')

    const { createRoot } = await import('react-dom/client')
    root = createRoot(dom.window.document.getElementById('app')!)
    await act(async () => root.render(React.createElement(entry.component, { rpc, t, close() {} })))
    const text = () => dom.window.document.body.textContent ?? ''
    assert.match(text(), /Plugin updates/)
    assert.match(text(), /Plugin update available/)
    assert.match(text(), /0\.1\.2/)
    assert.match(text(), /Open Releases/)
    assert.ok(calls.includes('dsh-x-update/status'))
  } finally {
    await act(async () => root?.unmount())
    for (const dispose of effects.reverse()) if (typeof dispose === 'function') dispose()
    ;(globalThis as any).window = original.window
    ;(globalThis as any).document = original.document
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = original.IS_REACT_ACT_ENVIRONMENT
    dom.window.close()
  }
})
