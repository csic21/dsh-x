import type { SnapshotView, PublicReview, SourceView } from '../controller.ts'
import type { WorkspaceFile } from '../repository.ts'
// Wire views also tolerate older hosts that omit optional presentation fields.
export type CodeSnapshot = Omit<SnapshotView, 'workspace' | 'files'> & {
  workspace: Partial<SnapshotView['workspace']> & Pick<SnapshotView['workspace'], 'id' | 'mode'>
  files: CodeFile[]
}
export type CodeFile = Omit<WorkspaceFile, 'changed' | 'reason'> & Partial<Pick<WorkspaceFile, 'changed' | 'reason'>>
export type CodeReview = PublicReview & { complete?: boolean }
export type CodeSource = SourceView & { diffTruncated?: boolean }
export interface DiffHunk { oldStart: number, oldLines: number, newStart: number, newLines: number, heading?: string, lines: string[] }
export interface DiffRow { kind: string, old: number | null, new: number | null, text: string }
import { canPrepare, insertRequest, prepareModels, prepareRun, readSnapshot as readAgentsSnapshot } from '../../../dsh-x-agents/src/client/model.ts'

export { canPrepare, insertRequest, prepareModels, prepareRun, readAgentsSnapshot }
export const MODES = ['worktree', 'staged', 'range']
export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info']
const record = (value: unknown): value is Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string'
const identifier = (value: unknown): value is string => text(value) && value.length > 0 && value.length <= 4096

/** Reject malformed wire state rather than present an absent result as success. */
export function readSnapshot(value: unknown, sessionId: string): CodeSnapshot | null {
  if (!record(value) || value.sessionId !== sessionId || !identifier(value.scope) || !Number.isSafeInteger(value.revision) || !record(value.workspace) || !identifier(value.workspace.id) || !MODES.includes(value.workspace.mode) || !Array.isArray(value.files) || !record(value.limits)) return null
  if (!value.files.every(file => record(file) && identifier(file.path) && text(file.status) && typeof file.selectable === 'boolean')) return null
  if (new Set(value.files.map(file => file.path)).size !== value.files.length) return null
  if (value.operation != null && (!record(value.operation) || !identifier(value.operation.id) || !['review', 'repair'].includes(value.operation.kind) || !['preparing', 'waiting_permission', 'reviewing', 'repairing', 'verifying', 'cancelling'].includes(value.operation.state))) return null
  if (value.review != null) {
    const review = value.review
    if (!record(review) || !identifier(review.id) || !text(review.state) || !Array.isArray(review.paths) || !review.paths.every(identifier) || !Array.isArray(review.findings) || !Array.isArray(review.checks ?? []) || typeof review.stale !== 'boolean') return null
    if (!review.findings.every(finding => record(finding) && identifier(finding.id) && identifier(finding.path) && SEVERITIES.includes(finding.severity) && text(finding.title) && text(finding.body) && Number.isSafeInteger(finding.startLine) && finding.startLine > 0 && Number.isSafeInteger(finding.endLine) && finding.endLine >= finding.startLine)) return null
  }
  return value as CodeSnapshot
}

/** A read is useful only for the exact file and content generation requested. */
export function readFile(value: unknown, path: string): CodeSource | null {
  if (!record(value) || value.path !== path || !text(value.status ?? value.kind ?? 'text')) return null
  if (['text', 'missing'].includes(value.kind) && (!text(value.text) || !text(value.beforeText))) return null
  if (value.text != null && !text(value.text) || value.beforeText != null && !text(value.beforeText)) return null
  if (value.diff != null && !text(value.diff) && !Array.isArray(value.diff) && !record(value.diff)) return null
  return value as CodeSource
}

export function isChanged(file: CodeFile) { return file.changed === true || !['unchanged', 'clean', ' '].includes(file.status) }
export function isComplete(review: CodeReview | null | undefined) { return Boolean(review && ['completed', 'complete'].includes(review.state) && review.complete !== false) }
export function activeReview(review: CodeReview | null | undefined) { return Boolean(review && ['running', 'reviewing', 'repairing', 'waiting_permission', 'waiting_input', 'pending'].includes(review.state)) }
export function reviewCanFix(review: CodeReview | null | undefined) { return isComplete(review) && review!.mode === 'worktree' && review!.repairReady !== false && !review!.stale && !['running', 'completed'].includes(review!.repair?.state ?? '') && review!.findings.some(finding => finding.status === 'open') }
export const shortHash = (value: unknown) => typeof value === 'string' ? value.slice(0, 8) : '—'
export const basename = (path: string | null | undefined) => path?.split(/[\\/]/).filter(Boolean).at(-1) ?? ''

export interface FileTreeDirectory { name: string, path: string, directories: FileTreeDirectory[], files: CodeFile[] }

