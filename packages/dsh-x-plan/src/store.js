import { createHash, randomUUID } from 'node:crypto'
import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { planError } from './errors.js'
import { MAX_PLAN_CHARS, MAX_REVIEW_CHARS, MAX_REVIEW_FAILURES } from './limits.js'
import { acquireLock, assertRecoverable, inspectLock, releaseLock, retainLock, runtimeId, withStoreLock } from './store-lock.js'

const SESSION_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const PLAN_FILE = /^plan-(\d+)\.md$/
const REVIEW_FILE = /^review-(\d+)-(\d+)\.json$/
const STATES = new Set(['draft', 'approved', 'executing', 'reviewing', 'needs_user', 'completed', 'cancelled'])
const TERMINAL = new Set(['completed', 'cancelled'])
const TRANSITIONS = {
  draft: ['cancelled'],
  approved: ['executing', 'reviewing', 'needs_user', 'cancelled'],
  executing: ['reviewing', 'needs_user', 'cancelled'],
  reviewing: ['executing', 'needs_user', 'cancelled'],
  needs_user: ['cancelled'],
  completed: [], cancelled: [],
}
const MAX_JSON_BYTES = 1024 * 1024
const MAX_ADAPTER_BYTES = 32 * 1024
const MAX_EVIDENCE_BYTES = 128 * 1024

export function assertSessionKey(sessionId) {
  if (typeof sessionId !== 'string' || !SESSION_KEY.test(sessionId)) throw planError('SESSION_KEY', '会话 id 不能作为计划目录名。')
  return sessionId
}

export function sessionPlansDir(home, sessionId) {
  const root = path.resolve(home, 'plans')
  const dir = path.resolve(root, assertSessionKey(sessionId))
  const relative = path.relative(root, dir)
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) throw planError('SESSION_KEY', '会话 id 逃出了计划目录。')
  return dir
}

/** Includes legacy approvals and interrupted work that require a fresh approval. */
export function unapprovedDraft(dir) {
  return findRound(dir, state => state.state === 'draft' || state.state === 'needs_user', round => ({ round, path: planPath(dir, round) }))
}

export function latestApproved(dir) {
  return findRound(dir, state => !TERMINAL.has(state.state) && Boolean(state.approval) && state.state !== 'needs_user', round => {
    const approved = readApproved(dir, round)
    return { round, path: approved.path, metaPath: metaPath(dir, round) }
  })
}

export function currentWorkflow(dir) {
  return findRound(dir, state => !TERMINAL.has(state.state), (round, state) => ({ round, ...state }))
}

export function discardTarget(dir) {
  const active = currentWorkflow(dir)
  if (!active) return null
  return { round: active.round, path: active.approval ? snapshotPath(dir, active.round, active.approval.revision) : planPath(dir, active.round) }
}

/** baseline is caller-supplied JSON, typically repository identity + starting HEAD. */
export function writeNewPlan(dir, record) {
  return withStoreLock(dir, () => writeNewPlanLocked(dir, record))
}

/** Replace only an unapproved draft, publishing the replacement before closing the old one. */
export function replaceDraft(dir, round, record) {
  return withStoreLock(dir, () => writeNewPlanLocked(dir, { ...record, replacesRound: round }))
}

