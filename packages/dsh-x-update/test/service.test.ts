import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { access, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
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

async function profileFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'dsh-x-update-service-'))
  const home = path.join(root, 'home')
  const profile = path.join(home, 'profiles', 'desktop')
  await mkdir(path.join(profile, 'node_modules', 'dsh-x-code'), { recursive: true })
  await writeFile(path.join(profile, 'package.json'), JSON.stringify({ dependencies: { 'dsh-x-code': 'file:code.tgz' } }))
  await writeFile(path.join(profile, 'node_modules', 'dsh-x-code', 'package.json'), JSON.stringify({ name: 'dsh-x-code', version: '0.1.1' }))
  return { root, home, profile }
}

function context(files: { home: string; profile: string }) {
  return { name: 'desktop', dir: files.profile, home: files.home }
}

test('checks a compatible plugin release without writing anything', async t => {
  const files = await profileFixture()
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
    profileContext: context(files), runtimeVersion: '0.2.1-rc.2',
    fetchImpl, config: { autoCheck: false },
  })
  const checked = await service.check()
  assert.equal(checked.phase, 'idle')
  assert.equal(checked.plan?.kind, 'plugin')
  assert.equal(checked.plan?.reason, 'plugin-newer')
  assert.equal(checked.plan?.available.pluginVersion, '0.1.2')
  await assert.rejects(access(path.join(files.home, 'updates')), { code: 'ENOENT' })
})

test('a plugin release for another runtime is blocked', async t => {
  const files = await profileFixture()
  t.after(() => rm(files.root, { recursive: true, force: true }))
  const releaseUrl = 'https://github.com/csic21/dsh-x/releases/download/plugins-v0.1.2'
  const fetchImpl = fakeFetch({
    'https://github.com/csic21/dsh-x/releases.atom': atom(['plugins-v0.1.2']),
    [`${releaseUrl}/build-manifest.json`]: JSON.stringify({
      tag: 'plugins-v0.1.2', runtime: '0.2.1-rc.3',
      artifacts: [{ name: 'dsh-x-code', version: '0.1.2', file: 'dsh-x-code-0.1.2.tgz', sha256: sha256(Buffer.from('x')), integrity: 'sha512-AAAA' }],
    }),
  })
  const service = createUpdateService({
    profileContext: context(files), runtimeVersion: '0.2.1-rc.2',
    fetchImpl, config: { autoCheck: false },
  })
  const checked = await service.check()
  assert.equal(checked.plan?.kind, 'blocked')
  assert.equal(checked.plan?.reason, 'runtime-mismatch')
})

test('a failing feed is reported without throwing', async t => {
  const files = await profileFixture()
  t.after(() => rm(files.root, { recursive: true, force: true }))
  const service = createUpdateService({
    profileContext: context(files), runtimeVersion: '0.2.1-rc.2',
    fetchImpl: async () => new Response('nope', { status: 500 }), config: { autoCheck: false },
  })
  const status = await service.check()
  assert.equal(status.phase, 'error')
  assert.match(status.error ?? '', /HTTP/)
})

test('an unknown runtime blocks the check after reading the release', async t => {
  const files = await profileFixture()
  t.after(() => rm(files.root, { recursive: true, force: true }))
  const releaseUrl = 'https://github.com/csic21/dsh-x/releases/download/plugins-v0.1.2'
  const service = createUpdateService({
    profileContext: context(files), runtimeVersion: null,
    fetchImpl: fakeFetch({
      'https://github.com/csic21/dsh-x/releases.atom': atom(['plugins-v0.1.2']),
      [`${releaseUrl}/build-manifest.json`]: JSON.stringify({
        tag: 'plugins-v0.1.2', runtime: '0.2.1-rc.2',
        artifacts: [{ name: 'dsh-x-code', version: '0.1.2', file: 'dsh-x-code-0.1.2.tgz', sha256: sha256(Buffer.from('x')), integrity: 'sha512-AAAA' }],
      }),
    }),
    config: { autoCheck: false },
  })
  const status = await service.check()
  assert.equal(status.phase, 'idle')
  assert.equal(status.plan?.reason, 'local-runtime-unknown')
})
