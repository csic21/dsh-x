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
    // Delegate is omitted until its package directory is committed: the index
    // refuses a Git install target for a dirty or untracked package.
    assert.deepEqual(names.filter(name => name !== 'dsh-x-delegate'), ['dsh-x-browser', 'dsh-x-code', 'dsh-x-stock'])
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
