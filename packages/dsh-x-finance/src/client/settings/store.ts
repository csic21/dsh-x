// Display preferences that belong to this browser, not to a profile or a
// watchlist scope. The quiet mode is deliberately client-local: it changes how
// the page looks, never which data is fetched, and it must survive a reload.
import { useSyncExternalStore } from 'react'

export const FINANCE_SETTINGS_KEY = 'dsh-x-finance:settings:v1'
/** Settings are small and untrusted; a huge value is never one of ours. */
const MAX_SETTINGS_BYTES = 512

export interface FinanceSettings { version: 1; discreet: boolean; barInDiscreet: boolean }
export const DEFAULT_FINANCE_SETTINGS: FinanceSettings = Object.freeze({ version: 1, discreet: false, barInDiscreet: false })

/**
 * Stored settings are untrusted. Only the known booleans are adopted; unknown
 * fields are dropped so a stale or hand-edited payload cannot leak into the UI.
 * A payload written before the bar option existed simply keeps the bar hidden.
 */
export function normalizeFinanceSettings(raw: unknown): FinanceSettings {
  const value = raw as Record<string, unknown> | null | undefined
  return { version: 1, discreet: value?.discreet === true, barInDiscreet: value?.barInDiscreet === true }
}

export interface FinanceSettingsState { discreet: boolean; barInDiscreet: boolean; storageError: boolean }
export interface FinanceSettingsSource {
  getSnapshot(): FinanceSettingsState
  subscribe(listener: () => void): () => void
}
export interface FinanceSettingsController extends FinanceSettingsSource {
  setDiscreet(value: unknown): void
  setBarInDiscreet(value: unknown): void
  toggleDiscreet(): void
  dispose(): void
}

const INITIAL: FinanceSettingsState = { discreet: false, barInDiscreet: false, storageError: false }

function parseSettings(text: string | null | undefined): FinanceSettings {
  if (!text || text.length > MAX_SETTINGS_BYTES) return DEFAULT_FINANCE_SETTINGS
  try { return normalizeFinanceSettings(JSON.parse(text)) } catch { return DEFAULT_FINANCE_SETTINGS }
}

const sameState = (left: FinanceSettingsState, right: FinanceSettingsState) =>
  left.discreet === right.discreet && left.barInDiscreet === right.barInDiscreet && left.storageError === right.storageError

/**
 * A tiny external store for the page and the fixed bar. `storage` may be absent
 * in a restricted browser: the in-memory switches still work and the panel says
 * the choice will not survive a reload.
 */
export function createFinanceSettings(storage?: any, eventTarget?: any): FinanceSettingsController {
  const listeners = new Set<() => void>()
  let state: FinanceSettingsState = INITIAL
  try {
    const stored = parseSettings(storage?.getItem(FINANCE_SETTINGS_KEY))
    state = { discreet: stored.discreet, barInDiscreet: stored.barInDiscreet, storageError: false }
  } catch {
    // A browser that refuses storage can still render and switch the modes.
    state = { ...INITIAL, storageError: true }
  }
  const publish = (next: FinanceSettingsState) => {
    if (sameState(next, state)) return
    state = next
    for (const listener of listeners) listener()
  }
  const storageChanged = (event: any) => {
    if (event?.key !== FINANCE_SETTINGS_KEY) return
    const stored = parseSettings(event.newValue)
    publish({ ...state, discreet: stored.discreet, barInDiscreet: stored.barInDiscreet })
  }
  eventTarget?.addEventListener?.('storage', storageChanged)
  const update = (patch: Partial<Pick<FinanceSettingsState, 'discreet' | 'barInDiscreet'>>) => {
    const keys = Object.keys(patch) as (keyof typeof patch)[]
    if (keys.every(key => state[key] === patch[key])) return
    // Publish first: the visual switch must react even when persistence fails.
    publish({ ...state, ...patch })
    try {
      if (!storage) throw new Error('storage-unavailable')
      storage.setItem(FINANCE_SETTINGS_KEY, JSON.stringify({ version: 1, discreet: state.discreet, barInDiscreet: state.barInDiscreet }))
      publish({ ...state, storageError: false })
    } catch {
      publish({ ...state, storageError: true })
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    setDiscreet: (value: unknown) => update({ discreet: value === true }),
    setBarInDiscreet: (value: unknown) => update({ barInDiscreet: value === true }),
    toggleDiscreet: () => update({ discreet: !state.discreet }),
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
