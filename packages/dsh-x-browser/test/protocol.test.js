import test from 'node:test'
import assert from 'node:assert/strict'
import { parseAddress, validateCommand, boundedResult } from '../src/protocol.js'
import { createBrowserRoute } from '../src/routes.js'
test('only bounded finite commands and safe HTTP(S) destinations are admitted', () => {
  assert.equal(parseAddress('example.test'), 'https://example.test/')
  assert.equal(parseAddress('http://127.0.0.1:9999/', 'null'), 'http://127.0.0.1:9999/')
  assert.equal(parseAddress('http://127.0.0.1:9999/', 'dsh-app://app'), 'http://127.0.0.1:9999/')
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'https://u:p@example.test', 'http://127.0.0.1:1234/api']) assert.throws(() => parseAddress(url, 'http://localhost:1234'))
  for (const value of [{ action: 'evaluate', script: '1' }, { action: 'observe', js: '1' }, { action: 'click', target: 'body' }, { action: 'type', target: 'e1:s1:n1', text: 'sk-abcdefghijklmnopqrstuv' }, { action: 'press', key: 'Enter' }, { action: 'scroll', x: 1e9, y: 0 }]) assert.throws(() => validateCommand(value))
  assert.equal(validateCommand({ action: 'type', target: 'e1:s1:n1', text: 'Fixture text' }).text, 'Fixture text')
  assert.throws(() => boundedResult({ text: 'x'.repeat(100000) }))
})
test('route requires exact RPC envelope, JSON content, bounded fields and payload size', async () => {
  let called = 0
  const route = createBrowserRoute('poll', () => { called++; return {} }, ['tabId', 'capability'])
  const request = (payload, extras = {}) => new Request('http://localhost/api/browser/poll', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', method: 'browser/poll', rpcId: '1', payload, ...extras }) })
  assert.equal((await route.fetch(request({ tabId: 't', capability: 'x' }))).status, 200)
  assert.equal((await route.fetch(request({ tabId: 't', sessionId: 'steal' }))).status, 400)
  assert.equal((await route.fetch(request({}, { method: 'browser/ack' }))).status, 400)
  assert.equal((await route.fetch(request({ capability: 'x'.repeat(100000) }))).status, 413)
  assert.equal(called, 1)
})