function writeNewPlanLocked(dir, record) {
    const active = currentWorkflow(dir)
    if (active && (record.replacesRound !== active.round || active.state !== 'draft' || active.approval)) throw planError('DRAFT_EXISTS', '已有未完成的计划；请先完成或放弃当前计划。')
    if (record.replacesRound !== undefined && (!active || active.round !== record.replacesRound)) throw planError('WRONG_ROUND', '只能替换当前未批准草稿。')
    const binding = normalizeBinding(record)
    if (typeof record.planner !== 'string' || typeof record.reviewer !== 'string' || typeof record.text !== 'string') throw planError('META_INVALID', '计划内容与模型信息不完整。')
    const round = nextRound(dir)
    assertRound(round)
    if (record.text.length > MAX_PLAN_CHARS) throw planError('PLAN_SIZE', '计划超过大小限制；请缩短后重新生成。')
    const text = record.text
    const now = new Date().toISOString()
    const manifest = record.manifest === undefined ? null : boundedJson(record.manifest, 256 * 1024, '计划结构')
    const adapters = record.adapters === undefined ? null : boundedJson(record.adapters, MAX_ADAPTER_BYTES, '适配器标识')
    const meta = { schemaVersion: 2, round, replacesRound: record.replacesRound, planner: record.planner, reviewer: record.reviewer, cwd: binding.cwd, binding, baseline: binding.baseline, manifest, adapters, createdAt: now }
    // Publish the draft last. An interrupted partial write never creates an approved task.
    writeExclusive(metaPath(dir, round), json(meta))
    writeState(dir, round, { schemaVersion: 2, round, state: 'draft', revision: 1, everApproved: false, replacesRound: record.replacesRound, draftHash: hash(text), manifest, createdAt: now, updatedAt: now })
    writeExclusive(planPath(dir, round), text)
    if (active) {
      writeState(dir, active.round, { ...active, state: 'cancelled', reason: 'replaced_by_draft', replacedBy: round })
      writeExclusive(discardedPath(dir, active.round), `${new Date().toISOString()}\n`)
      removeIfExists(requestPath(dir, active.round))
    }
    return { round, path: planPath(dir, round), text, revision: 1, binding }
}

/** Capture exactly the draft and binding displayed in the approval request. */
export function prepareApproval(dir, round, context) {
  return withStoreLock(dir, () => {
    assertPlanExists(dir, round)
    const state = readWorkflow(dir, round)
    if (TERMINAL.has(state.state)) throw planError('CLOSED', '已关闭的计划不能重新批准。')
    if (state.reason === 'multiple_active_rounds') throw planError('MULTIPLE_ACTIVE', '检测到中断的草稿替换；请先明确放弃多余草稿。')
    if (state.state !== 'draft' && state.state !== 'needs_user') throw planError('ALREADY_APPROVED', '计划已经批准；需要先停止当前执行。')
    let meta = readMeta(dir, round)
    const binding = context ? normalizeBinding(context) : meta.binding ? normalizeBinding(meta.binding) : normalizeBinding({ cwd: meta.cwd })
    if (state.legacy && binding.baseline === null) throw planError('REAPPROVAL_REQUIRED', '旧计划没有仓库基线，必须重新规划或捕获完整基线后重新批准。')
    if (binding.cwd !== normalizeBinding({ cwd: meta.cwd }).cwd || (meta.binding?.baseline != null && canonical(binding.baseline) !== canonical(meta.binding.baseline))) throw planError('BINDING_MISMATCH', '当前工作目录或仓库基线与计划不一致，必须重新规划。')
    const manifest = context?.manifest === undefined ? meta.manifest ?? null : boundedJson(context.manifest, 256 * 1024, '计划结构')
    if (meta.schemaVersion !== 2 || !meta.binding) {
      meta = { ...meta, schemaVersion: 2, round, cwd: binding.cwd, binding, baseline: binding.baseline, manifest }
      writeAtomic(metaPath(dir, round), json(meta))
    }
    const body = readText(planPath(dir, round), (MAX_PLAN_CHARS + 64) * 4)
    const contentHash = hash(body)
    let revision = state.revision + ((state.draftHash !== contentHash || state.state === 'needs_user') ? 1 : 0)
    revision = Math.max(1, revision)
    while (exists(snapshotPath(dir, round, revision)) || exists(snapshotMetaPath(dir, round, revision))) revision += 1
    const request = {
      schemaVersion: 2, round, token: randomUUID(), contentHash, revision, body, binding,
      planner: meta.planner, reviewer: meta.reviewer, manifest, adapters: meta.adapters ?? null, sourceMetaHash: hash(canonical(meta)), createdAt: new Date().toISOString(),
    }
    request.hash = approvalHash(request)
    writeAtomic(requestPath(dir, round), json(request))
    writeState(dir, round, { ...state, state: 'draft', revision, draftHash: contentHash, manifest, approval: undefined, reason: undefined, recoveryRequired: undefined, legacy: undefined })
    return { round, token: request.token, hash: request.hash, contentHash, body, text: body, revision, binding, manifest, adapters: request.adapters }
  })
}

