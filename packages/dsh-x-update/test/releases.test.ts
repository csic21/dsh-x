import test from 'node:test'
import assert from 'node:assert/strict'
import { assetUrl, classifyTag, newestFor, parseApi, parseAtom } from '../src/releases.ts'

const ATOM = `<?xml version="1.0"?><feed>
<entry><updated>2026-10-18T06:24:50Z</updated><link rel="alternate" type="text/html" href="https://github.com/csic21/dsh-x/releases/tag/plugins-v0.1.0"/><title>plugins</title></entry>
<entry><updated>2026-10-18T08:58:30Z</updated><link rel="alternate" type="text/html" href="https://github.com/csic21/dsh-x/releases/tag/desktop-v0.1.1"/><title>desktop</title></entry>
<entry><updated>2026-10-18T09:00:00Z</updated><link rel="alternate" type="text/html" href="https://github.com/csic21/dsh-x/releases/tag/plugins-v0.1.2"/><title>plugins</title></entry>
<entry><updated>2026-10-18T09:01:00Z</updated><link rel="alternate" type="text/html" href="https://github.com/csic21/dsh-x/releases/tag/other-v9.9.9"/><title>other</title></entry>
</feed>`

test('classifies plugin tags and ignores desktop or unrelated tags', () => {
  assert.deepEqual(classifyTag('plugins-v0.2.1-rc.2'), { kind: 'plugins', version: '0.2.1-rc.2' })
  assert.equal(classifyTag('desktop-v0.1.1'), null)
  assert.equal(classifyTag('other-v1.0.0'), null)
  assert.equal(classifyTag('plugins-v1'), null)
})

test('parses the public Atom feed and ignores unrelated entries', () => {
  const releases = parseAtom(ATOM)
  assert.deepEqual(releases.map(item => item.tag), ['plugins-v0.1.0', 'plugins-v0.1.2'])
  assert.equal(releases[1].updatedAt, '2026-10-18T09:00:00Z')
})

test('parses the REST fallback and skips drafts', () => {
  const releases = parseApi([
    { tag_name: 'desktop-v0.1.2', published_at: '2026-10-19T00:00:00Z', draft: false },
    { tag_name: 'plugins-v0.1.3', draft: true },
    { tag_name: 'plugins-v0.1.2', draft: false },
  ])
  assert.deepEqual(releases.map(item => item.version), ['0.1.2'])
})

test('sorts newest plugin releases and builds encoded asset URLs', () => {
  const entries = parseAtom(ATOM)
  assert.deepEqual(newestFor(entries, 'plugins').map(item => item.tag), ['plugins-v0.1.2', 'plugins-v0.1.0'])
  assert.equal(newestFor(entries, 'plugins', 1)[0].version, '0.1.2')
  assert.equal(
    assetUrl('csic21/dsh-x', 'plugins-v0.1.0', 'dsh-x-suite-0.1.0.tgz'),
    'https://github.com/csic21/dsh-x/releases/download/plugins-v0.1.0/dsh-x-suite-0.1.0.tgz',
  )
  assert.match(assetUrl('csic21/dsh-x', 'plugins-v0.1.1', 'DSH-X 1.tgz'), /DSH-X%201\.tgz$/)
})
