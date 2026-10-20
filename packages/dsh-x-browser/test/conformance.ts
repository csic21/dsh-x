import test from 'node:test'
import assert from 'node:assert/strict'
import type { BrowserBackend, BrowserScope } from '../src/backends/types.ts'
import type { Action } from '../src/contract/commands.ts'

const scope: BrowserScope = { profile: 'profile-a', sessionId: 'session-a', workspace: '/work/a' }
const other: BrowserScope = { ...scope, sessionId: 'session-b' }

/** Shared backend contract: every new backend only has to pass this suite. */
export function conformance(name: string, create: () => BrowserBackend) {
  test(`${name} · open, observe, execute and close one target`, async t => {
    const backend = create()
    t.after(() => backend.dispose())
    await backend.ensure(scope)
    const target = await backend.open(scope, 'example.test')
    assert.equal(target.url, 'https://example.test/')
    const observation = await backend.observe(scope, target.targetId)
    assert.equal(observation.targetId, target.targetId)
    assert.ok(Object.keys(observation.refs).length > 0)
    assert.equal(observation.truncated, false)
    const result = await backend.execute(scope, target.targetId, { action: 'click', target: Object.keys(observation.refs)[0] })
    assert.equal(result.targetId, target.targetId)
    assert.equal(result.untrustedPageContent, true)
    assert.ok(result.revision > observation.revision)
    assert.equal((await backend.list(scope)).length, 1)
    await backend.close(scope, target.targetId)
    assert.deepEqual(await backend.list(scope), [])
    await assert.rejects(backend.close(scope, target.targetId), { code: 'BROWSER_TARGET' })
  })

  test(`${name} · references must come from the latest observation`, async t => {
    const backend = create()
    t.after(() => backend.dispose())
    const target = await backend.open(scope, 'example.test')
    await assert.rejects(backend.execute(scope, target.targetId, { action: 'click', target: 'e9' }), { code: 'BROWSER_STALE' })
    await assert.rejects(backend.execute(scope, 'missing', { action: 'observe' }), { code: 'BROWSER_TARGET' })
  })

  test(`${name} · targets stay inside their session`, async t => {
    const backend = create()
    t.after(() => backend.dispose())
    const mine = await backend.open(scope, 'example.test')
    await backend.open(other, 'example.test')
    assert.equal((await backend.list(scope)).length, 1)
    assert.equal((await backend.list(other)).length, 1)
    const observation = await backend.observe(scope, mine.targetId)
    assert.equal(observation.targetId, mine.targetId)
  })

  test(`${name} · unsupported actions fail before touching the page`, async t => {
    const backend = create()
    t.after(() => backend.dispose())
    const action = (['select', 'read', 'screenshot'] as const).find(candidate => !backend.capabilities.has(candidate as Action))
    if (!action) return t.skip('backend implements every action')
    const target = await backend.open(scope, 'example.test')
    await assert.rejects(backend.execute(scope, target.targetId, { action }), { code: 'BROWSER_UNSUPPORTED' })
  })

  test(`${name} · dispose is idempotent and rejects later work`, async () => {
    const backend = create()
    await backend.dispose()
    await backend.dispose()
    await assert.rejects(backend.ensure(scope), { code: 'BROWSER_CLOSED' })
    await assert.rejects(backend.list(scope), { code: 'BROWSER_CLOSED' })
  })
}