/** No unbound/default approval is allowed. The request token and exact hash are mandatory. */
export function approvePlan(dir, round, { token, expectedHash, expectedRevision } = {}) {
  return withStoreLock(dir, () => {
    assertPlanExists(dir, round)
    const state = readWorkflow(dir, round)
    if (state.state !== 'draft') throw planError('STATE_TRANSITION', '只有待批准草稿可以批准。')
    if (typeof token !== 'string' || typeof expectedHash !== 'string') throw planError('APPROVAL_REQUIRED', '批准必须绑定已展示草稿的标识和内容哈希。')
    const request = readJson(requestPath(dir, round), 'APPROVAL_REQUIRED')
    if (request.schemaVersion !== 2 || request.round !== round || request.token !== token || request.hash !== expectedHash ||
        request.revision !== state.revision || (expectedRevision !== undefined && expectedRevision !== request.revision)) {
      throw planError('APPROVAL_STALE', '审批请求已过期，请重新展示草稿并请求批准。')
    }
    const text = readText(planPath(dir, round), (MAX_PLAN_CHARS + 64) * 4)
    const meta = readMeta(dir, round)
    if (typeof request.body !== 'string' || hash(request.body) !== request.contentHash || text !== request.body || hash(text) !== request.contentHash || approvalHash(request) !== expectedHash ||
        request.planner !== meta.planner || request.reviewer !== meta.reviewer || request.sourceMetaHash !== hash(canonical(meta))) {
      throw planError('DRAFT_CHANGED', '审批展示后草稿或模型信息已改变，请重新请求批准。')
    }
    const binding = normalizeBinding(request.binding)
    if (meta.binding && binding.cwd !== normalizeBinding(meta.binding).cwd) throw planError('BINDING_MISMATCH', '计划工作目录已改变。')
    const manifest = {
      schemaVersion: 2, round, revision: request.revision, hash: expectedHash, contentHash: request.contentHash, binding,
      planner: request.planner, reviewer: request.reviewer, manifest: request.manifest, adapters: request.adapters, sourceMetaHash: request.sourceMetaHash, approvedAt: new Date().toISOString(),
    }
    const manifestHash = hash(canonical(manifest))
    const file = snapshotPath(dir, round, request.revision)
    writeExclusive(file, text, 0o400)
    writeExclusive(snapshotMetaPath(dir, round, request.revision), json(manifest), 0o400)
    writeState(dir, round, { ...state, state: 'approved', everApproved: true, approval: { revision: request.revision, hash: expectedHash, manifestHash }, reason: undefined })
    removeIfExists(requestPath(dir, round))
    return readApproved(dir, round)
  })
}

export function discardPlan(dir, round) {
  return withStoreLock(dir, () => {
    assertPlanExists(dir, round)
    const state = readWorkflow(dir, round)
    if (state.state === 'completed') throw planError('CLOSED', '计划已经完成。')
    if (state.state !== 'cancelled') writeState(dir, round, { ...state, state: 'cancelled', reason: 'discarded' })
    if (!exists(discardedPath(dir, round))) writeExclusive(discardedPath(dir, round), `${new Date().toISOString()}\n`)
    removeIfExists(requestPath(dir, round))
    return { round, path: state.approval ? snapshotPath(dir, round, state.approval.revision) : planPath(dir, round) }
  })
}

export function readWorkflow(dir, round) {
  assertPlanExists(dir, round)
  const discarded = exists(discardedPath(dir, round))
  const meta = readMeta(dir, round)
  if (!exists(statePath(dir, round))) {
    // Existing v1 .approved.md is not evidence of approval for the new contract.
    return workflowSummary(checkActiveConflict(dir, { schemaVersion: 1, round, state: discarded ? 'cancelled' : exists(path.join(dir, `plan-${round}.approved.md`)) ? 'needs_user' : 'draft', revision: 0, everApproved: false, legacy: true, reason: discarded ? 'discarded' : 'legacy_requires_approval' }), meta)
  }
  const state = readJson(statePath(dir, round), 'STATE_INVALID')
  if (state.schemaVersion !== 2 || state.round !== round || !STATES.has(state.state) || !Number.isSafeInteger(state.revision) || state.revision < 1) throw planError('STATE_INVALID', '计划状态损坏，拒绝继续执行。')
  if (['approved', 'executing', 'reviewing', 'completed'].includes(state.state) && !validApproval(state.approval)) throw planError('STATE_INVALID', '计划缺少可信的批准快照。')
  if (discarded) return workflowSummary({ ...state, state: 'cancelled', reason: state.reason ?? 'discarded' }, meta)
  if (['executing', 'reviewing'].includes(state.state) && state.runtimeId !== runtimeId) {
    return workflowSummary(checkActiveConflict(dir, { ...state, state: 'needs_user', reason: 'interrupted_runtime', recoveryRequired: true }), meta)
  }
  return workflowSummary(checkActiveConflict(dir, state), meta)
}

