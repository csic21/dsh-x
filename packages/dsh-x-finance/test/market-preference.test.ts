import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { MARKET_ENDPOINT, MARKET_PREFERENCE_ENDPOINT, parseMarketPreferenceRequest } from '../src/market.ts'
import { createMarketController, createProfileMarketPreference } from '../src/market-preference.ts'
import { createMarketHandler, createMarketPreferenceHandler } from '../src/market-rpc.ts'

const now = Date.parse('2026-10-16T16:20:00+08:00')
const provider = {
  name: 'test-provider',
  overview: async () => ({ source: 'test', fetchedAt: new Date(now).toISOString(), quotedAt: null, indices: [], sectors: [] }),
  breadth: async () => ({ source: 'test', fetchedAt: new Date(now).toISOString(), expected: 0, covered: 0, up: 0, down: 0, flat: 0, suspended: 0, coverage: 0, partial: false, amount: 0, distribution: [], topGainers: [], topLosers: [], topAmount: [] }),
  board: async () => ({ source: 'test', fetchedAt: new Date(now).toISOString(), code: '801080', name: '电子', changePercent: 0, amount: null, marketCap: null, total: 0, truncated: false, stocks: [] }),
}
const owner = { principal: { kind: 'owner' } }

test('market preference payloads are exact and bounded', () => {
  assert.deepEqual(parseMarketPreferenceRequest({ action: 'get' }), { action: 'get' })
  assert.deepEqual(parseMarketPreferenceRequest({ action: 'set', enabled: true }), { action: 'set', enabled: true })
  assert.throws(() => parseMarketPreferenceRequest({ action: 'get', extra: 1 }), { code: 'invalid-input' })
  assert.throws(() => parseMarketPreferenceRequest({ action: 'set' }), { code: 'invalid-input' })
  assert.throws(() => parseMarketPreferenceRequest({ action: 'set', enabled: 'yes' }), { code: 'invalid-input' })
  assert.throws(() => parseMarketPreferenceRequest({ action: 'toggle' }), { code: 'invalid-input' })
  assert.throws(() => parseMarketPreferenceRequest(null), { code: 'invalid-input' })
})

test('profile preference is atomic, private and survives a new store instance', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dsh-x-finance-pref-'))
  try {
    const target = path.join(directory, '.dsh-x-finance', 'market.json')
    const store = createProfileMarketPreference(directory)
    assert.equal(await store.load(), false)
    await store.save(true)
    const text = await readFile(target, 'utf8')
    assert.deepEqual(JSON.parse(text), { version: 1, marketSource: true })
    assert.equal((await stat(target)).mode & 0o777, 0o600)
    assert.equal(await createProfileMarketPreference(directory).load(), true)
    await store.save(false)
    assert.equal(await store.load(), false)
    await writeFile(target, '{broken')
    assert.equal(await store.load(), false)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, JSON.stringify({ version: 2, marketSource: true }))
    assert.equal(await store.load(), false)
    assert.throws(() => createProfileMarketPreference('relative/profile'))
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('controller toggles the provider at runtime and keeps forced configuration on', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dsh-x-finance-controller-'))
  try {
    const store = createProfileMarketPreference(directory)
    const controller = createMarketController({ forced: false, store, createProvider: () => provider as any })
    assert.deepEqual(await controller.state(), { enabled: false, forced: false })
    assert.equal(await controller.getProvider(), undefined)
    assert.deepEqual(await controller.setEnabled(true), { enabled: true, forced: false })
    assert.deepEqual(await controller.state(), { enabled: true, forced: false })
    assert.equal(await controller.getProvider(), provider)
    assert.deepEqual(await controller.setEnabled(false), { enabled: false, forced: false })
    assert.equal(await controller.getProvider(), undefined)

    const forced = createMarketController({ forced: true, store, createProvider: () => provider as any })
    assert.deepEqual(await forced.state(), { enabled: true, forced: true })
    assert.deepEqual(await forced.setEnabled(false), { enabled: true, forced: true })
    assert.equal(await forced.getProvider(), provider)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('market data route resolves a provider function per request', async () => {
  let enabled = false
  const route = createMarketHandler({ provider: async () => enabled ? provider as any : undefined })
  const unconfigured = await route(MARKET_ENDPOINT, { kind: 'overview' }, undefined, owner)
  assert.deepEqual(unconfigured, { ok: true, value: { status: 'unconfigured', source: null } })
  enabled = true
  const ready = await route(MARKET_ENDPOINT, { kind: 'overview' }, undefined, owner)
  assert.equal(ready.ok, true)
  assert.equal((ready as any).value.status, 'ready')
})

test('market preference RPC is owner-only, validates payloads and maps failures', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dsh-x-finance-pref-rpc-'))
  try {
    const store = createProfileMarketPreference(directory)
    const controller = createMarketController({ forced: false, store, createProvider: () => provider as any })
    const handler = createMarketPreferenceHandler({ controller })
    assert.deepEqual(await handler(MARKET_PREFERENCE_ENDPOINT, { action: 'get' }, undefined, owner), { ok: true, value: { enabled: false, forced: false } })
    assert.deepEqual(await handler(MARKET_PREFERENCE_ENDPOINT, { action: 'set', enabled: true }, undefined, owner), { ok: true, value: { enabled: true, forced: false } })
    assert.deepEqual(await handler(MARKET_PREFERENCE_ENDPOINT, { action: 'get' }, undefined, owner), { ok: true, value: { enabled: true, forced: false } })
    assert.equal(((await handler(MARKET_PREFERENCE_ENDPOINT, { action: 'get' }, undefined, { principal: { kind: 'guest' } })) as any).error.code, 'finance/forbidden')
    assert.equal(((await handler(MARKET_PREFERENCE_ENDPOINT, { action: 'set', enabled: 'yes' }, undefined, owner)) as any).error.code, 'finance/invalid-input')
    assert.equal(((await handler('other', { action: 'get' }, undefined, owner)) as any).error.code, 'finance/not-found')
    assert.equal(((await handler(MARKET_PREFERENCE_ENDPOINT, { action: 'get' }, undefined, owner)) as any).ok, true)
    const unavailable = await createMarketPreferenceHandler()(MARKET_PREFERENCE_ENDPOINT, { action: 'get' }, undefined, owner)
    assert.equal((unavailable as any).error.code, 'finance/market-preference-unavailable')
    const broken = createMarketPreferenceHandler({ controller: { ...controller, state: async () => { throw new Error('secret') }, setEnabled: async () => { throw new Error('secret') } } })
    const failure = await broken(MARKET_PREFERENCE_ENDPOINT, { action: 'set', enabled: true }, undefined, owner)
    assert.equal((failure as any).error.code, 'finance/market-preference-unavailable')
    assert.doesNotMatch(JSON.stringify(failure), /secret/)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
