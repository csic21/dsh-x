import type { UiAppearance, UiAppearancePatch } from '../store.ts'

export type UiRpc = {
  call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<any>
}

/** Endpoints are fixed; the Client never builds a route from user input. */
export const READ_ENDPOINT = 'dsh-x-ui/read'
export const WRITE_ENDPOINT = 'dsh-x-ui/write'

const unwrap = (result: any): UiAppearance => {
  if (!result?.ok) throw new Error(String(result?.error?.code ?? 'UI_UNAVAILABLE'))
  return result.value as UiAppearance
}

export interface UiController {
  /** The appearance to paint, or null until the first read settles. */
  getSnapshot(): UiAppearance | null
  subscribe(listener: () => void): () => void
  /** Read the stored choice. A failed read leaves the shipped palette in place. */
  load(signal?: AbortSignal): Promise<void>
  /** Persist one change and repaint from what the host stored. */
  update(patch: UiAppearancePatch, signal?: AbortSignal): Promise<void>
  /** True while a write is in flight, so the row can disable itself. */
  isSaving(): boolean
  /** The last failure, for the row to explain rather than swallow. */
  error(): string | null
  /** Drop every subscriber; the plugin's unload path calls this. */
  dispose(): void
}

/**
 * One small store around the appearance RPC. The row and the paint effect both
 * read the same snapshot, so the control the user touched and the material on
 * screen can never disagree about what is active.
 */
export function createUiController(rpc: UiRpc): UiController {
  let snapshot: UiAppearance | null = null
  let saving = false
  let failure: string | null = null
  const listeners = new Set<() => void>()
  const publish = () => { for (const listener of [...listeners]) listener() }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async load(signal) {
      try {
        const next = unwrap(await rpc.call('/api', READ_ENDPOINT, {}, signal))
        snapshot = next
        failure = null
      } catch (error) {
        // The page still has to render: a failed read means "use the shipped
        // palette", which is exactly what an absent plugin looks like.
        failure = error instanceof Error ? error.message : String(error)
      }
      publish()
    },
    async update(patch, signal) {
      saving = true
      failure = null
      publish()
      try {
        snapshot = unwrap(await rpc.call('/api', WRITE_ENDPOINT, patch, signal))
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error)
      } finally {
        saving = false
        publish()
      }
    },
    isSaving: () => saving,
    error: () => failure,
    dispose() { listeners.clear() },
  }
}
