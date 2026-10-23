import test from 'node:test'
import assert from 'node:assert/strict'
import { assessRelease, compareSemver, pinVersions } from '../scripts/plugin-versions.mjs'

const commit = id => id.padEnd(40, 'a')

test('a repeated package version stays pinned to the earlier release', () => {
  const pinned = pinVersions([
    { timestamp: 1, packages: [
      { name: 'dsh-x-code', version: '0.6.0', commit: commit('1'), tree: 'tree-code-1' },
      { name: 'dsh-x-finance', version: '0.6.0', commit: commit('1'), tree: 'tree-stock-1' },
    ] },
    { timestamp: 2, packages: [
      { name: 'dsh-x-code', version: '0.6.1', commit: commit('2'), tree: 'tree-code-2' },
      { name: 'dsh-x-finance', version: '0.6.0', commit: commit('2'), tree: 'tree-stock-1' },
    ] },
  ])
  assert.equal(pinned.get('dsh-x-finance').get('0.6.0').commit, commit('1'))
  assert.equal(pinned.get('dsh-x-code').get('0.6.1').commit, commit('2'))
  assert.equal(pinned.get('dsh-x-code').size, 2)
})

test('an unchanged plugin passes and a changed plugin must bump', () => {
  const pinned = pinVersions([{ timestamp: 1, packages: [
    { name: 'dsh-x-code', version: '0.6.0', commit: commit('1'), tree: 'old-code' },
    { name: 'dsh-x-finance', version: '0.6.0', commit: commit('1'), tree: 'same-stock' },
    { name: 'dsh-x-browser', version: '0.6.0', commit: commit('1'), tree: 'old-browser' },
    { name: 'dsh-x-delegate', version: '0.6.0', commit: commit('1'), tree: 'same-delegate' },
  ] }])
  const errors = assessRelease([
    { name: 'dsh-x-code', version: '0.6.1', tree: 'new-code', dirty: false },
    { name: 'dsh-x-finance', version: '0.6.0', tree: 'same-stock', dirty: false },
    { name: 'dsh-x-browser', version: '0.6.0', tree: 'changed-browser', dirty: false },
    { name: 'dsh-x-delegate', version: '0.6.0', tree: 'same-delegate', dirty: false },
  ], pinned)
  assert.deepEqual(errors, [
    `dsh-x-browser 相对已发布的 0.6.0（${commit('1').slice(0, 7)}）有改动，但版本号没变`,
  ])
})

test('a version bump without a file change is rejected', () => {
  const pinned = pinVersions([{ timestamp: 1, packages: [
    { name: 'dsh-x-code', version: '0.6.0', commit: commit('1'), tree: 'same' },
  ] }])
  const errors = assessRelease([
    { name: 'dsh-x-code', version: '0.6.1', tree: 'same', dirty: false },
  ], pinned)
  assert.deepEqual(errors, ['dsh-x-code 升到 0.6.1，但相对 0.6.0 没有文件变化'])
})

test('a lower version than the published one is rejected', () => {
  assert.equal(compareSemver('0.6.1', '0.6.0'), 1)
  assert.equal(compareSemver('0.6.0', '0.6.0-rc.1'), 1)
  const pinned = pinVersions([{ timestamp: 1, packages: [
    { name: 'dsh-x-code', version: '0.6.0', commit: commit('1'), tree: 'old' },
  ] }])
  const errors = assessRelease([
    { name: 'dsh-x-code', version: '0.5.9', tree: 'other', dirty: false },
  ], pinned)
  assert.deepEqual(errors, ['dsh-x-code 的 0.5.9 没有高于已发布的 0.6.0'])
})
