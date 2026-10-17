/** macOS-only, zero-prompt preflight. Catalog reads require an explicit CI gate. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { closeOwnedProcess, createOwnedOpenCodeAdapter } from '../packages/dsh-x-agents/src/adapters/opencode-owned.js';

export const KERNEL_COMMIT = '1517a4dbca0a2789ff1d41ba439600f8547d23fa';
const CLEANUP_MS = 15000;

function bounded(promise, timeoutMs, label) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} exceeded its deadline.`)), timeoutMs);
  })]).finally(() => clearTimeout(timer));
}

/** Resolve source through the pinned kernel's own tsx and path map, before lib is built. */
export async function loadOfficialServices(kernel) {
  const requireKernel = createRequire(join(kernel, 'package.json'));
  const { register } = await import(pathToFileURL(requireKernel.resolve('tsx/esm/api')).href);
  const unregister = register({ tsconfig: join(kernel, 'tsconfig.base.json') });
  try {
    const [cordis, sandbox, subprocess] = await Promise.all([
      import(pathToFileURL(join(kernel, 'vendor/cordis/src/index.ts')).href),
      import(pathToFileURL(join(kernel, 'packages/sandbox/sandbox-local/src/index.ts')).href),
      import(pathToFileURL(join(kernel, 'packages/subprocess/subprocess-local/src/index.ts')).href),
    ]);
    return { Context: cordis.Context, LocalSandboxProvider: sandbox.LocalSandboxProvider, LocalSubprocessRuntime: subprocess.LocalSubprocessRuntime, unregister };
  } catch (error) { await unregister(); throw error; }
}

export async function confinedSpawn({ sandbox, subprocess, spec, policy, onWrap = () => {} }) {
  spec.signal?.throwIfAborted();
  const confined = await sandbox.confine(spec.argv, policy, spec.signal);
  if (confined.enforcement !== 'full') throw new Error('The official host file-effect sandbox does not report full enforcement.');
  spec.signal?.throwIfAborted();
  onWrap({ mode: policy.mode, enforcement: confined.enforcement, runner: basename(confined.argv[0]) });
  return subprocess.spawn({ ...spec, argv: confined.argv });
}

/** The production adapter is permitted to execute exactly --version here. */
export async function checkOwnedVersion({ sandbox, subprocess, executable, workspace, signal, onWrap }) {
  const policy = { mode: 'workspace-write', workspaceRoot: workspace };
  const adapter = createOwnedOpenCodeAdapter({
    config: { mode: 'owned-browser', executable, startupTimeoutMs: 60000, cleanupTimeoutMs: CLEANUP_MS },
    fetch: () => { throw new Error('Network API calls are forbidden in the version-only preflight.'); },
    spawn: spec => {
      assert.deepEqual(spec.argv, [executable, '--version'], 'Preflight may only request the native version.');
      return confinedSpawn({ sandbox, subprocess, spec, policy, onWrap });
    },
  });
  const result = await adapter.discover({ cwd: workspace, sandboxPolicy: policy, signal });
  assert.equal(result.available, true, result.reason);
  assert.equal(result.version, '1.19.3');
  assert.equal(result.authentication.source, 'version-only');
  assert.deepEqual(result.models, []);
  return { available: true, version: result.version, authenticationSource: result.authentication.source, modelRequests: 0 };
}

/** Public metadata only; no session, prompt, browser bridge or native run API. */
export function catalogMetadataFetch(fetch, onRequest = () => {}) {
  const paths = new Set();
  let origin;
  return { paths, fetch: (input, init = {}) => {
    const url = new URL(input);
    assert(url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port && !url.username && !url.password && (!origin || origin === url.origin), 'Catalog preflight only permits its owned loopback endpoint.');
    assert((init.method || 'GET') === 'GET' && !init.body && init.redirect === 'error', 'Catalog preflight forbids mutation and redirects.');
    assert(['/global/health', '/config', '/provider'].includes(url.pathname) && !paths.has(url.pathname), 'Catalog preflight forbids prompt/session APIs and retries.');
    origin = url.origin; paths.add(url.pathname); onRequest(url.pathname);
    return fetch(input, init);
  } };
}

