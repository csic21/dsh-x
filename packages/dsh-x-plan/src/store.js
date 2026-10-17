import { planError } from './errors.js'
import { mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { MAX_PLAN_CHARS, MAX_REVIEW_CHARS, MAX_REVIEW_FAILURES } from './limits.js'

const SESSION_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const PLAN_FILE = /^plan-(\d+)\.md$/
const REVIEW_FILE = /^review-(\d+)-(\d+)\.json$/

/** Reject session ids that could escape the plans directory. */
export function assertSessionKey(sessionId) {
  if (typeof sessionId !== 'string' || !SESSION_KEY.test(sessionId)) {
    throw planError('SESSION_KEY', '会话 id 不能作为计划目录名。')
  }
  return sessionId
}

/** `$DSH_HOME/plans/<session-id>`. */
export function sessionPlansDir(home, sessionId) {
  const key = assertSessionKey(sessionId)
  const root = path.resolve(home, 'plans')
  const dir = path.resolve(root, key)
  const relative = path.relative(root, dir)
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw planError('SESSION_KEY', '会话 id 逃出了计划目录。')
  }
  return dir
}

/**
 * Highest `plan-<n>.md` that is neither approved nor discarded.
 * @param {string} dir
 * @returns {{ round: number, path: string } | null}
 */
export function unapprovedDraft(dir) {
  const round = latestRound(dir, entry => entry.plan && !entry.approved && !entry.discarded)
  if (round === null) return null
  return { round, path: planPath(dir, round) }
}

/**
 * Highest approved round that has not been discarded.
 * @param {string} dir
 * @returns {{ round: number, path: string, metaPath: string } | null}
 */
export function latestApproved(dir) {
  const round = latestRound(dir, entry => entry.approved && !entry.discarded)
  if (round === null) return null
  return { round, path: approvedPath(dir, round), metaPath: metaPath(dir, round) }
}

/**
 * What `dsh_x_discard_plan` would close: the open draft, otherwise the latest approved plan.
 * @param {string} dir
 * @returns {{ round: number, path: string } | null}
 */
export function discardTarget(dir) {
  const draft = unapprovedDraft(dir)
  if (draft !== null) return draft
  const approved = latestApproved(dir)
  if (approved === null) return null
  return { round: approved.round, path: approved.path }
}

/**
 * @param {string} dir
 * @param {{ planner: string, reviewer: string, cwd: string, text: string }} record
 */
export function writeNewPlan(dir, record) {
  if (unapprovedDraft(dir) !== null) {
    throw planError('DRAFT_EXISTS', '已有未批准的计划。先调用 dsh_x_approve_plan，或调用 dsh_x_discard_plan 放弃。')
  }
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const round = allocateRound(dir)
  const text = cap(record.text, MAX_PLAN_CHARS)
  const file = planPath(dir, round)
  writeAtomic(file, text)
  writeAtomic(metaPath(dir, round), `${JSON.stringify({
    round,
    planner: record.planner,
    reviewer: record.reviewer,
    cwd: record.cwd,
    createdAt: new Date().toISOString(),
  }, null, 2)}\n`)
  const lock = path.join(dir, `.plan-${round}.lock`)
  try {
    unlinkSync(lock)
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error
  }
  return { round, path: file, text }
}

/**
 * Copy the current draft to `plan-<n>.approved.md`.
 * @param {string} dir
 * @param {number} round
 */
export function approvePlan(dir, round) {
  const file = planPath(dir, round)
  assertPlanExists(file, round)
  if (exists(discardedPath(dir, round))) throw planError('DISCARDED', `第 ${round} 轮计划已经放弃。`)
  const approved = approvedPath(dir, round)
  if (exists(approved)) return { round, path: approved, text: readFileSync(approved, 'utf8') }
  const text = readFileSync(file, 'utf8')
  writeAtomic(approved, text)
  return { round, path: approved, text }
}

/** @param {string} dir @param {number} round */
export function discardPlan(dir, round) {
  const file = planPath(dir, round)
  assertPlanExists(file, round)
  const marker = discardedPath(dir, round)
  if (!exists(marker)) writeAtomic(marker, `${new Date().toISOString()}\n`)
  return { round, path: exists(approvedPath(dir, round)) ? approvedPath(dir, round) : file }
}

/** @param {string} dir @param {number} round */
export function failureCount(dir, round) {
  return reviews(dir, round).filter(review => review.verdict === 'fail').length
}

/**
 * @param {string} dir
 * @param {{ round: number, reviewer: string, verdict: 'pass' | 'fail', gaps: string }} record
 */
