import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  DEFAULT_APPEARANCE,
  createUiStore,
  normalizeAppearance,
  readPatch,
  resolveAppearance,
} from '../src/store.ts'

const profile = async (t: { after(fn: () => Promise<void>): void }) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dsh-x-ui-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}

test('an absent file is the first run, not a stored choice', async t => {
  const store = createUiStore(await profile(t))
  assert.equal(await store.read(), null)
})

test('a stored choice round-trips and lands under the profile directory', async t => {
  const directory = await profile(t)
  const store = createUiStore(directory)
  const written = await store.write({ level: 'dense', backdrop: false }, { ...DEFAULT_APPEARANCE })
  assert.deepEqual(written, { ...DEFAULT_APPEARANCE, level: 'dense', backdrop: false })
  assert.deepEqual(await store.read(), written)
  // The state stays inside the profile, never in the official session store.
  assert.equal(store.directory, path.join(directory, '.dsh-x-ui'))
  const raw = JSON.parse(await readFile(path.join(store.directory, 'appearance.json'), 'utf8'))
  assert.deepEqual(raw, written)
})

test('a partial write merges over the base instead of dropping fields', async t => {
  const store = createUiStore(await profile(t))
  await store.write({ enabled: false }, { ...DEFAULT_APPEARANCE })
  const after = await store.write({ level: 'clear' }, { ...DEFAULT_APPEARANCE, enabled: false })
  assert.equal(after.enabled, false)
  assert.equal(after.level, 'clear')
  assert.equal(after.backdrop, true)
})

test('a hand-edited or older file never leaves the UI half-styled', async t => {
  const directory = await profile(t)
  const store = createUiStore(directory)
  await mkdir(store.directory, { recursive: true })
  await writeFile(path.join(store.directory, 'appearance.json'), JSON.stringify({
    version: 99, enabled: 'yes', level: 'molten', backdrop: 1, refraction: false, extra: true,
  }))
  assert.deepEqual(await store.read(), { ...DEFAULT_APPEARANCE, refraction: false })
})

test('a corrupt or oversized file falls back to the shipped palette', async t => {
  const directory = await profile(t)
  const store = createUiStore(directory)
  await mkdir(store.directory, { recursive: true })
  await writeFile(path.join(store.directory, 'appearance.json'), '{ not json')
  assert.equal(await store.read(), null)
  await writeFile(path.join(store.directory, 'appearance.json'), 'x'.repeat(32 * 1024))
  assert.equal(await store.read(), null)
})

test('normalizeAppearance fills every field from one trusted record', () => {
  assert.deepEqual(normalizeAppearance({}), DEFAULT_APPEARANCE)
  assert.deepEqual(normalizeAppearance(null), DEFAULT_APPEARANCE)
  assert.deepEqual(normalizeAppearance([]), DEFAULT_APPEARANCE)
  assert.deepEqual(
    normalizeAppearance({ enabled: false, level: 'clear', backdrop: false, refraction: false }),
    { version: 1, enabled: false, level: 'clear', backdrop: false, refraction: false },
  )
})

test('readPatch accepts legal fields and refuses the rest', () => {
  assert.deepEqual(readPatch({ level: 'dense' }), { level: 'dense' })
  assert.deepEqual(readPatch({ enabled: true, backdrop: false }), { enabled: true, backdrop: false })
  assert.throws(() => readPatch({}), /UI_PATCH/)
  assert.throws(() => readPatch({ level: 'molten' }), /UI_LEVEL/)
  assert.throws(() => readPatch({ enabled: 'yes' }), /UI_PATCH/)
  assert.throws(() => readPatch(null), /UI_PATCH/)
  assert.throws(() => readPatch([]), /UI_PATCH/)
  assert.throws(() => readPatch(Object.create({ enabled: true })), /UI_PATCH/)
})

test('the Config seeds the first run and a stored choice wins afterwards', () => {
  const seeded = resolveAppearance(null, { level: 'dense', backdrop: false })
  assert.equal(seeded.level, 'dense')
  assert.equal(seeded.backdrop, false)
  assert.equal(seeded.enabled, true)
  // A stored choice must survive a later Config change, or an upgrade would
  // silently reverse what the user picked.
  const stored = resolveAppearance({ ...DEFAULT_APPEARANCE, level: 'clear' }, { level: 'dense' })
  assert.equal(stored.level, 'clear')
})
