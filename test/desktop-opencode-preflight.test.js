import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import { catalogMetadataFetch, checkOwnedVersion, checkReadOnlyDenial, confinedSpawn, KERNEL_COMMIT } from '../scripts/desktop-opencode-preflight.mjs';

// Some restricted cloud workspaces deliberately put a .git sentinel above all
// writable roots. Keep the production repository-context guard intact there.
let ancestorGit = false;
for (let at = resolve(tmpdir()); ; at = dirname(at)) {
  if (existsSync(join(at, '.git'))) ancestorGit = true;
  if (dirname(at) === at) break;
}
const isolatedWorkspace = { skip: ancestorGit ? 'No Git-free writable temporary root on this test host; the production guard is preserved.' : false };

function handle(output, exitCode = 0) {
  const stdout = new PassThrough(), stderr = new PassThrough();
  const done = new Promise(resolve => setImmediate(() => { stdout.end(output); stderr.end(); resolve({ exitCode }); }));
  return { stdout, stderr, stdin: { end() {} }, done, terminate() {}, async waitForExit() { await done; return true; } };
}

test('version preflight uses the production owned adapter, fresh state and only --version', isolatedWorkspace, async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-preflight-test-'));
  const wraps = [], calls = [];
  try {
    const result = await checkOwnedVersion({ workspace, executable: '/verified/opencode', signal: new AbortController().signal,
      sandbox: { async confine(argv, policy) { wraps.push({ argv, policy }); return { argv: ['sandbox-exec', '--', ...argv], enforcement: 'full' }; } },
      subprocess: { spawn(spec) { calls.push(spec); assert(existsSync(spec.cwd)); return handle('1.19.3\n'); } } });
    assert.deepEqual(wraps[0], { argv: ['/verified/opencode', '--version'], policy: { mode: 'workspace-write', workspaceRoot: workspace } });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].env.OPENCODE_DISABLE_PROJECT_CONFIG, 'true');
    assert.equal(calls[0].env.OPENCODE_DISABLE_CLAUDE_CODE, 'true');
    assert(calls[0].env.HOME.startsWith(join(workspace, '.dsh-owned-opencode-')));
    assert.equal(result.authenticationSource, 'version-only');
    assert.equal(result.modelRequests, 0);
    assert.deepEqual(readdirSync(workspace), []);
  } finally { rmSync(workspace, { recursive: true, force: true }); }
});

test('partial confinement cannot reach a process spawn and owned state is cleaned', isolatedWorkspace, async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-preflight-test-'));
  try {
    await assert.rejects(checkOwnedVersion({ workspace, executable: '/verified/opencode',
      sandbox: { async confine(argv) { return { argv, enforcement: 'partial' }; } },
      subprocess: { spawn() { assert.fail('partial confinement must not spawn'); } } }), /does not report full enforcement/);
    assert.deepEqual(readdirSync(workspace), []);
  } finally { rmSync(workspace, { recursive: true, force: true }); }
});

test('full-enforcement gate rejects partial before invoking subprocess', async () => {
  await assert.rejects(confinedSpawn({ spec: { argv: ['command'] }, policy: { mode: 'workspace-write' },
    sandbox: { async confine(argv) { return { argv, enforcement: 'partial' }; } },
    subprocess: { spawn() { assert.fail('partial must never spawn'); } } }), /does not report full enforcement/);
});

test('abort while awaiting confinement is checked before spawning', async () => {
  const controller = new AbortController();
  await assert.rejects(confinedSpawn({ spec: { argv: ['command'], signal: controller.signal }, policy: { mode: 'read-only' },
    sandbox: { async confine(argv) { controller.abort(); return { argv, enforcement: 'full' }; } },
    subprocess: { spawn() { assert.fail('aborted preflight must not spawn'); } } }), /abort/i);
});

