import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { parseVersion, compareVersions, validateIntegrity, verifyIntegrity, validateDescriptor, releaseDescriptor, discover, checkExactEngines, outcomeFor, isolatedEnvironment, validateSuiteReport } from '../scripts/check-upstream-compatibility.mjs'

const bytes = Buffer.from('official package fixture, never executable')
const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
const baseline = '0.2.1-alpha.5'
const policy = { package: '@deepseek-ai/dsh', registry: 'https://registry.npmjs.org', repository: 'https://github.com/deepseek-ai/deepseek-harness', baseline: { version: baseline, integrity } }
function registry(...versions) {
  return { versions: Object.fromEntries(versions.map(version => [version, {
    name: '@deepseek-ai/dsh', version, repository: { url: 'git+https://github.com/deepseek-ai/deepseek-harness.git' },
    dist: { integrity, tarball: `https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-${version}.tgz` },
  }])), 'dist-tags': { latest: '99.0.0-rc.1' } }
}

test('accepts only exact SemVer; refuses aliases, ranges, URLs and shell input', () => {
  for (const valid of [baseline, '1.2.3', '1.2.3-rc.10', '1.2.3+build.5', '999999999999999999999.0.0']) assert.equal(parseVersion(valid).value, valid)
  for (const invalid of ['', 'latest', 'next', '^1.2.3', '~1.2.3', '*', 'v1.2.3', '1.2', '01.2.3', '1.2.3-alpha.01', ' 1.2.3', '1.2.3\n', 'https://evil.test/pkg.tgz', '1.2.3; whoami', '--help', null]) assert.throws(() => parseVersion(invalid))
})

test('orders prereleases numerically and stable releases above the same prerelease', () => {
  assert.equal(compareVersions('1.2.3-rc.10', '1.2.3-rc.2'), 1)
  assert.equal(compareVersions('1.2.3', '1.2.3-rc.10'), 1)
  assert.equal(compareVersions('1.2.3-alpha', '1.2.3-alpha.1'), -1)
  assert.equal(compareVersions('1.2.3-1', '1.2.3-alpha'), -1)
  assert.equal(compareVersions('1.2.3+one', '1.2.3+two'), 0)
})

test('newest stable is discovered independently of baseline and mutable latest tag', () => {
  const result = discover(registry(baseline, '0.2.1', '0.3.0', '99.0.0-rc.1'), policy)
  assert.equal(result.baseline.version, baseline)
  assert.equal(result.candidate.version, '0.3.0')
  assert.equal(result.candidateIsDistinct, true)
  assert.equal(result.candidateIsNewer, true)
  assert.equal(result.status, 'candidate-needs-qualification')
  assert.equal(result.automaticPromotion, false)
  assert.deepEqual(result.matrix.include, [{ role: 'baseline', version: baseline }, { role: 'candidate', version: '0.3.0' }])
})

test('prereleases require explicit opt-in; baseline control is never mistaken for a new candidate', () => {
  const metadata = registry(baseline, '0.2.1-alpha.6')
  const stable = discover(metadata, policy)
  assert.equal(stable.candidate, null)
  assert.equal(stable.status, 'no-stable-release')
  assert.equal(stable.matrix.include.length, 1)
  assert.throws(() => discover(metadata, policy, { requestedVersion: '0.2.1-alpha.6' }), /explicit/)
  assert.equal(discover(metadata, policy, { allowPrerelease: true }).candidate.version, '0.2.1-alpha.6')
  const same = discover(metadata, policy, { requestedVersion: baseline, allowPrerelease: true })
  assert.equal(same.candidateIsDistinct, false)
  assert.equal(same.status, 'baseline-is-newest-eligible')
  assert.equal(same.matrix.include.length, 1)
})

test('does not schedule an older stable release as the newest forward update', () => {
  const result = discover(registry(baseline, '0.1.0'), policy)
  assert.equal(result.candidateIsNewer, false)
  assert.equal(result.status, 'no-newer-eligible-release')
  assert.equal(result.matrix.include.length, 1)
})

