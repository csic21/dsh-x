// Per-profile market source preference. The UI switch writes this small file;
// it is not a credential and it never contains market data. The official
// profile directory remains the only storage root.
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { MarketPreference, MarketProvider } from './market.ts'
import { profileStoreDirectory } from './store-path.ts'

export interface MarketPreferenceStore {
  load(): Promise<boolean>
  save(enabled: boolean): Promise<void>
}

export function createProfileMarketPreference(profileDirectory: unknown): MarketPreferenceStore {
  if (typeof profileDirectory !== 'string' || !path.isAbsolute(profileDirectory)) throw new Error('缺少有效的宿主 profile 目录。')
  // Resolved lazily so the pre-rename directory is adopted before first use.
  let resolved: Promise<string> | undefined
  const directory = () => resolved ??= profileStoreDirectory(profileDirectory)
  return {
    async load() {
      try {
        const target = path.join(await directory(), 'market.json')
        const text = await readFile(target, 'utf8')
        if (text.length > 1024) return false
        const value = JSON.parse(text)
        return value?.version === 1 && value?.marketSource === true
      } catch {
        // Missing, unreadable and malformed preferences all fail closed to off.
        // A failed save still surfaces when the UI tries to switch it on.
        return false
      }
    },
    async save(enabled) {
      const base = await directory()
      await mkdir(base, { recursive: true, mode: 0o700 })
      const target = path.join(base, 'market.json')
      const temporary = path.join(base, `${randomUUID()}.tmp`)
      try {
        await writeFile(temporary, JSON.stringify({ version: 1, marketSource: enabled }), { flag: 'wx', mode: 0o600 })
        await rename(temporary, target)
      } finally {
        await unlink(temporary).catch(() => {})
      }
    },
  }
}

export interface MarketController {
  getProvider(): Promise<MarketProvider | undefined>
  state(): Promise<MarketPreference>
  setEnabled(enabled: boolean): Promise<MarketPreference>
}

export function createMarketController(options: {
  forced: boolean
  store: MarketPreferenceStore
  createProvider: () => MarketProvider
}): MarketController {
  let loaded = false
  let enabled = false
  let provider: MarketProvider | undefined
  const ensure = async () => {
    if (!loaded) {
      enabled = options.forced || await options.store.load()
      loaded = true
    }
  }
  return {
    async getProvider() {
      await ensure()
      if (!enabled) return undefined
      if (!provider) provider = options.createProvider()
      return provider
    },
    async state() {
      await ensure()
      return { enabled: enabled || options.forced, forced: options.forced }
    },
    async setEnabled(next) {
      await ensure()
      if (options.forced) return { enabled: true, forced: true }
      if (next === enabled) return { enabled, forced: false }
      await options.store.save(next)
      enabled = next
      if (!next) provider = undefined
      return { enabled, forced: false }
    },
  }
}