export function transitionWorkflow(dir, round, next, { expectedState, reason } = {}) {
  return withStoreLock(dir, () => {
    const state = readWorkflow(dir, round)
    if (expectedState !== undefined && state.state !== expectedState) throw planError('STATE_CONFLICT', '计划状态已变化，拒绝并发操作。')
    if (!STATES.has(next) || (next !== state.state && !TRANSITIONS[state.state].includes(next))) throw planError('STATE_TRANSITION', `不能从 ${state.state} 转为 ${next}。`)
    if (['executing', 'reviewing'].includes(next)) {
      readApproved(dir, round)
      if (reviewLimitReached(dir, round)) throw planError('REVIEW_LIMIT', '验收失败达到上限，需要用户决定。')
    }
    if (next === state.state) return state
    return writeState(dir, round, { ...state, state: next, reason, runtimeId })
  })
}

/** Read the immutable snapshot, verifying body, manifest, metadata and optional caller binding. */
export function readApproved(dir, round, context) {
  const state = readWorkflow(dir, round)
  if (state.state === 'cancelled') throw planError('DISCARDED', `第 ${round} 轮计划已经放弃。`)
  if (!validApproval(state.approval)) throw planError(state.legacy ? 'REAPPROVAL_REQUIRED' : 'NOT_APPROVED', `第 ${round} 轮计划需要重新批准。`)
  const revision = state.approval.revision
  const file = snapshotPath(dir, round, revision)
  const text = readText(file, (MAX_PLAN_CHARS + 64) * 4)
  const manifest = readJson(snapshotMetaPath(dir, round, revision), 'APPROVAL_INVALID')
  const meta = readMeta(dir, round)
  if (manifest.schemaVersion !== 2 || manifest.round !== round || manifest.revision !== revision ||
      manifest.hash !== state.approval.hash || hash(text) !== manifest.contentHash || approvalHash({ ...manifest, body: text }) !== state.approval.hash ||
      hash(canonical(manifest)) !== state.approval.manifestHash || manifest.sourceMetaHash !== hash(canonical(meta)) || manifest.planner !== meta.planner || manifest.reviewer !== meta.reviewer ||
      manifest.binding?.cwd !== meta.cwd || (meta.binding && manifest.binding.cwd !== meta.binding.cwd)) {
    throw planError('APPROVAL_TAMPERED', '批准快照或元数据已改变，拒绝继续执行。')
  }
  if (context) assertBinding(manifest.binding, context)
  return { round, revision, path: file, text, hash: manifest.hash, contentHash: manifest.contentHash, binding: manifest.binding, manifest: manifest.manifest, state: state.state, meta: { ...meta, ...manifest, cwd: manifest.binding.cwd, baseline: manifest.binding.baseline } }
}

export function failureCount(dir, round) {
  const state = readWorkflow(dir, round)
  return reviews(dir, round).filter(review => review.verdict === 'fail' && review.revision === state.approval?.revision).length
}

export function reviewLimitReached(dir, round) { return failureCount(dir, round) >= MAX_REVIEW_FAILURES }

