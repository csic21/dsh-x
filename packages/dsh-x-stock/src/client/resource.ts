import { QUOTE_CHANNEL, QUOTE_ENDPOINT, validateSymbol } from '../watchlist.ts'
export const PROTOCOL = 'dsh-x-stock'
export const addressFor = (symbol: any) => `dsh-resource://${PROTOCOL}/${symbol}`
function wait(ms: any, signal: any, target: any) {
  return new Promise<void>(resolve => {
    let timer: any
    const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); target?.removeEventListener('visibilitychange', done); globalThis.removeEventListener?.('online', done); resolve() }
    if (signal.aborted) return resolve()
    signal.addEventListener('abort', done, { once: true })
    target?.addEventListener('visibilitychange', done, { once: true })
    globalThis.addEventListener?.('online', done, { once: true })
    if (Number.isFinite(ms)) timer = setTimeout(done, ms)
  })
}
// Resource ownership means collapse/unmount releases requests and polling.
export function quoteResource(rpc: any, documentObject: EventTarget & { hidden?: boolean } = globalThis.document, navigatorObject: { onLine?: boolean } = globalThis.navigator) {
  return {
    protocol: PROTOCOL,
    async *open(address: any, { signal }: any) {
      const symbol = validateSymbol(new URL(address).pathname.slice(1))
      while (!signal.aborted) {
        if (documentObject?.hidden || navigatorObject?.onLine === false) {
          yield { ok: false, error: { code: navigatorObject?.onLine === false ? 'stock/offline' : 'stock/hidden', message: 'Updates paused', details: {} } }
          await wait(Infinity, signal, documentObject)
          continue
        }
        let result
        try { result = await rpc.call(QUOTE_CHANNEL, QUOTE_ENDPOINT, { symbols: [symbol] }, signal) }
        catch { result = { ok: false, error: { code: 'stock/connection', message: 'Connection lost', details: {} } } }
        if (signal.aborted) return
        if (result.ok) {
          const quote = result.value?.quotes?.find((item: any) => item.symbol === symbol)
          if (!quote) result = { ok: false, error: { code: 'stock/invalid', message: 'Invalid quote response', details: {} } }
          else result = { ok: true, value: { ...quote, source: result.value.source } }
        }
        yield result
        // No polling a deliberately unconfigured source. Remount/reopen after
        // configuring the Host refreshes it; visible configured feeds use 60s.
        await wait(result.ok && result.value.status === 'unconfigured' ? Infinity : 60_000, signal, documentObject)
      }
    },
  }
}
