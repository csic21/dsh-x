import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink, link, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  createWatchSignalScheduler, createProfileScheduleStore, installWatchScheduleTimer,
  WATCH_SCHEDULE_FILE, WATCH_SCHEDULE_INTERVAL_MS, parseScheduleRecord,
} from '../src/watch-signal-scheduler.ts'
import type { ScheduleRecord, ScheduleStore, WatchSignalScheduler } from '../src/watch-signal-scheduler.ts'
import { loadProfileScope } from '../src/scope.ts'
import { STORE_DIRECTORY } from '../src/store-path.ts'

const SCOPE = '12345678-1234-4234-8234-123456789abc'
const OTHER = '87654321-4321-4321-8321-cba987654321'
const SYMBOLS = ['SH.600001', 'SH.600002', 'SH.600003']
const at = (time: string) => Date.parse(time)
const start = at('2026-10-29T08:30:00Z')
const copy = <T>(x: T): T => structuredClone(x)
const deferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}
function memory(initial: ScheduleRecord | null = null) {
  let record = initial, writes = 0, loads = 0, broken = false
  const store: ScheduleStore = {
    async load() { loads++; return copy(record) },
    async save(next) { writes++; if (broken) throw new Error('private path must not leak'); record = parseScheduleRecord(copy(next)) },
  }
  return { store, get record() { return copy(record) }, get writes() { return writes }, get loads() { return loads }, break(value = true) { broken = value } }
}
function history(symbol: string, end = '2026-10-29', isFinal = true, count = 130, adjustment = 'forward') {
  return {
    symbol, name: '测试股份', source: 'fixture-free-source', adjustment, pricePrecision: 2, volumeBasis: 'shares',
    bars: Array.from({ length: count }, (_, index) => {
      const close = 100 + index
      return { sessionDate: new Date(at(`${end}T00:00:00Z`) - (count - index - 1) * 86_400_000).toISOString().slice(0, 10), open: close, high: close + 1, low: close - 1, close, volume: 1000, amount: 10000, isFinal: index < count - 1 || isFinal }
    }),
  }
}
function fixture(options: { store?: ScheduleStore; scope?: string; time?: number; history?: (symbol: string) => Promise<any>; wait?: (signal: AbortSignal) => Promise<void> } = {}) {
  const disk = memory()
  let enabled = true, time = options.time ?? start, scope = options.scope ?? SCOPE, searches = 0, histories = 0, peak = 0, inflight = 0
  const scheduler = createWatchSignalScheduler({
    profileDirectory: '/unused-profile', store: options.store ?? disk.store,
    readScope: async () => scope, now: () => time, sourceEnabled: async () => enabled,
    wait: options.wait ?? (async () => {}),
    search: { enabled: () => enabled, provider: { name: 'fixture-directory', async search(query) {
      searches++; return [{ symbol: `SH.${query}`, name: '测试股份', kind: 'stock' }]
    } } },
    market: async () => enabled ? { name: 'fixture-free-source', async history(symbol: string) {
      histories++; inflight++; peak = Math.max(peak, inflight)
      try { return options.history ? await options.history(symbol) : history(symbol, new Date(time + 8 * 3_600_000).toISOString().slice(0, 10)) }
      finally { inflight-- }
    } } as any : undefined,
  })
  return {
    scheduler, disk,
    get searches() { return searches }, get histories() { return histories }, get peak() { return peak },
    time(value: string) { time = at(value) }, scope(value: string) { scope = value },
    source(value: boolean) { enabled = value; if (!value) scheduler.sourceChanged() },
    enable: (symbols = SYMBOLS) => scheduler.request({ action: 'enable', scope, symbols, consent: true }),
    get: () => scheduler.request({ action: 'get', scope }),
  }
}
async function settled(scheduler: WatchSignalScheduler, scope = SCOPE) {
  for (let i = 0; i < 100; i++) {
    await new Promise<void>(r => setImmediate(r))
    const state = await scheduler.request({ action: 'get', scope })
    if (!state.running) return state
  }
  throw new Error('scheduler did not settle')
}
async function until(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise<void>(r => setImmediate(r)) }
  throw new Error('condition not reached')
}

