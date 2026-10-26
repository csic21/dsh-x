// Display preferences that belong to this browser, not to a profile or a
// watchlist scope. The quiet mode is deliberately client-local: it changes how
// the page looks, never which data is fetched, and it must survive a reload.
import { useSyncExternalStore } from 'react'

export const FINANCE_SETTINGS_KEY = 'dsh-x-finance:settings:v1'
/** Settings are small and untrusted; a huge value is never one of ours. */
const MAX_SETTINGS_BYTES = 512

export interface FinanceSettings { version: 1; discreet: boolean }
export const DEFAULT_FINANCE_SETTINGS: FinanceSettings = Object.freeze({ version: 1, discreet: false })

/**
 * Stored settings are untrusted. Only the known boolean is adopted; unknown
 * fields are dropped so a stale or hand-edited payload cannot leak into the UI.
 */
export function normalizeFinanceSettings(raw: unknown): FinanceSettings {
  const value = raw as Record<string, unknown> | null | undefined
  return { version: 1, discreet: value?.discreet === true }
}

export interface FinanceSettingsState { discreet: boolean; storageError: boolean }
export interface FinanceSettingsSource {
  getSnapshot(): FinanceSettingsState
  subscribe(listener: () => void): () => void
}
export interface FinanceSettingsController extends FinanceSettingsSource {
  setDiscreet(value: unknown): void
  toggleDiscreet(): void
  dispose(): void
}

const INITIAL: FinanceSettingsState = { discreet: false, storageError: false }

function parseDiscreet(text: string | null | undefined) {
  if (!text || text.length > MAX_SETTINGS_BYTES) return false
  try { return normalizeFinanceSettings(JSON.parse(text)).discreet } catch { return false }
}

/**
 * A tiny external store for the page and the fixed bar. `storage` may be absent
 * in a restricted browser: the in-memory switch still works and the panel says
 * the choice will not survive a reload.
 */
export function createFinanceSettings(storage?: any, eventTarget?: any): FinanceSettingsController {
  const listeners = new Set<() => void>()
  let state: FinanceSettingsState = INITIAL
  try {
    state = { discreet: parseDiscreet(storage?.getItem(FINANCE_SETTINGS_KEY)), storageError: false }
  } catch {
    // A browser that refuses storage can still render and switch the mode.
    state = { ...INITIAL, storageError: true }
  }
  const publish = (patch: Partial<FinanceSettingsState>) => {
    const next = { ...state, ...patch }
    if (next.discreet === state.discreet && next.storageError === state.storageError) return
    state = next
    for (const listener of listeners) listener()
  }
  const storageChanged = (event: any) => {
    if (event?.key !== FINANCE_SETTINGS_KEY) return
    publish({ discreet: parseDiscreet(event.newValue) })
  }
  eventTarget?.addEventListener?.('storage', storageChanged)
  const setDiscreet = (value: unknown) => {
    const next = value === true
    if (next === state.discreet) return
    // Publish first: the visual switch must react even when persistence fails.
    publish({ discreet: next })
    try {
      if (!storage) throw new Error('storage-unavailable')
      storage.setItem(FINANCE_SETTINGS_KEY, JSON.stringify({ version: 1, discreet: next }))
      publish({ storageError: false })
    } catch {
      publish({ storageError: true })
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    setDiscreet,
    toggleDiscreet: () => setDiscreet(!state.discreet),
    dispose() {
      eventTarget?.removeEventListener?.('storage', storageChanged)
      listeners.clear()
    },
  }
}

const NOOP_SUBSCRIBE = () => () => {}
const NO_SETTINGS = () => INITIAL

/** Components stay renderable without a host-provided store (tests, partial hosts). */
export function useFinanceSettings(source?: FinanceSettingsSource): FinanceSettingsState {
  return useSyncExternalStore(source?.subscribe ?? NOOP_SUBSCRIBE, source?.getSnapshot ?? NO_SETTINGS, source?.getSnapshot ?? NO_SETTINGS)
}
