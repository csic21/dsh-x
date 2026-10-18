import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const readJson = file => JSON.parse(readFileSync(file, 'utf8'))
const policy = readJson(path.join(root, 'compatibility/policy.json'))
const packageDirs = readdirSync(path.join(root, 'packages'), { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)

const dshPeers = manifest => Object.entries(manifest.peerDependencies ?? {})
  .filter(([name]) => /^@deepseek-ai\/dsh(-|$)/.test(name))

test('the policy declares one shared supported peer range instead of an exact pin', () => {
  assert.equal(typeof policy.supportedPeerRange, 'string')
  // Official admission reads peer ranges with semver's includePrerelease option;
  // pnpm resolves peers with the default (strict) prerelease rule. The union
  // admits both declared baselines under either rule and still resolves to the
  // qualified 0.2.1-rc.2 instead of downgrading development installs.
  assert.match(policy.supportedPeerRange, /^\^0\.\d+\.\d+-/, 'expected a caret range over a prerelease baseline')
  assert.doesNotMatch(policy.supportedPeerRange, /^\d+\.\d+\.\d+$/, 'an exact version is not an admitted range')
})

test('every plugin declares the shared supported peer range on official DSH packages', () => {
  assert.ok(packageDirs.length >= 3, 'expected every package directory')
  for (const name of packageDirs) {
    const manifest = readJson(path.join(root, 'packages', name, 'package.json'))
    const peers = dshPeers(manifest)
    if (peers.length === 0) continue // the suite mounts components and declares no DSH peers
    for (const [peer, range] of peers) {
      assert.equal(range, policy.supportedPeerRange, `${name} pins ${peer} to ${range}`)
    }
  }
})

test('every plugin still declares the exact release-qualified runtime in engines', () => {
  for (const name of packageDirs) {
    const manifest = readJson(path.join(root, 'packages', name, 'package.json'))
    assert.equal(manifest.engines?.dsh, policy.baseline.version, `${name} must keep engines.dsh at the qualified runtime`)
  }
})

test('every declared baseline is covered by the supported peer range', () => {
  for (const baseline of [policy.baseline, ...(policy.additionalBaselines ?? [])]) {
    const [major, minor] = baseline.version.split('.')
    assert.ok(
      policy.supportedPeerRange.includes(`^${major}.${minor}.`),
      `${baseline.version} (${baseline.npmTag ?? 'next'}) is not covered by ${policy.supportedPeerRange}`,
    )
  }
})

test('every additional baseline records how it was verified', () => {
  for (const baseline of policy.additionalBaselines ?? []) {
    assert.equal(typeof baseline.status, 'string', `${baseline.version} needs a status`)
    assert.equal(typeof baseline.scope, 'string', `${baseline.version} needs an explicit evidence scope`)
    assert.notEqual(baseline.status, policy.baseline.status, 'an additional baseline cannot claim the qualified status')
  }
})

test('the supported peer range is no narrower than the qualified baseline', () => {
  const [baseMajor, baseMinor] = policy.baseline.version.split('.').map(Number)
  const versions = [...policy.supportedPeerRange.matchAll(/(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?/g)]
  assert.ok(versions.length >= 1, 'expected at least one concrete version in the peer range')
  for (const [, major, minor] of versions) {
    assert.equal(Number(major), baseMajor, 'peer range must stay inside the qualified major')
    assert.ok(Number(minor) <= baseMinor, 'peer range must admit the qualified baseline')
  }
})
