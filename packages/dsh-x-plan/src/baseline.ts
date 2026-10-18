export interface EvidenceIssue { code: string; message: string; path?: string }
export interface IndexEntry { path: string; kind: string; mode?: string; oid?: string }
export interface RepositoryIdentity { cwd: string | null; repoRoot: string | null; gitDir: string | null; head: string | null; indexEntries: IndexEntry[]; indexDigest: string | null; complete: boolean; issues: EvidenceIssue[] }
export interface Baseline { version: number; cwd: string | null; repoRoot: string | null; gitDir: string | null; head: string | null; dirty: {path: string, status: string, oldPath?: string}[]; untracked: string[]; files: any[]; index: IndexEntry[]; complete: boolean; issues: EvidenceIssue[]; digest?: string }
import { realpath } from 'node:fs/promises'
import path from 'node:path'
import { runCaptured } from './command.ts'
import { MAX_DIFF_CHARS } from './limits.ts'
import {
  MAX_EVIDENCE_FILES, MAX_SNAPSHOT_BYTES, evidencePathReason, excludedFile,
  fileIssue, hashText, issue, readEvidenceFile, sameFile,
} from './evidence-files.ts'

const HASH = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/

/** Only fixed-argv, read-only Git plumbing is permitted in evidence capture. */
export async function readGit(spawn: any, cwd: any, args: any, signal: any, maxChars = MAX_DIFF_CHARS) {
  const prefix = ['git', '--no-pager', '--no-optional-locks', '--no-replace-objects', ...(args[0] === 'check-ignore' ? [] : ['--literal-pathspecs']), '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false']
  // status/diff may otherwise run arbitrary repository-configured clean/process
  // filters. Read only driver *names*, then explicitly disable each driver.
  if (args[0] === 'status' || args[0] === 'diff') {
    const config = await runCaptured(spawn, {
      argv: [...prefix, 'config', '--null', '--name-only', '--get-regexp', '^filter\\..*\\.(clean|process|required)$'],
      cwd, signal, timeoutMs: 30_000, maxChars: 8_000,
    })
    if (![0, 1].includes(config.exitCode) || config.signal || config.truncated || (config.exitCode === 1 && config.output !== '')) return { ...config, ok: false }
    const keys = config.output === '' ? [] : config.output.replace(/\0$/, '').split('\0')
    if (keys.some(key => !/^filter\.[A-Za-z0-9_.-]+\.(clean|process|required)$/.test(key))) return { exitCode: null, signal: null, truncated: false, output: '', ok: false }
    for (const driver of new Set(keys.map(key => key.replace(/\.(clean|process|required)$/, '')))) {
      prefix.push('-c', `${driver}.clean=`, '-c', `${driver}.process=`, '-c', `${driver}.required=false`)
    }
  }
  const result = await runCaptured(spawn, {
    argv: [...prefix, ...args], cwd, signal, timeoutMs: 30_000, maxChars,
  })
  return { ...result, ok: result.exitCode === 0 && result.signal === null && !result.truncated && !signal?.aborted }
}

