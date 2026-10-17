/** Real Windows packaged-Electron smoke; no kernel patch and no vendor account. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const kernel = resolve(process.env.DSH_SMOKE_KERNEL ?? '../deepseek-harness');
const output = resolve(process.env.DSH_SMOKE_OUTPUT ?? './desktop-smoke-evidence');
const homeBase = resolve(process.env.DSH_SMOKE_HOME ?? './desktop-smoke-home');
await mkdir(homeBase, { recursive: true });
const home = await mkdtemp(join(homeBase, 'run-'));
const require = createRequire(join(resolve(process.env.DSH_SMOKE_DRIVER ?? repo), 'package.json'));
const { _electron } = require('playwright');
if (process.platform !== 'win32') throw Error('This proof requires Windows; Linux is not an equivalent Desktop run.');
await mkdir(output, { recursive: true }); await mkdir(home, { recursive: true });
const results = join(home, 'fixture-results'); await mkdir(results, { recursive: true });
const hash = async p => createHash('sha256').update(await readFile(p)).digest('hex');
async function find(root, name) { for (const e of await readdir(root, { withFileTypes: true })) { const p = join(root, e.name); if (e.isDirectory()) { const hit = await find(p, name); if (hit) return hit; } else if (e.name === name) return p; } }
const executable = await find(join(kernel, 'apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts'), 'DeepSeek Harness.exe');
assert(executable, 'Official unsigned unpacked executable missing');
const cli = join(dirname(executable), 'resources/runtime/cli/bin/dsh.cmd');
await stat(cli);
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/KEY|SECRET|TOKEN|PASSWORD|^NODE_OPTIONS$|^ELECTRON_RUN_AS_NODE$|^DSH_HOME$/i.test(key)));
Object.assign(env, { DSH_HOME: home, DSH_DESKTOP_USER_DATA_DIR: join(home, 'electron'), DSH_TELEMETRY_DISABLED: '1', DSH_BROWSER_SMOKE_RESULTS: results,
  // Public noncredential sentinel for offline fixture onboarding. Never sent to a provider.
  DEEPSEEK_API_KEY: 'synthetic-offline-fixture-not-a-credential' });
function run(command, args) { return new Promise((ok, fail) => { const child = spawn(command, args, { env, cwd: repo, shell: command.endsWith('.cmd'), stdio: 'inherit' }); child.on('error', fail); child.on('exit', code => code === 0 ? ok() : fail(Error(`Command exited ${code}`))); }); }
const fixture = createServer((req, res) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end('<!doctype html><title>DSH local browser fixture</title><h1>Visible native guest fixture</h1><label>Name <input aria-label="Fixture name" id="name"></label><button id="apply" onclick="document.querySelector(\'#result\').textContent=document.querySelector(\'#name\').value">Apply fixture value</button><output id="result">unchanged</output>'); });
let app, page;
const actualKernelSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: kernel, encoding: 'utf8' }).trim();
assert.equal(actualKernelSha, process.env.DSH_SMOKE_KERNEL_SHA, 'Kernel source does not match pinned proof target');
const actualPluginSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
if (process.env.GITHUB_SHA) assert.equal(actualPluginSha, process.env.GITHUB_SHA, 'Plugin checkout does not match workflow commit');
const pluginPackage = JSON.parse(await readFile(join(repo, 'packages/dsh-x-browser/package.json'), 'utf8'));
const report = { pluginVersion: pluginPackage.version, clientSha256: await hash(join(repo, 'packages/dsh-x-browser/lib/client.js')), kind: 'actual-packaged-desktop-smoke', platform: process.platform, kernelSha: process.env.DSH_SMOKE_KERNEL_SHA, pluginSha: actualPluginSha, executableSha256: await hash(executable), fixtureOnly: true, assertions: [], status: 'running' };
await new Promise(ok => fixture.listen(0, '127.0.0.1', ok));
const url = `http://127.0.0.1:${fixture.address().port}/`;
const launch = () => _electron.launch({ executablePath: executable, cwd: home, args: [`--user-data-dir=${join(home, 'electron')}`], env, chromiumSandbox: true, timeout: 120000 });
try {
  // Let official Desktop create its reserved profile, then install via its own CLI.
  app = await launch();
  await app.firstWindow({ timeout: 120000 });
  for (let n = 0; n < 120; n++) { try { await stat(join(home, 'profiles/desktop/package.json')); break; } catch { await new Promise(r => setTimeout(r, 500)); } }
  await app.close(); app = undefined;
  await run(cli, ['plugin', '--profile', 'desktop', 'add', `link:${join(repo, 'packages/dsh-x-browser')}`, `link:${join(repo, 'scripts/fixtures/desktop-browser-smoke')}`]);
  app = await launch();
  report.runtime = await app.evaluate(({ app, webContents }) => ({ packaged: app.isPackaged, version: app.getVersion(), electron: process.versions.electron, appPath: app.getAppPath(), userData: app.getPath('userData') }));
  assert.equal(report.runtime.packaged, true);
  assert.equal(report.runtime.electron, '44.7.0');
  assert.equal(resolve(report.runtime.userData).toLowerCase(), resolve(home, 'electron').toLowerCase());
  for (let n = 0; n < 180; n++) {
    page = app.windows().find(p => p.url().startsWith('dsh-app://app/'));
    if (page && await page.getByTestId('dxb-entry').isVisible().catch(() => false)) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  assert(page, 'Primary official application document missing');
  // Materialize a real conversation before the browser binds session/workspace identity.
  const setupEditor = page.locator('[data-composer-input][contenteditable="true"]').last();
  await setupEditor.fill('Synthetic offline setup'); await setupEditor.press('Enter');
  await page.getByText('Synthetic offline fixture: send a bounded browser test request.', { exact: true }).waitFor({ timeout: 30000 });
  await page.getByTestId('dxb-entry').click({ timeout: 30000 });
  await page.getByTestId('dxb-pane').waitFor();
  await page.getByTestId('dxb-address').fill(url); await page.getByTestId('dxb-go').click();
  const guest = page.getByTestId('dxb-guest'); await guest.waitFor();
  const guestId = await guest.evaluate(e => e.getWebContentsId());
  const guestInfo = () => app.evaluate(({ webContents }, id) => { const g = webContents.fromId(id); return { id: g.id, type: g.getType(), url: g.getURL(), destroyed: g.isDestroyed() }; }, guestId);
  for (let n = 0; n < 100 && (await guestInfo()).url !== url; n++) await new Promise(r => setTimeout(r, 100));
  assert.equal((await guestInfo()).type, 'webview'); assert.equal((await guestInfo()).url, url);
  report.guest = await guestInfo(); report.assertions.push('real packaged app / primary document / plugin-owned webview');
  await page.getByTestId('dxb-enable-ai').click();
  await page.getByTestId('dxb-confirm-ai').click();
  await page.getByTestId('dxb-takeover').waitFor();
  async function tool(id, tool, args, scenario, expectedError = false) {
    const editor = page.locator('[data-composer-input][contenteditable="true"]').last();
    await editor.fill(JSON.stringify({ id, tool, arguments: args, scenario })); await editor.press('Enter');
    for (let n = 0; n < 300; n++) {
      const allow = page.getByRole('button', { name: /^(Allow once|允许一次)$/ });
      if (await allow.isVisible().catch(() => false)) await allow.click();
      try { const value = JSON.parse(await readFile(join(results, `${id}.json`), 'utf8')); assert.equal(value.isError, expectedError, value.text); return expectedError ? value : JSON.parse(value.text); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await new Promise(r => setTimeout(r, 200));
    }
    throw Error(`No completed ToolRuntime result for ${id}`);
  }
  const flow = await tool('visible-flow', 'dsh_x_browser_tabs', {}, 'visible-flow');
  assert.equal(flow.completed, 5); const tab = flow.tab;
  const value = await guest.evaluate(e => e.executeJavaScript('document.querySelector("#result").textContent'));
  assert.equal(value, 'native-visible-proof'); report.assertions.push('real ToolRuntime observed, typed and clicked same visible guest');
  await page.screenshot({ path: join(output, 'visible-browser-proof.png') });
  await page.getByTestId('dxb-takeover').click();
  await page.getByRole('button', { name: /^(Stop generating|停止生成)$/ }).click();
  await page.getByRole('button', { name: /^(Stop generating|停止生成)$/ }).waitFor({ state: 'hidden' });
  await page.locator('[data-composer-input][contenteditable="true"]').last().waitFor();
  assert.equal((await guestInfo()).id, guestId); assert.equal((await guestInfo()).url, url);
  const after = await tool('after-takeover', 'dsh_x_browser_tabs', {});
  assert.equal(after.tabs.find(t => t.tabId === tab.tabId)?.granted, false);
  const stale = await tool('stale-after-takeover', 'dsh_x_browser_action', { tabId: tab.tabId, epoch: tab.epoch, grantRevision: tab.grantRevision, action: 'type', target: 'e0:s0:n0', text: 'must-not-appear' }, undefined, true);
  assert.match(stale.text, /BROWSER_GRANT|enable AI access/i);
  assert.equal(await guest.evaluate(e => e.executeJavaScript('document.querySelector("#result").textContent')), 'native-visible-proof');
  const box = await guest.boundingBox(); assert(box);
  const centers = await guest.evaluate(e => e.executeJavaScript('JSON.stringify(["#name","#apply"].map(selector => { const r=document.querySelector(selector).getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; }))'));
  const [inputCenter, buttonCenter] = JSON.parse(centers);
  // Human-style mouse/keyboard input to the same visible guest, after authority revocation.
  await page.mouse.click(box.x + inputCenter.x, box.y + inputCenter.y);
  await page.keyboard.press('Control+A'); await page.keyboard.type('human-takeover');
  await page.mouse.click(box.x + buttonCenter.x, box.y + buttonCenter.y);
  assert.equal(await guest.evaluate(e => e.executeJavaScript('document.querySelector("#result").textContent')), 'human-takeover');
  report.assertions.push('takeover revokes grant, rejects stale action, retains exact guest and supports manual input');
  await page.screenshot({ path: join(output, 'user-takeover.png') }); report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = String(error.stack ?? error);
  if (!page && app) page = app.windows()[0];
  if (page) await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  if (app) await app.close().catch(() => {});
  await new Promise(ok => fixture.close(ok));
}