export async function checkOwnedCatalog({ sandbox, subprocess, executable, workspace, signal, onWrap, onRequest = () => {}, fetch = globalThis.fetch }) {
  const policy = { mode: 'workspace-write', workspaceRoot: workspace };
  const metadata = catalogMetadataFetch(fetch, onRequest);
  let spawned = false;
  const adapter = createOwnedOpenCodeAdapter({
    config: { mode: 'owned-browser', executable, startupTimeoutMs: 120000, requestTimeoutMs: 120000, cleanupTimeoutMs: CLEANUP_MS },
    fetch: metadata.fetch,
    spawn: spec => {
      assert.equal(spawned, false, 'Catalog preflight may start only one owned service.');
      assert.deepEqual(spec.argv, [executable, 'serve', '--hostname', '127.0.0.1', '--port', '0', '--mdns=false']);
      spawned = true;
      return confinedSpawn({ sandbox, subprocess, spec, policy, onWrap });
    },
  });
  const result = await adapter.discoverModels({ cwd: workspace, sandboxPolicy: policy, signal });
  assert.equal(result.available, true);
  assert.equal(result.version, '1.19.3');
  assert.equal(result.modelCatalog.source, 'owned-free-catalog');
  assert(result.models.length > 0 && result.models.every(model => model.free === true && model.id.startsWith('opencode/')));
  assert.deepEqual([...metadata.paths], ['/global/health', '/config', '/provider']);
  return { available: true, version: result.version, source: result.modelCatalog.source, freeModelCount: result.models.length, freeModelIds: result.models.slice(0, 50).map(model => model.id), modelRequests: 0 };
}

