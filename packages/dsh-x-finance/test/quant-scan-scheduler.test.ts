import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { createQuantScanScheduler, createProfileQuantScheduleStore } from '../src/quant-scan-scheduler.ts'
import { QUANT_SCAN_LIMITS } from '../src/quant-scan.ts'
import type { QuantScanResult } from '../src/quant-scan.ts'
import { SCOPE, OTHER, START, copy, deferred, fixture, memory, settled, until } from './quant-scan-scheduler-fixture.ts'
import { createWatchSignalScheduler } from '../src/watch-signal-scheduler.ts'
import { history, stock } from './quant-scan-fixture.ts'

test('construction, startup, GET and disable without consent write nothing and make no provider calls', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'quant-empty-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const f = fixture({ profileDirectory: dir, store: createProfileQuantScheduleStore(dir) })
  await f.scheduler.tick(); await f.get(); await f.disable(); await f.scheduler.tick()
  assert.deepEqual(await readdir(dir), [])
  assert.deepEqual(f.calls, [])
  const real = createQuantScanScheduler({ profileDirectory: dir, provider: async () => { throw new Error('must not call') }, sourceEnabled: async () => false })
  assert.equal((await real.tick()).enabled, false)
  await assert.rejects(real.request({ action: 'get', scope: SCOPE }))
  assert.deepEqual(await readdir(dir), [])
})

test('morning, 16:44:59 and weekends do not spend an attempt; late startup and concurrent ticks spend exactly one', async () => {
  const f = fixture({ time: Date.parse('2026-10-29T01:00:00Z') })
  await f.enable()
  assert.equal((await f.scheduler.tick()).blockedReason, 'before-window')
  f.time('2026-10-29T08:44:59Z')
  assert.equal((await f.scheduler.tick()).blockedReason, 'before-window')
  f.time('2026-10-31T09:00:00Z')
  assert.equal((await f.scheduler.tick()).blockedReason, 'weekend')
  assert.equal(f.disk.record!.lastAttemptDate, null)
  f.time('2026-11-02T15:40:00Z')
  await Promise.all(Array.from({ length: 20 }, () => f.scheduler.tick()))
  const state = await settled(f.scheduler)
  assert.equal(state.lastAttemptDate, '2026-11-02')
  assert.equal(state.latest?.status, 'complete')
  assert.equal(state.latest?.result?.provisional, true)
  assert.equal(state.latest?.result?.sessionDate, '2026-11-02')
  assert.equal(f.calls.filter(c => c.action === 'start').length, 1)
  assert.equal(f.histories, 3)
  await f.disable(); await f.enable(); await f.scheduler.tick()
  assert.equal(f.histories, 3)
})

test('source off does not acquire provider or consume attempts, even after explicit schedule consent', async () => {
  let providerReads = 0
  const f = fixture({ provider: async () => { providerReads++; return undefined } })
  f.source(false); await f.enable()
  assert.equal((await f.scheduler.tick()).blockedReason, 'source-disabled')
  assert.equal(providerReads, 0)
  assert.equal(f.disk.record!.lastAttemptDate, null)
})

test('weekday holiday preserves the actual source sessionDate and unconfirmed flag', async () => {
  const f = fixture({ time: Date.parse('2026-10-01T09:00:00Z'), sourceDate: '2026-09-30' })
  await f.enable(); await f.scheduler.tick()
  const state = await settled(f.scheduler)
  assert.equal(state.latest?.date, '2026-10-01')
  assert.equal(state.latest?.result?.sessionDate, '2026-09-30')
  assert.equal(state.latest?.result?.rows[0]?.sessionDate, '2026-09-30')
  assert.equal(state.latest?.result?.provisional, true)
  assert.equal(state.policy.holidayCalendar, false)
  assert.equal(state.policy.realtime, false)
  assert.equal(state.policy.hostMustBeRunning, true)
})

test('uses start/status/continue, the real scanner batches, cooldown and top-30 projection', async () => {
  const f = fixture({ size: 351 })
  await f.enable(); await f.scheduler.tick()
  const state = await settled(f.scheduler)
  assert.deepEqual(f.calls.map(c => c.action), ['start', 'status', 'continue', 'status', 'continue'])
  assert.deepEqual(f.waits, [QUANT_SCAN_LIMITS.cooldownMs, QUANT_SCAN_LIMITS.cooldownMs])
  assert.equal(f.histories, 351)
  assert.equal(state.latest?.result?.counts.covered, 351)
  assert.equal(state.latest?.result?.rows.length, 30)
  assert.equal(state.latest?.result?.canContinue, false)
  assert.equal(state.latest?.partial, false)
  assert.equal(state.latest?.result?.provisional, true)
  const text = JSON.stringify(f.disk.record)
  for (const word of ['"bars"', '"account"', '"balance"', '"alias"', '"positions"', '"apiKey"']) assert.ok(!text.includes(word))
  assert.ok(!text.includes('无后台定时'))
})

