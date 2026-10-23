import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { loadProfileScope } from '../src/scope.ts'
import { createProfileMarketPreference } from '../src/market-preference.ts'
import { createWatchlistController } from '../src/client/controller.ts'
import { scopedStorageKey } from '../src/watchlist.ts'

const SCOPE = '11111111-1111-4111-8111-111111111111'
const exists = async (target: string) => { try { await stat(target); return true } catch { return false } }

test('the pre-rename profile directory is adopted so the scope identifier survives', async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'dxf-migrate-'))
  try {
    const previous = path.join(profile, '.dsh-x-stock')
    await mkdir(previous, { recursive: true, mode: 0o700 })
    await writeFile(path.join(previous, 'scope.json'), JSON.stringify({ version: 1, scope: SCOPE }))
    assert.equal(await loadProfileScope(profile), SCOPE)
    assert.equal(await exists(previous), false)
    assert.equal(await exists(path.join(profile, '.dsh-x-finance', 'scope.json')), true)
    // The moved identity keeps working on the next read, and a second read
    // never creates a new scope.
    assert.equal(await loadProfileScope(profile), SCOPE)
  } finally { await rm(profile, { recursive: true, force: true }) }
})

test('an existing new directory wins over a leftover old one', async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'dxf-migrate-'))
  try {
    await mkdir(path.join(profile, '.dsh-x-stock'), { recursive: true, mode: 0o700 })
    await writeFile(path.join(profile, '.dsh-x-stock', 'scope.json'), JSON.stringify({ version: 1, scope: '22222222-2222-4222-8222-222222222222' }))
    await mkdir(path.join(profile, '.dsh-x-finance'), { recursive: true, mode: 0o700 })
    await writeFile(path.join(profile, '.dsh-x-finance', 'scope.json'), JSON.stringify({ version: 1, scope: SCOPE }))
    assert.equal(await loadProfileScope(profile), SCOPE)
    assert.equal(await exists(path.join(profile, '.dsh-x-stock', 'scope.json')), true)
  } finally { await rm(profile, { recursive: true, force: true }) }
})

test('the market source switch is read from the adopted directory', async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'dxf-migrate-'))
  try {
    const previous = path.join(profile, '.dsh-x-stock')
    await mkdir(previous, { recursive: true, mode: 0o700 })
    await writeFile(path.join(previous, 'market.json'), JSON.stringify({ version: 1, marketSource: true }))
    const store = createProfileMarketPreference(profile)
    assert.equal(await store.load(), true)
    await store.save(false)
    assert.equal(await store.load(), false)
  } finally { await rm(profile, { recursive: true, force: true }) }
})

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    storage: { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value) } },
    map,
  }
}

test('a watchlist saved under the pre-rename id is imported instead of dropped', () => {
  const { storage } = memoryStorage({
    [`dsh-x-stock:watchlist:v2:${SCOPE}`]: JSON.stringify({
      version: 2, items: [{ symbol: 'SH.600519', alias: '贵州茅台', fixed: true }], collapsed: false, barHidden: false,
    }),
  })
  const controller = createWatchlistController(storage)
  controller.setScope(SCOPE)
  const state = controller.source.getSnapshot()
  assert.equal(state.items.length, 1)
  assert.equal(state.items[0]!.alias, '贵州茅台')
  assert.equal(state.items[0]!.fixed, true)
  assert.equal(state.storageError, '')
})

test('the current key wins over the pre-rename one and writes only the current key', () => {
  const { storage, map } = memoryStorage({
    [`dsh-x-stock:watchlist:v2:${SCOPE}`]: JSON.stringify({
      version: 2, items: [{ symbol: 'SZ.000001', alias: '旧', fixed: false }], collapsed: false, barHidden: false,
    }),
  })
  const controller = createWatchlistController(storage)
  controller.setScope(SCOPE)
  assert.equal(controller.source.getSnapshot().items[0]!.symbol, 'SZ.000001')
  controller.add({ symbol: 'SH.600519', alias: '贵州茅台' })
  const saved = JSON.parse(map.get(scopedStorageKey(SCOPE))!)
  assert.deepEqual(saved.items.map((item: any) => item.symbol), ['SZ.000001', 'SH.600519'])
})
