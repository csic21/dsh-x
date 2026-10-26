import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import {
  FINANCE_SETTINGS_KEY,
  createFinanceSettings,
  normalizeFinanceSettings,
} from '../src/client/settings/store.ts'
import { settingsZh, settingsEn } from '../src/client/settings/locales.ts'
import { bossKeyShortcutKeys, bossKeyShortcutLabel, isBossKeyShortcut, isFixedBarShortcut } from '../src/client/shortcut.ts'
import { CSS } from '../src/client/styles.ts'

/** A minimal Web Storage stand-in; failure modes are created explicitly below. */
function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, String(value)) },
    removeItem: (key: string) => { map.delete(key) },
  }
}

const translation = (dictionary: any) => (key: string, params: Record<string, any> = {}) =>
  String(dictionary[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`)

test('settings normalize untrusted storage and default the quiet mode off', () => {
  assert.deepEqual(normalizeFinanceSettings(null), { version: 1, discreet: false })
  assert.deepEqual(normalizeFinanceSettings('quiet'), { version: 1, discreet: false })
  assert.deepEqual(normalizeFinanceSettings({ discreet: 'yes', extra: true }), { version: 1, discreet: false })
  assert.deepEqual(normalizeFinanceSettings({ discreet: true, extra: true }), { version: 1, discreet: true })
})

test('the settings store persists the quiet mode, syncs across tabs and reports storage failure', () => {
  const storage = memoryStorage({ [FINANCE_SETTINGS_KEY]: JSON.stringify({ version: 1, discreet: true }) })
  const target = new EventTarget()
  const settings = createFinanceSettings(storage, target)
  try {
    assert.equal(settings.getSnapshot().discreet, true)
    assert.equal(settings.getSnapshot().storageError, false)

    settings.setDiscreet(false)
    assert.equal(settings.getSnapshot().discreet, false)
    assert.deepEqual(JSON.parse(storage.getItem(FINANCE_SETTINGS_KEY)!), { version: 1, discreet: false })

    let notifications = 0
    const unsubscribe = settings.subscribe(() => notifications++)
    const event = Object.assign(new Event('storage'), { key: FINANCE_SETTINGS_KEY, newValue: JSON.stringify({ version: 1, discreet: true }) })
    target.dispatchEvent(event)
    assert.equal(settings.getSnapshot().discreet, true)
    assert.equal(notifications, 1)
    unsubscribe()
    target.dispatchEvent(event)
    assert.equal(notifications, 1)
  } finally { settings.dispose() }

  const broken = { getItem: () => null, setItem: () => { throw new Error('denied') } }
  const failing = createFinanceSettings(broken)
  try {
    failing.setDiscreet(true)
    // The visual switch still flips; only the reload promise is broken.
    assert.equal(failing.getSnapshot().discreet, true)
    assert.equal(failing.getSnapshot().storageError, true)
  } finally { failing.dispose() }

  const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => {} }
  const denied = createFinanceSettings(blocked)
  try { assert.equal(denied.getSnapshot().storageError, true) } finally { denied.dispose() }
})

test('the boss key is one chord, ignores typing and repeat, and has platform keycaps', () => {
  const base = { altKey: true, shiftKey: true, code: 'KeyB', target: { tagName: 'DIV' } }
  assert.equal(isBossKeyShortcut(base), true)
  assert.equal(isBossKeyShortcut({ ...base, repeat: true }), false)
  assert.equal(isBossKeyShortcut({ ...base, target: { tagName: 'INPUT' } }), false)
  assert.equal(isBossKeyShortcut({ ...base, target: { isContentEditable: true, tagName: 'DIV' } }), false)
  assert.equal(isBossKeyShortcut({ ...base, code: 'KeyS' }), false)
  assert.equal(isFixedBarShortcut({ ...base, code: 'KeyS' }), true)
  assert.equal(isFixedBarShortcut(base), false)
  const mac = { platform: 'MacIntel', userAgent: '' }
  assert.deepEqual(bossKeyShortcutKeys(mac), ['⌥', '⇧', 'B'])
  assert.equal(bossKeyShortcutLabel(mac), '⌥⇧B')
  const windows = { platform: 'Win32', userAgent: '' }
  assert.deepEqual(bossKeyShortcutKeys(windows), ['Alt', 'Shift', 'B'])
  assert.equal(bossKeyShortcutLabel(windows), 'Alt+Shift+B')
})

test('quiet-mode and drawer styles are part of the published sheet', () => {
  assert.match(CSS, /\.dxs\.dxs-discreet\{/)
  assert.match(CSS, /--dxs-up:color-mix/)
  assert.match(CSS, /--dsw-alias-state-error-primary:var\(--dxs-up\)/)
  assert.match(CSS, /--dsw-alias-state-success-primary:var\(--dxs-down\)/)
  assert.match(CSS, /\.dxs-discreet \.dxs-chart-canvas/)
  assert.match(CSS, /\.dxs-set-layer\{/)
  assert.match(CSS, /\.dxs-set-panel\{/)
  assert.deepEqual(Object.keys(settingsZh).sort(), Object.keys(settingsEn).sort())
  for (const key of Object.keys(settingsZh)) {
    assert.deepEqual(
      settingsZh[key as keyof typeof settingsZh].match(/\{(\w+)\}/g)?.sort(),
      settingsEn[key as keyof typeof settingsEn].match(/\{(\w+)\}/g)?.sort(),
      key,
    )
  }
})

const bundle = await build({
  entryPoints: [new URL('../src/client/settings/SettingsPanel.tsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'],
})
const panelModule = { exports: {} as any }
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(panelModule, panelModule.exports, createRequire(import.meta.url))

test('the drawer flips quiet mode, toggles the bar and forwards the source switch', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
  const keyTarget = new EventTarget()
  const original: any = {
    window: (globalThis as any).window,
    document: globalThis.document,
    IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT,
    addEventListener: (globalThis as any).addEventListener,
    removeEventListener: (globalThis as any).removeEventListener,
  }
  ;(globalThis as any).window = dom.window
  globalThis.document = dom.window.document
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  // The component listens on globalThis; Node's global object is not a full
  // EventTarget, so route those two calls through a real one for this test.
  ;(globalThis as any).addEventListener = keyTarget.addEventListener.bind(keyTarget)
  ;(globalThis as any).removeEventListener = keyTarget.removeEventListener.bind(keyTarget)
  const storage = memoryStorage()
  const settings = createFinanceSettings(storage)
  const sourceChanges: boolean[] = [], barStates: boolean[] = []
  const closes: number[] = []
  const preference = { status: 'ready', enabled: false, forced: false, busy: false, error: '', setEnabled: async () => {} }
  const t = translation(settingsZh)
  let root: any
  try {
    const { createRoot } = await import('react-dom/client')
    root = createRoot(dom.window.document.getElementById('root')!)
    await act(async () => root.render(React.createElement(panelModule.exports.SettingsPanel, {
      settings,
      t,
      preference,
      onSourceChange: (enabled: boolean) => sourceChanges.push(enabled),
      barHidden: false,
      onSetBarVisible: (visible: boolean) => barStates.push(visible),
      scopeReady: true,
      onClose: () => closes.push(1),
    })))
    const input = (label: string) => dom.window.document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
    const click = async (element: any) => {
      await act(async () => element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
    }
    assert.ok(input('低调模式'), 'quiet mode switch exists')
    await click(input('低调模式'))
    assert.equal(settings.getSnapshot().discreet, true)
    assert.deepEqual(JSON.parse(storage.getItem(FINANCE_SETTINGS_KEY)!), { version: 1, discreet: true })
    assert.match(dom.window.document.body.textContent!, /低调模式已开启/)

    await click(input('显示底部固定栏'))
    assert.deepEqual(barStates, [false])

    // The source switch label comes from the market dictionary; target it by position.
    await click(dom.window.document.querySelectorAll('input[role="switch"]')[2])
    assert.deepEqual(sourceChanges, [true])

    await click(dom.window.document.querySelector('[aria-label="关闭设置"]'))
    assert.equal(closes.length, 1)

    const escape = Object.assign(new Event('keydown'), { key: 'Escape' })
    await act(async () => { keyTarget.dispatchEvent(escape) })
    assert.equal(closes.length, 2)
  } finally {
    if (root) await act(async () => root.unmount())
    settings.dispose()
    dom.window.close()
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete (globalThis as any)[key]; else (globalThis as any)[key] = value }
  }
})
