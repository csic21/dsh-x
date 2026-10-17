// Presentation metadata is a persisted wire boundary; unknown versions retain
// the original record rather than guessing its meaning or rewriting it.
export function readPresentation(meta) {
  if (!meta || meta.kind !== 'dsh-x-plan.result' || meta.version !== 1
    || !['plan', 'approve', 'discard', 'review'].includes(meta.operation)
    || !Number.isSafeInteger(meta.round) || meta.round < 1
    || typeof meta.path !== 'string' || typeof meta.body !== 'string'
    || !Number.isSafeInteger(meta.attempt) || meta.attempt < 0
    || typeof meta.missingVerdict !== 'boolean'
    || (meta.operation === 'review' ? !['pass', 'fail', 'stopped'].includes(meta.verdict) : meta.verdict !== null)) return null
  return meta
}