test('an already running watch task wins admission without consuming the daily attempt', async () => {
  const f = fixture()
  f.watch(true); await f.enable()
  assert.equal((await f.scheduler.tick()).blockedReason, 'watch-running')
  assert.equal(f.disk.record!.lastAttemptDate, null)
  assert.equal(f.calls.length, 0)
  f.watch(false); await f.scheduler.tick(); await settled(f.scheduler)
  assert.equal(f.calls.length, 1)
  const unavailable = fixture({ watchRunning: async () => { throw new Error('unavailable') } })
  await unavailable.enable()
  assert.equal((await unavailable.scheduler.tick()).blockedReason, 'watch-unavailable')
  assert.equal(unavailable.calls.length, 0)
})

test('real watch scheduler owns its in-flight batch; market admission follows its completion', async () => {
  const pending = deferred<any>(), entered = deferred()
  const watch = createWatchSignalScheduler({ profileDirectory: '/unused', now: () => START, readScope: async () => SCOPE,
    store: { load: async () => null, save: async () => {} }, sourceEnabled: async () => true, wait: async () => {},
    search: { enabled: () => true, provider: { name: 'fixture', search: async () => [{ symbol: stock().symbol, name: '样本', kind: 'stock' }] } },
    market: { name: 'fixture', history: async () => { entered.resolve(); return pending.promise } } as any,
  })
  const f = fixture({ watchRunning: async scope => (await watch.request({ action: 'get', scope })).running })
  await watch.request({ action: 'enable', scope: SCOPE, consent: true, symbols: [stock().symbol] })
  await watch.tick(); await entered.promise
  await f.enable(); await f.scheduler.tick()
  assert.equal(f.calls.length, 0)
  assert.equal(f.disk.record!.lastAttemptDate, null)
  pending.resolve(history(stock().symbol, { today: true }))
  for (let i = 0; i < 100 && (await watch.request({ action: 'get', scope: SCOPE })).running; i++) await new Promise<void>(r => setImmediate(r))
  const before = await watch.request({ action: 'get', scope: SCOPE })
  assert.equal(before.running, false)
  await f.scheduler.tick(); await settled(f.scheduler)
  assert.equal(f.calls.length, 1)
  assert.deepEqual(await watch.request({ action: 'get', scope: SCOPE }), before)
  watch.dispose()
})

test('provider payload projection never saves private/raw fields or accepts provider notices', async () => {
  const ready = fixture(), result: any = await ready.scanner({ action: 'start' })
  result.account = { balance: 123 }; result.bars = [1, 2, 3]
  result.rows[0].apiKey = 'private-value'; result.rows[0].bars = [{ close: 42 }]
  result.notices = ['private-value']; result.limits = { requests: Infinity }
  const f = fixture({ time: ready.now(), scan: async () => result })
  await f.enable(); await f.scheduler.tick(); await settled(f.scheduler)
  const text = JSON.stringify(f.disk.record)
  assert.ok(!text.includes('private-value'))
  assert.ok(!text.includes('"bars"'))
  assert.ok(!text.includes('"account"'))
  assert.deepEqual(f.disk.record!.reports[0]!.result!.limits, QUANT_SCAN_LIMITS)
})

test('source/provider changes without a toggle notification are rechecked before further batches', async () => {
  const waiting = deferred(), release = deferred()
  let same = true
  const f = fixture({ size: 200, provider: async () => same ? f.provider : undefined,
    wait: async ms => { waiting.resolve(); await release.promise; f.time(f.now() + ms) },
  })
  await f.enable(); await f.scheduler.tick(); await waiting.promise
  same = false; release.resolve()
  const state = await settled(f.scheduler)
  assert.equal(state.error, 'source-disabled')
  assert.equal(f.calls.length, 1)
  assert.equal(f.signals[0]!.aborted, true)
})

