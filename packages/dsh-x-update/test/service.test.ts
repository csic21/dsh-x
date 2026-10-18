import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createUpdateService } from '../src/service.ts'
import type { FetchLike } from '../src/releases.ts'

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const integrity = (bytes: Buffer) => `sha512-${createHash('sha512').update(bytes).digest('base64')}`

function atom(tags: string[]): string {
  return `<feed>${tags.map(tag => `<entry><updated>2026-10-18T00:00:00Z</updated><link rel="alternate" type="text/html" href="https://github.com/csic21/dsh-x/releases/tag/${tag}"/></entry>`).join('')}</feed>`
}

function fakeFetch(files: Record<string, string | Buffer>): FetchLike {
  return async input => {
    const url = String(input)
    const body = files[url]
    if (body === undefined) return new Response('missing', { status: 404 })
    return new Response(body as BodyInit, { status: 200, headers: { 'content-length': String(Buffer.byteLength(body)) } })
  }
}

async function desktopFixture(version = '0.1.1', kernelVersion = '0.2.1-rc.2') {
  const root = await mkdtemp(path.join(tmpdir(), 'dsh-x-update-service-'))
  const resources = path.join(root, 'DSH-X.app', 'Contents', 'Resources')
  const execPath = path.join(resources, 'runtime', 'DeepSeek Harness.app', 'Contents', 'MacOS', 'DeepSeek Harness')
  await mkdir(path.dirname(execPath), { recursive: true })
  await writeFile(execPath, '')
  await writeFile(path.join(resources, 'distribution.json'), JSON.stringify({
    schema: 1, version, target: 'macos-arm64', kernelVersion,
    plugins: [{ name: 'dsh-x-code', version }],
  }))
  const home = path.join(root, 'home')
  const profile = path.join(home, 'profiles', 'desktop')
  await mkdir(path.join(profile, 'node_modules', 'dsh-x-code'), { recursive: true })
  await writeFile(path.join(profile, 'package.json'), JSON.stringify({ dependencies: { 'dsh-x-code': 'file:code.tgz' } }))
  await writeFile(path.join(profile, 'node_modules', 'dsh-x-code', 'package.json'), JSON.stringify({ name: 'dsh-x-code', version }))
  return { root, resources, execPath, home, profile }
}

function env(home: string) {
  return { DSH_HOME: home, DSH_PROFILE: 'desktop', DSH_PROFILE_DIR: path.join(home, 'profiles', 'desktop') }
}

test('checks and stages a compatible plugin release', async t => {
  const files = await desktopFixture()
  t.after(() => rm(files.root, { recursive: true, force: true }))
  const tgz = Buffer.from('code-0.1.2')
  const releaseUrl = 'https://github.com/csic21/dsh-x/releases/download/plugins-v0.1.2'
  const fetchImpl = fakeFetch({
    'https://github.com/csic21/dsh-x/releases.atom': atom(['plugins-v0.1.2']),
    [`${releaseUrl}/build-manifest.json`]: JSON.stringify({
      tag: 'plugins-v0.1.2', runtime: '0.2.1-rc.2',
      artifacts: [{ name: 'dsh-x-code', version: '0.1.2', file: 'dsh-x-code-0.1.2.tgz', sha256: sha256(tgz), integrity: integrity(tgz) }],
    }),
    [`${releaseUrl}/dsh-x-code-0.1.2.tgz`]: tgz,
  })
  const service = createUpdateService({
    env: env(files.home), platform: 'darwin', arch: 'arm64', execPath: files.execPath,
    fetchImpl, config: { autoCheck: false, autoDownload: false },
  })
  const checked = await service.check()
  assert.equal(checked.plan?.kind, 'plugin')
  assert.equal(checked.plan?.reason, 'plugin-newer')
  assert.equal(checked.pending, null)
  const staged = await service.stage()
  assert.equal(staged.pending?.kind, 'plugins')
  assert.equal(staged.phase, 'ready')
  const pending = JSON.parse(await readFile(path.join(files.home, 'updates', 'pending-plugins.json'), 'utf8'))
  assert.equal(pending.runtime, '0.2.1-rc.2')
  assert.equal((await stat(pending.files[0].path)).size, tgz.byteLength)
})

test('an app release carrying a new kernel is staged as an app update', async t => {
  const files = await desktopFixture()
  t.after(() => rm(files.root, { recursive: true, force: true }))
  const dmg = Buffer.from('desktop-0.1.2')
  const releaseUrl = 'https://github.com/csic21/dsh-x/releases/download/desktop-v0.1.2'
  const fetchImpl = fakeFetch({
    'https://github.com/csic21/dsh-x/releases.atom': atom(['desktop-v0.1.2']),
    [`${releaseUrl}/distribution-macos-arm64.json`]: JSON.stringify({
      schema: 1, version: '0.1.2', target: 'macos-arm64', kernelVersion: '0.2.1-rc.3', kernelSha: 'a'.repeat(40), unsigned: true,
    }),
    [`${releaseUrl}/SHA256SUMS`]: `${sha256(dmg)}  DSH-X-0.1.2-mac-arm64-preview.dmg\n`,
    [`${releaseUrl}/DSH-X-0.1.2-mac-arm64-preview.dmg`]: dmg,
  })
  const service = createUpdateService({
    env: env(files.home), platform: 'darwin', arch: 'arm64', execPath: files.execPath,
    fetchImpl, config: { autoCheck: false, autoDownload: false, autoInstallApp: false },
  })
  const checked = await service.check()
  assert.equal(checked.plan?.kind, 'app')
  assert.equal(checked.plan?.reason, 'app-newer')
  const staged = await service.stage()
  assert.equal(staged.pending?.kind, 'app')
  const pending = JSON.parse(await readFile(path.join(files.home, 'updates', 'pending-app.json'), 'utf8'))
  assert.equal(pending.kernelVersion, '0.2.1-rc.3')
  assert.equal(pending.appPath, path.join(files.root, 'DSH-X.app'))
})

test('a failing feed is reported without throwing', async t => {
  const files = await desktopFixture()
  t.after(() => rm(files.root, { recursive: true, force: true }))
  const service = createUpdateService({
    env: env(files.home), platform: 'darwin', arch: 'arm64', execPath: files.execPath,
    fetchImpl: async () => new Response('nope', { status: 500 }), config: { autoCheck: false, autoDownload: false },
  })
  const status = await service.check()
  assert.equal(status.phase, 'error')
  assert.match(status.error ?? '', /HTTP/)
})
