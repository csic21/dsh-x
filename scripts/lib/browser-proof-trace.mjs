import { writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
const fields = new Set(['event','reason','tabId','sessionId','expectedTurn','currentTurn','runId','currentRunId','expectedRunId','epoch','grantRevision']);
/** Test-only bounded diagnostics. Never persist page data, capabilities or arbitrary payloads. */
export function bindBrowserProofTrace(ctx, directory) {
  if (!directory) return;
  const rows = [];
  ctx.on('dsh-x-browser/trace', event => {
    const row = {};
    for (const [key, value] of Object.entries(event ?? {})) if (fields.has(key)) {
      if (typeof value === 'string') row[key] = value.slice(0, 220);
      else if (value === null || typeof value === 'number' && Number.isFinite(value)) row[key] = value;
    }
    rows.push(row); if (rows.length > 200) rows.shift();
    const file = join(directory, 'browser-trace.json');
    try { writeFileSync(`${file}.tmp`, JSON.stringify(rows)); renameSync(`${file}.tmp`, file); } catch { /* Diagnostics must never change approval or execution behavior. */ }
  });
}
