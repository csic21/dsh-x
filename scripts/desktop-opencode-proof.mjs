/** Real supported-platform packaged-Electron smoke; no kernel patch and no vendor account. */
import assert from 'node:assert/strict';
import { deadline, proofLifecycle } from './lib/proof-lifecycle.mjs';
import { approvalInScope } from './lib/opencode-proof-policy.mjs';
import { safeText } from '../packages/dsh-x-agents/src/store.js';
import { publicTaskEvidence } from './lib/public-proof-evidence.mjs';
import { presentationEvents } from '../packages/dsh-x-agents/src/client/model.js';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, readdir, stat, copyFile, realpath } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const kernel = resolve(process.env.DSH_SMOKE_KERNEL ?? '../deepseek-harness');
const output = resolve(process.env.DSH_SMOKE_OUTPUT ?? './desktop-opencode-evidence');
const homeBase = resolve(process.env.DSH_SMOKE_HOME ?? './desktop-opencode-home');
await mkdir(homeBase, { recursive: true });
const home = await mkdtemp(join(homeBase, 'run-'));
const require = createRequire(join(resolve(process.env.DSH_SMOKE_DRIVER ?? repo), 'package.json'));
const { _electron } = require('playwright');
if (!['win32', 'darwin'].includes(process.platform)) throw Error('This proof requires an officially supported Windows or macOS Desktop.');
if (process.platform === 'darwin') assert.equal(process.arch, 'arm64', 'macOS proof requires the pinned arm64 target');
await mkdir(output, { recursive: true }); await mkdir(home, { recursive: true });
const results = join(home, 'fixture-results'); await mkdir(results, { recursive: true });
const hash = async p => createHash('sha256').update(await readFile(p)).digest('hex');
async function find(root, name) { for (const e of await readdir(root, { withFileTypes: true })) { const p = join(root, e.name); if (e.isDirectory()) { const hit = await find(p, name); if (hit) return hit; } else if (e.name === name) return p; } }
const executable = process.platform === 'win32'
  ? await find(join(kernel, 'apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts'), 'DeepSeek Harness.exe')
  : join(kernel, 'apps/desktop/.desktop-build/targets/mac-arm64/unsigned-artifacts/mac-arm64/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness');
assert(executable, 'Official unsigned unpacked executable missing');
const cli = process.platform === 'win32'
  ? join(dirname(executable), 'resources/runtime/cli/bin/dsh.cmd')
  : join(dirname(executable), '../Resources/runtime/cli/bin/dsh');
await stat(cli);
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/KEY|SECRET|TOKEN|PASSWORD|^NODE_OPTIONS$|^ELECTRON_RUN_AS_NODE$|^DSH_HOME$/i.test(key)));
Object.assign(env, { DSH_HOME: home, DSH_DESKTOP_USER_DATA_DIR: join(home, 'electron'), DSH_TELEMETRY_DISABLED: '1', DSH_OPENCODE_PROOF_RESULTS: results,
  // Public noncredential sentinel for offline fixture onboarding. Never sent to a provider.
  DEEPSEEK_API_KEY: 'synthetic-offline-fixture-not-a-credential' });
function run(command, args) { return new Promise((ok, fail) => {
  const child = spawn(command, args, { env, cwd: repo, shell: command.endsWith('.cmd'), stdio: 'inherit', timeout: 120000 });
  child.on('error', fail); child.on('exit', (code, signal) => code === 0 ? ok() : fail(Error(`Desktop CLI exited ${code}/${signal ?? 'none'}`)));
}); }
const nativeExe = resolve(process.env.DSH_OPENCODE_EXE ?? '');
assert(process.env.DSH_OPENCODE_EXE, 'Pinned official OpenCode executable required'); await stat(nativeExe);
const nativeHash = await hash(nativeExe);
const actualKernelSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: kernel, encoding: 'utf8' }).trim();
assert.equal(actualKernelSha, process.env.DSH_SMOKE_KERNEL_SHA);
const pluginSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
if (process.env.GITHUB_SHA) assert.equal(pluginSha, process.env.GITHUB_SHA);
const report = { kind: 'actual-packaged-desktop-real-opencode', platform: process.platform, architecture: process.arch, pluginSha, kernelSha: actualKernelSha,
  executableSha256: await hash(executable), opencodeExecutableSha256: nativeHash,
  orchestration: 'deterministic tool transport only; native model replies are not synthesized', fixtureOnly: false,
  assertions: [], screenshots: [], approvals: [], status: 'running' };
