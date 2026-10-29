import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createWatchScheduleHandler, createWatchScheduleRoute, createWatchScheduleRpc, WATCH_SCHEDULE_ENDPOINT, parseWatchScheduleRequest } from '../src/watch-signal-scheduler-rpc.ts'
import { createWatchSignalScheduler } from '../src/watch-signal-scheduler.ts'
import { MARKET_ENDPOINT } from '../src/market.ts'
import { SEARCH_RPC_ENDPOINT } from '../src/instrument-search.ts'
import { apply } from '../src/index.ts'
import { loadProfileScope } from '../src/scope.ts'

const scope = '12345678-1234-4234-8234-123456789abc'
const owner = { principal: { kind: 'owner' } }
const signal = () => new AbortController().signal

test('every public action checks real owner before parsing, reading scope or touching storage', async () => {
  let reads = 0, writes = 0, calls = 0
  const scheduler = createWatchSignalScheduler({
    profileDirectory: '/unused', readScope: async () => { reads++; return scope },
    store: { async load() { reads++; return null }, async save() { writes++ } },
    search: { enabled: () => false }, sourceEnabled: async () => { calls++; return false },
  })
  const handle = createWatchScheduleHandler(scheduler)
  for (const peer of [undefined, {}, { principal: { kind: 'guest' } }, { owner: true }]) {
    for (const action of ['get', 'enable', 'sync', 'disable', 'run']) {
      const result = await handle(WATCH_SCHEDULE_ENDPOINT, { action, scope, symbols: [], consent: true }, signal(), peer)
      assert.equal((result as any).error.code, 'finance/forbidden')
    }
  }
  assert.deepEqual([reads, writes, calls], [0, 0, 0])
  const aborted = new AbortController(); aborted.abort()
  assert.equal((await handle(WATCH_SCHEDULE_ENDPOINT, { action: 'get', scope }, aborted.signal, owner) as any).error.code, 'finance/cancelled')
  assert.equal(reads, 0)
})

test('strict enable consent, scopes, symbol bounds, duplicates and metadata rejection', () => {
  const valid = { action: 'enable', consent: true, scope, symbols: ['SH.600001'] }
  assert.deepEqual(parseWatchScheduleRequest(valid), valid)
  const symbols = Array.from({ length: 200 }, (_, i) => `SH.${600000 + i}`)
  assert.equal((parseWatchScheduleRequest({ ...valid, symbols }) as any).symbols.length, 200)
  for (const payload of [
    { ...valid, consent: false }, { action: 'enable', scope, symbols: [] }, { ...valid, scope: '../other' },
    { ...valid, symbols: [...symbols, 'SH.600999'] }, { ...valid, symbols: ['SH.600001', 'SH.600001'] },
    { ...valid, symbols: [{ symbol: 'SH.600001', alias: 'private' }] }, { ...valid, symbols: ['../../home'] },
    { ...valid, alias: 'private' }, { ...valid, account: 'private' }, { ...valid, apiKey: 'secret' },
    { action: 'get' }, { action: 'sync', scope, symbols: [], consent: true },
  ]) assert.throws(() => parseWatchScheduleRequest(payload))
})

test('scope errors and storage failures are bounded RPC failures, not leaked paths or secrets', async () => {
  let writes = 0
  const scheduler = createWatchSignalScheduler({
    profileDirectory: '/unused', readScope: async () => scope,
    store: { async load() { return null }, async save() { writes++; throw new Error('/private/user/account/api-key') } },
    search: { enabled: () => false }, sourceEnabled: async () => false,
  })
  const handle = createWatchScheduleHandler(scheduler)
  const stale = await handle(WATCH_SCHEDULE_ENDPOINT, { action: 'enable', scope: '87654321-4321-4321-8321-cba987654321', symbols: [], consent: true }, signal(), owner)
  assert.equal((stale as any).error.code, 'finance/schedule-scope-mismatch')
  assert.equal(writes, 0)
  const failed = await handle(WATCH_SCHEDULE_ENDPOINT, { action: 'enable', scope, symbols: [], consent: true }, signal(), owner)
  assert.equal((failed as any).error.code, 'finance/schedule-storage-unavailable')
  assert.ok(!JSON.stringify(failed).includes('api-key'))
})

