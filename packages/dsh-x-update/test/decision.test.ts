import test from 'node:test'
import assert from 'node:assert/strict'
import { decideUpdate } from '../src/decision.ts'
import type { LocalState, PluginRelease } from '../src/types.ts'

function local(overrides: Partial<LocalState> = {}): LocalState {
  return {
    home: '/tmp/home',
    profile: 'desktop',
    runtimeVersion: '0.2.1-rc.2',
    plugins: [
      { name: 'dsh-x-code', version: '0.1.1' },
      { name: 'dsh-x-stock', version: '0.1.1' },
    ],
    ...overrides,
  }
}

function plugin(overrides: Partial<PluginRelease> = {}): PluginRelease {
  const version = overrides.version ?? '0.1.2'
  return {
    tag: `plugins-v${version}`,
    version,
    runtime: '0.2.1-rc.2',
    artifacts: [
      { name: 'dsh-x-code', version, file: `dsh-x-code-${version}.tgz`, sha256: 'c'.repeat(64), integrity: '', url: 'https://example.invalid/code.tgz' },
      { name: 'dsh-x-stock', version, file: `dsh-x-stock-${version}.tgz`, sha256: 'd'.repeat(64), integrity: '', url: 'https://example.invalid/stock.tgz' },
    ],
    ...overrides,
  }
}

test('reports up to date when nothing is newer', () => {
  const plan = decideUpdate({ local: local(), plugin: plugin({ version: '0.1.1' }) })
  assert.equal(plan.kind, 'none')
  assert.equal(plan.reason, 'up-to-date')
})

test('a compatible plugin release updates only plugins', () => {
  const plan = decideUpdate({ local: local(), plugin: plugin() })
  assert.equal(plan.kind, 'plugin')
  assert.equal(plan.reason, 'plugin-newer')
  assert.deepEqual(plan.targets.map(item => item.name), ['dsh-x-code', 'dsh-x-stock'])
  assert.equal(plan.available.runtime, '0.2.1-rc.2')
})

test('a plugin release for another runtime is blocked instead of installed', () => {
  const plan = decideUpdate({ local: local(), plugin: plugin({ runtime: '0.2.1-rc.3' }) })
  assert.equal(plan.kind, 'blocked')
  assert.equal(plan.reason, 'runtime-mismatch')
})

test('installed plugins newer than the release produce no update', () => {
  const plan = decideUpdate({ local: local({ plugins: [{ name: 'dsh-x-code', version: '0.2.0' }] }), plugin: plugin() })
  assert.equal(plan.kind, 'none')
})

test('only plugins older than the release are update targets', () => {
  const plan = decideUpdate({
    local: local({ plugins: [{ name: 'dsh-x-code', version: '0.2.0' }, { name: 'dsh-x-stock', version: '0.1.1' }] }),
    plugin: plugin(),
  })
  assert.equal(plan.kind, 'plugin')
  assert.deepEqual(plan.targets.map(item => item.name), ['dsh-x-stock'])
})

test('a release without installed plugin packages is blocked', () => {
  const plan = decideUpdate({ local: local({ plugins: [{ name: 'dsh-x-other', version: '0.1.1' }] }), plugin: plugin() })
  assert.equal(plan.kind, 'blocked')
  assert.equal(plan.reason, 'no-matching-plugin-artifacts')
})

test('a web profile can install a compatible plugin release', () => {
  const plan = decideUpdate({
    local: local({ profile: 'web', plugins: [{ name: 'dsh-x-code', version: '0.1.1' }] }),
    plugin: plugin(),
  })
  assert.equal(plan.kind, 'plugin')
})

test('unknown runtime and missing release block the check', () => {
  assert.equal(decideUpdate({ local: local({ runtimeVersion: null }), plugin: plugin() }).reason, 'local-runtime-unknown')
  assert.equal(decideUpdate({ local: local(), plugin: null }).reason, 'no-release')
})