/** Exercise the real denial, rather than trusting the provider's advertised label alone. */
export async function checkReadOnlyDenial({ sandbox, subprocess, workspace, signal, onWrap }) {
  const target = join(workspace, 'must-not-be-created');
  const source = 'try { require("node:fs").writeFileSync(process.argv[1], "unexpected"); process.exitCode = 2; } catch (error) { if (error.code === "EPERM" || error.code === "EACCES") process.stdout.write("write-denied"); else throw error; }';
  const env = Object.fromEntries(Object.keys(process.env).map(key => [key, undefined]));
  Object.assign(env, { PATH: process.env.PATH, HOME: workspace, TMPDIR: workspace });
  let child, outputError, stdout = '';
  try {
    child = await confinedSpawn({ sandbox, subprocess, policy: { mode: 'read-only', workspaceRoot: workspace }, onWrap,
      spec: { argv: [process.execPath, '-e', source, target], cwd: workspace, env, signal, graceMs: 1000, stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' } } });
    child.stdout.on('data', chunk => { stdout = (stdout + String(chunk)).slice(-4096); });
    child.stdout.on('error', error => { outputError = error; });
    child.stderr.on('data', () => {});
    child.stderr.on('error', error => { outputError = error; });
    const outcome = await bounded(child.done, 15000, 'Seatbelt denial probe');
    if (!child.stdout.readableEnded) await bounded(new Promise((yes, no) => { child.stdout.once('end', yes); child.stdout.once('error', no); }), 2000, 'Seatbelt probe output');
    if (outputError) throw outputError;
    assert.equal(outcome.exitCode, 0, 'The official read-only policy did not deny the test write as expected.');
    assert.equal(stdout, 'write-denied');
    assert.equal(existsSync(target), false, 'The read-only probe unexpectedly wrote its sentinel.');
    return { denied: true, sentinelAbsent: true };
  } finally { await closeOwnedProcess({ child, timeoutMs: CLEANUP_MS }); }
}

export async function main() {
  const catalogAuthorized = process.env.DSH_OPENCODE_PREFLIGHT_CATALOG === '1';
  const output = resolve(process.env.DSH_SMOKE_OUTPUT || 'desktop-opencode-preflight');
  mkdirSync(output, { recursive: true });
  const report = { kind: catalogAuthorized ? 'macos-owned-opencode-public-catalog' : 'macos-owned-opencode-version-only', platform: process.platform, arch: process.arch, startedAt: new Date().toISOString(), status: 'running', wraps: [], modelRequests: 0, catalogRequests: 0, cleanupConfirmed: false,
    lifecycleBoundary: 'Official macOS SubprocessLocal uses managed process-tree containment; escaped descendants are not guaranteed to be observed. This is not persistent process-range ownership.' };
  const save = () => writeFileSync(join(output, 'opencode-preflight.json'), `${JSON.stringify(report, null, 2)}\n`);
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(new Error('Preflight exceeded its operation deadline.')), catalogAuthorized ? 180000 : 120000);
  const hardTimer = setTimeout(() => { report.status = 'failed'; report.error = 'Preflight exceeded its final cleanup deadline; cleanup is unconfirmed.'; save(); process.exit(1); }, catalogAuthorized ? 215000 : 155000);
  let workspace, services, ctx;
  save();
  try {
    assert.equal(process.platform, 'darwin', 'This proof requires actual macOS Seatbelt. Other platforms are not substituted.');
    assert(['arm64', 'x64'].includes(process.arch), 'Unsupported macOS architecture.');
    const kernel = realpathSync(process.env.DSH_SMOKE_KERNEL || '');
    const executable = process.env.DSH_OPENCODE_EXE;
    assert(executable && isAbsolute(executable), 'DSH_OPENCODE_EXE must be the verified official absolute executable path.');
    const kernelCommit = execFileSync('git', ['-C', kernel, 'rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 5000 }).trim();
    assert.equal(kernelCommit, KERNEL_COMMIT, 'Unexpected official kernel revision.');
    execFileSync('git', ['-C', kernel, 'diff', '--quiet', 'HEAD', '--'], { timeout: 5000 });
    report.kernelCommit = kernelCommit;
    report.executableSha256 = createHash('sha256').update(readFileSync(executable)).digest('hex');
    workspace = mkdtempSync(join(tmpdir(), 'dsh-opencode-preflight-'));
    report.workspace = workspace;
    services = await bounded(loadOfficialServices(kernel), 30000, 'Official source imports');
    ctx = new services.Context();
    await ctx.plugin(services.LocalSandboxProvider, {});
    await ctx.plugin(services.LocalSubprocessRuntime);
    assert(ctx.sandbox && ctx.subprocess, 'Official services did not register.');
    const options = { sandbox: ctx.sandbox, subprocess: ctx.subprocess, workspace, signal: controller.signal, onWrap: wrap => { report.wraps.push(wrap); save(); } };
    report.readOnly = await checkReadOnlyDenial(options);
    save();
    report.native = await checkOwnedVersion({ ...options, executable });
    save();
    if (catalogAuthorized) report.catalog = await checkOwnedCatalog({ ...options, executable, onRequest: path => { if (path === '/provider') report.catalogRequests++; save(); } });
    report.status = 'passed';
  } catch (error) { report.status = 'failed'; report.error = String(error?.message || error); }
  finally {
    controller.abort();
    try {
      if (ctx) await bounded(ctx.fiber.dispose(), CLEANUP_MS, 'Official service cleanup');
      if (services) await bounded(services.unregister(), 2000, 'Official source loader cleanup');
      report.cleanupConfirmed = true;
    }
    catch (error) { report.status = 'failed'; report.error = `${report.error ? `${report.error}; ` : ''}${error.message}`; }
    if (report.cleanupConfirmed && workspace) rmSync(workspace, { recursive: true, force: true });
    report.finishedAt = new Date().toISOString();
    save();
    clearTimeout(abortTimer); clearTimeout(hardTimer);
  }
  console.log(`OpenCode ${catalogAuthorized ? 'public-catalog' : 'version-only'} preflight: ${report.status}. Report: ${join(output, 'opencode-preflight.json')}`);
  if (report.status !== 'passed') process.exitCode = 1;
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