test('route uses the shared exact POST JSON envelope and preserves rpcId', async () => {
  const scheduler = createWatchSignalScheduler({ profileDirectory: '/unused', readScope: async () => scope, store: { load: async () => null, save: async () => {} }, search: { enabled: () => false }, sourceEnabled: async () => false })
  const route = createWatchScheduleRoute(scheduler)
  assert.equal(route.path, `/api/${WATCH_SCHEDULE_ENDPOINT}`)
  assert.deepEqual(route.methods, ['POST'])
  const request = (body: unknown, type = 'application/json') => new Request(`http://host${route.path}`, { method: 'POST', headers: { 'content-type': type }, body: typeof body === 'string' ? body : JSON.stringify(body) })
  const message = { type: 'client-request', method: WATCH_SCHEDULE_ENDPOINT, rpcId: 'schedule-1', payload: { action: 'get', scope } }
  const response = await route.fetch(request(message))
  const value = await response.json()
  assert.equal(value.rpcId, 'schedule-1')
  assert.equal(value.result.value.enabled, false)
  assert.equal((await route.fetch(request(message, 'text/plain'))).status, 415)
  assert.equal((await route.fetch(request({ ...message, type: 'owner' }))).status, 400)
  assert.equal((await route.fetch(request(' '.repeat(8193)))).status, 413)
})

test('internal RPC reuses market/search validation, refuses other business operations, rechecks gates after awaits', async () => {
  let allowed = false, searches = 0, histories = 0, captured = 0
  const rpc = createWatchScheduleRpc({
    allowed: async () => allowed,
    search: { enabled: () => true, provider: { name: 'fixture', async search() { searches++; return [{ symbol: 'SH.600001', name: '股份', kind: 'stock' }] } } },
    market: { name: 'fixture', async history() { histories++; return { symbol: 'WRONG', bars: [] } } } as any,
    onHistory: () => { captured++ },
  })
  await assert.rejects(rpc.call('/api', SEARCH_RPC_ENDPOINT, { action: 'search', query: '600001' }, signal()))
  assert.equal(searches, 0)
  allowed = true
  assert.equal((await rpc.call('/api', SEARCH_RPC_ENDPOINT, { action: 'search', query: '600001' }, signal())).ok, true)
  const invalid = await rpc.call('/api', MARKET_ENDPOINT, { kind: 'history', symbol: 'SH.600001', limit: 250, adjustment: 'forward' }, signal())
  assert.equal(invalid.ok, false)
  assert.equal(histories, 1)
  assert.equal(captured, 0)
  await assert.rejects(rpc.call('/api', MARKET_ENDPOINT, { kind: 'overview' }, signal()))
  await assert.rejects(rpc.call('/other', SEARCH_RPC_ENDPOINT, { action: 'search', query: '600001' }, signal()))
  const gate = createWatchScheduleRpc({
    allowed: async () => allowed,
    market: async () => { allowed = false; return { name: 'fixture', async history() { histories++; throw new Error('must not execute') } } as any },
    search: { enabled: () => false }, onHistory: () => {},
  })
  await assert.rejects(gate.call('/api', MARKET_ENDPOINT, { kind: 'history', symbol: 'SH.600001', limit: 250, adjustment: 'forward' }, signal()))
  assert.equal(histories, 1)
})

test('plugin wires the schedule only inside the official timer scope and releases it on unload', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'watch-schedule-plugin-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const currentScope = await loadProfileScope(dir)
  const routes: any[] = [], disposers: Array<() => void> = []
  let timerScope = 0, stopped = 0
  const host: any = {
    connection: { fetch: { register: (route: any) => routes.push(route) } }, profileContext: { dir },
    timer: { interval() { timerScope++; return () => { stopped++ } } },
    effect(fn: () => (() => void)) { disposers.push(fn()) },
    inject(deps: string[], fn: (ctx: any) => void) { assert.deepEqual(deps, ['timer']); fn(host) },
  }
  apply({ tools: { register() {} }, inject(deps: string[], fn: (ctx: any) => void) {
    assert.deepEqual(deps, ['connection', 'profileContext']); fn(host)
  } } as any)
  t.after(() => { for (const dispose of disposers.splice(0).reverse()) dispose() })
  const route = routes.find(row => row.path === `/api/${WATCH_SCHEDULE_ENDPOINT}`)
  const call = async (payload: any) => (await (await route.fetch(new Request(`http://host${route.path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', method: WATCH_SCHEDULE_ENDPOINT, rpcId: 'r', payload }),
  }))).json()).result
  assert.equal(timerScope, 1)
  assert.equal((await call({ action: 'get', scope: currentScope })).value.enabled, false)
  assert.deepEqual(await readdir(path.join(dir, '.dsh-x-finance')), ['scope.json'])
  const enabled = await call({ action: 'enable', scope: currentScope, consent: true, symbols: ['SH.600001'] })
  assert.equal(enabled.value.enabled, true)
  for (const dispose of disposers.splice(0).reverse()) dispose()
  assert.equal(stopped, 1)
  assert.equal((await call({ action: 'get', scope: currentScope })).error.code, 'finance/schedule-disposed')
})
