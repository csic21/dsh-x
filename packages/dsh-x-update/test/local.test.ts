import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readLocalState, readOwnRuntimeVersion } from '../src/local.ts'

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'dsh-x-update-local-'))
  const home = path.join(root, 'home')
  const profile = path.join(home, 'profiles', 'desktop')
  await mkdir(path.join(profile, 'node_modules', 'dsh-x-code'), { recursive: true })
  await mkdir(path.join(profile, 'node_modules', 'dsh-x-stock'), { recursive: true })
  await writeFile(path.join(profile, 'package.json'), JSON.stringify({ dependencies: { 'dsh-x-code': 'file:code.tgz', 'dsh-x-stock': 'file:stock.tgz' } }))
  await writeFile(path.join(profile, 'node_modules', 'dsh-x-code', 'package.json'), JSON.stringify({ name: 'dsh-x-code', version: '0.1.2' }))
  await writeFile(path.join(profile, 'node_modules', 'dsh-x-stock', 'package.json'), JSON.stringify({ name: 'dsh-x-stock', version: '0.1.1' }))
  return { root, home, profile }
}

test('reads installed plugin versions from the official profile context', async t => {
  const files = await fixture()
  t.after(() => rm(files.root, { recursive: true, force: true }))
  const state = await readLocalState({
    profileContext: { name: 'desktop', dir: files.profile, home: files.home },
    runtimeVersion: '0.2.1-rc.2',
  })
  assert.equal(state.home, files.home)
  assert.equal(state.profile, 'desktop')
  assert.equal(state.runtimeVersion, '0.2.1-rc.2')
  assert.deepEqual(state.plugins, [
    { name: 'dsh-x-code', version: '0.1.2' },
    { name: 'dsh-x-stock', version: '0.1.1' },
  ])
})

test('falls back to DSH_HOME and DSH_PROFILE', async t => {
  const files = await fixture()
  t.after(() => rm(files.root, { recursive: true, force: true }))
  const state = await readLocalState({
    env: { DSH_HOME: files.home, DSH_PROFILE: 'desktop' },
    runtimeVersion: '0.2.1-rc.2',
  })
  assert.equal(state.profile, 'desktop')
  assert.deepEqual(state.plugins.map(item => item.name), ['dsh-x-code', 'dsh-x-stock'])
})

test('an empty dependency list or missing profile means no installed plugins', async t => {
  const files = await fixture()
  t.after(() => rm(files.root, { recursive: true, force: true }))
  await writeFile(path.join(files.profile, 'package.json'), JSON.stringify({ dependencies: {} }))
  assert.deepEqual((await readLocalState({ profileContext: { name: 'desktop', dir: files.profile, home: files.home } })).plugins, [])
  assert.deepEqual((await readLocalState({ profileContext: { name: 'web', dir: path.join(files.root, 'missing'), home: files.home } })).plugins, [])
})

test('the running runtime default comes from this package exact engine', async () => {
  assert.equal(await readOwnRuntimeVersion(), '0.2.1-rc.2')
})