test('no explicit enable means no task writes, scans or scope creation, including startup ticks', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'watch-schedule-empty-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const f = fixture({ store: createProfileScheduleStore(dir) })
  await f.scheduler.tick(); await f.get(); await f.scheduler.tick()
  assert.deepEqual(await readdir(dir), [])
  assert.equal(f.searches, 0)
  assert.equal(f.histories, 0)
  await assert.rejects(f.scheduler.request({ action: 'run', scope: SCOPE }), { code: 'not-enabled' })
  await f.scheduler.request({ action: 'disable', scope: SCOPE })
  assert.deepEqual(await readdir(dir), [])
})

test('time window, weekends, late startup and manual run obey one durable attempt per Beijing date', async () => {
  const f = fixture({ time: at('2026-10-29T08:29:59Z') })
  await f.enable()
  assert.equal((await f.scheduler.request({ action: 'run', scope: SCOPE })).blockedReason, 'before-window')
  assert.equal(f.histories, 0)
  f.time('2026-10-29T15:59:00Z') // 23:59 CST: only the current day is caught up.
  await Promise.all(Array.from({ length: 8 }, () => f.scheduler.tick()))
  let state = await settled(f.scheduler)
  assert.equal(state.lastAttemptDate, '2026-10-29')
  assert.equal(state.rows.length, 3)
  assert.equal(state.partial, false)
  assert.equal(state.freshness, 'current')
  assert.equal(f.histories, 3)
  assert.ok(f.peak <= 2)
  await f.scheduler.request({ action: 'run', scope: SCOPE }); await f.scheduler.tick()
  assert.equal(f.histories, 3)
  f.time('2026-10-31T09:00:00Z')
  assert.equal((await f.scheduler.tick()).blockedReason, 'weekend')
  f.time('2026-11-02T09:00:00Z')
  await f.scheduler.tick(); state = await settled(f.scheduler)
  assert.equal(f.histories, 6)
  assert.equal(state.lastAttemptDate, '2026-11-02')
})

test('disabled sources do not consume attempts or issue any directory/history request', async () => {
  const f = fixture()
  f.source(false); await f.enable(); const off = await f.scheduler.tick()
  assert.equal(off.blockedReason, 'source-disabled')
  assert.equal(off.lastAttemptDate, null)
  assert.equal(f.searches, 0)
  f.source(true); await f.scheduler.tick(); await settled(f.scheduler)
  assert.equal(f.histories, 3)
  f.source(false)
  assert.ok((await f.get()).rows.every(row => !row.usable))
})

test('all symbols retain provenance and honest partial/holiday/unfinished/stale statuses', async () => {
  const symbols = Array.from({ length: 7 }, (_, i) => `SH.${600001 + i}`)
  const f = fixture({ history: async symbol => {
    if (symbol === symbols[0]) return history(symbol)
    if (symbol === symbols[1]) return history(symbol, '2026-10-28')
    if (symbol === symbols[2]) return history(symbol, '2026-10-29', false)
    if (symbol === symbols[3]) return history(symbol, '2026-10-01')
    if (symbol === symbols[4]) return history(symbol, '2026-10-29', true, 10)
    if (symbol === symbols[5]) return history(symbol, '2026-10-29', true, 130, 'none')
    throw new Error('offline')
  } })
  await f.enable(symbols); await f.scheduler.tick()
  const state = await settled(f.scheduler)
  assert.equal(state.partial, true)
  assert.equal(state.freshness, 'mixed')
  assert.equal(state.rows.length, 7)
  assert.deepEqual(state.rows.map(row => row.usable), [true, false, false, false, false, false, false])
  assert.deepEqual(state.rows.slice(0, 4).map(row => row.freshness), ['current', 'previous-session', 'unfinished', 'stale'])
  assert.equal(state.rows[1]!.sourceDate, '2026-10-28')
  assert.equal(state.rows[2]!.isFinal, false)
  assert.equal(state.rows[5]!.sourceDate, '2026-10-29')
  assert.equal(state.rows[5]!.status, 'unadjusted')
  assert.equal(state.rows[6]!.status, 'unavailable')
  assert.equal(state.rows[0]!.replay?.status, 'ready')
  assert.equal(state.policy.holidayCalendar, false)
  assert.equal(state.policy.hostMustBeRunning, true)
  assert.ok(!JSON.stringify(f.disk.record).includes('alias'))
  f.time('2026-11-10T09:00:00Z')
  assert.ok((await f.get()).rows.every(row => !row.usable))
})

