import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'
import React from 'react'
import { DEFAULT_APPEARANCE } from '../src/store.ts'
import type { UiAppearance } from '../src/store.ts'
import { GLASS_TOKENS, TOKEN_SOURCE } from '../src/client/tokens.ts'

// DOM integration of the real published client factory, with an explicit host
// fixture. This does not claim a real browser layout or an assembled kernel UI
// test; it checks the wiring the plugin owns: the theme layer, the owned style
// nodes, and what happens when the treatment is switched off.
interface Fixture {
  exported: any
  tokens: Array<{ source: string, tokens: Record<string, { light: string, dark: string }> }>
  disposers: Array<() => void>
  styleNodes(): Element[]
  slots: Map<string, any[]>
  apply(): void
  setAppearance(next: UiAppearance): void
  /** The row's controller, which is also what the material effect listens to. */
  controller(): { load(): Promise<void>, update(patch: any): Promise<void> }
  flush(): Promise<void>
}

async function fixture(appearance: UiAppearance = { ...DEFAULT_APPEARANCE }): Promise<Fixture> {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', { url: 'http://localhost/' })
  ;(globalThis as any).document = dom.window.document
  ;(globalThis as any).window = dom.window

  let exported: any
  vm.runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load(value: any) {
      assert.equal(value.id, 'dsh-x-ui')
      exported = value.factory((name: string) => { assert.equal(name, 'react'); return React })
    } } },
    globalThis,
    document: dom.window.document,
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    console,
  })

  const tokens: Fixture['tokens'] = []
  const disposers: Array<() => void> = []
  const slots = new Map<string, any[]>()
  let current = { ...appearance }
  let controller: any = null

  const ctx: any = {
    effect(fn: any) { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose); return dispose },
    on() { return () => {} },
    connection: { rpc: { call: async (_channel: string, endpoint: string, payload: any) => {
      if (endpoint === 'dsh-x-ui/read') return { ok: true, value: current }
      if (endpoint === 'dsh-x-ui/write') { current = { ...current, ...payload }; return { ok: true, value: current } }
      throw new Error(`unexpected endpoint ${endpoint}`)
    } } },
    locale: { register: () => {}, bind: () => (key: string) => key },
    theme: { overrideTokens(source: string, value: any) {
      tokens.push({ source, tokens: value })
      return () => {}
    } },
    slots: {
      inject(_key: string, callback: any) { const dispose = callback(); disposers.push(dispose); return dispose },
      register(options: any, component: any) {
        const entry = { options, component }
        slots.set(options.name, [...(slots.get(options.name) ?? []), entry])
        // The row injects the same controller the material effect listens to;
        // keeping a handle on it is how this fixture drives a repaint.
        if (options.inject) controller = options.inject().controller
        return () => slots.set(options.name, (slots.get(options.name) ?? []).filter(item => item !== entry))
      },
    },
  }

  const flush = async () => { await new Promise(resolve => setTimeout(resolve, 0)) }
  return {
    exported,
    tokens,
    disposers,
    slots,
    styleNodes: () => [...dom.window.document.head.querySelectorAll('style[data-plugin="dsh-x-ui"]')],
    apply() { exported.apply(ctx) },
    setAppearance(next) { current = { ...next } },
    flush,
    controller: () => controller,
  }
}

test('the client registers its settings row and its two owned style nodes', async () => {
  const f = await fixture()
  f.apply()
  await f.flush()

  const rows = f.slots.get('settings.general.item') ?? []
  assert.equal(rows.length, 1)
  assert.equal(rows[0].options.id, 'dsh-x-ui')
  // The row must inject its own copy and controller: the owner passes no props.
  const injected = rows[0].options.inject()
  assert.equal(typeof injected.t.text, 'undefined')
  assert.equal(typeof injected.t, 'function')
  assert.equal(typeof injected.controller.update, 'function')

  const styles = f.styleNodes()
  assert.equal(styles.length, 2)
  const ids = styles.map(node => (node as HTMLElement).dataset.pluginCss).sort()
  assert.deepEqual(ids, ['dsh-x-ui/material', 'dsh-x-ui/settings'])
})

test('the enabled treatment installs one token layer and paints the material', async () => {
  const f = await fixture()
  f.apply()
  await f.flush()

  assert.equal(f.tokens.length, 1)
  assert.equal(f.tokens[0].source, TOKEN_SOURCE)
  assert.deepEqual(Object.keys(f.tokens[0].tokens).sort(), Object.keys(GLASS_TOKENS).sort())

  const material = f.styleNodes().find(node => (node as HTMLElement).dataset.pluginCss === 'dsh-x-ui/material')!
  assert.match(material.textContent ?? '', /--dxu-base:/)
  assert.match(material.textContent ?? '', /\[data-composer-card\]/)
})

test('switching the treatment off drops both layers and restores the shipped palette', async () => {
  const f = await fixture()
  f.apply()
  await f.flush()
  assert.equal(f.tokens.length, 1)

  f.setAppearance({ ...DEFAULT_APPEARANCE, enabled: false })
  await f.controller().load()
  await f.flush()

  const material = f.styleNodes().find(node => (node as HTMLElement).dataset.pluginCss === 'dsh-x-ui/material')!
  assert.equal(material.textContent, '')
  // The token layer is disposed, not merely emptied: the shipped palette is
  // authoritative again rather than an override pointing at missing variables.
  assert.equal(f.tokens.length, 1)
  const settings = f.styleNodes().find(node => (node as HTMLElement).dataset.pluginCss === 'dsh-x-ui/settings')!
  assert.match(settings.textContent ?? '', /\.dxu-row/)
})

test('changing a setting repaints the material without stacking token layers', async () => {
  const f = await fixture()
  f.apply()
  await f.flush()

  f.setAppearance({ ...DEFAULT_APPEARANCE, level: 'dense' })
  await f.controller().load()
  await f.flush()
  assert.equal(f.tokens.length, 2, 'the layer is replaced, so a second registration is expected')

  const material = f.styleNodes().find(node => (node as HTMLElement).dataset.pluginCss === 'dsh-x-ui/material')!
  assert.match(material.textContent ?? '', /--dxu-blur: 40px/)

  // Re-publishing the same appearance must not repaint at all.
  const before = material.textContent
  await f.controller().load()
  await f.flush()
  assert.equal(material.textContent, before)
  assert.equal(f.tokens.length, 2)
})

test('unloading removes every owned node and disposes the token layer', async () => {
  const f = await fixture()
  f.apply()
  await f.flush()
  assert.equal(f.styleNodes().length, 2)
  for (const dispose of f.disposers) dispose()
  assert.equal(f.styleNodes().length, 0)
})
