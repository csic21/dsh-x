import { createQuantScanScheduler, parseQuantScheduleRecord } from '../src/quant-scan-scheduler.ts'
import type { QuantScheduleOptions, QuantScheduleRecord, QuantScheduleStore, QuantScanScheduler } from '../src/quant-scan-scheduler.ts'
import { createQuantScanner } from '../src/quant-scan.ts'
import type { QuantScanRequest, QuantScanResult } from '../src/quant-scan.ts'
import type { MarketProvider } from '../src/market.ts'
import { history, stock } from './quant-scan-fixture.ts'

export const SCOPE = '12345678-1234-4234-8234-123456789abc'
export const OTHER = '87654321-4321-4321-8321-cba987654321'
export const START = Date.parse('2026-10-29T08:45:00Z')
export const copy = <T>(value: T): T => structuredClone(value)
export function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}
export function memory(initial: QuantScheduleRecord | null = null) {
  let record = copy(initial), writes = 0, loads = 0, broken = false
  const store: QuantScheduleStore = {
    async load() { loads++; return copy(record) },
    async save(next) { writes++; if (broken) throw new Error('/private/account/token'); record = parseQuantScheduleRecord(copy(next)) },
  }
  return { store, get record() { return copy(record) }, get writes() { return writes }, get loads() { return loads }, break(value = true) { broken = value } }
}
export function fixture(options: Partial<QuantScheduleOptions> & {
  time?: number; size?: number; sourceDate?: string; scan?: (input: QuantScanRequest, signal?: AbortSignal) => Promise<QuantScanResult | null>
  outage?: boolean
} = {}) {
  const disk = memory(), calls: QuantScanRequest[] = [], waits: number[] = [], signals: AbortSignal[] = []
  let time = options.time ?? START, scope = SCOPE, enabled = true, watch = false, historyCalls = 0, pages = 0
  let ids = 0
  const scanner = createQuantScanner({ source: 'fixture-free-source', now: () => time, id: () => `scan-${++ids}`,
    wait: async (ms, signal) => { signal.throwIfAborted(); time += ms },
    page: async offset => {
      pages++
      if (options.outage) throw new Error('offline')
      const stocks = Array.from({ length: options.size ?? 3 }, (_, i) => stock(i + 1)).slice(offset, offset + 200)
      return { stocks, expected: options.size ?? 3, invalid: 0, rawCount: stocks.length }
    },
    history: async symbol => {
      historyCalls++
      const value = history(symbol, { today: true })
      const target = options.sourceDate ?? new Date(time + 8 * 3_600_000).toISOString().slice(0, 10)
      const delta = Date.parse(target) - Date.parse('2026-10-29')
      value.bars = value.bars.map(row => ({ ...row, sessionDate: new Date(Date.parse(row.sessionDate) + delta).toISOString().slice(0, 10) }))
      value.fetchedAt = new Date(time).toISOString()
      return value
    },
  })
  const provider = { name: 'fixture-free-source', async quantScan(input: QuantScanRequest, signal?: AbortSignal) {
    calls.push(copy(input)); if (signal) signals.push(signal)
    return options.scan ? options.scan(input, signal) : scanner(input, signal)
  } } as MarketProvider
  const scheduler = createQuantScanScheduler({
    profileDirectory: '/unused', store: disk.store, readScope: async () => scope,
    now: () => time, provider: async () => enabled ? provider : undefined, sourceEnabled: async () => enabled,
    watchRunning: async () => watch,
    wait: async (ms, signal) => { signal.throwIfAborted(); waits.push(ms); time += ms }, ...options,
  })
  return { scheduler, disk, calls, waits, signals, scanner, provider,
    get histories() { return historyCalls }, get pages() { return pages }, now: () => time,
    time(value: string | number) { time = typeof value === 'number' ? value : Date.parse(value) },
    scope(value: string) { scope = value }, watch(value: boolean) { watch = value },
    source(value: boolean, notify = true) { enabled = value; if (notify) scheduler.sourceChanged() },
    enable: () => scheduler.request({ action: 'enable', scope, consent: true }),
    get: () => scheduler.request({ action: 'get', scope }),
    disable: () => scheduler.request({ action: 'disable', scope }),
  }
}
export async function until(predicate: () => boolean) {
  for (let i = 0; i < 300; i++) { if (predicate()) return; await new Promise<void>(r => setImmediate(r)) }
  throw new Error('condition not reached')
}
export async function settled(scheduler: QuantScanScheduler, scope = SCOPE) {
  for (let i = 0; i < 300; i++) {
    await new Promise<void>(r => setImmediate(r))
    const state = await scheduler.request({ action: 'get', scope })
    if (!state.running) return state
  }
  throw new Error('scheduler did not settle')
}
