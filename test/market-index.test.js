import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { marketInstallTarget, parseMarketIndex } from '@deepseek-ai/dsh-plugin-market-index'
import { evaluatePluginCompatibility } from '@deepseek-ai/dsh-app-boot'

const root = fileURLToPath(new URL('..', import.meta.url))
const policy = JSON.parse(readFileSync(path.join(root, 'compatibility/policy.json'), 'utf8'))
// What Discover computes for one market entry: the official evaluator reads
// `engines.dsh` alone, exactly like installation and profile boot do.
const admitted = (name, version, runtime) => evaluatePluginCompatibility(
  { name, version: version.version, engines: { dsh: version.engines.dsh } }, {}, runtime,
) === undefined

test('generated market index parses as format 1 with commit-pinned Git install targets', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'dsh-x-market-'))
  try {
    const output = path.join(directory, 'market-index.json')
    execFileSync(process.execPath, ['scripts/generate-market-index.mjs', '--output', output], { cwd: root, stdio: 'pipe' })
    const index = parseMarketIndex(JSON.parse(readFileSync(output, 'utf8')), 'https://csic21.github.io/dsh-x/market-index.json')
    assert.equal(index.format, 1)
    const names = index.plugins.map(plugin => plugin.name).sort()
    // A package that is not committed yet has no Git install target, so the
    // index leaves it out: every listed package must be a tracked directory.
    const tracked = execFileSync('git', ['ls-files', 'packages'], { cwd: root, encoding: 'utf8' })
      .split('\n').map(line => line.split('/')[1]).filter(Boolean)
    for (const name of names) assert.ok(tracked.includes(name), `${name} must be committed`)
    // The generator lists a package when a plugins-v* tag contains it, or when
    // its working tree is clean and committed. A dirty package with no tag is
    // legitimately absent (its install target would not contain the version),
    // so the expectation mirrors those two rules.
    const clean = (name) => !execFileSync('git', ['status', '--porcelain', '--', `packages/${name}`], { cwd: root, encoding: 'utf8' }).trim()
    const tagCommits = execFileSync('git', ['for-each-ref', '--format=%(objectname)', 'refs/tags/plugins-v*'], { cwd: root, encoding: 'utf8' })
      .split('\n').filter(Boolean)
    const tagged = (name) => tagCommits.some(commit => {
      try {
        execFileSync('git', ['show', `${commit}:packages/${name}/package.json`], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
        return true
      } catch { return false }
    })
    const candidates = ['dsh-x-browser', 'dsh-x-code', 'dsh-x-finance', 'dsh-x-ui']
    assert.deepEqual(
      names.filter(name => !['dsh-x-delegate', 'dsh-x-pet'].includes(name)),
      candidates.filter(name => clean(name) || tagged(name)),
    )
    for (const plugin of index.plugins) {
      assert.ok(plugin.versions.length > 0, plugin.name)
      assert.ok(plugin.icon?.startsWith('https://csic21.github.io/dsh-x/icons/'), plugin.name)
      assert.equal(plugin.repository?.url, 'https://github.com/csic21/dsh-x')
      assert.equal(plugin.repository?.directory, `packages/${plugin.name}`)
      // The newest entry is what Discover offers, so it must carry the shared
      // range: an exact pin there hides the plugin from every other runtime the
      // range admits. Historical entries keep whatever their own manifest
      // declared, which is why older exact pins stay listed and refused.
      // A package with uncommitted changes has no entry for its new version yet
      // (the generator skips it), so this holds for clean packages only.
      if (clean(plugin.name)) {
        assert.equal(plugin.versions[0].engines.dsh, policy.supportedRuntimeRange, `${plugin.name} ${plugin.versions[0].version}`)
        for (const runtime of [policy.baseline.version, ...(policy.additionalBaselines ?? []).map(baseline => baseline.version)]) {
          assert.ok(admitted(plugin.name, plugin.versions[0], runtime), `${plugin.name} ${plugin.versions[0].version} must install on ${runtime}`)
        }
      }
      for (const version of plugin.versions) {
        assert.equal(version.source.type, 'git')
        assert.match(version.source.commit, /^[0-9a-f]{40}$/)
        assert.equal(version.source.path, `packages/${plugin.name}`)
        assert.ok(Number.isSafeInteger(version.publishTimestamp) && version.publishTimestamp > 0)
        const target = marketInstallTarget(plugin.name, version)
        assert.equal(target.spec, `git+https://github.com/csic21/dsh-x.git#${version.source.commit}&path:/packages/${plugin.name}`)
      }
    }
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
