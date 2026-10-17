/** Fail-closed lifecycle for CI proof dispatch; never retries an external task. */
export function proofLifecycle(report) {
  let stopped = false;
  const assertActive = () => { if (stopped) throw Error('Proof deadline/cleanup has stopped dispatch; no retry'); };
  return {
    assertActive,
    dispatch(action) { assertActive(); return action(); },
    stop(reason) { stopped = true; report.status = 'blocked-or-failed'; report.error = reason; },
    complete() { assertActive(); report.status = 'passed'; },
    cleanupUnconfirmed(error) { stopped = true; report.status = 'blocked-or-failed'; report.cleanup = 'unconfirmed; hosted runner cleanup required'; report.cleanupError = String(error); },
    finish() { stopped = true; },
  };
}
export function deadline(promise, ms, label) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(`${label} exceeded ${ms}ms; no retry`)), ms); })]).finally(() => clearTimeout(timer));
}
