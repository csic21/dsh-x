import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, realpath, rename, unlink } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import type { MarketProvider } from './market.ts'
import { projectQuantScan, quantDate, QUANT_SCAN_LIMITS, QUANT_SCAN_NOTICE } from './quant-scan.ts'
import type { QuantScanRequest, QuantScanResult } from './quant-scan.ts'
import { parseQuantScheduleRequest } from './quant-scan-scheduler-rpc.ts'
import type { QuantScheduleRequest } from './quant-scan-scheduler-rpc.ts'
import { profileStoreDirectory, STORE_DIRECTORY, PREVIOUS_STORE_DIRECTORY } from './store-path.ts'
import { validateScope } from './watchlist.ts'

export const QUANT_SCHEDULE_FILE = 'quant-scan-schedule.json'
export const QUANT_SCHEDULE_MAX_BYTES = 2 * 1024 * 1024
export const QUANT_SCHEDULE_POLICY = Object.freeze({
  timeZone: 'Asia/Shanghai', after: '16:45', weekdaysOnly: true, holidayCalendar: false,
  hostMustBeRunning: true, catchUp: 'current-weekday-only', maxAttemptsPerDate: 1,
  reportsRetained: 20, resultsOnDisable: 'retained', watchlistPriority: 'already-running-at-start',
  recovery: 'interrupted-no-automatic-resume', realtime: false,
  notice: '开启后，每个工作日上海时间 16:45 后可能持续发起数千次免费行情请求；不识别法定节假日，需宿主保持运行。每天最多自动尝试一次，中断后当天不自动重试，可在 UI 手动启动 scanner。仅保留最近 20 个报告日期、每次前 30 候选与覆盖统计；不改变自选或账户、不下单，报告不代表实时行情或交易所全覆盖。',
  limits: QUANT_SCAN_LIMITS,
} as const)
const REPORT_NOTICES = [QUANT_SCHEDULE_POLICY.notice, ...QUANT_SCAN_NOTICE.slice(1)]
export type QuantScheduleError = null | 'interrupted' | 'source-disabled' | 'scope-mismatch' | 'storage-unavailable' | 'scan-failed' | 'upstream-failures' | 'expired'
export interface QuantScheduleReport {
  /** Attempt's Shanghai calendar date. Source trading dates remain in result. */
  date: string
  updatedAt: string
  status: 'complete' | 'partial' | 'interrupted'
  partial: boolean
  error: QuantScheduleError
  /** A bounded snapshot, never a resumable session or raw daily-bar database. */
  result: QuantScanResult | null
}
export interface QuantScheduleRecord {
  version: 1
  scope: string
  consent: true
  enabled: boolean
  lastAttemptDate: string | null
  updatedAt: string | null
  error: QuantScheduleError
  reports: QuantScheduleReport[]
}
export interface QuantScheduleState {
  enabled: boolean
  running: boolean
  sourceEnabled: boolean
  lastAttemptDate: string | null
  updatedAt: string | null
  error: QuantScheduleError
  latest: QuantScheduleReport | null
  reports: QuantScheduleReport[]
  blockedReason: null | 'disabled' | 'disposed' | 'running' | 'source-disabled' | 'before-window' | 'weekend' | 'already-attempted' | 'watch-running' | 'watch-unavailable' | 'storage-unavailable' | 'scope-mismatch'
  policy: typeof QUANT_SCHEDULE_POLICY
}
export interface QuantScheduleStore {
  load(): Promise<QuantScheduleRecord | null>
  save(record: QuantScheduleRecord): Promise<void>
}
const fail = (code: string): never => { throw Object.assign(new Error(code), { code }) }
const clone = <T>(value: T): T => structuredClone(value)
const iso = (time: number) => new Date(time).toISOString()
const stamp = (value: unknown): value is string => typeof value === 'string' && value.length <= 32
  && Number.isFinite(Date.parse(value)) && iso(Date.parse(value)) === value
