import { fail, identifier } from './protocol.ts'

/** Native owner registration offered by an approved OpenCode parent execution. */
export type BrowserOwnerBinding = { runtime?: string, nativeRunId?: unknown, signal?: AbortSignal }
/** In-process lifetime record for one native parent execution; `close` is attached before it enters the registry. */
export type BrowserOwner = { ownerToken: symbol, runtime: string, nativeRunId: unknown, signal: AbortSignal, assertCurrent(): void, close?: () => void }

/** In-process lifetime metadata only. No browser executor or renderer capability crosses this boundary. */
export function createBrowserOwnership({ onClose }: { onClose: (token: symbol) => void }) {
  const owners = new Map<unknown, BrowserOwner>()
  const usedParents = new WeakSet<symbol>()
  let disposed = false
  function bind(parentToken: unknown, { runtime, nativeRunId, signal }: BrowserOwnerBinding = {}) {
    if (disposed || typeof parentToken !== 'symbol' || Symbol.keyFor(parentToken) !== undefined || runtime !== 'opencode' || typeof signal?.throwIfAborted !== 'function') throw fail('BROWSER_OWNER', 'An approved, live OpenCode parent execution is required.')
    identifier(nativeRunId, 'native run'); signal.throwIfAborted()
    if (usedParents.has(parentToken)) throw fail('BROWSER_OWNER', 'This native parent already used its one browser lifetime.')
    const owner: BrowserOwner = { ownerToken: parentToken, runtime, nativeRunId, signal, assertCurrent() {
      signal.throwIfAborted()
      if (disposed || owners.get(parentToken) !== owner) throw fail('BROWSER_OWNER', 'The native browser lifetime ended.')
    } }
    const close = () => {
      if (owners.get(parentToken) !== owner) return
      owners.delete(parentToken); signal.removeEventListener('abort', close)
      onClose(parentToken)
    }
    owner.close = close; usedParents.add(parentToken); owners.set(parentToken, owner)
    signal.addEventListener('abort', close, { once: true })
    if (signal.aborted) close()
    return close
  }
  return {
    bind,
    resolve(parentToken: unknown) {
      if (disposed) throw fail('BROWSER_OWNER', 'Browser owner registration is unavailable.')
      if (parentToken === undefined || parentToken === null) return null
      const owner = owners.get(parentToken)
      if (!owner) throw fail('BROWSER_OWNER', 'This nested execution has no live Browser owner registration. Closed native runs cannot become direct DSH callers.')
      owner.assertCurrent(); return owner
    },
    dispose() { if (disposed) return; disposed = true; for (const owner of [...owners.values()]) owner.close?.() },
  }
}
