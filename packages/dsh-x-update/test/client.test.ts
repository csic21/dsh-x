import test from 'node:test'
import assert from 'node:assert/strict'
import { en, zh } from '../src/client/locales.ts'
import { updateViewModel } from '../src/client/model.ts'
import type { LocalState, UpdatePlan, UpdateStatus } from '../src/types.ts'

const local: LocalState = {
  home: '/home',
  profile: 'desktop',
  runtimeVersion: '0.2.1-rc.2',
  plugins: [{ name: 'dsh-x-code', version: '0.1.1' }],
}

const base = {
  current: { pluginVersion: '0.1.1', runtimeVersion: '0.2.1-rc.2' },
  available: { pluginVersion: null, runtime: null },
}

function plan(overrides: Partial<UpdatePlan> = {}): UpdatePlan {
  return { kind: 'none', reason: 'up-to-date', plugin: null, targets: [], ...base, ...overrides }
}

function status(overrides: Partial<UpdateStatus> = {}): UpdateStatus {
  return {
    schema: 1, phase: 'idle', checkedAt: null, error: null, local, plan: plan(),
    config: { repository: 'csic21/dsh-x', autoCheck: true },
    ...overrides,
  }
}

test('Chinese and English dictionaries cover identical keys', () => {
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort())
  for (const value of [...Object.values(zh), ...Object.values(en)]) assert.equal(typeof value, 'string')
})

test('every update reason has localized copy', () => {
  for (const reason of [
    'up-to-date', 'plugin-newer', 'runtime-mismatch', 'no-matching-plugin-artifacts',
    'local-runtime-unknown', 'no-release', 'not-checked',
  ]) {
    assert.ok(zh[`reason.${reason}` as keyof typeof zh], reason)
    assert.ok(en[`reason.${reason}` as keyof typeof en], reason)
  }
})

test('view model reports a plugin update without download controls', () => {
  const view = updateViewModel(status({
    plan: plan({ kind: 'plugin', reason: 'plugin-newer', available: { ...base.available, pluginVersion: '0.1.2', runtime: '0.2.1-rc.2' } }),
  }))
  assert.equal(view.state, 'idle')
  assert.equal(view.statusKey, 'status.plugin')
  assert.equal(view.availablePluginVersion, '0.1.2')
  assert.equal(view.runtimeVersion, '0.2.1-rc.2')
  assert.equal(view.canCheck, true)
})

test('blocked reasons stay visible', () => {
  const view = updateViewModel(status({ plan: plan({ kind: 'blocked', reason: 'runtime-mismatch' }) }))
  assert.equal(view.state, 'blocked')
  assert.equal(view.tone, 'warning')
  assert.equal(view.reasonKey, 'reason.runtime-mismatch')
  assert.equal(view.canCheck, true)
})

test('checking and error states disable or enable the check action', () => {
  const checking = updateViewModel(status({ phase: 'checking' }))
  assert.equal(checking.state, 'checking')
  assert.equal(checking.canCheck, false)
  const error = updateViewModel(status({ phase: 'error', error: 'network' }))
  assert.equal(error.state, 'error')
  assert.equal(error.tone, 'danger')
  assert.equal(error.canCheck, true)
  const upToDate = updateViewModel(status())
  assert.equal(upToDate.statusKey, 'status.up-to-date')
  assert.equal(updateViewModel(null).statusKey, 'status.idle')
})