test('status observes a UI-advanced cooldown and never admits continue before its new nextAllowedAt', async () => {
  const f = fixture({ size: 451, scan: async (input, signal) => {
    if (input.action === 'status' && f.calls.filter(c => c.action === 'status').length === 1) await f.scanner({ action: 'continue', scanId: 'scan-1' }, signal)
    if (input.action === 'continue') {
      const status = await f.scanner({ action: 'status' }, signal)
      assert.ok(f.now() >= Date.parse(status!.nextAllowedAt))
    }
    return f.scanner(input, signal)
  } })
  await f.enable(); await f.scheduler.tick()
  const state = await settled(f.scheduler)
  assert.equal(state.latest?.result?.counts.covered, 451)
  assert.equal(state.latest?.status, 'complete')
  assert.equal(f.waits.length, 3)
})

test('upstream circuit breaker ends the attempt and keeps honest partial coverage', async () => {
  const f = fixture({ outage: true })
  await f.enable(); await f.scheduler.tick()
  const state = await settled(f.scheduler)
  assert.equal(state.error, 'upstream-failures')
  assert.equal(state.latest?.partial, true)
  assert.equal(state.latest?.result?.counts.failedPages, 1)
  assert.equal(f.calls.length, 1)
  await f.scheduler.tick(); assert.equal(f.calls.length, 1)
})

test('disable during cooldown immediately aborts, retains the partial checkpoint and cannot resume that date', async () => {
  const waiting = deferred(), release = deferred()
  let waitSignal: AbortSignal | undefined
  const f = fixture({ size: 200, wait: async (_ms, signal) => { waitSignal = signal; waiting.resolve(); await release.promise } })
  await f.enable(); await f.scheduler.tick(); await waiting.promise
  const before = f.disk.record!.reports[0]!.result
  assert.equal(before?.counts.covered, 150)
  const off = await f.disable()
  assert.equal(waitSignal?.aborted, true)
  assert.equal(off.enabled, false)
  assert.equal(off.running, false)
  assert.equal(off.latest?.status, 'interrupted')
  assert.deepEqual(off.latest?.result, before)
  release.resolve(); await f.enable(); await f.scheduler.tick()
  assert.equal(f.calls.length, 1)
  assert.equal((await f.get()).latest?.result?.counts.covered, 150)
})

test('late provider response after disable, re-enable, source change, scope change or unload cannot publish', async () => {
  const ready = fixture(); const result = await ready.scanner({ action: 'start' })
  for (const action of ['disable', 'enable', 'source', 'scope', 'dispose'] as const) {
    const pending = deferred<QuantScanResult | null>()
    const f = fixture({ scan: () => pending.promise })
    await f.enable(); await f.scheduler.tick(); await until(() => f.calls.length === 1)
    if (action === 'disable') await f.disable()
    if (action === 'enable') await f.enable()
    if (action === 'source') { f.source(false); await f.get() }
    if (action === 'scope') { f.scope(OTHER); await f.scheduler.tick() }
    if (action === 'dispose') f.scheduler.dispose()
    assert.equal(f.signals[0]!.aborted, true)
    await new Promise<void>(r => setImmediate(r))
    const before = f.disk.record, writes = f.disk.writes
    pending.resolve(copy(result)); await new Promise<void>(r => setImmediate(r))
    assert.deepEqual(f.disk.record, before, action)
    assert.equal(f.disk.writes, writes, action)
    assert.equal(f.calls.length, 1)
  }
})

test('expiry while a batch response is delayed cannot produce a completed report', async () => {
  const ready = fixture(); const result = await ready.scanner({ action: 'start' })
  const pending = deferred<QuantScanResult | null>()
  const f = fixture({ scan: () => pending.promise })
  await f.enable(); await f.scheduler.tick(); await until(() => f.calls.length === 1)
  f.time(START + QUANT_SCAN_LIMITS.sessionMs + 1)
  pending.resolve(result)
  const state = await settled(f.scheduler)
  assert.equal(state.error, 'expired')
  assert.equal(state.latest?.partial, true)
  assert.equal(state.latest?.result, null)
  assert.equal(f.calls.length, 1)
})

test('expiry during cooldown stops before status/continue and keeps the last bounded report', async () => {
  let f: ReturnType<typeof fixture>
  f = fixture({ size: 200, wait: async () => { f.time(START + QUANT_SCAN_LIMITS.sessionMs) } })
  await f.enable(); await f.scheduler.tick()
  const state = await settled(f.scheduler)
  assert.equal(state.error, 'expired')
  assert.equal(state.latest?.result?.counts.covered, 150)
  assert.equal(f.calls.length, 1)
})

