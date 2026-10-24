import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluatePluginCompatibility } from '@deepseek-ai/dsh-app-boot'

const root = fileURLToPath(new URL('..', import.meta.url))
const readJson = file => JSON.parse(readFileSync(file, 'utf8'))
const policy = readJson(path.join(root, 'compatibility/policy.json'))
const packageDirs = readdirSync(path.join(root, 'packages'), { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
const manifests = new Map(packageDirs.map(name => [name, readJson(path.join(root, 'packages', name, 'package.json'))]))
const baselines = [policy.baseline, ...(policy.additionalBaselines ?? [])]

const dshPeers = manifest => Object.entries(manifest.peerDependencies ?? {})
  .filter(([name]) => /^@deepseek-ai\/dsh(-|$)/.test(name))

// Official admission (app-boot `unmetRequirements`) is: an own `engines.dsh`
// decides alone and peers are ignored; otherwise every DSH peer must match.
// Prereleases participate through semver's includePrerelease option.
const admitted = (manifest, runtime) => evaluatePluginCompatibility(manifest, {}, runtime) === undefined

test('the policy declares one shared supported runtime range instead of an exact pin', () => {
  assert.equal(typeof policy.supportedRuntimeRange, 'string')
  // A single `^0.2.0-rc.2` admits 0.2.1-rc.* under includePrerelease but not
  // under pnpm's default resolution, so the union keeps both readers aligned and
  // still resolves development installs to the qualified baseline.
  assert.match(policy.supportedRuntimeRange, /^\^0\.\d+\.\d+-/, 'expected a caret range over a prerelease baseline')
  assert.doesNotMatch(policy.supportedRuntimeRange, /^\d+\.\d+\.\d+$/, 'an exact version is not an admitted range')
})

test('every plugin declares the shared runtime range in engines.dsh', () => {
  assert.ok(packageDirs.length >= 3, 'expected every package directory')
  for (const [name, manifest] of manifests) {
    assert.equal(manifest.engines?.dsh, policy.supportedRuntimeRange, `${name} pins engines.dsh to ${manifest.engines?.dsh}`)
  }
})

test('every plugin declares the shared supported peer range on official DSH packages', () => {
  for (const [name, manifest] of manifests) {
    const peers = dshPeers(manifest)
    if (peers.length === 0) continue // the suite mounts components and declares no DSH peers
    for (const [peer, range] of peers) {
      assert.equal(range, policy.supportedRuntimeRange, `${name} pins ${peer} to ${range}`)
    }
  }
})

test('the official admission check admits every declared baseline and the qualified one', () => {
  for (const [name, manifest] of manifests) {
    for (const baseline of baselines) {
      assert.ok(admitted(manifest, baseline.version), `${name} must be admitted on ${baseline.version}`)
    }
  }
})

test('the official admission check admits a later patch of the qualified runtime', () => {
  const [major, minor, patch] = policy.baseline.version.split('-')[0].split('.').map(Number)
  for (const [name, manifest] of manifests) {
    // A newer patch of the same minor is what users hit next; it must load
    // without a plugin release. The next minor is a separate decision.
    assert.ok(admitted(manifest, `${major}.${minor}.${patch + 1}-rc.1`), `${name} must admit the next patch`)
  }
})

test('the official admission check still refuses the next minor', () => {
  const [major, minor] = policy.baseline.version.split('-')[0].split('.').map(Number)
  for (const [name, manifest] of manifests) {
    assert.equal(admitted(manifest, `${major}.${minor + 1}.0`), false, `${name} must not claim the next minor`)
  }
})

test('every additional baseline records how it was verified', () => {
  for (const baseline of policy.additionalBaselines ?? []) {
    assert.equal(typeof baseline.status, 'string', `${baseline.version} needs a status`)
    assert.equal(typeof baseline.scope, 'string', `${baseline.version} needs an explicit evidence scope`)
    assert.notEqual(baseline.status, policy.baseline.status, 'an additional baseline cannot claim the qualified status')
  }
})

test('the supported runtime range is no wider than the qualified major', () => {
  const [baseMajor, baseMinor] = policy.baseline.version.split('.').map(Number)
  const versions = [...policy.supportedRuntimeRange.matchAll(/(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?/g)]
  assert.ok(versions.length >= 1, 'expected at least one concrete version in the runtime range')
  for (const [, major, minor] of versions) {
    assert.equal(Number(major), baseMajor, 'runtime range must stay inside the qualified major')
    assert.ok(Number(minor) <= baseMinor, 'runtime range must admit the qualified baseline')
  }
})