export function writeReview(dir, record) {
  const attempt = reviews(dir, record.round).length + 1
  const text = cap(record.gaps, MAX_REVIEW_CHARS)
  const stem = path.join(dir, `review-${record.round}-${attempt}`)
  writeAtomic(`${stem}.md`, text === '' ? '\n' : `${text}\n`)
  writeAtomic(`${stem}.json`, `${JSON.stringify({
    round: record.round,
    attempt,
    reviewer: record.reviewer,
    verdict: record.verdict,
    createdAt: new Date().toISOString(),
  }, null, 2)}\n`)
  return { attempt, path: `${stem}.md`, text }
}

export function reviewLimitReached(dir, round) {
  return failureCount(dir, round) >= MAX_REVIEW_FAILURES
}

/**
 * Read one approved plan. Discarded rounds are closed.
 * @param {string} dir
 * @param {number} round
 */
export function readApproved(dir, round) {
  if (exists(discardedPath(dir, round))) throw planError('DISCARDED', `第 ${round} 轮计划已经放弃。`)
  const file = approvedPath(dir, round)
  if (!exists(file)) throw planError('NOT_APPROVED', `第 ${round} 轮计划还没批准。`)
  return { round, path: file, text: readFileSync(file, 'utf8'), meta: readMeta(dir, round) }
}

/** Markdown paths of failed reviews for one approved round. */
export function failedReviewPaths(dir, round) {
  return reviews(dir, round)
    .filter(review => review.verdict === 'fail')
    .map(review => path.join(dir, `review-${round}-${review.attempt}.md`))
}

/** @param {string} dir @param {number} round */
export function readMeta(dir, round) {
  const file = metaPath(dir, round)
  if (!exists(file)) throw planError('META_MISSING', `第 ${round} 轮计划没有元数据。`)
  const parsed = JSON.parse(readFileSync(file, 'utf8'))
  if (typeof parsed.planner !== 'string' || typeof parsed.reviewer !== 'string') {
    throw planError('META_INVALID', `第 ${round} 轮计划元数据不完整。`)
  }
  return parsed
}

/** @param {string} dir */
export function listRounds(dir) {
  if (!exists(dir)) return []
  const names = new Set()
  for (const name of readdirSync(dir)) {
    const match = PLAN_FILE.exec(name)
    if (match !== null) names.add(Number(match[1]))
  }
  return [...names].sort((left, right) => left - right)
}

function reviews(dir, round) {
  if (!exists(dir)) return []
  const found = []
  for (const name of readdirSync(dir)) {
    const match = REVIEW_FILE.exec(name)
    if (match === null || Number(match[1]) !== round) continue
    const parsed = JSON.parse(readFileSync(path.join(dir, name), 'utf8'))
    found.push({ attempt: Number(match[2]), verdict: parsed.verdict })
  }
  found.sort((left, right) => left.attempt - right.attempt)
  return found
}

function latestRound(dir, predicate) {
  const rounds = listRounds(dir)
  for (let index = rounds.length - 1; index >= 0; index -= 1) {
    const round = rounds[index]
    if (predicate({
      plan: true,
      approved: exists(approvedPath(dir, round)),
      discarded: exists(discardedPath(dir, round)),
    })) return round
  }
  return null
}

function allocateRound(dir) {
  const rounds = listRounds(dir)
  let round = rounds.length === 0 ? 1 : rounds[rounds.length - 1] + 1
  for (;;) {
    const lock = path.join(dir, `.plan-${round}.lock`)
    try {
      writeFileSync(lock, '', { flag: 'wx', mode: 0o600 })
      return round
    } catch (error) {
      if (error && error.code === 'EEXIST') {
        round += 1
        continue
      }
      throw error
    }
  }
}

function assertPlanExists(file, round) {
  if (!exists(file)) throw planError('PLAN_MISSING', `没有第 ${round} 轮计划。`)
}

function planPath(dir, round) {
  return path.join(dir, `plan-${round}.md`)
}

function approvedPath(dir, round) {
  return path.join(dir, `plan-${round}.approved.md`)
}

function metaPath(dir, round) {
  return path.join(dir, `plan-${round}.json`)
}

function discardedPath(dir, round) {
  return path.join(dir, `plan-${round}.discarded`)
}

function exists(file) {
  try {
    statSync(file)
    return true
  } catch (error) {
    if (error && error.code === 'ENOENT') return false
    throw error
  }
}

function writeAtomic(file, text) {
  const temporary = `${file}.${process.pid}.tmp`
  writeFileSync(temporary, text, { encoding: 'utf8', mode: 0o600 })
  renameSync(temporary, file)
}

function cap(text, max) {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n\n…[已截断]`
}