test('requires exact published package identity, official repository, registry URL and SHA-512 pin', () => {
  assert.throws(() => releaseDescriptor(registry(baseline), '1.0.0'), /not published/)
  const mutated = registry(baseline)
  mutated.versions[baseline].repository.url = 'https://github.com/unrelated/project.git'
  assert.throws(() => releaseDescriptor(mutated, baseline), /repository/)
  const descriptor = releaseDescriptor(registry(baseline), baseline)
  for (const tarball of [
    'https://evil.test/dsh.tgz', 'http://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-0.2.1-alpha.5.tgz',
    `https://user:pass@registry.npmjs.org/@deepseek-ai/dsh/-/dsh-${baseline}.tgz`,
    `${descriptor.tarball}?secret=value`, `${descriptor.tarball}#fragment`,
    'https://registry.npmjs.org/another-package/-/another.tgz',
  ]) assert.throws(() => validateDescriptor({ ...descriptor, tarball }))
  assert.throws(() => validateDescriptor({ ...descriptor, name: 'dsh' }), /identity/)
  assert.equal(validateDescriptor(descriptor), descriptor)
})

test('checks actual downloaded bytes and refuses changed committed baseline integrity', () => {
  assert.equal(verifyIntegrity(bytes, integrity), true)
  assert.throws(() => verifyIntegrity(Buffer.from('changed'), integrity), /mismatch/)
  for (const bad of ['', 'sha1-abc', 'sha512-abc', `${integrity} ${integrity}`, `sha512-${'A'.repeat(86)}==`]) {
    // Some 64-byte canonical pins are valid even when they do not match bytes.
    if (bad === `sha512-${'A'.repeat(86)}==`) assert.throws(() => verifyIntegrity(bytes, bad), /mismatch/)
    else assert.throws(() => validateIntegrity(bad))
  }
  const other = `sha512-${createHash('sha512').update('different').digest('base64')}`
  assert.throws(() => discover(registry(baseline), { ...policy, baseline: { version: baseline, integrity: other } }), /changed/)
})

test('engine admission fails closed for ranges, missing values and distinct versions', () => {
  assert.equal(checkExactEngines([{ name: 'a', engines: { dsh: baseline } }], baseline).status, 'passed')
  for (const declared of ['*', `^${baseline}`, '>=0.2.0', '0.2.1-alpha.6', undefined]) {
    const result = checkExactEngines([{ name: 'a', engines: { dsh: declared } }], baseline)
    assert.equal(result.status, 'blocked')
    assert.equal(result.mismatches.length, 1)
  }
  assert.throws(() => checkExactEngines([], baseline), /No plugin/)
})

test('no fixture, declaration, missing harness or failed check is promoted to compatibility', () => {
  const passed = { role: 'baseline', admission: 'passed', runtime: 'passed', suite: 'passed' }
  assert.deepEqual(outcomeFor(passed), { status: 'baseline-checks-passed', exitCode: 0, promoted: false })
  assert.deepEqual(outcomeFor({ ...passed, role: 'candidate' }), { status: 'candidate-checks-passed-needs-review', exitCode: 2, promoted: false })
  for (const patch of [{ admission: 'blocked' }, { runtime: 'not-run' }, { suite: 'harness-missing' }, { suite: 'blocked-by-exact-engines' }]) {
    assert.equal(outcomeFor({ ...passed, ...patch }).exitCode, 2)
    assert.equal(outcomeFor({ ...passed, ...patch }).promoted, false)
  }
  for (const patch of [{ runtime: 'failed' }, { suite: 'failed' }, { error: 'installation failed' }]) assert.equal(outcomeFor({ ...passed, ...patch }).exitCode, 1)
})

test('subprocess environment is a credential-free allowlist with an ephemeral home', () => {
  process.env.UPSTREAM_TEST_SECRET = 'do not inherit'
  try {
    const env = isolatedEnvironment('/tmp/check-123')
    assert.equal(env.HOME, '/tmp/check-123/home')
    assert.equal(env.DSH_HOME, '/tmp/check-123/dsh-home')
    assert.equal(env.npm_config_ignore_scripts, 'true')
    assert.equal(env.npm_config_registry, 'https://registry.npmjs.org')
    for (const forbidden of ['UPSTREAM_TEST_SECRET', 'GITHUB_TOKEN', 'ACTIONS_RUNTIME_TOKEN', 'NODE_AUTH_TOKEN', 'NPM_TOKEN', 'NODE_OPTIONS', 'SSH_AUTH_SOCK', 'GITHUB_ENV']) assert.equal(env[forbidden], undefined)
  } finally { delete process.env.UPSTREAM_TEST_SECRET }
})