/** Writes are serialized across processes; attempt numbers never overwrite existing results. */
export function writeReview(dir, record) {
  return withStoreLock(dir, () => {
    const state = readWorkflow(dir, record.round)
    if (state.state !== 'reviewing') throw planError('STATE_TRANSITION', '只有正在验收的任务可以保存验收结果。')
    const approved = readApproved(dir, record.round)
    if (!['pass', 'fail', 'inconclusive'].includes(record.verdict) || typeof record.gaps !== 'string' || typeof record.reviewer !== 'string' || record.reviewer === approved.meta.planner) throw planError('REVIEW_INVALID', '验收结果或验收者无效。')
    if (reviewLimitReached(dir, record.round)) throw planError('REVIEW_LIMIT', '验收失败达到上限，需要用户决定。')
    const found = reviews(dir, record.round)
    const attempt = Math.max(0, ...found.map(review => review.attempt), ...reviewFileAttempts(dir, record.round)) + 1
    if (!Number.isSafeInteger(attempt) || attempt < 1) throw planError('REVIEW_INVALID', '验收编号超出范围。')
    const text = cap(record.gaps, MAX_REVIEW_CHARS)
    const evidence = record.evidence === undefined ? null : boundedJson(record.evidence, MAX_EVIDENCE_BYTES, '验收证据摘要')
    const createdAt = new Date().toISOString()
    const stem = path.join(dir, `review-${record.round}-${attempt}`)
    writeExclusive(`${stem}.md`, text === '' ? '\n' : `${text}\n`)
    writeExclusive(`${stem}.json`, json({ schemaVersion: 2, round: record.round, attempt, revision: approved.revision, hash: approved.hash, reviewer: record.reviewer, verdict: record.verdict, evidence, createdAt }))
    const failures = failureCount(dir, record.round)
    const next = record.verdict === 'pass' ? 'completed' : record.verdict === 'inconclusive' || failures >= MAX_REVIEW_FAILURES ? 'needs_user' : 'executing'
    const latestReview = { attempt, revision: approved.revision, reviewer: record.reviewer, verdict: record.verdict, path: `${stem}.md`, text, evidence, createdAt }
    writeState(dir, record.round, { ...state, state: next, runtimeId, latestReview, reason: record.verdict === 'inconclusive' ? 'review_inconclusive' : next === 'needs_user' ? 'review_limit' : undefined })
    return { attempt, path: `${stem}.md`, text, state: next, evidence }
  })
}

export function failedReviewPaths(dir, round) {
  const revision = readWorkflow(dir, round).approval?.revision
  return reviews(dir, round).filter(review => review.verdict === 'fail' && review.revision === revision).map(review => path.join(dir, `review-${round}-${review.attempt}.md`))
}

export function readMeta(dir, round) {
  assertRound(round)
  const parsed = readJson(metaPath(dir, round), 'META_MISSING')
  if (!parsed || typeof parsed.planner !== 'string' || typeof parsed.reviewer !== 'string' || typeof parsed.cwd !== 'string') throw planError('META_INVALID', `第 ${round} 轮计划元数据不完整。`)
  return parsed
}

export function listRounds(dir) {
  if (!exists(dir)) return []
  return readdirSync(dir).flatMap(name => {
    const match = PLAN_FILE.exec(name)
    if (!match) return []
    const round = Number(match[1]); assertRound(round); return [round]
  }).sort((a, b) => a - b)
}

/** The run lock exists before planning begins, even when no draft exists yet. */
export function taskLockState(dir) { return inspectLock(dir, 'task') }

export async function withTaskLock(dir, callback, options = {}) {
  const lock = withStoreLock(dir, () => acquireLock(dir, 'task', options))
  let retained = false
  let active = true
  const callbackLock = { ...lock, retain(reason) {
    if (!active) throw planError('LOCK_OWNER', '任务已经结束，不能再保留其锁。')
    // Retain in memory first: even an I/O failure must not release an uncertain run.
    retained = true
    return withStoreLock(dir, () => {
      const value = retainLock(dir, 'task', lock.token, reason)
      interruptActiveWork(dir, reason)
      return value
    })
  } }
  try { return await callback(callbackLock) } catch (error) {
    // ACP teardown uncertainty applies even before a planning draft exists.
    // Keep the session fenced until an operator confirms every owned process stopped.
    if (error?.code === 'DSH_X_PLAN_ACP_CLEANUP' || error?.info?.code === 'DSH_X_PLAN_ACP_CLEANUP') {
      callbackLock.retain('acp_cleanup_unconfirmed')
    } else {
      withStoreLock(dir, () => interruptActiveWork(dir, 'task_interrupted'))
    }
    throw error
  } finally {
    active = false
    if (!retained) withStoreLock(dir, () => releaseLock(dir, 'task', lock.token))
  }
}

/**
 * Call only after an explicit recovery decision. Never steals a live or unverifiable owner.
 * A stale .store.lock deliberately requires manual inspection; this helper never clears it.
 */