test('restart restores complete or interrupted reports, never repeats that date, and keeps only 20 distinct dates', async () => {
  const f = fixture()
  await f.enable()
  for (let day = 0; day < 40; day++) {
    f.time(START + day * 86_400_000)
    await f.scheduler.tick(); await settled(f.scheduler)
  }
  assert.equal(f.disk.record!.reports.length, 20)
  assert.equal(new Set(f.disk.record!.reports.map(r => r.date)).size, 20)
  const restarted = fixture({ time: f.now(), store: f.disk.store })
  await restarted.scheduler.tick()
  assert.equal(restarted.calls.length, 0)
  assert.deepEqual((await restarted.get()).reports, (await f.get()).reports)
  const pending = deferred<QuantScanResult | null>()
  const interrupted = fixture({ store: f.disk.store, time: Date.parse('2026-12-21T09:00:00Z'), scan: () => pending.promise })
  await interrupted.scheduler.tick(); await until(() => interrupted.calls.length === 1)
  interrupted.scheduler.dispose()
  const recovered = fixture({ store: f.disk.store, time: Date.parse('2026-12-21T10:00:00Z') })
  const state = await recovered.scheduler.tick()
  assert.equal(state.error, 'interrupted')
  assert.equal(state.latest?.status, 'interrupted')
  assert.equal(state.latest?.result, null)
  assert.equal(state.reports.length, 20)
  assert.equal(recovered.calls.length, 0)
  pending.resolve(null)
  await recovered.disable()
  assert.equal(recovered.disk.record, null) // shared store is f's
  assert.equal(f.disk.record!.reports.length, 20)
})

test('enable, attempt and checkpoint disk failures fail closed; interrupted attempt survives a checkpoint failure', async () => {
  for (const failAt of [1, 2, 3]) {
    const disk = memory(); let writes = 0
    const f = fixture({ store: { load: () => disk.store.load(), async save(record) {
      writes++; if (writes === failAt) throw new Error('/private/account/token'); await disk.store.save(record)
    } } })
    if (failAt === 1) await assert.rejects(f.enable(), { code: 'storage-unavailable' })
    else { await f.enable(); await f.scheduler.tick() }
    const state = await settled(f.scheduler)
    assert.equal(state.error, 'storage-unavailable')
    assert.equal(f.calls.length, failAt === 3 ? 1 : 0)
    await f.scheduler.tick()
    assert.equal(f.calls.length, failAt === 3 ? 1 : 0)
    if (failAt === 3) assert.equal(disk.record!.reports[0]!.status, 'interrupted')
  }
})

test('failed disable stops in memory and retains reports; no source call follows the storage failure', async () => {
  const waiting = deferred(), release = deferred()
  const f = fixture({ size: 200, wait: async () => { waiting.resolve(); await release.promise } })
  await f.enable(); await f.scheduler.tick(); await waiting.promise
  f.disk.break()
  await assert.rejects(f.disable(), { code: 'storage-unavailable' })
  release.resolve()
  const state = await settled(f.scheduler)
  assert.equal(state.enabled, false)
  assert.equal(state.latest?.result?.counts.covered, 150)
  assert.equal(state.error, 'storage-unavailable')
  await f.scheduler.tick(); assert.equal(f.calls.length, 1)
})

test('disable while the attempt save is blocked cancels admission and preserves its reserved date', async () => {
  const disk = memory(), entered = deferred(), release = deferred()
  let writes = 0
  const f = fixture({ store: { load: () => disk.store.load(), async save(record) {
    if (++writes === 2) { entered.resolve(); await release.promise }
    await disk.store.save(record)
  } } })
  await f.enable()
  const tick = f.scheduler.tick(); await entered.promise
  const disable = f.disable(); await new Promise<void>(r => setImmediate(r))
  release.resolve(); await tick; await disable
  assert.equal(f.calls.length, 0)
  assert.equal(disk.record!.enabled, false)
  assert.equal(disk.record!.lastAttemptDate, '2026-10-29')
  await f.enable(); await f.scheduler.tick()
  assert.equal(f.calls.length, 0)
})

test('disable queued while provider acquisition is blocked cannot admit an old execution', async () => {
  const entered = deferred(), release = deferred()
  const f = fixture({ provider: async () => { entered.resolve(); await release.promise; return f.provider } })
  await f.enable()
  const tick = f.scheduler.tick(); await entered.promise
  const disable = f.disable(); await new Promise<void>(r => setImmediate(r))
  release.resolve(); await tick; await disable
  assert.equal(f.calls.length, 0)
  assert.equal(f.disk.record!.lastAttemptDate, null)
})
