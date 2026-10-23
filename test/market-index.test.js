import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { marketInstallTarget, parseMarketIndex } from '@deepseek-ai/dsh-plugin-market-index'

const root = fileURLToPath(new URL('..', import.meta.url))

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
    const candidates = ['dsh-x-browser', 'dsh-x-code', 'dsh-x-finance']
    assert.deepEqual(
      names.filter(name => !['dsh-x-delegate', 'dsh-x-pet'].includes(name)),
      candidates.filter(name => clean(name) || tagged(name)),
    )
    for (const plugin of index.plugins) {
      assert.ok(plugin.versions.length > 0, plugin.name)
      assert.ok(plugin.icon?.startsWith('https://csic21.github.io/dsh-x/icons/'), plugin.name)
      assert.equal(plugin.repository?.url, 'https://github.com/csic21/dsh-x')
      assert.equal(plugin.repository?.directory, `packages/${plugin.name}`)
      for (const version of plugin.versions) {
        assert.equal(version.source.type, 'git')
        assert.match(version.source.commit, /^[0-9a-f]{40}$/)
        assert.equal(version.source.path, `packages/${plugin.name}`)
        assert.equal(version.engines.dsh, '0.2.1-rc.2')
        assert.ok(Number.isSafeInteger(version.publishTimestamp) && version.publishTimestamp > 0)
        const target = marketInstallTarget(plugin.name, version)
        assert.equal(target.spec, `git+https://github.com/csic21/dsh-x.git#${version.source.commit}&path:/packages/${plugin.name}`)
      }
    }
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
