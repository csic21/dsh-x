import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink, link, stat, rename } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { createQuantScanScheduler, createProfileQuantScheduleStore, parseQuantScheduleRecord, QUANT_SCHEDULE_FILE, QUANT_SCHEDULE_MAX_BYTES } from '../src/quant-scan-scheduler.ts'
import { loadProfileScope } from '../src/scope.ts'
import { STORE_DIRECTORY, PREVIOUS_STORE_DIRECTORY } from '../src/store-path.ts'
import { SCOPE, OTHER, START, fixture, settled, copy } from './quant-scan-scheduler-fixture.ts'

async function root(t: any) {
  const directory = await mkdtemp(path.join(tmpdir(), 'quant-store-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}
async function saved() {
  const f = fixture()
  await f.enable(); await f.scheduler.tick(); await settled(f.scheduler)
  return f.disk.record!
}
test('real official profile store is private, atomic and bounded; restart retains the projected report', async t => {
  const dir = await root(t), scope = await loadProfileScope(dir)
  const store = createProfileQuantScheduleStore(dir), f = fixture({ profileDirectory: dir, store, readScope: async () => scope })
  await f.scheduler.request({ action: 'enable', scope, consent: true })
  await f.scheduler.tick(); await settled(f.scheduler, scope)
  const target = path.join(dir, STORE_DIRECTORY, QUANT_SCHEDULE_FILE)
  assert.equal((await stat(target)).mode & 0o777, 0o600)
  assert.deepEqual((await readdir(path.dirname(target))).sort(), [QUANT_SCHEDULE_FILE, 'scope.json'].sort())
  assert.ok((await stat(target)).size < QUANT_SCHEDULE_MAX_BYTES)
  const text = await readFile(target, 'utf8')
  assert.deepEqual(await store.load(), JSON.parse(text))
  const scheduler = createQuantScanScheduler({ profileDirectory: dir, now: () => START + 60_000, sourceEnabled: async () => true, provider: async () => { throw new Error('must not request') } })
  assert.equal((await scheduler.tick()).latest?.status, 'complete')
  assert.equal(await readFile(target, 'utf8'), text)
  await scheduler.request({ action: 'disable', scope })
  const after = await store.load()
  assert.equal(after?.enabled, false)
  assert.deepEqual(after?.reports, JSON.parse(text).reports)
})

test('read/start never creates a scope or migrates the pre-rename directory', async t => {
  const dir = await root(t), old = path.join(dir, PREVIOUS_STORE_DIRECTORY)
  await mkdir(old); await writeFile(path.join(old, 'scope.json'), JSON.stringify({ version: 1, scope: SCOPE }))
  const f = createQuantScanScheduler({ profileDirectory: dir, sourceEnabled: async () => false, provider: async () => undefined })
  await f.tick()
  await assert.rejects(f.request({ action: 'get', scope: SCOPE }))
  await assert.rejects(f.request({ action: 'enable', scope: SCOPE, consent: true }))
  assert.deepEqual(await readdir(dir), [PREVIOUS_STORE_DIRECTORY])
  assert.deepEqual(await readdir(old), ['scope.json'])
})

test('malformed, unknown version/consent, oversized, private fields and duplicate dates are rejected without repair or network', async t => {
  const dir = await root(t), scope = await loadProfileScope(dir), record = { ...await saved(), scope }
  const target = path.join(dir, STORE_DIRECTORY, QUANT_SCHEDULE_FILE)
  const invalid = [
    '{', ' '.repeat(QUANT_SCHEDULE_MAX_BYTES + 1), JSON.stringify({ ...record, version: 2 }),
    JSON.stringify({ ...record, consent: false }), JSON.stringify({ ...record, lastAttemptDate: null }),
    JSON.stringify({ ...record, account: 'private' }), JSON.stringify({ ...record, reports: [record.reports[0], record.reports[0]] }),
    JSON.stringify({ ...record, reports: [...record.reports, ...Array(20).fill(record.reports[0])] }),
  ]
  const raw = copy(record)
  ;(raw.reports[0]!.result!.rows[0] as any).bars = [{ close: 123 }]
  invalid.push(JSON.stringify(raw))
  for (const content of invalid) {
    await writeFile(target, content)
    const f = fixture({ profileDirectory: dir, store: createProfileQuantScheduleStore(dir), readScope: async () => scope })
    assert.equal((await f.scheduler.tick()).blockedReason, 'storage-unavailable')
    await assert.rejects(f.scheduler.request({ action: 'enable', scope, consent: true }), { code: 'storage-unavailable' })
    assert.equal(f.calls.length, 0)
    assert.equal(await readFile(target, 'utf8'), content)
  }
})

test('foreign stored scope fails closed and exposes no reports to the replacement scope', async () => {
  const record = await saved()
  let writes = 0
  const f = fixture({ store: { load: async () => record, save: async () => { writes++ } }, readScope: async () => OTHER })
  const state = await f.scheduler.tick()
  assert.equal(state.blockedReason, 'scope-mismatch')
  assert.equal(state.enabled, false)
  assert.deepEqual(state.reports, [])
  await assert.rejects(f.scheduler.request({ action: 'get', scope: SCOPE }), { code: 'scope-mismatch' })
  await assert.rejects(f.scheduler.request({ action: 'enable', scope: OTHER, consent: true }), { code: 'scope-mismatch' })
  assert.equal(writes, 0)
  assert.equal(f.calls.length, 0)
})

test('symlinked profile, store, task, scope and hardlinks cannot redirect state across profiles', async t => {
  const dir = await root(t), a = path.join(dir, 'a'), b = path.join(dir, 'b')
  await mkdir(a); await mkdir(b)
  const scope = await loadProfileScope(b), record = { ...await saved(), scope }
  await createProfileQuantScheduleStore(b).save(record)
  const foreign = await readFile(path.join(b, STORE_DIRECTORY, QUANT_SCHEDULE_FILE), 'utf8')
  const profileLink = path.join(dir, 'profile-link')
  await symlink(b, profileLink)
  await assert.rejects(createProfileQuantScheduleStore(profileLink).load())
  await symlink(path.join(b, STORE_DIRECTORY), path.join(a, STORE_DIRECTORY))
  await assert.rejects(createProfileQuantScheduleStore(a).load())
  await rm(path.join(a, STORE_DIRECTORY)); await mkdir(path.join(a, STORE_DIRECTORY))
  for (const file of [QUANT_SCHEDULE_FILE, 'scope.json']) {
    const local = path.join(a, STORE_DIRECTORY, file), remote = path.join(b, STORE_DIRECTORY, file)
    await symlink(remote, local)
    if (file === QUANT_SCHEDULE_FILE) await assert.rejects(createProfileQuantScheduleStore(a).load())
    else {
      const f = createQuantScanScheduler({ profileDirectory: a, provider: async () => undefined, sourceEnabled: async () => false })
      await assert.rejects(f.request({ action: 'enable', scope, consent: true }))
    }
    await rm(local)
    await link(remote, local)
    if (file === QUANT_SCHEDULE_FILE) await assert.rejects(createProfileQuantScheduleStore(a).load())
    else {
      const f = createQuantScanScheduler({ profileDirectory: a, provider: async () => undefined, sourceEnabled: async () => false })
      await assert.rejects(f.request({ action: 'enable', scope, consent: true }))
    }
    await rm(local)
  }
  assert.equal(await readFile(path.join(b, STORE_DIRECTORY, QUANT_SCHEDULE_FILE), 'utf8'), foreign)
})

test('directory substitution after load and symlink substitution before save are rejected', async t => {
  const dir = await root(t), scope = await loadProfileScope(dir), record = { ...await saved(), scope }
  const store = createProfileQuantScheduleStore(dir)
  assert.equal(await store.load(), null)
  await rename(path.join(dir, STORE_DIRECTORY), path.join(dir, 'original'))
  await mkdir(path.join(dir, STORE_DIRECTORY))
  await writeFile(path.join(dir, STORE_DIRECTORY, 'scope.json'), JSON.stringify({ version: 1, scope }))
  await assert.rejects(store.save(record))
  const second = createProfileQuantScheduleStore(dir)
  const destination = path.join(dir, 'foreign.json')
  await writeFile(destination, 'untouched')
  await symlink(destination, path.join(dir, STORE_DIRECTORY, QUANT_SCHEDULE_FILE))
  await assert.rejects(second.save(record))
  assert.equal(await readFile(destination, 'utf8'), 'untouched')
})

test('disk schema rejects false complete claims and non-finite or unbounded candidate metadata', async () => {
  const record = await saved()
  for (const mutate of [
    (v: any) => { v.reports[0].result.counts.covered = 999 },
    (v: any) => { v.reports[0].result.rows[0].name = 'x'.repeat(65) },
    (v: any) => { v.reports[0].result.rows[0].factors.close = Infinity },
    (v: any) => { v.reports[0].partial = true },
    (v: any) => { v.reports[0].error = 'interrupted' },
    (v: any) => { v.reports[0].result.canContinue = true },
  ]) { const next = copy(record); mutate(next); assert.throws(() => parseQuantScheduleRecord(next)) }
})
