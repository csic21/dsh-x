import type { PetEntry, PetSelection } from '../store.ts'

export interface PetView {
  pets: PetEntry[]
  selection: PetSelection
  /** The pet actually shown; `off` when the user hid it. */
  active: string
  /** The Codex pets folder, or null when local pets are disabled. */
  source: string | null
}

export type PetRpc = {
  call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<any>
}

/** Endpoints are fixed; the Client never builds a route from user input. */
export const LIST_ENDPOINT = 'dsh-x-pet/list'
export const SELECT_ENDPOINT = 'dsh-x-pet/select'
export const MOVE_ENDPOINT = 'dsh-x-pet/move'
export const ATLAS_ENDPOINT = 'dsh-x-pet/atlas'

const unwrap = (result: any): any => {
  if (!result?.ok) throw new Error(String(result?.error?.code ?? 'PET_UNAVAILABLE'))
  return result.value
}

export interface PetController {
  getSnapshot(): PetView | null
  subscribe(listener: () => void): () => void
  load(signal?: AbortSignal): Promise<void>
  select(id: string, signal?: AbortSignal): Promise<void>
  move(x: number, y: number): Promise<void>
  /** Object URL for one atlas, cached per pet id and mime. */
  atlasUrl(id: string): Promise<string>
  reset(): void
  dispose(): void
}

const EMPTY: PetView = {
  pets: [],
  selection: { version: 1, active: 'off', chosen: null, position: null },
  active: 'off',
  source: null,
}

/**
 * One owner for the pet's presentation state. The Host is the authority for
 * the pet list, the selection and the saved position; this controller caches
 * the last view and the decoded atlas URLs so a re-render never refetches.
 */
export function createPetController(rpc: PetRpc, fetchObject: typeof fetch | undefined = globalThis.fetch): PetController {
  let view: PetView | null = null
  let loading: Promise<void> | null = null
  const listeners = new Set<() => void>()
  const urls = new Map<string, string>()
  const pending = new Map<string, Promise<string>>()
  let disposed = false

  const publish = (next: PetView | null) => {
    view = next
    for (const listener of listeners) listener()
  }

  const call = async (endpoint: string, payload: unknown, signal?: AbortSignal) =>
    unwrap(await rpc.call('/api', endpoint, payload, signal))

  const load = async (signal?: AbortSignal) => {
    if (loading) return loading
    loading = (async () => {
      try {
        const next = await call(LIST_ENDPOINT, {}, signal)
        if (!disposed) publish(next)
      } catch { if (!disposed && view === null) publish(EMPTY) }
      finally { loading = null }
    })()
    return loading
  }

  return {
    getSnapshot: () => view,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    load,
    async select(id, signal) {
      const next = await call(SELECT_ENDPOINT, { id }, signal)
      if (!disposed) publish(next)
    },
    async move(x, y) {
      const next = await call(MOVE_ENDPOINT, { x, y })
      if (!disposed) publish(next)
    },
    atlasUrl(id) {
      const cached = urls.get(id)
      if (cached) return Promise.resolve(cached)
      const inFlight = pending.get(id)
      if (inFlight) return inFlight
      const request = (async () => {
        if (!fetchObject) throw new Error('PET_FETCH')
        // The atlas route answers with image bytes under the same authenticated
        // envelope, so a plain fetch keeps the sheet out of JSON/base64.
        const response = await fetchObject(`/api/${ATLAS_ENDPOINT}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: ATLAS_ENDPOINT, payload: { id } }),
        })
        if (!response.ok) throw new Error('PET_ATLAS')
        const blob = await response.blob()
        if (disposed) throw new Error('PET_DISPOSED')
        const url = URL.createObjectURL(blob)
        urls.set(id, url)
        return url
      })().finally(() => { pending.delete(id) })
      pending.set(id, request)
      return request
    },
    reset() { publish(null); loading = null },
    dispose() {
      disposed = true
      listeners.clear()
      for (const url of urls.values()) URL.revokeObjectURL(url)
      urls.clear()
      pending.clear()
    },
  }
}
