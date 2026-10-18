import test from 'node:test'
import assert from 'node:assert/strict'
import { en, zh } from '../src/client/locales.ts'
import { updateViewModel } from '../src/client/model.ts'
import type { LocalState, UpdatePlan, UpdateStatus } from '../src/types.ts'

const local: LocalState = {
  desktop: true, home: '/home', profile: 'desktop', appVersion: '0.1.1', kernelVersion: '0.2.1-rc.2',
  target: 'macos-arm64', distributionPath: '/Applications/DSH-X.app/Contents/Resources/distribution.json',
  installRoot: '/Applications', appPath: '/Applications/DSH-X.app',
  plugins: [{ name: 'dsh-x-code', version: '0.1.1' }],
}

const base = {
  current: { appVersion: '0.1.1', kernelVersion: '0.2.1-rc.2', pluginVersion: '0.1.1' },
  available: { appVersion: null, kernelVersion: null, pluginVersion: null, runtime: null },
}

function plan(overrides: Partial<UpdatePlan> = {}): UpdatePlan {
  return { kind: 'none', reason: 'up-to-date', desktop: null, plugin: null, targets: [], ...base, ...overrides }
}

function status(overrides: Partial<UpdateStatus> = {}): UpdateStatus {
  return {
    schema: 1, phase: 'idle', checkedAt: null, error: null, local, plan: plan(), pending: null,
    progress: null, config: { repository: 'csic21/dsh-x', autoCheck: true, autoDownload: true, autoInstallApp: true },
    ...overrides,
  }
}

test('Chinese and English dictionaries cover identical keys', () => {
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort())
  for (const value of [...Object.values(zh), ...Object.values(en)]) assert.equal(typeof value, 'string')
})

test('every update reason has localized copy', () => {
  for (const reason of [
    'up-to-date', 'plugin-newer', 'app-newer', 'kernel-changed', 'plugin-requires-other-kernel',
    'no-compatible-app-release', 'no-matching-plugin-artifacts', 'local-runtime-unknown',
    'not-desktop', 'unsupported-platform', 'no-release', 'not-checked',
  ]) {
    assert.ok(zh[`reason.${reason}` as keyof typeof zh], reason)
    assert.ok(en[`reason.${reason}` as keyof typeof en], reason)
  }
})

test('view model distinguishes plugin and app updates and pending installs', () => {
  const plugin = updateViewModel(status({ plan: plan({ kind: 'plugin', reason: 'plugin-newer', available: { ...base.available, pluginVersion: '0.1.2' } }) }))
  assert.equal(plugin.state, 'idle')
  assert.equal(plugin.statusKey, 'status.plugin')
  assert.equal(plugin.canDownload, true)
  assert.equal(plugin.availablePluginVersion, '0.1.2')

  const app = updateViewModel(status({ plan: plan({ kind: 'app', reason: 'plugin-requires-other-kernel', available: { ...base.available, appVersion: '0.1.2', kernelVersion: '0.2.1-rc.3' } }) }))
  assert.equal(app.tone, 'warning')
  assert.equal(app.statusKey, 'status.app')
  assert.equal(app.canDownload, true)

  const ready = updateViewModel(status({ phase: 'ready', pending: { kind: 'app', tag: 'desktop-v0.1.2', version: '0.1.2', createdAt: '2026-10-18T00:00:00.000Z' } }))
  assert.equal(ready.state, 'ready')
  assert.equal(ready.pendingKey, 'pending.app')
  assert.equal(ready.canCheck, false)

  const downloading = updateViewModel(status({ phase: 'downloading', progress: { file: 'a.tgz', received: 5, total: 10 } }))
  assert.equal(downloading.state, 'downloading')
  assert.equal(downloading.canCheck, false)

  const error = updateViewModel(status({ phase: 'error', error: 'network' }))
  assert.equal(error.state, 'error')
  assert.equal(error.tone, 'danger')
  assert.equal(error.canCheck, true)
})

test('blocked reasons stay visible and cannot download', () => {
  const view = updateViewModel(status({ plan: plan({ kind: 'blocked', reason: 'no-compatible-app-release' }) }))
  assert.equal(view.state, 'blocked')
  assert.equal(view.canDownload, false)
  assert.equal(view.reasonKey, 'reason.no-compatible-app-release')
})
