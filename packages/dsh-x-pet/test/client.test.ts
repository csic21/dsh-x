import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'
import React, { act, useSyncExternalStore } from 'react'

// DOM integration of the real published client factory, using an explicit
// host fixture. This does not claim a real browser layout or an assembled
// kernel UI test.
test('the pet frame registers in the frame overlay and follows the session state', async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>', { url: 'http://localhost/' })
  const original: any = { window: (globalThis as any).window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT }
  ;(globalThis as any).window = dom.window
  ;(globalThis as any).document = dom.window.document
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  let exported: any
  const entries = new Map<string, any[]>()
  const disposers: any[] = []
  const slots: any = {
    inject(key: any, callback: any) { const dispose = callback(); disposers.push(dispose); return dispose },
    register(options: any, component: any) {
      const entry = { options, component }
      entries.set(options.name, [...(entries.get(options.name) ?? []), entry])
      return () => entries.set(options.name, (entries.get(options.name) ?? []).filter(item => item !== entry))
    },
  }
  const rpcCalls: string[] = []
  const pet = { id: 'dsh-x-pet:default', displayName: 'Harness', description: 'Bundled.', source: 'bundled', rows: 11, mime: 'image/webp', bytes: 10 }
  const rpc: any = {
    call: async (_channel: string, endpoint: string) => {
      rpcCalls.push(endpoint)
      if (endpoint === 'dsh-x-pet/list') {
        return { ok: true, value: { pets: [pet], selection: { version: 1, active: pet.id, position: null }, active: pet.id, source: '/home/.codex/pets' } }
      }
      if (endpoint === 'dsh-x-pet/select') {
        return { ok: true, value: { pets: [pet], selection: { version: 1, active: 'off', position: null }, active: 'off', source: null } }
      }
      return { ok: true, value: { pets: [pet], selection: { version: 1, active: pet.id, position: null }, active: pet.id, source: null } }
    },
  }
  const locale = { register: () => {}, bind: () => (key: string) => key }
  const ctx: any = { locale, slots, connection: { rpc }, on: () => () => {}, effect(fn: any) { const dispose = fn(); disposers.push(dispose); return dispose } }
  vm.runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load(value: any) { assert.equal(value.id, 'dsh-x-pet'); exported = value.factory((name: string) => { assert.equal(name, 'react'); return React }) } } },
    globalThis,
    navigator: dom.window.navigator,
    document: dom.window.document,
    URL,
    Blob: dom.window.Blob,
    AbortController,
    setTimeout,
    clearTimeout,
    console,
    crypto: { randomUUID: () => 'rpc-1' },
  })
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(dom.window.document.getElementById('app')!)
  try {
    await act(async () => exported.apply(ctx))
    assert.deepEqual(Array.from(entries.keys()).sort(), ['settings.section', 'shell.overlay'])
    const entry = entries.get('shell.overlay')![0]
    assert.equal(entry.options.id, 'dsh-x-pet')

    // The host owns the session facts the pet reads.
    const status: any = { running: false, pendingInteraction: undefined, completionUnread: false }
    const list = { byId: { s1: { id: 's1', retainedBy: { mainView: 1 } } } }
    const statuses = new Map<string, any>([['s1', status]])
    function Render({ entry }: any) {
      const face = entry.options.inject()
      const useSessions = (selector: any) => selector(list)
      const useSessionStatus = (selector: any) => selector(statuses)
      const usePanelInfo = (selector: any) => selector({ activePanelId: null })
      return React.createElement(entry.component, { ...face, useSessions, useSessionStatus, usePanelInfo, t: (key: string) => key })
    }
    const render = async () => act(async () => root.render(React.createElement(Render, { entry })))
    await render()
    assert.deepEqual(rpcCalls, ['dsh-x-pet/list'])
    const frame = dom.window.document.querySelector<HTMLElement>('.dxp')
    assert.ok(frame, 'the pet frame is rendered')
    assert.equal(frame!.dataset.petState, 'idle')

    // A working turn is the `running` row, a blocked turn is `waiting`.
    status.running = true
    await render()
    assert.equal(dom.window.document.querySelector<HTMLElement>('.dxp')!.dataset.petState, 'running')
    status.running = false
    status.pendingInteraction = { kind: 'approval' }
    await render()
    assert.equal(dom.window.document.querySelector<HTMLElement>('.dxp')!.dataset.petState, 'waiting')
    status.pendingInteraction = undefined
    status.completionUnread = true
    await render()
    assert.equal(dom.window.document.querySelector<HTMLElement>('.dxp')!.dataset.petState, 'review')
  } finally {
    await act(async () => root.unmount())
    for (const dispose of disposers) dispose?.()
    ;(globalThis as any).window = original.window
    ;(globalThis as any).document = original.document
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = original.IS_REACT_ACT_ENVIRONMENT
  }
})
