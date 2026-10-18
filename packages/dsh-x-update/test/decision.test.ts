import test from 'node:test'
import assert from 'node:assert/strict'
import { decideUpdate } from '../src/decision.ts'
import type { DesktopRelease, LocalState, PluginRelease } from '../src/types.ts'

function local(overrides: Partial<LocalState> = {}): LocalState {
  return {
    desktop: true,
    home: '/tmp/home',
    profile: 'desktop',
    appVersion: '0.1.1',
    kernelVersion: '0.2.1-rc.2',
    target: 'macos-arm64',
    distributionPath: '/Applications/DSH-X.app/Contents/Resources/distribution.json',
    installRoot: '/Applications',
    appPath: '/Applications/DSH-X.app',
    plugins: [
      { name: 'dsh-x-code', version: '0.1.1' },
      { name: 'dsh-x-stock', version: '0.1.1' },
    ],
    ...overrides,
  }
}

function desktop(overrides: Partial<DesktopRelease> = {}): DesktopRelease {
  return {
    tag: 'desktop-v0.1.2',
    version: '0.1.2',
    target: 'macos-arm64',
    kernelVersion: '0.2.1-rc.3',
    kernelSha: 'a'.repeat(40),
    unsigned: true,
    autoUpdate: false,
    installer: { file: 'DSH-X-0.1.2-mac-arm64-preview.dmg', sha256: 'b'.repeat(64), url: 'https://github.com/csic21/dsh-x/releases/download/desktop-v0.1.2/x.dmg' },
    ...overrides,
  }
}

function plugin(overrides: Partial<PluginRelease> = {}): PluginRelease {
  const version = overrides.version ?? '0.1.2'
  return {
    tag: 'plugins-v0.1.2',
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
  const plan = decideUpdate({ local: local(), desktop: desktop({ version: '0.1.1', kernelVersion: '0.2.1-rc.2' }), plugin: plugin({ version: '0.1.1' }) })
  assert.equal(plan.kind, 'none')
  assert.equal(plan.reason, 'up-to-date')
})

test('a newer desktop release is an app update because it carries the kernel', () => {
  const plan = decideUpdate({ local: local(), desktop: desktop(), plugin: plugin() })
  assert.equal(plan.kind, 'app')
  assert.equal(plan.reason, 'app-newer')
  assert.equal(plan.available.kernelVersion, '0.2.1-rc.3')
})

test('a same-version installer with a newer kernel still requires an app update', () => {
  const plan = decideUpdate({ local: local(), desktop: desktop({ version: '0.1.1' }), plugin: null })
  assert.equal(plan.kind, 'app')
  assert.equal(plan.reason, 'kernel-changed')
})

test('a plugin release for the running kernel updates only plugins', () => {
  const plan = decideUpdate({ local: local(), desktop: null, plugin: plugin() })
  assert.equal(plan.kind, 'plugin')
  assert.equal(plan.reason, 'plugin-newer')
  assert.deepEqual(plan.targets.map(item => item.name), ['dsh-x-code', 'dsh-x-stock'])
})

test('a plugin release for another kernel routes to an app update', () => {
  const plan = decideUpdate({ local: local(), desktop: desktop(), plugin: plugin({ runtime: '0.2.1-rc.3' }) })
  assert.equal(plan.kind, 'app')
  assert.equal(plan.reason, 'plugin-requires-other-kernel')
})

test('a plugin release for another kernel blocks when no app carries that kernel', () => {
  const plan = decideUpdate({ local: local(), desktop: null, plugin: plugin({ runtime: '0.2.1-rc.3' }) })
  assert.equal(plan.kind, 'blocked')
  assert.equal(plan.reason, 'no-compatible-app-release')
})

test('newer app wins over a usable plugin update', () => {
  const plan = decideUpdate({ local: local(), desktop: desktop(), plugin: plugin() })
  assert.equal(plan.kind, 'app')
})

test('installed plugins newer than the release produce no update', () => {
  const plan = decideUpdate({ local: local({ plugins: [{ name: 'dsh-x-code', version: '0.2.0' }] }), desktop: null, plugin: plugin() })
  assert.equal(plan.kind, 'none')
})

test('only plugins older than the release are update targets', () => {
  const plan = decideUpdate({
    local: local({ plugins: [{ name: 'dsh-x-code', version: '0.2.0' }, { name: 'dsh-x-stock', version: '0.1.1' }] }),
    desktop: null,
    plugin: plugin(),
  })
  assert.equal(plan.kind, 'plugin')
  assert.deepEqual(plan.targets.map(item => item.name), ['dsh-x-stock'])
})

test('a release without installed plugin packages is blocked', () => {
  const plan = decideUpdate({ local: local({ plugins: [{ name: 'dsh-x-other', version: '0.1.1' }] }), desktop: null, plugin: plugin() })
  assert.equal(plan.kind, 'blocked')
  assert.equal(plan.reason, 'no-matching-plugin-artifacts')
})

test('Web profiles may install compatible plugin releases', () => {
  const plan = decideUpdate({
    local: local({ desktop: false, appVersion: null }),
    desktop: null,
    plugin: plugin(),
  })
  assert.equal(plan.kind, 'plugin')
})

test('unknown kernel and unsupported platforms block automatic updates', () => {
  assert.equal(decideUpdate({ local: local({ kernelVersion: null }), plugin: plugin() }).reason, 'local-runtime-unknown')
  assert.equal(decideUpdate({ local: local({ target: null }), plugin: plugin() }).reason, 'unsupported-platform')
})
