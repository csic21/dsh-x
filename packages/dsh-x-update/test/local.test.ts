import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readLocalState } from '../src/local.ts'

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'dsh-x-update-local-'))
  const app = path.join(root, 'DSH-X.app')
  const resources = path.join(app, 'Contents', 'Resources')
  const execPath = path.join(resources, 'runtime', 'DeepSeek Harness.app', 'Contents', 'MacOS', 'DeepSeek Harness')
  await mkdir(path.dirname(execPath), { recursive: true })
  await writeFile(execPath, '')
  await writeFile(path.join(resources, 'distribution.json'), JSON.stringify({
    schema: 1,
    version: '0.1.1',
    target: 'macos-arm64',
    kernelVersion: '0.2.1-rc.2',
    plugins: [
      { name: 'dsh-x-code', version: '0.1.1' },
      { name: 'dsh-x-stock', version: '0.1.1' },
    ],
  }))
  const home = path.join(root, 'home')
  const profile = path.join(home, 'profiles', 'desktop')
  await mkdir(path.join(profile, 'node_modules', 'dsh-x-code'), { recursive: true })
  await writeFile(path.join(profile, 'package.json'), JSON.stringify({ dependencies: { 'dsh-x-code': 'file:code.tgz' } }))
  await writeFile(path.join(profile, 'node_modules', 'dsh-x-code', 'package.json'), JSON.stringify({ name: 'dsh-x-code', version: '0.1.2' }))
  return { root, app, resources, execPath, home, profile }
}

test('reads the outer Desktop distribution and the profile plugin versions', async t => {
  const files = await fixture()
  t.after(() => rm(files.root, { recursive: true, force: true }))
  const state = await readLocalState({
    env: { DSH_HOME: files.home, DSH_PROFILE: 'desktop', DSH_PROFILE_DIR: files.profile },
    platform: 'darwin', arch: 'arm64', execPath: files.execPath,
  })
  assert.equal(state.desktop, true)
  assert.equal(state.appVersion, '0.1.1')
  assert.equal(state.kernelVersion, '0.2.1-rc.2')
  assert.equal(state.target, 'macos-arm64')
  assert.equal(state.appPath, files.app)
  assert.equal(state.installRoot, path.dirname(files.app))
  assert.deepEqual(state.plugins, [{ name: 'dsh-x-code', version: '0.1.2' }])
})

test('an empty profile dependency list means the user removed the plugins', async t => {
  const files = await fixture()
  t.after(() => rm(files.root, { recursive: true, force: true }))
  await writeFile(path.join(files.profile, 'package.json'), JSON.stringify({ dependencies: {} }))
  const state = await readLocalState({
    env: { DSH_HOME: files.home, DSH_PROFILE: 'desktop', DSH_PROFILE_DIR: files.profile },
    platform: 'darwin', arch: 'arm64', execPath: files.execPath,
  })
  assert.deepEqual(state.plugins, [])
})

test('falls back to the distribution only when the profile manifest is missing', async t => {
  const files = await fixture()
  t.after(() => rm(files.root, { recursive: true, force: true }))
  await rm(path.join(files.profile, 'package.json'))
  const state = await readLocalState({
    env: { DSH_HOME: files.home, DSH_PROFILE: 'desktop', DSH_PROFILE_DIR: files.profile },
    platform: 'darwin', arch: 'arm64', execPath: files.execPath,
  })
  assert.deepEqual(state.plugins.map(item => item.name), ['dsh-x-code', 'dsh-x-stock'])
})

test('Web profiles report no desktop app but keep the platform target', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dsh-x-update-web-'))
  try {
    const state = await readLocalState({
      env: { DSH_HOME: path.join(root, 'home'), DSH_PROFILE: 'web' },
      platform: 'linux', arch: 'x64', execPath: path.join(root, 'node'),
    })
    assert.equal(state.desktop, false)
    assert.equal(state.appVersion, null)
    assert.equal(state.target, null)
  } finally { await rm(root, { recursive: true, force: true }) }
})
