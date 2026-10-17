import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply } from '../scripts/fixtures/desktop-opencode-driver/index.js';
const text = (role, text) => ({ role, content: [{ type: 'text', text }] });
function driver() { let adapter; apply({ on: () => {}, effect: f => f(), llm: { registerAdapter: (_, item) => { adapter = item; } } }); return adapter; }
async function collect(it) { const result = []; for await (const event of it) result.push(event); return result; }
test('real-provider transport forwards only explicit Agents request without generating native content', async () => {
  const arguments_ = { runtime: 'opencode', model: 'opencode/public-test', prompt: 'Hello.' };
  const events = await collect(driver().stream({ messages: [text('user', JSON.stringify({ id: 'hello', tool: 'dsh_x_agents_run', arguments: arguments_ }))] }));
  const block = events.find(event => event.type === 'block-end').block;
  assert.equal(block.name, 'dsh_x_agents_run'); assert.deepEqual(JSON.parse(block.arguments), arguments_);
  assert.equal(events.some(event => event.type === 'text-delta'), false);
  await assert.rejects(collect(driver().stream({ messages: [text('user', JSON.stringify({ id: 'bad', tool: 'bash' }))] })), /Invalid real-provider/);
});
test('native result is persisted unchanged with exact identity and no replay', async () => {
  const root = mkdtempSync(join(tmpdir(), 'native-driver-')), before = process.env.DSH_OPENCODE_PROOF_RESULTS;
  process.env.DSH_OPENCODE_PROOF_RESULTS = root;
  try {
    const native = JSON.stringify({ task: { state: 'completed', summary: 'A native result, not predicted.' } });
    const messages = [text('user', JSON.stringify({ id: 'hello', tool: 'dsh_x_agents_run' })), { ...text('tool', native), toolCallId: 'opencode-proof-hello' }];
    const events = await collect(driver().stream({ messages }));
    assert.equal(JSON.parse(readFileSync(join(root, 'hello.json'))).text, native);
    assert.equal(events.some(event => event.block?.type === 'tool-call'), false);
    assert.equal(events.some(event => event.text?.includes('A native result')), false);
    messages[1].toolCallId = 'other';
    await assert.rejects(collect(driver().stream({ messages })), /identity/);
  } finally { if (before === undefined) delete process.env.DSH_OPENCODE_PROOF_RESULTS; else process.env.DSH_OPENCODE_PROOF_RESULTS = before; rmSync(root, { recursive: true, force: true }); }
});
test('real inference is explicitly gated, pinned and never a paid fallback', () => {
  const workflow = readFileSync(new URL('../.github/workflows/desktop-package.yml', import.meta.url), 'utf8');
  assert.match(workflow, /contains\(github.event.head_commit.message, '\[opencode-public-proof\]'\)/);
  assert.match(workflow, /Get-FileHash \$archive -Algorithm SHA256/);
  assert.match(workflow, /releases\/download\/v1\.19\.3\/opencode-windows-x64.zip/);
  const script = readFileSync(new URL('../scripts/desktop-opencode-proof.mjs', import.meta.url), 'utf8');
  assert.match(script, /model\.free === true/); assert.match(script, /No explicitly verified free/);
  assert.match(script, /assert.equal\(guestInfo.type, 'webview'\)/);
  assert.match(script, /Do not search, log in, solve a CAPTCHA/);
  assert.doesNotMatch(script, /danger-full-access|--no-sandbox|ignoreHTTPSErrors/);
});

