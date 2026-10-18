import test from 'node:test'
import assert from 'node:assert/strict'
import { compareVersions, isNewer, maxVersion, parseVersion } from '../src/semver.ts'

test('parses release and prerelease versions', () => {
  assert.deepEqual(parseVersion('1.2.3'), { major: 1, minor: 2, patch: 3, prerelease: [], raw: '1.2.3' })
  assert.deepEqual(parseVersion('v0.2.1-rc.2')?.prerelease, ['rc', 2])
  assert.equal(parseVersion('nope'), null)
})

test('orders stable versions and prereleases by SemVer precedence', () => {
  assert.equal(compareVersions('0.1.1', '0.1.2'), -1)
  assert.equal(compareVersions('0.1.2', '0.1.2'), 0)
  assert.equal(compareVersions('0.2.1-rc.2', '0.2.1-alpha.5'), 1)
  assert.equal(compareVersions('0.2.1-rc.2', '0.2.1'), -1)
  assert.equal(compareVersions('1.0.0-alpha', '1.0.0-alpha.1'), -1)
  assert.equal(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1)
  assert.equal(compareVersions('1.0.0-beta.2', '1.0.0-beta.11'), -1)
})

test('isNewer handles a missing current version', () => {
  assert.equal(isNewer('0.1.0', null), true)
  assert.equal(isNewer('0.1.0', '0.1.0'), false)
  assert.equal(isNewer('0.1.0', '0.2.0'), false)
})

test('maxVersion ignores invalid values', () => {
  assert.equal(maxVersion(['0.1.0', null, '0.1.2', 'nope']), '0.1.2')
  assert.equal(maxVersion([]), null)
})
