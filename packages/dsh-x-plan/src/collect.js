import { createHash } from 'node:crypto'
export { containsCredentialLikeText } from './evidence-files.js'
import { MAX_COMMAND_OUTPUT_CHARS, MAX_DIFF_CHARS } from './limits.js'
import {
  captureGitState, captureRepositoryIdentity, readGit, sameIdentity, statePaths, validateBaseline,
} from './baseline.js'
import {
  MAX_EVIDENCE_FILES, MAX_EVIDENCE_FILE_BYTES, MAX_SNAPSHOT_BYTES, containsCredential, evidencePathReason,
  excludedFile, fileIssue, hashText, issue, readEvidenceFile, sameFile,
} from './evidence-files.js'

/**
 * Capture bounded source evidence relative to the immutable plan-time baseline.
 * Acceptance commands must already have run through the official tool runtime;
 * this function never executes shell commands or calls a supplied check callback.
 */
export async function collectEvidence(spawn, { cwd, baseline, commands = [], runs = [], signal }) {
  const evidence = {
    baseline: baseline ? { cwd: baseline.cwd, repoRoot: baseline.repoRoot, head: baseline.head, digest: baseline.digest } : null,
    status: '', diff: '', untracked: '', commands: [...commands], runs: normalizeRuns(runs),
    changes: [], complete: false, issues: validateBaseline(baseline),
  }
  if (signal?.aborted) evidence.issues.push(issue('CAPTURE_ABORTED', 'Evidence capture was cancelled.'))
  if (evidence.issues.length > 0) return finish(evidence)
  const identity = await captureRepositoryIdentity(spawn, { cwd, signal })
  evidence.issues.push(...identity.issues)
  if (!sameIdentity(baseline, identity, { includeHead: false })) evidence.issues.push(issue('REPOSITORY_MISMATCH', 'Working directory or repository identity differs from the approved plan baseline.'))
  if (evidence.issues.length > 0) return finish(evidence)
  if (identity.head !== baseline.head) {
    const ancestry = await readGit(spawn, identity.repoRoot, ['merge-base', '--is-ancestor', baseline.head, identity.head], signal)
    if (!ancestry.ok) evidence.issues.push(issue('BASELINE_DRIFT', 'Current HEAD does not demonstrably descend from the plan baseline.'))
  }
  if (evidence.issues.length > 0) return finish(evidence)
  const state = await captureGitState(spawn, { cwd: identity.repoRoot, signal })
  evidence.issues.push(...state.issues)
  evidence.status = [...state.dirty.map(entry => `${entry.status} ${JSON.stringify(entry.path)}${entry.oldPath ? ` (from ${JSON.stringify(entry.oldPath)})` : ''}`), ...state.untracked.map(file => `?? ${JSON.stringify(file)}`)].join('\n')
  evidence.untracked = state.untracked.map(file => JSON.stringify(file)).join('\n')
  const changed = await readGit(spawn, identity.repoRoot, ['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--ignore-submodules=all', '--name-only', '-z', baseline.head, '--'], signal)
  let changedNames = []
  if (!changed.ok || (changed.output !== '' && !changed.output.endsWith('\0'))) evidence.issues.push(issue('DIFF_INCOMPLETE', 'Git change list was unavailable or truncated.'))
  else changedNames = changed.output === '' ? [] : changed.output.slice(0, -1).split('\0')
  const names = [...new Set([...changedNames, ...statePaths(state), ...statePaths(baseline)])].sort()
  if (names.length > MAX_EVIDENCE_FILES) evidence.issues.push(issue('FILE_COUNT_LIMIT', 'Changed file count exceeds the evidence limit.'))
  const snapshots = new Map(baseline.files.map(file => [file.path, file]))
  const baselineIndex = new Map(baseline.index.map(entry => [entry.path, entry]))
  const currentIndex = new Map(identity.indexEntries.map(entry => [entry.path, entry]))
  let bytes = 0
  const observed = []
  for (const name of names.slice(0, MAX_EVIDENCE_FILES)) {
    if (signal?.aborted) { evidence.issues.push(issue('CAPTURE_ABORTED', 'Evidence capture was cancelled.')); break }
    if (bytes >= MAX_SNAPSHOT_BYTES) { evidence.issues.push(issue('SNAPSHOT_LIMIT', 'Source evidence exceeds the total snapshot limit.', name)); break }
    const before = snapshots.get(name) ?? await readHeadFile(spawn, identity.repoRoot, baseline.head, name, signal)
    const after = await readEvidenceFile(identity.repoRoot, name)
    observed.push(after)
    const indexEntry = currentIndex.get(name) ?? { path: name, kind: 'missing' }
    let headEntry
    const originalIndex = baselineIndex.get(name) ?? (headEntry = await readHeadEntry(spawn, identity.repoRoot, baseline.head, name, signal))
    // The index may retain its original state or match reviewed working files.
    // Newly staged, independent content is not silently treated as reviewed.
    if (!sameIndex(indexEntry, originalIndex) && !indexMatchesFile(indexEntry, after, baseline.head.length)) {
      headEntry ??= await readHeadEntry(spawn, identity.repoRoot, baseline.head, name, signal)
      if (!sameIndex(indexEntry, headEntry)) evidence.issues.push(issue('INDEX_DIVERGENCE', 'Staged content differs from both the task baseline and the reviewed working file.', name))
    }
    if (originalIndex.kind === 'unavailable') evidence.issues.push(fileIssue(originalIndex))
    bytes += Buffer.byteLength(before.text ?? '') + Buffer.byteLength(after.text ?? '')
    // Opaque baseline entries are stat-only: no secret content is read or sent.
    // Unchanged entries may be ignored; any change is explicitly inconclusive.
    if (before.kind === 'opaque' && sameFile(before, after)) continue
    const problems = [fileIssue(before), fileIssue(after)].filter(Boolean)
    evidence.issues.push(...problems)
    if (bytes > MAX_SNAPSHOT_BYTES) { evidence.issues.push(issue('SNAPSHOT_LIMIT', 'Source evidence exceeds the total snapshot limit.', name)); break }
    if (problems.length > 0 || sameFile(before, after)) continue
    const change = { path: name, kind: before.kind === 'missing' ? 'added' : after.kind === 'missing' ? 'deleted' : 'modified', beforeHash: before.hash ?? null, afterHash: after.hash ?? null, beforeMode: before.mode ?? null, afterMode: after.mode ?? null }
    evidence.changes.push(change)
    const patch = renderChange(before, after)
    const remaining = MAX_DIFF_CHARS - evidence.diff.length
    if (patch.length > remaining) {
      evidence.diff += patch.slice(0, Math.max(remaining, 0))
      evidence.issues.push(issue('DIFF_TRUNCATED', 'Task-relative source diff exceeds the evidence limit.'))
      break
    }
    evidence.diff += patch
  }
  for (const file of observed) {
    if (!['text', 'missing', 'opaque'].includes(file.kind)) continue
    if (!sameFile(file, await readEvidenceFile(identity.repoRoot, file.path))) evidence.issues.push(issue('CAPTURE_DRIFT', 'Source changed while collecting review evidence.', file.path))
  }
  const afterIdentity = await captureRepositoryIdentity(spawn, { cwd, signal })
  const afterState = await captureGitState(spawn, { cwd: identity.repoRoot, signal })
  evidence.issues.push(...afterIdentity.issues, ...afterState.issues)
  if (!sameIdentity(identity, afterIdentity) || identity.indexDigest !== afterIdentity.indexDigest || state.fingerprint !== afterState.fingerprint) evidence.issues.push(issue('CAPTURE_DRIFT', 'Repository changed while collecting review evidence.'))
  evidence.currentHead = identity.head
  return finish(evidence)
}

