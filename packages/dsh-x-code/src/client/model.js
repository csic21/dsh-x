import { canPrepare, insertRequest, prepareModels, prepareRun, readSnapshot as readAgentsSnapshot } from '../../../dsh-x-agents/src/client/model.js'

export { canPrepare, insertRequest, prepareModels, prepareRun, readAgentsSnapshot }
export const MODES = ['worktree', 'staged', 'range']
export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info']
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = value => typeof value === 'string'
const identifier = value => text(value) && value.length > 0 && value.length <= 4096

/** Reject malformed wire state rather than present an absent result as success. */
export function readSnapshot(value, sessionId) {
  if (!record(value) || value.sessionId !== sessionId || !identifier(value.scope) || !Number.isSafeInteger(value.revision) || !record(value.workspace) || !identifier(value.workspace.id) || !MODES.includes(value.workspace.mode) || !Array.isArray(value.files) || !record(value.limits)) return null
  if (!value.files.every(file => record(file) && identifier(file.path) && text(file.status) && typeof file.selectable === 'boolean')) return null
  if (new Set(value.files.map(file => file.path)).size !== value.files.length) return null
  if (value.operation != null && (!record(value.operation) || !identifier(value.operation.id) || !['review', 'repair'].includes(value.operation.kind) || !['preparing', 'waiting_permission', 'reviewing', 'repairing', 'verifying', 'cancelling'].includes(value.operation.state))) return null
  if (value.review != null) {
    const review = value.review
    if (!record(review) || !identifier(review.id) || !text(review.state) || !Array.isArray(review.paths) || !review.paths.every(identifier) || !Array.isArray(review.findings) || !Array.isArray(review.checks ?? []) || typeof review.stale !== 'boolean') return null
    if (!review.findings.every(finding => record(finding) && identifier(finding.id) && identifier(finding.path) && SEVERITIES.includes(finding.severity) && text(finding.title) && text(finding.body) && Number.isSafeInteger(finding.startLine) && finding.startLine > 0 && Number.isSafeInteger(finding.endLine) && finding.endLine >= finding.startLine)) return null
  }
  return value
}

/** A read is useful only for the exact file and content generation requested. */
export function readFile(value, path) {
  if (!record(value) || value.path !== path || !text(value.status ?? value.kind ?? 'text')) return null
  if (['text', 'missing'].includes(value.kind) && (!text(value.text) || !text(value.beforeText))) return null
  if (value.text != null && !text(value.text) || value.beforeText != null && !text(value.beforeText)) return null
  if (value.diff != null && !text(value.diff) && !Array.isArray(value.diff) && !record(value.diff)) return null
  return value
}

export function isChanged(file) { return file.changed === true || !['unchanged', 'clean', ' '].includes(file.status) }
export function isComplete(review) { return Boolean(review && ['completed', 'complete'].includes(review.state) && review.complete !== false) }
export function activeReview(review) { return Boolean(review && ['running', 'reviewing', 'repairing', 'waiting_permission', 'waiting_input', 'pending'].includes(review.state)) }
export function reviewCanFix(review) { return isComplete(review) && review.mode === 'worktree' && review.repairReady !== false && !review.stale && !['running', 'completed'].includes(review.repair?.state) && review.findings.some(finding => finding.status === 'open') }
export const shortHash = value => typeof value === 'string' ? value.slice(0, 8) : '—'
export const basename = path => path?.split(/[\\/]/).filter(Boolean).at(-1) ?? ''

/** Collapse paths into directory groups without fabricating inaccessible children. */
export function fileGroups(files, query = '', filter = 'changed') {
  const needle = query.trim().toLocaleLowerCase()
  const groups = new Map()
  for (const file of files) {
    if (filter === 'changed' && !isChanged(file) || needle && !file.path.toLocaleLowerCase().includes(needle)) continue
    const at = file.path.lastIndexOf('/'), directory = at < 0 ? '' : file.path.slice(0, at)
    if (!groups.has(directory)) groups.set(directory, [])
    groups.get(directory).push(file)
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([directory, children]) => ({ directory, files: children.sort((a, b) => a.path.localeCompare(b.path)) }))
}