test('an apparent weekday holiday records actual source date and never labels it current', async () => {
  const f = fixture({ time: at('2026-10-01T09:00:00Z'), history: async symbol => history(symbol, '2026-09-30') })
  await f.enable(); await f.scheduler.tick()
  const state = await settled(f.scheduler)
  assert.equal(state.lastAttemptDate, '2026-10-01')
  assert.equal(state.freshness, 'historical')
  assert.ok(state.rows.every(row => row.sourceDate === '2026-09-30' && !row.usable))
  await f.scheduler.tick(); assert.equal(f.histories, 3)
})

test('provider outage preserves every symbol, with skipped rows after shared scanner circuit breaker', async () => {
  const f = fixture({ history: async () => { throw new Error('outage') } })
  const symbols = Array.from({ length: 20 }, (_, i) => `SH.${600000 + i}`)
  await f.enable(symbols); await f.scheduler.tick()
  const state = await settled(f.scheduler)
  assert.equal(state.rows.length, symbols.length)
  assert.ok(state.rows.some(row => row.status === 'skipped'))
  assert.ok(state.rows.every(row => !row.usable))
  assert.equal(state.partial, true)
  assert.ok(f.histories <= 7)
})

test('sync replaces symbols, clears results and preserves daily attempt; disable clears saved mirrors/results', async () => {
  const f = fixture()
  await assert.rejects(f.scheduler.request({ action: 'sync', scope: SCOPE, symbols: [] }), { code: 'not-enabled' })
  await f.enable(); await f.scheduler.tick(); await settled(f.scheduler)
  const synced = await f.scheduler.request({ action: 'sync', scope: SCOPE, symbols: ['SH.600009'] })
  assert.equal(synced.syncedCount, 1)
  assert.deepEqual(synced.rows, [])
  await f.scheduler.tick(); assert.equal(f.histories, 3)
  const disabled = await f.scheduler.request({ action: 'disable', scope: SCOPE })
  assert.equal(disabled.enabled, false)
  assert.equal(disabled.syncedCount, 0)
  assert.equal(disabled.policy.resultsOnDisable, 'cleared')
  assert.deepEqual(f.disk.record!.symbols, [])
  assert.deepEqual(f.disk.record!.rows, [])
  await f.enable(); await f.scheduler.tick(); assert.equal(f.histories, 3)
})

test('late completion after sync or disable cannot overwrite new state or start another request', async () => {
  for (const action of ['sync', 'disable'] as const) {
    const pending = deferred<any>()
    const f = fixture({ history: () => pending.promise })
    await f.enable(); await f.scheduler.tick(); await until(() => f.histories === 2)
    await f.scheduler.request(action === 'sync' ? { action, scope: SCOPE, symbols: ['SH.600009'] } : { action, scope: SCOPE })
    const writes = f.disk.writes
    pending.resolve(history(SYMBOLS[0]!))
    await settled(f.scheduler); await new Promise<void>(r => setImmediate(r))
    assert.equal(f.disk.writes, writes)
    assert.deepEqual((await f.get()).rows, [])
    assert.equal(f.histories, 2)
    assert.deepEqual(f.disk.record!.symbols, action === 'sync' ? ['SH.600009'] : [])
  }
})

test('source shutdown aborts a rate-limit wait and preserves completed partial rows', async () => {
  const waiting = deferred()
  const f = fixture({ wait: signal => new Promise((resolve, reject) => {
    waiting.resolve(); if (signal.aborted) { reject(signal.reason); return }
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }) })
  await f.enable(); await f.scheduler.tick(); await waiting.promise
  f.source(false)
  const state = await settled(f.scheduler)
  assert.equal(state.error, 'source-disabled')
  assert.equal(state.rows.length, 3)
  assert.ok(state.rows.some(row => row.status === 'skipped'))
  assert.ok(state.rows.every(row => !row.usable))
  assert.ok(f.histories <= 2)
})

test('failed enable or attempt persistence never starts a scan; failed disable fails closed in memory', async () => {
  const f = fixture()
  f.disk.break()
  await assert.rejects(f.enable(), { code: 'storage-unavailable' })
  assert.equal((await f.get()).enabled, false)
  assert.equal(f.histories, 0)
  f.disk.break(false); await f.enable(); f.disk.break()
  const blocked = await f.scheduler.tick()
  assert.equal(blocked.error, 'storage-unavailable')
  assert.equal(f.histories, 0)
  await assert.rejects(f.scheduler.request({ action: 'disable', scope: SCOPE }), { code: 'storage-unavailable' })
  const disabled = await f.get()
  assert.equal(disabled.enabled, false)
  assert.equal(disabled.syncedCount, 0)
  assert.equal(disabled.error, 'storage-unavailable')
  await f.scheduler.tick(); assert.equal(f.histories, 0)
})

