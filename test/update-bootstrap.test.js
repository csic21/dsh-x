import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { applyPendingPluginUpdate, readDistribution } from '../scripts/desktop-distribution/bootstrap.mjs'

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

async function fixture({ runtime = '0.2.1-rc.2', filePath, dependency = true, version = '0.1.2' } = {}) {
  const home = await mkdtemp(path.join(tmpdir(), 'dsh-x-bootstrap-update-'))
  const tag = 'plugins-v0.1.2'
  const directory = path.join(home, 'updates', 'plugins', tag)
  await mkdir(directory, { recursive: true })
  const bytes = Buffer.from(`plugin-${version}`)
  const file = 'dsh-x-code-0.1.2.tgz'
  const target = path.join(directory, file)
  await writeFile(target, bytes)
  const profile = path.join(home, 'profiles', 'desktop')
  await mkdir(path.join(profile, 'node_modules', 'dsh-x-code'), { recursive: true })
  await writeFile(path.join(profile, 'package.json'), JSON.stringify({ dependencies: dependency ? { 'dsh-x-code': 'file:old.tgz' } : {} }))
  await writeFile(path.join(profile, 'node_modules', 'dsh-x-code', 'package.json'), JSON.stringify({ name: 'dsh-x-code', version: '0.1.1' }))
  await writeFile(path.join(home, 'updates', 'pending-plugins.json'), JSON.stringify({
    schema: 1, kind: 'plugins', tag, version: '0.1.2', runtime, createdAt: '2026-10-18T00:00:00.000Z',
    files: [{ name: 'dsh-x-code', version, file, path: filePath ?? target, sha256: sha256(bytes), integrity: '' }],
  }))
  return { home, target, bytes, tag, file }
}

function fakeCli(calls) {
  return async (_root, _manifest, home, args) => {
    calls.push(args)
    const index = args.indexOf('add')
    const specs = args.slice(index + 1).filter(value => !value.startsWith('--'))
    for (const spec of specs) {
      const name = path.basename(spec).replace(/-\d+\.\d+\.\d+.*\.tgz$/, '')
      await writeFile(path.join(home, 'profiles', 'desktop', 'node_modules', name, 'package.json'), JSON.stringify({ name, version: '0.1.2' }))
    }
    return ''
  }
}

test('applies a staged plugin update through the injected CLI', async t => {
  const files = await fixture()
  t.after(() => rm(files.home, { recursive: true, force: true }))
  const calls = []
  const result = await applyPendingPluginUpdate({ root: '/fake', manifest: { kernelVersion: '0.2.1-rc.2' }, home: files.home, cli: fakeCli(calls) })
  assert.equal(result.applied, true)
  assert.equal(calls.length, 1)
  assert(calls[0].includes('--ignore-scripts'))
  const installed = JSON.parse(await readFile(path.join(files.home, 'profiles', 'desktop', 'node_modules', 'dsh-x-code', 'package.json'), 'utf8'))
  assert.equal(installed.version, '0.1.2')
  await assert.rejects(stat(path.join(files.home, 'updates', 'pending-plugins.json')), { code: 'ENOENT' })
  assert.equal((await stat(path.join(files.home, 'installer-packages', 'update-plugins-v0.1.2', files.file))).size, files.bytes.byteLength)
})

test('rejects a staged update for another kernel and keeps the current install', async t => {
  const files = await fixture({ runtime: '0.2.1-rc.3' })
  t.after(() => rm(files.home, { recursive: true, force: true }))
  let called = false
  const result = await applyPendingPluginUpdate({
    root: '/fake', manifest: { kernelVersion: '0.2.1-rc.2' }, home: files.home,
    cli: async () => { called = true },
  })
  assert.equal(result.applied, false)
  assert.equal(result.reason, 'kernel-mismatch')
  assert.equal(called, false)
  await assert.rejects(stat(path.join(files.home, 'updates', 'pending-plugins.json')), { code: 'ENOENT' })
})

test('rejects a pending path outside the updates directory', async t => {
  const files = await fixture({ filePath: '/tmp/outside.tgz' })
  t.after(() => rm(files.home, { recursive: true, force: true }))
  const result = await applyPendingPluginUpdate({ root: '/fake', manifest: { kernelVersion: '0.2.1-rc.2' }, home: files.home, cli: async () => {} })
  assert.equal(result.applied, false)
  assert.equal(result.reason, 'invalid')
})

test('skips a release whose plugins are not installed in this profile', async t => {
  const files = await fixture({ dependency: false })
  t.after(() => rm(files.home, { recursive: true, force: true }))
  const result = await applyPendingPluginUpdate({ root: '/fake', manifest: { kernelVersion: '0.2.1-rc.2' }, home: files.home, cli: async () => { throw new Error('must not run') } })
  assert.equal(result.applied, false)
  assert.equal(result.reason, 'no-targets')
})

test('a failing CLI leaves the pending update failed but does not throw', async t => {
  const files = await fixture()
  t.after(() => rm(files.home, { recursive: true, force: true }))
  const result = await applyPendingPluginUpdate({
    root: '/fake', manifest: { kernelVersion: '0.2.1-rc.2' }, home: files.home,
    cli: async () => { throw new Error('cli failed') },
  })
  assert.equal(result.applied, false)
  assert.match(result.reason, /cli failed/)
  await assert.rejects(stat(path.join(files.home, 'updates', 'pending-plugins.json')), { code: 'ENOENT' })
})

test('readDistribution accepts any number of unique plugin bundles', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'dsh-x-distribution-read-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(path.join(root, 'packs'))
  const bytes = Buffer.from('plugin')
  await writeFile(path.join(root, 'packs', 'dsh-x-code.tgz'), bytes)
  await writeFile(path.join(root, 'distribution.json'), JSON.stringify({
    schema: 1, id: 'dsh-x-0.1.1-test', plugins: [
      { name: 'dsh-x-code', version: '0.1.1', file: 'packs/dsh-x-code.tgz', sha256: sha256(bytes) },
    ],
  }))
  const manifest = await readDistribution(root)
  assert.equal(manifest.plugins.length, 1)
})