/** Capture canonical worktree identity; never accept a different repo or cwd. */
export async function captureRepositoryIdentity(spawn: any, { cwd, signal }: any) {
  const result: RepositoryIdentity = { cwd: null, repoRoot: null, gitDir: null, head: null, indexEntries: [], indexDigest: null, complete: false, issues: [] }
  try { result.cwd = await realpath(cwd) } catch {
    result.issues.push(issue('CWD_UNAVAILABLE', 'Working directory is unavailable.'))
    return result
  }
  for (const [field, args] of [
    ['repoRoot', ['rev-parse', '--show-toplevel']],
    ['gitDir', ['rev-parse', '--absolute-git-dir']],
    ['head', ['rev-parse', '--verify', 'HEAD']],
  ] as const) {
    const read = await readGit(spawn, result.cwd, args, signal)
    if (!read.ok) {
      result.issues.push(issue('GIT_UNAVAILABLE', `Cannot capture Git ${field}; repository evidence is incomplete.`))
      continue
    }
    const value = read.output.trim()
    if (field === 'head') {
      if (HASH.test(value)) result.head = value
      else result.issues.push(issue('HEAD_INVALID', 'Repository has no valid captured HEAD.'))
    } else {
      try {
        if (/[\x00-\x1f\ufffd]/.test(value)) throw new Error('unsupported path')
        result[field] = await realpath(value)
      } catch { result.issues.push(issue('REPO_UNAVAILABLE', `Cannot resolve repository ${field}.`)) }
    }
  }
  if (result.repoRoot !== null && result.gitDir !== null) {
    // Do not enter submodules: nested Git configuration could execute filters.
    // A bounded index manifest identifies unsupported gitlinks without reading
    // their files or spawning nested repositories.
    const index = await readGit(spawn, result.repoRoot, ['ls-files', '--stage', '-v', '-z'], signal, 2_000_000)
    if (!index.ok || (index.output !== '' && !index.output.endsWith('\0'))) result.issues.push(issue('INDEX_INCOMPLETE', 'Repository index manifest is unavailable or exceeds the evidence limit.'))
    else {
      result.indexDigest = hashText(index.output)
      const entries = index.output === '' ? [] : index.output.slice(0, -1).split('\0')
      for (const entry of entries) {
        const parsed = /^. ([0-7]{6}) ([0-9a-f]{40}(?:[0-9a-f]{24})?) ([0-3])\t([\s\S]+)$/.exec(entry)
        if (!parsed) result.issues.push(issue('INDEX_INCOMPLETE', 'Repository index contains an unsupported record.'))
        else if (parsed[3] !== '0') result.issues.push(issue('INDEX_UNMERGED', 'Unmerged index entries prevent complete repository evidence.'))
        else result.indexEntries.push({ path: parsed[4], kind: 'blob', mode: parsed[1], oid: parsed[2] })
      }
      if (entries.some(entry => /^. 160000 /.test(entry))) result.issues.push(issue('SUBMODULE_UNSUPPORTED', 'Submodule evidence is unsupported; review cannot establish completeness.'))
      if (entries.some(entry => /^(?:S|[a-z]) /.test(entry))) result.issues.push(issue('HIDDEN_INDEX_PATH', 'Assume-unchanged or skip-worktree paths prevent complete repository evidence.'))
    }
  }
  result.complete = result.issues.length === 0
  return result
}

export async function captureGitState(spawn: any, { cwd, signal }: any) {
  const result = await readGit(spawn, cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=all'], signal)
  const issues: any[] = []
  const dirty: any = []
  const untracked: any = []
  if (!result.ok) return { dirty, untracked, fingerprint: null, issues: [issue('STATUS_INCOMPLETE', 'Git status was unavailable or truncated.')] }
  const records = result.output.split('\0')
  if (records.at(-1) !== '') issues.push(issue('STATUS_INCOMPLETE', 'Git status did not end with a complete record.'))
  records.pop()
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    if (record.length < 4 || record[2] !== ' ') {
      issues.push(issue('STATUS_INCOMPLETE', 'Git status contained an invalid record.'))
      continue
    }
    const status = record.slice(0, 2)
    const file = record.slice(3)
    if (status === '??') untracked.push(file)
    else {
      const entry: {path: string, status: string, oldPath?: string} = { path: file, status }
      if (/[RC]/.test(status)) {
        entry.oldPath = records[++index]
        if (!entry.oldPath) issues.push(issue('STATUS_INCOMPLETE', 'Git rename record was incomplete.'))
      }
      dirty.push(entry)
    }
  }
  return { dirty, untracked, fingerprint: hashText(result.output), issues }
}