test('failed result persistence reports the fault and leaves a durable interrupted attempt', async () => {
  const disk = memory()
  let saves = 0
  const f = fixture({ store: {
    load: () => disk.store.load(),
    async save(record) { saves++; if (saves === 3) throw new Error('disk full'); await disk.store.save(record) },
  } })
  await f.enable(); await f.scheduler.tick()
  const state = await settled(f.scheduler)
  assert.equal(state.error, 'storage-unavailable')
  assert.equal(disk.record!.error, 'interrupted')
  assert.equal(disk.record!.lastAttemptDate, '2026-10-29')
  assert.deepEqual(disk.record!.rows, [])
  await f.scheduler.tick(); assert.equal(f.histories, 3)
})

test('disable cancels immediately while the attempt write is blocked and prevents all network I/O', async () => {
  const disk = memory(), writing = deferred(), release = deferred()
  let saves = 0
  const f = fixture({ store: {
    load: () => disk.store.load(),
    async save(record) { saves++; if (saves === 2) { writing.resolve(); await release.promise }; await disk.store.save(record) },
  } })
  await f.enable()
  const tick = f.scheduler.tick()
  await writing.promise
  const disable = f.scheduler.request({ action: 'disable', scope: SCOPE })
  // Allow request's authority check to finish before unblocking disk I/O.
  await new Promise<void>(r => setImmediate(r))
  release.resolve(); await tick; await disable
  assert.equal(f.searches, 0)
  assert.equal(f.histories, 0)
  assert.equal(disk.record!.enabled, false)
  assert.deepEqual(disk.record!.symbols, [])
})

test('a close requested while the source gate is pending cannot start a fresh generation', async () => {
  const gate = deferred<boolean>(), entered = deferred()
  let hold = false, calls = 0
  const scheduler = createWatchSignalScheduler({
    profileDirectory: '/unused', store: memory().store, readScope: async () => SCOPE, now: () => start,
    sourceEnabled: async () => { if (hold) { entered.resolve(); return gate.promise }; return true },
    search: { enabled: () => true, provider: { name: 'fixture', async search() { calls++; return [] } } },
  })
  await scheduler.request({ action: 'enable', scope: SCOPE, symbols: SYMBOLS, consent: true })
  hold = true
  const tick = scheduler.tick(); await entered.promise
  const disable = scheduler.request({ action: 'disable', scope: SCOPE })
  await new Promise<void>(r => setImmediate(r))
  hold = false; gate.resolve(true)
  await tick; await disable
  assert.equal(calls, 0)
  assert.equal((await scheduler.request({ action: 'get', scope: SCOPE })).enabled, false)
})

test('process restart recovers consent/results and never repeats a completed or interrupted attempt', async () => {
  const original = fixture()
  await original.enable(); await original.scheduler.tick(); await settled(original.scheduler)
  const restarted = fixture({ store: original.disk.store })
  await restarted.scheduler.tick()
  assert.equal((await restarted.get()).rows.length, 3)
  assert.equal(restarted.histories, 0)
  const pending = deferred<any>()
  original.time('2026-10-30T09:00:00Z')
  const interrupted = fixture({ time: at('2026-10-30T09:00:00Z'), store: original.disk.store, history: () => pending.promise })
  await interrupted.scheduler.tick(); await until(() => interrupted.histories === 2)
  interrupted.scheduler.dispose()
  const afterCrash = fixture({ time: at('2026-10-30T10:00:00Z'), store: original.disk.store })
  const state = await afterCrash.scheduler.tick()
  assert.equal(state.error, 'interrupted')
  assert.equal(state.running, false)
  assert.equal(afterCrash.histories, 0)
  pending.resolve(history(SYMBOLS[0]!))
})

test('scope replacement cancels the old execution; stale callers cannot read or change the new profile', async () => {
  const pending = deferred<any>()
  const f = fixture({ history: () => pending.promise })
  await f.enable(); await f.scheduler.tick(); await until(() => f.histories === 2)
  f.scope(OTHER)
  await assert.rejects(f.scheduler.request({ action: 'get', scope: SCOPE }), { code: 'scope-mismatch' })
  assert.equal((await f.get()).enabled, false)
  await f.enable(['SH.600009'])
  const before = f.disk.record
  pending.resolve(history(SYMBOLS[0]!)); await settled(f.scheduler, OTHER)
  assert.deepEqual(f.disk.record, before)
  assert.equal(f.disk.record!.scope, OTHER)
})