/** Mandatory command failures win even when other evidence is incomplete. */
export function assessEvidence(evidence) {
  const failures = []
  const missing = [...(evidence?.issues ?? []).map(problem => problem.message ?? String(problem))]
  if (evidence?.complete !== true) missing.push('Repository evidence is incomplete.')
  const commands = evidence?.commands
  const runs = evidence?.runs
  if (!Array.isArray(commands) || !Array.isArray(runs)) missing.push('Acceptance command records are missing.')
  else {
    if (commands.length !== runs.length) missing.push('Acceptance command results do not cover the approved command list.')
    commands.forEach((command, index) => {
      const run = runs[index]
      if (!run || run.command !== command) { missing.push(`Missing authenticated check record for ${JSON.stringify(command)}.`); return }
      if (run.timedOut === true || run.status === 'timeout') failures.push(`Acceptance command timed out: ${command}`)
      else if (Number.isInteger(run.exitCode) && run.exitCode !== 0) failures.push(`Acceptance command failed (${run.exitCode}): ${command}`)
      else if (run.exitCode !== 0 || run.unavailable === true || run.error || run.signal || run.status === 'unavailable' || run.status === 'cancelled') missing.push(`Acceptance command was unavailable or did not finish: ${command}`)
      if (run.truncated === true) missing.push(`Acceptance output was truncated: ${command}`)
    })
  }
  if (failures.length > 0) return { verdict: 'fail', gaps: [...new Set([...failures, ...missing])].join('\n') }
  if (missing.length > 0) return { verdict: 'inconclusive', gaps: [...new Set(missing)].join('\n') }
  return { verdict: 'ready', gaps: '' }
}