const errors: QuantScheduleError[] = [null, 'interrupted', 'source-disabled', 'scope-mismatch', 'storage-unavailable', 'scan-failed', 'upstream-failures', 'expired']
const empty = (): QuantScheduleRecord => ({ version: 1, scope: '', consent: true, enabled: false, lastAttemptDate: null, updatedAt: null, error: null, reports: [] })
export function quantScheduleClock(now: number) {
  const time = new Date(now + 8 * 3_600_000)
  return { date: time.toISOString().slice(0, 10), weekday: time.getUTCDay(), minutes: time.getUTCHours() * 60 + time.getUTCMinutes() }
}
function exact(value: any, keys: string[]) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) fail('storage-unavailable')
}
function reportResult(raw: unknown, now: number) {
  const result = projectQuantScan(raw, now)
  return result && { ...result, canContinue: false, notices: [...REPORT_NOTICES] }
}
/** Disk input is stricter than the provider projection: unknown/private fields are rejected. */
export function parseQuantScheduleRecord(value: any): QuantScheduleRecord {
  exact(value, ['version', 'scope', 'consent', 'enabled', 'lastAttemptDate', 'updatedAt', 'error', 'reports'])
  if (value.version !== 1 || value.consent !== true || typeof value.enabled !== 'boolean') fail('storage-unavailable')
  validateScope(value.scope)
  if ((value.lastAttemptDate !== null && !quantDate(value.lastAttemptDate)) || !stamp(value.updatedAt) || !errors.includes(value.error)) fail('storage-unavailable')
  if (!Array.isArray(value.reports) || value.reports.length > 20) fail('storage-unavailable')
  let previous = '9999-99-99'
  for (const report of value.reports) {
    exact(report, ['date', 'updatedAt', 'status', 'partial', 'error', 'result'])
    if (!quantDate(report.date) || report.date >= previous || !stamp(report.updatedAt) || report.date > value.lastAttemptDate
      || report.date > quantScheduleClock(Date.parse(report.updatedAt)).date || report.updatedAt > value.updatedAt
      || !errors.includes(report.error) || !['complete', 'partial', 'interrupted'].includes(report.status)) fail('storage-unavailable')
    previous = report.date
    if (report.result !== null) {
      const projected = reportResult(report.result, Date.parse(report.result.updatedAt))
      if (!projected || !isDeepStrictEqual(projected, report.result) || report.result.updatedAt > report.updatedAt) fail('storage-unavailable')
    }
    const complete = report.error === null && report.result?.stopReason === 'finished' && report.result.partial === false
    if (report.partial !== !complete || (report.status === 'complete') !== complete
      || (report.status === 'interrupted' && report.error === null) || (report.result === null && report.error === null)) fail('storage-unavailable')
  }
  if ((value.lastAttemptDate === null) !== (value.reports.length === 0) || (value.reports.length && value.reports[0].date !== value.lastAttemptDate)) fail('storage-unavailable')
  return clone(value)
}

/** Pinned real profile/directory identity; no mkdir, migration or scope creation on reads. */
function profileAccess(profile: string) {
  if (typeof profile !== 'string' || !path.isAbsolute(profile)) fail('storage-unavailable')
  let pinned: string | undefined, directoryIdentity: string | undefined
  return async (optional = false) => {
    const stat = await lstat(profile)
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('storage-unavailable')
    const root = await realpath(profile), identity = `${root}:${stat.dev}:${stat.ino}`
    if (pinned && pinned !== identity) fail('storage-unavailable')
    pinned = identity
    const directory = path.join(root, STORE_DIRECTORY)
    try {
      const info = await lstat(directory)
      if (!info.isDirectory() || info.isSymbolicLink()) fail('storage-unavailable')
      const current = `${info.dev}:${info.ino}`
      if (directoryIdentity && directoryIdentity !== current) fail('storage-unavailable')
      directoryIdentity = current
    } catch (error: any) { if (!optional || error.code !== 'ENOENT' || directoryIdentity) throw error }
    return { root, directory }
  }
}
async function readJson(target: string, limit: number) {
  const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > limit) fail('storage-unavailable')
    const buffer = Buffer.alloc(limit + 1)
    let length = 0
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, length)
      if (!bytesRead) break
      length += bytesRead
    }
    if (length > limit) fail('storage-unavailable')
    return JSON.parse(buffer.subarray(0, length).toString('utf8'))
  } finally { await file.close() }
}
/** Read the existing official scope directly: loadProfileScope may create/migrate it. */
function profileScopeReader(profile: string) {
  const access = profileAccess(profile)
  return async () => {
    const { directory } = await access()
    const value = await readJson(path.join(directory, 'scope.json'), 1024)
    exact(value, ['version', 'scope'])
    if (value.version !== 1) fail('storage-unavailable')
    await access()
    return validateScope(value.scope)
  }
}
export function createProfileQuantScheduleStore(profile: string): QuantScheduleStore {
  const access = profileAccess(profile)
  const checkFile = async (target: string) => {
    try {
      const stat = await lstat(target)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) fail('storage-unavailable')
    } catch (error: any) { if (error.code !== 'ENOENT') throw error }
  }
  return {
    async load() {
      const { directory } = await access(true)
      let value
      try { value = await readJson(path.join(directory, QUANT_SCHEDULE_FILE), QUANT_SCHEDULE_MAX_BYTES) }
      catch (error: any) { if (error.code === 'ENOENT') return null; throw error }
      await access()
      return parseQuantScheduleRecord(value)
    },
    async save(record) {
      const text = JSON.stringify(parseQuantScheduleRecord(record))
      if (Buffer.byteLength(text) > QUANT_SCHEDULE_MAX_BYTES) fail('storage-unavailable')
      // Consent and the UI-created scope must already exist; never create directories here.
      const { root, directory } = await access()
      const scope = await profileScopeReader(profile)()
      if (record.scope !== scope) fail('scope-mismatch')
      try {
        const previous = await lstat(path.join(root, PREVIOUS_STORE_DIRECTORY))
        if (!previous.isDirectory() || previous.isSymbolicLink()) fail('storage-unavailable')
      } catch (error: any) { if (error.code !== 'ENOENT') throw error }
      if (await profileStoreDirectory(root) !== directory) fail('storage-unavailable')
      await access()
      const target = path.join(directory, QUANT_SCHEDULE_FILE)
      await checkFile(target)
      const temporary = path.join(directory, `quant-schedule-${randomUUID()}.tmp`)
      try {
        const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
        try { await file.writeFile(text); await file.sync() } finally { await file.close() }
        await access()
        if (await profileScopeReader(profile)() !== record.scope) fail('scope-mismatch')
        await checkFile(target)
        await rename(temporary, target)
        // A resolved attempt save must survive restart, including the directory entry.
        const dir = await open(directory, constants.O_RDONLY | constants.O_NOFOLLOW)
        try { await dir.sync() } finally { await dir.close() }
      } finally { await unlink(temporary).catch(() => {}) }
    },
  }
}