test('real profile files are private and atomic; copied, truncated, duplicate and oversized state fails closed', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'watch-schedule-store-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const a = path.join(root, 'a'), b = path.join(root, 'b')
  await mkdir(a); await mkdir(b)
  const scopeA = await loadProfileScope(a), scopeB = await loadProfileScope(b)
  const storeA = createProfileScheduleStore(a), storeB = createProfileScheduleStore(b)
  const f = fixture({ store: storeA, scope: scopeA })
  await f.enable(); await f.scheduler.tick(); await settled(f.scheduler, scopeA)
  const target = path.join(a, STORE_DIRECTORY, WATCH_SCHEDULE_FILE)
  assert.equal((await stat(target)).mode & 0o777, 0o600)
  assert.deepEqual((await readdir(path.dirname(target))).sort(), ['scope.json', WATCH_SCHEDULE_FILE].sort())
  const text = await readFile(target, 'utf8')
  const copied = path.join(b, STORE_DIRECTORY, WATCH_SCHEDULE_FILE)
  await writeFile(copied, text)
  const foreign = fixture({ store: storeB, scope: scopeB })
  const state = await foreign.scheduler.tick()
  assert.equal(state.enabled, false)
  assert.equal(state.error, 'scope-mismatch')
  assert.equal(foreign.searches, 0)
  const parsed = JSON.parse(text)
  for (const content of [text.slice(0, -10), JSON.stringify({ ...parsed, symbols: [SYMBOLS[0], SYMBOLS[0]] }), JSON.stringify({ ...parsed, rows: [parsed.rows[0], parsed.rows[0]] }), ' '.repeat(4 * 1024 * 1024 + 1)]) {
    await writeFile(target, content)
    const corrupt = fixture({ store: createProfileScheduleStore(a), scope: scopeA })
    assert.equal((await corrupt.scheduler.tick()).error, 'storage-unavailable')
    assert.equal(corrupt.histories, 0)
  }
})

test('symlinked directories/files/scopes and hardlinked task state cannot cross profiles', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'watch-schedule-safe-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const a = path.join(root, 'a'), b = path.join(root, 'b')
  await mkdir(a); await mkdir(b)
  await loadProfileScope(b)
  await symlink(path.join(b, STORE_DIRECTORY), path.join(a, STORE_DIRECTORY))
  const store = createProfileScheduleStore(a)
  await assert.rejects(store.load())
  const f = fixture({ store })
  await assert.rejects(f.enable())
  assert.deepEqual(await readdir(path.join(b, STORE_DIRECTORY)), ['scope.json'])
  await rm(path.join(a, STORE_DIRECTORY)); await loadProfileScope(a)
  const target = path.join(a, STORE_DIRECTORY, WATCH_SCHEDULE_FILE)
  const outside = path.join(b, 'untouched.json')
  await writeFile(outside, 'do not replace')
  for (const makeLink of [symlink, link]) {
    await makeLink(outside, target)
    await assert.rejects(store.load())
    await assert.rejects(f.enable())
    assert.equal(await readFile(outside, 'utf8'), 'do not replace')
    await rm(target)
  }
  const scopeFile = path.join(a, STORE_DIRECTORY, 'scope.json')
  await rm(scopeFile); await symlink(path.join(b, STORE_DIRECTORY, 'scope.json'), scopeFile)
  const guarded = createWatchSignalScheduler({ profileDirectory: a, search: { enabled: () => false }, sourceEnabled: async () => false })
  await assert.rejects(guarded.request({ action: 'enable', scope: await loadProfileScope(b), symbols: [], consent: true }))
  assert.equal((await readdir(path.join(a, STORE_DIRECTORY))).length, 1)
})

test('timer is ctx-owned, catches up on install and cancels work on disposal', async () => {
  const f = fixture()
  await f.enable()
  let callback!: () => void, dispose!: () => void, stopped = 0
  const host = {
    timer: { interval(fn: () => void, delay: number) { callback = fn; assert.equal(delay, WATCH_SCHEDULE_INTERVAL_MS); return () => { stopped++ } } },
    effect(fn: () => (() => void)) { dispose = fn() },
  }
  installWatchScheduleTimer(host, f.scheduler)
  await settled(f.scheduler)
  assert.equal(f.histories, 3)
  dispose(); callback()
  assert.equal(stopped, 1)
  assert.equal((await f.scheduler.tick()).blockedReason, 'disposed')
  assert.equal(f.histories, 3)
})
