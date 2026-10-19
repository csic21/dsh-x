import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_LAYOUT, LAYOUT_KEY, SIDEBAR_BOUNDS, PANEL_BOUNDS, addTab, clampSize, closeTab, dragSize, moveTab, normalizeLayout, readLayout, writeLayout } from '../src/client/layout.ts'

const storage = () => { const map = new Map<string, string>(); return { map, getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value) } } }

test('stored layout values are clamped, typed and recoverable', () => {
  const memory = storage()
  assert.deepEqual(readLayout(memory), DEFAULT_LAYOUT)
  assert.deepEqual(readLayout(null), DEFAULT_LAYOUT)
  writeLayout(memory, { ...DEFAULT_LAYOUT, sidebar: 320, panel: 400, activity: 'history', panelTab: 'problems' })
  assert.deepEqual(readLayout(memory), { ...DEFAULT_LAYOUT, sidebar: 320, panel: 400, activity: 'history', panelTab: 'problems' })
  assert.deepEqual(normalizeLayout({ sidebar: 9000, panel: -4, activity: 'nope', panelTab: 'nope' }), { ...DEFAULT_LAYOUT, sidebar: SIDEBAR_BOUNDS.max, panel: PANEL_BOUNDS.min })
  assert.deepEqual(normalizeLayout({ sidebar: Number.NaN, panel: 'wide', sidebarCollapsed: 'yes', panelCollapsed: 1 }), { ...DEFAULT_LAYOUT, sidebarCollapsed: false, panelCollapsed: false })
  memory.map.set(LAYOUT_KEY, '{not json')
  assert.deepEqual(readLayout(memory), DEFAULT_LAYOUT)
  const broken = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') } }
  assert.deepEqual(readLayout(broken), DEFAULT_LAYOUT)
  writeLayout(broken, DEFAULT_LAYOUT)
})

test('drag and keyboard resizing stay inside each track bound', () => {
  assert.equal(dragSize(236, 40, SIDEBAR_BOUNDS), 276)
  assert.equal(dragSize(236, -400, SIDEBAR_BOUNDS), SIDEBAR_BOUNDS.min)
  assert.equal(dragSize(328, 900, PANEL_BOUNDS), PANEL_BOUNDS.max)
  assert.equal(clampSize(Number.POSITIVE_INFINITY, PANEL_BOUNDS), PANEL_BOUNDS.default)
  assert.equal(clampSize(260.6, SIDEBAR_BOUNDS), 261)
})

test('editor tabs preview, pin, replace and close to a neighbour', () => {
  let tabs = addTab([], 'src/a.ts', true)
  assert.deepEqual(tabs, [{ path: 'src/a.ts', preview: true }])
  tabs = addTab(tabs, 'src/b.ts', true)
  assert.deepEqual(tabs, [{ path: 'src/b.ts', preview: true }], 'a preview tab is replaced, not accumulated')
  tabs = addTab(tabs, 'src/b.ts', false)
  assert.deepEqual(tabs, [{ path: 'src/b.ts', preview: false }], 'opening again pins the preview')
  tabs = addTab(tabs, 'src/c.ts', true)
  assert.deepEqual(tabs.map(tab => tab.path), ['src/b.ts', 'src/c.ts'])
  const middle = closeTab(tabs, 'src/b.ts', 'src/b.ts')
  assert.deepEqual(middle.tabs.map(tab => tab.path), ['src/c.ts'])
  assert.equal(middle.active, 'src/c.ts', 'closing the active tab activates its right neighbour')
  const last = closeTab(tabs, 'src/c.ts', 'src/c.ts')
  assert.equal(last.active, 'src/b.ts', 'closing the last tab activates its left neighbour')
  assert.equal(closeTab(tabs, 'src/missing.ts', 'src/b.ts').active, 'src/b.ts')
  assert.deepEqual(closeTab([{ path: 'x', preview: false }], 'x', 'x'), { tabs: [], active: null })
  assert.deepEqual(moveTab(tabs, 0, 1).map(tab => tab.path), ['src/c.ts', 'src/b.ts'])
  assert.deepEqual(moveTab(tabs, 5, 0), tabs, 'an unknown source index is ignored')
})