export interface QuantScheduleOptions {
  profileDirectory: string
  provider: () => Promise<MarketProvider | undefined>
  sourceEnabled: () => Promise<boolean>
  /** Must be read-only. Failure blocks admission, not the watch task. */
  watchRunning?: (scope: string) => Promise<boolean>
  now?: () => number
  wait?: (ms: number, signal: AbortSignal) => Promise<void>
  store?: QuantScheduleStore
  readScope?: () => Promise<string>
}
export interface QuantScanScheduler {
  request(request: QuantScheduleRequest, signal?: AbortSignal): Promise<QuantScheduleState>
  tick(): Promise<QuantScheduleState>
  sourceChanged(): void
  dispose(): void
}
function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('cancelled'))
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  })
}
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new Error('cancelled')) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, ms)
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  })
}

export function createQuantScanScheduler(options: QuantScheduleOptions): QuantScanScheduler {
  const now = options.now ?? Date.now, wait = options.wait ?? pause
  const store = options.store ?? createProfileQuantScheduleStore(options.profileDirectory)
  const readScope = options.readScope ?? profileScopeReader(options.profileDirectory)
  let record = empty(), stored = false, storageFault = false, scopeFault = false, disposed = false
  let loading: Promise<void> | undefined, generation = 0, mutations = 0
  let active: AbortController | undefined, watchBlock: 'watch-running' | 'watch-unavailable' | null = null
  let queue: Promise<unknown> = Promise.resolve()
  const serial = <T>(fn: () => Promise<T>) => {
    const task = queue.then(fn, fn); queue = task.catch(() => {}); return task
  }
  const interrupt = (error: QuantScheduleError) => {
    generation++
    const wasActive = !!active
    active?.abort(); active = undefined
    if (wasActive) record = { ...record, error, updatedAt: iso(now()), reports: record.reports.map((r, i) => i ? r : { ...r, status: 'interrupted', partial: true, error, updatedAt: iso(now()) }) }
    return wasActive
  }
  const on = async () => { try { return await options.sourceEnabled() } catch { return false } }
  const scopeCheck = async (expected?: string) => {
    const token = generation
    let actual: string
    try { actual = validateScope(await readScope()) }
    catch {
      if (token === generation && !disposed) { interrupt('storage-unavailable'); storageFault = true; record.error = 'storage-unavailable' }
      return fail('storage-unavailable')
    }
    if (token === generation && !disposed && record.scope && record.scope !== actual) {
      interrupt('scope-mismatch'); scopeFault = true
    }
    if (expected !== undefined && expected !== actual) fail('scope-mismatch')
    return actual
  }
  const ensure = () => loading ??= (async () => {
    try {
      const saved = await store.load()
      if (!saved) return
      record = parseQuantScheduleRecord(saved); stored = true
      await scopeCheck()
      // No write on recovery. An unfinished attempt consumes its date forever.
      if (record.error === 'interrupted' && record.reports[0]) record.reports[0].status = 'interrupted'
    } catch { storageFault = true; record.error = 'storage-unavailable' }
  })()
  const save = async (next: QuantScheduleRecord, token: number) => {
    try { await store.save(clone(next)); stored = true }
    catch {
      if (token === generation && !disposed) { interrupt('storage-unavailable'); storageFault = true; record.error = 'storage-unavailable' }
      fail('storage-unavailable')
    }
    if (!disposed && generation === token) record = next
  }
  const persistInterruption = (error: QuantScheduleError) => {
    if (!interrupt(error) || !stored || disposed) return
    const token = generation
    void serial(async () => {
      if (token !== generation || disposed || scopeFault || storageFault) return
      await scopeCheck(record.scope)
      if (token === generation) await save(record, token)
    }).catch(() => {})
  }
  const snapshot = async (): Promise<QuantScheduleState> => {
    const sourceEnabled = await on(), clock = quantScheduleClock(now())
    const reports = scopeFault ? [] : clone(record.reports)
    if (active && reports[0]) { reports[0].status = 'partial'; reports[0].error = null }
    const blockedReason = disposed ? 'disposed' : storageFault ? 'storage-unavailable' : scopeFault ? 'scope-mismatch'
      : !record.enabled ? 'disabled' : active ? 'running' : !sourceEnabled ? 'source-disabled'
        : clock.weekday === 0 || clock.weekday === 6 ? 'weekend' : clock.minutes < 1005 ? 'before-window'
          : record.lastAttemptDate && record.lastAttemptDate >= clock.date ? 'already-attempted' : watchBlock
    return { enabled: record.enabled && !scopeFault, running: !!active, sourceEnabled,
      lastAttemptDate: scopeFault ? null : record.lastAttemptDate, updatedAt: scopeFault ? null : record.updatedAt,
      error: storageFault ? 'storage-unavailable' : scopeFault ? 'scope-mismatch' : active ? null : record.error,
      latest: reports[0] ?? null, reports, blockedReason, policy: clone(QUANT_SCHEDULE_POLICY) }
  }
  const watchBusy = async () => {
    try { watchBlock = await options.watchRunning?.(record.scope) ? 'watch-running' : null }
    catch { watchBlock = 'watch-unavailable' }
    return !!watchBlock
  }
  const start = async () => {
    await ensure()
    const token = generation
    if (disposed || mutations || storageFault || scopeFault || !record.enabled) return
    await scopeCheck()
    if (!await on()) { persistInterruption('source-disabled'); return }
    if (token !== generation || disposed || mutations || scopeFault || active) return
    watchBlock = null
    if ((await snapshot()).blockedReason || await watchBusy()) return
    const provider = await options.provider()
    if (token !== generation || disposed || mutations || scopeFault || storageFault || !provider?.quantScan) return
    if (await watchBusy() || !await on() || token !== generation || disposed || mutations) return
    // Slow service/storage reads must not carry a yesterday/weekend admission
    // into a different calendar window.
    if ((await snapshot()).blockedReason || token !== generation || disposed || mutations) return
    const controller = new AbortController(), scope = record.scope, date = quantScheduleClock(now()).date
    const deadline = now() + QUANT_SCAN_LIMITS.sessionMs
    active = controller
    // Reserve in memory before awaiting disk too: a concurrent disable must keep this date.
    record = { ...record, lastAttemptDate: date, updatedAt: iso(now()), error: 'interrupted',
      reports: [{ date, updatedAt: iso(now()), status: 'interrupted', partial: true, error: 'interrupted', result: null } satisfies QuantScheduleReport, ...record.reports].slice(0, 20) }
    try { await save(record, token) } catch { return }
    const valid = () => !disposed && token === generation && !mutations && !storageFault && !scopeFault
      && record.enabled && record.scope === scope && active === controller && !controller.signal.aborted
    const allowed = async () => {
      if (!valid()) return false
      await scopeCheck(scope)
      if (!valid()) return false
      if (now() >= deadline) { persistInterruption('expired'); return false }
      if (!await on()) { persistInterruption('source-disabled'); return false }
      if (!valid()) return false
      const current = await options.provider()
      if (!valid()) return false
      if (current !== provider) { persistInterruption('source-disabled'); return false }
      return true
    }
    if (!valid()) return
    void (async () => {
      const timer = setTimeout(() => { if (valid()) persistInterruption('expired') }, Math.max(0, deadline - now()))
      let scanId: string | undefined
      const call = async (input: QuantScanRequest) => {
        if (!await allowed()) throw new Error('cancelled')
        const raw = await abortable(provider.quantScan!(input, controller.signal), controller.signal)
        if (!await allowed()) throw new Error('cancelled')
        const result = projectQuantScan(raw, now())
        if (!result || (scanId && result.scanId !== scanId)) throw new Error('changed scan')
        scanId = result.scanId
        if (now() >= Date.parse(result.expiresAt)) {
          result.stopReason = 'expired'; result.partial = true; result.status = 'incomplete'; result.canContinue = false
        }
        return result
      }
      const commit = async (result: QuantScanResult) => serial(async () => {
        if (!await allowed()) return false
        const error: QuantScheduleError = result.canContinue ? 'interrupted'
          : result.stopReason === 'upstream-failures' ? 'upstream-failures' : result.stopReason === 'expired' ? 'expired'
            : result.stopReason === 'cancelled' ? 'interrupted' : null
        const complete = !result.canContinue && !result.partial && result.stopReason === 'finished' && !error
        const report: QuantScheduleReport = { date, updatedAt: iso(now()), status: complete ? 'complete' : error && !result.canContinue ? 'interrupted' : 'partial',
          partial: !complete, error, result: reportResult(result, now()) }
        await save({ ...record, updatedAt: iso(now()), error, reports: [report, ...record.reports.slice(1)] }, token)
        return valid()
      })
      try {
        let result = await call({ action: 'start' })
        if (!await commit(result)) return
        while (result.canContinue && await allowed()) {
          const expires = Math.min(deadline, Date.parse(result.expiresAt))
          const delay = Math.min(Date.parse(result.nextAllowedAt), expires) - now()
          if (delay > 0) await abortable(wait(delay, controller.signal), controller.signal)
          if (!await allowed()) return
          if (now() >= expires) { persistInterruption('expired'); return }
          // A UI batch may have advanced this shared scanner during our cooldown.
          result = await call({ action: 'status' })
          if (!result.canContinue) { await commit(result); break }
          if (now() < Date.parse(result.nextAllowedAt)) continue
          const batches = result.batches
          result = await call({ action: 'continue', scanId: result.scanId })
          if (result.canContinue && result.batches <= batches) throw new Error('no progress')
          if (!await commit(result)) return
        }
      } catch {
        if (valid()) persistInterruption('scan-failed')
      } finally {
        clearTimeout(timer)
        if (active === controller) { active = undefined; controller.abort() }
      }
    })()
  }
  return {
    async request(input, signal) {
      let request: QuantScheduleRequest
      try { request = parseQuantScheduleRequest(input) } catch { return fail('invalid-input') }
      signal?.throwIfAborted()
      await ensure()
      if (disposed) fail('disposed')
      const scope = await scopeCheck(request.scope)
      signal?.throwIfAborted()
      const mutating = request.action !== 'get'
      if (mutating) { mutations++; interrupt('interrupted') }
      try { return await serial(async () => {
        if (disposed) fail('disposed')
        signal?.throwIfAborted()
        await scopeCheck(scope)
        signal?.throwIfAborted()
        if (request.action === 'enable') {
          if (storageFault) fail('storage-unavailable')
          if (scopeFault) fail('scope-mismatch')
          await save({ ...record, scope, enabled: true, updatedAt: iso(now()) }, generation)
        } else if (request.action === 'disable') {
          record = { ...record, enabled: false, updatedAt: iso(now()) }
          // Never manufacture a new file on GET/disable without prior consent.
          if (stored && !scopeFault) await save(record, generation)
        } else if (active && !await on()) persistInterruption('source-disabled')
        return snapshot()
      }) } finally { if (mutating) mutations-- }
    },
    tick: () => serial(async () => {
      try { await start() } catch { if (active) persistInterruption('scan-failed') }
      return snapshot()
    }),
    sourceChanged() { persistInterruption('source-disabled') },
    dispose() { disposed = true; interrupt('interrupted') },
  }
}
