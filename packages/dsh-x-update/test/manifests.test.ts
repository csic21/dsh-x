import test from 'node:test'
import assert from 'node:assert/strict'
import { installerSuffix, loadDesktopRelease, loadPluginRelease, parseSha256Sums, targetForPlatform } from '../src/manifests.ts'
import type { FetchLike } from '../src/releases.ts'

const HASH = 'a'.repeat(64)

function fakeFetch(files: Record<string, string>): FetchLike {
  return async input => {
    const url = String(input)
    const body = files[url]
    return body === undefined ? new Response('missing', { status: 404 }) : new Response(body, { status: 200 })
  }
}

const DISTRIBUTION = JSON.stringify({
  schema: 1,
  version: '0.1.2',
  target: 'macos-arm64',
  kernelVersion: '0.2.1-rc.2',
  kernelSha: 'b'.repeat(40),
  unsigned: true,
  autoUpdate: false,
})
const SUMS = `${HASH}  DSH-X-0.1.2-mac-arm64-preview.dmg\n`
const BUILD = JSON.stringify({
  tag: 'plugins-v0.1.2',
  runtime: '0.2.1-rc.2',
  artifacts: [{
    name: 'dsh-x-code', version: '0.1.2', file: 'dsh-x-code-0.1.2.tgz', sha256: HASH,
    integrity: 'sha512-AAAA', bundled: [],
  }],
})

test('maps platforms to release targets', () => {
  assert.equal(targetForPlatform('darwin', 'arm64'), 'macos-arm64')
  assert.equal(targetForPlatform('darwin', 'x64'), 'macos-x64')
  assert.equal(targetForPlatform('win32', 'x64'), 'windows-x64')
  assert.equal(targetForPlatform('linux', 'x64'), null)
  assert.match(installerSuffix('windows-x64'), /win-x64-preview\.exe$/)
})

test('parses checksums and rejects path-like names', () => {
  const sums = parseSha256Sums(`${HASH}  good.tgz\n${HASH} *star.tgz\n${HASH}  ../evil.tgz\nnope  bad.tgz\n`)
  assert.deepEqual([...sums.keys()], ['good.tgz', 'star.tgz'])
})

test('loads a desktop manifest and its installer checksum', async () => {
  const release = await loadDesktopRelease({
    repository: 'csic21/dsh-x', tag: 'desktop-v0.1.2', version: '0.1.2', target: 'macos-arm64',
    fetchImpl: fakeFetch({
      'https://github.com/csic21/dsh-x/releases/download/desktop-v0.1.2/distribution-macos-arm64.json': DISTRIBUTION,
      'https://github.com/csic21/dsh-x/releases/download/desktop-v0.1.2/SHA256SUMS': SUMS,
    }),
  })
  assert.equal(release?.version, '0.1.2')
  assert.equal(release?.kernelVersion, '0.2.1-rc.2')
  assert.equal(release?.installer.file, 'DSH-X-0.1.2-mac-arm64-preview.dmg')
  assert.equal(release?.installer.sha256, HASH)
})

test('missing target manifest or installer is not a usable app release', async () => {
  assert.equal(await loadDesktopRelease({
    repository: 'csic21/dsh-x', tag: 'desktop-v0.1.2', version: '0.1.2', target: 'windows-x64', fetchImpl: fakeFetch({}),
  }), null)
  assert.equal(await loadDesktopRelease({
    repository: 'csic21/dsh-x', tag: 'desktop-v0.1.2', version: '0.1.2', target: 'macos-arm64',
    fetchImpl: fakeFetch({
      'https://github.com/csic21/dsh-x/releases/download/desktop-v0.1.2/distribution-macos-arm64.json': DISTRIBUTION,
      'https://github.com/csic21/dsh-x/releases/download/desktop-v0.1.2/SHA256SUMS': `${HASH}  other.dmg\n`,
    }),
  }), null)
})

test('rejects a distribution whose version or target does not match the tag', async () => {
  const wrong = JSON.stringify({ ...JSON.parse(DISTRIBUTION), version: '0.1.1' })
  assert.equal(await loadDesktopRelease({
    repository: 'csic21/dsh-x', tag: 'desktop-v0.1.2', version: '0.1.2', target: 'macos-arm64',
    fetchImpl: fakeFetch({
      'https://github.com/csic21/dsh-x/releases/download/desktop-v0.1.2/distribution-macos-arm64.json': wrong,
      'https://github.com/csic21/dsh-x/releases/download/desktop-v0.1.2/SHA256SUMS': SUMS,
    }),
  }), null)
})

test('loads a plugin build manifest with asset URLs', async () => {
  const release = await loadPluginRelease({
    repository: 'csic21/dsh-x', tag: 'plugins-v0.1.2', version: '0.1.2',
    fetchImpl: fakeFetch({
      'https://github.com/csic21/dsh-x/releases/download/plugins-v0.1.2/build-manifest.json': BUILD,
    }),
  })
  assert.equal(release?.runtime, '0.2.1-rc.2')
  assert.equal(release?.artifacts[0].url, 'https://github.com/csic21/dsh-x/releases/download/plugins-v0.1.2/dsh-x-code-0.1.2.tgz')
})

test('rejects a plugin manifest tagged for another release', async () => {
  const wrong = JSON.stringify({ ...JSON.parse(BUILD), tag: 'plugins-v0.1.1' })
  assert.equal(await loadPluginRelease({
    repository: 'csic21/dsh-x', tag: 'plugins-v0.1.2', version: '0.1.2',
    fetchImpl: fakeFetch({ 'https://github.com/csic21/dsh-x/releases/download/plugins-v0.1.2/build-manifest.json': wrong }),
  }), null)
})
