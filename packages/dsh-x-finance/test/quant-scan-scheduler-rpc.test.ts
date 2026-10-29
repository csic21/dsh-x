import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createQuantScanScheduler } from '../src/quant-scan-scheduler.ts'
import { createQuantScheduleHandler, createQuantScheduleRoute, parseQuantScheduleRequest, QUANT_SCHEDULE_ENDPOINT } from '../src/quant-scan-scheduler-rpc.ts'
import { apply } from '../src/index.ts'
import { loadProfileScope } from '../src/scope.ts'
import { SCOPE, OTHER, fixture } from './quant-scan-scheduler-fixture.ts'

const owner = { principal: { kind: 'owner' } }
test('all actions reject non-owner before any reads, writes, scope access or provider access', async () => {
  let reads = 0, writes = 0, calls = 0
  const scheduler = createQuantScanScheduler({ profileDirectory: '/unused', readScope: async () => { reads++; return SCOPE },
    store: { load: async () => { reads++; return null }, save: async () => { writes++ } },
    provider: async () => { calls++; return undefined }, sourceEnabled: async () => { calls++; return false },
  })
  const handle = createQuantScheduleHandler(scheduler)
  for (const peer of [undefined, {}, { owner: true }, { principal: { kind: 'guest' } }]) {
    for (const action of ['get', 'enable', 'disable']) {
      const result = await handle(QUANT_SCHEDULE_ENDPOINT, { action, scope: SCOPE, consent: true }, undefined, peer)
      assert.equal((result as any).error.code, 'finance/forbidden')
    }
  }
  const controller = new AbortController(); controller.abort()
  assert.equal((await handle(QUANT_SCHEDULE_ENDPOINT, { action: 'get', scope: SCOPE }, controller.signal, owner) as any).error.code, 'finance/cancelled')
  assert.deepEqual([reads, writes, calls], [0, 0, 0])
})

test('only exact get/disable and explicit boolean-consent enable shapes are accepted', () => {
  const enable = { action: 'enable', scope: SCOPE, consent: true }
  assert.deepEqual(parseQuantScheduleRequest(enable), enable)
  for (const input of [null, [], { ...enable, consent: false }, { ...enable, consent: 'true' }, { action: 'enable', scope: SCOPE },
    { ...enable, account: 'private' }, { ...enable, symbols: [] }, { ...enable, scope: '../other' },
    { action: 'get', scope: SCOPE, consent: true }, { action: 'disable', scope: SCOPE, clearReports: true },
    { action: 'run', scope: SCOPE }, { action: 'start', scope: SCOPE }, { action: 'get' }, Object.create(enable),
  ]) assert.throws(() => parseQuantScheduleRequest(input))
})

test('current scope is required for read and mutation; errors never leak paths or provider errors', async () => {
  const f = fixture(), handle = createQuantScheduleHandler(f.scheduler)
  for (const action of ['get', 'enable', 'disable']) {
    const payload = action === 'enable' ? { action, scope: OTHER, consent: true } : { action, scope: OTHER }
    assert.equal((await handle(QUANT_SCHEDULE_ENDPOINT, payload, undefined, owner) as any).error.code, 'finance/quant-schedule-scope-mismatch')
  }
  assert.equal(f.disk.writes, 0)
  f.disk.break()
  const error = await handle(QUANT_SCHEDULE_ENDPOINT, { action: 'enable', scope: SCOPE, consent: true }, undefined, owner)
  assert.equal((error as any).error.code, 'finance/quant-schedule-storage-unavailable')
  assert.ok(!JSON.stringify(error).includes('/private'))
  await assert.rejects(f.scheduler.request({ action: 'enable', scope: SCOPE, consent: false } as any), { code: 'invalid-input' })
})

test('route uses shared exact POST JSON envelope and returns the complete state contract', async () => {
  const f = fixture(), route = createQuantScheduleRoute(f.scheduler)
  assert.equal(route.path, `/api/${QUANT_SCHEDULE_ENDPOINT}`)
  assert.deepEqual(route.methods, ['POST'])
  const request = (value: any, type = 'application/json') => new Request(`http://host${route.path}`, {
    method: 'POST', headers: { 'content-type': type }, body: typeof value === 'string' ? value : JSON.stringify(value),
  })
  const message = { type: 'client-request', method: QUANT_SCHEDULE_ENDPOINT, rpcId: 'quant-1', payload: { action: 'get', scope: SCOPE } }
  const body = await (await route.fetch(request(message))).json()
  assert.equal(body.rpcId, 'quant-1')
  assert.deepEqual(Object.keys(body.result.value).sort(), ['enabled', 'running', 'sourceEnabled', 'lastAttemptDate', 'updatedAt', 'error', 'latest', 'reports', 'blockedReason', 'policy'].sort())
  assert.equal(body.result.value.enabled, false)
  assert.equal((await route.fetch(request(message, 'text/plain'))).status, 415)
  assert.equal((await route.fetch(request({ ...message, extra: true }))).status, 400)
  assert.equal((await route.fetch(request(' '.repeat(8193)))).status, 413)
})

test('official optional timer context owns both tasks and cancels both on service loss', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'quant-host-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const scope = await loadProfileScope(dir), routes: any[] = [], disposers: Array<() => void> = []
  let timers = 0, stops = 0
  const host: any = {
    connection: { fetch: { register: (route: any) => routes.push(route) } }, profileContext: { dir },
    timer: { interval() { timers++; return () => { stops++ } } },
    effect(fn: () => (() => void)) { disposers.push(fn()) },
    inject(deps: string[], fn: (context: any) => void) { assert.deepEqual(deps, ['timer']); fn(host) },
  }
  apply({ tools: { register() {} }, inject(_deps: string[], fn: (context: any) => void) { fn(host) } } as any)
  t.after(() => { for (const dispose of disposers.splice(0).reverse()) dispose() })
  assert.equal(timers, 1)
  const route = routes.find(r => r.path === `/api/${QUANT_SCHEDULE_ENDPOINT}`)
  const call = async (payload: any) => (await (await route.fetch(new Request(`http://host${route.path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', method: QUANT_SCHEDULE_ENDPOINT, rpcId: 'q', payload }),
  }))).json()).result
  assert.equal((await call({ action: 'get', scope })).value.enabled, false)
  assert.deepEqual(await readdir(path.join(dir, '.dsh-x-finance')), ['scope.json'])
  assert.equal((await call({ action: 'enable', scope, consent: true })).value.enabled, true)
  for (const dispose of disposers.splice(0).reverse()) dispose()
  assert.equal(stops, 1)
  assert.equal((await call({ action: 'get', scope })).error.code, 'finance/quant-schedule-disposed')
})
