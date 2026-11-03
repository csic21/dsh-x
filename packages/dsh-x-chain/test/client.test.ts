import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'

// DOM-level check of the published client factory against an explicit host
// fixture. It does not claim a real browser layout or an assembled shell.
test('the chain page registers in settings and renders the snapshot', async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>', { url: 'http://localhost/' })
  const saved = { window: (globalThis as any).window, document: (globalThis as any).document, env: (globalThis as any).IS_REACT_ACT_ENVIRONMENT }
  ;(globalThis as any).window = dom.window
  ;(globalThis as any).document = dom.window.document
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

  let exported: any
  vm.runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load(value: any) { assert.equal(value.id, 'dsh-x-chain'); exported = value.factory(() => React) } } },
    globalThis,
    navigator: dom.window.navigator,
    document: dom.window.document,
    setTimeout,
    clearTimeout,
    console,
  })

  const snapshot = {
    totals: { chains: 3, steps: 7, saved: 4, stopped: 1 },
    sessions: [{ sessionId: 'session-0123456789abcdef', chains: 3, steps: 7, saved: 4, stopped: 1, lastAt: 1_700_000_000_000 }],
    updatedAt: 1_700_000_000_000,
  }
  const registrations: any[] = []
  const calls: string[] = []
  const ctx: any = {
    effect(fn: any) { const dispose = fn(); return dispose },
    connection: { rpc: { call: async (_channel: string, endpoint: string) => { calls.push(endpoint); return { ok: true, value: snapshot } } } },
    locale: { register: () => {}, bind: () => (key: string) => key },
    slots: {
      inject(_name: string, callback: () => any) { return callback() },
      register(options: any, component: any) { registrations.push({ options, component }); return () => {} },
    },
  }
  try {
    await act(async () => exported.apply(ctx))
    assert.equal(registrations.length, 1)
    assert.equal(registrations[0].options.name, 'settings.section')
    assert.equal(registrations[0].options.id, 'dsh-x-chain')

    const face = registrations[0].options.inject()
    const Component = registrations[0].component
    const { createRoot } = await import('react-dom/client')
    const root = createRoot(dom.window.document.getElementById('app')!)
    await act(async () => { root.render(React.createElement(Component, face)) })
    for (let round = 0; round < 3; round += 1) {
      await new Promise(resolve => setImmediate(resolve))
      act(() => {})
    }
    const text = dom.window.document.body.textContent ?? ''
    assert.match(text, /totals|chains|steps/i)
    assert.ok(text.includes('3') && text.includes('7') && text.includes('4'), text)
    assert.deepEqual(calls, ['dsh-x-chain/stats'])
    await act(async () => { root.unmount() })
  } finally {
    ;(globalThis as any).window = saved.window
    ;(globalThis as any).document = saved.document
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = saved.env
  }
})
