import test from 'node:test'
import assert from 'node:assert/strict'
import { createPetController } from '../src/client/controller.ts'

/** A fetch that answers every atlas request with a fresh blob. */
function fakeFetch() {
  return async () => ({ ok: true, blob: async () => ({ kind: 'blob' }) }) as any
}

function withObjectUrls(run: (state: { created: string[], revoked: string[] }) => Promise<void>) {
  const state = { created: [] as string[], revoked: [] as string[] }
  const originalCreate = (URL as any).createObjectURL
  const originalRevoke = (URL as any).revokeObjectURL
  let next = 0
  ;(URL as any).createObjectURL = () => { const url = `blob:pet-${next++}`; state.created.push(url); return url }
  ;(URL as any).revokeObjectURL = (url: string) => { state.revoked.push(url) }
  return run(state).finally(() => {
    ;(URL as any).createObjectURL = originalCreate
    ;(URL as any).revokeObjectURL = originalRevoke
  })
}

const rpc = { call: async () => ({ ok: true, value: {} }) } as any

test('one atlas is fetched once and reused', async () => {
  await withObjectUrls(async state => {
    const controller = createPetController(rpc, fakeFetch())
    const first = await controller.atlasUrl('a')
    const again = await controller.atlasUrl('a')
    assert.equal(first, again)
    assert.equal(state.created.length, 1)
    controller.dispose()
    assert.deepEqual(state.revoked, [first])
  })
})

test('the atlas cache stays small instead of growing with every pet', async () => {
  await withObjectUrls(async state => {
    const controller = createPetController(rpc, fakeFetch())
    await controller.atlasUrl('a')
    await controller.atlasUrl('b')
    await controller.atlasUrl('c')
    await controller.atlasUrl('d')
    // Three sheets at most: the first one was released to make room.
    assert.equal(state.created.length, 4)
    assert.deepEqual(state.revoked, ['blob:pet-0'])
    controller.dispose()
  })
})

test('closing the picker releases every sheet except the active pet', async () => {
  await withObjectUrls(async state => {
    const controller = createPetController(rpc, fakeFetch())
    const active = await controller.atlasUrl('active')
    const other = await controller.atlasUrl('other')
    controller.release(['active'])
    assert.deepEqual(state.revoked, [other])
    // The active sheet is still there, so the sprite does not flash.
    assert.equal(await controller.atlasUrl('active'), active)
    controller.release([])
    assert.ok(state.revoked.includes(active))
    controller.dispose()
  })
})