/** A plan-time snapshot. Persist it unchanged; never refresh at review time. */
export async function captureBaseline(spawn: any, { cwd, signal }: any) {
  const identity = await captureRepositoryIdentity(spawn, { cwd, signal })
  const baseline: Baseline = { version: 1, cwd: identity.cwd, repoRoot: identity.repoRoot, gitDir: identity.gitDir, head: identity.head, dirty: [], untracked: [], files: [], index: [], complete: false, issues: [...identity.issues] }
  if (identity.complete) {
    const state = await captureGitState(spawn, { cwd: identity.repoRoot, signal })
    baseline.dirty = state.dirty
    baseline.untracked = state.untracked
    baseline.issues.push(...state.issues)
    const names = statePaths(state)
    const index = new Map(identity.indexEntries.map(entry => [entry.path, entry]))
    baseline.index = names.slice(0, MAX_EVIDENCE_FILES).map(name => index.get(name) ?? { path: name, kind: 'missing' })
    if (names.length > MAX_EVIDENCE_FILES) baseline.issues.push(issue('FILE_COUNT_LIMIT', 'Baseline has too many dirty or untracked paths.'))
    let size = 0
    for (const name of names.slice(0, MAX_EVIDENCE_FILES)) {
      let file = size >= MAX_SNAPSHOT_BYTES ? excludedFile(name, 'baseline snapshot size limit') : await readEvidenceFile(identity.repoRoot!, name)
      size += Buffer.byteLength(file.text ?? '')
      if (size > MAX_SNAPSHOT_BYTES) file = excludedFile(name, 'baseline snapshot size limit')
      baseline.files.push(file)
      const problem = fileIssue(file)
      if (problem && file.kind !== 'opaque') baseline.issues.push(problem)
    }
    // A snapshot must not silently span changing files, HEAD, or index status.
    for (const file of baseline.files) {
      if (!['text', 'missing', 'opaque'].includes(file.kind)) continue
      if (!sameFile(file, await readEvidenceFile(identity.repoRoot!, file.path))) baseline.issues.push(issue('BASELINE_DRIFT', 'File changed while capturing the plan baseline.', file.path))
    }
    const after = await captureRepositoryIdentity(spawn, { cwd: identity.cwd, signal })
    const finalState = await captureGitState(spawn, { cwd: identity.repoRoot, signal })
    baseline.issues.push(...after.issues, ...finalState.issues)
    if (!sameIdentity(identity, after) || identity.indexDigest !== after.indexDigest || state.fingerprint !== finalState.fingerprint) baseline.issues.push(issue('BASELINE_DRIFT', 'Repository changed while capturing the plan baseline.'))
  }
  baseline.complete = baseline.issues.length === 0
  baseline.digest = baselineDigest(baseline)
  return baseline
}

export function baselineDigest(baseline: any) {
  const { digest, ...body } = baseline
  return hashText(JSON.stringify(sortJson(body)))
}

