import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply } from '../scripts/fixtures/desktop-browser-smoke/index.js';
const message = (role, text) => ({ role, content: [{ type: 'text', text }] });
function fixture() { let adapter; apply({ on: () => {}, effect: f => f(), llm: { registerAdapter: (_, value) => { adapter = value; } } }); return adapter; }
async function collect(it) { const items = []; for await (const item of it) items.push(item); return items; }
test('desktop fixture only dispatches explicit finite browser tools', async () => {
  const events = await collect(fixture().stream({ messages: [message('user', JSON.stringify({ id: 'tabs', tool: 'dsh_x_browser_tabs', arguments: {} }))] }));
  assert.equal(events.find(e => e.type === 'block-end').block.name, 'dsh_x_browser_tabs');
  await assert.rejects(collect(fixture().stream({ messages: [message('user', JSON.stringify({ id: 'bad', tool: 'bash' }))] })), /Invalid test request/);
  await assert.rejects(collect(fixture().stream({ messages: [message('user', JSON.stringify({ id: '../escape', tool: 'dsh_x_browser_tabs' }))] })), /Invalid test request/);
});
test('desktop fixture records actual tool result without replaying it', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-browser-model-'));
  const old = process.env.DSH_BROWSER_SMOKE_RESULTS; process.env.DSH_BROWSER_SMOKE_RESULTS = root;
  try {
    const events = await collect(fixture().stream({ messages: [message('user', JSON.stringify({ id: 'one', tool: 'dsh_x_browser_tabs' })), { ...message('tool', '{"tabs":[]}'), toolCallId: 'desktop-smoke-one' }] }));
    assert.equal(events.some(e => e.block?.type === 'tool-call'), false);
    assert.deepEqual(JSON.parse(readFileSync(join(root, 'one.json'))), { id: 'one', isError: false, text: '{"tabs":[]}' });
  } finally { if (old === undefined) delete process.env.DSH_BROWSER_SMOKE_RESULTS; else process.env.DSH_BROWSER_SMOKE_RESULTS = old; rmSync(root, { recursive: true, force: true }); }
});
test('desktop smoke workflow is bounded to work branch and actual packaged assertions', () => {
  const workflow = readFileSync(new URL('../.github/workflows/desktop-package.yml', import.meta.url), 'utf8');
  assert.match(workflow, /branches: \[work\/stock-chat-plugins\]/);
  assert.match(workflow, /package:\n    if: github.event_name == 'workflow_dispatch'/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /desktop-proof-\{0\}/);
  assert.match(workflow, /desktop-package-manual-\{0\}/);
  assert.match(workflow, /github.ref == 'refs\/heads\/work\/stock-chat-plugins' && contains\(github.event.head_commit.message, '\[replace-failed-proof\]'\)/);
  assert.doesNotMatch(workflow.slice(workflow.indexOf('  browser-smoke:')), /secrets\./);
  const harness = readFileSync(new URL('../scripts/desktop-browser-smoke.mjs', import.meta.url), 'utf8');
  assert.match(harness, /assert.equal\(report.runtime.packaged, true\)/);
  assert.match(harness, /chromiumSandbox: true/);
  assert.match(harness, /navigatedTab\.epoch > navigationTab\.epoch/);
  assert.match(harness, /stale-after-navigation/);
  assert.match(harness, /stale-after-close/);
  assert.match(harness, /assert\.equal\(closeStale\.isError, true\)/);
  assert(harness.includes("assert.equal(closeStale.text, 'Error: Show the exact browser tab and enable AI access, then refresh tabs before requesting an action.');"));
  assert.match(harness, /closed\.tabs\.some\(t => t\.tabId === navigationTab\.tabId\), false/);
  assert.match(harness, /assert\.equal\(await guestDestroyed\(\), true\)/);
  assert.match(harness, /webContents\.fromId\(id\)\.isDestroyed\(\)/);
  assert.doesNotMatch(harness, /--no-sandbox|ignoreHTTPSErrors: true|bypassCSP: true/);
});
test('desktop visible flow keeps all browser actions in one host turn', async () => {
  const user = message('user', JSON.stringify({ id: 'flow', tool: 'dsh_x_browser_tabs', scenario: 'visible-flow' }));
  const messages = [user];
  const answers = [{ tabs: [{ tabId: 'tab', epoch: 2, grantRevision: 1, visible: true, granted: true }] }, { result: { targets: [{ ref: 'input', label: 'Fixture name' }] } }, { result: {} }, { result: { targets: [{ ref: 'button', label: 'Apply fixture value' }] } }];
  const actions = [];
  for (let i = 0; i < 5; i++) {
    const events = await collect(fixture().stream({ messages }));
    const block = events.find(e => e.type === 'block-end').block;
    actions.push(block.name === 'dsh_x_browser_tabs' ? 'tabs' : JSON.parse(block.arguments).action);
    messages.push({ role: 'assistant', content: [block] });
    if (i < 4) messages.push({ ...message('tool', JSON.stringify(answers[i])), toolCallId: `desktop-smoke-flow-${i}` });
  }
  assert.deepEqual(actions, ['tabs', 'observe', 'type', 'observe', 'click']);
  assert.equal(messages.filter(m => m.role === 'user').length, 1);
});
test('desktop fixture reports missing grants immediately with actual tab evidence', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-browser-grant-'));
  const old = process.env.DSH_BROWSER_SMOKE_RESULTS; process.env.DSH_BROWSER_SMOKE_RESULTS = root;
  try {
    const messages = [message('user', JSON.stringify({ id: 'expired', tool: 'dsh_x_browser_tabs', scenario: 'visible-flow' })),
      { role: 'assistant', content: [{ type: 'tool-call', name: 'dsh_x_browser_tabs', id: 'desktop-smoke-expired-0', arguments: '{}' }] },
      { ...message('tool', JSON.stringify({ tabs: [{ tabId: 'tab', granted: false, visible: true }] })), toolCallId: 'desktop-smoke-expired-0' }];
    await assert.rejects(collect(fixture().stream({ messages })), /No visible granted/);
    const value = JSON.parse(readFileSync(join(root, 'expired.json')));
    assert.equal(value.isError, true); assert.equal(JSON.parse(value.text).result.tabs[0].granted, false);
  } finally { if (old === undefined) delete process.env.DSH_BROWSER_SMOKE_RESULTS; else process.env.DSH_BROWSER_SMOKE_RESULTS = old; rmSync(root, { recursive: true, force: true }); }
  const source = readFileSync(new URL('../scripts/desktop-browser-smoke.mjs', import.meta.url), 'utf8');
  const idle = source.indexOf("await page.getByRole('button', { name: /^(Stop generating|停止生成)$/ }).waitFor({ state: 'hidden' });");
  assert(idle > 0 && idle < source.indexOf("await page.getByTestId('dxb-enable-ai').click()"));
});