test('workflow confines candidate execution and does not enable automatic updates', async () => {
  const workflow = await readFile(new URL('../.github/workflows/upstream-compatibility.yml', import.meta.url), 'utf8')
  assert.match(workflow, /contents: read/)
  assert.equal([...workflow.matchAll(/persist-credentials: false/g)].length, 2)
  assert.match(workflow, /git archive --format=tar HEAD/)
  assert.match(workflow, /docker run --rm --init --read-only --cap-drop ALL/)
  assert.match(workflow, /--security-opt no-new-privileges/)
  assert.match(workflow, /--user 1000:1000/)
  assert.doesNotMatch(workflow, /pull_request_target|secrets\.|npm publish|git push|issues: write|contents: write|\/var\/run\/docker\.sock/)
})

test('committed policy pin and package-manager version are exact', async () => {
  const committed = JSON.parse(await readFile(new URL('../compatibility/policy.json', import.meta.url), 'utf8'))
  assert.equal(committed.baseline.version, baseline)
  assert.equal(committed.baseline.sourceCommit, undefined)
  assert.match(committed.baseline.inspectedSourceCommit, /^[0-9a-f]{40}$/)
  validateIntegrity(committed.baseline.integrity)
  parseVersion(committed.packageManager.version)
  assert.equal(committed.prereleases, 'explicit-opt-in')
  assert.equal(committed.admission, 'exact-engines-and-human-qualification')
})


test('requires explicit actual-suite evidence, never just a successful exit or fixture count', () => {
  const checks = [
    'packed suite installs and boots Code + Agents once',
    'official per-plugin disable and re-enable',
    'official suite disable and re-enable',
    'mixed standalone/suite has no duplicate activation; removing selection conflict restores control',
    'real CLI replacement with version-bumped suite fixture',
    'replacement preserves disabled suite selection',
    'Code activates independently without Agents',
    'official incompatible-version refusal preserves manifest',
    'suite removal retains independently selected Code',
    'standalone-before-suite order has no duplicate activation',
  ].map(name => ({ name, status: 'passed' }))
  const report = { status: 'passed', runtime: baseline, checks, evidence: 'actual installed tarballs and Web Host', notVerified: ['browser interaction'], fixtureVersions: true, artifacts: ['dsh-x-suite', 'dsh-x-code', 'dsh-x-agents'].map(name => ({ name, version: '0.1.0', integrity, fixture: false })) }
  assert.equal(validateSuiteReport(report, baseline).status, 'passed')
  for (const patch of [{ status: 'failed' }, { runtime: '0.2.1-alpha.6' }, { checks: [] }, { checks: checks.slice(1) }, { fixtureVersions: undefined }, { notVerified: undefined }, { artifacts: [] }]) {
    assert.throws(() => validateSuiteReport({ ...report, ...patch }, baseline))
  }
})

test('invalid published version keys are ignored even when prereleases are enabled', () => {
  const metadata = registry(baseline, '0.2.1-alpha.6')
  metadata.versions.latest = { name: '@deepseek-ai/dsh', version: 'latest' }
  assert.equal(discover(metadata, policy, { allowPrerelease: true }).candidate.version, '0.2.1-alpha.6')
})


test('registry gitHead is separate from the inspected source snapshot and may be absent', () => {
  const metadata = registry(baseline)
  assert.equal(releaseDescriptor(metadata, baseline).registryGitHead, null)
  metadata.versions[baseline].gitHead = 'a'.repeat(40)
  const descriptor = releaseDescriptor(metadata, baseline)
  assert.equal(descriptor.registryGitHead, 'a'.repeat(40))
  assert.equal(descriptor.sourceCommit, undefined)
  assert.equal(descriptor.inspectedSourceCommit, undefined)
  metadata.versions[baseline].gitHead = 'not-a-commit'
  assert.equal(releaseDescriptor(metadata, baseline).registryGitHead, null)
})