test('read-only probe requires both an actual denial response and an absent sentinel', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-preflight-test-'));
  const sandbox = { async confine(argv, policy) { assert.equal(policy.mode, 'read-only'); return { argv, enforcement: 'full' }; } };
  try {
    const subprocess = { spawn(spec) { assert.equal(spec.argv[0], process.execPath); assert.equal(spec.argv[1], '-e'); return handle('write-denied'); } };
    assert.deepEqual(await checkReadOnlyDenial({ workspace, sandbox, subprocess }), { denied: true, sentinelAbsent: true });
    writeFileSync(join(workspace, 'must-not-be-created'), 'unexpected');
    await assert.rejects(checkReadOnlyDenial({ workspace, sandbox, subprocess }), /unexpectedly wrote/);
  } finally { rmSync(workspace, { recursive: true, force: true }); }
});

test('preflight pins source imports, explicitly gates catalog reads and never executes a model task', () => {
  const source = readFileSync(new URL('../scripts/desktop-opencode-preflight.mjs', import.meta.url), 'utf8');
  assert.equal(KERNEL_COMMIT, '1517a4dbca0a2789ff1d41ba439600f8547d23fa');
  assert.match(source, /requireKernel\.resolve\('tsx\/esm\/api'\)/);
  assert.match(source, /register\(\{ tsconfig: join\(kernel, 'tsconfig.base.json'\) \}\)/);
  assert.match(source, /vendor\/cordis\/src\/index.ts/);
  assert.match(source, /packages\/sandbox\/sandbox-local\/src\/index.ts/);
  assert.match(source, /packages\/subprocess\/subprocess-local\/src\/index.ts/);
  assert.doesNotMatch(source, /adapter\.run\(|runnerCommand|danger-full-access|internals\s*=/);
  assert.match(source, /process.env.DSH_OPENCODE_PREFLIGHT_CATALOG === '1'/);
  assert.match(source, /if \(catalogAuthorized\) report.catalog = await checkOwnedCatalog/);
  assert.match(source, /\['\/global\/health', '\/config', '\/provider'\]\.includes\(url.pathname\)/);
  assert.match(source, /forbids prompt\/session APIs and retries/);
  assert.match(source, /cleanup is unconfirmed/);
});

test('catalog diagnostic admits only three read endpoints on one owned loopback origin, once each', async () => {
  const calls = [], metadata = catalogMetadataFetch(async url => { calls.push(url); return { ok: true }; });
  const get = { method: 'GET', redirect: 'error' };
  for (const [url, init] of [
    ['https://example.com/config', get], ['http://localhost:4000/config', get],
    ['http://127.0.0.1:4000/session', get], ['http://127.0.0.1:4000/config', { ...get, method: 'POST' }],
    ['http://127.0.0.1:4000/config', { ...get, body: '{}' }], ['http://127.0.0.1:4000/config', { ...get, redirect: 'follow' }],
  ]) assert.throws(() => metadata.fetch(url, init));
  assert.deepEqual(calls, []);
  await metadata.fetch('http://127.0.0.1:4000/global/health', get);
  assert.throws(() => metadata.fetch('http://127.0.0.1:5000/config', get), /owned loopback/);
  await metadata.fetch('http://127.0.0.1:4000/config', get);
  await metadata.fetch('http://127.0.0.1:4000/provider', get);
  assert.throws(() => metadata.fetch('http://127.0.0.1:4000/provider', get), /retries/);
  assert.deepEqual([...metadata.paths], ['/global/health', '/config', '/provider']);
  assert.equal(calls.length, 3);
});

test('CLI fails closed off macOS before importing services or starting native code', { skip: process.platform === 'darwin' }, () => {
  const output = mkdtempSync(join(tmpdir(), 'dsh-preflight-report-'));
  try {
    const child = spawnSync(process.execPath, ['scripts/desktop-opencode-preflight.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, DSH_SMOKE_OUTPUT: output }, encoding: 'utf8', timeout: 5000 });
    assert.equal(child.status, 1);
    const report = JSON.parse(readFileSync(join(output, 'opencode-preflight.json'), 'utf8'));
    assert.equal(report.status, 'failed'); assert.match(report.error, /actual macOS Seatbelt/);
    assert.deepEqual(report.wraps, []); assert.equal(report.catalogRequests, 0); assert.equal(report.modelRequests, 0);
  } finally { rmSync(output, { recursive: true, force: true }); }
});
