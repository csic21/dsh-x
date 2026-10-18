import test from 'node:test'
import assert from 'node:assert/strict'
import { loadPluginRelease, safeFileName } from '../src/manifests.ts'
import type { FetchLike } from '../src/releases.ts'

const HASH = 'a'.repeat(64)

function fakeFetch(files: Record<string, string>): FetchLike {
  return async input => {
    const url = String(input)
    const body = files[url]
    return body === undefined ? new Response('missing', { status: 404 }) : new Response(body, { status: 200 })
  }
}

const BUILD = JSON.stringify({
  tag: 'plugins-v0.1.2',
  runtime: '0.2.1-rc.2',
  artifacts: [{
    name: 'dsh-x-code', version: '0.1.2', file: 'dsh-x-code-0.1.2.tgz', sha256: HASH,
    integrity: 'sha512-AAAA', bundled: [],
  }],
})

test('accepts plain file names only', () => {
  assert.equal(safeFileName('dsh-x-code-0.1.2.tgz'), true)
  assert.equal(safeFileName('../evil.tgz'), false)
  assert.equal(safeFileName('nested/evil.tgz'), false)
  assert.equal(safeFileName(''), false)
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

test('rejects a manifest tagged for another release', async () => {
  const wrong = JSON.stringify({ ...JSON.parse(BUILD), tag: 'plugins-v0.1.1' })
  assert.equal(await loadPluginRelease({
    repository: 'csic21/dsh-x', tag: 'plugins-v0.1.2', version: '0.1.2',
    fetchImpl: fakeFetch({ 'https://github.com/csic21/dsh-x/releases/download/plugins-v0.1.2/build-manifest.json': wrong }),
  }), null)
})

test('rejects unsafe artifact names and non-plugin packages', async () => {
  const unsafe = JSON.stringify({
    ...JSON.parse(BUILD),
    artifacts: [{ ...JSON.parse(BUILD).artifacts[0], file: '../evil.tgz' }],
  })
  assert.equal(await loadPluginRelease({
    repository: 'csic21/dsh-x', tag: 'plugins-v0.1.2', version: '0.1.2',
    fetchImpl: fakeFetch({ 'https://github.com/csic21/dsh-x/releases/download/plugins-v0.1.2/build-manifest.json': unsafe }),
  }), null)
  const other = JSON.stringify({
    ...JSON.parse(BUILD),
    artifacts: [{ ...JSON.parse(BUILD).artifacts[0], name: 'other-plugin' }],
  })
  assert.equal(await loadPluginRelease({
    repository: 'csic21/dsh-x', tag: 'plugins-v0.1.2', version: '0.1.2',
    fetchImpl: fakeFetch({ 'https://github.com/csic21/dsh-x/releases/download/plugins-v0.1.2/build-manifest.json': other }),
  }), null)
})
