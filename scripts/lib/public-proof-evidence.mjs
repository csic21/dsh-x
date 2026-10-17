/** Bounded evidence from this public-only proof; never export profiles/configuration. */
import { safeData, safeText } from '../../packages/dsh-x-agents/src/store.js';
function omitContext(value) {
  if (Array.isArray(value)) return value.map(omitContext);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/cwd|profile|backend|environment|^(?:env|headers|config|home|directory|path)$/i.test(key))
    .map(([key, item]) => [key, omitContext(item)]));
  return value;
}
export function publicTaskEvidence(snapshot) {
  const task = snapshot?.task;
  if (!task) return null;
  const events = (Array.isArray(task.events) ? task.events : []).slice(-100).map(event => ({
    type: safeText(event.type, 40), at: safeText(event.at, 80),
    ...(event.type === 'permission' || event.type === 'input' ? { text: '[Interactive payload omitted]' }
      : { text: safeText(event.text, 2000), data: omitContext(safeData(event.data)) }),
  }));
  const result = { id: safeText(task.id, 100), runId: safeText(task.runId, 100),
    runtime: safeText(task.runtime, 40), model: safeText(task.model, 200), state: safeText(task.state, 50),
    nativeSessionId: safeText(task.nativeSessionId, 200), reason: safeText(task.reason, 4000),
    summary: safeText(task.summary, 6000), events };
  while (Buffer.byteLength(JSON.stringify(result)) > 100000 && result.events.length) result.events.shift();
  return result;
}