/** Nest matching paths into a real directory tree without fabricating inaccessible children. */
export function fileTree(files: CodeFile[], query = '', filter = 'changed'): FileTreeDirectory {
  const needle = query.trim().toLocaleLowerCase()
  const root: FileTreeDirectory = { name: '', path: '', directories: [], files: [] }
  const byPath = new Map<string, FileTreeDirectory>([['', root]])
  for (const file of files) {
    if (filter === 'changed' && !isChanged(file) || needle && !file.path.toLocaleLowerCase().includes(needle)) continue
    const segments = file.path.split('/').filter(Boolean)
    let parent = root, path = ''
    for (const segment of segments.slice(0, -1)) {
      path = path ? `${path}/${segment}` : segment
      let child = byPath.get(path)
      if (!child) { child = { name: segment, path, directories: [], files: [] }; byPath.set(path, child); parent.directories.push(child) }
      parent = child
    }
    parent.files.push(file)
  }
  function order(node: FileTreeDirectory) {
    node.directories.sort((a, b) => a.name.localeCompare(b.name))
    node.files.sort((a, b) => a.path.localeCompare(b.path))
    node.directories = node.directories.map(compact)
  }
  // Join a lone directory chain into one row (compatibility/evidence) so depth stays readable.
  function compact(node: FileTreeDirectory): FileTreeDirectory {
    order(node)
    while (!node.files.length && node.directories.length === 1) {
      const only = node.directories[0]
      node = { name: `${node.name}/${only.name}`, path: only.path, directories: only.directories, files: only.files }
    }
    return node
  }
  root.directories = root.directories.sort((a, b) => a.name.localeCompare(b.name)).map(compact)
  root.files.sort((a, b) => a.path.localeCompare(b.path))
  return root
}

/** Git supplies edit hunks. This parser only projects its line coordinates. */
export function diffHunks(diff: string | DiffHunk[] | { hunks?: DiffHunk[] } | null | undefined): DiffHunk[] {
  if (Array.isArray(diff)) return diff
  if (diff && typeof diff === 'object' && Array.isArray(diff.hunks)) return diff.hunks
  if (typeof diff !== 'string') return []
  const hunks: DiffHunk[] = []
  let current: DiffHunk | undefined
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
export function hunkRows(hunk: DiffHunk): DiffRow[] {
  let old = hunk.oldStart, next = hunk.newStart
  return hunk.lines.filter(line => /^[ +\-]/.test(line)).map(line => line[0] === '+' ? { kind: 'add', old: null, new: next++, text: line.slice(1) } : line[0] === '-' ? { kind: 'del', old: old++, new: null, text: line.slice(1) } : { kind: 'context', old: old++, new: next++, text: line.slice(1) })
}

/** Align replacement runs; no diff algorithm or text mutation occurs here. */
export function pairedRows(rows: DiffRow[]) {
  const result: { left?: DiffRow, right?: DiffRow }[] = [], removed: DiffRow[] = [], added: DiffRow[] = []
  const flush = () => { for (let i = 0; i < Math.max(removed.length, added.length); i++) result.push({ left: removed[i], right: added[i] }); removed.length = 0; added.length = 0 }
  for (const row of rows) {
    if (row.kind === 'del') { if (added.length) flush(); removed.push(row) }
    else if (row.kind === 'add') added.push(row)
    else { flush(); result.push({ left: row, right: row }) }
  }
  flush()
  return result
}

export function sourceLines(value: string | null | undefined) { return value === '' || value == null ? [] : (value.endsWith('\n') ? value.slice(0, -1) : value).split('\n') }

/** Literal matches preserve source offsets and never interpret regular expressions. */
export function searchMatches(lines: string[], query: string) {
  if (!query) return []
  const needle = query.toLocaleLowerCase(), matches: { line: number, start: number, end: number }[] = []
  lines.forEach((line, index) => {
    const haystack = line.toLocaleLowerCase()
    let from = 0, found
    while ((found = haystack.indexOf(needle, from)) !== -1) { matches.push({ line: index + 1, start: found, end: found + query.length }); from = found + Math.max(needle.length, 1) }
  })
  return matches
}

export function reviewRequest(snapshot: CodeSnapshot | null, { paths, runtime, model, previousReviewId }: { paths: string[], runtime: string, model?: string, previousReviewId?: string }) {
  if (!snapshot?.workspace || !Array.isArray(paths) || paths.length === 0) throw new Error('selectFiles')
  const allowed = snapshot.files.filter(file => file.selectable).map(file => file.path)
  if (paths.some(path => !allowed.includes(path)) || paths.length > (snapshot.limits?.maxSelectedFiles ?? 20)) throw new Error('selectionChanged')
  return { scope: snapshot.scope, workspaceId: snapshot.workspace.id, mode: snapshot.workspace.mode, ...(snapshot.workspace.mode === 'range' ? { base: snapshot.workspace.baseRef ?? snapshot.workspace.base } : {}), paths, runtime, ...(model ? { model } : {}), ...(previousReviewId ? { previousReviewId } : {}) }
}

export function repairRequest(snapshot: CodeSnapshot | null, { findingIds, runtime, model }: { findingIds: string[], runtime: string, model?: string }) {
  if (!snapshot?.review || !reviewCanFix(snapshot.review) || !findingIds.length || findingIds.some(id => !snapshot.review!.findings.some(finding => finding.id === id && finding.status === 'open'))) throw new Error('staleFix')
  return { scope: snapshot.scope, reviewId: snapshot.review.id, findingIds, runtime, ...(model ? { model } : {}) }
}
