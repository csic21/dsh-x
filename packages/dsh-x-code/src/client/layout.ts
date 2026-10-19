import { useEffect, useState } from 'react'
export interface SizeBounds { min: number, max: number, default: number }
export const SIDEBAR_BOUNDS: SizeBounds = { min: 180, max: 460, default: 236 }
export const PANEL_BOUNDS: SizeBounds = { min: 250, max: 560, default: 328 }
/** A resize that ends this close to the minimum reads as "collapse", like the editor's own split views. */
export const COLLAPSE_SNAP = 14
export const ACTIVITIES = ['files', 'changes', 'history'] as const
export type Activity = typeof ACTIVITIES[number]
export const PANEL_TABS = ['problems', 'review'] as const
export type PanelTab = typeof PANEL_TABS[number]
export interface WorkbenchLayout {
  sidebar: number
  panel: number
  sidebarCollapsed: boolean
  panelCollapsed: boolean
  activity: Activity
  panelTab: PanelTab
}
export const DEFAULT_LAYOUT: WorkbenchLayout = { sidebar: SIDEBAR_BOUNDS.default, panel: PANEL_BOUNDS.default, sidebarCollapsed: false, panelCollapsed: false, activity: 'files', panelTab: 'review' }
export const LAYOUT_KEY = 'dsh-x-code:layout:v1'
export interface StorageLike { getItem(key: string): string | null, setItem(key: string, value: string): void }

/** A stored width is a preference, not a trusted measurement. */
export const clampSize = (value: number, bounds: SizeBounds) => Number.isFinite(value) ? Math.min(bounds.max, Math.max(bounds.min, Math.round(value))) : bounds.default
export const dragSize = (origin: number, delta: number, bounds: SizeBounds) => clampSize(origin + delta, bounds)

export function normalizeLayout(value: unknown): WorkbenchLayout {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const number = (key: 'sidebar' | 'panel', bounds: SizeBounds) => typeof record[key] === 'number' ? clampSize(record[key] as number, bounds) : bounds.default
  return {
    sidebar: number('sidebar', SIDEBAR_BOUNDS),
    panel: number('panel', PANEL_BOUNDS),
    sidebarCollapsed: record.sidebarCollapsed === true,
    panelCollapsed: record.panelCollapsed === true,
    activity: ACTIVITIES.includes(record.activity as Activity) ? record.activity as Activity : DEFAULT_LAYOUT.activity,
    panelTab: PANEL_TABS.includes(record.panelTab as PanelTab) ? record.panelTab as PanelTab : DEFAULT_LAYOUT.panelTab,
  }
}

/** Restricted browser storage is a missing preference store, never a failure. */
export function browserStorage(): StorageLike | null {
  try { return globalThis.localStorage ?? null } catch { return null }
}
export function readLayout(storage: StorageLike | null | undefined): WorkbenchLayout {
  try { return normalizeLayout(JSON.parse(storage?.getItem(LAYOUT_KEY) ?? 'null')) } catch { return { ...DEFAULT_LAYOUT } }
}
export function writeLayout(storage: StorageLike | null | undefined, layout: WorkbenchLayout) {
  try { storage?.setItem(LAYOUT_KEY, JSON.stringify(layout)) } catch { /* A read-only store keeps the in-memory layout. */ }
}

/** The layout survives remounts of the workbench inside the same profile. */
export function useWorkbenchLayout(storage: StorageLike | null | undefined) {
  const [layout, setLayout] = useState(() => readLayout(storage))
  useEffect(() => { writeLayout(storage, layout) }, [storage, layout])
  const update = (patch: Partial<WorkbenchLayout>) => setLayout(value => normalizeLayout({ ...value, ...patch }))
  const reset = () => setLayout({ ...DEFAULT_LAYOUT })
  return { layout, update, reset }
}

export interface OpenTab { path: string, preview: boolean }
export const MAX_TABS = 24
/**
 * Explorer clicks open a preview tab that the next click replaces; explicit
 * actions (findings, review history) pin their tab. The tab list is bounded.
 */
export function addTab(tabs: OpenTab[], path: string, preview: boolean): OpenTab[] {
  const at = tabs.findIndex(tab => tab.path === path)
  if (at >= 0) return preview || !tabs[at].preview ? tabs : tabs.map((tab, index) => index === at ? { ...tab, preview: false } : tab)
  const last = tabs.length - 1
  if (preview && last >= 0 && tabs[last].preview) return [...tabs.slice(0, last), { path, preview: true }]
  return [...tabs, { path, preview }].slice(-MAX_TABS)
}
/** Closing a tab hands the editor to its right neighbour, then its left one. */
export function closeTab(tabs: OpenTab[], path: string, active: string | null): { tabs: OpenTab[], active: string | null } {
  const at = tabs.findIndex(tab => tab.path === path)
  if (at < 0) return { tabs, active }
  const next = tabs.filter(tab => tab.path !== path)
  return { tabs: next, active: active === path ? next[Math.min(at, next.length - 1)]?.path ?? null : active }
}
export function moveTab(tabs: OpenTab[], from: number, to: number) {
  if (from === to || from < 0 || from >= tabs.length || to < 0 || to >= tabs.length) return tabs
  const next = [...tabs], [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}
