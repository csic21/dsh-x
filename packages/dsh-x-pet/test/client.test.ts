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
      if (endpoint === 'dsh-x-pet/activity') {
        return { ok: true, value: { activities: { s1: { phase: 'tool', tool: 'bash', step: 2 }, s2: { phase: 'thinking', tool: null, step: 1 } } } }
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
  // The sprite only renders once its atlas resolves, so the frame needs a
  // fetch that answers with image bytes and a URL that can mint a blob URL.
  const originalFetch = (globalThis as any).fetch
  const originalCreate = (URL as any).createObjectURL
  const originalRevoke = (URL as any).revokeObjectURL
  ;(globalThis as any).fetch = async () => ({ ok: true, blob: async () => new dom.window.Blob(['sheet']) })
  ;(URL as any).createObjectURL = () => 'blob:dsh-x-pet'
  ;(URL as any).revokeObjectURL = () => {}
  // React's async act races the runner: a flush that is still queued when the
  // jsdom window closes leaves a promise that never settles, which the test
  // runner reports as "Promise resolution is still pending but the event loop
  // has already resolved". So keep act synchronous — every render here is — and
  // await genuinely asynchronous work outside act, then flush once.
  const step = async (run: () => unknown): Promise<void> => {
    const result = run()
    if (result !== undefined && result !== null && typeof (result as any).then === 'function') await (result as Promise<unknown>)
    act(() => {})
    // Effects start promises: `list` resolves the selection, and only then does
    // the activity poll have ids. Two hops, so flush a couple of macrotasks and
    // commit after each — still synchronously, never through async act.
    for (let round = 0; round < 3; round += 1) {
      await new Promise(resolve => setImmediate(resolve))
      act(() => {})
    }
  }
  // A wedged test must fail, not hang the job for its whole timeout. This timer
  // is cleared in the teardown, so it never keeps the process alive.
  const watchdog = setTimeout(() => { throw new Error('client test exceeded 60s') }, 60_000)
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(dom.window.document.getElementById('app')!)
  try {
    await act(async () => exported.apply(ctx))
    assert.deepEqual(Array.from(entries.keys()).sort(), ['settings.section', 'shell.overlay'])
    const entry = entries.get('shell.overlay')![0]
    assert.equal(entry.options.id, 'dsh-x-pet')

    // The host owns the session facts the pet reads.
    const opened: string[] = []
    let openingFails = false
    const status: any = { running: false, pendingInteraction: undefined, completionUnread: false }
    const list: any = { byId: { s1: { id: 's1', title: 'Refactor login', updatedAt: 2, retainedBy: { mainView: 1 } } } }
    const statuses = new Map<string, any>([['s1', status]])
    function Render({ entry }: any) {
      const face = entry.options.inject()
      const useSessions = (selector: any) => selector(list)
      const useSessionStatus = (selector: any) => selector(statuses)
      const usePanelInfo = (selector: any) => selector({ activePanelId: null })
      return React.createElement(entry.component, {
        ...face, useSessions, useSessionStatus, usePanelInfo,
        openSession: (id: string) => {
          if (openingFails) throw new Error('boom')
          opened.push(id)
        },
        t: (key: string, params?: Record<string, unknown>) => params ? `${key} ${Object.values(params).join(' ')}` : key,
      })
    }
    const render = async () => step(() => root.render(React.createElement(Render, { entry })))
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

    // A finished turn makes the pet speak up and wave, then settle again.
    status.completionUnread = false
    status.running = true
    await render()
    assert.equal(dom.window.document.querySelector<HTMLElement>('.dxp-bubble-title')!.textContent, 'Refactor login')
    assert.match(dom.window.document.querySelector<HTMLElement>('.dxp-bubble-detail')!.textContent!, /bash/)
    status.running = false
    await render()
    assert.equal(dom.window.document.querySelector<HTMLElement>('.dxp')!.dataset.petState, 'waving')
    assert.match(dom.window.document.querySelector<HTMLElement>('.dxp-bubble-detail')!.textContent!, /bubble\.done/)
    assert.ok(dom.window.document.querySelector('.dxp-bubble-check'), 'a finished turn is ticked')

    // Closing the bubble hides that one line only: the pet stays, the session
    // is untouched, and the next turn speaks again.
    const bubble = () => dom.window.document.querySelector<HTMLElement>('.dxp-bubble')!
    const close = bubble().querySelector<HTMLElement>('.dxp-bubble-close')!
    await step(() => { close.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
    assert.equal(bubble().dataset.show, 'false', 'closing the bubble hides it')
    assert.ok(dom.window.document.querySelector('.dxp'), 'closing the bubble leaves the pet')
    assert.equal(rpcCalls.filter(endpoint => endpoint === 'dsh-x-pet/select').length, 0, 'closing the bubble never changes the selection')
    status.running = true
    await render()
    assert.equal(bubble().dataset.show, 'true', 'the next turn speaks again')

    // Two conversations stack as rows, and a row jumps to its conversation.
    status.running = true
    list.byId.s2 = { id: 's2', title: 'Review diff', updatedAt: 1 }
    statuses.set('s2', { running: true, pendingInteraction: undefined, completionUnread: false })
    await render()
    const rows = () => Array.from(dom.window.document.querySelectorAll<HTMLElement>('.dxp-list-item'))
    assert.equal(rows().length, 2, 'both conversations are listed')
    assert.equal(rows()[0].querySelector('.dxp-list-title')!.textContent, 'Refactor login')
    assert.equal(rows()[1].querySelector('.dxp-list-title')!.textContent, 'Review diff')
    assert.match(rows()[1].querySelector('.dxp-list-detail')!.textContent!, /bubble\.thinking/)
    await step(() => { rows()[1].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
    assert.deepEqual(opened, ['s2'], 'clicking a row opens that conversation')

    // One conversation keeps a single line, and that line is clickable too.
    statuses.delete('s2')
    await render()
    assert.equal(dom.window.document.querySelectorAll('.dxp-list-item').length, 0)
    await step(() => { dom.window.document.querySelector<HTMLElement>('.dxp-bubble-open')!.click() })
    assert.deepEqual(opened, ['s2', 's1'], 'clicking the line opens its conversation')

    // A navigator that throws must say so instead of swallowing the click.
    openingFails = true
    await step(() => { dom.window.document.querySelector<HTMLElement>('.dxp-bubble-open')!.click() })
    assert.match(dom.window.document.querySelector('.dxp-error')!.textContent!, /bubble\.navigateFailed boom/)
    openingFails = false
    status.running = false

    // Dragging past the window edge stops at it, and the release saves the spot.
    const sprite = () => dom.window.document.querySelector<HTMLElement>('.dxp-sprite')!
    const pointer = (type: string, target: any, x: number, y: number) => step(() => {
      target.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }))
    })
    await pointer('pointerdown', sprite(), 100, 100)
    await pointer('pointermove', dom.window, 9000, 9000)
    const frameVars = () => dom.window.document.querySelector<HTMLElement>('.dxp')!.style
    assert.equal(frameVars().getPropertyValue('--dxp-x'), '12px', 'a drag stops at the window edge')
    assert.equal(frameVars().getPropertyValue('--dxp-y'), '12px', 'a drag stops at the window edge')
    await pointer('pointerup', dom.window, 9000, 9000)
    assert.ok(rpcCalls.includes('dsh-x-pet/move'), 'a drag saves the new position')

    // A pet that is switched off renders nothing, so its narration has to stop
    // too: the frame's hooks run before the early return that hides the sprite.
    const activityCalls = () => rpcCalls.filter(endpoint => endpoint === 'dsh-x-pet/activity').length
    const injected = entry.options.inject()
    await step(async () => { await injected.controller.select('off') })
    status.running = true
    const before = activityCalls()
    await render()
    await step(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
    assert.equal(activityCalls(), before, 'a hidden pet stops polling the host')
    assert.equal(dom.window.document.querySelector('.dxp'), null, 'a hidden pet renders nothing')
  } finally {
    clearTimeout(watchdog)
    try {
      await step(() => { root.unmount() })
      // One empty flush after unmount: effects that scheduled a setState land
      // here, synchronously, before anything is torn down.
      act(() => {})
    } finally {
      for (const dispose of disposers) dispose?.()
    ;(globalThis as any).fetch = originalFetch
    ;(URL as any).createObjectURL = originalCreate
    ;(URL as any).revokeObjectURL = originalRevoke
    dom.window.close()
    console.log('ACTIVE', JSON.stringify(process.getActiveResourcesInfo()))
      ;(globalThis as any).window = original.window
      ;(globalThis as any).document = original.document
      ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = original.IS_REACT_ACT_ENVIRONMENT
    }
  }
})
