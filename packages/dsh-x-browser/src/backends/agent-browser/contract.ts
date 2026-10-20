/**
 * Wire contract of the external `agent-browser` CLI.
 * Captured from agent-browser 0.39.1 (macOS arm64, Chrome stable) during P3:
 * every `--json` invocation prints one envelope line `{success, data, error}`,
 * failures keep exit code 0, and every `data` carries an ignored `lifecycle` block.
 */
import { fail } from '../../contract/errors.ts'
import type { BrowserErrorCode } from '../../contract/errors.ts'

/** Supported CLI series; 0.x minor bumps may break the wire contract. */
export const SUPPORTED_MAJOR = 0
export const SUPPORTED_MINOR = 39

export interface AgentBrowserVersion {
  major: number
  minor: number
  patch: number
}

export function parseVersion(output: string): AgentBrowserVersion | null {
  const match = /^agent-browser\s+(\d+)\.(\d+)\.(\d+)/m.exec(output.trim())
  return match ? { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) } : null
}

export function assertVersion(output: string): AgentBrowserVersion {
  const version = parseVersion(output)
  if (!version) throw fail('BROWSER_VERSION', 'agent-browser did not report a readable version. Run `agent-browser --version`.')
  if (version.major !== SUPPORTED_MAJOR || version.minor !== SUPPORTED_MINOR) {
    throw fail('BROWSER_VERSION', `agent-browser ${version.major}.${version.minor}.${version.patch} is outside the supported series ${SUPPORTED_MAJOR}.${SUPPORTED_MINOR}.x. Install a supported version or update this plugin.`)
  }
  return version
}

export interface AgentBrowserEnvelope<T> {
  success: boolean
  data: T | null
  error: string | null
  code?: string
}

/** One JSON line is the contract; tolerate trailing log lines by reading the last parseable object. */
export function parseEnvelope<T = unknown>(stdout: string): AgentBrowserEnvelope<T> {
  const lines = stdout.split('\n').map(line => line.trim()).filter(Boolean)
  for (let index = lines.length - 1; index >= 0; index--) {
    let value: unknown
    try { value = JSON.parse(lines[index]) } catch { continue }
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const record = value as Record<string, unknown>
    if (typeof record.success !== 'boolean') continue
    return {
      success: record.success,
      data: (record.data ?? null) as T | null,
      error: typeof record.error === 'string' ? record.error : null,
      ...(typeof record.code === 'string' ? { code: record.code } : {}),
    }
  }
  throw fail('BROWSER_PROTOCOL', 'agent-browser did not return a JSON envelope. Check the installed version and that stdout is not redirected.')
}

/** Command failures carry no stable code, so map the message onto our own taxonomy. */
export function classifyError(message: string): BrowserErrorCode {
  if (/unknown ref|stale|element (?:is )?(?:not found|detached)|ref not found/i.test(message)) return 'BROWSER_STALE'
  if (/tab .*not found|unknown tab|no active tab/i.test(message)) return 'BROWSER_TARGET'
  if (/not supported|unsupported/i.test(message)) return 'BROWSER_UNSUPPORTED'
  if (/timed? ?out|timeout/i.test(message)) return 'BROWSER_TIMEOUT'
  if (/chrome|cdp|launch|connect|daemon|socket|econnrefused|response channel closed/i.test(message)) return 'BROWSER_DAEMON'
  return 'BROWSER_UNAVAILABLE'
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail('BROWSER_PROTOCOL', `agent-browser ${label} is not an object.`)
  return value as Record<string, unknown>
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string') throw fail('BROWSER_PROTOCOL', `agent-browser ${label} is not a string.`)
  return value
}

export interface OpenResult {
  targetId: string
  url: string
  title: string
}

export function openResult(data: unknown): OpenResult {
  const value = record(data, 'open result')
  return { targetId: text(value.targetId, 'targetId'), url: text(value.url, 'url'), title: typeof value.title === 'string' ? value.title : '' }
}

export interface TabNewResult {
  tabId: string
  targetId: string
  url: string
}

export function tabNewResult(data: unknown): TabNewResult {
  const value = record(data, 'tab new result')
  return { tabId: text(value.tabId, 'tabId'), targetId: text(value.targetId, 'targetId'), url: text(value.url, 'url') }
}

export interface SnapshotRef {
  name?: string
  role?: string
}

export interface SnapshotResult {
  origin: string
  refs: Record<string, SnapshotRef>
  snapshot: string
}

export function snapshotResult(data: unknown): SnapshotResult {
  const value = record(data, 'snapshot result')
  const refs: Record<string, SnapshotRef> = {}
  if (value.refs !== undefined) {
    for (const [ref, entry] of Object.entries(record(value.refs, 'refs'))) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
      const fields = entry as Record<string, unknown>
      refs[ref] = {
        ...(typeof fields.name === 'string' ? { name: fields.name } : {}),
        ...(typeof fields.role === 'string' ? { role: fields.role } : {}),
      }
    }
  }
  return { origin: text(value.origin, 'origin'), refs, snapshot: text(value.snapshot, 'snapshot') }
}

export interface TabSummaryData {
  tabId: string
  targetId: string
  url: string
  title: string
  active: boolean
}

export function tabsResult(data: unknown): TabSummaryData[] {
  const value = record(data, 'tab list result')
  if (!Array.isArray(value.tabs)) throw fail('BROWSER_PROTOCOL', 'agent-browser tab list has no tabs array.')
  return value.tabs.map(entry => {
    const tab = record(entry, 'tab')
    return {
      tabId: text(tab.tabId, 'tabId'),
      targetId: text(tab.targetId, 'targetId'),
      url: text(tab.url, 'url'),
      title: typeof tab.title === 'string' ? tab.title : '',
      active: tab.active === true,
    }
  })
}
