import test from 'node:test'
import assert from 'node:assert/strict'
import { createBrowserOwnership } from '../src/ownership.js'

test('native ownership is metadata-only and closes synchronously on its stable run signal', () => {
  const closed = [], ownership = createBrowserOwnership({ onClose: token => closed.push(token) }), parent = Symbol('live-parent'), abort = new AbortController()
  const close = ownership.bind(parent, { runtime: 'opencode', nativeRunId: 'native-a', signal: abort.signal })
  const owner = ownership.resolve(parent)
  assert.equal(owner.ownerToken, parent); assert.equal(owner.nativeRunId, 'native-a'); assert.equal(owner.runtime, 'opencode')
  assert.equal(ownership.execute, undefined); assert.equal(ownership.call, undefined)
  abort.abort()
  assert.deepEqual(closed, [parent]); assert.throws(() => ownership.resolve(parent), { code: 'BROWSER_OWNER' })
  assert.throws(() => owner.assertCurrent()); close(); ownership.dispose()
  assert.deepEqual(closed, [parent])
})

test('native ownership rejects unsupported runtimes, forged parent identities, duplicate and aborted lifetimes', () => {
  const ownership = createBrowserOwnership({ onClose() {} }), signal = new AbortController().signal, parent = Symbol('parent')
  assert.throws(() => ownership.bind('model-parent', { runtime: 'opencode', nativeRunId: 'a', signal }), { code: 'BROWSER_OWNER' })
  assert.throws(() => ownership.bind(Symbol.for('registered-parent'), { runtime: 'opencode', nativeRunId: 'a', signal }), { code: 'BROWSER_OWNER' })
  assert.throws(() => ownership.bind(parent, { runtime: 'codex', nativeRunId: 'a', signal }), { code: 'BROWSER_OWNER' })
  const close = ownership.bind(parent, { runtime: 'opencode', nativeRunId: 'a', signal })
  assert.throws(() => ownership.bind(parent, { runtime: 'opencode', nativeRunId: 'b', signal }), { code: 'BROWSER_OWNER' })
  assert.throws(() => ownership.bind(Symbol(), { runtime: 'opencode', nativeRunId: 'a', signal: AbortSignal.abort() }))
  close()
  assert.throws(() => ownership.bind(parent, { runtime: 'opencode', nativeRunId: 'b', signal }), { code: 'BROWSER_OWNER' })
  ownership.dispose()
  assert.throws(() => ownership.bind(parent, { runtime: 'opencode', nativeRunId: 'c', signal }), { code: 'BROWSER_OWNER' })
  const replacement = createBrowserOwnership({ onClose() {} })
  assert.equal(replacement.resolve(undefined), null)
  assert.throws(() => replacement.resolve(parent), { code: 'BROWSER_OWNER' }); replacement.dispose()
})
