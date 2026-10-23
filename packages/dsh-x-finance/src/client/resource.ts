import { MAX_FIXED, QUOTE_CHANNEL, validateSymbol } from '../watchlist.ts'
import { MARKET_ENDPOINT } from '../market.ts'
export const PROTOCOL = 'dsh-x-finance'
/** One stock at a time: the page's detail view. */
export const addressFor = (symbol: any) => `dsh-resource://${PROTOCOL}/quote/${validateSymbol(symbol)}`
/** The whole fixed bottom bar, resolved by one upstream batch request. */
export const fixedAddressFor = (symbols: any[]) => `dsh-resource://${PROTOCOL}/fixed/${symbols.join(',')}`
/** The fixed bar is the one view that follows the market while it is open. */
export const FIXED_POLL_MS = 5_000
/** Non-realtime views, and the fixed bar once its feed stopped moving. */
export const IDLE_POLL_MS = 60_000
/** A quote older than this is not a live price, whatever the wall clock says. */
export const STALE_AFTER_MS = 180_000

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

function parseSymbols(path: any): { realtime: boolean, symbols: string[] } {
  const [kind, rest = ''] = String(path).slice(1).split('/')
  const raw = kind === 'fixed' ? rest.split(',') : [rest]
  const symbols = raw.filter(Boolean).map(validateSymbol)
  if (!symbols.length || symbols.length > MAX_FIXED || new Set(symbols).size !== symbols.length) throw new Error('invalid resource address')
  return { realtime: kind === 'fixed', symbols }
}

// Resource ownership means collapse/unmount releases requests and polling.
export function quoteResource(rpc: any, documentObject: EventTarget & { hidden?: boolean } = globalThis.document, navigatorObject: { onLine?: boolean } = globalThis.navigator) {
  return {
    protocol: PROTOCOL,
    async *open(address: any, { signal }: any) {
      const { realtime, symbols } = parseSymbols(new URL(address).pathname)
      while (!signal.aborted) {
        if (documentObject?.hidden || navigatorObject?.onLine === false) {
          yield { ok: false, error: { code: navigatorObject?.onLine === false ? 'finance/offline' : 'finance/hidden', message: 'Updates paused', details: {} } }
          await wait(Infinity, signal, documentObject)
          continue
        }
        let result
        try { result = await rpc.call(QUOTE_CHANNEL, MARKET_ENDPOINT, { kind: 'quotes', symbols }, signal) }
        catch { result = { ok: false, error: { code: 'finance/connection', message: 'Connection lost', details: {} } } }
        if (signal.aborted) return
        if (result.ok && result.value?.status === 'unconfigured') result = { ok: true, value: { status: 'unconfigured', source: null, quotes: [] } }
        else if (result.ok) {
          const quotes = Array.isArray(result.value?.quotes) ? result.value.quotes : null
          if (!quotes || symbols.some(symbol => !quotes.some((quote: any) => quote?.symbol === symbol))) result = { ok: false, error: { code: 'finance/invalid', message: 'Invalid quote response', details: {} } }
          else result = { ok: true, value: { status: 'ready', source: typeof result.value.source === 'string' ? result.value.source : null, quotes: symbols.map(symbol => quotes.find((quote: any) => quote.symbol === symbol)) } }
        }
        yield result
        // Never poll a deliberately unconfigured source. A remount after
        // configuring the Host refreshes it.
        const unconfigured = result.ok && result.value?.status === 'unconfigured'
        await wait(unconfigured ? Infinity : pollDelay(result, realtime), signal, documentObject)
      }
    },
  }
}

/**
 * Realtime means: one batched request every FIXED_POLL_MS while the newest
 * quote is still moving, then a slow idle poll. The decision uses the quote
 * time, never the wall clock, so a closed market (or a suspended stock) is not
 * hammered and is not presented as live either.
 */
export function pollDelay(result: any, realtime: boolean, now = Date.now()) {
  if (!realtime) return IDLE_POLL_MS
  const times = (result?.ok ? result.value?.quotes ?? [] : [])
    .map((quote: any) => Date.parse(quote?.quotedAt))
    .filter((time: number) => Number.isFinite(time))
  if (!times.length) return IDLE_POLL_MS
  return now - Math.max(...times) > STALE_AFTER_MS ? IDLE_POLL_MS : FIXED_POLL_MS
}