export function recoverTaskLock(dir, { expectedToken } = {}) {
  return withStoreLock(dir, () => {
    const lock = taskLockState(dir)
    assertRecoverable(lock, expectedToken)
    interruptActiveWork(dir, 'recovered_interrupted_task')
    releaseLock(dir, 'task', expectedToken)
    return { recovered: true, state: currentWorkflow(dir) }
  })
}

function interruptActiveWork(dir, reason) {
  for (const round of listRounds(dir)) {
    const state = readWorkflow(dir, round)
    if (['executing', 'reviewing'].includes(state.state) || state.recoveryRequired) writeState(dir, round, { ...state, state: 'needs_user', reason, recoveryRequired: true })
  }
}

function reviews(dir, round) {
  assertRound(round)
  if (!exists(dir)) return []
  return readdirSync(dir).flatMap(name => {
    const match = REVIEW_FILE.exec(name)
    if (!match || Number(match[1]) !== round) return []
    const parsed = readJson(path.join(dir, name), 'REVIEW_INVALID')
    if (parsed.round !== round || parsed.attempt !== Number(match[2]) || !['pass', 'fail', 'inconclusive'].includes(parsed.verdict)) throw planError('REVIEW_INVALID', '验收记录损坏。')
    return [parsed]
  }).sort((a, b) => a.attempt - b.attempt)
}

function reviewFileAttempts(dir, round) {
  return readdirSync(dir).flatMap(name => { const m = /^review-(\d+)-(\d+)\.(?:json|md)$/.exec(name); return m && Number(m[1]) === round ? [Number(m[2])] : [] })
}

function findRound(dir, predicate, result) {
  const rounds = listRounds(dir)
  for (let i = rounds.length - 1; i >= 0; i--) { const round = rounds[i]; const state = readWorkflow(dir, round); if (predicate(state)) return result(round, state) }
  return null
}

function checkActiveConflict(dir, state) {
  if (TERMINAL.has(state.state)) return state
  const active = listRounds(dir).filter(round => {
    if (exists(discardedPath(dir, round))) return false
    if (!exists(statePath(dir, round))) return true
    const other = readJson(statePath(dir, round), 'STATE_INVALID')
    if (!STATES.has(other.state)) throw planError('STATE_INVALID', '计划状态损坏。')
    return !TERMINAL.has(other.state)
  })
  return active.length > 1 ? { ...state, state: 'needs_user', reason: 'multiple_active_rounds', conflictingRounds: active, recoveryRequired: true } : state
}

function nextRound(dir) {
  const rounds = readdirSync(dir).flatMap(name => { const m = /^plan-(\d+)[.-]/.exec(name); return m ? [Number(m[1])] : [] })
  const round = Math.max(0, ...rounds) + 1; assertRound(round); return round
}

function workflowSummary(state, meta) {
  return { ...state, everApproved: state.everApproved === true, planner: meta.planner, reviewer: meta.reviewer, goal: state.manifest?.goal ?? meta.manifest?.goal ?? '', adapters: meta.adapters ?? null, binding: meta.binding, baseline: meta.binding?.baseline ?? null, hash: state.approval?.hash ?? state.draftHash ?? null }
}

function normalizeBinding(input) {
  if (!input || typeof input.cwd !== 'string' || input.cwd === '') throw planError('BINDING_REQUIRED', '计划必须绑定工作目录。')
  const cwd = realpathSync(path.resolve(input.cwd))
  if (!lstatSync(cwd).isDirectory()) throw planError('BINDING_REQUIRED', '计划工作目录无效。')
  const baseline = input.baseline === undefined ? null : JSON.parse(canonical(input.baseline))
  return { cwd, baseline }
}

function assertBinding(binding, context) {
  if (context.cwd !== undefined && normalizeBinding({ cwd: context.cwd }).cwd !== binding.cwd) throw planError('BINDING_MISMATCH', '当前工作目录与批准计划不一致。')
  if (Object.hasOwn(context, 'baseline') && canonical(context.baseline) !== canonical(binding.baseline)) throw planError('BINDING_MISMATCH', '当前仓库基线与批准计划不一致。')
}

