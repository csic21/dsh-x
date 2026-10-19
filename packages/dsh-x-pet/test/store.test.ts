import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { inspectAtlas } from '../src/atlas.ts'
import { DEFAULT_PET_ID, PET_OFF, createPetStore } from '../src/store.ts'

/** A minimal 1536x2288 PNG header; the atlas reader only looks at IHDR. */
function pngHeader(width: number, height: number): Uint8Array {
  const bytes = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0)
  bytes.writeUInt32BE(13, 8)
  bytes.write('IHDR', 12, 'ascii')
  bytes.writeUInt32BE(width, 16)
  bytes.writeUInt32BE(height, 20)
  bytes.writeUInt8(8, 24)
  bytes.writeUInt8(6, 25)
  return bytes
}

const withTemp = async (run: (directory: string) => Promise<void>) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dsh-x-pet-'))
  try { await run(directory) } finally { await rm(directory, { recursive: true, force: true }) }
}

test('the atlas reader accepts the two Codex sheet sizes and refuses the rest', () => {
  const v2 = inspectAtlas(pngHeader(1536, 2288))
  assert.equal(v2.rows, 11)
  assert.equal(v2.width, 1536)
  assert.equal(v2.mime, 'image/png')
  assert.equal(inspectAtlas(pngHeader(1536, 1872)).rows, 9)
  assert.throws(() => inspectAtlas(pngHeader(1024, 2288)), /PET_WIDTH/)
  assert.throws(() => inspectAtlas(pngHeader(1536, 2000)), /PET_HEIGHT/)
  assert.throws(() => inspectAtlas(Buffer.from('not an image')), /PET_FORMAT/)
})

test('the bundled pet ships as a valid Codex sheet', async () => {
  const directory = path.join(import.meta.dirname, '..', 'assets', 'default-pet')
  const bytes = await readFile(path.join(directory, 'spritesheet.webp'))
  const atlas = inspectAtlas(bytes)
  assert.equal(atlas.width, 1536)
  assert.equal(atlas.rows, 11)
})

test('local pets are read from the Codex pets folder and bad ones are skipped', async () => {
  await withTemp(async root => {
    const codexHome = path.join(root, 'codex')
    const pets = path.join(codexHome, 'pets')
    await mkdir(path.join(pets, 'dewey'), { recursive: true })
    await writeFile(path.join(pets, 'dewey', 'pet.json'), JSON.stringify({
      id: 'dewey', displayName: 'Dewey', description: 'A duck.', spritesheetPath: 'spritesheet.webp',
    }))
    await writeFile(path.join(pets, 'dewey', 'spritesheet.webp'), pngHeader(1536, 2288))
    // A manifest whose id does not match its folder is not loadable.
    await mkdir(path.join(pets, 'mismatch'), { recursive: true })
    await writeFile(path.join(pets, 'mismatch', 'pet.json'), JSON.stringify({ id: 'other' }))
    await writeFile(path.join(pets, 'mismatch', 'spritesheet.webp'), pngHeader(1536, 2288))
    // A sheet that is not a pet atlas is skipped instead of advertised.
    await mkdir(path.join(pets, 'broken'), { recursive: true })
    await writeFile(path.join(pets, 'broken', 'pet.json'), JSON.stringify({ id: 'broken' }))
    await writeFile(path.join(pets, 'broken', 'spritesheet.webp'), pngHeader(800, 600))
    // A manifest that tries to escape its folder is refused.
    await mkdir(path.join(pets, 'escape'), { recursive: true })
    await writeFile(path.join(pets, 'escape', 'pet.json'), JSON.stringify({ id: 'escape', spritesheetPath: '../../secret.webp' }))

    const store = createPetStore({
      profileDirectory: path.join(root, 'profile'),
      bundledDirectory: path.join(import.meta.dirname, '..', 'assets', 'default-pet'),
      codexHome,
    })
    const listed = await store.list()
    assert.deepEqual(listed.map(pet => pet.id), [DEFAULT_PET_ID, 'dewey'])
    assert.equal(listed[1].displayName, 'Dewey')
    assert.equal(listed[1].source, 'local')
    assert.equal(listed[1].rows, 11)

    const atlas = await store.atlas('dewey')
    assert.equal(atlas.entry.id, 'dewey')
    assert.equal(atlas.bytes.byteLength, 33)
    await assert.rejects(() => store.atlas('mismatch'), /PET_UNKNOWN/)
    await assert.rejects(() => store.atlas('escape'), /PET_UNKNOWN/)
  })
})

test('the selection is stored in the profile directory and can be turned off', async () => {
  await withTemp(async root => {
    const profileDirectory = path.join(root, 'profile')
    const store = createPetStore({
      profileDirectory,
      bundledDirectory: path.join(import.meta.dirname, '..', 'assets', 'default-pet'),
      codexHome: undefined,
    })
    const initial = await store.selection()
    assert.equal(initial.active, '')
    assert.equal(initial.chosen, null)
    assert.equal(initial.position, null)

    await store.select(PET_OFF)
    assert.equal((await store.selection()).active, PET_OFF)
    await assert.rejects(() => store.select('missing'), /PET_UNKNOWN/)

    await store.move({ x: -40, y: 12 })
    const moved = await store.selection()
    assert.deepEqual(moved.position, { x: -40, y: 12 })
    const onDisk = JSON.parse(await readFile(path.join(profileDirectory, '.dsh-x-pet', 'pet.json'), 'utf8'))
    assert.equal(onDisk.active, PET_OFF)
    assert.deepEqual(onDisk.position, { x: -40, y: 12 })
  })
})

test('a stored selection survives a restart and unknown pets never block the frame', async () => {
  await withTemp(async root => {
    const profileDirectory = path.join(root, 'profile')
    const options = {
      profileDirectory,
      bundledDirectory: path.join(import.meta.dirname, '..', 'assets', 'default-pet'),
      codexHome: undefined,
    }
    const first = createPetStore(options)
    await first.select(PET_OFF)
    const second = createPetStore(options)
    assert.equal((await second.selection()).active, PET_OFF)
  })
})
