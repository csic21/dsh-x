import { MAX_FIXED, MAX_WATCHLIST, QUOTE_CHANNEL, validateWatchSymbol } from '../watchlist.ts'
import { MARKET_ENDPOINT, MARKET_MAX_QUOTES } from '../market.ts'
export const PROTOCOL = 'dsh-x-finance'
/** One stock at a time: the page's detail view. */
export const addressFor = (symbol: any) => `dsh-resource://${PROTOCOL}/quote/${validateWatchSymbol(symbol)}`
/** The whole fixed bottom bar, resolved by one upstream batch request. */
export const fixedAddressFor = (symbols: any[]) => `dsh-resource://${PROTOCOL}/fixed/${symbols.join(',')}`
/**
 * The left watchlist rail. Its list can be longer than one upstream batch, so
 * this address is resolved in chunks of MARKET_MAX_QUOTES and merged back into
 * one snapshot; the rail never asks the host for a wider batch than it allows.
 */
export const watchlistAddressFor = (symbols: any[]) => `dsh-resource://${PROTOCOL}/list/${symbols.join(',')}`
/** The fixed bar is the one view that follows the market while it is open. */
export const FIXED_POLL_MS = 5_000
/** The rail is a longer list, so it follows the market a little slower. */
export const WATCHLIST_POLL_MS = 10_000
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

type ParsedAddress = { kind: 'quote' | 'fixed' | 'list', symbols: string[], realtimeMs: number }

function parseSymbols(path: any): ParsedAddress {
  const [kind, rest = ''] = String(path).slice(1).split('/')
  if (kind !== 'quote' && kind !== 'fixed' && kind !== 'list') throw new Error('invalid resource address')
  const raw = kind === 'quote' ? [rest] : rest.split(',')
  const symbols = raw.filter(Boolean).map(validateWatchSymbol)
  const limit = kind === 'list' ? MAX_WATCHLIST : MAX_FIXED
  // An empty list is a valid rail state (no watchlist); an empty single quote
  // is not, and a duplicate code would make one row own another row's price.
  if (kind !== 'list' && !symbols.length) throw new Error('invalid resource address')
  if (symbols.length > limit || new Set(symbols).size !== symbols.length) throw new Error('invalid resource address')
  return { kind, symbols, realtimeMs: kind === 'list' ? WATCHLIST_POLL_MS : FIXED_POLL_MS }
}

function chunksOf(symbols: string[], size: number) {
  const chunks: string[][] = []
  for (let offset = 0; offset < symbols.length; offset += size) chunks.push(symbols.slice(offset, offset + size))
  return chunks
}

/**
 * One snapshot is one merge of the allowed-size batches. A failed batch fails
 * the resource (the rail then shows its status line instead of half a list of
 * prices), and a disabled source stays `unconfigured` instead of polling.
 * `null` means the caller was released while a batch was in flight.
 */
async function readQuotes(rpc: any, symbols: string[], signal: any) {
  if (!symbols.length) return { ok: true, value: { status: 'ready', source: null, quotes: [] } }
  const quotes: any[] = []
  let source: string | null = null
  let unconfigured = 0
  const chunks = chunksOf(symbols, MARKET_MAX_QUOTES)
  for (const batch of chunks) {
    let result
    try { result = await rpc.call(QUOTE_CHANNEL, MARKET_ENDPOINT, { kind: 'quotes', symbols: batch }, signal) }
    catch {
      if (signal.aborted) return null
      return { ok: false, error: { code: 'finance/connection', message: 'Connection lost', details: {} } }
    }
    if (signal.aborted) return null
    if (!result.ok) return result
    if (result.value?.status === 'unconfigured') { unconfigured += 1; continue }
    const received = Array.isArray(result.value?.quotes) ? result.value.quotes : null
    if (!received || batch.some(symbol => !received.some((quote: any) => quote?.symbol === symbol))) {
      return { ok: false, error: { code: 'finance/invalid', message: 'Invalid quote response', details: {} } }
    }
    if (!source && typeof result.value.source === 'string') source = result.value.source
    quotes.push(...received)
  }
  // The source switch is global, so one disabled batch disables the snapshot.
  if (unconfigured) return { ok: true, value: { status: 'unconfigured', source: null, quotes: [] } }
  return { ok: true, value: { status: 'ready', source, quotes } }
}

// Resource ownership means collapse/unmount releases requests and polling.
export function quoteResource(rpc: any, documentObject: EventTarget & { hidden?: boolean } = globalThis.document, navigatorObject: { onLine?: boolean } = globalThis.navigator) {
  return {
    protocol: PROTOCOL,
    async *open(address: any, { signal }: any) {
      const { kind, symbols, realtimeMs } = parseSymbols(new URL(address).pathname)
      while (!signal.aborted) {
        if (documentObject?.hidden || navigatorObject?.onLine === false) {
          yield { ok: false, error: { code: navigatorObject?.onLine === false ? 'finance/offline' : 'finance/hidden', message: 'Updates paused', details: {} } }
          await wait(Infinity, signal, documentObject)
          continue
        }
        let result = await readQuotes(rpc, symbols, signal)
        if (!result) return
        if (result.ok && result.value?.status === 'ready') {
          // Keep the caller's order even though several batches answered.
          result = { ok: true, value: { status: 'ready', source: result.value.source, quotes: symbols.map(symbol => result.value.quotes.find((quote: any) => quote?.symbol === symbol)) } }
        }
        yield result
        // Never poll a deliberately unconfigured source or an empty list. A
        // remount after configuring the Host refreshes it.
        const unconfigured = result.ok && result.value?.status === 'unconfigured'
        await wait(unconfigured || !symbols.length ? Infinity : pollDelay(result, kind !== 'quote', undefined, realtimeMs), signal, documentObject)
      }
    },
  }
}

/**
 * Realtime means: one batched request every `realtimeMs` while the newest
 * quote is still moving, then a slow idle poll. The decision uses the quote
 * time, never the wall clock, so a closed market (or a suspended stock) is not
 * hammered and is not presented as live either.
 */
export function pollDelay(result: any, realtime: boolean, now = Date.now(), realtimeMs = FIXED_POLL_MS) {
  if (!realtime) return IDLE_POLL_MS
  const times = (result?.ok ? result.value?.quotes ?? [] : [])
    .map((quote: any) => Date.parse(quote?.quotedAt))
    .filter((time: number) => Number.isFinite(time))
  if (!times.length) return IDLE_POLL_MS
  return now - Math.max(...times) > STALE_AFTER_MS ? IDLE_POLL_MS : realtimeMs
}