function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && Object.getPrototypeOf(value) === Object.prototype) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  throw planError('BINDING_INVALID', '仓库基线必须是有限 JSON 数据。')
}
function approvalHash(value) {
  return hash(canonical({ round: value.round, revision: value.revision, body: value.body, binding: value.binding, manifest: value.manifest, adapters: value.adapters, planner: value.planner, reviewer: value.reviewer, sourceMetaHash: value.sourceMetaHash }))
}
function validApproval(value) { return value && Number.isSafeInteger(value.revision) && value.revision >= 1 && /^[a-f0-9]{64}$/.test(value.hash) && /^[a-f0-9]{64}$/.test(value.manifestHash) }
function hash(text) { return createHash('sha256').update(text, 'utf8').digest('hex') }
function json(value) {
  const encoded = `${JSON.stringify(value, null, 2)}\n`
  if (Buffer.byteLength(encoded, 'utf8') > MAX_JSON_BYTES) throw planError('STORAGE_SIZE', '计划记录超出存储大小限制。')
  return encoded
}
function boundedJson(value, limit, label) {
  const encoded = canonical(value)
  if (Buffer.byteLength(encoded, 'utf8') > limit) throw planError('STORAGE_SIZE', `${label}超出存储大小限制。`)
  return JSON.parse(encoded)
}
function assertRound(round) { if (!Number.isSafeInteger(round) || round < 1) throw planError('ROUND_INVALID', '计划轮次必须是正整数。') }
function assertPlanExists(dir, round) { assertRound(round); if (!exists(planPath(dir, round))) throw planError('PLAN_MISSING', `没有第 ${round} 轮计划。`) }
function planPath(dir, round) { assertRound(round); return path.join(dir, `plan-${round}.md`) }
function metaPath(dir, round) { assertRound(round); return path.join(dir, `plan-${round}.json`) }
function statePath(dir, round) { assertRound(round); return path.join(dir, `plan-${round}.state.json`) }
function requestPath(dir, round) { assertRound(round); return path.join(dir, `plan-${round}.approval-request.json`) }
function discardedPath(dir, round) { assertRound(round); return path.join(dir, `plan-${round}.discarded`) }
function snapshotPath(dir, round, revision) { assertRound(round); assertRound(revision); return path.join(dir, `plan-${round}.approved-${revision}.md`) }
function snapshotMetaPath(dir, round, revision) { assertRound(round); assertRound(revision); return path.join(dir, `plan-${round}.approved-${revision}.json`) }
function exists(file) { try { lstatSync(file); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error } }
function readText(file, maxBytes = MAX_JSON_BYTES) {
  const stat = lstatSync(file)
  if (!stat.isFile() || stat.size > maxBytes) throw planError('STORAGE_INVALID', '计划文件无效或超出大小限制。')
  return readFileSync(file, 'utf8')
}
function readJson(file, code) {
  let value
  try { value = JSON.parse(readText(file)) } catch (error) {
    if (error instanceof SyntaxError || error.code === 'ENOENT') throw planError(code, '计划存储文件缺失或损坏，拒绝继续。')
    throw error
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw planError(code, '计划存储文件格式无效。')
  return value
}
function writeState(dir, round, state) {
  const { planner, reviewer, goal, baseline, hash, binding, adapters, ...stored } = state
  const value = { ...stored, schemaVersion: 2, round, revision: Math.max(1, stored.revision ?? 0), updatedAt: new Date().toISOString() }
  writeAtomic(statePath(dir, round), json(value))
  return value
}
function writeExclusive(file, text, mode = 0o600) {
  const fd = openSync(file, 'wx', mode)
  try { writeFileSync(fd, text, 'utf8'); fsyncSync(fd) } finally { closeSync(fd) }
  syncDirectory(path.dirname(file))
}
function writeAtomic(file, text) {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`
  try { writeExclusive(temporary, text); renameSync(temporary, file); syncDirectory(path.dirname(file)) } finally { removeIfExists(temporary) }
}
function syncDirectory(dir) {
  if (process.platform === 'win32') return
  const fd = openSync(dir, 'r')
  try { fsyncSync(fd) } finally { closeSync(fd) }
}
function removeIfExists(file) { try { unlinkSync(file) } catch (error) { if (error.code !== 'ENOENT') throw error } }
function cap(text, max) { return text.length <= max ? text : `${text.slice(0, max)}\n\n…[已截断]` }
