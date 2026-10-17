/** Pristine unsigned build cache integrity. Trust comes from the producing workflow, not this manifest. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir, readFile, writeFile, rename, realpath } from 'node:fs/promises';
import { resolve, join, relative, sep, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export const KERNEL_SHA = '1517a4dbca0a2789ff1d41ba439600f8547d23fa';
export const BUILD_COMMAND = 'pnpm --filter @deepseek-ai/dsh-desktop run package win-x64 --unsigned --dir';
const SCHEMA = 1;
const sha = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value);
async function hashFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

/** Enumerate only ordinary files/directories; links and case-colliding Windows paths are refused. */
export async function treeManifest(root) {
  root = resolve(root);
  const rootInfo = await lstat(root);
  assert(rootInfo.isDirectory() && !rootInfo.isSymbolicLink(), 'Cache root must be a real directory');
  assert.equal((await realpath(root)).toLowerCase(), root.toLowerCase(), 'Cache root has a linked ancestor');
  const files = [], names = new Set();
  async function walk(directory) {
    for (const name of (await readdir(directory)).sort()) {
      assert(name !== '.' && name !== '..' && !/[\\/:\x00-\x1f]/.test(name), 'Unsafe cache filename');
      const path = join(directory, name), local = relative(root, path).split(sep).join('/');
      assert(local && !local.startsWith('../') && !local.startsWith('/'), 'Cache path escaped root');
      assert(!names.has(local.toLowerCase()), 'Case-colliding cache path'); names.add(local.toLowerCase());
      assert(names.size <= 200000, 'Cache tree exceeds file limit');
      const before = await lstat(path);
      assert(!before.isSymbolicLink(), 'Cache symlinks/junctions are forbidden');
      if (before.isDirectory()) { await walk(path); continue; }
      assert(before.isFile(), 'Cache contains a non-regular file');
      const digest = await hashFile(path), after = await lstat(path);
      assert(after.isFile() && !after.isSymbolicLink() && before.size === after.size && before.mtimeMs === after.mtimeMs && before.ino === after.ino, 'Cache changed during hashing');
      files.push({ path: local, size: before.size, sha256: digest });
    }
  }
  await walk(root);
  return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

export async function writeManifest(root, manifest, inputs, producer = {}) {
  const local = relative(resolve(root), resolve(manifest));
  assert(local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local), 'Manifest must be outside cached binary tree');
  const value = { schema: SCHEMA, inputs, inputDigest: sha(canonical(inputs)), producer, files: await treeManifest(root) };
  assert(value.files.length > 0, 'Cannot cache an empty build');
  const temporary = `${manifest}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2), { flag: 'wx' });
  await rename(temporary, manifest);
  return value;
}

export async function verifyManifest(root, manifest, inputs) {
  const info = await lstat(manifest);
  assert(info.isFile() && !info.isSymbolicLink() && info.size <= 64 * 1024 * 1024, 'Invalid cache manifest file');
  const value = JSON.parse(await readFile(manifest, 'utf8'));
  assert.equal(value.schema, SCHEMA, 'Unsupported cache schema');
  assert.equal(canonical(value.inputs), canonical(inputs), 'Cache build inputs differ');
  assert.equal(value.inputDigest, sha(canonical(inputs)), 'Cache fingerprint differs');
  assert(Array.isArray(value.files) && value.files.length > 0, 'Invalid cache file inventory');
  // Compare to locally enumerated paths, never follow paths supplied by a cached manifest.
  assert.equal(canonical(value.files), canonical(await treeManifest(root)), 'Cache file inventory or hashes differ');
  return value;
}

export async function buildContext(kernel, pnpmVersion) {
  assert.equal(process.platform, 'win32', 'This cache is Windows-only');
  assert.equal(process.arch, 'x64', 'This cache is x64-only');
  kernel = await realpath(resolve(kernel));
  const git = (...args) => execFileSync('git', args, { cwd: kernel, encoding: 'utf8' }).trim();
  assert.equal(git('rev-parse', 'HEAD'), KERNEL_SHA, 'Unexpected kernel source');
  assert.equal(git('diff', '--name-only', 'HEAD'), '', 'Tracked kernel source was changed');
  const pkg = JSON.parse(await readFile(join(kernel, 'package.json'), 'utf8'));
  assert.equal(pkg.packageManager, `pnpm@${pnpmVersion}`, 'Unexpected pnpm version');
  assert.equal(pnpmVersion, '11.28.5');
  const desktop = JSON.parse(await readFile(join(kernel, 'apps/desktop/package.json'), 'utf8'));
  assert.equal(desktop.devDependencies.electron, '^44.7.0', 'Unexpected Electron dependency');
  const lock = await readFile(join(kernel, 'pnpm-lock.yaml'), 'utf8');
  assert(/electron:\s*\n\s+specifier: \^44\.7\.0\s*\n\s+version: 44\.7\.0(?:\(|\s)/.test(lock), 'Unexpected resolved Electron version');
  const packaging = await readFile(join(kernel, 'apps/desktop/.env.windows'), 'utf8');
  const expected = ['DSH_DESKTOP_APP_ID=com.deepseek.harness.smoke', 'DSH_DESKTOP_AUTO_UPDATE_ENV=production', 'DSH_DESKTOP_MANDATORY_UPDATE_PROD_ORIGIN=https://dsh-smoke.invalid'];
  assert.deepEqual(packaging.replace(/^\uFEFF/, '').trim().split(/\r?\n/), expected, 'Unexpected unsigned smoke build environment');
  const inputs = { schema: SCHEMA, kernelSha: KERNEL_SHA, target: 'win-x64', node: process.version, pnpm: pnpmVersion,
    electron: '44.7.0', runnerImage: process.env.ImageOS ?? '', runnerImageVersion: process.env.ImageVersion ?? '',
    command: BUILD_COMMAND, packaging: expected, lockSha256: await hashFile(join(kernel, 'pnpm-lock.yaml')),
    packageSha256: await hashFile(join(kernel, 'package.json')), verifierSha256: await hashFile(fileURLToPath(import.meta.url)) };
  assert(inputs.runnerImage && inputs.runnerImageVersion, 'Runner image identity is required');
  const base = join(kernel, 'apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts');
  return { key: `dsh-unsigned-win-x64-v${SCHEMA}-${sha(canonical(inputs))}`, root: join(base, 'win-unpacked'), manifest: join(base, 'dsh-build-cache-manifest.json'), inputs };
}

async function main() {
  const [mode, ...args] = process.argv.slice(2), values = {};
  assert(['fingerprint', 'write', 'verify'].includes(mode), 'Expected fingerprint, write or verify');
  assert.equal(args.length, 4, 'Expected --kernel PATH --pnpm-version VERSION');
  for (let i = 0; i < args.length; i += 2) { assert(['--kernel', '--pnpm-version'].includes(args[i]) && !values[args[i]], 'Unknown/duplicate option'); values[args[i]] = args[i + 1]; }
  const context = await buildContext(values['--kernel'], values['--pnpm-version']);
  if (mode === 'write') {
    const written = await writeManifest(context.root, context.manifest, context.inputs, { repository: process.env.GITHUB_REPOSITORY ?? '', runId: process.env.GITHUB_RUN_ID ?? '', runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? '', workflowSha: process.env.GITHUB_SHA ?? '' });
    for (const required of ['DeepSeek Harness.exe', 'resources/app.asar', 'resources/runtime/cli/bin/dsh.cmd']) assert(written.files.some(f => f.path === required), `Missing packaged file: ${required}`);
  } else if (mode === 'verify') await verifyManifest(context.root, context.manifest, context.inputs);
  process.stdout.write(`${JSON.stringify(context)}\n`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