export function validateBaseline(baseline: any) {
  if (!baseline || baseline.version !== 1 || !Array.isArray(baseline.files) || !Array.isArray(baseline.dirty) || !Array.isArray(baseline.untracked) || !Array.isArray(baseline.issues)) return [issue('BASELINE_MISSING', 'A valid plan-time repository baseline is required.')]
  const issues = [...baseline.issues]
  if (baseline.dirty.some((entry: any) => !entry || typeof entry.path !== 'string' || typeof entry.status !== 'string' || (entry.oldPath !== undefined && typeof entry.oldPath !== 'string')) || baseline.untracked.some((file: any) => typeof file !== 'string')) return [issue('BASELINE_INVALID', 'Baseline path manifest is invalid.')]
  if (!Array.isArray(baseline.index) || baseline.index.length > MAX_EVIDENCE_FILES || baseline.index.some((entry: any) => !entry || typeof entry.path !== 'string' || !['missing', 'blob'].includes(entry.kind) || (entry.kind === 'blob' && (!HASH.test(entry.oid ?? '') || !/^(100644|100755|120000)$/.test(entry.mode ?? ''))))) issues.push(issue('BASELINE_INVALID', 'Baseline index metadata is incomplete or invalid.'))
  if (!baseline.complete) issues.push(issue('BASELINE_INCOMPLETE', 'Plan-time repository baseline is incomplete.'))
  if (![baseline.cwd, baseline.repoRoot, baseline.gitDir].every(value => typeof value === 'string' && path.isAbsolute(value)) || !HASH.test(baseline.head ?? '')) issues.push(issue('BASELINE_INVALID', 'Plan-time repository identity is invalid.'))
  if (baseline.digest !== baselineDigest(baseline)) issues.push(issue('BASELINE_CHANGED', 'Plan-time repository baseline digest does not match.'))
  if (baseline.files.length > MAX_EVIDENCE_FILES) issues.push(issue('BASELINE_INVALID', 'Baseline file count exceeds the evidence limit.'))
  const names = new Set<any>()
  let size = 0
  for (const file of baseline.files) {
    if (!file || typeof file.path !== 'string' || names.has(file.path)) { issues.push(issue('BASELINE_INVALID', 'Baseline contains invalid or duplicate files.')); continue }
    names.add(file.path)
    if (file.kind === 'text') {
      if (typeof file.text !== 'string' || file.hash !== hashText(file.text) || evidencePathReason(file.path) !== null || !['100644', '100755'].includes(file.mode)) issues.push(issue('BASELINE_INVALID', 'Baseline contains an invalid source snapshot.', file.path))
      size += Buffer.byteLength(typeof file.text === 'string' ? file.text : '')
    } else if (file.kind === 'opaque') {
      if (typeof file.fingerprint !== 'string' || !/^[0-9.:+-]+$/.test(file.fingerprint) || typeof file.reason !== 'string') issues.push(issue('BASELINE_INVALID', 'Baseline opaque metadata is invalid.', file.path))
    } else if (file.kind !== 'missing') issues.push(fileIssue(file) ?? issue('BASELINE_INVALID', 'Baseline file is invalid.', file.path))
  }
  if (size > MAX_SNAPSHOT_BYTES || statePaths(baseline).some(name => !names.has(name))) issues.push(issue('BASELINE_INVALID', 'Baseline snapshot is missing paths or exceeds the evidence limit.'))
  return issues
}

export function statePaths(state: any) {
  return [...new Set([...state.dirty.flatMap((entry: any) => [entry.path, ...(entry.oldPath ? [entry.oldPath] : [])]), ...state.untracked])].sort()
}

export function sameIdentity(left: any, right: any, { includeHead = true }: any = {}) {
  return ['cwd', 'repoRoot', 'gitDir', ...(includeHead ? ['head'] : [])].every(key => left[key] === right[key])
}

function sortJson(value: any) : any {
  if (Array.isArray(value)) return value.map(sortJson)
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortJson(value[key])]))
  return value
}

/**
 * Only explicitly Git-visible source-text targets are supported in this version.
 * Recheck before approval and before/after acceptance: ignore rules may change
 * without appearing in the tracked diff (for example .git/info/exclude).
 * Returns issues rather than changing files or silently broadening collection.
 */
export async function assertVisibleScope(spawn: any, { cwd, files, signal }: any) {
  if (!Array.isArray(files) || files.length > 50 || files.some(file => typeof file !== 'string')) return [issue('SCOPE_INVALID', 'Evidence scope must contain at most 50 explicit repository-relative files.')]
  const issues = files.flatMap(file => {
    const reason = evidencePathReason(file)
    return reason === null ? [] : [issue('SCOPE_UNSUPPORTED', `${JSON.stringify(file)}: ${reason}; this file cannot be used as an automatic evidence target.`, file)]
  })
  if (issues.length > 0 || files.length === 0) return issues
  const identity = await captureRepositoryIdentity(spawn, { cwd, signal })
  if (!identity.complete) return identity.issues
  // Git only accepts -z together with --stdin; use quiet per-path queries so
  // no filename quoting/parser or stdin-capable subprocess API is needed.
  for (const file of files) {
    const result = await readGit(spawn, identity.repoRoot, ['check-ignore', '--no-index', '--quiet', '--', file], signal)
    if (result.exitCode === 1 && result.signal === null && !result.truncated && result.output === '' && !signal?.aborted) continue
    if (result.ok && result.output === '') issues.push(issue('SCOPE_IGNORED', `${JSON.stringify(file)} is ignored by Git; automatic acceptance cannot establish its task-relative evidence.`, file))
    else issues.push(issue('SCOPE_VISIBILITY_UNKNOWN', 'Cannot establish whether an approved source path is visible to Git.', file))
  }
  return issues
}
