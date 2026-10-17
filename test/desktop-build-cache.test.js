import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { treeManifest, writeManifest, verifyManifest } from '../scripts/desktop-build-cache.mjs';
async function fixture(t) {
  const base = await mkdtemp(join(tmpdir(), 'dsh-cache-test-')); t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'win-unpacked'); await mkdir(join(root, 'resources'), { recursive: true });
  await writeFile(join(root, 'app.exe'), 'binary'); await writeFile(join(root, 'resources', 'app.asar'), 'resources');
  return { base, root, manifest: join(base, 'manifest.json'), inputs: { kernel: 'pinned', target: 'win-x64' } };
}
test('build cache verifies complete tree and fixed inputs', async t => {
  const f = await fixture(t); await writeManifest(f.root, f.manifest, f.inputs);
  assert.equal((await verifyManifest(f.root, f.manifest, f.inputs)).files.length, 2);
  await assert.rejects(verifyManifest(f.root, f.manifest, { ...f.inputs, kernel: 'changed' }), /inputs differ/);
});
test('build cache rejects modified, missing and extra files', async t => {
  const f = await fixture(t); await writeManifest(f.root, f.manifest, f.inputs);
  await writeFile(join(f.root, 'app.exe'), 'changed'); await assert.rejects(verifyManifest(f.root, f.manifest, f.inputs), /hashes differ/);
  await writeFile(join(f.root, 'app.exe'), 'binary'); await rm(join(f.root, 'resources', 'app.asar'));
  await assert.rejects(verifyManifest(f.root, f.manifest, f.inputs), /inventory/);
  await writeFile(join(f.root, 'resources', 'app.asar'), 'resources'); await writeFile(join(f.root, 'extra.dll'), 'extra');
  await assert.rejects(verifyManifest(f.root, f.manifest, f.inputs), /inventory/);
});
test('build cache never follows manifest traversal paths', async t => {
  const f = await fixture(t); await writeManifest(f.root, f.manifest, f.inputs);
  const value = JSON.parse(await readFile(f.manifest, 'utf8')); value.files[0].path = '../outside';
  await writeFile(f.manifest, JSON.stringify(value)); await assert.rejects(verifyManifest(f.root, f.manifest, f.inputs), /inventory/);
  await assert.rejects(writeManifest(f.root, join(f.root, 'manifest.json'), f.inputs), /outside/);
});
test('build cache rejects directory links and linked root', async t => {
  const f = await fixture(t), outside = join(f.base, 'outside'); await mkdir(outside);
  await symlink(outside, join(f.root, 'escape'), 'junction'); await assert.rejects(treeManifest(f.root), /symlinks/);
  await symlink(f.root, join(f.base, 'linked'), 'junction'); await assert.rejects(treeManifest(join(f.base, 'linked')), /real directory/);
});
test('build cache rejects a modified fingerprint', async t => {
  const f = await fixture(t); await writeManifest(f.root, f.manifest, f.inputs);
  const value = JSON.parse(await readFile(f.manifest, 'utf8')); value.inputDigest = '0'.repeat(64);
  await writeFile(f.manifest, JSON.stringify(value)); await assert.rejects(verifyManifest(f.root, f.manifest, f.inputs), /fingerprint/);
});
test('workflow rejects every inconsistent cache hit before verify or build', async () => {
  const workflow = await readFile(new URL('../.github/workflows/desktop-package.yml', import.meta.url), 'utf8');
  const expression = workflow.match(/name: Reject nonexact cache restoration\r?\n\s+if: ([^\r\n]+)/)?.[1];
  assert(expression, 'Exact cache rejection step is required');
  const translated = expression
    .replaceAll('steps.desktop-cache.outputs.cache-hit', 'hit')
    .replaceAll('steps.desktop-cache.outputs.cache-matched-key', 'matched')
    .replaceAll('steps.desktop-inputs.outputs.key', 'expected');
  // Evaluate the actual checked-in predicate, with only its three known output identifiers.
  assert(/^[\s()=!&|'a-z]+$/.test(translated), 'Unexpected workflow predicate syntax');
  assert.deepEqual([...new Set(translated.match(/[a-z]+/g))].sort(), ['expected', 'hit', 'matched', 'true']);
  const rejects = new Function('hit', 'matched', 'expected', `return (${translated});`);
  for (const [hit, matched, rejected] of [
    ['', '', false], ['false', '', false], ['true', 'exact-key', false],
    ['true', '', true], ['true', 'wrong-key', true], ['false', 'exact-key', true], ['', 'exact-key', true],
  ]) assert.equal(rejects(hit, matched, 'exact-key'), rejected, `${hit}/${matched}`);
});