/** A model's prose can never convert missing evidence or a failed check to pass. */
export function enforceEvidenceVerdict(modelVerdict, evidence) {
  const assessed = assessEvidence(evidence)
  const model = typeof modelVerdict === 'string' ? { verdict: modelVerdict, gaps: '' } : modelVerdict
  if (assessed.verdict !== 'ready') return { verdict: assessed.verdict, gaps: [assessed.gaps, model?.gaps].filter(Boolean).join('\n\n') }
  if (model?.verdict === 'pass' || model?.verdict === 'fail') return model
  return { verdict: 'inconclusive', gaps: model?.gaps || 'Reviewer did not return a valid verdict.' }
}

export function renderEvidence(planText, evidence) {
  const assessment = assessEvidence(evidence)
  const sections = [
    '## 已批准的计划', planText.trim(),
    '## 任务基线', JSON.stringify(evidence.baseline),
    '## 证据完整性', `${assessment.verdict}${assessment.gaps ? `\n${assessment.gaps}` : ''}`,
    '## git status', block(evidence.status),
    '## 相对计划基线的源文件变化（完整文件对照）', block(evidence.diff),
    '## 未跟踪文件', block(evidence.untracked), '## 经工具运行时审批的验收命令',
  ]
  if (evidence.runs.length === 0) sections.push(evidence.commands.length === 0 ? '计划里没有验收命令。' : '验收命令没有可用执行记录。')
  for (const run of evidence.runs) {
    const code = run.exitCode === null ? '无退出码' : String(run.exitCode)
    sections.push(`$ ${run.command}`, `退出码: ${code}; 超时: ${run.timedOut === true}; 截断: ${run.truncated === true}`, block(run.output))
  }
  return sections.join('\n\n')
}

function finish(evidence) {
  evidence.complete = evidence.issues.length === 0
  evidence.assessment = assessEvidence(evidence)
  return evidence
}

function normalizeRuns(runs) {
  if (!Array.isArray(runs)) return []
  return runs.map(run => {
    const output = typeof run?.output === 'string' ? run.output : ''
    const sensitive = containsCredential(output)
    return {
      command: typeof run?.command === 'string' ? run.command : '',
      exitCode: Number.isInteger(run?.exitCode) ? run.exitCode : null,
      output: sensitive ? '[Acceptance output excluded: possible credential content.]' : output.slice(0, MAX_COMMAND_OUTPUT_CHARS),
      truncated: run?.truncated === true || output.length > MAX_COMMAND_OUTPUT_CHARS,
      unavailable: run?.unavailable === true || sensitive,
      timedOut: run?.timedOut === true || run?.status === 'timeout',
      signal: typeof run?.signal === 'string' ? (/^SIG[A-Z0-9]+$/.test(run.signal) ? run.signal : 'UNKNOWN') : null,
      error: Boolean(run?.error),
      status: ['timeout', 'unavailable', 'cancelled'].includes(run?.status) ? run.status : undefined,
    }
  })
}

