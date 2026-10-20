import test from 'node:test'
import assert from 'node:assert/strict'
import { createAtlasRoute, createPetPageRoute, createPetRoute } from '../src/routes.ts'
import { petFramePage } from '../src/frame.ts'

const envelope = (method: string, payload: unknown) => JSON.stringify({
  type: 'client-request', rpcId: 'rpc-1', method, payload,
})

const post = (route: any, body: string, contentType = 'application/json') => route.fetch(new Request('http://localhost/api/x', {
  method: 'POST', headers: { 'content-type': contentType }, body,
}))

test('the list route answers the connection envelope', async () => {
  const route = createPetRoute('dsh-x-pet/list', async () => ({ pets: [], active: 'off' }), [])
  const response = await post(route, envelope('dsh-x-pet/list', {}))
  assert.equal(response.status, 200)
  const body = await response.json() as any
  assert.equal(body.type, 'server-response')
  assert.equal(body.rpcId, 'rpc-1')
  assert.equal(body.result.ok, true)
  assert.deepEqual(body.result.value, { pets: [], active: 'off' })
})

test('a wrong method, content type or envelope is refused', async () => {
  const route = createPetRoute('dsh-x-pet/list', async () => ({ ok: true }), [])
  assert.equal((await post(route, envelope('dsh-x-pet/list', {}), 'text/plain')).status, 415)
  assert.equal((await post(route, 'not json')).status, 400)
  assert.equal((await post(route, JSON.stringify({ type: 'client-request', rpcId: 'r', method: 'other', payload: {} }))).status, 400)
  assert.equal((await post(route, envelope('dsh-x-pet/list', { unexpected: true }))).status, 400)
})

test('a failing handler answers with a failure instead of throwing', async () => {
  const route = createPetRoute('dsh-x-pet/select', async () => { throw new Error('PET_UNKNOWN') }, ['id'])
  const response = await post(route, envelope('dsh-x-pet/select', { id: 'x' }))
  const body = await response.json() as any
  assert.equal(body.result.ok, false)
  assert.equal(body.result.error.code, 'PET_UNKNOWN')
})

test('the atlas route returns image bytes, not JSON', async () => {
  const bytes = new Uint8Array([1, 2, 3, 4])
  const route = createAtlasRoute('dsh-x-pet/atlas', async () => ({ bytes, mime: 'image/webp' }))
  const response = await post(route, envelope('dsh-x-pet/atlas', { id: 'dewey' }))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'image/webp')
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes)
})

test('the atlas route refuses a request without a pet id', async () => {
  const route = createAtlasRoute('dsh-x-pet/atlas', async () => ({ bytes: new Uint8Array([1]), mime: 'image/webp' }))
  assert.equal((await post(route, envelope('dsh-x-pet/atlas', {}))).status, 400)
  assert.equal((await post(route, envelope('dsh-x-pet/atlas', { id: 42 }))).status, 400)
})

test('a missing sheet answers 404 rather than an empty image', async () => {
  const route = createAtlasRoute('dsh-x-pet/atlas', async () => { throw new Error('PET_UNKNOWN') })
  const response = await post(route, envelope('dsh-x-pet/atlas', { id: 'gone' }))
  assert.equal(response.status, 404)
})

test('the detached frame is a GET document, not an RPC envelope', async () => {
  const route = createPetPageRoute('dsh-x-pet/frame', petFramePage)
  assert.equal(route.methods.join(','), 'GET')
  const response = await route.fetch(new Request('http://localhost/api/dsh-x-pet/frame'))
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') ?? '', /text\/html/)
  const html = await response.text()
  assert.match(html, /dsh-x-pet\/state/)
  assert.match(html, /dsh-x-pet\/atlas/)
  assert.match(html, /<script>/)
})

test('the page carries no interpolated data, so nothing can break out of it', () => {
  const html = petFramePage()
  assert.equal(html, petFramePage())
  assert.doesNotMatch(html, /<\/script><script>/)
})