/** Git supplies edit hunks. This parser only projects its line coordinates. */
export function diffHunks(diff) {
  if (Array.isArray(diff)) return diff
  if (Array.isArray(diff?.hunks)) return diff.hunks
  if (typeof diff !== 'string') return []
  const hunks = []
  let current
  for (const line of diff.split('\n')) {
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/.exec(line)
    if (header) {
      current = { oldStart: Number(header[1]), oldLines: Number(header[2] ?? 1), newStart: Number(header[3]), newLines: Number(header[4] ?? 1), heading: header[5].trim(), lines: [] }
      hunks.push(current)
    } else if (current && /^[ +\-]/.test(line)) current.lines.push(line)
  }
  return hunks
}

/** Number unchanged and changed lines independently on the two Git sides. */
export function hunkRows(hunk) {
  let old = hunk.oldStart, next = hunk.newStart
  return hunk.lines.filter(line => /^[ +\-]/.test(line)).map(line => line[0] === '+' ? { kind: 'add', old: null, new: next++, text: line.slice(1) } : line[0] === '-' ? { kind: 'del', old: old++, new: null, text: line.slice(1) } : { kind: 'context', old: old++, new: next++, text: line.slice(1) })
}

/** Align replacement runs; no diff algorithm or text mutation occurs here. */
export function pairedRows(rows) {
  const result = [], removed = [], added = []
  const flush = () => { for (let i = 0; i < Math.max(removed.length, added.length); i++) result.push({ left: removed[i], right: added[i] }); removed.length = 0; added.length = 0 }
  for (const row of rows) {
    if (row.kind === 'del') { if (added.length) flush(); removed.push(row) }
    else if (row.kind === 'add') added.push(row)
    else { flush(); result.push({ left: row, right: row }) }
  }
  flush()
  return result
}

export function sourceLines(value) { return value === '' || value == null ? [] : (value.endsWith('\n') ? value.slice(0, -1) : value).split('\n') }

/** Literal matches preserve source offsets and never interpret regular expressions. */
export function searchMatches(lines, query) {
  if (!query) return []
  const needle = query.toLocaleLowerCase(), matches = []
  lines.forEach((line, index) => {
    const haystack = line.toLocaleLowerCase()
    let from = 0, found
    while ((found = haystack.indexOf(needle, from)) !== -1) { matches.push({ line: index + 1, start: found, end: found + query.length }); from = found + Math.max(needle.length, 1) }
  })
  return matches
}

export function reviewRequest(snapshot, { paths, runtime, model, previousReviewId }) {
  if (!snapshot?.workspace || !Array.isArray(paths) || paths.length === 0) throw new Error('selectFiles')
  const allowed = snapshot.files.filter(file => file.selectable).map(file => file.path)
  if (paths.some(path => !allowed.includes(path)) || paths.length > (snapshot.limits?.maxSelectedFiles ?? 20)) throw new Error('selectionChanged')
  return { scope: snapshot.scope, workspaceId: snapshot.workspace.id, mode: snapshot.workspace.mode, ...(snapshot.workspace.mode === 'range' ? { base: snapshot.workspace.baseRef ?? snapshot.workspace.base } : {}), paths, runtime, ...(model ? { model } : {}), ...(previousReviewId ? { previousReviewId } : {}) }
}

export function repairRequest(snapshot, { findingIds, runtime, model }) {
  if (!reviewCanFix(snapshot?.review) || !findingIds.length || findingIds.some(id => !snapshot.review.findings.some(finding => finding.id === id && finding.status === 'open'))) throw new Error('staleFix')
  return { scope: snapshot.scope, reviewId: snapshot.review.id, findingIds, runtime, ...(model ? { model } : {}) }
}
