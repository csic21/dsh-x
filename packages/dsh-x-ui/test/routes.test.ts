import test from 'node:test'
import assert from 'node:assert/strict'
import { createUiRoute } from '../src/routes.ts'

const envelope = (endpoint: string, payload: unknown, rpcId = 'rpc-1') => JSON.stringify({
  type: 'client-request', method: endpoint, rpcId, payload,
})

const post = (endpoint: string, body: string, type = 'application/json') => new Request(`http://localhost/api/${endpoint}`, {
  method: 'POST',
  headers: { 'content-type': type },
  body,
})

test('a well-formed request reaches the handler and answers with its value', async () => {
  const seen: unknown[] = []
  const route = createUiRoute('dsh-x-ui/write', payload => { seen.push(payload); return { ok: true } }, ['enabled', 'level'])
  const response = await route.fetch(post('dsh-x-ui/write', envelope('dsh-x-ui/write', { level: 'dense' })))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    type: 'server-response', rpcId: 'rpc-1', result: { ok: true, value: { ok: true } },
  })
  assert.deepEqual(seen, [{ level: 'dense' }])
})

test('the route only mounts under /api and only for POST', () => {
  const route = createUiRoute('dsh-x-ui/read', () => null, [])
  assert.equal(route.path, '/api/dsh-x-ui/read')
  assert.deepEqual(route.methods, ['POST'])
  assert.equal(route.requestBody, 'buffered')
})

test('a wrong content type, an unknown field or a foreign envelope is refused', async () => {
  const route = createUiRoute('dsh-x-ui/write', () => { throw new Error('must not run') }, ['level'])
  assert.equal((await route.fetch(post('dsh-x-ui/write', envelope('dsh-x-ui/write', { level: 'dense' }), 'text/plain'))).status, 415)
  assert.equal((await route.fetch(post('dsh-x-ui/write', envelope('dsh-x-ui/write', { evil: 1 })))).status, 400)
  assert.equal((await route.fetch(post('dsh-x-ui/write', envelope('other/endpoint', { level: 'dense' })))).status, 400)
  assert.equal((await route.fetch(post('dsh-x-ui/write', '{ not json'))).status, 400)
  assert.equal((await route.fetch(post('dsh-x-ui/write', envelope('dsh-x-ui/write', [1, 2])))).status, 400)
  assert.equal((await route.fetch(post('dsh-x-ui/write', envelope('dsh-x-ui/write', { level: 'dense' }, 'x'.repeat(200))))).status, 400)
})

test('a handler failure is reported as a value, not as a broken connection', async () => {
  const route = createUiRoute('dsh-x-ui/write', () => { throw new Error('UI_LEVEL') }, ['level'])
  const response = await route.fetch(post('dsh-x-ui/write', envelope('dsh-x-ui/write', { level: 'molten' })))
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.result.ok, false)
  assert.equal(body.result.error.code, 'UI_LEVEL')
})

test('an oversized body is refused before it is parsed', async () => {
  const route = createUiRoute('dsh-x-ui/write', () => null, ['level'])
  const response = await route.fetch(post('dsh-x-ui/write', envelope('dsh-x-ui/write', { level: 'x'.repeat(8 * 1024) })))
  assert.equal(response.status, 413)
})