const driver = join(home, 'transport-driver'); await mkdir(driver);
await copyFile(join(repo, 'scripts/fixtures/desktop-opencode-driver/package.json'), join(driver, 'package.json'));
// Keep the driver module's package resolution rooted in the checked-out, installed repo.
await writeFile(join(driver, 'index.js'), `export * from ${JSON.stringify(pathToFileURL(join(repo, 'scripts/fixtures/desktop-opencode-driver/index.js')).href)};\n`);
await writeFile(join(driver, 'cordis.patch.yml'), JSON.stringify([
  { insert: [{ id: 'dsh-x-desktop-opencode-driver', name: 'dsh-x-desktop-opencode-driver' }] },
  { id: 'agent-default-model', config: { provider: 'desktop-opencode-driver', model: 'transport-only' } },
  { id: 'session-title-llm', disabled: true },
  { id: 'dsh-x-agents', config: { opencode: { mode: 'owned-browser', executable: nativeExe, startupTimeoutMs: 120000, requestTimeoutMs: 120000, turnTimeoutMs: 180000 } } },
], null, 2));
let app, page;
const lifecycle = proofLifecycle(report);
const assertActive = lifecycle.assertActive;
async function phase(name) {
  assertActive();
  report.phase = name; report.phaseAt = new Date().toISOString();
  console.log(`[public-proof] ${report.phaseAt} ${name}`);
  await writeFile(join(output, 'progress.json'), JSON.stringify(report, null, 2));
}
// This diagnostic watchdog never retries a task. GitHub's step deadline remains
// the final hosted-process cleanup boundary if Electron itself cannot close.
const watchdog = setTimeout(async () => {
  lifecycle.stop(`Whole proof deadline exceeded in ${report.phase}; no retry`);
  report.cleanup = 'unconfirmed; hosted runner cleanup required';
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2)).catch(() => {});
  if (page) await deadline(page.screenshot({ path: join(output, 'deadline.png'), timeout: 5000 }), 6000, 'Deadline screenshot').catch(() => {});
  if (app) await deadline(app.close(), 30000, 'Deadline Desktop close').catch(() => {});
  process.exit(1);
}, 15 * 60 * 1000);
const launch = () => lifecycle.dispatch(() => _electron.launch({ executablePath: executable, cwd: home, args: [`--user-data-dir=${join(home, 'electron')}`], env, chromiumSandbox: true, timeout: 120000 }));
async function shot(name) { assertActive(); await page.screenshot({ path: join(output, `${name}.png`), timeout: 15000 }); assertActive(); report.screenshots.push(name); await phase(name); }
try {
  await phase('initial-desktop-launch');
  app = await launch(); await app.firstWindow({ timeout: 120000 });
  for (let n = 0; n < 120; n++) { try { await stat(join(home, 'profiles/desktop/package.json')); break; } catch { await new Promise(r => setTimeout(r, 500)); } }
  await phase('initial-desktop-close');
  await deadline(app.close(), 30000, 'Initial Desktop close'); app = undefined;
  await phase('install-test-plugins');
  try { await deadline(lifecycle.dispatch(() => run(cli, ['plugin', '--profile', 'desktop', 'add', `link:${join(repo, 'packages/dsh-x-agents')}`, `link:${join(repo, 'packages/dsh-x-browser')}`, `link:${driver}`])), 130000, 'Desktop CLI installation'); }
  catch (error) { lifecycle.cleanupUnconfirmed(error); throw error; }
  await phase('proof-desktop-launch');
  app = await launch();
  report.runtime = await app.evaluate(({ app }) => ({ packaged: app.isPackaged, version: app.getVersion(), electron: process.versions.electron, userData: app.getPath('userData') }));
  assert.equal(report.runtime.packaged, true); assert.equal(report.runtime.electron, '44.7.0');
  assert.equal(await realpath(report.runtime.userData), await realpath(join(home, 'electron')));
  for (let n = 0; n < 180; n++) {
    page = app.windows().find(p => p.url().startsWith('dsh-app://app/'));
    if (page && await page.locator('.dxa-entry').isVisible().catch(() => false)) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  assert(page, 'Official primary document missing');
  page.setDefaultTimeout(30000);
  await phase('transport-setup');
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows().find(item => item.webContents.getURL().startsWith('dsh-app://app/')); window?.setSize(1440, 1000); });
  const editor = () => page.locator('[data-composer-input][contenteditable="true"]').last();
  await editor().fill('Initialize tool transport. Native OpenCode performs all requested model work.'); await lifecycle.dispatch(() => editor().press('Enter'));
  await page.getByText('DSH transport ready. Native OpenCode replies will appear in Agents. No answer is generated by this router.', { exact: true }).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: /^(Stop generating|停止生成)$/ }).waitFor({ state: 'hidden' });
  async function tool(id, tool, args) {
    await phase(`${id}:dispatch`);
    await editor().fill(JSON.stringify({ id, tool, arguments: args }));
    await shot(`${id}-request`); await lifecycle.dispatch(() => editor().press('Enter'));
    let approval = 0;
    for (let n = 0; n < 3000; n++) {
      assertActive();
      const allow = page.getByRole('button', { name: /^(Allow once|允许一次)$/ });
      if (await allow.isVisible().catch(() => false)) {
        await shot(`${id}-approval-${++approval}`);
        const panel = page.locator('[data-approval-key]');
        assert.equal(await panel.count(), 1, 'Expected one exact approval request');
        const key = await panel.getAttribute('data-approval-key');
        assert(key && !/[\x00-\x1f]/.test(key), 'Invalid approval identity');
        const exact = page.locator(`[data-approval-key=${JSON.stringify(key)}]`);
        const headline = exact.locator('[data-approval-scroll] > div').first();
        const reason = await headline.textContent();
        assert(approval <= 4 && approvalInScope(id, reason, args), 'Unexpected approval outside public hello/Google scope; stopping without approval');
        assert.equal(await headline.textContent(), reason, 'Approval changed before decision');
        assertActive(); report.approvals.push({ operation: id, key, reason });
        await lifecycle.dispatch(() => exact.getByRole('button', { name: /^(Allow once|允许一次)$/ }).click());
      }
      try {
        const result = JSON.parse(await readFile(join(results, `${id}.json`), 'utf8'));
        if (result.isError) { report.lastOperation = { id, isError: true, text: safeText(result.text, 8000) }; await phase(`${id}-failed`); throw Error(`Native operation blocked: ${report.lastOperation.text}`); }
        assertActive();
        const snapshot = JSON.parse(result.text);
        report.lastOperation = { id, isError: false, task: publicTaskEvidence(snapshot) };
        await phase(`${id}-returned`);
        await page.getByRole('button', { name: /^(Stop generating|停止生成)$/ }).waitFor({ state: 'hidden' });
        assertActive(); return snapshot;
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await new Promise(r => setTimeout(r, 200));
    }
    throw Error(`Native operation timed out: ${id}; no fallback requested`);
  }
  const setup = await tool('01-setup', 'dsh_x_agents_inspect', {});
  await page.locator('.dxa-entry').click(); await page.locator('.dxa-workspace').waitFor();
  await page.locator('.dxa-selectors select').first().selectOption('opencode');
  await shot('02-opencode-setup-status');
  assert.equal(setup.catalog.find(item => item.id === 'opencode')?.available, true, 'Native OpenCode status is unavailable; no model preparation requested');
  const prepared = await tool('03-models', 'dsh_x_agents_models', { runtime: 'opencode', scope: setup.scope });
  const catalog = prepared.catalog.find(item => item.id === 'opencode');
  assert(catalog?.modelCatalog?.status === 'fresh', 'Fresh native model catalog required');
  // The owned adapter exposes only freshly verified zero-cost public models.
  // Also require explicit machine-readable pricing before any inference.
  const models = catalog.models.filter(model => model.id.startsWith('opencode/') && model.free === true);
  assert(models.length, 'No explicitly verified free native model; stopping without paid fallback');
  const model = models[0]; report.model = model;
  await page.locator('.dxa-selectors select').last().selectOption(model.id);
  await shot('04-free-model-selected');
  const hello = await tool('05-hello', 'dsh_x_agents_run', { runtime: 'opencode', model: model.id, prompt: 'Hello.', scope: prepared.scope });
  assert.equal(hello.task?.state, 'completed');
  const assistant = presentationEvents(hello.task.events).filter(event => event.type === 'assistant' && event.text?.trim());
  assert(assistant.length, 'Native OpenCode supplied no assistant reply');
  report.hello = { nativeSessionId: hello.task.nativeSessionId, response: assistant.map(event => event.text).join(''), state: hello.task.state };
  await page.locator('.dxa-workspace[data-state="completed"]').waitFor();
  await page.locator('.dxa-current').scrollIntoViewIfNeeded(); await shot('06-real-opencode-reply');
  await page.getByTestId('dxb-entry').click(); await page.getByTestId('dxb-pane').waitFor();
  // The user-visible empty native guest is granted only for this next host turn.
  await page.getByTestId('dxb-enable-ai').click(); await lifecycle.dispatch(() => page.getByTestId('dxb-confirm-ai').click());
  await page.getByTestId('dxb-takeover').waitFor(); await shot('07-browser-granted');
  const guest = page.getByTestId('dxb-guest'); const guestId = await guest.evaluate(e => e.getWebContentsId());
  const google = await tool('08-google', 'dsh_x_agents_run', { runtime: 'opencode', model: model.id, browser: true,
    prompt: 'Use the available DSH browser tools to open https://www.google.com/ in the already visible browser tab. Do not search, log in, solve a CAPTCHA, follow other links, or use any other site. Stop after observing the Google page and briefly report what you see.', scope: hello.scope });
  assert.equal(google.task?.state, 'completed');
  const guestInfo = await app.evaluate(({ webContents }, id) => { const guest = webContents.fromId(id); return { id: guest.id, type: guest.getType(), url: guest.getURL() }; }, guestId);
  assert.equal(guestInfo.type, 'webview'); assert.equal(await guest.evaluate(e => e.getWebContentsId()), guestId);
  const destination = new URL(guestInfo.url); assert.equal(destination.protocol, 'https:'); assert.equal(destination.hostname, 'www.google.com');
  const visibleText = await guest.evaluate(e => e.executeJavaScript('document.body.innerText'));
  assert(!/captcha|unusual traffic|verify you are human/i.test(visibleText) && destination.pathname === '/', 'Google challenge or unexpected route; no challenge was solved');
  const completedBrowser = google.task.events.filter(event => event.type === 'tool' && event.data?.name === 'dsh_browser_action' && event.data?.state?.status === 'completed');
  assert(completedBrowser.some(event => event.data.state.input?.action === 'navigate' && event.data.state.input.url === 'https://www.google.com/'), 'No completed native browser navigation event');
  assert(completedBrowser.some(event => event.data.state.input?.action === 'observe'), 'No completed native page observation event');
  assert(report.approvals.some(item => item.operation === '08-google' && approvalInScope('08-google', item.reason, {})), 'No approved native browser navigation');
  report.google = { guest: guestInfo, nativeSessionId: google.task.nativeSessionId, events: google.task.events, state: google.task.state };
  await shot('09-real-google-visible');
  await page.locator('.dxa-entry').click(); await page.locator('.dxa-current').scrollIntoViewIfNeeded(); await shot('10-native-browser-tool-result');
  report.assertions.push('real OpenCode zero-price model supplied hello answer', 'real OpenCode used approved bridge to navigate same visible native webview to Google');
  lifecycle.complete();
} catch (error) {
  report.status = 'blocked-or-failed'; report.error = String(error.stack ?? error);
  if (!page && app) page = app.windows()[0]; if (page) {
    report.browserTrace = await readFile(join(results, 'browser-trace.json'), 'utf8').then(JSON.parse).catch(() => []);
    report.browserDiagnostic = await page.getByTestId('dxb-pane').textContent({ timeout: 3000 }).catch(() => null);
    await page.locator('.dxb-error details').evaluateAll(nodes => nodes.forEach(node => { node.open = true; })).catch(() => {});
    await shot('failure').catch(() => {});
  }
  throw error;
} finally {
  lifecycle.finish(); clearTimeout(watchdog);
  if (report.status === 'passed') report.status = 'cleanup-pending';
  report.browserTrace = await readFile(join(results, 'browser-trace.json'), 'utf8').then(JSON.parse).catch(() => []);
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  if (app) {
    try { await deadline(app.close(), 30000, 'Final Desktop close'); }
    catch (error) {
      lifecycle.cleanupUnconfirmed(error);
      await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
      clearTimeout(watchdog); process.exit(1);
    }
  }
  if (report.status === 'cleanup-pending') { report.status = 'passed'; report.cleanup = 'desktop-close-confirmed'; }
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  clearTimeout(watchdog);
}
