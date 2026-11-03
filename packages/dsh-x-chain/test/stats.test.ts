import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createStatsStore } from '../src/stats.ts'
import { createStatsRoute } from '../src/routes.ts'

const record = (sessionId: string, executed: number, saved: number, extra: Partial<{ stopped: 'guard' | 'error' | 'aborted', at: number, tools: string[] }> = {}) => ({
  sessionId,
  at: extra.at ?? 1_700_000_000_000,
  executed,
  saved,
  ...(extra.stopped === undefined ? {} : { stopped: extra.stopped }),
  tools: extra.tools ?? ['bash'],
})

test('chains fold into per-session counters and a durable snapshot', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'chain-stats-'))
  const store = createStatsStore({ profileDirectory: directory })
  store.record(record('s1', 3, 2, { at: 10 }))
  store.record(record('s1', 1, 0, { at: 20, stopped: 'guard' }))
  store.record(record('s2', 2, 1, { at: 15 }))
  const snapshot = store.snapshot()
  assert.deepEqual(snapshot.totals, { chains: 3, steps: 6, saved: 3, stopped: 1 })
  assert.deepEqual(snapshot.sessions.map(session => session.sessionId), ['s1', 's2'])
  await store.flush()

  const reloaded = createStatsStore({ profileDirectory: directory })
  await reloaded.flush()
  assert.deepEqual(reloaded.snapshot().totals, { chains: 3, steps: 6, saved: 3, stopped: 1 })
  rmSync(directory, { recursive: true, force: true })
})

test('an unreadable snapshot degrades to empty instead of throwing', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'chain-stats-'))
  mkdirSync(path.join(directory, '.dsh-x-chain'), { recursive: true })
  writeFileSync(path.join(directory, '.dsh-x-chain', 'stats.json'), '{not json', { encoding: 'utf8' })
  const store = createStatsStore({ profileDirectory: directory })
  await store.flush()
  assert.deepEqual(store.snapshot().totals, { chains: 0, steps: 0, saved: 0, stopped: 0 })
  rmSync(directory, { recursive: true, force: true })
})

test('the settings route accepts only the exact authenticated envelope', async () => {
  const store = createStatsStore()
  store.record(record('s1', 2, 1))
  const route = createStatsRoute('dsh-x-chain/stats', () => store.snapshot())
  const call = (body: unknown, contentType = 'application/json') => route.fetch(new Request('http://localhost/api/dsh-x-chain/stats', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: JSON.stringify(body),
  }))

  const ok = await call({ type: 'client-request', method: 'dsh-x-chain/stats', rpcId: 'r1', payload: {} })
  assert.equal(ok.status, 200)
  const payload = await ok.json() as { type: string, rpcId: string, result: { ok: boolean, value: { totals: { chains: number } } } }
  assert.equal(payload.type, 'server-response')
  assert.equal(payload.rpcId, 'r1')
  assert.equal(payload.result.value.totals.chains, 1)

  assert.equal((await call({ type: 'client-request', method: 'other', rpcId: 'r2', payload: {} })).status, 400)
  assert.equal((await call({ type: 'client-request', method: 'dsh-x-chain/stats', rpcId: 'r3', payload: { extra: 1 } })).status, 400)
  assert.equal((await call({ type: 'client-request', method: 'dsh-x-chain/stats', rpcId: 'r4', payload: {} }, 'text/plain')).status, 415)
})
