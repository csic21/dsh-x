// Presentation metadata is a persisted wire boundary; unknown versions retain
// the original record rather than guessing its meaning or rewriting it.
export function readPresentation(meta) {
  if (!meta || meta.kind !== 'dsh-x-plan.result') return null
  if (meta.version === 2) return readTaskPresentation(meta)
  if (meta.version !== 1
    || !['plan', 'approve', 'discard', 'review'].includes(meta.operation)
    || !Number.isSafeInteger(meta.round) || meta.round < 1
    || typeof meta.path !== 'string' || typeof meta.body !== 'string'
    || !Number.isSafeInteger(meta.attempt) || meta.attempt < 0
    || typeof meta.missingVerdict !== 'boolean'
    || (meta.operation === 'review' ? !['pass', 'fail', 'stopped'].includes(meta.verdict) : meta.verdict !== null)) return null
  return meta
}

export const WORKFLOW_STATES = ['draft', 'approved', 'executing', 'reviewing', 'needs_user', 'completed', 'cancelled']
export const CHECK_STATES = ['passed', 'failed', 'inconclusive', 'not-run']

function readTaskPresentation(meta) {
  if (meta.workflowState === 'none') return ['status', 'recover'].includes(meta.operation) && text(meta.text) ? meta : null
  if (!['plan', 'approve', 'discard', 'review', 'status', 'revise', 'recover'].includes(meta.operation)
    || !Number.isSafeInteger(meta.round) || meta.round < 1
    || !Number.isSafeInteger(meta.revision) || meta.revision < 1
    || typeof meta.hash !== 'string' || !/^[a-f0-9]{64}$/i.test(meta.hash)
    || !text(meta.path) || !text(meta.body) || !text(meta.goal)
    || !text(meta.planner) || !text(meta.reviewer)
    || !WORKFLOW_STATES.includes(meta.workflowState)
    || !Number.isSafeInteger(meta.attempt) || meta.attempt < 0
    || ![null, undefined, 'pass', 'fail', 'inconclusive', 'stopped'].includes(meta.verdict)
    || (meta.reason !== undefined && meta.reason !== null && !text(meta.reason))
    || !list(meta.files, 50, file => text(file) && file !== '')
    || !list(meta.steps, 30, step => step && text(step.id) && text(step.title))
    || !list(meta.questions, 20, question => question && text(question.text) && typeof question.blocking === 'boolean')
    || !list(meta.checks, 8, check => check && text(check.id) && text(check.command)
      && (check.status === undefined || CHECK_STATES.includes(check.status))
      && (check.exitCode === null || check.exitCode === undefined || Number.isSafeInteger(check.exitCode)))) return null
  // Plan contracts name checks before any run exists. Missing status means
  // not-run, never passed; later review records carry observed statuses.
  if (meta.checks.some(check => check.status === undefined)) return { ...meta, checks: meta.checks.map(check => ({ ...check, status: check.status ?? 'not-run', exitCode: check.exitCode ?? null })) }
  return meta
}

/** Counts only recorded outcomes, never inferred progress from plan prose. */
export function checkSummary(meta) {
  const counts = Object.fromEntries(CHECK_STATES.map(state => [state, 0]))
  for (const check of meta.checks) counts[check.status] += 1
  const allPassed = meta.checks.length > 0 && meta.checks.every(check => check.status === 'passed' && check.exitCode === 0)
  return { counts, allPassed, inconsistentPass: (meta.verdict === 'pass' || meta.workflowState === 'completed') && (!allPassed || meta.verdict !== 'pass') }
}

export function taskStatus(meta) {
  if (meta.workflowState === 'needs_user' && meta.reason === 'review_limit') return { key: 'task.stopped', tone: 'warning' }
  if (meta.workflowState === 'draft' && meta.questions.some(question => question.blocking)) return { key: 'task.questions-open', tone: 'warning' }
  if (checkSummary(meta).inconsistentPass) return { key: 'result.incomplete', tone: 'warning' }
  if (meta.operation === 'review' && meta.verdict === 'fail') return { key: 'task.review-failed', tone: 'error' }
  if ((meta.operation === 'review' || meta.workflowState === 'needs_user') && meta.verdict === 'inconclusive') return { key: 'task.inconclusive', tone: 'warning' }
  if (meta.operation === 'review' && meta.verdict === 'stopped') return { key: 'task.stopped', tone: 'warning' }
  if (meta.workflowState === 'completed' && ['fail', 'inconclusive', 'stopped'].includes(meta.verdict)) return { key: 'result.incomplete', tone: 'warning' }
  const tone = meta.workflowState === 'completed' ? 'success' : meta.workflowState === 'needs_user' ? 'warning' : 'neutral'
  return { key: `workflow.${meta.workflowState}`, tone }
}

function text(value) { return typeof value === 'string' }
function list(value, max, valid) { return Array.isArray(value) && value.length <= max && value.every(valid) }
