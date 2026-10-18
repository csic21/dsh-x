import { decideUpdate } from './decision.ts'
import { readLocalState } from './local.ts'
import { loadPluginRelease } from './manifests.ts'
import { fetchReleaseIndex, newestFor, type FetchLike } from './releases.ts'
import type { LocalState, UpdateConfig, UpdatePlan, UpdateStatus } from './types.ts'

const DEFAULT_REPOSITORY = 'csic21/dsh-x'
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

function emptyLocal(): LocalState {
  return { home: null, profile: null, runtimeVersion: null, plugins: [] }
}

function normalizeConfig(input: UpdateConfig = {}) {
  const repository = typeof input.repository === 'string' && REPOSITORY.test(input.repository) ? input.repository : DEFAULT_REPOSITORY
  const feedUrl = typeof input.feedUrl === 'string' ? input.feedUrl : undefined
  if (feedUrl) {
    const parsed = new URL(feedUrl)
    const local = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost'
    if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) throw new Error('Update feed must use HTTPS')
  }
  return {
    repository,
    feedUrl,
    autoCheck: input.autoCheck !== false,
    checkIntervalHours: Math.min(168, Math.max(1, Number(input.checkIntervalHours) || 6)),
    initialDelaySeconds: Math.min(3600, Math.max(0, Number(input.initialDelaySeconds ?? 20))),
  }
}

export interface UpdateServiceOptions {
  env?: NodeJS.ProcessEnv
  profileContext?: { name?: string; dir?: string; home?: string }
  runtimeVersion?: string | null
  fetchImpl?: FetchLike
  config?: UpdateConfig
  now?: () => number
}

export interface UpdateService {
  snapshot(): UpdateStatus
  check(): Promise<UpdateStatus>
  start(): () => void
  stop(): void
}

/**
 * Check-only updater. Installation stays with the official Plugins page or
 * `dsh plugin`, so this service never downloads a package, edits a profile, or
 * writes an update directory.
 */
export function createUpdateService(options: UpdateServiceOptions = {}): UpdateService {
  const env = options.env ?? process.env
  const fetchImpl = options.fetchImpl ?? fetch
  const config = normalizeConfig(options.config)
  const now = options.now ?? (() => Date.now())
  let local = emptyLocal()
  let plan: UpdatePlan | null = null
  let phase: UpdateStatus['phase'] = 'idle'
  let checkedAt: string | null = null
  let error: string | null = null
  let stopped = false
  let checking: Promise<UpdateStatus> | null = null
  let loaded = false
  let loading: Promise<void> | null = null

  function snapshot(): UpdateStatus {
    return {
      schema: 1,
      phase,
      checkedAt,
      error,
      local,
      plan,
      config: { repository: config.repository, autoCheck: config.autoCheck },
    }
  }

  function load(): Promise<void> {
    if (loaded) return Promise.resolve()
    if (loading) return loading
    loading = readLocalState({
      env,
      profileContext: options.profileContext,
      runtimeVersion: options.runtimeVersion,
    }).then(value => { local = value; loaded = true }).finally(() => { loading = null })
    return loading
  }

  async function runCheck(): Promise<UpdateStatus> {
    try { await load() } catch (failure) {
      phase = 'error'
      error = failure instanceof Error ? failure.message : String(failure)
      return snapshot()
    }
    if (stopped) return snapshot()
    phase = 'checking'
    error = null
    try {
      const entries = await fetchReleaseIndex({ repository: config.repository, feedUrl: config.feedUrl, fetchImpl })
      const entry = newestFor(entries, 'plugins', 1)[0]
      const plugin = entry
        ? await loadPluginRelease({
            repository: config.repository,
            tag: entry.tag,
            version: entry.version,
            fetchImpl,
          })
        : null
      plan = decideUpdate({ local, plugin })
      checkedAt = new Date(now()).toISOString()
      phase = 'idle'
    } catch (failure) {
      phase = 'error'
      error = failure instanceof Error ? failure.message : String(failure)
      checkedAt = new Date(now()).toISOString()
    }
    return snapshot()
  }

  function check(): Promise<UpdateStatus> {
    if (checking) return checking
    checking = runCheck().finally(() => { checking = null })
    return checking
  }

  function start(): () => void {
    if (!config.autoCheck) return () => {}
    const initial = setTimeout(() => { void check() }, config.initialDelaySeconds * 1000)
    initial.unref?.()
    const interval = setInterval(() => { void check() }, config.checkIntervalHours * 3600_000)
    interval.unref?.()
    return () => { clearTimeout(initial); clearInterval(interval) }
  }

  function stop(): void {
    stopped = true
  }

  void load().catch(() => {})
  return { snapshot, check, start, stop }
}