async function readHeadEntry(spawn, cwd, head, file, signal) {
  if (evidencePathReason(file) === 'unsafe path') return excludedFile(file, 'unsafe baseline path', 'unavailable')
  const tree = await readGit(spawn, cwd, ['ls-tree', '-z', head, '--', file], signal)
  if (!tree.ok) return excludedFile(file, 'baseline index entry is unavailable', 'unavailable')
  if (tree.output === '') return { path: file, kind: 'missing' }
  const match = /^(100644|100755|120000) blob ([0-9a-f]{40}(?:[0-9a-f]{24})?)\t([^\0]+)\0$/.exec(tree.output)
  return match && match[3] === file ? { path: file, kind: 'blob', mode: match[1], oid: match[2] } : excludedFile(file, 'baseline index entry is unsupported', 'unavailable')
}

function sameIndex(left, right) {
  return left.kind === right.kind && (left.kind === 'missing' || (left.kind === 'blob' && left.mode === right.mode && left.oid === right.oid))
}

function indexMatchesFile(entry, file, hashLength) {
  if (entry.kind === 'missing') return file.kind === 'missing'
  if (entry.kind !== 'blob' || file.kind !== 'text' || entry.mode !== file.mode) return false
  const bytes = Buffer.from(file.text)
  const oid = createHash(hashLength === 64 ? 'sha256' : 'sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
  return entry.oid === oid
}

async function readHeadFile(spawn, cwd, head, file, signal) {
  const reason = evidencePathReason(file)
  if (reason !== null) return excludedFile(file, reason)
  const tree = await readGit(spawn, cwd, ['ls-tree', '-z', head, '--', file], signal)
  if (!tree.ok) return excludedFile(file, 'baseline tree is unavailable', 'unavailable')
  if (tree.output === '') return { path: file, kind: 'missing' }
  const match = /^(100644|100755) blob ([0-9a-f]{40}(?:[0-9a-f]{24})?)\t([^\0]+)\0$/.exec(tree.output)
  if (!match || match[3] !== file) return excludedFile(file, 'baseline entry is not a regular source file')
  const size = await readGit(spawn, cwd, ['cat-file', '-s', match[2]], signal)
  if (!size.ok || !/^\d+\n?$/.test(size.output) || Number(size.output) > MAX_EVIDENCE_FILE_BYTES) return excludedFile(file, 'baseline file size unavailable or exceeds evidence limit')
  const blob = await readGit(spawn, cwd, ['cat-file', 'blob', match[2]], signal, MAX_EVIDENCE_FILE_BYTES)
  if (!blob.ok || /[\x00-\x08\x0b\x0c\x0e-\x1f\ufffd]/.test(blob.output)) return excludedFile(file, 'baseline source text unavailable, binary, or truncated')
  // Detect stream errors, replacement decoding, or combined stderr: the captured
  // UTF-8 bytes must still match the exact Git object that was requested.
  if (containsCredential(blob.output)) return excludedFile(file, 'possible credential content excluded')
  const bytes = Buffer.from(blob.output)
  const objectHash = createHash(match[2].length === 64 ? 'sha256' : 'sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
  if (objectHash !== match[2]) return excludedFile(file, 'baseline source object failed integrity verification', 'unavailable')
  return { path: file, kind: 'text', mode: match[1], hash: hashText(blob.output), text: blob.output }
}

function renderChange(before, after) {
  const lines = text => text === '' ? [] : text.split('\n')
  const left = lines(before.text ?? '')
  const right = lines(after.text ?? '')
  return [
    `diff --task-baseline ${JSON.stringify(before.path)}`,
    `old mode ${before.mode ?? 'absent'}; new mode ${after.mode ?? 'absent'}`,
    `--- ${before.kind === 'missing' ? '/dev/null' : JSON.stringify(before.path)}`,
    `+++ ${after.kind === 'missing' ? '/dev/null' : JSON.stringify(after.path)}`,
    `@@ -1,${left.length} +1,${right.length} @@`,
    ...left.map(line => `-${line}`), ...right.map(line => `+${line}`), '',
  ].join('\n')
}

function block(text) {
  return text?.trim() === '' || typeof text !== 'string' ? '（空）' : text.trim()
}
