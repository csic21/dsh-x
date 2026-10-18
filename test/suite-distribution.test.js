import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { inspectSuiteTarget, validateSuite, root, components } from '../scripts/suite-support.mjs'

test('developer suite pins built Code and dormant Agents, with no optional product dependencies', () => {
  const { suite, runtime } = validateSuite()
  assert.equal(runtime, '0.2.1-alpha.5')
  // The suite is a pure configuration bundle: dev-time build/typecheck
  // scripts are fine, but nothing may run when a consumer installs it.
  for (const hook of ['install', 'preinstall', 'postinstall', 'prepare']) assert.equal(suite.scripts?.[hook], undefined)
  const patch = readFileSync(path.join(root, 'packages/dsh-x-suite/cordis.patch.yml'), 'utf8')
  for (const name of components) {
    assert.match(patch, new RegExp(`id: ${name}\\n\\s+name: ${name}`))
    assert.match(readFileSync(path.join(root, 'packages', name, 'cordis.patch.yml'), 'utf8'), new RegExp(`id: ${name}\\n\\s+name: ${name}`))
  }
  assert.doesNotMatch(patch, /disabled: false|approval|sandbox|credential|!!js/)
})

test('suite preflight is read-only and fails closed for unqualified runtime and malformed profiles', t => {
  const home = mkdtempSync(path.join(tmpdir(), 'dsh-suite-preflight-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  assert.equal(inspectSuiteTarget({ home, runtime: '0.2.1-alpha.6' }).reason, 'unqualified-runtime')
  assert.equal(inspectSuiteTarget({ home, runtime: '0.2.1-alpha.5' }).ready, true)
  assert.equal(inspectSuiteTarget({ home, profile: 'desktop', runtime: '0.2.1-alpha.5' }).reason, 'desktop-not-initialized')
  assert.equal(inspectSuiteTarget({ home, profile: 'DESKTOP', runtime: '0.2.1-alpha.5' }).reason, 'desktop-not-initialized')
  const dir = path.join(home, 'profiles/web'); mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'package.json')
  const content = JSON.stringify({ dependencies: { 'dsh-x-code': '0.1.0' }, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'dsh-x-code'] } } })
  writeFileSync(file, content)
  const result = inspectSuiteTarget({ home, runtime: '0.2.1-alpha.5' })
  assert.equal(result.ready, false); assert.deepEqual(result.conflicts, ['dsh-x-code'])
  assert.equal(readFileSync(file, 'utf8'), content)
  writeFileSync(file, '{"dsh":{"profile":{"bundles":"all"}}}')
  assert.throws(() => inspectSuiteTarget({ home, runtime: '0.2.1-alpha.5' }), /Malformed/)
  assert.throws(() => inspectSuiteTarget({ home, profile: '../desktop', runtime: '0.2.1-alpha.5' }), /Invalid/)
})