test('public proof approves only exact requested initialization, prompt and Google navigation', async () => {
  const { approvalInScope } = await import('../scripts/lib/opencode-proof-policy.mjs');
  const args = { model: 'opencode/free', prompt: 'Hello.' };
  assert(approvalInScope('05-hello', 'Agents · Run opencode\nRuntime: opencode\nModel: opencode/free\nTask: Hello.\nOwned browser-only OpenCode: Browser tools: disabled.', args));
  assert(!approvalInScope('05-hello', 'Agents · Run opencode\nRuntime: opencode\nModel: opencode/paid\nTask: Hello.\nOwned browser-only OpenCode: Browser tools: disabled.', args));
  assert(approvalInScope('08-google', 'Browser · navigate\nCurrent page: \n{"action":"navigate","url":"https://www.google.com/"}', {}));
  for (const command of [{ action: 'navigate', url: 'https://attacker.invalid/' }, { action: 'type', text: 'query' }, { action: 'navigate', url: 'https://www.google.com/', extra: 'x' }]) assert(!approvalInScope('08-google', `Browser · navigate\n${JSON.stringify(command)}`, {}));
  assert(!approvalInScope('08-google', 'Native shell execution approval', {}));
});
test('Browser proof trace persists only bounded explicit identity fields', async () => {
  const { bindBrowserProofTrace } = await import('../scripts/lib/browser-proof-trace.mjs');
  const root = mkdtempSync(join(tmpdir(), 'browser-trace-')); let callback;
  try {
    bindBrowserProofTrace({ on: (_name, handler) => { callback = handler; } }, root);
    for (let i = 0; i < 205; i++) callback({ event: 'grant', currentTurn: i, runId: 'x'.repeat(500), capability: 'secret', url: 'private', text: 'page content' });
    const rows = JSON.parse(readFileSync(join(root, 'browser-trace.json')));
    assert.equal(rows.length, 200); assert.equal(rows[0].currentTurn, 5); assert.equal(rows[0].runId.length, 220);
    assert.deepEqual(Object.keys(rows[0]).sort(), ['currentTurn','event','runId']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('public proof bounds lifecycle waits and persists phase evidence before cleanup', () => {
  const harness = readFileSync(new URL('../scripts/desktop-opencode-proof.mjs', import.meta.url), 'utf8');
  assert.match(harness, /timeout: 120000/);
  assert.match(harness, /130000, 'Desktop CLI installation'/);
  assert.match(harness, /30000, 'Initial Desktop close'/);
  assert.match(harness, /30000, 'Final Desktop close'/);
  assert.match(harness, /page\.setDefaultTimeout\(30000\)/);
  assert.match(harness, /15 \* 60 \* 1000/);
  assert.match(harness, /progress\.json/);
  assert.match(harness, /hosted runner cleanup required/);
  const final = harness.slice(harness.lastIndexOf('} finally {'));
  assert(final.indexOf("join(output, 'report.json')") < final.indexOf("deadline(app.close()"));
  const workflow = readFileSync(new URL('../.github/workflows/desktop-package.yml', import.meta.url), 'utf8');
  assert.match(workflow, /Requested real OpenCode free hello and visible Google proof\n        timeout-minutes: 20/);
});


test('deadline latches prevent late prepared dispatch and successful overwrite', async () => {
  const { proofLifecycle, deadline } = await import('../scripts/lib/proof-lifecycle.mjs');
  const report = { status: 'running' }, lifecycle = proofLifecycle(report);
  let resolve, dispatched = 0;
  const ready = new Promise(r => { resolve = r; });
  const pending = ready.then(() => lifecycle.dispatch(() => { dispatched++; }));
  lifecycle.stop('expired'); resolve();
  await assert.rejects(pending, /stopped dispatch/);
  assert.equal(dispatched, 0); assert.throws(() => lifecycle.complete(), /stopped dispatch/);
  assert.equal(report.status, 'blocked-or-failed');
  await assert.rejects(deadline(new Promise(() => {}), 5, 'fixture close'), /exceeded/);
  const completed = { status: 'running' }, cleanup = proofLifecycle(completed);
  cleanup.complete(); cleanup.cleanupUnconfirmed('shell descendants unknown');
  assert.equal(completed.status, 'blocked-or-failed'); assert.match(completed.cleanup, /unconfirmed/);
  assert.throws(() => cleanup.dispatch(() => { dispatched++; }), /stopped dispatch/);
  assert.equal(dispatched, 0);
});
