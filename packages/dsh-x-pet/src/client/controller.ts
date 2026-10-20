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
export const ACTIVITY_ENDPOINT = 'dsh-x-pet/activity'
export const WINDOW_ENDPOINT = 'dsh-x-pet/window'

/** What a running conversation is doing right now. */
export interface SessionActivity {
  phase: 'tool' | 'thinking' | 'working'
  tool: string | null
  step: number | null
}

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
  /** Current activity of the named live sessions, keyed by session id. */
  activity(ids: string[]): Promise<Record<string, SessionActivity>>
  /** Ask the Host to open the native pet window; false when it cannot. */
  detach(): Promise<boolean>
  /**
   * A small first-frame preview. `cropped` tells the caller whether the image
   * is one cell (draw it whole) or the full sheet (draw it as a sprite).
   */
  thumbnail(id: string, rows: number): Promise<{ src: string, cropped: boolean }>
  /**
   * Drop every cached atlas except those named. The frame keeps the active pet;
   * the picker releases the rest when it closes.
   */
  release(keep: readonly string[]): void
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
  const thumbnails = new Map<string, string>()
  let keepIds: string[] = []
  let disposed = false

  /**
   * A full sheet decodes to ~14 MB at 1536x2288, so the cache is deliberately
   * small: the active pet plus a little headroom. Anything beyond that is
   * revoked instead of held for the life of the window.
   */
  const MAX_CACHED_ATLASES = 3

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
    async activity(ids) {
      if (ids.length === 0) return {}
      try {
        const value = await call(ACTIVITY_ENDPOINT, { ids })
        return (value?.activities ?? {}) as Record<string, SessionActivity>
      } catch { return {} }
    },
    async detach() {
      try {
        const value = await call(WINDOW_ENDPOINT, { action: 'open' })
        return value?.open === true
      } catch { return false }
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
        for (const [key, value] of urls) {
          if (urls.size <= MAX_CACHED_ATLASES) break
          if (key === id || keepIds.includes(key)) continue
          URL.revokeObjectURL(value)
          urls.delete(key)
        }
        return url
      })().finally(() => { pending.delete(id) })
      pending.set(id, request)
      return request
    },
    async thumbnail(id, rows) {
      const cached = thumbnails.get(id)
      if (cached) return { src: cached, cropped: true }
      const full = await this.atlasUrl(id)
      try {
        // Check the drawing surface before touching the image: a host without
        // a 2D context (jsdom, a stripped renderer) never starts a decode that
        // could hang, and simply keeps the full sheet.
        const canvas = globalThis.document.createElement('canvas')
        const width = 96
        const height = Math.round(width * 208 / 192)
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        if (!context) throw new Error('PET_CANVAS')
        const view = globalThis.document?.defaultView ?? globalThis
        const image = new (view as any).Image()
        image.src = full
        try {
          await new Promise<void>((resolve, reject) => {
            const timer = globalThis.setTimeout(() => reject(new Error('PET_DECODE')), 5_000)
            const settle = (run: () => void) => { globalThis.clearTimeout(timer); run() }
            image.onload = () => settle(resolve)
            image.onerror = () => settle(() => reject(new Error('PET_DECODE')))
            if (typeof image.decode === 'function') image.decode().then(() => settle(resolve)).catch(() => settle(() => reject(new Error('PET_DECODE'))))
          })
          context.imageSmoothingEnabled = false
          context.drawImage(image, 0, 0, 192, 208, 0, 0, width, height)
        } finally {
          // A sheet decodes to ~14 MB. Drop that bitmap as soon as the cell is
          // on the canvas instead of leaving it to the image cache and GC.
          image.onload = null
          image.onerror = null
          image.src = ''
        }
        const data = canvas.toDataURL('image/png')
        thumbnails.set(id, data)
        // The sheet was only needed to cut one cell out of it.
        if (keepIds.length > 0 && !keepIds.includes(id) && urls.has(id)) {
          const url = urls.get(id)!
          URL.revokeObjectURL(url)
          urls.delete(id)
        }
        return { src: data, cropped: true }
      } catch {
        // No canvas (or a broken decode): the caller still draws the sheet.
        return { src: full, cropped: false }
      }
    },
    release(keep) {
      keepIds = [...keep]
      const allowed = new Set(keepIds)
      for (const [id, url] of urls) {
        if (allowed.has(id)) continue
        URL.revokeObjectURL(url)
        urls.delete(id)
      }
      for (const id of [...thumbnails.keys()]) if (!allowed.has(id)) thumbnails.delete(id)
    },
    reset() { publish(null); loading = null },
    dispose() {
      disposed = true
      listeners.clear()
      for (const url of urls.values()) URL.revokeObjectURL(url)
      urls.clear()
      pending.clear()
      thumbnails.clear()
    },
  }
}
