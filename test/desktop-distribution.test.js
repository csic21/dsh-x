import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, access, symlink, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { defaultHome, digest, localPath, runtimeEnvironment, installDistribution } from '../scripts/desktop-distribution/bootstrap.mjs'

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'dsh-distribution-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const root = path.join(directory, 'application'), home = path.join(directory, 'home')
  await mkdir(root); await mkdir(home)
  await writeFile(path.join(root, 'app.asar'), 'inert official archive fixture')
  const plugins = []
  for (const name of ['dsh-x-code', 'dsh-x-agents', 'dsh-x-chat', 'dsh-x-plan', 'dsh-x-stock', 'dsh-x-browser']) {
    const file = name + '.tgz'; await writeFile(path.join(root, file), 'inert fixture ' + name)
    plugins.push({ name, version: '0.1.1', file, sha256: await digest(path.join(root, file)) })
  }
  const manifest = { schema: 1, id: 'dsh-x-fixture', kernelVersion: '0.2.1-rc.2', kernelSha: 'a'.repeat(40), plugins, archive: 'app.asar', archiveSha256: await digest(path.join(root, 'app.asar')), executable: 'node', cli: 'failure.mjs' }
  await writeFile(path.join(root, 'distribution.json'), JSON.stringify(manifest))
  return { root, home, manifest }
}
test('corrupt plugin bytes refuse initialization before executing any application', async t => {
  const { root, home } = await fixture(t)
  await writeFile(path.join(root, 'dsh-x-code.tgz'), 'corrupted')
  let initialized = false
  await assert.rejects(installDistribution({ root, home, initialize: async () => { initialized = true } }), /Damaged plugin/)
  assert.equal(initialized, false)
  await assert.rejects(access(path.join(home, 'distribution-installed.json')), { code: 'ENOENT' })
})
test('modified official archive refuses execution and removes only its owned installation lock', async t => {
  const { root, home } = await fixture(t)
  await writeFile(path.join(root, 'app.asar'), 'changed')
  await assert.rejects(installDistribution({ root, home }), /Official application archive was modified/)
  await assert.rejects(access(path.join(home, 'distribution-install.lock')), { code: 'ENOENT' })
  await assert.rejects(access(path.join(home, 'distribution-installed.json')), { code: 'ENOENT' })
})
test('failed official CLI does not claim successful installation or rewrite an existing profile', { skip: process.platform === 'win32' }, async t => {
  const { root, home } = await fixture(t)
  await symlink(process.execPath, path.join(root, 'node'))
  await writeFile(path.join(root, 'failure.mjs'), 'process.exit(7)')
  const profile = path.join(home, 'profiles/desktop')
  await mkdir(profile, { recursive: true }); await writeFile(path.join(profile, 'package.json'), '{"private":true}')
  await assert.rejects(installDistribution({ root, home }), /Installer command failed \(7\)/)
  assert.equal(await readFile(path.join(profile, 'package.json'), 'utf8'), '{"private":true}')
  await assert.rejects(access(path.join(home, 'distribution-installed.json')), { code: 'ENOENT' })
})
test('launching an installed distribution honors user plugin removals without reinstallation', async t => {
  const { root, home, manifest } = await fixture(t)
  await writeFile(path.join(home, 'distribution-installed.json'), JSON.stringify({ id: manifest.id }))
  const result = await installDistribution({ root, home, initialize: () => { throw new Error('must not initialize again') } })
  assert.equal(result.changed, false)
  await assert.rejects(access(path.join(home, 'profiles')), { code: 'ENOENT' })
})
test('default home is the official native home unless DSH_HOME overrides it', () => {
  assert.equal(defaultHome({}), path.join(homedir(), '.dsh'))
  assert.equal(defaultHome({ DSH_HOME: '/custom/home' }), path.resolve('/custom/home'))
  assert.equal(defaultHome({ DSH_HOME: 'relative' }), path.join(homedir(), '.dsh'))
})
test('distribution paths cannot escape and environment keeps the native layout', () => {
  for (const file of ['../secret', 'a/../secret', '/secret']) assert.throws(() => localPath('/application', file))
  const env = runtimeEnvironment('/native-home', { PATH: '/bin', DSH_HOME: '/original', DSH_AGENTS_HOME: '/original/agents', DSH_DESKTOP_USER_DATA_DIR: '/original/electron', NODE_OPTIONS: '--require malicious', ELECTRON_RUN_AS_NODE: '1' })
  assert.equal(env.DSH_HOME, '/native-home'); assert.equal(env.DSH_AGENTS_HOME, '/original/agents')
  assert.equal(env.DSH_DESKTOP_USER_DATA_DIR, undefined)
  assert.equal(env.NODE_OPTIONS, undefined); assert.equal(env.ELECTRON_RUN_AS_NODE, undefined)
})
